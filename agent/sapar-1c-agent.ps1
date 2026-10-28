<#
.SYNOPSIS
  Агент синхронизации Sapar Trade: читает данные из 1С (только чтение, через COM) и отправляет на сервер.

.DESCRIPTION
  Запускается Планировщиком заданий Windows каждые 5 минут на сервере 1С (srv1c).
  Каждый запуск — один цикл: для каждого типа данных, у которого подошло время, выполняется запрос из папки queries\,
  результат отправляется на сервер (POST /api/sync/1c/<тип>, заголовок X-Agent-Key, сжатие gzip).
  Ошибка одного запроса не мешает остальным. Журнал — в папке logs\ (хранится 14 дней).

.PARAMETER SetSecrets
  Сохранить пароль пользователя 1С и ключ агента (шифруются средствами Windows для текущего пользователя).
.PARAMETER Test
  Проверить связь с сервером и подключение к 1С, ничего не отправляя.
.PARAMETER Probe
  Диагностика для разработчика: структура объектов 1С и по 5 строк каждого запроса → файл probe-*.txt.
.PARAMETER Backfill
  Загрузить историю продаж и себестоимости за N дней (по месяцам). Пример: -Backfill 400
.PARAMETER Only
  Выполнить только указанные типы данных сейчас, без учёта расписания. Пример: -Only stock,prices

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\sapar-1c-agent.ps1 -SetSecrets
  powershell -ExecutionPolicy Bypass -File .\sapar-1c-agent.ps1 -Test
  powershell -ExecutionPolicy Bypass -File .\sapar-1c-agent.ps1 -Probe
  powershell -ExecutionPolicy Bypass -File .\sapar-1c-agent.ps1 -Backfill 400
  powershell -ExecutionPolicy Bypass -File .\sapar-1c-agent.ps1
#>
[CmdletBinding()]
param(
  [switch]$SetSecrets,
  [switch]$Test,
  [switch]$Probe,
  [int]$Backfill = 0,
  [string[]]$Only = @(),
  [string]$ConfigPath = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
# Папка скрипта (в Windows PowerShell 5.1 $PSScriptRoot пуст в блоке param, поэтому вычисляем здесь)
$Root = $PSScriptRoot
if (-not $Root) { $Root = Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $ConfigPath) { $ConfigPath = Join-Path $Root 'config.json' }
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Inv = [Globalization.CultureInfo]::InvariantCulture
$AgentVersion = '1.0.0'

# ---------- настройки ----------
if (-not (Test-Path $ConfigPath)) { throw "Нет файла настроек $ConfigPath. Скопируйте config.example.json в config.json и заполните." }
$Cfg = Get-Content $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
$LogDir = Join-Path $Root 'logs'
$StatePath = Join-Path $Root 'state.json'
$SecretsPath = Join-Path $Root 'secrets.dat'
$LockPath = Join-Path $Root 'agent.lock'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Write-Log([string]$Level, [string]$Msg) {
  $line = '{0} [{1}] {2}' -f (Get-Date).ToString('yyyy-MM-dd HH:mm:ss'), $Level, $Msg
  Add-Content -Path (Join-Path $LogDir ('agent-{0}.log' -f (Get-Date).ToString('yyyy-MM-dd'))) -Value $line -Encoding UTF8
  if ($Level -eq 'ERROR') { Write-Host $line -ForegroundColor Red } else { Write-Host $line }
}

# ---------- секреты (DPAPI: расшифровать может только тот же пользователь Windows на этом компьютере) ----------
function Save-Secrets {
  $p1 = Read-Host 'Пароль пользователя 1С (sapar_api)' -AsSecureString
  $p2 = Read-Host 'Ключ агента от разработчика (если ещё нет — просто Enter)' -AsSecureString
  $key = $null
  if ($p2.Length -gt 0) { $key = ConvertFrom-SecureString $p2 }
  @{ onecPassword = (ConvertFrom-SecureString $p1); agentKey = $key } |
    ConvertTo-Json | Set-Content -Path $SecretsPath -Encoding UTF8
  Write-Host "Сохранено в $SecretsPath (расшифровать может только пользователь $env:USERNAME на этом компьютере)." -ForegroundColor Green
}
function Get-Plain([string]$enc) {
  $ss = ConvertTo-SecureString $enc
  $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($ss)
  try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}
function Read-Secrets {
  if (-not (Test-Path $SecretsPath)) { throw 'Секреты не заданы. Запустите с ключом -SetSecrets под тем же пользователем, что и задание планировщика.' }
  $s = Get-Content $SecretsPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $key = $null
  if ($s.agentKey) { $key = Get-Plain $s.agentKey }
  return @{ OnecPassword = (Get-Plain $s.onecPassword); AgentKey = $key }
}

# ---------- JSON (свой быстрый сериализатор: числа всегда с точкой, даты ГГГГ-ММ-ДД) ----------
$NeedsEscape = New-Object Text.RegularExpressions.Regex '[\x00-\x1f"\\]', 'Compiled'
function ConvertTo-JsonString([string]$s) {
  if (-not $NeedsEscape.IsMatch($s)) { return '"' + $s + '"' }   # быстрый путь — почти все строки
  $sb = New-Object Text.StringBuilder ($s.Length + 2)
  [void]$sb.Append('"')
  foreach ($ch in $s.ToCharArray()) {
    switch ($ch) {
      '"' { [void]$sb.Append('\"') }
      '\' { [void]$sb.Append('\\') }
      "`n" { [void]$sb.Append('\n') }
      "`r" { [void]$sb.Append('\r') }
      "`t" { [void]$sb.Append('\t') }
      default { if ([int]$ch -lt 32) { [void]$sb.AppendFormat('\u{0:x4}', [int]$ch) } else { [void]$sb.Append($ch) } }
    }
  }
  [void]$sb.Append('"')
  return $sb.ToString()
}
function ConvertTo-JsonValue($v) {
  if ($null -eq $v -or $v -is [DBNull]) { return 'null' }
  if ($v -is [bool]) { if ($v) { return 'true' } else { return 'false' } }
  if ($v -is [datetime]) { if ($v.Year -lt 1900) { return 'null' } else { return '"' + $v.ToString('yyyy-MM-dd', $Inv) + '"' } }
  if ($v -is [decimal] -or $v -is [double] -or $v -is [single] -or $v -is [int] -or $v -is [long] -or $v -is [int16] -or $v -is [byte]) {
    return ([decimal]$v).ToString($Inv)
  }
  return ConvertTo-JsonString ([string]$v)
}
function New-Payload([string[]]$Columns, [System.Collections.ArrayList]$Rows, [hashtable]$Extra) {
  $sb = New-Object Text.StringBuilder
  [void]$sb.Append('{')
  foreach ($k in $Extra.Keys) { [void]$sb.Append((ConvertTo-JsonString $k)).Append(':').Append((ConvertTo-JsonValue $Extra[$k])).Append(',') }
  [void]$sb.Append('"rows":[')
  $keys = $Columns | ForEach-Object { (ConvertTo-JsonString $_) + ':' }
  for ($r = 0; $r -lt $Rows.Count; $r++) {
    if ($r -gt 0) { [void]$sb.Append(',') }
    [void]$sb.Append('{')
    $row = $Rows[$r]
    for ($c = 0; $c -lt $Columns.Count; $c++) {
      if ($c -gt 0) { [void]$sb.Append(',') }
      [void]$sb.Append($keys[$c]).Append((ConvertTo-JsonValue $row[$c]))
    }
    [void]$sb.Append('}')
  }
  [void]$sb.Append(']}')
  return $sb.ToString()
}

# ---------- сервер ----------
function Invoke-Server([string]$Method, [string]$Path, [string]$Json, [string]$AgentKey) {
  $url = $Cfg.serverUrl.TrimEnd('/') + $Path
  $attempt = 0
  while ($true) {
    $attempt++
    try {
      $req = [Net.HttpWebRequest]::Create($url)
      $req.Method = $Method
      $req.Timeout = 180000            # бесплатный сервер может «просыпаться» до минуты
      $req.ReadWriteTimeout = 180000
      $req.UserAgent = "sapar-1c-agent/$AgentVersion"
      $req.Headers.Add('X-Agent-Key', $AgentKey)
      $req.Headers.Add('X-Agent-Host', $env:COMPUTERNAME)
      if ($Json) {
        $req.ContentType = 'application/json; charset=utf-8'
        $req.Headers.Add('Content-Encoding', 'gzip')
        $raw = [Text.Encoding]::UTF8.GetBytes($Json)
        $ms = New-Object IO.MemoryStream
        $gz = New-Object IO.Compression.GZipStream($ms, [IO.Compression.CompressionMode]::Compress)
        $gz.Write($raw, 0, $raw.Length); $gz.Close()
        $bytes = $ms.ToArray()
        $req.ContentLength = $bytes.Length
        $s = $req.GetRequestStream(); $s.Write($bytes, 0, $bytes.Length); $s.Close()
      }
      $resp = $req.GetResponse()
      $rd = New-Object IO.StreamReader($resp.GetResponseStream(), [Text.Encoding]::UTF8)
      $text = $rd.ReadToEnd(); $resp.Close()
      return ($text | ConvertFrom-Json)
    } catch [Net.WebException] {
      $code = 0; $body = $_.Exception.Message
      if ($_.Exception.Response) {
        $code = [int]$_.Exception.Response.StatusCode
        $rd = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream(), [Text.Encoding]::UTF8)
        $body = $rd.ReadToEnd()
      }
      # 4xx (кроме 408/429) — ошибка данных или ключа, повтор не поможет
      if (($code -ge 400 -and $code -lt 500 -and $code -ne 408 -and $code -ne 429) -or $attempt -ge 3) {
        throw "Сервер ответил $code`: $body"
      }
      Write-Log 'WARN' "Сервер недоступен ($code), повтор $attempt через $(15 * $attempt) с"
      Start-Sleep -Seconds (15 * $attempt)
    }
  }
}

# ---------- 1С ----------
# Объекты 1С по COM не публикуют описание типов, поэтому PowerShell не видит их свойства и методы напрямую.
# Обращаемся через IDispatch (InvokeMember) — так работает с любой версией PowerShell.
# Запятая перед вызовом — чтобы PowerShell не «разворачивал» коллекции 1С при возврате из функции.
$BF = [Reflection.BindingFlags]
function Com-Get($Obj, [string]$Name) { ,[__ComObject].InvokeMember($Name, $BF::GetProperty, $null, $Obj, $null) }
function Com-Set($Obj, [string]$Name, $Value) { [void][__ComObject].InvokeMember($Name, $BF::SetProperty, $null, $Obj, @(,$Value)) }
function Com-Call($Obj, [string]$Name, [object[]]$Arguments = @()) { ,[__ComObject].InvokeMember($Name, $BF::InvokeMethod, $null, $Obj, $Arguments) }
function Get-1CInfo($Conn) {
  $md = Com-Get $Conn 'Metadata'
  return @{ Name = (Com-Get $md 'Name'); Version = (Com-Get $md 'Version'); Synonym = (Com-Call $Conn 'String' @((Com-Get $md 'Synonym'))) }
}

function Connect-1C([string]$Password) {
  $connector = New-Object -ComObject $Cfg.onec.comProgId
  $cs = 'Srvr="{0}";Ref="{1}";Usr="{2}";Pwd="{3}";' -f $Cfg.onec.server, $Cfg.onec.base, $Cfg.onec.user, ($Password -replace '"', '""')
  return $connector.Connect($cs)
}

function Get-QueryText([string]$Entity) {
  $p = Join-Path (Join-Path $Root 'queries') ($Entity + '.1c')
  if (-not (Test-Path $p)) { throw "Нет файла запроса $p" }
  return Get-Content $p -Raw -Encoding UTF8
}

# Выполнить запрос 1С → @{ Columns; Rows } (значения — примитивы: строка, число, дата, булево)
function Invoke-1CQuery($Conn, [string]$Text, [hashtable]$Params) {
  $q = Com-Call $Conn 'NewObject' @('Query')
  Com-Set $q 'Text' $Text
  foreach ($k in $Params.Keys) { [void](Com-Call $q 'SetParameter' @($k, $Params[$k])) }
  $res = Com-Call $q 'Execute'
  $colsObj = Com-Get $res 'Columns'
  $n = [int](Com-Call $colsObj 'Count')
  $cols = @(); for ($i = 0; $i -lt $n; $i++) { $cols += [string](Com-Get (Com-Call $colsObj 'Get' @($i)) 'Name') }
  $rows = New-Object Collections.ArrayList
  $sel = Com-Call $res 'Select'
  while (Com-Call $sel 'Next') {
    $row = New-Object object[] $n
    for ($i = 0; $i -lt $n; $i++) {
      $v = Com-Call $sel 'Get' @($i)
      if ($null -ne $v -and $v -is [__ComObject]) { $v = Com-Call $Conn 'String' @($v) }   # ссылка/перечисление → представление
      $row[$i] = $v
    }
    [void]$rows.Add($row)
  }
  return @{ Columns = $cols; Rows = $rows }
}

function Get-Params([string]$Entity, [datetime]$From, [datetime]$To) {
  $p = @{ 'Сейчас' = (Get-Date) }
  if ($Entity -in @('sales', 'cost')) { $p['Начало'] = $From.Date; $p['Конец'] = $To.Date.AddDays(1).AddSeconds(-1) }
  return $p
}

function Sync-Entity($Conn, [string]$Entity, [string]$AgentKey, [datetime]$From, [datetime]$To) {
  $sw = [Diagnostics.Stopwatch]::StartNew()
  $data = Invoke-1CQuery $Conn (Get-QueryText $Entity) (Get-Params $Entity $From $To)
  $extra = [ordered]@{ agentVersion = $AgentVersion }
  if ($Entity -in @('sales', 'cost')) { $extra['from'] = $From.Date; $extra['to'] = $To.Date }
  $json = New-Payload $data.Columns $data.Rows $extra
  $read = $sw.Elapsed.TotalSeconds
  $r = Invoke-Server 'POST' "/api/sync/1c/$Entity" $json $AgentKey
  Write-Log 'INFO' ('{0}: {1} строк, 1С {2:N1} с, отправка {3:N1} с, принято {4}' -f $Entity, $data.Rows.Count, $read, ($sw.Elapsed.TotalSeconds - $read), $r.rows)
}

# ---------- состояние (когда что последний раз отправлено) ----------
function Read-State { if (Test-Path $StatePath) { return (Get-Content $StatePath -Raw -Encoding UTF8 | ConvertFrom-Json) } else { return New-Object psobject } }
function Save-State($s) { $s | ConvertTo-Json | Set-Content -Path $StatePath -Encoding UTF8 }
function Get-Due($State) {
  $now = Get-Date
  $due = @()
  foreach ($p in $Cfg.schedule.PSObject.Properties) {
    $last = $State.PSObject.Properties[$p.Name]
    if (-not $last -or ($now - [datetime]::Parse($last.Value, $Inv)).TotalMinutes -ge ([int]$p.Value - 1)) { $due += $p.Name }
  }
  return $due
}

# ---------- режимы ----------
function Invoke-Probe($Conn) {
  $out = Join-Path $Root ('probe-{0}.txt' -f (Get-Date).ToString('yyyyMMdd-HHmm'))
  $lines = New-Object Collections.ArrayList
  [void]$lines.Add("Sapar Trade — диагностика 1С, $(Get-Date), агент $AgentVersion")
  $info = Get-1CInfo $Conn
  [void]$lines.Add("Конфигурация: $($info.Name) $($info.Version)  Синоним: $($info.Synonym)")
  $meta = Com-Get $Conn 'Metadata'
  $objs = @(
    @('Catalogs', 'Номенклатура'), @('Catalogs', 'Склады'), @('Catalogs', 'Контрагенты'), @('Catalogs', 'ДоговорыКонтрагентов'), @('Catalogs', 'ТипыЦенНоменклатуры'),
    @('InformationRegisters', 'ЦеныНоменклатуры'), @('InformationRegisters', 'КонтактнаяИнформация'),
    @('AccumulationRegisters', 'ТоварыНаСкладах'), @('AccumulationRegisters', 'ТоварыВРознице'), @('AccumulationRegisters', 'Продажи'),
    @('AccumulationRegisters', 'ПродажиСебестоимость'), @('AccumulationRegisters', 'ВзаиморасчетыСКонтрагентами')
  )
  foreach ($o in $objs) {
    [void]$lines.Add(''); [void]$lines.Add("=== $($o[0]).$($o[1])")
    try {
      $md = Com-Call (Com-Get $meta $o[0]) 'Find' @($o[1])
      if ($null -eq $md) { [void]$lines.Add('  НЕТ в конфигурации'); continue }
      foreach ($part in @('Dimensions', 'Resources', 'Attributes')) {
        try {
          $coll = Com-Get $md $part
          $cnt = [int](Com-Call $coll 'Count')
          $names = @(); for ($i = 0; $i -lt $cnt; $i++) { $names += [string](Com-Get (Com-Call $coll 'Get' @($i)) 'Name') }
          [void]$lines.Add("  ${part}: " + ($names -join ', '))
        } catch { }
      }
    } catch { [void]$lines.Add("  ошибка: $($_.Exception.Message)") }
  }
  try {
    [void]$lines.Add(''); [void]$lines.Add('=== Типы цен')
    $r = Invoke-1CQuery $Conn 'ВЫБРАТЬ Т.Наименование КАК name ИЗ Справочник.ТипыЦенНоменклатуры КАК Т' @{}
    foreach ($row in $r.Rows) { [void]$lines.Add("  $($row[0])") }
  } catch { [void]$lines.Add("  ошибка: $($_.Exception.Message)") }
  $to = (Get-Date).Date; $from = $to.AddDays(-7)
  foreach ($e in $Cfg.schedule.PSObject.Properties.Name) {
    [void]$lines.Add(''); [void]$lines.Add("=== Запрос $e (первые 5 строк)")
    try {
      $text = (Get-QueryText $e) -replace '(?i)^(\s*(//[^\n]*\n\s*)*)ВЫБРАТЬ', '$1ВЫБРАТЬ ПЕРВЫЕ 5'
      $r = Invoke-1CQuery $Conn $text (Get-Params $e $from $to)
      [void]$lines.Add('  ' + ($r.Columns -join ' | '))
      foreach ($row in $r.Rows) { [void]$lines.Add('  ' + (($row | ForEach-Object { if ($_ -is [datetime]) { $_.ToString('yyyy-MM-dd') } else { "$_" } }) -join ' | ')) }
      $cnt = Invoke-1CQuery $Conn ("ВЫБРАТЬ КОЛИЧЕСТВО(*) КАК n ИЗ (" + ((Get-QueryText $e) -replace '(?m)^\s*//.*$', '') + ") КАК X") (Get-Params $e $from $to)
      [void]$lines.Add("  всего строк: $($cnt.Rows[0][0])")
    } catch { [void]$lines.Add("  ОШИБКА: $($_.Exception.Message)") }
  }
  $lines | Set-Content -Path $out -Encoding UTF8
  Write-Host "Готово: $out — отправьте этот файл разработчику." -ForegroundColor Green
}

function Invoke-Backfill($Conn, [string]$AgentKey, [int]$Days) {
  $end = (Get-Date).Date
  $start = $end.AddDays(-$Days)
  $cur = $start
  while ($cur -le $end) {
    $monthEnd = (New-Object DateTime $cur.Year, $cur.Month, 1).AddMonths(1).AddDays(-1)
    if ($monthEnd -gt $end) { $monthEnd = $end }
    foreach ($e in @('sales', 'cost')) {
      try { Sync-Entity $Conn $e $AgentKey $cur $monthEnd }
      catch { Write-Log 'ERROR' ("{0} {1:yyyy-MM-dd}..{2:yyyy-MM-dd}: {3}" -f $e, $cur, $monthEnd, $_.Exception.Message) }
    }
    $cur = $monthEnd.AddDays(1)
  }
}

# ---------- запуск ----------
if ($SetSecrets) { Save-Secrets; return }

# не запускать два цикла одновременно (если прошлый ещё идёт)
$lock = $null
$conn = $null
try { $lock = [IO.File]::Open($LockPath, 'OpenOrCreate', 'ReadWrite', 'None') }
catch { Write-Log 'WARN' 'Предыдущий запуск ещё работает — пропускаю.'; return }

try {
  Get-ChildItem $LogDir -Filter 'agent-*.log' | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-14) } | Remove-Item -ErrorAction SilentlyContinue
  $sec = Read-Secrets

  if ($Test) {
    if ($sec.AgentKey) {
      $ping = Invoke-Server 'GET' '/api/sync/1c/ping' $null $sec.AgentKey
      Write-Host "Сервер: OK, время сервера $($ping.serverTime)" -ForegroundColor Green
    } else { Write-Host 'Сервер: пропущено (ключ агента ещё не задан)' -ForegroundColor Yellow }
    $conn = Connect-1C $sec.OnecPassword
    $info = Get-1CInfo $conn
    Write-Host "1С: OK, конфигурация $($info.Synonym) $($info.Version)" -ForegroundColor Green
    return
  }

  $conn = Connect-1C $sec.OnecPassword
  if ($Probe) { Invoke-Probe $conn; return }
  if (-not $sec.AgentKey) { throw 'Ключ агента не задан. Получите его у разработчика и выполните -SetSecrets ещё раз.' }
  if ($Backfill -gt 0) { Invoke-Backfill $conn $sec.AgentKey $Backfill; return }

  $state = Read-State
  $due = if ($Only.Count) { $Only } else { Get-Due $state }
  if (-not $due.Count) { return }
  $to = (Get-Date).Date
  $from = $to.AddDays(-[int]$Cfg.salesLookbackDays)
  $errors = 0
  foreach ($e in $due) {
    try {
      Sync-Entity $conn $e $sec.AgentKey $from $to
      $state | Add-Member -NotePropertyName $e -NotePropertyValue (Get-Date).ToString('s', $Inv) -Force
    } catch {
      $errors++
      Write-Log 'ERROR' "$e`: $($_.Exception.Message)"
    }
  }
  Save-State $state
  if ($errors) { exit 1 }
} catch {
  Write-Log 'ERROR' $_.Exception.Message
  exit 2
} finally {
  if ($conn) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($conn) }
  if ($lock) { $lock.Close() }
}
