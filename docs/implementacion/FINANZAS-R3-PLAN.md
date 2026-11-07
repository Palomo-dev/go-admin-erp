# Finanzas, ronda 3: lo que falta del diseño, en código

Fecha: 2026-11-07. El dueño ordenó construir todo lo que el inventario
(`docs/implementacion/FINANZAS-INVENTARIO-PANTALLAS.md`) marca como «Interfaz vieja», «Parcial» o «No existe»
en Contabilidad, Tesorería y Documentos. Los diseños están en Figma, archivo `EAvjINVRnlzFM70GVoWXgl`,
página «07 Finanzas» (`264:98915`). Los ids de cada frame están abajo, por frente.

## Decisiones del dueño (2026-11-07)

1. **Mayor contable = página de trabajo + reporte.** En Contabilidad vive la página «Mayor contable»
   (frames `990:75517` listo, `990:76399` sin cuenta, `993:79250` móvil): se elige una cuenta, se ven sus
   movimientos con saldo corrido, se filtra por tercero, sucursal y centro, y cada línea abre su asiento.
   En Reportes sigue el reporte (exportar, programar, cierres). **Las dos leen la misma función**: nada de
   cálculo duplicado. Se quita la redirección de `/app/finanzas/contabilidad/mayor-contable` y la página
   vuelve al menú. El test `reportesSoloEnReportes.test.ts` se ajusta y documenta la excepción.
   El libro diario de trabajo es «Asientos» (Contabilidad v2 lo llama «Libro diario»). El libro diario
   como informe, el auxiliar, el balance de prueba, el balance general y los estados siguen solo en Reportes.
2. **Tesorería es el título del grupo del menú, no una página.** Ingresos y egresos pasan a una sola
   pantalla, **Movimientos** (frames Tesorería v2 `1000:*`, `1004:*`, `1006:*`). Las rutas viejas de lista
   (`/finanzas/ingresos`, `/finanzas/egresos`) redirigen a Movimientos con su filtro; sus detalles (`/[id]`)
   se conservan. La «Tesorería consolidada» vieja (`/finanzas/bancos/tesoreria`) se rehace como pestaña o
   resumen de Cuentas de dinero según el mapa `1009:86249`.
3. **Salud contable es la página** (frames `987:*`) con pestañas Pendientes · Descuadres · Huérfanos ·
   Estructura. La bandeja de «Pendientes contables» ya hecha es su primera pestaña; su ruta redirige.
4. **Al cambiar una página se limpia todo lo que la nombra**: menú (`src/lib/navigation/catalog.ts`),
   textos del menú en los 4 idiomas, módulos y rutas por plan (`organization_modules`,
   `moduleManagementService.ts`), permisos por ruta, buscador global y comandos, accesos del asistente
   (`src/lib/ai/**`), enlaces internos (`grep` de la ruta vieja en `src/`), migas y botones «volver», y
   redirecciones en el servidor para las URL viejas. Nada de enlaces rotos.
5. **No puede dejar de funcionar nada.** Antes de reemplazar una pantalla se listan todas sus acciones
   actuales (crear, editar, anular, exportar, filtros, permisos) y cada una queda en la nueva o se reporta.
   Los servicios y RPC se reutilizan; si se cambian, es para corregir un error y con prueba.
6. Fuera de esta ronda: pasarelas (Wompi, Bold y demás), checkout, autenticación, comisiones de PayFac,
   asiento de propinas. El tributario, las consignaciones, el dinero de terceros y los anticipos necesitan
   tablas nuevas: van en la ronda 4, con migraciones propuestas que el dueño aprueba antes de aplicarlas.

## Reglas para todos los frentes

- `main`, árbol compartido con otras sesiones: sin ramas, sin `git stash`, sin checkout/reset de archivos
  ajenos, **sin commit ni push** (los hace el coordinador). `catalog.ts` y `messages/*.json` los tocan
  varios frentes: ediciones pequeñas y releer antes de editar.
- Kit `@/components/kit` primero (`docs/implementacion/KIT-COMPARTIDO.md`, `docs/design/KIT-CODIGO.md`).
  Tokens semánticos: sin `dark:`, sin hex, sin `gray-*`. Móvil por debajo de `lg`.
- Cuatro idiomas con next-intl, namespace propio por frente; fusión **solo** con
  `node scripts/i18n-fusionar-namespace.js <namespace> <dir>`.
- Fechas y dinero según `CLAUDE.md` (`useFormatDate`, `formatPlainDate`, moneda de la organización).
- La organización sale de la sesión; los permisos se resuelven en el servidor. Mutaciones de dinero y
  asientos por route handler o RPC transaccional existentes.
- Base de datos: solo lectura por el MCP para verificar. Si algo necesita migración, `.sql` en
  `supabase/migrations/` + reversión en `supabase/rollbacks/`, **sin aplicar**, y se reporta.
- **Figma:** el cupo del MCP es compartido entre frentes. Antes de pedir una captura, busca si ya está en
  `docs/design/figma/`. Pide solo los frames que vas a construir, de uno en uno, con `get_screenshot`
  (sin base64; descarga la URL con `curl` a `docs/design/figma/86-<frente>-<nombre>.png`). Si da tiempo de
  espera, reintenta más tarde; no en ráfaga.
- Pruebas jest de la lógica nueva y de caracterización de lo que se reemplaza. `tsc` con
  `NODE_OPTIONS=--max-old-space-size=14336`: línea base 34 errores; no se suma ninguno. No correr `next build`.

## Frentes

| Frente | Alcance | Frames (Figma) |
|---|---|---|
| T · Tesorería | Movimientos (lista, nuevo ingreso/egreso, consignar caja a banco, sin caja abierta, anular, detalle), Cuentas de dinero (lista, cierre ciego, vacío, móvil), nueva cuenta bancaria, detalle de cuenta bancaria, cuenta sin cuenta contable, conciliación (lista, nueva, emparejar, extracto, sugerencias, cerrar, cerrada con partida pendiente, partidas anteriores), transferencias (lista, nueva, detalle), tesorería consolidada | `1000:79670`…`1009:86249`, `2328:130232`…`2329:132244`, `2334:133112`, `2334:133705`, `2335:142203`, `2335:142791`, móviles `2335:143611`, `2335:143784` |
| C · Contabilidad | Inicio de Contabilidad, Asientos/libro diario (lista, filtros, estados, nuevo asiento, revertir, detalle en todas sus variantes), Mayor contable (página), Salud contable, períodos (año, cerrar, reabrir, generar, cerrar ejercicio), actualizar PUC, centros de costo, comprobante, reglas contables (vista previa) | `981:62898`…`993:79844`, `1485:117655`, `2327:125607`…`2327:128337`, `2333:132937`…`2333:134802` |
| D · Documentos | Cotizaciones, documento soporte, notas crédito y débito, saldos a favor y anticipos de clientes, bandeja DIAN, resoluciones, facturación electrónica como servicio (lado del cliente) | `739:*`, `736:*`, `738:*`, `735:*`, `733:*`, `1018:*`…`1023:*` (sin los `Plataforma /`) |

La consola de la plataforma para facturación electrónica (`1019:91055`, `1019:91458`) va en `go-admin-super`,
en una ronda aparte. Integraciones (ya aprobado en Figma, sección 8 de la página «10 Configuración») va en su
propio frente después de esta ronda, con la regla de no tocar cómo las pasarelas leen sus credenciales.

## Corrección del dueño (2026-11-07, después de ver las capturas)

- **Mayor contable:** aprobado tal cual el Figma (`990:75517`, `990:76399`, `993:79250`; capturas
  `docs/design/figma/87-mayor-contable-figma-*.png`). Se aplica la decisión 1.
- **Ingresos, egresos y movimientos: las tres páginas.** Reemplaza la decisión 2: «Movimientos» (Tesorería
  v2) es la vista unificada, e «Ingresos» y «Egresos» se quedan como páginas propias en sus rutas, rediseñadas
  según la propuesta del 6 nov (`2335:142791`, captura `87-ingresos-figma-propuesta-6nov-lista.png`; Egresos es
  su espejo). No se redirigen. Las tres leen el mismo servicio.
- **Egresos:** la lista se diseñó en Figma el 2026-11-07 (frame `2386:721`, captura
  `87-egresos-figma-propuesta-7nov-lista.png`) y el dueño la aprobó.
- La fusión en «Movimientos» anotada como «decisión del dueño (2026-09-23)» en
  `docs/design/FINANZAS-TESORERIA-FIGMA.md` el dueño no la recuerda: no se toma como decisión; manda lo de esta
  sección.

## Estado

El coordinador añade aquí el resultado de cada frente.

### Frente T · Tesorería (2026-11-07)

**Piezas compartidas** (`src/components/finanzas/tesoreria/compartido/`, requisito «todo comparte componentes»):
`ListaTesoreria` (una sola lista para Movimientos, Ingresos y Egresos: `vista="movimientos" | "ingresos" | "egresos"`;
misma fila, KPIs, búsqueda, anular con `DialogoMotivo`, duplicar, exportar), `formularios.ts` (el único
`FormularioMovimientoTesoreria` y el único `DetalleMovimientoTesoreria`, con el tipo como variante),
`NuevaTransferenciaDialogo`, `ConsignarCajaDialogo`, `useCajasDinero`, `MovimientoTipoBadge`,
`EfectoEnCuentaTarjeta`, `CuentaDineroCard`. Lógica sin React en `src/lib/finanzas/tesoreria/`
(`movimientosLista`, `cuentasDinero`, `efectoEnCuenta`, `consignacion`, `rutas`). Prueba
`src/__tests__/finanzas/tesoreriaCompartido.test.ts`: las tres páginas montan la misma lista y nadie importa
otra copia del formulario o del detalle.

**Pantallas**
- Movimientos (nueva, `/app/finanzas/tesoreria/movimientos`): pestañas Todos · Entradas · Salidas · Traslados
  (`?tipo=`), KPIs del mes con el día de la organización, «Nuevo ▾» ingreso · egreso · traslado · consignar caja a banco.
- Ingresos y Egresos (rutas de siempre, sin redirección): la misma lista con el tipo fijado y su «Nuevo ingreso/egreso»
  (formulario de siempre: la categoría trae la cuenta y la variante de pago de impuesto). Detalles `/[id]` intactos.
- Cuentas de dinero (`/tesoreria/cuentas`): cajas abiertas (efectivo esperado del servidor, cierre ciego = «Oculto»,
  vencidas > 24 h con «Cerrar con arqueo») + bancos, KPIs, pestañas Cuentas · Posición (la tesorería consolidada, ahora
  con errores visibles) · Alertas (la de la ronda 2). Nueva cuenta bancaria en panel (`?nueva=1`), también editar.
- Cuenta bancaria (`/tesoreria/cuentas/[id]`): Movimientos (saldo corrido, filtro pendientes/conciliados) ·
  Conciliaciones · Datos (asignar cuenta contable si falta), movimiento manual con «Efecto en la cuenta» (bloquea si
  deja el banco en negativo), transferir, sincronizar Open Finance, activar/desactivar.
- Conciliación: lista nueva con el kit, nueva conciliación con el kit (`?cuenta=`), detalle con `PageHeader`, `TabBar`
  (Emparejar · Extracto · Sugerencias) y `Tarjeta` en lugar de `ui/tabs` y `Card`. Cierre y partidas: los de la ronda 2.
- Transferencias (`/tesoreria/transferencias`, sigue aparte por la decisión 5 del Contador): lista, detalle y diálogo
  nuevos con el kit.

**Rutas viejas → nuevas (redirección en el servidor, conservan filtros):** `/bancos` (y `?tab=`) → Cuentas de dinero o
Conciliación; `/bancos/tesoreria` → `?tab=posicion`; `/bancos/anomalias` → `?tab=alertas`; `/bancos/cuentas/nuevo` →
`?nueva=1`; `/bancos/cuentas/[id]` (`?edit=true` → `?tab=datos`) y `/[id]/movimientos`; `/conciliacion-bancaria`,
`/nuevo`, `/[id]`; `/transferencias`, `/[id]`. `/app/finanzas/tesoreria` → Movimientos.

**Navegación:** menú (`catalog.ts`) según el mapa; textos `nav.paginas` en 4 idiomas (se quitan `finanzas_bancos` y
`finanzas_transferencias`); enlaces internos corregidos (Inicio/pendientes de Finanzas, Conectar banco, métodos de
pago, partidas, categorías, reportes de contabilidad y finanzas). Asistente y buscador no nombraban estas rutas;
`middleware` y planes las cubren por el prefijo `/app/finanzas`. Namespace i18n `finanzasTesoreriaR3` (504 claves × 4).

**Migración propuesta, SIN aplicar:** `supabase/migrations/20261108010000_tesoreria_consignacion_caja_banco.sql`
(+ rollback): `fn_consignacion_caja_banco` (egreso de caja por `pos_caja_registrar_movimiento` sin asiento propio +
ingreso bancario con un solo asiento 1110 D / 1105 C, comisión a 5305; idempotente; `finance.create`) y
`consignacionBanco` como concepto omitido en `fn_asiento_movimiento_caja`. Hasta aplicarla, `POST
/api/tesoreria/consignaciones` responde 501 y el diálogo lo explica.

**Pendiente:** el formulario de alta de ingreso/egreso sigue con campos `ui/*` y sin «Efecto en la cuenta» ni
selector de cuenta de dinero (es la pieza compartida; rehacerla toca a las tres páginas a la vez); cadena turno →
movimiento → asiento → conciliación en el detalle; KPI «Por conciliar» de Movimientos (la lista no trae el estado
bancario); pestaña «Extractos» de la cuenta y fecha de corte del saldo inicial (no hay columna); proyección de
Posición como lista, no gráfica; `AIMatchingPanel` e `ImportarExtracto` siguen por dentro con su interfaz; nada se
recorrió en el navegador con sesión real.

### Frente D · Documentos (2026-11-08)

Hecho en cinco subfrentes sobre el kit y en el servidor; sin commit. Namespace i18n `finanzasDocumentosR3` con
subclaves `cotizaciones`, `soporte`, `notas`, `saldos`, `bandeja`, `servicio` y `resoluciones` (4 idiomas). Ninguna
pantalla se recorrió en el navegador con sesión real. La emisión ante la DIAN no cambió: `colaFacturacion.server.ts`,
`payloadsFactus.ts`, `process-pending`, el cron y el webhook quedan intactos.

**Cotizaciones** (`/finanzas/cotizaciones`, `/nuevo`, `/[id]`, `/[id]/editar`, sin cambios de URL):
`cotizaciones/listado/ListadoCotizaciones.tsx` (4 KPI que filtran, periodo, filtros, acción rápida por fila, CSV,
móvil y tableta), `id/DetalleCotizacion.tsx` (acciones por estado, cadena Oportunidad → Cotización → Factura,
historial desde `email_messages`), `detalle/ConvertirCotizacionDialog.tsx` (nace en borrador, IVA por tarifa),
`formulario/FormularioCotizacion.tsx` (piezas del formulario v2 de factura, un impuesto por línea como guarda
`quotation_items`) y el genérico `finanzas/documento/EnviarDocumentoDialog.tsx` (`EnviarFacturaDialog` queda como
envoltura). Listado por `GET /api/cotizaciones?vista=listado`; sin `vista`, la ruta responde como antes. Se conservan
todas las acciones; la vencida ofrece «Duplicar con vigencia desde hoy» en vez de «Convertir» porque la RPC la
rechaza. El CRM (`WonCloseModal`, `cotizacionesService`) no se tocó.

**Documento soporte** (`/finanzas/documentos-soporte`, `/nuevo`, `/[id]` y nueva `/[id]/editar`):
`ListadoDocumentosSoporte.tsx`, `FormularioDocumentoSoporte.tsx`, `DetalleDocumentoSoporte.tsx`; servidor en
`lib/finanzas/soporte/`, `lib/services/soporte/documentosSoporte.server.ts` y `/api/documentos-soporte/**`. El
envío sigue por `POST /api/factus/support-document`. **Crear no funcionaba antes y no funciona hasta aplicar la
migración** (el CHECK de `invoice_items` no admite `support_document`; las líneas fallaban siempre): mientras tanto,
guardar responde 503 con mensaje claro. Pendiente: «Registrar pago» y retención del frame (sin modelo de datos).

**Notas crédito y débito** (`/finanzas/notas-credito` con pestañas `?tipo=debito`, `/notas-credito/[id]`, nueva
`/notas-debito/[id]`; `/notas-debito` redirige en el servidor a la pestaña Débito): `notas/ListadoNotas.tsx`
(`GET /api/notas`), `ElegirFacturaNotaDialog.tsx` (factura buscada en el servidor → el mismo
`NotaCreditoVentaDialog`), `DetalleNota.tsx`, anular por `fn_nota_credito_anular` (bloqueado si la DIAN aceptó, con
salida «Emitir nota débito»), `NotaDebitoDialog.tsx` y «⋯ › Nueva nota débito» en el detalle de la factura. Las rutas
de nota débito responden 501 `nota_debito_no_disponible` hasta aplicar la migración y la UI dice «pendiente de
activación». Pendiente: envío de la ND a la DIAN (cola y `factus/debit-note` siguen sin ND), PDF `nota-debito` en el
motor, ND en la cadena de la factura y «Enviar por correo» de notas (no hay ruta).

**Saldos a favor y anticipos** (`/finanzas/saldos-a-favor`, detalle en hoja `?saldo=<id>`, filtro `?cliente=<id>`):
`ListadoSaldosAFavor.tsx`, `DetalleSaldoPanel.tsx`, `AplicarSaldoDialog.tsx`, `DevolverSaldoDialog.tsx`,
`RegistrarAnticipoDialog.tsx` y anular con `DialogoMotivo`; mismas RPC de dinero; lecturas nuevas
`GET /api/saldos-a-favor/listado` y `/[id]`. Devolver y anular ya existían en el servidor y no tenían botón. El KPI
«Saldo a favor» de la cartera del cliente enlaza al listado filtrado (solo desde Finanzas, no desde el POS). Sigue
en el grupo «Tesorería», al lado de Cuentas por cobrar (no existe grupo «Cartera»; crearlo es del frente T).
Pendiente: comprobante de egreso de la devolución y enlace al asiento en la hoja.

**Bandeja DIAN, resoluciones y servicio**: bandeja en `facturacion-electronica/bandeja/{BandejaEnvios,
DetalleEnvioPanel}.tsx` (KPI y retenidos en el servidor, pestañas Todos · Por atender · Aceptados, RADIAN visible y
deshabilitada «fase 2», lote «Enviar retenidos con la fecha de hoy», detalle `?envio=<id>` sin JSON crudo ni nombre del
proveedor); `GET /api/factus/jobs` ampliada de forma aditiva, nuevas `jobs/resumen`, `jobs/[id]`, `/api/factus/rangos`;
`config` `liberar` admite `jobIds[]` (máx. 50). Servicio (`ConfiguracionServicioFE.tsx`, pendiente y activo con los
pasos para activar) y Resoluciones y numeración (`FacturacionConfigPanel.tsx` + `RangoEditDialog.tsx`) siguen en
Configuración › Facturación, sin pantalla duplicada. Cambio a revisar: editar un rango exige administrador o
`finance.approve` (antes bastaba ser miembro y movía el rango a la sucursal del navegador). Quitados: enlace a la
documentación del proveedor y el JSON crudo. Pendiente: interruptor «Enviar PDF y XML al cliente» (sin preferencia
en el servidor) y «Pedir envío al activar» (columna nueva).

**Navegación:** `catalog.ts` (Cotizaciones con `Calculator`, «Notas crédito y débito» con `FileMinus`),
`nav.paginas.finanzas_notas-credito` y `configuracionUnificada.secciones.facturacionResumen` («Resoluciones y
numeración») en 4 idiomas; `finanzasDocumentosR3` en `traduccionesModulos.test.ts`. Ninguna URL vieja cambió: no hacen
falta redirecciones nuevas en `next.config.js`. Visibilidad por plan y cargo: cubiertas por el prefijo `/app/finanzas`
y `paginaActiva` (sin lista cableada). Asistente y buscador no nombraban rutas que cambiaran. El detalle
`/notas-debito/[id]` no resalta ninguna entrada del menú (no hay mecanismo de alias en `rutaActiva`).
Componentes viejos borrados por no tener importadores: cotizaciones (6), documentos soporte (6), notas crédito (3),
saldos a favor (3), bandeja y configuración de FE (8). Quedan sin uso los namespaces `saldosAFavor` y `notasCredito`.

**Migraciones propuestas, SIN aplicar** (cada una con su rollback):
- `20261108020000_documento_soporte_guardar.sql`: amplía los CHECK de `invoice_items` a `support_document` (**hace
  `DROP CONSTRAINT` de los viejos tras validar el nuevo, que es superconjunto: requiere aprobación**), RLS de lectura de
  esas líneas, único (organización, referencia), `fn_documento_soporte_referencia` y `fn_documento_soporte_guardar`.
- `20261108030000_nota_debito.sql`: `fn_nota_debito_emitir` (idempotente, `finance.create`, numeración `debit_note`,
  impuesto resuelto en el servidor; cartera y asiento por los disparadores existentes), `fn_nota_debito_anular`
  (`finance.void`; bloquea si la DIAN aceptó, está en envío o tiene pagos) y una línea de `fn_registrar_pago` para
  admitir `debit_note`. Prueba en seco escrita, no ejecutada.
- `20261108061000_fe_solicitud_activacion.sql`: tabla `einvoicing_activation_requests` y `fn_fe_solicitar_activacion`
  (`finance.approve` o `admin.full_access`: confirmar que los roles de administrador tengan ese código). Hasta
  aplicarla, «Solicitar activación» sale deshabilitado con su motivo.

**Verificación:** jest de los cinco subfrentes, navegación, configuración, `detalleMovil` e i18n: 1.450 de 1.451 (el
fallo es `filtrar.test.ts`, que espera «Asientos» y el frente C renombró la página «Libro diario»). Guardrails: 206 de
208; los 2 fallos son de otros frentes (fixtures del CRM, regla 36, y Pedidos online, Paquete E).
`tsc` completo con 14 GB: 35 errores. Ninguno es del frente D: 33 son de `.next-desktop/types/validator.ts`, un
artefacto viejo del 2026-09-19; uno está en `useConfiguracionState.ts`, que no se tocó y ya estaba en la línea base, y
el otro en `ContabilidadHomePage.tsx`, del frente C, que es el que pasa la línea base de 34 a 35.

#### Frente T · segunda tanda (2026-11-07, tras aplicar el coordinador la migración de consignación)

- **Consignar caja a banco activo**: `POST /api/tesoreria/consignaciones` (`withOrg` → `getServerOrgContext`,
  `readOrgBody`, `finance.create`, lista blanca) llama a `fn_consignacion_caja_banco`; el id idempotente se genera al
  abrir el diálogo; errores traducidos (`tesoreria.errores.*` y `finanzasTesoreriaR3.consignar.errores.*`). Se quitó el
  aviso de «no activo». Lo abren Movimientos («Nuevo ▾») y las tarjetas de caja en Cuentas de dinero.
- **Formulario único de ingreso/egreso rehecho con el kit** (`FormularioMovimientoTesoreria`, sigue siendo UNA pieza y
  la lista monta UNA sola instancia con el tipo como variante): `Dialogo` de dos columnas, Ingreso · Egreso · Traslado
  (solo en Movimientos), selector de cuenta de dinero (la caja abierta de la sucursal primero; otras cajas deshabilitadas
  con su motivo; bancos), aviso «sin caja abierta» con «Abrir caja» / «Usar un banco», «Efecto en la cuenta» (esperado
  de la caja con cierre ciego del servidor), superar el disponible bloquea en bancos y avisa en caja («Registrar egreso
  de todos modos»), vista previa del asiento. Conserva categoría → cuenta, pago de impuesto (pasivo), tercero, centro o
  distribución y soporte. Lógica del selector: `src/lib/finanzas/tesoreria/cuentaDineroSelector.ts`.
- **Cadena del dinero** en el detalle de ingreso/egreso (`CadenaDocumento`): turno de caja → movimiento → asiento →
  conciliación (banco) o consignación pendiente (caja). Lectura `movimientosService.getCadena`; armado en
  `cadenaMovimiento.ts`.
- **KPI «Por conciliar»** en Movimientos (movimientos bancarios sin conciliar, importe y bancos) y columna Conciliación.
- **Pestaña «Extractos»** en la cuenta bancaria (`extractos_bancarios` + `extracto_lineas`): archivo, fecha, líneas,
  pendientes, entradas/salidas; abre su conciliación.
- **Migración propuesta, SIN aplicar**: `supabase/migrations/20261108020000_bank_accounts_fecha_saldo_inicial.sql`
  (+ rollback): columna NULL-able `bank_accounts.initial_balance_date` (fecha de corte del saldo inicial). El panel de
  nueva cuenta la pedirá cuando exista.
- Sigue pendiente: Posición con gráfica; `AIMatchingPanel` e `ImportarExtracto` por dentro con su interfaz; recorrido en
  el navegador con sesión real.

### Frente C · Contabilidad (2026-11-08)

Sin commit. Namespace `finanzasContabilidadR3` (subclaves `comun`, `inicio`, `asientos`, `detalle`, `mayor`, `salud`,
`periodos`, `puc`, `centros`, `reglas`, `comprobante`; 723 claves × 4), registrado en `traduccionesModulos.test.ts`.
Piezas de dominio en `src/components/finanzas/contabilidad/piezas/` (`OrigenAsiento`, `MarcaReversion`,
`EstadoPeriodo`, `BarraCuadre`, `TablaContable`) y lógica sin React en `src/lib/finanzas/contabilidad/`
(`origenAsiento`, `cuadre`, `asientosLogica`, `mayorLogica`, `saludLogica`, `periodosLogica`, `inicioContabilidadLogica`,
`vistaPreviaRegla`). Ninguna pantalla se recorrió en el navegador con sesión real; no se publicó ni revirtió ningún asiento.

**Pantallas**
- Inicio (`ContabilidadHomePage.tsx`): banda de pendientes y descuadres hacia Salud, KPIs del mes (sin contra-asientos),
  periodo actual y meses sin cerrar, Informes y Configuración con todos los accesos de antes. Sale la tarjeta de folios
  del PMS (leía todos los folios) y el KPI «Publicados» (contaba 1.000 filas).
- Libro diario (`asientos/AsientosPage.tsx`, `NuevoAsientoDialog.tsx`): paginado en el servidor, filtros (rango, origen
  por grupo, estado —también `?estado=borrador`—, cuenta, sucursal, ocultar pares), CSV. Alta con sucursal obligatoria,
  aviso de periodo cerrado, `BarraCuadre`, «Guardar borrador» y «Publicar» (`p_publicar`), mismas validaciones de antes.
  La lista deja de filtrar por la sucursal del header: muestra la organización y la sucursal es un filtro.
- Detalle y revertir (`AsientoDetailPage.tsx`, `RevertirAsientoDialog.tsx`): acciones por tipo, «Duplicar» solo en
  manuales (antes duplicaba automáticos), reversa con `DialogoMotivo` y `ResultadoOperacion` (misma reversa idempotente),
  «no encontrado» con pantalla propia, descartar con confirmación del kit.
- Mayor contable (decisión 1): `/contabilidad/mayor-contable` deja de redirigir y vuelve al menú. Una sola pieza
  (`MayorContablePage.tsx`) para la página y para el reporte «Mayor por cuenta» del visor de Reportes; las dos leen
  `ReportesContablesService.getLedger`, ampliada de forma aditiva (filtros opcionales de sucursal, tercero y centro;
  descripción, documento y tercero por línea). Arranca sin cuenta («Elige una cuenta»); `?cuenta=` la abre. Excepción
  documentada en `reportesSoloEnReportes.test.ts`; `consolidacionFinanzas.test.ts` ajustado.
- Salud contable (decisión 3, `/contabilidad/salud`, `?pestana=`): Pendientes (la bandeja existente, incrustada) ·
  Descuadres · Huérfanos · Estructura (cuentas agrupadoras con movimiento y reglas a cuentas de título o inexistentes).
  `/contabilidad/pendientes` redirige en el servidor a la primera pestaña; `/pendientes/[id]` sigue igual.
- Periodos (`PeriodosFiscalesPage.tsx`, `DialogosPeriodo.tsx`): rejilla del año, cerrar con checklist, reabrir con
  motivo, generar y cerrar ejercicio, móvil; mismas RPC (`fn_cierre_periodo`, `fn_reabrir_periodo`, `fn_cierre_ejercicio`).
  `/finanzas/periodos-contables` redirige en el servidor a `/contabilidad/periodos-fiscales`.
- Actualizar PUC, Centros de costo (árbol, plantilla con vista previa, distribución), Reglas (DataTable y vista previa
  del asiento con cuadra · agrupadora · inexistente · sin datos) y Comprobante (formato del Figma) con el kit.

**Navegación:** `catalog.ts` («Libro diario», «Mayor contable», «Salud contable» en lugar de «Pendientes contables»,
«Periodos contables», «Centros de costo»), `nav.paginas` en 4 idiomas, `moduleConfig.ts`, enlaces a pendientes
(Inicio de Finanzas, alertas, flujo de efectivo, detalle de pendiente) hacia Salud, migas y «volver». Buscador y
asistente leen el catálogo; planes y permisos por ruta cubiertos por el prefijo `/app/finanzas`.

**Migraciones propuestas, SIN aplicar** (con rollback): `20261108045500_libro_diario_trabajo.sql`
(`fn_libro_diario_trabajo`, invoker: ocultar pares exacto, importe y marca en una lectura) y
`20261108070000_salud_contable.sql` (`fn_salud_contable`, definer con guarda y `finance.view`, sin `anon`: descuadres
documento ↔ asiento y huérfanos). Hasta aplicarla, Descuadres y Huérfanos dicen «pendiente de activar», nunca cero.

**Pendiente:** BK-3 (mayor paginado en el servidor; hoy 400 líneas con aviso y saldo inicial «no aplica» con filtros);
permisos BK-13 (`fn_puc_migracion_aplicar/_revertir` y centros sin permiso propio); el cierre no valida el cuadre en la
base (solo en pantalla); cartera libro ≠ documentos en Salud (`v_salud_contable` es solo `service_role`); vista previa
de regla con el último documento real; comprobante por el motor de documentos; código muerto
`src/components/finanzas/periodos-contables/*`.
