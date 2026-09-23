# Sistema de badges — manual de marca v2.0

Fecha: 2026-09-22 · Archivo Figma: «GO Admin — Sistema de diseño»
(`EAvjINVRnlzFM70GVoWXgl`), página `02 Componentes` → sección **Átomos**.

## Por qué existe este documento

Dos hechos lo obligan:

1. **Feedback del dueño (2026-09-22):** «ese badge me gustaría que fuera más
   manejado como estamos manejando la marca; el badge de la sucursal le diste un
   manejo muy minimalista, me gusta más el badge así colorido, la verdad quiero
   que esté más acorde a la marca o al manual de marca». El chip de sucursal que
   se añadió a la cabecera del POS era un texto de 11 px sobre una píldora fucsia
   de 20 px: ni se leía a un metro ni era de marca.
2. **La auditoría de Finanzas** (`AUDITORIA-CONTROLES-FINANZAS.md`, §J.2 y §L.4)
   encontró **≈38 mapas de estado distintos con ~140 variantes**, ninguno
   reutilizando a otro. Dos componentes **se llaman igual y son incompatibles**:
   `cuentas-por-cobrar/id/AccountStatusBadge.tsx` pinta «Pagada» en **azul** y
   `cuentas-por-pagar/id/AccountStatusBadge.tsx` la pinta en **verde**. En el
   listado de facturas «Borrador» es gris y en el detalle de la misma factura es
   amarillo; «Anulada» es roja en el listado y gris en el detalle.

Este documento define **una sola receta** y **una sola tabla estado → tono**.
No rediseña las 64 pantallas: fija el lenguaje con el que se irán migrando.

## 1. La receta

Un badge de GO Admin es siempre lo mismo, cambiando solo el tono:

1. **Fondo:** el tinte del tono (`brand/tint`, `state/*-subtle`, `bg/subtle`).
2. **Texto:** el profundo del mismo matiz (`brand/deep`, `state/*-text`,
   `text/secondary`). **Inter 600**, nunca mayúsculas sostenidas.
3. **Borde de 1 px opcional** (`border/brand · success · warning · danger · info`
   o `border/default`). Obligatorio en `Variant=suave` sobre fondos claros: sin
   él, los tintes al 50 grado se pierden sobre `bg/canvas`.
4. **Punto de color opcional** de 6 px (propiedad `Punto`) para listas donde el
   tono solo no basta (temperatura del CRM, estado de sincronización).
5. **Radio de píldora** (`radius/full`).
6. **Altura:** `Size=sm` 20 px (listas densas) · `Size=md` 24 px (cabeceras y
   tarjetas). El `BranchBadge` usa 24 y 28 px porque vive en una caja
   registradora y tiene que leerse de pie.
7. **Icono opcional del kit** (`Icono`), 11–12 px. Nunca un emoji en su lugar
   (hoy `SelectedProductsTable.tsx` pinta «📄 Manual»).

### Los tres `Variant`

| Variant | Cuándo |
|---|---|
| `suave` | Por defecto. El 90 % de los badges de la app. |
| `sólido` | Solo para el **estado dominante** de la pantalla: uno por fila o por tarjeta. Máxima presencia (Agotado, Crítico, la sucursal activa del POS). |
| `contorno` | Sobre fondos ya coloreados, o cuando hay dos badges juntos y uno debe ceder (Anulada frente a Vencida, Parcial frente a Pendiente). |

## 2. Tokens

Todos salen de `01 Sistema` → colección **Color** (modos Light/Dark). Ningún hex
suelto en el archivo.

### Existentes reutilizados

| Token | Light | Dark |
|---|---|---|
| `brand/tint` | `#EEF1FE` (blue/50) | `#151F54` (blue/900) |
| `brand/deep` | `#2A3EA8` (blue/700) | `#8FA3F5` (blue/300) |
| `brand/primary` | `#4361EE` (blue/500) | `#4361EE` |
| `brand/action` | `#3651D4` (blue/600) | `#4361EE` |
| `bg/subtle` | `#F1F5F9` (slate/100) | `#334155` (slate/700) |
| `bg/surface` | `#FFFFFF` | `#1E293B` (slate/800) |
| `text/secondary` | `#475569` (slate/600) | `#CBD5E1` (slate/300) |
| `text/on-brand` | `#FFFFFF` | `#FFFFFF` |
| `border/default` | `#E2E8F0` (slate/200) | `#334155` |
| `border/strong` | `#CBD5E1` (slate/300) | `#475569` |
| `state/*-subtle` · `state/*-text` · `state/*` | ver `01 Sistema` | ídem |

### Creados en esta tanda

| Token | Alias Light | Alias Dark | Scope | Code syntax |
|---|---|---|---|---|
| `border/brand` | blue/200 `#B9C5F9` | blue/700 | `STROKE_COLOR` | `var(--go-border-brand)` |
| `border/success` | green/300 `#86EFAC` | green/700 | `STROKE_COLOR` | `var(--go-border-success)` |
| `border/warning` | amber/300 `#FCD34D` | amber/700 | `STROKE_COLOR` | `var(--go-border-warning)` |
| `border/danger` | red/300 `#FCA5A5` | red/700 | `STROKE_COLOR` | `var(--go-border-danger)` |
| `border/info` | sky/300 `#7DD3FC` | sky/700 | `STROKE_COLOR` | `var(--go-border-info)` |
| `badge/solid-brand` | blue/500 `#4361EE` | blue/500 | fills | `var(--go-badge-solid-brand)` |
| `badge/solid-success` | green/700 `#15803D` | green/600 | fills | `var(--go-badge-solid-success)` |
| `badge/solid-warning` | amber/500 `#F59E0B` | amber/500 | fills | `var(--go-badge-solid-warning)` |
| `badge/solid-danger` | red/600 `#DC2626` | red/600 | fills | `var(--go-badge-solid-danger)` |
| `badge/solid-info` | sky/700 `#0369A1` | sky/700 | fills | `var(--go-badge-solid-info)` |
| `badge/solid-neutral` | slate/600 `#475569` | slate/500 | fills | `var(--go-badge-solid-neutral)` |
| `badge/on-solid` | white | white | `TEXT_FILL` | `var(--go-badge-on-solid)` |
| `badge/on-solid-warning` | slate/900 `#0F172A` | slate/900 | `TEXT_FILL` | `var(--go-badge-on-solid-warning)` |

`badge/on-solid-warning` existe porque el ámbar sólido con texto blanco no pasa
AA (2,2:1). Con tinta `#0F172A` da **8,31:1**.

Además se añadieron `spacing/2` y `spacing/6` a la colección **Spacing** para no
dejar rellenos ni separaciones sin token.

## 3. Componentes en Figma

### `Badge` — la escala (36 variantes)

`02 Componentes` → Átomos → `Badge`. **Es el mismo component set de siempre**: se
extendió, no se duplicó, así que las 780 instancias repartidas por las páginas
02, 04, 05, 06, 07 y 99 siguen apuntando a sus nodos originales (0 instancias
rotas verificadas).

- Ejes: `Tono` (marca · éxito · advertencia · peligro · información · neutro) ×
  `Variant` (suave · sólido · contorno) × `Size` (sm · md).
- Propiedades: `Icono` (boolean), `Texto` (text), `Punto` (boolean, nueva).
- Las 5 variantes anteriores (`Variant=brand|neutral|success|warning|danger`)
  pasaron a ser `Tono=…, Variant=suave, Size=md` y ganaron el borde de 1 px. Se
  conservó su texto original (`Ultimate`, `Básico`, `Activo`,
  `Prueba · 23 días`, `Vencido`) para no alterar instancias que no lo sobrescriben.
- Se añadió el tono **información**, que no existía.

### `BranchBadge` — el chip de sucursal (16 variantes)

`02 Componentes` → Átomos → `BranchBadge`.

- Ejes: `Scope` (una · todas) × `Tono` (marca · neutro) × `Size` (sm 24 px ·
  md 28 px) × `Estado` (default · interactivo).
- `Scope=una` → **Azul GO sólido** (`badge/solid-brand` + `badge/on-solid`,
  borde `brand/action`) con icono `Icon/Store`. Es el estado ruidoso a propósito:
  en una caja registradora, saber en qué sucursal se está vendiendo es lo primero.
- `Scope=todas` → **tinte de marca** (`brand/tint` + `brand/deep`, borde
  `border/brand`) con icono `Icon/Building2`.
- `Tono=neutro` → `bg/subtle` + `text/secondary` para barras densas donde el azul
  compite con otro control.
- `Estado=interactivo` añade el chevron; **solo** cuando el chip abre el selector
  de sucursal. En el POS de hoy el chip es de solo lectura (la sucursal se cambia
  desde el `BranchPicker` del `AppHeader`), así que todas las instancias del POS
  usan `default`.
- El nombre de la sucursal es la capa de texto `Nombre`: se edita directamente en
  la instancia. No se dejó como propiedad de texto del set porque Figma comparte
  un único valor de propiedad entre todas las variantes y eso obligaba a que
  `Scope=todas` mostrase «Sucursal Principal».

## 4. Tabla estado → tono

Ordenada por frecuencia. La columna «Hoy» resume lo que encontraron las auditorías
(`AUDITORIA-CONTROLES-FINANZAS.md`, `AUDITORIA-CONTROLES-CLIENTES-CRM.md`,
`AUDITORIA-CONTROLES-PRODUCTOS-POS.md`).

| Estado en pantalla | Tono · Variant | Dónde vive | Hoy |
|---|---|---|---|
| Borrador | neutro · suave | Facturas, cotizaciones, notas crédito, documentos soporte | Gris en el listado (`FacturasTable.tsx:77-102`) y **amarillo** en el detalle (`DetalleFactura.tsx:76-98`) |
| Emitida · Enviada · Recibida · Procesando | información · suave | Facturas, notas crédito, jobs DIAN | Azul en unas, **índigo** en `SupportDocumentsTable.tsx:44-56` y `JobsTable.tsx:69-77` |
| Pendiente · Por cobrar | advertencia · suave | Cartera, pagos, aprobaciones, comisiones, cuotas | Amarillo, con iconos distintos por pantalla (`Clock` vs `CalendarDays`) |
| Pago parcial · Parcial | advertencia · contorno | Cartera y cuotas | **Morado** en cuentas por pagar, **amarillo** en cuentas por cobrar |
| Pagada · Pagado · Completado · Cobrada | éxito · suave | Toda la vertical de finanzas | **Verde en pagar, azul en cobrar**: el conflicto que motivó esta escala |
| Al día · Activo · Activa · Aceptada · Ganada · Conectado | éxito · suave | Cartera, clientes, oportunidades, integraciones, cuentas bancarias | Verde, coherente |
| Vencida · Vencida (N d) · Rechazada · Fallido · Perdida · Error | peligro · suave | Cartera, DIAN, importaciones, oportunidades | Rojo; los días van en la misma etiqueta, no en un segundo badge |
| Anulada | peligro · contorno | Facturas, transferencias, notas crédito | Rojo en el listado y **gris** en el detalle. El contorno la separa de «Vencida» sin cambiar de matiz |
| Inactivo · Cerrado · Usado · Cancelado · Procesado · Desconocido | neutro · suave | Folios, saldos a favor, jobs, métodos de pago | Gris disperso (`secondary`, `outline`, `gris claro`) |
| Reembolsado · Convertida · Clawback | información · contorno | Pagos, cotizaciones, comisiones | **Morado**. El morado no está en el manual v2.0 |
| Crítico · Alta prioridad · Alto riesgo · Agotado | peligro · sólido | Recordatorios, aging, tarjeta de producto del POS | Rojo plano; el sólido marca que es el estado dominante |
| Urgente · Media prioridad · Riesgo medio · En espera | advertencia · suave | Aging, alertas, carritos en espera del POS | Ámbar/naranja mezclados |
| Baja prioridad · Riesgo bajo · Normal | información · suave | Aging, recordatorios | `AgingReport.tsx:108-115` tiene **«Riesgo Bajo» gris y «Bajo Riesgo» verde** para dos tramos distintos: dos etiquetas casi idénticas. Se unifican en una sola, en información |
| Todas las sucursales | marca · suave | `BranchBadge Scope=todas` | Azul (correcto, pero sin borde ni icono) |
| Sucursal concreta | marca · sólido | `BranchBadge Scope=una` | **Fucsia** (`pink/100` + `pink/700`) — fuera del manual |
| Plan («Ultimate», «Básico») | marca · suave | Cabecera, `PlanCard`, `PlanUsageMeter` | Azul, correcto |
| «Nuevo» | marca · contorno | Solo en Figma: marca lo que aún no existe en código | Componente `Marca/Nuevo` |
| Contador de filtros activos («3») | marca · sólido, sm | Botón de filtros, pestañas | Círculo azul, correcto |
| Pendiente de sincronizar | advertencia · contorno + punto | Modo Desktop/offline | Ámbar |
| Sin conexión | neutro · contorno + punto | Modo Desktop/offline | Gris |
| Empresa / Persona | información · suave / neutro · suave | Clientes (`ClientesTable.tsx:212-222`) | Azul / gris, correcto |
| Variantes («3 var.») · Personalizable | información · suave | Tarjeta de producto del POS | **Morado** y ámbar |
| Trazabilidad activa · Auto-generación · Garantía vigente | información · contorno | Pestaña de seriales | Son informativos, no estados: el contorno lo dice |
| Frío · Tibio · Caliente | información · advertencia · peligro, con punto | Temperatura del CRM | Punto de 10 px azul/ámbar/rojo; se conserva la lectura con el punto de la escala |
| Efectivo · Transferencia · Tarjeta · Cheque | neutro · contorno | Historial de pagos | Verde/azul/**morado**/naranja: son categorías, no estados, y no deben competir con el estado de la fila |
| «Confirmado» de ingresos y egresos | éxito · suave | `IngresoDetalle.tsx:148` · `EgresoDetalle.tsx:147` | Mismo literal, **verde en ingresos y rojo en egresos** |

### Regla dura

**Un estado = un tono en toda la app.** Si dos pantallas muestran el mismo
estado, muestran el mismo tono y la misma etiqueta. Cualquier excepción se
documenta aquí antes de dibujarla.

Corolarios:

- El número de días vencidos va dentro de la etiqueta («Vencida 12 d»), nunca en
  un segundo badge de otro color.
- Un badge de categoría (método de pago, tipo de cliente) nunca usa `sólido`: el
  sólido está reservado al estado.
- Como máximo **un badge sólido por fila o tarjeta**.

## 5. Contraste (AA ≥ 4,5:1, modo Light)

Calculado sobre los hex resueltos de cada token.

| Tono | suave | sólido | contorno |
|---|---|---|---|
| marca | **7,93** | **5,02** | **8,93** |
| éxito | **4,79** | **5,02** | **5,02** |
| advertencia | **4,84** | **8,31** | **5,02** |
| peligro | **5,91** | **4,83** | **6,47** |
| información | **5,57** | **5,93** | **5,93** |
| neutro | **6,92** | **7,58** | **7,58** |

`BranchBadge`: sucursal concreta **5,02** · todas las sucursales **7,93** ·
neutro **6,92**. Modo Dark, tono marca suave (`blue/300` sobre `blue/900`):
**6,44**.

Todas las combinaciones pasan AA para texto normal. Ninguna llega a AAA (7:1)
salvo marca suave, marca contorno y neutro, lo cual es esperable en una escala de
tintes: el requisito del proyecto es AA.

## 6. El fucsia queda fuera del manual

`src/components/inventario/BranchBadge.tsx:20-22` pinta la sucursal concreta con
`bg-fuchsia-100 text-fuchsia-700` (y su equivalente en modo oscuro). **El fucsia
no existe en el manual de marca v2.0** — que es Azul GO `#4361EE`, acción
`#3651D4`, profundo `#2A3EA8`, tinte `#EEF1FE`, tinta `#0F172A`, pizarra
`#475569`, fondo suave `#F8FAFF` e Inter 400–700. Entró como color «disponible en
Tailwind», no como decisión de marca.

Contraste del fucsia actual: 5,53:1 — pasa AA. El problema no es de
accesibilidad, es de identidad: el chip más visible de la cabecera del POS estaba
pintado con un color que la marca no usa en ningún otro sitio.

En Figma ya está sustituido. **En código no se tocó nada en esta tanda** (la tarea
era de diseño). El cambio pendiente es de una línea:

- `BranchBadge.tsx` — sustituir el par fucsia por el sólido de marca, añadir el
  icono de sucursal y subir el texto a 12 px semibold; quitar el prefijo
  «Sucursal:» porque el icono ya lo dice.
- Los mismos tokens ya existen como variables de Figma; en CSS corresponden a
  `--go-badge-solid-brand`, `--go-badge-on-solid` y `--go-brand-action`.

## 7. Dónde está aplicado en Figma

| Sitio | Qué se hizo |
|---|---|
| `05 POS y ventas` — 21 cabeceras «POS v2» de escritorio | El frame suelto `BranchBadge` («Sucursal:» + píldora fucsia de 20 px) se sustituyó por una instancia `Scope=una · Tono=marca · Size=md · Estado=default`. La cabecera pasó de 68 a 70 px. Una de ellas conserva «Todas las sucursales» y usa `Scope=todas`. |
| `05 POS y ventas` — 4 cabeceras «POS — cabecera» | No tenían chip de sucursal pese a que §B.4 de la auditoría dice que siempre está. Se les añadió la instancia; la cabecera se mantuvo en 68 px. |
| `02 Componentes` — `MobileHeader Mode=pos` | El `Chip de sucursal` de 9 px se sustituyó por una instancia `Size=sm`. Se eliminó el separador vacío que había a su derecha y el `OrgSwitcher` se ajustó de 130 a 118 px para que el nombre completo de la sucursal quepa sin truncar. El cambio se propaga a las 5 pantallas móviles del POS de la página 05 y a las de `99 Descartes`. |
| `04 Inventario`, `06 Clientes`, `07 Finanzas` | **No hay ningún `BranchBadge` dibujado en esas páginas.** El filtro de sucursal del inventario está como `Select` («Sucursal: todas») dentro del panel de filtros, y las cabeceras usan el `BranchPicker` del `AppHeader`. No había nada que sustituir. En código sí lo usan `CuentasPorCobrarPage.tsx:165` y `BancosPage.tsx:68`: cuando esas pantallas se dibujen, usan el componente nuevo. |

Capturas: `docs/design/figma/14-badges-escala.png`,
`14-badges-branchbadge.png`, `14-badges-tabla-tonos.png`,
`14-badges-pos-cabecera.png`, `14-badges-pos-movil.png`.

## 8. Verificación

- Solapes de frames de primer nivel en `02 Componentes`: **0**.
- Solapes dentro de la sección Átomos tras el reflujo: **0**.
- Instancias rotas en todo el archivo: **0** de 8.024 instancias (780 del set
  `Badge`, 26 del set `BranchBadge`).
- Contraste AA de las 18 combinaciones de la escala + las 3 del `BranchBadge`:
  **21 de 21 pasan**.

## 9. Qué falta

1. Migrar los ~38 mapas de estado del código a esta escala. Lo natural es un
   único `StatusBadge` parametrizado en `src/components/ui/`, alimentado por un
   diccionario `estado → tono` que viva en un solo archivo, y borrar los dos
   `AccountStatusBadge.tsx` incompatibles.
2. Actualizar `src/components/inventario/BranchBadge.tsx` (§6).
3. Decidir si el `BranchBadge` del POS debe volverse interactivo. Hoy no lo es y
   el diseño respeta eso, pero la variante `Estado=interactivo` ya existe por si
   se decide que desde el POS se pueda cambiar de sucursal.
