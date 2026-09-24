# Kit compartido de POS, cajas, ventas, facturas, CxC y CxP

Fecha: 2026-09-24 · Fase 2 del rediseño aprobado («reutilizar mucho los componentes para que sean
los componentes de la marca: si se cambian en un lado, cambian en todos»). Respaldo previo:
etiqueta `backup/antes-rediseno-pos-finanzas-2026-09-24`.

Fuentes: `POS-PLAN.md` (§0.3, §3.2, §3.3), `CAJAS-VENTAS-PLAN.md` (§3.3), `FACTURAS-COMPRA-CXP-PLAN.md`
(§3.1, §5.4 D1 y D8), `FACTURAS-VENTA-CXC-PLAN.md` (§3.1), `docs/design/POS-UX-V2.md` §7.5 y
`docs/design/AUDITORIA-COHERENCIA-FIGMA.md` §7.1. El contrato detallado de cada pieza está en
`docs/design/KIT-CODIGO.md`, adenda «kit compartido de POS, cajas, ventas…».

## Reglas que cumple todo lo de aquí

- Vive en `src/components/kit/` (lo de documento, en `src/components/kit/documento/`: decisión del
  coordinador, que cierra la D1 de los planes de compras y de venta; **no** en `shared/`). Se
  importa de `@/components/kit`.
- Sin lógica de negocio ni Supabase: recibe importes, estados y listas ya calculados por los
  servicios o las RPC; los selectores reciben una función `buscar` que la pantalla implementa con
  su servicio. La lógica de presentación está en archivos `*Logica.ts` (o `teclas.ts`,
  `metodosPago.ts`, `motivo.ts`, `pago.ts`) sin React, con pruebas.
- Textos por props con respaldo en el namespace `kit` (es, en, fr, pt). Dinero con
  `crearFormateadorMoneda` sobre la moneda que llega (la del documento o la de la organización,
  `useMonedaOrganizacion()`); nunca pesos por defecto. Fechas: la pantalla las pasa formateadas
  con `useFormatDate` o como día `YYYY-MM-DD` de la organización.
- Tokens semánticos, sin `dark:`, hex ni `gray-*`. Móvil por debajo de `lg`.

## Lista única

«Lo usan» = pantallas que lo adoptan en sus planes. «Nombres en los planes» = cómo lo llamaba cada
uno (POS · CAJAS-VENTAS · COMPRAS-CXP · VENTA-CXC).

| Nombre final | Figma | Props clave | Variantes / estados | Lo usan | Nombres en los planes |
|---|---|---|---|---|---|
| `Kbd` | `Kbd` (Theme light · dark · on-brand × Length), sección «POS v2» | `tecla`, `tema`, `tamano` | claro · oscuro · marca; sm · md | POS (cabecera, carrito, cobro, post-venta, mapa F1), buscador global, `SearchInput`, chat | POS `Kbd` |
| `KbdButton` | `KbdButton` (primary · outline · ghost · destructive × sm · md · lg) | props de `button` + `variante`, `tamano`, `atajo`, `icono`, `cargando`, `anchoCompleto` | 5 variantes × 3 tamaños; cargando | POS (F9, F6, F7, F8, Ctrl+N), `ResultadoOperacion` | POS `KbdButton` |
| `useAtajos` (hook) | — | `useAtajos(atajos, { activo, hayRafaga })`; `resolverAtajo`, `agruparAtajos` | — | POS, cobro, post-venta, mapa F1 | POS `useAtajos` |
| `BotonImporte` | `CobrarButton` | `etiqueta`, `importe`, `atajo`, `estado`, `motivo`, `onClick` | listo · sinCaja · falta · procesando · deshabilitado | POS (Cobrar · F4, Completar venta), diálogo único de pago, «Pagar» de facturas y CxP | POS `BotonImporte` = Figma `CobrarButton` |
| `SeccionPlegable` | `CheckoutAccordion` (closed · open) | `titulo`, `resumen`, `icono`, `atajo`, `abierta`/`onAbiertaChange`, `deshabilitada` + `motivo` | cerrada · abierta · deshabilitada | cobro del POS (Entrega, Propina, Comisión, FE), formularios largos | POS `SeccionPlegable` = `CheckoutAccordion` |
| `FilaDato` + `ListaDatos` | `FilaDato` `680:406357` | `etiqueta`, `valor`, `tono`, `sangria`, `descripcion`, `accesorio`, `oculto`, `tamano`, `href` | 6 tonos; oculto (cierre ciego) | todo detalle: caja, venta, factura, CxC, CxP, arqueo, post-venta, resumen | POS y CAJAS-VENTAS `FilaDato` (el POS decía «si Ventas lo crea primero, se usa el suyo»: es uno) |
| `Tarjeta` | `Tarjeta` `680:406329` | `titulo`, `icono`, `accion`, `tono`, `sinRelleno`, `pie` | 5 tonos | detalles de caja, venta, factura, CxC, CxP, devolución, proveedor | CAJAS-VENTAS `Tarjeta` |
| `KpiCompacto` | `KpiCompacto` `680:406370` | `cifras: { etiqueta, valor, tono?, href?, onClick? }[]` | cargando | ventas, CxC y pedidos en móvil | CAJAS-VENTAS y VENTA-CXC `KpiCompacto` |
| `ResumenTotales` | «Resumen de totales» de `Carrito (listo)` y del cobro | `subtotal`, `impuestos`, `descuentos`, `cargos`, `total`, `retenciones`, `neto`, `moneda`, `cabecera`, `extras` | normal · cargando · sin impuestos configurados · impuestos incluidos | carrito y cobro del POS, cierre de caja, base de `DocumentoTotales` | POS `ResumenTotales`; el `DocumentTotals` de compras y venta **se apoya en él** (no hay dos bloques de totales) |
| `ViewToggle` | `ViewToggle` `103:3095` | `valor`, `onValorChange`, `opciones` (2), `corte`, `modoMovil` | escritorio/tableta: dos iconos; celular: **un botón que alterna** (variante `modoMovil="alternar"`, por defecto) | POS (Tarjetas \| Lista), mesas (Plano \| Cuadrícula), catálogo de productos | POS `ViewToggle`. CAJAS-VENTAS, COMPRAS-CXP (D8) y VENTA-CXC dicen «no se crea» para documentos: los listados siguen `DataTable` (tabla ≥ lg, `ListCard` < lg). Se construye una vez para el POS y mesas |
| `ChipDocumento` | `ChipDocumento` `680:406423` (+ `729:18827…18863`) | `tipo`, `numero`, `href`/`onClick`, `anulado` | 17 tipos | columna «Documentos» de ventas y CxC, enlaces de un detalle | CAJAS-VENTAS `ChipDocumento` (en `shared/documentos/`, ahora en el kit) |
| `CadenaDocumento` | `CadenaDocumento` `680:409052` + `EslabonDocumento` `680:408881` | `eslabones: { tipo, numero, estado?, fecha?, importe?, href?, actual?, pendiente?, accion? }[]`, `ordenar` | actual · pendiente (punteado con acción) | detalle de venta, devolución, CxC, CxP, factura, pedido, OC | CAJAS-VENTAS `CadenaDocumento`; COMPRAS-CXP y VENTA-CXC `EnlacesDocumento` (**se unifican**: la cadena cubre los enlaces del documento; `RelatedLinkCard` sigue para enlaces sueltos) |
| `DialogoMotivo` | «Anular venta» `331:54986` | `titulo`, `textoConfirmar`, `onConfirmar(motivo)`, `consecuencias`, `motivosRapidos`, `bloqueo`, `error` | normal · bloqueado (con salida alternativa en `children`) · cargando | anular venta, factura, pago, devolución, movimiento; cerrar caja ajena; ajustar saldo | CAJAS-VENTAS `DialogoMotivo`; COMPRAS-CXP `AnularDocumentoDialog` (**es el mismo**) |
| `SelectorMetodoPago` | botones de método de `247:69830` | `metodos` (**los de la organización**), `valor`, `onValorChange`, `maxBotones`, `atajos` | N botones + «Otro ▾»; método deshabilitado con motivo | cobro del POS, mesas, diálogo único de pago | POS `SelectorMetodoPago` |
| `ListaPagos` | lista de pagos de `247:69830` | `pagos`, `moneda`, `onQuitar`, `onGenerarQr`, `resumen` | vacía · con pagos · QR pendiente/procesando/cubierto/error | cobro del POS (pago mixto) | POS `ListaPagos` |
| `ResultadoOperacion` | post-venta `247:74846`, `247:75030`, `250:83088` | `tono`, `titulo`, `referencia`, `cifras`, `aviso`, `primaria`, `secundarias`, `onCerrar` | éxito · pendiente de sincronizar · error | post-venta del POS, cierre de caja, cobro de CxC, pago registrado | POS `ResultadoOperacion` |
| `SelectorEntidad` (base) → `CustomerPicker`, `SupplierPicker` | `CustomerPicker` `849:558484…`; `SupplierPicker` (`02 › Finanzas`) | `valor`, `buscar(texto, AbortSignal)`, `onCambiar`, `onQuitar`, `onCrear`, `onVer`, `onEditar`, `layout` (`fila` · `campo`), `atajo`, `grupoExtra` | vacío · buscando · sin resultados · error · crear; popover (≥ lg) · hoja (< lg) | cliente: POS, nueva venta, factura de venta, filtros de ventas, facturas y CxC, mesas, PMS · proveedor: factura de compra, OC, DS, lotes, filtro | POS y VENTA-CXC `CustomerPicker` (en `kit/`, no `shared/`); COMPRAS-CXP `SupplierPicker` (en `kit/`, no `kit/documento/`: comparte base con el de cliente) |
| `DocumentoCabecera` | `DocumentHeader` (detalle · formulario × desktop · mobile) | `variante`, `tipo`, `titulo`, `subtitulo`, `estado`, `insignias`, `acciones`, `volverA`, `debajo` | detalle · formulario · cargando | facturas de venta y compra, CxC, CxP, NC, DS, OC | COMPRAS-CXP y VENTA-CXC `DocumentHeader` |
| `DocumentoLineas` | `DocumentLinesTable` (lectura · edición · recepción × table · cards) | `lineas`, `modo`, `moneda`, `onCambiar`, `onQuitar`, `accionesLinea`, `ocultar`, `pie` | 3 modos × tabla/tarjetas; línea con error del servidor | facturas, NC, cotización, recepción de OC | COMPRAS-CXP y VENTA-CXC `DocumentLinesTable` |
| `DocumentoTotales` | `DocumentTotals` (venta · compra · cotización) | lo de `ResumenTotales` + `variante`, `pagado`, `saldo`, `sinTarjeta` | venta · compra · cotización · cargando | facturas, CxC, CxP, NC, cotización | COMPRAS-CXP y VENTA-CXC `DocumentTotals` (+ `documentoTotales.ts`: su parte de presentación es `resumenTotalesLogica.ts`; **el cálculo sigue en el servicio**) |
| `RegistrarPagoDialog` (esqueleto) | `RegistrarPagoDialog` `730:20644` (factura · cuenta · tercero), P1…P9 y M1 de `741:53717` | `destino`, `documento`, `moneda`, `metodos`, `hoy`, `onConfirmar(ValorPago)`, `avisoCaja`, `reparto`, `camposExtra` | 3 destinos; efectivo con cambio; sin caja (P6); errores del servidor | factura de venta y compra, CxC, CxP, ficha del cliente, CxC del POS, «Registrar cobro» del detalle de venta | los cuatro planes: `RegistrarPagoDialog` (+ `RepartoPago`, que entra por la ranura `reparto`) |

## Lo que ya existía y se extendió (aditivo, usos actuales intactos)

| Pieza | Cambio | Pedido por |
|---|---|---|
| `StatusBadge` / `estadoTono.ts` | «En cola» (`queued`), «Por recibir», «Pendiente de pago», «Al día» (`current`, 532 filas de `accounts_receivable` que salían en inglés), «Devuelta» y «Devuelta parcial» (`returned`, `partially returned`), «No aplica», «Castigada» (`written off`). Primero en `SISTEMA-BADGES.md` §4 | CAJAS-VENTAS paso 4, COMPRAS-CXP §3.4, VENTA-CXC §3.1 y §3.4 |
| `PanelAdaptable` | `ancho={1120}` | POS paso 11 (cobro) |
| `SearchInput` | el «/» se pinta con `Kbd` y se anuncia con `aria-keyshortcuts` | POS paso 2 |
| `DataTable`, `Dialogo`, `FormField`, `CampoNumero`, `SegmentedControl`, `PageHeader`, `RelatedLinkCard` | sin cambios: las piezas nuevas se montan sobre ellos (`DocumentoLineas` sobre `DataTable`, `DialogoMotivo` sobre `Dialogo`, `ViewToggle` sobre `SegmentedControl`, `DocumentoCabecera` sobre `PageHeader`) | — |

`<kbd>` hechos a mano sustituidos por `Kbd`: `kit/SearchInput.tsx`, `shell/header/AppHeader.tsx`,
`app-layout/Header/GlobalSearch.tsx`, `chat/inbox/SearchPanel.tsx`, `chat/inbox/SearchInConversation.tsx`.
**Queda** `pos/cajas/listado/CajasPage.tsx:369` (pantalla de cajas: lo cambia su agente al rediseñarla).

## Duplicados resueltos

1. `DialogoMotivo` (cajas-ventas) = `AnularDocumentoDialog` (compras) → `DialogoMotivo`.
2. `EnlacesDocumento` (compras, venta-CxC) = `CadenaDocumento` (cajas-ventas) → `CadenaDocumento`;
   `RelatedLinkCard` para un enlace suelto.
3. `DocumentTotals` / `documentoTotales.ts` (compras) y `ResumenTotales` (POS) → `DocumentoTotales`
   compone `ResumenTotales`; una sola lógica de filas (`resumenTotalesLogica.ts`).
4. `CustomerPicker` (POS, `kit/`) · `CustomerPicker` (cajas-ventas, `shared/`) · `SupplierPicker`
   (compras, `kit/documento/`) → una base `SelectorEntidad<T>` y dos envolturas en `kit/`.
5. `FilaDato` del POS y de ventas → uno.
6. `DocumentStatusBadge` → no se crea: `StatusBadge` ampliado.
7. Ubicación `shared/documentos/` y `shared/pagos/` (cajas-ventas) frente a `kit/documento/`
   (compras) → `kit/documento/`.
8. `CobrarButton` (Figma) = `BotonImporte`; `CheckoutAccordion` (Figma) = `SeccionPlegable`.

## Pendientes (no construidos en esta fase)

| Pieza | Por qué | Quién |
|---|---|---|
| `CartTag`, `CartLine`, `ProductCard` (pos · movil-tarjeta · movil-lista), `CategoryBar` | Del POS y de mesas; dependen de la extracción de lógica del paso 1 de POS-PLAN (`CartLine` no calcula, recibe lo que devuelvan `useCobro`/`TaxSummary`). Contrato en POS-PLAN §3.3 | agente del POS, en `kit/` |
| `HistorialDocumento`, `BandaAntiguedad` (+ `antiguedad.ts`), `PlanCuotas`, `EstadoCuentaDialog`, `RepartoPago` | Piden datos y reglas del dominio (cartera, cuotas, reparto FIFO) que aún no tienen route handler; `RepartoPago` entra por la ranura `reparto` del diálogo de pago | agentes de compras-CxP y venta-CxC, en `kit/documento/` |
| `Aviso` (banda con acciones), `ConteoEfectivo`, `ConteoPorMetodo`, `ResumenArqueo`, `MovimientoCajaForm`, `EfectoEnCaja` | Del dominio de cajas (`pos/cajas/…` según su plan); `ResumenArqueo` usa `FilaDato` | agente de cajas |
| `SeleccionLineasNota`, `DianPanel` | Propios de venta-CxC; `SeleccionLineasNota` se compone con `DocumentoLineas` | agente de venta-CxC |
| Conexión real del pago | `fn_registrar_pago` / `POST /api/pagos` no existen: el diálogo es esqueleto | agentes de venta-CxC y compras-CxP |

## Decisiones pendientes del dueño

- **D9 de POS-PLAN**: añadir `@testing-library/react` + `jest-environment-jsdom` (solo para
  archivos que lo pidan con docblock). Hoy el repo corre jest en `node` y no las tiene; **no se
  instalaron**. Las pruebas del kit cubren la lógica de presentación, no el render.
- Iconos nuevos para conceptos que CATALOGO-ICONOS §2 no tenía (se usan en `ICONO_DOCUMENTO` y en
  `SelectorMetodoPago`): pago `CircleDollarSign`, recibo `ScrollText`, devolución `Undo2`, nota
  crédito `FileMinus`, nota débito `FilePlus`, documento soporte `FileCheck`, entrada a inventario
  `PackagePlus`, asiento `BookOpen`, cotización `Calculator`; método de pago sin icono propio
  `WalletCards`. Conviene anotarlos en el catálogo y en Figma.
- Ids de component set de Figma sin leer (cupo del MCP agotado): `Kbd`, `KbdButton`, `CobrarButton`,
  `CheckoutAccordion`, `DocumentHeader`, `DocumentLinesTable`, `DocumentTotals`, `SupplierPicker`.
  Las medidas salen de las capturas y de los planes; revisar con `get_metadata` cuando vuelva el cupo.

## Verificación de esta fase

- `npx jest src/components/kit src/__tests__/i18n/traduccionesModulos.test.ts src/__tests__/guardrails.test.ts`:
  pruebas del kit (`documentoYMotivo`, `teclado`, `datosYTotales`, `pagosYDocumento`,
  `selectoresYVista` + las anteriores) y las traducciones de `kit` en 4 idiomas en verde.
- `tsc` con más memoria: 0 errores en los archivos del kit y en los cinco archivos donde cambió el
  `<kbd>`.
- `eslint src/components/kit` y los archivos tocados: limpio.
- Navegador: sin página de muestra (no hay patrón en el repo para una) y sin sesión iniciada en el
  preview: la verificación visual queda para cuando cada pantalla adopte las piezas.
