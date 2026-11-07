# Finanzas, ronda 2: del diseño al código

Fecha: 2026-11-07. El dueño aprobó pasar a código las 29 piezas de la sección de Figma
«36. Finanzas — pantallas que faltaban, ronda 2» (`EAvjINVRnlzFM70GVoWXgl`, nodo `2348:192664`).
Las capturas están en `docs/design/figma/82-finanzas-r2-NN-*.png` y son la fuente principal: el cupo
del MCP de Figma se agota con varios agentes a la vez.

## Reglas para todos los frentes

- Se trabaja en `main`, en un árbol que comparten otras sesiones. Sin ramas, sin `git stash`, sin
  `git checkout`/`reset` de archivos ajenos, sin commit ni push (los hace el coordinador).
- Kit de `@/components/kit` primero (ver `docs/implementacion/KIT-COMPARTIDO.md` y
  `docs/design/KIT-CODIGO.md`). Tokens semánticos: sin `dark:`, sin hex, sin `gray-*`. Móvil por
  debajo de `lg`.
- Cuatro idiomas con next-intl, namespace propio por frente. Los textos se fusionan **solo** con
  `node scripts/i18n-fusionar-namespace.js <namespace> <dir>`; nunca se editan a mano
  `messages/*.json`.
- Fechas y dinero según `CLAUDE.md`: `useFormatDate`, `formatPlainDate`, `crearFormateadorMoneda` con
  la moneda que llega o `useMonedaOrganizacion()`. Nunca `toISOString().split('T')[0]`.
- La organización sale de la sesión; los permisos se resuelven en el servidor.
- Base de datos: solo lectura por el MCP de Supabase para verificar tablas y columnas. Si un arreglo
  necesita migración, se deja el `.sql` en `supabase/migrations/` y su reversión en
  `supabase/rollbacks/`, **sin aplicarla**, y se reporta.
- Fuera de alcance: Wompi, Bold y otras pasarelas, checkout, autenticación, la contabilización de
  comisiones de PayFac (bruto, comisión y neto) y el asiento de propinas.
- Ninguna lógica de negocio se pierde: antes de reemplazar una pantalla se listan sus acciones
  actuales y cada una queda en la nueva o se reporta por qué no.

## Frentes y notas del diseño

| Frente | Piezas | Rutas | Capturas |
|---|---|---|---|
| A. Alertas y Conectar banco | A1–A6 | `/finanzas/bancos/anomalias`, `/finanzas/open-finance`, `/open-finance/consents` | 01–06 |
| B. Cobros y dispersiones, Cobros QR | A7–A12 | `/finanzas/payfac/*`, `/finanzas/metodos-pago`, `/metodos-pago/qr-sessions` | 07–12 |
| C. Monedas y tasas | M1–M5 | `/finanzas/monedas` | 13–17 |
| D. Reportes y presupuestos | C1–C4 | `/finanzas/reportes`, `/finanzas/presupuestos` | 18–21 |
| E. Activos, plantillas, egreso anulado | F1–F4, G2, G3 | `/finanzas/activos-fijos`, `/contabilidad/plantillas`, `/egresos/[id]`, `/ingresos/[id]` | 22–25, 27, 28 |
| F. Inicio y menú | G1 | `/finanzas`, `src/lib/navigation/catalog.ts` | 26, 29 |

Notas de cada pieza, copiadas de Figma:

- **A1 · Alertas.** Hoy `/bancos/anomalias`, sin enlace desde Bancos. Pasa a pestaña de Cuentas de
  dinero. «Resolver» hoy no guarda nada (`markAnomalyResolved` solo hace `console.log`): el diseño
  exige guardar autor, fecha y motivo.
- **A2 · Revisar.** «Es un duplicado» abre el anular movimiento ya diseñado (`DialogoMotivo`). Nunca
  borra.
- **A3 · Conectar banco.** Hoy `/open-finance` muestra nombres de variables de entorno al cliente.
  Eso va a la consola de la plataforma, no aquí.
- **A4 · Conectado.** «Sincronizar ahora» y «Refrescar saldos» se unen en un botón. Una cuenta del
  banco sin vincular no importa movimientos hasta elegir su cuenta en GO Admin.
- **A5 · Autorizaciones.** Hoy `/open-finance/consents`, sin regreso ni enlace. Renovar solo en las
  próximas a vencer (7 días o menos).
- **A6 · Revocar.** Motivo obligatorio, como hoy.
- **A7 · Dispersiones.** Hoy `/payfac/dispersiones` lee mal la respuesta de la API
  (`{success,data}`): los KPIs salen siempre en 0 y la tabla fallaría con datos. Arreglarlo antes de
  mostrar esta pantalla.
- **A8 · Detalle.** La contabilización de la comisión está fuera del alcance: se muestra, no se
  amplía sin orden.
- **A9 · Cuenta de abono.** Hoy `/payfac/cuentas` borra sin confirmar. El menú ⋯ pide confirmación y
  no deja borrar la única cuenta verificada con dispersiones pendientes.
- **A10 · Nueva cuenta.** Mismos campos que hoy. El titular debe coincidir con la organización.
- **A11 · Cobros QR.** Hoy `/metodos-pago/qr-sessions`, sin enlace en el menú. Pasa a pestaña de
  Métodos de pago. Hoy un error de carga se ve como «No hay sesiones QR»: el error debe tener su
  propio estado.
- **A12 · Editar método.** Hoy el formulario es una pestaña y «Eliminar» borra la configuración. Un
  método con pagos se desactiva, no se elimina.
- **M1 · Tasas.** Hoy la pestaña menciona un botón «Sincronizar Ahora» que no existe, y «Preferencias»
  repite la moneda base. Tres pestañas: Monedas, Tasas, Histórico.
- **M2 · Histórico.** «Exportar» ya descarga CSV: se conserva. La gráfica de 30 días va arriba de la
  tabla.
- **M3 · Agregar.** Reemplaza «Agregar Nueva Moneda» (buscador + select).
- **M4 · Tasa manual.** No recalcula documentos ya contabilizados.
- **M5 · Móvil.**
- **C1 · Reportes.** Hoy no está en el menú y sus 6 descargas son falsas (`handleExport` solo muestra
  un toast). El aviso amarillo del diseño es nota para desarrollo, no va en la pantalla.
- **C2 · Presupuestos.** Hoy no hay forma de agregar líneas (`upsertLine` existe y nadie lo llama),
  los estados salen en inglés (draft, approved) y borrar usa `confirm()` sin revisar permisos.
- **C3 · Nuevo.** Hoy solo pide nombre y año. «Empezar desde» (vacío, copia de otro presupuesto o
  real del año anterior) es propuesta.
- **C4 · Líneas.** Usa `budget_lines` (periodo 1–12). Un presupuesto aprobado no se edita: se crea
  una versión.
- **F1 · Activos.** Complementa «Activos fijos — depreciación» (sección 35). Columnas y botones como
  en el código; los KPIs son nuevos.
- **F2 · Nuevo activo.** Campos del código. Fecha, costo, residual y vida útil se bloquean tras la
  primera depreciación.
- **F3 · Plantillas.** Hoy no valida que débitos y créditos cuadren, y archivar no pide confirmación.
  El diseño muestra «Cuadra / No cuadra» y desactiva Guardar si no cuadra.
- **F4 · Usar.** Hoy fecha y sucursal están fuera, en la tarjeta; sin sucursal falla con «Elige la
  sucursal y la fecha del asiento».
- **G1 · Inicio.** Hoy `/app/finanzas` redirige a la primera página activa y seis «volver» apuntan
  ahí. Se construye la bandeja de pendientes.
- **G2 · Detalle anulado.** Hoy el detalle muestra «Confirmado» fijo aunque esté anulado, y
  «Exportar» baja un `.txt`. Aplica igual a Ingreso.
- **G3 · Vacío.** Texto actual de `messages/es.json`. «Depreciar» no se muestra sin activos.

## Estado

El coordinador añade aquí el resultado de cada frente: archivos, pruebas, lo que queda y
migraciones propuestas sin aplicar. Los frentes no editan este archivo.

### Cambios de alcance del dueño (2026-11-07)

- **C1 descartado:** Finanzas no tiene reportes propios. Todos los reportes van al módulo Reportes; ver
  `docs/implementacion/REPORTES-FINANZAS-CONSOLIDACION.md`. El menú de Finanzas ya no lista reportes y
  `src/lib/navigation/__tests__/reportesSoloEnReportes.test.ts` lo vigila.
- **G1 descartado:** no hay página de inicio de Finanzas. Sus pendientes van al módulo Finanzas del
  Inicio (Figma, página 03, «Inicio — pendientes de Finanzas en el módulo»), pendiente de aprobación.

### Resultado por frente (sin recorrido en el navegador con sesión real)

| Frente | Estado | Pruebas | Migración propuesta, **sin aplicar** |
|---|---|---|---|
| A. Alertas y Conectar banco | Pestaña Alertas en Bancos con revisión que guarda autor, fecha y motivo; Conectar banco con autorizaciones (renovar ≤ 7 días, también en el servidor) y revocar con motivo; sin nombres de variables de entorno | 62 | `20261107210000_revisiones_alertas_bancarias` (tabla `bank_alert_reviews`). Sin ella, «Marcar como revisada» queda deshabilitado con su motivo |
| B. Cobros y dispersiones, Cobros QR | Arreglados: lectura de `{success,data}` y nombres de campo; crear cuenta de abono (respondía 400); estado verificado. Pestañas Dispersiones / Cuenta de abono; QR como pestaña de Métodos de pago con estado de error propio; método con pagos se desactiva | 116 | `20261107220000_metodo_pago_con_pagos_no_se_borra` (trigger) |
| C. Monedas y tasas | Tres pestañas, agregar moneda, tasa manual, histórico con gráfica y CSV, móvil | 899 | `20261107180000_finanzas_tasa_manual`. Sin ella, la tasa manual no está disponible. Aun aplicada, facturas y contabilidad leen solo `currency_rates`: la manual no se usa en documentos hasta cambiar esos lectores |
| D. Presupuestos | Lista, nuevo (vacío o copia), editor de 12 meses con guardado por rutas del servidor y permisos; aprobado en solo lectura | 39 | Ninguna escrita. Falta RPC transaccional de guardado y cerrar la RLS de `budgets`/`budget_lines` (hoy cualquier miembro escribe directo) |
| E. Activos, plantillas, egreso | KPIs y vacío de activos; bloqueo tras la primera depreciación; plantillas con cuadre y archivar con confirmación; usar plantilla con fecha y sucursal; detalle de egreso/ingreso con estado real (anulado) | 109 | Ninguna |
| F. Menú | «Conectar banco» y «Cobros y dispersiones» en Tesorería, 4 idiomas | 1.018 | Ninguna |
| G. Reportes al módulo Reportes | 16 páginas redirigen a `/app/reportes/...`; informes auditados dentro del visor; nada recalculado | 1.594 | `PROPUESTA_NO_APLICAR_20261107_balance_general_corte_zona` (el balance de Reportes corta a medianoche UTC) |

### Migraciones aplicadas (2026-11-07, con orden del dueño)

Aplicadas por el MCP en `taqjemqjtumhwptchcxk`; verificado después de aplicar:

- `20261107180000_finanzas_tasa_manual`: columnas `created_by` y `reason`; la RPC sin permiso para
  `anon`; en `exchange_rates` solo quedan `exchange_rates_select_org` y la de service_role.
- `20261107210000_revisiones_alertas_bancarias`: tabla `bank_alert_reviews` con RLS (leer y dar de
  alta), sin acceso de `anon`.
- `20261107220000_metodo_pago_con_pagos_no_se_borra`: trigger activo en `organization_payment_methods`.
- `20261107230000_balance_general_corte_zona` (antes `PROPUESTA_NO_APLICAR_…`): org 338 al
  2026-11-07, con un miembro activo en una transacción revertida: activos 200.276, pasivos 85.024,
  resultado 115.252. Son las mismas cifras de la pantalla de Finanzas (antes: 188.040 / 84.131 / 103.909).

Siguen pendientes: la RPC transaccional y la RLS de presupuestos (frente D), y que facturas y
contabilidad lean la tasa manual (frente C).
