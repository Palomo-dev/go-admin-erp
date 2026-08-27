# FASE 8 — Reserva de mesa de restaurante: funcional y personalizable

> Vuelve al [PLAN.md](./PLAN.md) · Depende de [FASE 0 y 2](./FASE-0-FUNDACIONES.md)

---

## 8.0 Hallazgo previo: hoy la reserva de mesa NO funciona

Antes de personalizarla hay que hacerla funcionar. Estado real verificado:

| Pieza | Estado | Evidencia |
|---|---|---|
| Sección `reservation_cta` en el sitio | Existe y se renderiza | `SectionRenderer.tsx:251-254` → `ReservationCtaForm` (variantes `with_form` y `simple` apuntan al **mismo** componente) |
| El formulario | **Decorativo** | `restaurant/ReservationCtaForm.tsx:1-64` pinta fecha, hora y personas pero **no tiene `onSubmit`, no llama a ninguna API y no valida disponibilidad**. Solo redirige a `content.cta_url` o `/reservas`. |
| La sección en el editor | **No existe** | `reservation_cta` no está en `SECTION_CATALOG` → no se puede agregar ni editar (P2) |
| Página `/reservas-mesa` | Declarada, sin ruta física | `lib/templates/presets.ts:555` la crea como página builtin con `hero:minimal` + `reservation_cta:with_form` + `faq:accordion`; se sirve por `app/[[...slug]]` |
| Tabla `restaurant_reservations` | **Ya existe y está completa** | `id, organization_id, branch_id, restaurant_table_id, customer_name, customer_phone, customer_email, customer_id, party_size, reservation_date, reservation_time, duration_minutes, status, notes, special_requests, source, created_by, confirmed_at, seated_at, completed_at, cancelled_at, cancellation_reason` |
| Tabla `restaurant_tables` | **Ya existe** | `id, organization_id, branch_id, name, zone, capacity, state, position_x, position_y, rotation` |
| Endpoint web para mesas | **No existe** | `/api/reservations` acepta `{date, time, guests}` pero esa rama no valida nada ni escribe en `restaurant_reservations`; el wizard de `/reservas` es de **hotel** (check-in/check-out por noches) |
| `components/site/reservations/*` | Es de **hotel**, no de restaurante | `DateSelector` usa check-in/check-out; `SpaceSelector` selecciona habitaciones; `ReservationSummary` calcula noches e **IVA 19% hardcodeado** (`ReservationSummary.tsx:42`) |
| `HeroBookingWidget` | Es de **hotel** | check-in/check-out/huéspedes → redirige a `/espacios` |
| Configuración (turnos, aforo, anticipación) | **No existe** | `website_settings.enable_reservations` es genérico; `space_types.booking_rules` solo tiene `min_stay`/`max_stay` en noches |
| Email de confirmación | No se envía | `lib/email/send-reservation-confirmation.ts` existe pero nadie lo llama para mesas |

**Conclusión:** el ERP ya sabe gestionar reservas de mesa (las tablas están completas); el sitio público solo tiene una maqueta. La fase tiene por tanto dos mitades: **8.A hacerla funcional** y **8.B hacerla personalizable**.

**Regla de oro:** igual que en checkout, la personalización cubre estilo, textos, campos visibles y orden. Las **reglas de negocio** (aforo, turnos, solapes) se validan **siempre en el servidor**, nunca desde el JSON del editor.

---

# 8.A — Hacerla funcional

## 8.A.1 Configuración de reservas por organización

**Opción elegida:** tabla propia en vez de columnas nuevas en `website_settings` (que ya tiene 125 columnas).

**Migración nueva:** `restaurant_booking_settings`

```sql
create table public.restaurant_booking_settings (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       integer not null references organizations(id) on delete cascade,
  branch_id             integer references branches(id) on delete cascade,  -- null = todas
  is_enabled            boolean not null default false,
  -- Turnos y horarios
  service_hours         jsonb not null default '{}'::jsonb,  -- ver formato abajo
  slot_interval_minutes integer not null default 30,         -- cada cuánto se ofrece una hora
  turn_duration_minutes integer not null default 90,         -- cuánto ocupa una mesa
  buffer_minutes        integer not null default 15,         -- limpieza entre turnos
  -- Aforo y tamaño de grupo
  min_party_size        integer not null default 1,
  max_party_size        integer not null default 12,
  max_covers_per_slot   integer,                             -- null = limitado solo por mesas
  large_party_threshold integer,                             -- pide contacto en vez de reservar
  -- Anticipación
  min_advance_minutes   integer not null default 60,
  max_advance_days      integer not null default 60,
  cancellation_hours    integer not null default 4,
  -- Asignación de mesa
  auto_assign_table     boolean not null default true,
  allow_zone_choice     boolean not null default false,
  allowed_zones         text[],
  -- Política y confirmación
  require_confirmation  boolean not null default false,       -- queda 'pending' hasta que el restaurante confirme
  require_deposit       boolean not null default false,
  deposit_amount        numeric(12,2),
  deposit_per_person    boolean not null default false,
  policy_text           text,
  -- Notificaciones
  notify_emails         text[],
  send_customer_email   boolean not null default true,
  send_customer_whatsapp boolean not null default false,
  reminder_hours_before integer,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (organization_id, branch_id)
);
alter table public.restaurant_booking_settings enable row level security;
```

**Formato de `service_hours`** (por día de semana, con varios turnos):
```json
{
  "mon": [{"name":"Almuerzo","from":"12:00","to":"15:00"},
          {"name":"Cena","from":"18:30","to":"22:30"}],
  "tue": [...],
  "sun": []
}
```

**RLS:** lectura pública solo de `is_enabled = true` (el sitio la necesita para pintar horarios); escritura solo con membresía en la organización. Seguir el patrón de RLS ya usado en `website_settings`.

**Excepciones de calendario** (festivos, eventos privados, cierres): reutilizar `reservation_blocks` si su forma lo permite; si no, tabla mínima `restaurant_booking_blackouts (organization_id, branch_id, date, from_time, to_time, reason)`.

## 8.A.2 Endpoint de disponibilidad

**Archivo nuevo:** `goadmin-websites/app/api/restaurant-reservations/availability/route.ts`

`POST` con `{ organizationId, branchId?, date, partySize, zone? }`

Algoritmo (todo en servidor):
1. Cargar `restaurant_booking_settings` (branch específico → fallback a `branch_id IS NULL`). Si `is_enabled = false` → 404.
2. Generar los slots del día a partir de `service_hours[weekday]` cada `slot_interval_minutes`.
3. Filtrar por `min_advance_minutes` (nada dentro de la próxima hora) y `max_advance_days`.
4. Descontar blackouts.
5. Para cada slot, calcular mesas libres: `restaurant_tables` con `capacity >= partySize` (y `zone` si se pidió), menos las que tengan una `restaurant_reservations` en estado `pending|confirmed|seated` cuyo intervalo `[reservation_time, reservation_time + duration_minutes + buffer_minutes)` **solape** el slot.
6. Aplicar `max_covers_per_slot` si está definido (suma de `party_size` ya reservado).
7. Devolver:
```json
{ "slots": [{"time":"19:00","available":true,"remaining":3},
            {"time":"19:30","available":false,"reason":"full"}],
  "suggestedTimes": ["18:30","20:30"],
  "requiresContact": false,
  "policy": { "depositRequired": false, "cancellationHours": 4 } }
}
```

**Implementación:** función SQL `get_restaurant_availability(...)` en Postgres en vez de traer todo a Node. Evita N+1 y deja la lógica de solape en un solo lugar, reutilizable por el POS del ERP.

## 8.A.3 Endpoint de creación

**Archivo nuevo:** `goadmin-websites/app/api/restaurant-reservations/route.ts`

`POST` con `{ organizationId, branchId?, date, time, partySize, zone?, customer: {name, phone, email}, notes?, specialRequests?, occasion?, marketingOptIn? }`

Pasos:
1. **Revalidar disponibilidad en servidor** (nunca confiar en el cliente).
2. **Reserva atómica**: RPC `create_restaurant_reservation(...)` que dentro de una transacción hace `SELECT ... FOR UPDATE` sobre las mesas candidatas, elige mesa (`auto_assign_table`: la de menor capacidad que quepa, para no desperdiciar mesas grandes) e inserta. Sin esto hay la misma condición de carrera que en el checkout (ver [FASE 11](./FASE-11-COMERCIO.md)).
3. Buscar o crear `customers` por email/teléfono dentro de la organización (mismo patrón que `/api/reservations`), y enlazar `customer_id`.
4. Insertar en `restaurant_reservations` con `source = 'website'` y `status = require_confirmation ? 'pending' : 'confirmed'`.
5. Si `require_deposit`: crear el cobro con `POST /api/checkout/init` (ya soporta múltiples pasarelas) y dejar la reserva en `pending` hasta el webhook. **Importante:** el webhook debe liberar la mesa si el pago falla — mismo patrón que el stock en F11.
6. Enviar email de confirmación al cliente (`send_customer_email`) y aviso a `notify_emails`.
7. Devolver `{ reservationId, code, status }` con un código corto legible.

**Endpoints complementarios:**
- `GET /api/restaurant-reservations/[id]` — consultar con token, para la página de confirmación.
- `POST /api/restaurant-reservations/[id]/cancel` — cancelar respetando `cancellation_hours`.

## 8.A.4 Reflejo en el ERP

- El módulo de restaurante del ERP debe mostrar las reservas con `source='website'` en su vista de reservas y en el mapa de mesas (`position_x/position_y/rotation` ya existen).
- Panel de configuración de `restaurant_booking_settings` en el ERP (horarios, turnos, aforo, política). Ubicación sugerida: junto a la configuración de mesas del módulo POS/restaurante, **no** dentro del editor de branding — el editor configura la **apariencia**, el ERP las **reglas de negocio**. El editor solo las lee para previsualizar.
- Notificación en tiempo real de nueva reserva web (el proyecto ya usa Supabase Realtime en otros módulos).

---

# 8.B — Hacerla personalizable

## 8.B.1 Nueva sección `restaurant_booking`

Se crea una sección nueva en vez de sobrecargar `reservation_cta`, y se deja `reservation_cta` como está (compatibilidad) marcándola como *legacy* en el editor.

**Sitio — archivos nuevos:**
```
components/sections/restaurant/
  RestaurantBookingInline.tsx     # variante 'inline'   (una fila compacta)
  RestaurantBookingCard.tsx       # variante 'card'     (tarjeta destacada)
  RestaurantBookingSplit.tsx      # variante 'split'    (imagen + formulario)
  RestaurantBookingWizard.tsx     # variante 'wizard'   (pasos: fecha → hora → datos)
  RestaurantBookingSteps.tsx      # variante 'steps'    (todo en una página, por bloques)
  booking/                        # piezas compartidas
    DatePicker.tsx                # calendario con días sin disponibilidad atenuados
    TimeSlotGrid.tsx              # grid o lista de horas
    PartySizeSelector.tsx         # botones, select o stepper
    ZoneSelector.tsx
    GuestFields.tsx               # nombre, teléfono, email, notas, ocasión
    BookingSummary.tsx
    BookingConfirmation.tsx
```

**Registro en `SectionRenderer.tsx`:**
```ts
restaurant_booking: {
  inline: RestaurantBookingInline,
  card:   RestaurantBookingCard,
  split:  RestaurantBookingSplit,
  wizard: RestaurantBookingWizard,
  steps:  RestaurantBookingSteps,
},
```

**Prefetch en `app/[[...slug]]/page.tsx`:** si la página incluye `restaurant_booking`, cargar `restaurant_booking_settings` y las zonas disponibles y pasarlas por `data.bookingSettings` / `data.zones`. Así el formulario pinta horarios reales en el primer render (bueno para SEO y para el LCP).

## 8.B.2 Campos configurables desde el editor

Declarar en `SECTION_CATALOG`. Todos los grupos de estilo (`STYLE_FIELDS`, `CARD_FIELDS`, `BUTTON_ITEM_FIELDS`) se inyectan automáticamente por F0.

**Grupo Contenido**
| Campo | Tipo | Notas |
|---|---|---|
| `title`, `subtitle` | text / textarea | |
| `image_url` | image | variante `split` |
| `intro_text` | richtext | |
| `policy_text` | textarea | por defecto hereda de `restaurant_booking_settings.policy_text` |
| `success_title`, `success_message` | text / textarea | pantalla de confirmación |
| `unavailable_message` | text | qué decir si no hay cupo |
| `large_party_message` | textarea | mensaje para grupos grandes |
| `labels.*` | text | textos de cada campo y del botón, editables uno a uno |

**Grupo Datos / Comportamiento**
| Campo | Tipo | Notas |
|---|---|---|
| `branch_id` | entity(branch) | de qué sede reserva esta sección |
| `show_zone_selector` | boolean | `showIf` de que la config lo permita |
| `show_occasion` | boolean | cumpleaños, aniversario, negocios… |
| `occasion_options` | repeater | |
| `show_notes` | boolean | |
| `show_marketing_optin` | boolean | + `marketing_optin_text` |
| `required_fields` | select múltiple | teléfono y/o email obligatorios |
| `party_size_style` | select | `buttons` / `select` / `stepper` |
| `party_size_max_visible` | number | cuántos botones antes de "más de X" |
| `time_display` | select | `grid` / `list` / `dropdown` / `carousel` |
| `time_columns` | number responsive | |
| `show_remaining` | boolean | "quedan 2 mesas" (urgencia) |
| `date_display` | select | `calendar` / `strip` (tira horizontal de 7 días) / `input` |
| `default_party_size` | number | |
| `after_submit` | select | `inline` / `redirect` / `modal` |
| `redirect_url` | url | `showIf: after_submit = redirect` |
| `whatsapp_fallback` | boolean | + `whatsapp_number`: si no hay cupo, ofrecer escribir |

**Grupo Diseño**
`layout` (`horizontal`/`vertical`/`split_left`/`split_right`), `field_style` (`outlined`/`filled`/`underline`), `field_radius`, `field_size`, `accent_color`, `step_indicator_style` (variante wizard), `sticky_mobile` (barra fija con "Reservar" en móvil).

**Grupo Avanzado**
`show_powered_by`, `analytics_event_name`, `gtm_conversion_id` (para medir la reserva como conversión en Google Ads / Meta, que el sitio ya integra).

## 8.B.3 Widget de reserva en el hero

Extender el `booking_engine` de la [FASE 3](./FASE-3-7-SECCIONES.md) con el motor `restaurant`:
- `HeroBookingWidget` actual se generaliza a un registro `BOOKING_ENGINES` (`hotel`, `restaurant`, `parking`, `gym`, `transport`, `services`).
- El motor `restaurant` reutiliza `booking/DatePicker`, `TimeSlotGrid` y `PartySizeSelector` en su versión compacta, y al enviar navega a la página de reserva con los parámetros precargados (`/reservas-mesa?date=…&time=…&party=…`), o abre un modal si `hero.booking_mode = 'modal'`.

## 8.B.4 Plantilla de página y ruta

- `presets.ts` (ambos repos, están espejados): actualizar el template `restaurant_modern` para que `reservas-mesa` use `restaurant_booking:card` en lugar de `reservation_cta:with_form`.
- Añadir `page_type = 'restaurant_booking'` a las plantillas de la [FASE 9](./FASE-9-10-PAGINAS-Y-REVIEWS.md) para que la página de confirmación de reserva también sea editable.
- **Migración suave** para los sitios que ya tienen `reservation_cta`: no tocarlos automáticamente; ofrecer en el editor un botón "Actualizar a formulario funcional" que crea la sección nueva con los mismos textos.

## 8.B.5 Estados y accesibilidad

Cada variante debe cubrir: cargando disponibilidad · sin cupo ese día (con `suggestedTimes`) · grupo demasiado grande · fuera de horario · reservas deshabilitadas · error de red · éxito. Los textos de todos esos estados salen del grupo Contenido.

Accesibilidad: navegación por teclado en el grid de horas, `aria-live` al cambiar la disponibilidad, `<label>` real en cada campo, y contraste AA sobre `accent_color` (regla B.5 del plan).

---

## Riesgos específicos de esta fase

| Riesgo | Mitigación |
|---|---|
| Doble reserva de la misma mesa | RPC transaccional con `FOR UPDATE` (8.A.3). Test de concurrencia obligatorio. |
| Zona horaria: `reservation_time` es `time without time zone` | Guardar siempre en la zona del negocio y resolverla desde la sucursal; nunca usar la del navegador. Test explícito con un cliente en otra zona horaria. |
| Reservas basura / bots | Rate limit por IP y por teléfono, honeypot, y `require_confirmation` como opción. |
| El editor "configura" reglas de negocio | Aforo, turnos y anticipación viven en `restaurant_booking_settings` (ERP) y se validan en servidor. El editor solo controla apariencia y qué campos se muestran. |
| Romper los sitios con `reservation_cta` | La sección vieja se mantiene funcionando igual; la nueva es opt-in. |

## Criterios de aceptación F8
- [ ] Una reserva hecha desde el sitio aparece en el ERP en `restaurant_reservations` con `source='website'` y mesa asignada.
- [ ] Dos reservas simultáneas para la última mesa del mismo turno: una falla con mensaje claro.
- [ ] Un día sin cupo muestra horarios alternativos, no un formulario que falla al enviar.
- [ ] La sección se puede agregar y configurar desde el editor en sus 5 variantes.
- [ ] Se pueden cambiar todos los textos, el estilo de los campos, el radio, los colores y qué campos aparecen, sin tocar código.
- [ ] El cliente recibe email de confirmación y el restaurante recibe aviso.
- [ ] Cancelación respeta `cancellation_hours` y libera la mesa.
- [ ] Verificado en 375 / 834 / 1440 px y con teclado.
