# Importar leads (CRM › Leads › Importar)

Carga masiva de prospectos desde un archivo. Cada fila termina en una ficha de
cliente (`customers`, `lifecycle_stage='lead'`) y su lead
(`opportunities.record_type='lead'`), exactamente como el alta manual: el
importador **no tiene un alta propia**, llama a `createLeadWithCustomer`
(`src/lib/services/crm/leadCreateService.ts`), el mismo núcleo de
`POST /api/crm/leads` (pipeline y etapa por defecto, asignación automática de
vendedor, reversión de la ficha si el lead no cuaja).

> Este documento no contiene datos reales. Los ejemplos son inventados.

## Cómo se usa

1. **CRM › Leads › Importar** (botón junto a «Nuevo lead», ruta
   `/app/crm/leads/importar`). «Descargar plantilla» baja un CSV con las
   columnas reconocidas y dos filas de ejemplo.
2. **Archivo**: CSV, XLS o XLSX (máx. 10 MB y 1.000 filas por archivo). Si el
   libro tiene varias hojas se elige cuál (se preselecciona la primera cuya
   cabecera reconoce un nombre; las hojas de resumen o fuentes se ignoran).
3. **Columnas**: autodetección por nombre de cabecera, editable. Hace falta un
   nombre (comercial, razón social o contacto) y un teléfono o un correo.
4. **Validación**: nombre del lote (por defecto, el nombre del archivo), tipo
   de cliente (empresa/persona), moneda del valor (se detecta `USD` si la
   cabecera lo dice) y país para completar teléfonos sin indicativo. El
   servidor valida contra los clientes de la organización **sin escribir nada**.
5. **Vista previa**: acción por fila (crear, ligar a existente, omitir, error)
   con el motivo; se pueden excluir filas.
6. **Resultado**: se importa por bloques de 25 filas. KPIs de creados, ligados,
   omitidos y con error, y **CSV descargable con todas las filas del archivo**.

## Servidor

`POST /api/crm/leads/importar` (`src/app/api/crm/leads/importar/route.ts`):

| | |
|---|---|
| Sesión | `getServerOrgContext()`; organización ajena en body o query → 403 (`readOrgBody`) |
| Permiso | `crm.leads.create` con `hasOrgAdminOrPermission` (rol o cargo, en el servidor). Hoy lo tiene el rol 2; se concede a otros por cargo |
| `accion: 'validar'` | vista previa, hasta `LEADS_IMPORT_MAX_FILAS` filas (1.000 por defecto, máx. 5.000) |
| `accion: 'importar'` | hasta 50 filas por petición (el asistente manda 25); `maxDuration = 60` |

El servidor **nunca confía en la validación del navegador**: vuelve a
normalizar, validar y deduplicar cada bloque antes de escribir. Código:
`src/lib/services/crm/leadsImportService.ts` (+ lecturas en
`leadsImportLookup.ts`) y lógica pura en `src/lib/crm/importacionLeads/`.

## Columnas reconocidas

Alias normalizados (sin tildes ni signos) en es/en/fr/pt, en
`src/lib/crm/importacionLeads/campos.ts`. Entre otros: `nombre_comercial`,
`nombre`, `empresa`, `razon_social`, `nit`, `dv`, `contacto`, `telefono_e164`,
`telefono`, `celular`, `correo`, `email`, `direccion`, `barrio`, `ciudad`,
`departamento`, `zona`, `sector`, `subsector`, `prioridad`, `valor`,
`valor_anual_usd`, `plan_probable`, `web`, `fuente_*_url` (varias columnas),
`verificacion`, `fecha_verificacion`, `ley_2300_horario`, `notas`,
`etiquetas` (varias), `rne_crc`, `id`. Si dos columnas nombran el mismo campo
gana la primera (con `telefono_e164` y `telefono`, la E.164).

## Mapeo aplicado

**Cliente nuevo** (`customers`):

| Columna | Origen |
|---|---|
| `customer_type` | `company` (o `person`); CHECK `person\|company` |
| `company_name` | razón social; si no hay, el nombre comercial |
| `trade_name` | nombre comercial |
| `first_name`/`last_name` | el contacto, si viene (son NULL-ables; no se inventan) |
| `identification_type`/`_number`/`dv` | `NIT` + número sin DV; `dv` solo si cuadra con el módulo 11 (`calcularDv`) |
| `phone` | E.164 (`+573001234567`, `+576041234567`) vía `aE164` |
| `email` | en minúsculas |
| `address` | dirección + «, barrio» |
| `city` | ciudad |
| `notes` | notas |
| `tags` | sector, subsector, `prioridad:X`, `zona:X`, `lote:X`, `rne:pendiente` + etiquetas del archivo |
| `vertical_id` | vertical ACTIVA de la organización cuyo nombre o slug casa con el sector (o subsector); «Otros» nunca casa |
| `timezone` | `+57…` → `America/Bogota`; otro país → zona de la organización |
| `metadata.importacion` | `lote, id_externo, fila, archivo, importado_en, importado_por, fuentes[], verificacion, fecha_verificacion, tipo_telefono, web, plan_probable, departamento, zona, barrio, horario_contacto, rne, rne_archivo, valor_original` |

**Lead** (`opportunities`): `name` = «nombre comercial · ciudad»,
`source='importacion'` (no hay CHECK sobre `source`), `amount`/`currency`
(ver moneda), `icp_band` = A/B/C desde la prioridad (A/B/C, 1/2/3,
alta/media/baja), `vertical_id` igual que el cliente, `temperature` vacío
(nadie ha hablado aún con el prospecto), `metadata.importacion` = `{lote,
id_externo, fila, plan_probable, rne, valor_original}`. `record_type='lead'` y
`status='open'` los fija el servicio.

Las columnas extra de la ficha y del lead entran por un parámetro de servidor
de `createLeadWithCustomer` (`LeadCreateExtras`, lista blanca de columnas);
`POST /api/crm/leads` no lo pasa y su contrato no cambia.

## Moneda

- Si la organización maneja la moneda del valor (`organization_currencies`),
  se guarda tal cual (p. ej. `USD`).
- Si no, se convierte a su moneda base con la tasa del día (`currency_rates`,
  la política del GO Assistant: `convertAmount`, día en la zona de la
  organización). El original y la tasa quedan en `metadata.importacion.valor_original`.
- Sin tasa: importe 0, aviso en la fila y el original en metadata.
- Sin moneda elegida: `currency` NULL y el trigger `trg_00_moneda_base_por_defecto`
  pone la base.

## Deduplicación (antes de crear, por organización)

1. **En el archivo**: la segunda fila con el mismo teléfono (E.164), NIT o
   correo se omite y apunta a la primera. (Dos negocios con el mismo correo no
   pueden ser dos fichas: `unique_customer_email_per_org`.)
2. **Contra la base** (`customers` de la organización, sin las fusionadas),
   por orden de precedencia: id externo del **mismo lote**, teléfono (el
   guardado se normaliza con `normalizePhoneDigits`, que entiende `+57 300…`,
   `300 123 4567`…), NIT (con o sin DV pegado) y correo (sin mayúsculas).
   Las consultas son prefiltros por expresión regular (`imatch`) en bloques de
   80; la decisión final se toma en memoria.
3. Decisión:
   - cliente existente **con lead abierto** → fila omitida (`lead_abierto`);
   - mismo id externo en el mismo lote → omitida (`ya_importado`);
   - cliente existente sin lead abierto → **solo se crea el lead**, ligado a
     esa ficha, que **no se modifica** (ni etiquetas, ni metadata, ni
     `do_not_call`);
   - si no, cliente nuevo + lead.

**Idempotencia**: reintentar un bloque (o el archivo entero) no duplica: lo ya
creado aparece como `ya_importado` o `lead_abierto`. Limitación conocida: dos
importaciones **simultáneas** del mismo archivo sin correo podrían duplicar
por teléfono (no hay índice único de teléfono); el correo sí lo protege la base.

## Cumplimiento: Registro de Números Excluidos (RNE, CRC)

Una lista de prospección comprada o armada con fuentes públicas **no está
verificada contra el RNE**, y en Colombia no se puede hacer una llamada
comercial a un número inscrito (Ley 2300 de 2023 para llamadas).

- Toda fila escrita queda con `metadata.importacion.rne = 'pendiente'` (en el
  cliente y en el lead) y la etiqueta `rne:pendiente`. Lo que diga la columna
  del archivo (`rne_crc`) se guarda como `rne_archivo`, **solo informativo**:
  una afirmación del archivo nunca da un número por verificado.
- Si el número ya está en la lista de excluidos de la organización
  (`crm_excluded_numbers`, que alimenta la verificación RNE de campañas o el
  alta manual), queda `rne = 'excluido'` con aviso. Se importa (el correo sigue
  siendo un canal), pero no se llamará.
- **Nunca** se pone `do_not_call=false` sobre un cliente existente: la ficha
  existente no se toca, y en las nuevas `do_not_call` conserva su DEFAULT
  (una importación no decide bajas; el RNE no es una baja voluntaria).

Cómo lo consume la compuerta de llamadas del agente de voz (modelo de la
migración `20260930140500_voz_ley2300_rne_politica_datos`):

1. **Campañas**: la cola no marca una campaña sin una verificación RNE vigente
   (`voice_campaign_rne_checks`, 30 días). Al verificar, se sube el archivo
   del RNE, sus números entran en `crm_excluded_numbers` y las llamadas
   pendientes de los objetivos inscritos se omiten. Por eso, **después de
   añadir leads importados a una campaña hay que volver a verificarla** contra
   el RNE aunque tenga una verificación vigente anterior.
2. **Cada marcación** (campaña o despacho puntual) comprueba
   `crm_excluded_numbers` (`numeroExcluido`) y `fn_can_contact` (bajas).
3. **Pendiente de integrar** (no se toca el agente de voz desde este cambio):
   el despacho puntual hoy no exige verificación RNE previa. La regla propuesta
   es rechazar la llamada si el cliente tiene `metadata.importacion.rne =
   'pendiente'` y la organización no tiene una verificación RNE posterior a
   `metadata.importacion.importado_en`; y, en campañas, que la verificación
   vigente sea posterior a la importación de cada objetivo.

## Pruebas

- `src/lib/crm/importacionLeads/__tests__/importacionLeads.test.ts`:
  autodetección (incluidas las cabeceras de la plantilla en 4 idiomas),
  teléfonos colombianos (móvil 3XX y fijo 60X) a E.164, NIT/DV, validación,
  duplicados en el archivo, mapeo a cliente y lead, vertical por sector,
  coincidencia con clientes existentes, cuerpo de la ruta, lectura del libro.
- `src/lib/services/crm/__tests__/leadsImportService.test.ts`: servicio sobre
  un doble de Supabase que aplica los filtros (señuelos de otra organización),
  crear/ligar/omitir/error, conversión de moneda, RNE, reversión e idempotencia.
- `src/app/api/crm/leads/importar/__tests__/leadsImportar.route.test.ts`:
  401, 403 por permiso, 403 por organización ajena (body y query), 400/413.

Datos siempre sintéticos: el repositorio es público.


## Cambio de modelo — CRM ola 1 (D2, 2026-09-29)

Desde la ola 1 del CRM **un lead ES un cliente** con `lifecycle_stage='lead'`.
La importación ya no crea `opportunities` con `record_type='lead'`:

- **crear**: ficha nueva en etapa lead con `lead_source='import'`, responsable
  por la asignación automática (`customers.owner_id`) y `metadata.lead`
  (`titulo`, `valor_estimado { monto, moneda }` con el valor anual ya resuelto
  a la moneda de la organización, e `importacion { lote, id_externo, fila,
  plan_probable, rne, valor_original }`). `metadata.importacion` de la ficha
  no cambia.
- **ligar**: la ficha existente se marca como lead —origen y responsable solo si
  faltan, y `metadata.lead`—; etiquetas, `do_not_call`, etapa y el resto de la
  metadata no se tocan.
- **omitir `lead_abierto`**: la ficha ya tiene origen de lead y no está
  descartada, o tiene una oportunidad 'lead' heredada abierta. Así reimportar
  el mismo archivo no vuelve a escribir.
- **Score (D3)**: `lead_score` e `icp_band` los calcula el servidor desde los
  perfiles ICP de la organización; sin perfiles, la prioridad A/B/C del archivo
  queda como banda de respaldo y el score en NULL.
- Deduplicación, RNE pendiente, moneda y pruebas se conservan. La oportunidad
  nace al «Calificar» el lead (`POST /api/crm/leads/[id]/qualify`).
