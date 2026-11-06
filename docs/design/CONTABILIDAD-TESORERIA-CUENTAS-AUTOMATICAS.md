# Contabilidad y tesorería: cuentas automáticas, plan de cuentas y pantallas faltantes

Fecha: 2026-11-06. Base del análisis: `main` en `2e8d44b4c` y base `taqjemqjtumhwptchcxk`.
Estado: **decisiones del Contador recibidas el 2026-11-06.** El plan de cuentas ya tiene base y pantalla (§4). Lo demás sigue como propuesta en Figma.

Figma: archivo `EAvjINVRnlzFM70GVoWXgl`, página `07 Finanzas`.

## 1. Lo que se encontró

### Cuentas por defecto

El motor ya resuelve la cuenta. Lo que falta es mostrarla.

Orden de resolución:

| Paso | Origen | Dónde está |
|---|---|---|
| 1 | Línea del documento | `invoice_items.cuenta_contable` |
| 2 | Producto | `products.cuenta_*` |
| 3 | Categoría | `categories.cuenta_*` |
| 4 | Sede | `configuracion_contable` con `branch_id` |
| 5 | Empresa | `configuracion_contable` sin sede |
| 6 | Sector | `fn_propuesta_configuracion_sector` |

Los pasos 1 a 3 los resuelve `fn_cuenta_catalogo_linea`, y los pasos 4 a 6, `fn_cuenta_por_clave`.

Medido el 2026-11-06:

| Dato | Valor |
|---|---|
| Empresas con configuración contable | 31 de 31 (868 filas) |
| Productos con cuenta propia | 0 de 44.098 |
| Categorías con cuenta propia | 0 de 1.324 |
| Líneas de factura con cuenta propia | 0 de 322 |
| Categorías de tesorería con cuenta sugerida | 1.178 de 1.240 |
| Configuraciones que apuntan a una cuenta de título | 0 |

La base se restauró el 2026-11-03, así que estos conteos no prueban cómo se usaba antes.

`CampoCuentaContable` es un `select` nativo con el texto «Sin cuenta propia». No dice qué cuenta
se va a usar. Ese es el problema de experiencia, no la falta de valores por defecto.

### Plan de cuentas

- El alta ya calcula el código con `siguienteCodigo` y hay un botón por fila, pero todo pasa por un diálogo.
- El selector de padre no tiene búsqueda.
- Cada guardado recarga la página completa con esqueleto.
- Al filtrar, el hijo se promueve a raíz y se pierde la ruta.
- `fn_puc_validar_cuenta` convierte el padre en título en silencio, aunque tenga saldo. El saldo queda
  en una cuenta que ya no recibe asientos.
- `puc_plantilla` solo trae 32 subcuentas y 12 auxiliares. No sirve aún para autocompletar nombres.

### Pantallas

Ninguna pantalla de contabilidad o tesorería está rediseñada por completo con el kit.
Faltaban en Figma las que se listan en §2.

Hay frames sin respaldo en el código:

- «Salud contable».
- «Movimientos» unificado y «Consignar».
- «Cuentas de dinero»: el título real es «Gestión Bancaria».

Hay botones que no hacen nada en código y no se dibujaron como funcionales:

- Importar en Ingresos y Egresos.
- Editar en el menú de fila de Ingresos y Egresos.
- Exportar en Bancos.
- Importar CSV y Exportar en movimientos de cuenta.
- Importar extracto en el detalle de cuenta.
- Editar cuenta bancaria.

## 2. Lo que se dibujó

47 frames en cuatro secciones nuevas de `07 Finanzas`, y una sección nueva en `02 Componentes`.

| Sección | Nodo | Frames |
|---|---|---|
| Plan de cuentas fácil | `2321:118203` | 10 |
| Cuentas automáticas | `2324:122696` | 12 |
| Contabilidad, pantallas que faltaban | `2327:125598` | 12 |
| Tesorería, pantallas que faltaban | `2328:128820` | 13 |

**Plan de cuentas:** listo, crear auxiliar en línea, varios seguidos, subcuenta que pasa a título, cuenta con saldo,
búsqueda con ruta, panel de más opciones, código ocupado y dos de móvil.

**Cuentas automáticas:** mapa de resolución, factura de venta, factura de compra, diálogo de cuenta de
la línea, producto cerrado y abierto, categoría, egreso, configuración por defecto, configuración por
categoría, proponer según el sector y reclasificar IVA.

**Contabilidad:** centros de costo, aplicar plantilla, nueva distribución, plantillas de asientos,
actualizar PUC, auxiliar por tercero, comprobante, cerrar ejercicio, generar períodos, situación
financiera NIIF, resultado integral y libro diario.

**Tesorería:** categorías, nueva categoría, reporte por categoría, conciliación (lista, nueva, emparejar,
extracto, sugerencias, cerrar), transferencias (lista, nueva, detalle) y cuenta bancaria sin PUC.

Componentes nuevos en `2317:39697`: `FilaPlanCuenta`, `CampoCuentaAutomatica`, `ChipCuenta`,
`ResumenCuentas` y `AtajosCreacionCuenta`.

## 3. Trabajo de backend que pide la propuesta

| # | Qué | Por qué |
|---|---|---|
| 1 | RPC de lectura «cuenta efectiva» por línea, producto o categoría: código, nombre y origen | Mostrar lo mismo que hará el asiento, sin duplicar lógica en el navegador |
| 2 | RPC que crea el auxiliar y traslada el saldo del padre con su asiento | **Hecho:** `fn_plan_crear_auxiliar` |
| 3 | Completar `puc_plantilla` con las subcuentas del Decreto 2650 | Autocompletar nombres |
| 4 | Heredar la cuenta de la categoría padre | Hoy `fn_cuenta_catalogo_linea` solo mira la categoría directa |
| 5 | Cuenta sugerida por proveedor en líneas manuales de compra | Decisión 3 |
| 6 | Verificar que un producto de tipo servicio use `ventas_servicios` | Sin verificar en este análisis |

Regla: cada RPC con su `.sql` y su reversión, según `docs/POLITICA-MIGRACIONES.md`, y textos en es/en/fr/pt.

## 4. Decisiones del Contador (2026-11-06)

| # | Decisión | Estado |
|---|---|---|
| 1 | En la misma fila solo se crean auxiliares de 8 dígitos, debajo de una subcuenta que ya exista. Se valida código y naturaleza, y queda registro de quién la creó | Programado |
| 2 | Si la subcuenta tiene saldo no se bloquea: se crea el auxiliar y se traslada con un asiento de reclasificación con fecha de hoy y una nota | Programado |
| 3 | La cuenta de una línea manual de compra se sugiere por compras anteriores a ese proveedor, siempre editable. La cuenta habitual por proveedor puede venir después | En Figma |
| 4 | Cerrar conciliación con diferencia exige motivo. La diferencia queda como partida conciliatoria pendiente y se guarda quién cerró. Nunca se ajusta sola contra resultados | En Figma. Falta columna de motivo y tabla de partidas |
| 5 | Transferencias sigue aparte. Un solo asiento entre dos cuentas 11, sin tocar el resultado | En Figma. Hoy el motor solo rechaza clases 4 y 5: falta exigir clase 11 |
| 6 | El resultado integral se presenta por naturaleza (NIIF para pymes 5.11). Por función, opcional más adelante | En Figma. Falta invertir la prioridad en código |

Efecto de la decisión 1: subcuentas y cuentas se crean con «Nueva cuenta». Hoy hay 5.088 cuentas y
1.547 subcuentas en la base, y ningún subauxiliar.

La comparación con la lista completa del Contador está en `CONTADOR-LISTA-COMPARACION-2026-11-06.md`.

## 5. Lo que no se dibujó

- Venta en consignación.
- Informes DIAN: 110, 210, 300, 350, exógena y certificados de retención.
- Cambios en el patrimonio, flujo de efectivo, notas y certificación. Están en los PR abiertos
  `Palomo-dev/go-admin-erp#463` y `Palomo-dev/go-admin-erp#460`; hay que revisar si se solapan.
- Tesorería consolidada y anomalías. Solo se llega desde Open Finance.
- Ingresos y Egresos como listas separadas, y Bancos con sus pestañas.
- Móvil de las pantallas de contabilidad y tesorería. Solo tiene móvil el plan de cuentas.
- Estados cargando, vacío, error y sin permiso de las pantallas nuevas.

Los importes y nombres de los frames son datos de ejemplo.
