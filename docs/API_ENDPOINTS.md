# Sapar Trade — черновой список API (REST, префикс `/api/v1`)

Все ответы JSON. Авторизация: `Authorization: Bearer <access>`. В колонке «Права» — кто имеет доступ. Финансовые поля вырезаются сервером, если права нет (FieldFilterInterceptor). Каждый GET финансовых разделов и каждое изменение пишется в `audit_log`.

## Auth
| Метод | Путь | Описание | Права |
|---|---|---|---|
| POST | /auth/otp/request | `{phone}` → отправить код в WhatsApp/SMS (rate-limit) | публично |
| POST | /auth/otp/verify | `{phone, code}` → токены клиента | публично |
| POST | /auth/login | `{login, password}` сотрудника → токены или `{need2fa:true, tmpToken}` | публично |
| POST | /auth/2fa/verify | `{tmpToken, code}` (TOTP) | публично |
| POST | /auth/refresh | обновить access по refresh-cookie | — |
| POST | /auth/logout · /auth/logout-all | выход / со всех устройств | auth |
| GET | /auth/sessions | мои сессии и устройства | auth |

## Клиентское приложение
| Метод | Путь | Описание | Права |
|---|---|---|---|
| GET | /catalog/categories · /catalog/products?cat=&q= | каталог (без `cost`) | client |
| GET | /content/banners · /content/stories | баннеры, сторис (активные) | client |
| GET/PUT | /me | профиль, адрес, язык | client |
| GET | /me/cashback | `{monthSpend, threshold, reward, available}` | client |
| POST | /orders | `{items[], payMethod, isDebt, useCashback}` | client / tp |
| GET | /me/orders | мои заказы | client |
| GET | /me/notifications | уведомления | client |

## Админ
| Метод | Путь | Описание | Права |
|---|---|---|---|
| POST | /shifts/start | открыть смену | admin |
| GET | /shifts/current | живые цифры смены | admin |
| POST | /shifts/{id}/finish | закрыть → отчёт (jsonb) → отправка WhatsApp директору → `{report, sendStatus}` | admin |
| GET | /shifts?from=&to= | история смен | admin, owner |
| GET / PATCH | /admin/orders?range=24h\|date&type=&debt= · /admin/orders/{id}/status | заказы | admin |
| GET | /admin/orders/{id}/pdf | чек PDF | admin |
| CRUD | /admin/banners · /admin/stories | контент (загрузка файлов в S3) | admin |
| POST | /admin/push | push всем клиентам | admin |
| GET/POST/PATCH | /admin/stock · /admin/stock/receipt · /admin/products/{id}/price | склад, приход, цена | admin |
| CRUD | /admin/agents | учётки ТП (генерация логина/пароля, блокировка) | admin |
| GET/PUT | /admin/settings | номер директора, кэшбэк, счета | admin, owner |
| GET | /admin/audit | журнал | admin, owner |

## Торговый представитель (приём заказов)
| Метод | Путь | Описание | Права |
|---|---|---|---|
| GET/POST | /tp/stores | мои магазины | tp |
| POST | /orders (source=tp_app) | заказ по магазину | tp |
| GET | /tp/orders | мои заказы | tp |

## Система управления
| Метод | Путь | Описание | Права |
|---|---|---|---|
| GET | /mgmt/dashboard?period=&from=&to= | KPI + сравнение с прошлым периодом (поля по правам) | owner, director, accountant, financier |
| GET | /mgmt/sales?period= | план/факт, темп, прогноз, клиенты, команды | owner, director |
| GET | /mgmt/team?range=day\|week\|month\|quarter | рейтинг ТП, команды, сравнение | owner, director, supervisor (своя) |
| GET | /mgmt/tp/{id}?range= | карточка ТП + Score + маршрут за день | owner, director, supervisor, tp (свой) |
| GET | /mgmt/clients?filter=all\|debt\|overdue | дебиторка, возраст долга, по ТП/командам | owner, director, supervisor, tp, accountant, financier |
| GET | /mgmt/clients/{id} | карточка клиента (маржа/валовая — по правам) | те же |
| GET | /mgmt/stock?tab=all\|low\|dead | склад, запас в днях, dead stock (cost — только owner) | owner, director, warehouse |
| GET | /mgmt/finance/pnl?period= | P&L | **только owner** |
| GET | /mgmt/finance/cash?period= | движение денег, расходы, дебиторка/кредиторка | owner, accountant, financier |
| GET | /mgmt/problems | проблемы (красный/жёлтый/зелёный) по роли | все роли mgmt |
| CRUD | /mgmt/tasks · POST /mgmt/tasks/{id}/comments | задачи, комментарии, файлы | все (создают: owner, director, supervisor, accountant, financier) |
| POST | /mgmt/ai/ask | `{question}` → ответ LLM по данным, отфильтрованным по роли | все роли mgmt |
| GET/PUT | /mgmt/settings/score-weights | веса Score (сумма = 100) | owner |
| GET | /mgmt/export?report=&format=xlsx\|pdf | экспорт только разрешённых полей | по отчёту |

## Водитель и GPS
| Метод | Путь | Описание | Права |
|---|---|---|---|
| GET | /driver/trip/today | рейс, точки, накладные | driver |
| POST | /driver/trip/start · /driver/trip/finish | начать/закончить рейс | driver |
| PATCH | /driver/deliveries/{id} | `{status, collected, payMethod, photo}` (11 статусов) | driver |
| POST | /fleet/points | пачка `[{lat,lng,accuracy,speed,heading,recordedAt}]` (только при открытом рейсе) | driver, tp |
| GET | /fleet/live | текущие позиции, статусы, last seen | owner, director |
| GET | /fleet/{userId}/track?date= | трек за день | owner, director |
| WS | /ws (комната `fleet`) | события `position`, `status`, `signal_lost` | owner, director |

## Интеграции
| Метод | Путь | Описание | Права |
|---|---|---|---|
| GET | /integrations/status | время последней синхронизации 1С / SD, флаг «устарели» | owner, accountant |
| POST | /integrations/refresh | ручной запуск синхронизации | owner, accountant |
| GET | /integrations/log | Integration Log | owner, accountant |
