# Проверка без 1С: функции агента (JSON, gzip, HTTP) против локального сервера.
#   pwsh agent/tests/smoke.ps1 -Url http://127.0.0.1:3999 -Key test-agent-key-0123456789
param([string]$Url, [string]$Key)
$ErrorActionPreference = 'Stop'
$errs = $null; $tok = $null
$ast = [Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot '..\sapar-1c-agent.ps1'), [ref]$tok, [ref]$errs)
foreach ($f in $ast.FindAll({ $args[0] -is [Management.Automation.Language.FunctionDefinitionAst] }, $true)) { . ([scriptblock]::Create($f.Extent.Text)) }
$Inv = [Globalization.CultureInfo]::InvariantCulture
$AgentVersion = 'smoke'
$NeedsEscape = New-Object Text.RegularExpressions.Regex '[\x00-\x1f"\\]', 'Compiled'
$LogDir = Join-Path ([IO.Path]::GetTempPath()) 'st-agent-logs'; New-Item -ItemType Directory -Force $LogDir | Out-Null
$Cfg = [pscustomobject]@{ serverUrl = $Url }

# Send сущность колонки @(строка1) @(строка2) ... [-Extra @{...}] — каждая строка отдельным аргументом
function Send {
  $entity, $cols, $extra = $args[0], $args[1], $args[2]
  $list = New-Object Collections.ArrayList
  for ($i = 3; $i -lt $args.Count; $i++) { [void]$list.Add([object[]]$args[$i]) }
  if (-not $extra) { $extra = [ordered]@{} }
  $json = New-Payload $cols $list $extra
  $r = Invoke-Server 'POST' "/api/sync/1c/$entity" $json $Key
  "{0}: ok={1} rows={2}" -f $entity, $r.ok, $r.rows
}

$ping = Invoke-Server 'GET' '/api/sync/1c/ping' $null $Key
"ping: $($ping.ok)"
$none = [ordered]@{}
Send products @('code','name','groupName','unit','sku') $none @('00001', 'Мука "Цесна" 50 кг', 'Бакалея', 'шт', '4870001') @('00002', "Масло\подсолнечное`t5 л", 'Бакалея', 'шт', '')
Send warehouses @('code','name') $none @('000000001','Главный склад')
Send clients @('code','name','manager','phone','address') $none @('К-001','ТОО «Айгерим»','Ахметов Ержан','+7 701','Кызылорда, ул. Абая 1')
Send prices @('product','priceType','price') $none @('00001','Оптовая',[decimal]15000.50) @('00002','Оптовая',[double]4500.25)
Send stock @('warehouse','product','qty') $none @('000000001','00001',[decimal]12.5) @('000000001','00002',[decimal]3)
Send debts @('client','docDate','docName','amount') $none @('К-001',(Get-Date).AddDays(-20),'Реализация товаров 00012 от 02.10.2026',[decimal]100000) @('К-001',[datetime]'0001-01-01','',[decimal]-500)
$d = (Get-Date).Date
Send sales @('dt','product','client','qty','revenue') ([ordered]@{ from = $d.AddDays(-3); to = $d }) @($d,'00001','К-001',[decimal]2,[decimal]31001)
Send cost @('dt','product','qty','cost') ([ordered]@{ from = $d.AddDays(-3); to = $d }) @($d,'00001',[decimal]2,[decimal]24000)
try { Send sales @('dt','product') ([ordered]@{ from = $d; to = $d }) @('вчера','1') } catch { "ожидаемая ошибка: $($_.Exception.Message.Substring(0, [Math]::Min(80, $_.Exception.Message.Length)))" }
try { $Key = 'wrong-key'; Invoke-Server 'GET' '/api/sync/1c/ping' $null $Key } catch { "неверный ключ: $($_.Exception.Message.Substring(0, 30))" }
