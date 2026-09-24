# POS — plan de implementación del rediseño de la pantalla principal (análisis, 2026-09-24)

Encargo del dueño: construir en código el rediseño del POS que está en Figma, con los componentes nuevos del kit
(reutilizados al máximo: si cambian en un lado, cambian en todos), en 4 idiomas, «completamente funcional, que no
rompa nada». Este documento es la **fase de análisis**: no se tocó código, ni base de datos, ni se hizo commit.
Respaldo previo ya creado: etiqueta local `backup/antes-rediseno-pos-finanzas-2026-09-24`.

Alcance: `/app/pos` (cabecera y caja, buscador y grilla, categorías, carrito y líneas, varios carritos / espera /
deuda, cliente, cobro con todos sus pasos y medios, propina, factura electrónica, post-venta, recibo e impresión,
pantalla del cliente, modo sin conexión de Desktop, atajos, escáner, variantes / modificadores / seriales /
recetas) en escritorio, tablet y móvil, y los tickets / recibos / etiquetas que salen del POS.
Fuera de alcance: mesas y reservas (diseño sin aprobar), cajas, ventas, facturas, CxC, CxP (otros agentes).

Fuentes leídas: `CLAUDE.md`, `docs/design/KIT-CODIGO.md`, `POS-UX-V2.md` (con la decisión final de §7.5),
`POS-PARIDAD-PANTALLA-PRINCIPAL.md` (matriz de 185 filas), `POS-CARRITO-LINEAS-NOTAS.md` (§7 y §8),
`POS-CARGOS-SERVICIO-EN-VENTAS.md`, `POS-AUTORIZACION-SUPERVISOR.md`, `POS-VENTAS-DEVOLUCIONES-CXC-PEDIDOS.md`,
`DOCUMENTOS-PDF.md`, `AUDITORIA-COHERENCIA-FIGMA.md`, capturas `11-pos-v2-*`, `13-*`, `59-*`, `60-*`, `65-*`, y el
código de `main` al commit `24b2b5d7`. BD `jgmgphmzusbluqhuqihj` solo con `SELECT` (conteos). No se usó el MCP de
Figma: los node id vienen de los documentos de diseño.

Abreviaturas: **P** `src/app/app/pos/page.tsx` · **PS** `src/components/pos/ProductSearch.tsx` · **CV**
`CartView.tsx` · **CT** `CartTabs.tsx` · **TS** `TaxSummary.tsx` · **CS** `CustomerSelector.tsx` · **CD**
`CheckoutDialog.tsx` · **CFB** `CategoryFilterBar.tsx` · **VSD** `VariantSelectorDialog.tsx` · **SVC**
`src/lib/services/posService.ts`. Los números de línea son del 2026-09-24; `posService.ts` y `CheckoutDialog.tsx`
los va a mover el agente del cobro (§0.2).

---

## 0. Resumen

### 0.1 En cinco líneas

1. El POS de hoy es una página de 837 líneas (P) con cuatro componentes grandes (PS 1.082, CV 1.517, CD 2.697,
   SVC 3.023) y casi todo el texto en español fijo: solo `posNotasLinea`, `posCocina` y `header` están traducidos.
2. La lógica que no se puede perder vive en **SVC** (carritos en `localStorage`, totales, promociones, deuda,
   cobro por `pos_checkout_v1`), **CD** (totales del cobro, propina, QR, seriales, stock de recetas, FE,
   impresión, pantalla del cliente) y en `src/lib/pos/**` + `src/lib/offline/**` (ya probados).
3. El rediseño **no cambia contratos de datos**: cambia cómo se ve y se opera. Por eso el plan extrae primero la
   lógica de los componentes a hooks y funciones puras con pruebas, y luego cambia la piel por partes.
4. Hay **~345 aserciones de pruebas que leen el texto fuente** de `CheckoutDialog.tsx`, `CartView.tsx`,
   `TaxSummary.tsx` y `page.tsx` (20 archivos de prueba). Partir esos archivos sin tratarlas rompe la suite: es el
   riesgo técnico número uno (§5 R1).
5. Cargos de servicio y autorización de supervisor **no entran en esta entrega** (§5 D6): les falta todo el
   backend. Se dejan los huecos (fila del resumen, acordeón, acción de la línea) previstos en los componentes.

### 0.2 Trabajo en curso que este plan respeta

Un agente está cambiando la lógica del cobro: `posService`, `pos_checkout_v1`, `CheckoutDialog`, `pedidosService`,
`VentasService` (mesas por la RPC, `sale_id` idempotente, precios y descuentos validados en el servidor, flete en la
factura, deuda y anulación por RPC, carritos por sucursal). **Hoy (2026-09-24) esos archivos no tienen cambios sin
commitear** (`git status`): su trabajo aún no ha aterrizado. La implementación de la UI arranca cuando termine, y el
**paso 0** del plan (§4) es releer sus contratos. Contratos que este plan asume y que hay que verificar en ese paso:

| Contrato esperado tras el agente del cobro | Hoy | Consecuencia para la UI |
|---|---|---|
| `saleId` generado **al abrir** el cobro en todas las plataformas y reutilizado en reintentos (BE3) | Solo en Desktop, al pulsar (CD:1166) | El botón «Completar venta» puede reintentar sin miedo a duplicar: la UI no necesita bloquear más allá de `isProcessing` |
| La RPC valida precio y descuento de cada línea y devuelve errores con código | Solo pertenencia; el precio y el descuento los calcula el navegador (SVC:1720-1903) | La UI debe mostrar el error del servidor en la línea afectada (estado nuevo de `CartLine`: «precio cambió») |
| Deuda (`holdCartWithDebt`, SVC:1339) y anulación (`cancelDebtWithCreditNote`, SVC:2681) por RPC | Inserts sueltos desde el navegador | Los botones «Deuda», «Cobrar deuda», «Anular» llaman al mismo método del servicio; la UI no cambia de contrato |
| Mesas pagan por la RPC (`onProcessPayment` de `mesas/[id]/page.tsx:1804` deja de hacer N llamadas) | Segunda implementación | `CheckoutDialog` conserva la prop `onProcessPayment` (la usan mesas y `ventas/nuevo`) |
| Carritos por sucursal (`getActiveCarts` filtra por `branch_id`) | Devuelve todos los de la organización (SVC:912-924) | La cabecera y las pestañas muestran solo los de la sucursal; el cambio de sucursal deja de «arrastrar» carritos |
| Flete en la factura | El flete suma al total pero no es línea | Solo afecta a la fila «Flete» del cobro, que ya existe |

Regla para no pisarse (memoria «sesiones paralelas»): reemplazos puntuales en `posService.ts` y
`CheckoutDialog.tsx`; nunca `git stash` del árbol; nunca commitear un archivo que importe otro sin commitear.

#### Contratos reales (paso 0, releídos el 2026-09-24 sobre `263f05b9`)

El agente del cobro terminó (`af968eda`, `8b3de787`, `c92e25d8`, `f79eeed2`, `3a3a99fa`, `86194915`, `263f05b9`;
detalle en `docs/design/POS-COBRO-SERVIDOR.md`). Lo que la UI puede dar por hecho:

| Contrato | Dónde | Consecuencia para la UI (se aplica en los pasos indicados) |
|---|---|---|
| Intento de cobro (id + fecha) creado al primer clic de «Completar venta» y reutilizado en los reintentos de esa apertura; viaja como `CheckoutData.attemptId` | `CheckoutDialog` (`af968eda`), `intentoCobroDialogo.test.ts` | El botón puede reintentar sin duplicar; el estado sigue siendo `isProcessing`. Paso 11 no toca esa lógica |
| `pos_checkout_v1` valida precio vigente, modificadores, descuento ≤ línea y coherencia; errores con código (`precio_no_coincide`, `descuento_excede_linea`, …) traducidos por `mensajeErrorCobro` (`src/lib/pos/erroresCobro.ts`, namespace `posCobroServidor`) | `8b3de787` | El error del servidor se muestra con `mensajeErrorCobro`; no hay estado de línea «precio cambió» todavía (el servidor no dice qué línea): queda para cuando la RPC lo devuelva |
| Producto sin precio vigente ⇒ `ProductoSinPrecioError` (`causa: 'sin_precio' \| 'consulta'`), nunca entra gratis | `c92e25d8`, `src/lib/pos/precioVigente.ts` | La página lo dice con `posCobroServidor.productoSinPrecio` / `precioNoConsultado`. L6 se fija con este contrato (no «precio 0 entra a $ 0») |
| Flete como línea de la factura | `f79eeed2` (solo servidor) | Ninguna: la fila «Flete» del cobro sigue igual |
| Deuda por `pos_checkout_v1` modo `debt` (cliente obligatorio, sin caja, idempotente por `debt_attempt_id`); cobro de deuda modo `settle`; anulación por `pos_anular_venta_v1(sale_id, motivo)` con permiso `pos.void` en el servidor | `3a3a99fa`; `POSService.holdCartWithDebt`, `cancelDebtWithCreditNote(cartId, motivo?)` | «Anular» pide motivo con `DialogoMotivo` (≥ 3 caracteres, el servidor lo exige) y muestra el aviso `factura_electronica_sin_nota_credito_dian` si llega |
| Carritos por sucursal: `getActiveCarts(branchId)` filtra; las mutaciones guardan la lista completa | `86194915`, `carritosPorSucursal.test.ts` | Contadores y pestañas = carritos de la sucursal (la página ya pasa `selectedBranchId`) |
| Mesa cobra con `POSService.checkout` modo `settle`; `CheckoutDialog` conserva `onProcessPayment` | `263f05b9`, `mesas/[id]/page.tsx` | API pública de `CheckoutDialog` intacta (`cart, open, onOpenChange, onCheckoutComplete, onProcessPayment, …`) |

Línea base del paso 0: `npx jest` completo = 630 suites, 4-9 fallos **ajenos al POS** y variables según lo que
otras sesiones tengan a medio escribir (`sectionContract` 2, `f6Adversarial` 1, `shiftAssignmentsTrigger` 6, y a
ratos el guardarraíl 16 de otra zona, que pasa aislado). Suites del POS, cobro, pantalla del cliente, kit, offline,
i18n y guardarraíles: 225 suites / 4.541 pruebas en verde. Sin sesión en el preview (redirige a `/auth/login`):
las capturas «antes/después» no se pudieron tomar; la red de seguridad visual son las pruebas de render
(Testing Library + jsdom, D9, instaladas en este paso) y la verificación en navegador queda para el dueño.

### 0.3 Componentes nuevos del kit (detalle en §3.3)

Compartidos con otras áreas (se construyen **una vez**, en `src/components/kit`): `Kbd`, `KbdButton`, `ViewToggle`,
`SeccionPlegable` (el `CheckoutAccordion` de Figma), `FilaDato`, `ResumenTotales`, `BotonImporte` (el
`CobrarButton`), `ProductCard` (variantes `pos` · `movil-tarjeta` · `movil-lista`), `CategoryBar`,
`CustomerPicker`, `CartTag`, `CartLine`, `SelectorMetodoPago` + `ListaPagos`, `ResultadoOperacion` y el hook
`useAtajos`. Propios del POS (en `src/components/pos/venta/`, compuestos solo con piezas del kit): `CabeceraPos`,
`GrillaProductos`, `PanelCarrito`, `AccionesCarrito`, `CobroPanel`, `PostVenta`, `MapaAtajos`, `BarraCobroMovil`.

---

## 1. Inventario actual

### 1.1 Rutas y árbol de componentes

`/app/pos` → `src/app/app/pos/page.tsx` (cliente, `'use client'`). No hay layout propio del POS.

```
POSPage (P:59)
├─ carga: PageHeaderSkeleton + StatsSkeleton + CardListSkeleton (P:562-569)   ← mientras org/sucursal/carritos
├─ «Organización no encontrada» (P:572-587)
└─ contenedor (P:591, opacidad 60 % y sin clics mientras isRefreshing)
   ├─ Card cabecera (P:594-680)
   │  ├─ icono + «Sistema POS» + organización + BranchBadge (P:598-612) → inventario/BranchBadge → kit/BranchBadgeActiva
   │  ├─ caja: CierreCajaDialog (P:635) | botón deshabilitado «Cerrar Caja» con title (P:621-632) | AperturaCajaDialog (P:642)
   │  ├─ PendientesSinConexionDialog (P:646)          ← solo Desktop
   │  ├─ reloj HH:MM (P:649-654)                        ← toLocaleTimeString, sin tz de la org
   │  ├─ CustomerDisplayIndicator (P:657)               ← components/pos/display
   │  └─ badges «N Activos» / «N En Espera» (P:660-675)
   ├─ productsPane = ProductSearch (P:684-690)
   │  ├─ LocalCatalogNotice (PS:466)                    ← solo Desktop sin red
   │  ├─ buscador Input + botón cámara BarcodeScanner (PS:955, ui/barcode-scanner, simulado)
   │  ├─ CategoryFilterBar (PS:503) — modos combobox / chips / imágenes, estrella, «Top»
   │  ├─ «Mostrar N ▲▼» (PS:525-573) + Compacta/Amplia (PS:576-593) + «{total} prod.»
   │  ├─ grilla de tarjetas (PS:606-870): CachedProductImage, «Agotado», «-%», «N var.», «Top», estrella, receta
   │  ├─ paginación propia (PS:872-947)
   │  ├─ VariantSelectorDialog (PS:963) — variantes + modificadores
   │  └─ Dialog de receta (PS:972-1079)
   ├─ cartPane (P:692-747)
   │  ├─ «Seguir comprando» (solo < lg, P:695-705)
   │  ├─ Card «Cliente» → CustomerSelector (P:708-721) → ClienteFormDialog / OfflineCustomerDialog
   │  ├─ CartTabs (P:725-731)
   │  └─ CartView (P:737-744)
   │     ├─ cabecera del carrito, badges Espera / Deuda / cocina, «Reactivar» (CV:646-712)
   │     ├─ líneas (CV:~730-1195): miniatura, nombre, variante, modificadores, estado de cocina, nota
   │     │   (ChipsNotasRapidas), descuento inline + frecuentes, − n +, «Incluido», excluir impuesto, quitar
   │     ├─ TaxSummary (CV:1202)
   │     ├─ botonera: deuda (Ver Factura, Imprimir, Cobrar, Anular) (CV:1229-1261) | Espera, Deuda,
   │     │   Enviar Cocina, Cobrar (CV:1277-1316) + «Debe abrir una caja antes de cobrar» (CV:1319-1321)
   │     └─ diálogos Espera, Deuda (CV:~1380-1480), Detalle de factura → finanzas/DetalleFactura (CV:1506)
   ├─ escritorio ≥1024: PanelGroup redimensionable 75/25 (P:750-779, clave localStorage `pos-layout-productos-carrito`)
   ├─ < 1024: vistas excluyentes productos | carrito (P:781-796) + botón flotante «Carrito · n · $» (P:800-822)
   └─ CheckoutDialog (P:825-833, key = cart.id)
      ├─ portal propio `createPortal` + `fixed inset-0` (CD:1680) — **sin** role="dialog" ni Esc
      ├─ post-venta «¡Venta Completada!» (CD:~1690-1811)
      ├─ cabecera «Procesar Pago» (CD:1828), columna izquierda: resumen, totales, Entrega (CD:1971-2183)
      ├─ columna derecha: Métodos de pago (CD:2184-2327), Propina (CD:2328-2428), Comisión (CD:2429-2520)
      ├─ Factura electrónica → finanzas/facturacion-electronica/ElectronicInvoiceToggle (CD:2521)
      ├─ botón «Completar Venta · $ / Falta dinero / Procesando…» (CD:2562)
      ├─ SerialSelectorDialog, QrPaymentDialog (shared), TipFromDisplayNotice (display)
      └─ AlertDialog «Stock insuficiente de ingredientes» (CD:2653-2690)
```

Otros usuarios de estos componentes (cambiar su contrato los rompe):

| Componente | También lo usan |
|---|---|
| `CheckoutDialog` (POS) | `pos/ventas/nuevo/NuevaVentaPage.tsx:437`, `app/app/pos/mesas/[id]/page.tsx:1795` (con `onProcessPayment`) |
| `ProductSearch`, `CustomerSelector` | `NuevaVentaPage.tsx:29-30` (zona del agente de Ventas) |
| `CustomerSelector` | `mesas/id/MesaActionsSidebar.tsx:9`, `pms/reservas/nueva/StepCustomer.tsx:5`, `pms/espacios/id/QuickReservationDrawer.tsx:36` |
| `VariantSelectorDialog` | `mesas/id/AddProductDialog.tsx:20`, `shared/product-search/ProductSearchDialog.tsx:21`, `transporte/envios/id/ShipmentItems.tsx:19`, `pms/espacios/id/AddConsumptionDialog.tsx:20` |
| `CategoryFilterBar` | `mesas/id/AddProductDialog.tsx:22` |
| `TaxSummary` | `pms/reservas/nueva/StepPayment.tsx:21`, `pms/checkout/CheckoutDialog.tsx:49` |
| `SerialSelectorDialog` | `finanzas/facturas-venta/nueva-factura/ItemsFactura.tsx:20` |

**Archivos muertos** (sin importadores, verificado con grep): `components/pos/POSHome.tsx`, `multi-cart-manager.tsx`,
`cart-item.tsx`, `cart-summary.tsx`, `product-grid.tsx`, `product-search.tsx`, `barcode-scanner.tsx` (el de `pos/`;
el que se usa es `ui/barcode-scanner.tsx`), `customer-selector.tsx` (minúsculas), `VentasPendientesDialog.tsx`
(reexporta `PendientesSinConexionDialog`), `main-pos.tsx` y `RoomChargeSelector.tsx` (0 líneas). Se borran en el
último paso (§4 paso 16), no antes, para no mezclar limpieza con cambio de UI.

### 1.2 Estado de la página (P)

| Estado / efecto | Línea | Qué hace |
|---|---|---|
| `carts`, `activeCartId` | 62-63 | Lista de carritos en memoria (espejo de `pos_carts_<org>`) y el activo |
| `showCheckout`, `checkoutCart` | 66-67 | Carrito congelado que se pasa al cobro |
| `isLoading`, `isRefreshing`, `isFirstLoadRef`, `isInitializingRef` | 68-71 | Carga inicial y recarga por cambio de sucursal; evita dos inicializaciones solapadas (StrictMode) |
| `currentTime` + intervalo 1 s | 73, 178-181 | Reloj de la cabecera |
| `mobileView` | 74 | `'products' \| 'cart'` por debajo de 1024 |
| `cashSession`, `currentUserId`, `permisosCaja` | 76-78 | Caja activa y quién puede cerrarla (servidor, `usePermisosCaja`) |
| `useCabeceraMovil` | 87-93 | Publica en el `MobileHeader Mode=pos`: «Caja abierta · {hora}» / «Caja cerrada» (`header.posCashOpen/Closed`) y oculta la barra inferior con carrito o cobro |
| `useMediaQuery('(min-width: 1024px)')` + `useDefaultLayout` | 97-102 | Paneles redimensionables en escritorio, ancho recordado |
| efecto usuario | 105-127 | Nombre del cajero → pantalla del cliente (`setSession`) |
| efecto inicial | 130-136 | `initializePOS` + `loadDashboardData` al cambiar organización o sucursal |
| efecto pantalla del cliente | 146-170 | `startPosDisplay` / `stopPosDisplay`, re-anuncio al volver el foco |
| `setSession({sessionOpen})` | 173-175 | Caja abierta/cerrada a la pantalla del cliente |
| `startSalesSync`, `startOfflineSync` | 185-194 | Desktop: reproduce ventas y caja pendientes al volver la red |
| `CASH_OUTBOX_CHANGED_EVENT` | 198-207 | Desktop: relee la caja cuando cambia el outbox local |
| Realtime `cash_sessions` | 212-237 | `CajasService.subscribeToCashSessions` con debounce 300 ms. **No hace nada**: `cash_sessions` no está en la publicación `supabase_realtime` (verificado: solo `kitchen_tickets` y `products` de las tablas del POS) |
| `initializePOS` | 278-308 | Carga carritos; si no hay, crea uno |
| `createNewCart` | 310-327 | Exige `selectedBranchId` (toast «Seleccione una sucursal…»), `POSService.createCart` |
| `removeCart` | 329-354 | Marca la comanda como entregada, borra de storage, activa otro o crea uno |
| `handleProductSelect` | 356-369 | `POSService.addItemToCart(activeCartId, product, 1, modifiers)` (`alert` si falla) |
| `handleCustomerSelect` | 371-382 | `POSService.setCartCustomer` (ignora `room`: D-03) |
| `handleCheckoutComplete` | 402-429 | Marca comanda entregada, quita el carrito cobrado, activa otro o crea uno |
| `handleHoldCart` | 431-434 | `alert("Carrito puesto en espera…")` |
| `handleSendComanda` | 436-549 | Ronda de cocina idempotente (`round_key` guardado antes), `POST /api/pos/cocina/ronda`, impresión por estación |
| `setActiveCart` a la pantalla | 557-559 | La pestaña visible es lo que ve el cliente |

### 1.3 Servicios, RPC, rutas y tablas

**`POSService` (SVC)** — clase estática; organización leída en cada acceso (SVC:57-65); sucursal de
`localStorage.currentBranchId` o la primera activa (SVC:82-129); `usesLocalCatalog()` = Desktop sin red (SVC:77).

| Grupo | Métodos (línea) | Lee / escribe |
|---|---|---|
| Catálogo | `getProductsPaginated` (201, RPC `pos_product_ranking` en 237), `getProductVariants` (534), `getCategories` (615), `getCategoryRanking` (RPC `pos_category_ranking`, 642), `toggleCategoryFavorite` (659), `getProductByBarcode` (681), `toggleProductFavorite` (707), `getProductById` (2265), `getProductPrice` (privado) | `products`, `product_prices`, `product_images`, `product_recipes`, `stock_levels`, `category_favorites`, `product_favorites`; réplica local en Desktop |
| Clientes | `searchCustomers` (747), `createCustomer` (775) | `customers` (escribe `first_name`/`last_name`/`identification_*`, nunca las generadas) |
| Carritos | `createCart` (882), `getActiveCarts` (912), `addItemToCart` (926), `removeItemFromCart` (991), `updateCartItemQuantity` (1016), `updateCartItemDiscount` (1050), `updateItemTaxIncluded` (1079), `updateCartItemNote` (1127), `updateCartItemTaxExcluded` (1140), `setCartKitchenRoundKey` (1148), `applyKitchenRound` (1153), `getFrequentDiscounts` (1157), `setCartCustomer` (1194), `updateCartTaxSettings` (~1240), `recalculateCart` (1267), `holdCart` (1288), `activateCart` (1311), `removeCart` (2589) | **`localStorage` `pos_carts_<org>`**, único punto de escritura `saveCartsToStorage` (~2569-2575), que además emite el carrito a la pantalla del cliente. La tabla `carts` existe con 0 filas |
| Deuda | `holdCartWithDebt` (1339-1708), `getInvoiceForCart` (2601), `cancelDebtWithCreditNote` (2681-2960) | `sales`, `invoice_sales`, `invoice_items`, `sale_items`, stock, `accounts_receivable` (reintenta 3 veces, 1621), nota crédito, seriales — **desde el navegador** (lo pasa a RPC el agente del cobro) |
| Cobro | `checkout` (1720): offline → `checkoutOffline` (1725); promociones `promotionEngine.evaluate` (1740, un descuento manual gana a la promo, 1757); impuestos por línea con `resolveLineTax` (1804); venta nueva **solo** por `pos_checkout_v1` con `buildCheckoutEnvelope` (1887) + `callCheckoutRpc` (1903), `removeCart` (1913); cobro de deuda por updates (1928-2090) | RPC `pos_checkout_v1(p_envelope jsonb)` (SECURITY DEFINER) |
| Config | `getPaymentMethods` (2145, `organization_payment_methods`), `getCurrencies` (2178), `getBaseCurrency` (2232), `getOrganizationTaxes` (2486), `getProductTaxes` (2504), `getOrganizationMembers` (2962) | |

**Otros servicios y módulos de lógica** que la UI consume:

| Módulo | Qué aporta |
|---|---|
| `src/lib/offline/checkoutRpc.ts` | `buildCheckoutEnvelope` (116), `callCheckoutRpc` (243), `POS_CHECKOUT_RPC` (18) |
| `src/lib/offline/salesOutbox.ts` | IndexedDB `goadmin-outbox` (stores `sales`, `customers`), `shouldCheckoutOffline` (285), `newSaleId` (289), `enqueueOfflineSale` (366), número local `OFF-…` (`nextLocalReceiptNumber`, 256), `ticketSaleNumber` (272) |
| `src/lib/offline/salesSync.ts`, `syncStages.ts`, `cashOutbox.ts`, `customersOutbox.ts`, `posOfflineReads.ts`, `catalogStore.ts`, `offlineDb.ts` | Sincronización y lecturas sin red (fases 4A-4F) |
| `src/lib/pos/cocina/lineasCarrito.ts`, `components/pos/cocina/cocinaCliente.ts` | Notas con destino, alergia, ronda de cocina (`POST /api/pos/cocina/ronda` → RPC `pos_cocina_enviar_ronda`) |
| `src/lib/pos/display/**` (emisor, protocolo, proyección, propina `tip.ts`, pago `payment.ts`) | Pantalla del cliente: `getPosDisplayEmitter().setActiveCart / setTotals / setPayment / setMode / setTipBase / skipTip / onUp / reannounce / setSession` |
| `src/lib/pos/barcodeWedge.ts` + `hooks/useHardwareBarcodeScanner.ts` | Lector físico por ráfaga (listener `keydown` en `window`, fase de captura) |
| `src/lib/pos/estacionEfectiva.ts`, `precioVigente.ts` | Estación de cocina heredada; precio vigente |
| `compositeStockValidation.ts` | Stock de ingredientes de recetas antes de cobrar (CD:1086) |
| `promotionEngine` | Promociones del canal `pos` |
| `utils/taxCalculations.ts` (`calculateCartTaxes`), `taxResolver` (`resolveLineTax`) | Impuestos del Resumen y del cobro |
| `printService.ts` (`generateTicketHTML` 202, `printTicket` 328, `printElectronicInvoice` 625), `printJobsService.ts` (`enqueueSaleTicket` 514, `enqueueKitchenTicket` 399, `enqueueElectronicInvoice` 924, `enqueueOpenCashDrawer` 1031, `enqueueProductLabels` 1065), `cashDrawerService.ts`, `mobilePrintService.ts`, `mobileEscposAdapter.ts` | Impresión: un único renderizador `@printing` (`print-agent/src/printing/**`) para navegador, agente y móvil |
| `electronicInvoicingService.sendToFactus` (CD:1364) | Factura electrónica tras la venta |
| `CajasService`, `usePermisosCaja`, `reglasCierre.puedeCerrarCaja` | Caja (zona del agente de cajas: **tiene cambios sin commitear** en `AperturaCajaDialog`, `CierreCajaDialog`, `CajasService`) |

**RPC del POS en la base** (verificadas con `pg_proc`): `pos_checkout_v1(p_envelope)`, `pos_product_ranking(p_org_id,
p_search, p_category_id, p_status, p_include_variants, p_page, p_limit)`, `pos_category_ranking(p_org_id)`,
`pos_cocina_enviar_ronda`, `pos_cocina_confirmar_alergia`, `pos_notas_rapidas_sugeridas`, `pos_caja_esperado`,
`pos_caja_registrar_arqueo` (y las de mesa, fuera de alcance).

**Rutas `src/app/api/pos/**` que usa la pantalla**: `cocina/ronda`, `notas-rapidas`, `display/*` (bootstrap,
heartbeat, pair, revoke, feedback, promotions), `terminals/[id]/pairing-code`, `cajas/*`. Cobro QR:
`/api/integrations/{bancolombia,…}/create-qr` y `bold/*` — **ya corregidas** (commit `b9dc601c`: organización,
permiso y conexión resueltos en el servidor; el guardarraíl 27b lo fija), así que la fila E-16 de la matriz de
paridad («QR sobra») dejó de ser cierta.

**Disparadores que se ejecutan en una venta** (verificados): `sales` → `trg_auto_journal_sale_pos`,
`trg_create_commission_on_sale`, `trg_pos_to_folio`, `trg_sales_ligar_pedido_web`, `trg_sales_mark_customer_purchased`,
`audit_sales_trigger`; `sale_items` → `trg_auto_journal_sale_item_cogs`; `invoice_sales` → `tr_create_account_receivable`,
`trg_auto_journal_sale`, `trg_create_commission_on_invoice_sale`, …; `invoice_items` → `trg_normalizar_impuesto_linea`,
`trg_recalc_invoice_totals_*`; `payments` → `trg_recalc_invoice_balance_from_payments`,
`tr_update_accounts_receivable_on_payment`, `trg_auto_journal_payment`, …; `tips` → `trg_auto_journal_tip`,
`trg_tips_guarda`; `kitchen_tickets` → `trg_kitchen_ticket_alergia_guarda`. **La UI no escribe en ninguna de estas
tablas directamente** tras el agente del cobro: todo va por el servicio.

### 1.4 Almacenamiento local

| Clave / base | Dónde | Qué guarda |
|---|---|---|
| `localStorage` `pos_carts_<org>` | SVC:915, 2569-2575 | **Todos los carritos** (activos, en espera y en deuda) con sus líneas, notas, `tax_excluded`, `kitchen_round_key` |
| `localStorage` `pos-layout-productos-carrito` | P:57, 98-102 | Ancho del divisor de paneles |
| `localStorage` `currentBranchId`, `branchFilterAll` (+ `sessionStorage currentBranchId`) | `BranchContext.tsx:48-149` | Sucursal elegida |
| `localStorage` `org_base_currency` | `useOrgCurrency.ts:14` | Moneda base en caché |
| `localStorage` `pos_terminal_id`, `pos_display_hint_shown`, `pos_customer_display_changed`, `pos_customer_display_revoked*`, `pos_customer_display_pairing` | `lib/pos/display/{terminal,openDisplay,posDisplay,revocation}.ts` | Pantalla del cliente |
| `localStorage` `mobile_bluetooth_printer_id` | `cashDrawerService.ts:99` | Impresora BT del móvil |
| `localStorage` `goadmin-offline:last-sync-at`, `goadmin-outbox-cash:*` | `offlineCache.ts:23`, `cashOutbox.ts:61-63` | Offline |
| IndexedDB `goadmin-outbox` (`sales`, `customers`), `goadmin-outbox-cash`, `goadmin-catalog`, `goadmin-replica`, `goadmin-offline` | `lib/offline/**`, `lib/utils/offlineCache.ts` | Ventas, clientes y caja sin red; catálogo y réplica |
| **Nuevo en el rediseño** `pos_vista_productos` (`tarjetas` \| `lista`) | — | Preferencia de vista por dispositivo (decisión 2026-09-24). Hoy `gridSize` no se persiste (PS:103) |

### 1.5 Atajos de teclado, escáner y eventos

- **No existe ningún atajo del POS** salvo: Enter/Escape en la nota y el descuento de la línea (CV:904, 987), Enter/Espacio
  en la «×» de la pestaña (CT:259), «/» del `SearchInput` del kit (el buscador del POS **no** lo usa todavía).
- **Escáner físico** (`useHardwareBarcodeScanner`, PS:378): escucha `keydown` en `window` en fase de captura; detecta la
  ráfaga con `BarcodeWedgeDetector` (probado en `__tests__/pos/barcodeWedge.test.ts`), retira el texto del campo
  enfocado y, si **no** hay un diálogo Radix abierto (`[role=dialog][data-state=open]`), resuelve: variante exacta →
  al carrito (o al diálogo si hay modificadores), padre con variantes → diálogo, agotado → toast, no encontrado →
  toast (PS:304-376).
- **Hallazgo**: el cobro es un portal propio sin `role="dialog"` (CD:1680); **un escaneo con el cobro abierto se agrega
  al carrito de fondo**, que ya no es el que se está cobrando (`checkoutCart` es una copia). El cobro nuevo sobre
  `PanelAdaptable` (Radix) lo corrige solo; hay que decidir si eso es lo esperado (§5 D10).
- **Escáner con cámara**: `ui/barcode-scanner.tsx` es simulado (B-04); fuera de este plan salvo el botón.
- **Eventos de ventana**: `CASH_OUTBOX_CHANGED_EVENT` (P:205), `OUTBOX_CHANGED_EVENTS` (pendientes), `focus` /
  `visibilitychange` (re-anuncio a la pantalla, P:162-163), `storage` (ajustes y revocación de la pantalla).
- **Realtime**: `cash_sessions` (sin efecto, §1.2); `kitchen_tickets` está publicado pero CV lee todas las comandas
  con `KitchenService.getKitchenTickets()` (CV:247) para pintar el estado de cocina (N10).

### 1.6 Impresión y documentos que salen del POS

| Documento | Disparador | Camino |
|---|---|---|
| Ticket de venta físico (automático) | Tras cobrar, si hay impresora con estación de caja (CD:1194-1263) | `PrintJobsService.enqueueSaleTicket` → `print_jobs` → agente (`@printing` `buildSaleTicketHTML` / ESC/POS). Sin impresora: toast «No hay impresora de caja…» (CD:1257) |
| «Re-imprimir recibo» (post-venta) | Botón (CD:1489-1604) | `PrintService.getBusinessAndBranch` + `printTicket` (HTML en ventana, `@printing`). Bug conocido: usa la sucursal principal (F-04) |
| Factura electrónica | Tras cobrar con FE (CD:1349-1471) y botón post-venta (CD:1747-1804) | `electronicInvoicingService.sendToFactus` → `enqueueElectronicInvoice` / `printElectronicInvoice` |
| Comanda de cocina | «Enviar a cocina» (P:526-548) | `enqueueKitchenTicket` por estación |
| Factura de la deuda | «Imprimir» del carrito en deuda (CV:482-600) | `PrintService.printTicket` |
| Cajón | Pago en efectivo (CD:1269) | `CashDrawerService.open` |
| Etiquetas de producto | No salen de la pantalla del POS (catálogo) | `kit/EtiquetaProducto`, `HojaEtiquetas`, `enqueueProductLabels`: **ya rediseñadas**; nada que hacer aquí |

Los formatos (80 / 58 mm, media carta) y su diseño son de `DOCUMENTOS-PDF.md` (otra tanda). Este plan **no cambia el
papel**; solo la pantalla que lo dispara y los avisos (quitar el badge «Nuevo» del recibo automático, F-05).

### 1.7 Textos e idiomas

- Namespaces que ya usa la pantalla: `header` (`posCashOpen`, `posCashClosed`), `posCocina` (P:83), `posNotasLinea`
  (CV:213), `posCustomerDisplay` / `posDisplay` (indicador y pantalla), `kit`. Todos con las mismas claves en los 4
  idiomas.
- **Todo lo demás está fijo en español**: P (≈25 textos), PS (≈60), CV (≈90), CT (≈15), CS (≈40), TS (≈25), CD
  (≈220, incluidos `toast` y el `alert` de CD:1483), VSD (≈25), SSD (≈15), PSC/OfflineCustomerDialog/LocalCatalogNotice
  (≈60). Orden de magnitud: **~575 cadenas** por traducir.
- Namespaces nuevos propuestos (uno por pieza, para que dos agentes no pisen el mismo bloque): `posVenta` (pantalla,
  grilla, carrito, cliente, atajos), `posCobro` (cobro y post-venta). Los textos de los componentes del kit van al
  namespace `kit` existente, con los defaults sobrescribibles por props (regla de KIT-CODIGO).

### 1.8 Responsive de hoy

- ≥ 1024 (`lg`): dos paneles 75/25 arrastrables. < 1024: vistas excluyentes con botón flotante — **incluye tablet
  vertical (768) y horizontal por debajo de 1024**.
- La cabecera móvil ya está en código (`5be9f1bf`): `MobileHeader Mode=pos` con «←», sucursal y estado de caja
  (`shell/header/cabeceraMovil.tsx`, P:87-93). La Card de cabecera de P se sigue dibujando también en móvil.
- `CustomerSelector` usa popover ≥ 640 y diálogo ≤ 640 (CS:60).

---

## 2. Lógicas a preservar y pruebas de caracterización

Regla: **ninguna pieza de UI se sustituye sin que su comportamiento esté fijado por una prueba que pase antes y
después**. Como jest corre en `node` y el repo no tiene Testing Library, las pruebas de caracterización se escriben
sobre **funciones puras y hooks sin DOM** que se extraen de los componentes en el paso 1 (extracción literal, sin
cambiar una línea de cálculo), más pruebas de servicio con Supabase simulado (el patrón de
`notaLineaPersistida.test.ts` y `removeCart.test.ts`). Si el dueño aprueba añadir `@testing-library/react` +
`jest-environment-jsdom` (§5 D9), las marcadas «(render)» pasan a ser pruebas de render.

Columnas: dónde vive hoy · prueba que ya existe · prueba nueva que hay que escribir **antes** de tocar la UI.
Carpeta propuesta para las nuevas: `src/__tests__/pos/venta/`.

### 2.1 Carritos

| # | Comportamiento | Dónde | Ya existe | Prueba nueva |
|---|---|---|---|---|
| L1 | Al entrar: si no hay carritos se crea uno; con carritos, el primero queda activo; dos inicializaciones solapadas no crean dos | P:278-308 | — | `inicializarPos.test.ts`: extraer `inicializarCarritos(servicio)` → 0 carritos ⇒ 1 creado; 2 llamadas concurrentes ⇒ 1 creado |
| L2 | Sin sucursal concreta («Todas») no se crea carrito y se avisa | P:313-316 | — | idem: `selectedBranchId = null` ⇒ no llama a `createCart`, devuelve motivo `sin_sucursal` |
| L3 | Cerrar un carrito: si tenía comanda, se marca entregada; se borra de storage; si era el activo se activa otro; si no quedan, se crea uno | P:329-354 | `removeCart.test.ts` (3, solo el servicio) | `cerrarCarrito.test.ts` sobre la función extraída |
| L4 | Al completar el cobro se quita el carrito cobrado y se activa otro o se crea uno | P:402-429, SVC:1913 | — | `completarCobro.test.ts` |
| L5 | Agregar el mismo producto con los mismos modificadores suma cantidad; con nota, alergia o nota al cliente crea otra línea | SVC:939-974 | `cocinaLineasCarrito.test.ts` (parcial) | `agregarLinea.test.ts`: fusión por `product_id` + modificadores ordenados; nunca fusiona líneas con nota |
| L6 | Precio de la línea = precio vigente + extras de modificadores; precio 0 o nulo agrega a $ 0 | SVC:954-962, `getProductPrice` | — | `precioLinea.test.ts` (incluye precio 0: la línea entra a $ 0, no se bloquea) |
| L7 | Cantidad ≤ 0 quita la línea (sin confirmar hoy) | SVC:1028 | — | `cantidadLinea.test.ts`. El diseño añade confirmación al llegar a 0 (C-11, Nuevo): la prueba fija el servicio, la confirmación es UI |
| L8 | Descuento de línea acotado a cantidad × precio | SVC:1050-1078 | — | `descuentoLinea.test.ts` (tope, negativo ⇒ 0) |
| L9 | Descuentos frecuentes: los 3 importes más usados del producto | SVC:1157-1193 | — | `descuentosFrecuentes.test.ts` con filas simuladas |
| L10 | «Espera» con motivo y «Reactivar» | SVC:1288-1338, CV:394-415 | — | `esperaCarrito.test.ts` |
| L11 | `getActiveCarts` devuelve `active` y `hold`; los `hold_with_debt` siguen en storage pero **desaparecen de las pestañas al recargar** (BE9) | SVC:912-924 | `notaLineaPersistida.test.ts` (no borra los de deuda) | `carritosVisibles.test.ts`: fija el comportamiento de hoy **y** el que deje el agente del cobro (por sucursal) |
| L12 | Pestaña: nombre del cliente o del carrito truncado, total y nº de líneas; cerrar solo con más de uno, con confirmación | CT:167-372 | — | `pestanaCarrito.test.ts` sobre `etiquetaPestana(cart)` extraída |
| L13 | La pestaña visible es la que ve el cliente; cambiar de pestaña la emite | P:557-559 | `emitter.test.ts`, `tester-r1-parte-d.test.ts` (lee P) | ninguna (ya cubierto); ajustar la lectura de fuente si P cambia (§5 R1) |

### 2.2 Catálogo, escáner, variantes

| # | Comportamiento | Dónde | Ya existe | Prueba nueva |
|---|---|---|---|---|
| L14 | Búsqueda con espera de 300 ms; cambiar búsqueda, categoría o sucursal vuelve a la página 1 | PS:198-209 | — | `busquedaCatalogo.test.ts` sobre el hook extraído `useCatalogoPos` (lógica de página y debounce con temporizadores falsos) |
| L15 | Producto agotado: no se agrega, toast | PS:252-259 | — | `accionTarjeta.test.ts`: `decidirAccionProducto(p)` ⇒ `agotado` / `dialogo` / `agregar` |
| L16 | Con variantes (>0) o modificadores abre el diálogo; simple se agrega | PS:261-267 | — | idem |
| L17 | La variante hereda categoría y estación del padre y toma su nombre legible | PS:271-294 | `estacionEfectiva.test.ts` (13) | `varianteElegida.test.ts` sobre `enriquecerVariante(variante, padre)` extraída |
| L18 | Escáner: variante exacta ⇒ al carrito; con modificadores ⇒ diálogo del padre (pierde la variante, B-06); padre ⇒ decisión de la tarjeta; no encontrado / agotado ⇒ toast | PS:304-376 | `barcodeWedge.test.ts` (8, solo detección) | `resolverEscaneo.test.ts` sobre `resolverCodigo(row, grid)` extraída |
| L19 | Escaneo con un diálogo Radix abierto no se agrega | `useHardwareBarcodeScanner.ts:36-39` | — | `escaneoConDialogo.test.ts` (función `dialogOpen` exportada con documento simulado) |
| L20 | Modificadores: «Elige 1 / Hasta N», obligatorios, combinaciones inválidas, «Sin precio» | VSD:132-390 | — | `modificadores.test.ts` sobre la validación extraída de VSD |
| L21 | Favorito de producto y de categoría: optimista y se revierte si falla; sin red se encola | PS:404-456, 179-189; `offlineCache.ts:156-169` | — | `favoritos.test.ts` |
| L22 | Sin catálogo local (Desktop sin red): mensaje propio, no el genérico | PS:142-151 | `posOfflineReads.test.ts` (11) | ninguna nueva (añadir el caso en el hook extraído) |
| L23 | «Top» de producto si `sales_count_90d > 0` con su tooltip; «Top» y estrella de categoría | PS:756-760, CFB:134-249 | — | `insigniasProducto.test.ts` sobre `insigniasDe(product)` (Agotado, -%, N var., Personalizable, Top, receta, sin precio) |
| L24 | Receta de solo lectura | PS:380-400 | — | (render) |

### 2.3 Impuestos, totales y descuentos (NO cambiar semántica: POS-CARRITO-LINEAS-NOTAS §7)

| # | Comportamiento | Dónde | Ya existe | Prueba nueva |
|---|---|---|---|---|
| L25 | Los cuatro controles C1 «Excluir impuesto», C2 «Incluido», C3 «Impuestos incluidos» (copia a todas), C4 «Impuestos incluidos en precios» del cobro, con sus tres cálculos (a) carrito guardado, (b) Resumen, (c) cobro | SVC:2312-2422, TS:146-245, CD:906-1002 | **`impuestosLineaCarrito.test.ts` (18)** y **`lib/offline/__tests__/impuestosCobroSobre.test.ts` (6)** | ninguna; son la red de seguridad. Deben pasar **sin cambios** en cada paso |
| L26 | El interruptor C3 se deriva de las líneas (todas ⇒ encendido, ninguna ⇒ apagado, mezcla ⇒ se queda) | CV:115-121 | cubierto en L25 | — |
| L27 | Nombres reales de impuestos, nunca «IVA» fijo; «No hay impuestos configurados…» | TS:352-511 | `taxCoverage.test.ts` (parcial) | `resumenImpuestos.test.ts` sobre las filas que produce TS |
| L28 | Promociones: descuento automático solo en líneas sin descuento manual; uso registrado | SVC:1740-1770, 2389-2400 | `promotionEngine.clienteReal.test.ts` (5) | `promosEnCarrito.test.ts` (manual gana a promo) |
| L29 | Totales que ve el cajero = los que ve el cliente; la pantalla ignora totales de otro carrito | CV:144-190, TS | guardarraíl «Pantalla del cliente» (lee TS y CV) y `projection.test.ts` (49) | ajustar el guardarraíl al archivo nuevo (§5 R1) |
| L30 | Líneas sin impuesto asignado: etiqueta en la línea y aviso en el cobro | CV:23-24 (`EtiquetaSinImpuesto`), CD:56-57 (`AvisoSinImpuesto`) | — | `lineasSinImpuesto.test.ts` sobre `useLineasSinImpuesto` (lógica) |

### 2.4 Cliente

| # | Comportamiento | Dónde | Ya existe | Prueba nueva |
|---|---|---|---|---|
| L31 | Buscar por nombre, correo, teléfono, documento; empresas con contacto; huéspedes en `checked_in` («espacios ocupados») | CS:63-212, 81-108 | — | `buscarCliente.test.ts` (servicio simulado) |
| L32 | Crear cliente completo (`ClienteFormDialog`) o sin red (`OfflineCustomerDialog`, «Pendiente de sincronizar») | CS:426-437, 578-589 | `cartCustomerOffline.test.ts` (11), `customersOutbox.test.ts` (13) | ninguna |
| L33 | Cliente obligatorio **solo** para «Deuda»; la FE no lo exige hoy (E-31) | CV:1167 (botón), SVC:1364 | — | `requisitosDeuda.test.ts` sobre `puedeRegistrarDeuda(cart)` (cliente, líneas, total > 0, activo) |
| L34 | Elegir una habitación no carga a la habitación (se ignora `room`, P:371-382) | P:371-382 | — | fijar el comportamiento (no cambiarlo en el rediseño) |

### 2.5 Caja, sucursal y pantalla

| # | Comportamiento | Dónde | Ya existe | Prueba nueva |
|---|---|---|---|---|
| L35 | Sin caja: «Cobrar» deshabilitado en el carrito **siempre** (ignora la config); el cobro revisa `pos_require_cash_session` al abrir y se cierra con toast | CV:1312-1321, CD:390-408 | — | `requisitosCobro.test.ts`: `estadoBotonCobrar({caja, config, carrito, espera, deuda})` ⇒ `sin-caja` / `vacio` / `bloqueado` / `listo`. **Decisión D4**: el diseño convierte el deshabilitado en «Abrir caja para cobrar · F9» |
| L36 | «Cobrar deuda» no exige caja | CV:606-613, 1250 | — | idem |
| L37 | Cerrar caja: solo quien la abrió o quien tiene permiso de cerrar ajenas (servidor) | P:620-632, `reglasCierre.ts` | `cajasCierreYApertura.test.ts` (4, lee P), `historialCajas.test.ts` | ajustar la lectura de fuente al archivo nuevo de cabecera |
| L38 | Cambio de sucursal: recarga con la página bloqueada al 60 %; el catálogo se recarga por `branchFilter` | P:130-136, 591; PS:155 | — | `cambioSucursal.test.ts` sobre `initializePOS` extraído |
| L39 | Pantalla del cliente: arranque con moneda de la organización, re-anuncio al foco, caja y cajero en `hello`, modo `order`/`thanks`, propina desde la pantalla | P:146-175, CD:294-380, 1185 | **~120 archivos en `__tests__/pos-display/`** | ninguna nueva; ajustar las que leen P y CD (§5 R1) |
| L40 | Indicador: 4 estados, origen local/remota/ambas, activar/abrir/cerrar, emparejar, revocar | `display/CustomerDisplayIndicator.tsx` | `f3c-presence-origin.test.ts`, `openDisplay.test.ts`, … | ninguna; el indicador se reviste, no se reescribe |

### 2.6 Cobro

| # | Comportamiento | Dónde | Ya existe | Prueba nueva |
|---|---|---|---|---|
| L41 | `baseTotal`, `cartTotal = base + propina + flete`, `remaining`, `change`, `canComplete = pagado ≥ total` (no hay abono parcial: E-34) | CD:235-244 | `tip-f2b.test.ts` (lee CD) | `cuentasCobro.test.ts` sobre `cuentasDelCobro(...)` extraída **literal** |
| L42 | Pago mixto: agregar, quitar, primer pago por defecto; métodos desde `organization_payment_methods` | CD:410-418, 614, 2184-2242; SVC:2145 | — | `pagosCobro.test.ts` sobre el reductor de pagos extraído |
| L43 | «Exacto» y billetes rápidos solo en efectivo; hoy sobre el total, no sobre lo que falta (E-07) | CD:2244-2280 | — | `montosRapidos.test.ts` (fija «sobre el total»; decisión D8 si se cambia) |
| L44 | Propina 5/10/15/20 % sobre la base con impuestos; mesero = todos los miembros; propina de la pantalla no se aplica sola; al cambiar la propina el pago precargado la sigue salvo que el cajero lo tocara | CD:718-747, 2354-2410; `tip.ts`; `tipNotice.ts` | `tip-f2b.test.ts` (68) | ninguna; mover sus lecturas de fuente (§5 R1). **H9**: 15/20 % contradicen la decisión 6 de cargos (tope 10 %) — D7 |
| L45 | Comisión: vendedor, % o monto, tasa desde `vendor_commission_rates` | CD:1039-1050, 2429-2520; `useCommissionRate` | — | `comisionCobro.test.ts` |
| L46 | Entrega: recoger / envío propio / tercero, conductor, dirección con búsqueda, tarifa `shipping_rates.show_on_pos`, «Pendiente» sigue sumando el flete (E-15) | CD:1971-2183 | — | `entregaCobro.test.ts` sobre el estado de entrega extraído |
| L47 | QR: 4 proveedores, diálogo con 4 estados, mostrar en la pantalla, confirmación por la pantalla, sin `connectionId` en el cliente | CD:748-876, 2575-2640; `QrPaymentDialog` | `qr-payment-f2c*.test.ts` (10 archivos), guardarraíl 27b | ninguna; mover lecturas de fuente |
| L48 | Seriales obligatorios antes de cobrar | CD:1060-1063; SSD | — | `serialesCobro.test.ts` (`serialSelectionsComplete`) |
| L49 | Stock de ingredientes insuficiente ⇒ confirmación; sin red en Desktop no bloquea | CD:1081-1109 | — | `stockRecetaCobro.test.ts` |
| L50 | Sobre del cobro: reparto proporcional del impuesto por línea, `tax_included` = C4, totales | CD:1111-1167, `checkoutRpc.ts:116` | `checkoutRpc.test.ts` (10), `impuestosCobroSobre.test.ts` (6), `checkoutIdempotente.test.ts` (4) | ninguna |
| L51 | Sin red (Desktop): la venta va al outbox con `OFF-…` y aviso «pendiente de sincronizar»; FE y envío quedan para después | SVC:1725, CD:1172-1175, 1277, 1349 | `salesOutbox.test.ts`, `salesSync.test.ts`, `queueHonesta.test.ts` | `postVentaOffline.test.ts` sobre `estadoPostVenta(sale)` |
| L52 | Tras cobrar: ticket físico si hay impresora de caja, si no aviso; cajón con efectivo; FE a Factus y su impresión; pantalla a «Gracias» con `saleId` (nulo sin red) | CD:1176-1471 | `printJobsService.desktop.test.ts` (16) | `efectosPostVenta.test.ts` con servicios simulados: fija el orden y qué se llama en cada caso |
| L53 | Error del cobro: hoy `alert()` | CD:1483 | — | fijar que el carrito **no** se borra si la RPC falla (SVC:1916) |
| L54 | Doble clic: `isProcessing` bloquea; en navegador sin `saleId` previo dos clics rápidos podían crear dos ventas (E-35, lo cierra BE3) | CD:1052-1065 | `checkoutIdempotente.test.ts` | reescribirla contra el contrato nuevo del agente del cobro |

### 2.7 Deuda, cocina y offline de la pantalla

| # | Comportamiento | Dónde | Ya existe | Prueba nueva |
|---|---|---|---|---|
| L55 | Deuda: diálogo con motivo y vencimiento; crea venta + factura + cartera; la pantalla pasa a «Gracias» | CV:416-460; SVC:1339 | — | `deudaCarrito.test.ts` contra el método del servicio (tras la RPC del agente del cobro) |
| L56 | Carrito en deuda: Ver factura, Imprimir, Cobrar (reactiva temporalmente), Anular (nota crédito, **sin confirmación hoy**) | CV:465-645, 1229-1261 | — | `accionesDeuda.test.ts`; el diseño pide confirmación en «Anular» (se conserva el ConfirmDialog de fidelidad) |
| L57 | Deuda sin red: bloqueada | SVC (checkout offline) | — | `deudaSinRed.test.ts` (G-07) |
| L58 | Enviar a cocina: solo líneas de preparación; sin nada que enviar ⇒ toast; ronda idempotente por `round_key` guardado antes; comandas de ajuste; impresión por estación; toasts de sin impresora / sin cambios / ya enviada | P:436-549 | `cocinaLineasCarrito.test.ts` (12), `cocinaRutas.test.ts` (16) | `enviarCocina.test.ts` sobre `handleSendComanda` extraído a `useEnviarCocina` |
| L59 | Nota de línea persistida con destino cocina/cliente y alergia; «Excluir impuesto» persistido | SVC:1127-1147 | `notaLineaPersistida.test.ts` (6) | ninguna |
| L60 | Pendientes sin conexión: lista, reintentar, exportar, orden de sincronización | `PendientesSinConexionDialog.tsx`, `syncStages.ts` | `syncOrchestrator.test.ts`, `cashSync.test.ts`, `screensOffline.test.ts` | ninguna |

**Resumen de la red de seguridad**: ya existen ~60 pruebas de lógica del POS fuera de la pantalla del cliente y
~2.500 de la pantalla del cliente. Faltan unas **40 pruebas nuevas** (L1-L58 marcadas), casi todas sobre funciones que
hoy están dentro de componentes y que el paso 1 extrae sin cambiarlas.

---

## 3. Mapa diseño → código

### 3.1 Pantallas y frames (archivo `EAvjINVRnlzFM70GVoWXgl`, página `05 POS y ventas`)

| Frame de Figma | Node id | Código nuevo | Sustituye a |
|---|---|---|---|
| Cabecera del POS (escritorio) — sin caja / caja abierta / otro cajero / recargando | `184:31793`, `184:31722`, `184:31864`, `184:31935` | `pos/venta/CabeceraPos.tsx` (`KbdButton` F9, indicador con `Kbd` F10, `BranchBadgeActiva`, contadores con `Badge`) | Card de P:594-680 |
| Indicador de pantalla del cliente (4 estados + menú) | `185:48988` | `CustomerDisplayIndicator` revestido (misma lógica) + entradas «Emparejar» y «Revocar» que **ya existen en código** (H-06, H-07) | — |
| Skeleton / «Organización no encontrada» | `185:49120`, `158:28152`, `185:49184` | `Skeleton` + `EmptyState` del kit | P:562-587 |
| `MobileHeader Mode=pos` + sheet «Caja y dispositivo» | `59:2973`, `187:7933` | ya en código (`cabeceraMovil.tsx`); sheet nueva con `ActionSheet`/`PanelAdaptable` | Card de cabecera en móvil |
| Apertura / cierre de caja (sheets móviles) | `186:7520`, `186:7796` | **zona del agente de cajas**: el POS solo necesita poder abrirlos por programa (F9) | — |
| Buscador y grilla — `PosProductSearch` (5 estados) | `155:7745` (+ `IconButton` suelto `155:6642`, a retirar) | `pos/venta/GrillaProductos.tsx` = `SearchInput` + `ViewToggle` + `CategoryBar` + `ProductCard` + `EmptyState` + scroll infinito | PS:460-947 |
| Grid v2 con foco de teclado y `3*` | `249:80171` | `GrillaProductos` con foco itinerante | — |
| Categorías (3 modos) | `198:13995` | `CategoryBar` (kit) | `CategoryFilterBar` (también en mesas) |
| Diálogo de variantes / modificadores (escritorio y móvil) | `158:27344`, `198:14715`, `198:14706`, `159:31608` | `VariantSelectorDialog` revestido sobre `PanelAdaptable` (misma lógica) | — |
| Receta | `198:14255` | `Dialogo` del kit | PS:972-1079 |
| Escáner (anotaciones, cámara) | `198:13916`, `198:13899`, `198:13918`, móvil `198:13946`, `198:13968` | botón del `SearchInput` (`accesorio`) | PS:478-486 |
| Toasts del catálogo | `198:14779` | `sonner` con textos traducidos | `use-toast` de PS |
| Catálogo local (5 estados) | `187:7419`, `158:28687` | `LocalCatalogNotice` revestido | — |
| Carrito listo / vacío / sin caja / en espera / con deuda / recién agregada / cargando / error | `Carrito (listo)` (sin id en los docs), `244:67706`, `244:64655`, `244:65395`, `244:66158` | `pos/venta/PanelCarrito.tsx` (`CartLine`, `CartTag`, `ResumenTotales`, `BotonImporte`, `AccionesCarrito`) | CV completo + CT + Card «Cliente» de P |
| «Elige la sucursal para vender» | `158:29703` | estado de `PanelCarrito` con `EmptyState variante="sinSucursal"` | toast de P:314 |
| Diálogos Espera / Deuda / Anular / Detalle de factura / cerrar carrito / cantidad 0 | `190:10835`, `190:10875`, `190:10960`, `190:11018`, `190:10788`, `190:10989`; móvil `190:11388`, `190:11471`, `190:11343` | `Dialogo` / `PanelAdaptable` / `ConfirmDialog` | diálogos de CV y CT |
| Descuentos: botón «Descuento · D», diálogo 2 pestañas, badges de origen, menú móvil | `283:34398`, `290:35370`, `290:35435`, «✕» `283:35573` | `DialogoDescuento` (pestaña «A un producto» en esta entrega; ver D5) | edición inline de CV:852-942 (se conserva también en la línea) |
| Nota de línea (popover N) | `852:93391`; `LineNoteEditor` `847:30394` | editor actual revestido (`ChipsNotasRapidas` ya existe) | CV:783-826 |
| Cobro v2 — inicial / pagos / falta / procesando / entrega / propina / comisión / QR / seriales / stock | `247:69354`, `247:69830`, `247:70286`, `247:72304`, `247:70719`, `247:71297`, `247:71816`, `247:72757`, `247:73392`, `183:2712`; QR `183:2186…2493` | `pos/venta/CobroPanel.tsx` sobre `PanelAdaptable` (1120) con `SelectorMetodoPago`, `ListaPagos`, `SeccionPlegable` ×4, `ResumenTotales`, `BotonImporte` | render de CD:1680-2690 (la lógica se queda en `useCobro`) |
| Post-venta (escritorio, offline, móvil) | `247:74846`, `247:75030`, `250:83088` | `pos/venta/PostVenta.tsx` = `ResultadoOperacion` + `KbdButton` Enter / P / F / Esc | CD:~1690-1811 |
| Toasts del cobro | `183:2858`, `187:7509` | `sonner` traducido | `toast` + `alert` de CD |
| Mapa de atajos F1 (escritorio y hoja móvil) | `250:81064`, `250:83167` | `pos/venta/MapaAtajos.tsx` sobre `PanelAdaptable`, generado desde el registro de `useAtajos` | — (Nuevo) |
| Móvil v2 — productos Tarjetas / Lista, hoja de carrito, cobro, pagos, entrega, falta, post-venta | `250:81342`, `275:33959`, `250:81432`, `250:81853`, `250:82123`, `250:82681`, `250:82411`, `250:83088` | `BarraCobroMovil` (total + «Cobrar · F4») + `PanelCarrito` en `Sheet` + `CobroPanel` a pantalla completa | botón flotante P:800-822 y vistas excluyentes |
| Pendientes sin conexión / cliente sin conexión | `187:6906`, `187:7186`, `187:8362`; `187:7225`, `187:7322`, `187:8463` | revestir `PendientesSinConexionDialog` y `OfflineCustomerDialog` | — |
| CustomerPicker | `06 Clientes › CustomerPicker` (sin id en los docs) | `CustomerPicker` (kit) | `CustomerSelector` (lo usan PMS y mesas) |

Frames que **faltan** en Figma y que la implementación necesita (matriz de paridad §5 «Pendiente por cupo», más lo
visto aquí): tablet 1024 × 768 y 768 × 1024 (J-01…J-03), móvil sin caja (J-06), en espera (J-07), con deuda (J-08),
elegir sucursal (J-09), carrito vacío móvil (C-22), cobro móvil con Propina / Comisión / FE abiertas y procesando
(E-09, E-19, E-22, E-23), stock insuficiente móvil (E-25), catálogo cargando / error móvil (B-19), FE no configurada
(E-30), tarjeta «Sin precio» (B-14), etiqueta «Sin impuesto asignado» (C-21). Además, los frames «antes» de
`65-pos-coherencia-antes-escritorio-sin-caja.png` y `…-sin-catalogo.png` siguen con el carrito **viejo** («Guardar»,
«Descuento», líneas de una fila): **no son la referencia**; los estados sin caja y sin catálogo se construyen con el
`CartLine` v2 del frame `244:64655` (§5 H1).

### 3.2 Componentes de Figma → código

| Figma (`02 Componentes`) | Node id | Código | Dónde | Reemplaza |
|---|---|---|---|---|
| `Kbd` (Theme light/dark/on-brand × Length) | sección «POS v2» (id del set por leer) | **nuevo** `kit/Kbd.tsx` | kit, compartido | 6 `<kbd>` a mano: `shell/header/AppHeader.tsx:94`, `kit/SearchInput.tsx:176`, `pos/cajas/listado/CajasPage.tsx:369`, `app-layout/Header/GlobalSearch.tsx:370`, `chat/inbox/SearchPanel.tsx:266-271`, `SearchInConversation.tsx:292-301` |
| `KbdButton` (primary/outline/ghost/destructive × sm/md/lg) | «POS v2» | **nuevo** `kit/KbdButton.tsx` (envuelve `ui/button` + `Kbd`) | kit | botones de CV, CD, P |
| `CobrarButton` (default/sin-caja/falta/procesando/deshabilitado) | «POS v2» | **nuevo** `kit/BotonImporte.tsx` | kit (también «Registrar cobro» de CxC y «Pagar» de facturas) | botón «Cobrar» de CV:1316 y «Completar Venta» de CD:2562 |
| `CheckoutAccordion` (closed/open) | «POS v2» | **nuevo** `kit/SeccionPlegable.tsx` (sobre `ui/collapsible`; `FormSection colapsable` no sirve: no lleva resumen ni atajo) | kit | secciones de CD |
| `CartTag` (9 variantes: neutral/brand/warning/danger/success/info + descuento-manual/general/promocion) | «POS v2» | **nuevo** `kit/CartTag.tsx` (sobre `ui/badge` con `tono`) | kit (también mesas) | badges de CV:744-852 |
| `CartLine` (simple/extras/foco/recién-agregada/impuesto-excluido/editando-descuento × desktop/mobile) | `241:9682`; v3 `846:87947` (pendiente de aprobar) | **nuevo** `kit/CartLine.tsx` | kit (mesas `CartPanel`, ventas nueva) | líneas de CV |
| `CartLineAction` / `CartLineActionBar` / `LineActionsMenu` / `LineNote` | `845:557509`, `845:557864`, `845:557865`, `845:558032` | dentro de `CartLine` (subcomponentes) | kit | acciones de CV:1127-1190 |
| `ProductCard` variante `pos` (Size md/sm, Mostrar Top) | sección «Productos y POS» | **nuevo** `kit/ProductCard.tsx` | kit (catálogo de productos, ventas nueva, mesas «Agregar productos») | tarjeta de PS:684-870 |
| `ProductCardMovil` (tarjeta / lista × default/agotado/favorito/top/sin-foto) | «POS v2» | variantes `movil-tarjeta` y `movil-lista` del mismo `kit/ProductCard.tsx` (pregunta 7.8-3 de POS-UX-V2: recomiendo **un** componente) | kit | — |
| `ViewToggle` | `103:3095` | **nuevo** `kit/ViewToggle.tsx` (escritorio: dos iconos; móvil: un botón que alterna) | kit (catálogo de productos, mesas, reservas) | Compacta/Amplia de PS:576-593 |
| `SelectorVistaMenu`, `DensidadSelector` | `874:32008`, `270:10001` | **no se implementan** (retirados por la decisión final) | — | — |
| `CategoryBar` (chips / imágenes / combobox, estrella, Top) | en «Productos y POS» | **nuevo** `kit/CategoryBar.tsx` | kit (mesas `AddProductDialog`, ventas nueva) | `CategoryFilterBar` |
| `CustomerPicker` | `06 Clientes › CustomerPicker` | **nuevo** `kit/CustomerPicker.tsx` (fila compacta + popover/hoja) | kit (ventas nueva, mesas, PMS) | `CustomerSelector` (se deja como adaptador que delega, igual que `inventario/BranchBadge`) |
| `FilaDato` (6 tonos) | `680:406357` (creado por el agente de Ventas) | **nuevo** `kit/FilaDato.tsx` — **coordinar**: si el agente de Ventas lo crea primero, se usa el suyo | kit | filas de TS, CD, post-venta |
| Resumen de totales (Subtotal, impuestos por nombre, descuentos, cargo, total) | parte de `Carrito (listo)` y zona izquierda del cobro | **nuevo** `kit/ResumenTotales.tsx` (lista de `FilaDato` + total grande; slot para la fila del cargo) | kit (facturas, ventas, cajas) | render de TS:345-511 y CD:1910-1965 (la lógica de TS se queda) |
| Botones de método de pago + lista de pagos | parte de `247:69830` | **nuevo** `kit/SelectorMetodoPago.tsx` + `kit/ListaPagos.tsx` | kit (mesas, CxC «registrar cobro», facturas) | CD:2184-2305 |
| Tarjeta de resultado («¡Venta Completada!») | `247:74846` | **nuevo** `kit/ResultadoOperacion.tsx` | kit (cierre de caja, cobro de CxC) | CD:~1690-1737 |
| Diálogo con cuerpo / hoja adaptable | `586:312245` | `kit/Dialogo.tsx`, `kit/PanelAdaptable.tsx` (**ya existen**) | kit | portales propios de CD, diálogos de CV |
| `SearchInput`, `EmptyState`, `Badge`, `BranchBadge`, `SegmentedControl`, `CampoNumero`, `ActionSheet`, `RowActionsMenu`, `TabBar`, `FormField` | varios | **ya existen**; se amplían solo con props aditivas | kit | — |
| `AutorizacionSupervisor` | `893:582887` | **no en esta entrega** (D6) | — | — |
| `CargoServicioFila`, `AvisoPropinaVoluntaria` | `878:32064`, `878:32120` | **no en esta entrega** (D6); `ResumenTotales` deja el slot | — | — |

### 3.3 Componentes nuevos del kit: contrato

Todos: textos por props con valor por defecto desde el namespace `kit` (4 idiomas), colores solo con tokens
semánticos (sin `dark:`, hex ni `gray-*`), móvil por debajo de `lg`, pruebas de lógica en
`src/components/kit/__tests__/` y documentación en `KIT-CODIGO.md` (adenda «POS»).

| Componente | Props | Variantes / estados | Notas |
|---|---|---|---|
| `Kbd` | `tecla: string` (se normaliza «Ctrl+N», «Alt+1», «Supr», «Enter», «↑↓»), `tema?: 'claro' \| 'oscuro' \| 'marca'`, `className?` | largo corto/largo (automático) | `aria-hidden`; el atajo se anuncia con `aria-keyshortcuts` en el botón que lo lleva |
| `KbdButton` | las de `Button` + `atajo?: string`, `icono?: LucideIcon`, `ocultarIcono?` | `variant` primary/outline/ghost/destructive × `size` sm/md/lg | pone `aria-keyshortcuts` y el `Kbd` con el tema según la variante |
| `BotonImporte` | `etiqueta`, `importe?: ReactNode`, `atajo?`, `estado: 'listo' \| 'sinCaja' \| 'falta' \| 'procesando' \| 'deshabilitado'`, `textoFalta?`, `onClick`, `icono?`, `anchoCompleto?` | 5 estados de Figma | `procesando` = `aria-busy` + spinner; `falta` deshabilitado con motivo visible |
| `SeccionPlegable` | `titulo`, `resumen?: ReactNode`, `icono?`, `atajo?`, `abierta`, `onAbiertaChange`, `children` | cerrada / abierta | botón con `aria-expanded`/`aria-controls`; el contenido plegado sigue montado (como `FormSection colapsable`) |
| `CartTag` | `tono: 'neutro' \| 'marca' \| 'advertencia' \| 'peligro' \| 'exito' \| 'informacion' \| 'promocion'`, `icono?`, `children`, `onClick?`, `titulo?` (tooltip) | + `origen?: 'manual' \| 'general' \| 'promocion'` para descuentos | editable (botón) solo con `onClick` |
| `CartLine` | `linea: { id, nombre, variante?, sku?, miniatura?, cantidad, unidad?, precioUnitario, total, impuesto: { modo: 'encima' \| 'incluido' \| 'excluido' \| 'sinAsignar', importe? } }`, `etiquetas: ReactNode[]`, `incluido: { valor, deshabilitado?, onChange }`, `acciones: { nota, excluirImpuesto, quitar, descuento? }`, `onCantidad(n)`, `bloqueada?` (espera/deuda), `resaltada?` (recién agregada 1 s), `enfocada?`, `layout?: 'escritorio' \| 'movil'`, `editorDescuento?: ReactNode`, `editorNota?: ReactNode` | los 6 estados de v2; estados de cocina por `CartTag` | La línea **no calcula**: recibe importes ya calculados por el servicio y TS (L25) |
| `ProductCard` | `producto: { id, nombre, precio \| null, precioComparacion?, miniatura?, stock?: { nivel: 'ok' \| 'bajo' \| 'agotado', cantidad? } \| 'sinSeguimiento', variantes?, modificadores?, personalizable?, top?: number, favorito?, receta? }`, `variante: 'pos' \| 'movil-tarjeta' \| 'movil-lista'`, `tamano?: 'md' \| 'sm'`, `onElegir`, `onFavorito?`, `onReceta?`, `enfocada?` | default / agotado / favorito / top / sin-foto / sin-precio (nuevo, B-14) | toda la tarjeta agrega; botón «Elegir» se conserva; foco itinerante lo maneja la grilla |
| `ViewToggle` | `valor`, `onValorChange`, `opciones: { valor, etiqueta, icono }[]` (2), `modoMovil?: 'alternar'` | escritorio / móvil | `radiogroup` en escritorio (reutiliza la lógica de `SegmentedControl`), un solo botón con `aria-label` «Ver como lista» en móvil |
| `CategoryBar` | `categorias: { id, nombre, color?, imagen?, conteo?, favorita?, top? }[]`, `valor: id \| null \| 'favoritas'`, `onValorChange`, `modo: 'chips' \| 'imagenes' \| 'combobox'`, `onFavorita?`, `mostrarFavoritas?` | 3 modos de `pos_categories_display` | recorte con chevron de desplazamiento (`useDragScroll` existente) |
| `CustomerPicker` | `cliente?: { id, nombre, correo?, telefono?, documento?, pendienteSync? }`, `onCambiar`, `onQuitar`, `onVer?`, `onEditar?`, `buscar(texto) => Promise<…>`, `onCrear`, `onCrearSinRed?`, `abierto?`, `onAbiertoChange?`, `atajo?` | fila compacta; popover ≥ 640 / hoja < 640 | incluye «Espacios ocupados» como grupo opcional |
| `FilaDato` | `etiqueta`, `valor`, `tono?: 'neutro' \| 'fuerte' \| 'exito' \| 'peligro' \| 'advertencia' \| 'enlace'`, `sangria?`, `accesorio?` | 6 tonos | números tabulares |
| `ResumenTotales` | `filas: FilaDatoProps[]`, `total: { etiqueta, valor }`, `cabecera?: ReactNode` (interruptor «Impuestos incluidos»), `cargando?`, `vacio?` | normal / cargando / sin impuestos configurados | slot para la fila del cargo de servicio cuando exista |
| `SelectorMetodoPago` | `metodos: { codigo, nombre, icono? }[]` (los de la organización), `maxBotones = 4`, `valor`, `onValorChange`, `atajoBase?: 'Alt'` | botones + «Otro» con el resto en menú | resuelve el grave 9: nunca métodos fijos |
| `ListaPagos` | `pagos: { id, metodo, monto, qr? }[]`, `onQuitar`, `onGenerarQr?`, `accesorio?` | vacío / con pagos / QR procesando / QR cubierto | |
| `ResultadoOperacion` | `tono: 'exito' \| 'advertencia'`, `titulo`, `descripcion?`, `cifras: FilaDatoProps[]`, `aviso?: ReactNode`, `primaria`, `secundarias?`, `onCerrar` | éxito / pendiente de sincronizar | |
| `useAtajos` (hook del kit) | `useAtajos(mapa: { tecla, accion, cuando?, descripcion }[], { ambito })` | — | un solo `keydown` por ámbito; **ignora** teclas mientras el detector de escáner tiene una ráfaga pendiente y cuando el foco está en un campo (salvo F-keys, Esc y Alt+…); exporta el registro para el mapa F1. Pruebas puras del resolvedor de teclas |

Compartidos que conviene **acordar con otros agentes antes de crearlos** (para construirlos una sola vez):
`FilaDato` (agente de Ventas ya lo tiene en Figma), `ResumenTotales` y `ResultadoOperacion` (cajas, facturas),
`SelectorMetodoPago` / `ListaPagos` (CxC, facturas), `ViewToggle` (catálogo de productos, mesas), `CustomerPicker`
(ventas nueva, mesas, PMS), `ProductCard` (catálogo). Propuesta: el POS los crea en el kit con el contrato de arriba
y los demás los adoptan; si alguno ya existe cuando arranque la implementación, se usa ese.

---

## 4. Plan por pasos

Principios: cada paso deja el POS funcionando y se puede revertir solo; la lógica **se mueve antes** de cambiar la
piel y nunca se reescribe; un paso = un commit (`feat(GO-<id>): …`) con `npx jest`, `npx tsc --noEmit -p
tsconfig.json` (con heap ampliado: memoria «tsc») y `npx next build` en verde (o con los fallos preexistentes
documentados en `CLAUDE.md`); verificación en el navegador (preview) a **1440 × 900, 1024 × 768, 768 × 1024 y
390 × 844** con capturas en `docs/implementacion/capturas/pos-paso-NN-*.png`; textos en `posVenta` / `posCobro` /
`kit` en los 4 idiomas en el mismo paso que los introduce.

| Paso | Qué | Archivos | Verificación específica |
|---|---|---|---|
| **0. Puerta de entrada** | Esperar al agente del cobro. Releer `posService.ts`, `CheckoutDialog.tsx`, `pos_checkout_v1` (definición en la base), `pedidosService`, `VentasService` y actualizar §0.2 con los contratos reales. Congelar la línea base: jest / tsc / build, capturas «antes» en las 4 resoluciones de: vacío, listo, sin caja, en espera, en deuda, cobro inicial, cobro con propina, post-venta, sin conexión (Desktop si se puede) | este documento | ninguna regresión en la línea base |
| **1. Caracterización y extracción de lógica** | Extraer **literalmente** a `src/lib/pos/venta/` las funciones y hooks de §2 (L1-L58): `inicializarCarritos`, `cerrarCarrito`, `decidirAccionProducto`, `enriquecerVariante`, `resolverCodigo`, `insigniasDe`, `estadoBotonCobrar`, `puedeRegistrarDeuda`, `cuentasDelCobro`, reductor de pagos, estado de entrega, `estadoPostVenta`, `useEnviarCocina`, `useCatalogoPos`, `useCobro` (todo el estado de CD sin JSX). Escribir las ~40 pruebas. **Tratar las ~345 aserciones que leen fuente** (§5 R1): cada una se reapunta al archivo nuevo o se convierte en prueba de la función extraída, con una línea en el propio test que diga por qué | `src/lib/pos/venta/**`, `P`, `PS`, `CV`, `CD` (solo imports), `src/__tests__/pos/venta/**`, los 20 archivos de prueba de §5 R1 | la UI no cambia ni un píxel (capturas iguales a las del paso 0); todas las pruebas de L25 sin tocar |
| **2. Kit base** | `Kbd` (+ sustituir los 6 `<kbd>` a mano), `KbdButton`, `BotonImporte`, `SeccionPlegable`, `FilaDato`, `ResumenTotales`, `CartTag`, `ViewToggle`, `useAtajos` (solo el hook), claves `kit.*` en 4 idiomas, adenda de `KIT-CODIGO.md` | `src/components/kit/*` nuevos, `kit/index.ts`, `messages/*.json` (`kit`), `AppHeader.tsx`, `SearchInput.tsx`, `CajasPage.tsx`, `GlobalSearch.tsx`, `SearchPanel.tsx`, `SearchInConversation.tsx` | pruebas de lógica del kit; captura de las pantallas donde cambió el `<kbd>` |
| **3. Cabecera** | `CabeceraPos` con `KbdButton` F9 (abre apertura/cierre por programa: pedir al agente de cajas una prop `abierto`/`onAbiertoChange` en `AperturaCajaDialog` y `CierreCajaDialog`), indicador con `Kbd` F10, contadores, reloj con la zona de la organización (`formatTimeInTz`), `BranchBadgeActiva`. En móvil no se dibuja (la lleva el `MobileHeader`); sheet «Caja y dispositivo» con «Abrir caja · F9» también sin caja (J-06) | `pos/venta/CabeceraPos.tsx`, `P` | L35-L40; `cajasCierreYApertura.test.ts` reapuntado |
| **4. Buscador y grilla** | `ProductCard` (kit), `GrillaProductos` con `SearchInput` (atajo «/»), `ViewToggle` Tarjetas \| Lista con preferencia en `pos_vista_productos`, scroll infinito (tarjetas 16 / lista 20 por página, `pos_product_ranking` ya pagina), contador «{total} productos» solo ≥ md, estados cargando / error / vacío / sin catálogo, receta en `Dialogo`. `ProductSearch` queda como adaptador fino para `NuevaVentaPage` hasta que el agente de Ventas migre | `kit/ProductCard.tsx`, `pos/venta/GrillaProductos.tsx`, `PS` | L14-L24; buscar, escanear (lector USB simulado con teclado rápido), variantes, agotado, favorito, sin red |
| **5. Categorías** | `CategoryBar` (kit) con los 3 modos, estrella y «Top»; `CategoryFilterBar` delega en él (mesas lo sigue usando) | `kit/CategoryBar.tsx`, `CFB` | L21, L23; los 3 modos con `pos_categories_display` |
| **6. Línea del carrito** | `CartLine` (kit) con renglón 1 / renglón 2, `CartTag`, «+ Agregar descuento · D» y edición inline con frecuentes, nota (editor actual), excluir impuesto (T), quitar (Supr), «Incluido», confirmación al llegar a 0. **Sin tocar ningún cálculo**: la línea recibe importes | `kit/CartLine.tsx`, `CV` (solo el render de líneas) | L5-L9, L25-L30, L59; las 18 + 6 pruebas de impuestos intactas |
| **7. Resumen y botonera** | `ResumenTotales` alimentado por `TaxSummary` (su cálculo se queda; su render pasa al kit), `BotonImporte` «Cobrar · $ · F4» con los estados de L35, `AccionesCarrito` (Descuento D · Espera F6 · Deuda F7 · Cocina F8), estados en espera y con deuda (Ver factura, Imprimir, Cobrar, Anular con confirmación) | `pos/venta/AccionesCarrito.tsx`, `TS`, `CV` | L10, L33, L35, L36, L55-L58; guardarraíl «Pantalla del cliente» reapuntado si mueve el callback |
| **8. Pestañas y cliente** | Pestañas con `KbdButton` «+ · Ctrl+N», resumen compacto del carrito, `CustomerPicker` (kit) con «Cambiar · F2»; `CustomerSelector` delega en él (PMS y mesas no cambian de contrato) | `kit/CustomerPicker.tsx`, `CT`, `CS`, `P` | L11-L13, L31-L34 |
| **9. Panel del carrito completo** | `PanelCarrito` (560 px en 1440; scroll interno de líneas con totales y botón fijos), «Elige la sucursal para vender», vacío, cargando, error. Decisión D1 aplicada (divisor) | `pos/venta/PanelCarrito.tsx`, `P` | L1-L4, L38; medición del frame D3: total y «Cobrar» visibles sin scroll con 4 líneas en 1440 × 900 |
| **10. Descuento (pestaña «A un producto»)** | `DialogoDescuento` con la lista de líneas y el flujo de hoy (`updateCartItemDiscount`, frecuentes). «A toda la venta» y los badges de origen quedan para cuando exista `discount_source` (D5) | `pos/venta/DialogoDescuento.tsx` | L8, L9; errores de validación del servidor (contrato del agente del cobro) |
| **11. Cobro: contenedor** | `CobroPanel` sobre `PanelAdaptable` (1120, hoja a pantalla completa en móvil) con zona izquierda (`ResumenTotales`, Total pagado / Falta / Cambio), `SelectorMetodoPago` + `ListaPagos` con los métodos de la organización, pie `Cancelar · Esc` + `BotonImporte` «Completar venta · Enter». Todo el estado sale de `useCobro` (paso 1): **cero lógica nueva**. Mantener la API pública de `CheckoutDialog` (`cart, open, onOpenChange, onCheckoutComplete, onProcessPayment, organization, currentUser, branch`) para mesas y ventas nueva | `pos/venta/CobroPanel.tsx`, `kit/SelectorMetodoPago.tsx`, `kit/ListaPagos.tsx`, `CD` (pasa a ser el contenedor) | L41-L43, L47, L50, L53, L54; probar también desde `/app/pos/mesas/[id]` y `/app/pos/ventas/nuevo` |
| **12. Cobro: secciones** | `SeccionPlegable` Entrega (Alt+D), Propina (Alt+P), Comisión, Factura electrónica (Alt+F, con estado «no configurada»: E-30); seriales, stock de recetas, QR y propina desde la pantalla, sin cambiar su lógica | `pos/venta/cobro/*.tsx` | L44-L49, L52 |
| **13. Post-venta** | `PostVenta` con `ResultadoOperacion`: Nueva venta (Enter), Reimprimir (P), Factura electrónica (F, solo con CUFE), Cerrar (Esc); aviso del recibo automático **sin** badge «Nuevo» y variante «sin impresora de caja»; variante offline «Pendiente de sincronizar · OFF-…» | `pos/venta/PostVenta.tsx` | L51, L52 |
| **14. Atajos y mapa F1** | Registrar en `useAtajos` el mapa canónico de POS-UX-V2 §3 (F1 F2 F4 F6 F7 F8 F9 F10, Ctrl+N, Ctrl+Tab, Ctrl+B, línea con foco, Alt+1…5 / E / P / D / F en el cobro, Enter / P / F en post-venta); `MapaAtajos` generado desde el registro; `Kbd` visibles | `pos/venta/MapaAtajos.tsx`, `useAtajos` en `P` y `CobroPanel` | prueba del resolvedor: las teclas no disparan dentro de campos, no chocan con el lector (ráfaga de 13 dígitos + Enter con la grilla enfocada ⇒ un escaneo, cero atajos) ni con el navegador (F3, F5, F11, F12, Ctrl+letra evitados) |
| **15. Móvil y tablet** | `BarraCobroMovil` (total + «Cobrar · F4», o «Abrir caja para cobrar» sin caja), `PanelCarrito` en `Sheet` con «×» / «Seguir comprando» (A-15), estados en espera / deuda / vacío / elegir sucursal en la hoja, cobro a pantalla completa con las 4 secciones; tablet según D2 | `pos/venta/BarraCobroMovil.tsx`, `P` | las 4 resoluciones; `ocultarBarra` del `MobileHeader` |
| **16. Idiomas y limpieza** | Barrido: 0 cadenas en español fijas en los archivos tocados (`posVenta`, `posCobro`, `kit`), plurales ICU, moneda y fechas por organización; borrar los 11 archivos muertos de §1.1; lint limpio en los archivos tocados; actualizar `POS-PARIDAD-PANTALLA-PRINCIPAL.md` (filas pasan a «hecho») y `PROGRESS.md` (añadiendo) | `messages/*.json`, `src/components/pos/*` muertos | cambiar el idioma de la organización a en/fr/pt y recorrer los estados del paso 0 |

Orden alternativo si el agente del cobro se retrasa: los pasos 2-10 y 14-15 (sin el cobro) no dependen de él; los
pasos 11-13 sí. El paso 1 se puede hacer en dos mitades (carrito y catálogo primero; cobro después).

Estrategia de «no romper», en una lista:

1. **La lógica no se reescribe, se mueve**: hooks y funciones puras con prueba antes del primer cambio visual.
2. **Contratos públicos intactos**: `CheckoutDialog`, `CustomerSelector`, `ProductSearch`, `CategoryFilterBar`,
   `VariantSelectorDialog`, `TaxSummary` siguen exportando lo mismo; por dentro delegan en el kit (patrón de
   `inventario/BranchBadge` → `kit/BranchBadgeActiva`). Así mesas, PMS, ventas nueva, transporte y facturas no se
   enteran.
3. **Sustitución por partes**, en el orden del plan, con capturas de antes y después.
4. **Sin cambios de base de datos** en esta entrega (todos los de §6 de la matriz de paridad o ya los hace el agente
   del cobro o quedan para después).
5. **Pruebas que leen fuente**: nunca se borran sin reemplazo; si hay que reapuntar una, el test lo dice.
6. **Coordinación**: `messages/*.json` se edita solo en el namespace propio, leyendo justo antes de commitear y
   revisando `git diff messages/`; `git status -sb` y `git diff --cached` antes de cada commit (árbol compartido).

---

## 5. Riesgos, huecos del diseño y decisiones del dueño

### 5.1 Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | **~345 aserciones leen el texto de los archivos** (`guardrails.test.ts` 50 — de ellas las de «Pantalla del cliente» L1287-1303 y 27b L2125-2129 tocan el POS —, `tester-f2c-r3/r4/r5/r7/r8/r11` ≈ 180, `qr-payment-f2c-r4/r7/r8/r9` ≈ 58, `integracion-f2` 10, `tip-f2b` 6, `impuestosLineaCarrito` 7, `cajasCierreYApertura` 7, `tester-r1/r2-parte-d` 10, `tester-f2b-r3/r9` 5). Al mover código de `CheckoutDialog.tsx`, `CartView.tsx`, `TaxSummary.tsx` o `page.tsx` fallan aunque el comportamiento sea el mismo | Paso 1 dedicado: inventario aserción por aserción; las que fijan un comportamiento se convierten en pruebas de la función extraída; las que fijan «que exista X en el archivo» se reapuntan al archivo nuevo con comentario. Tope: nunca bajar el número de comportamientos cubiertos |
| R2 | El agente del cobro cambia `posService` / `CheckoutDialog` mientras se extrae la lógica | No empezar el paso 1 de cobro hasta que su trabajo esté en `main`; empezar por carrito y catálogo |
| R3 | Componentes compartidos con mesas, PMS, ventas nueva, transporte, facturas | Adaptadores con la API de hoy (§4 principio 2); probar esas pantallas en los pasos 5, 8 y 11 |
| R4 | Atajos que chocan con el lector de códigos (el wedge escucha `keydown` en captura) o con el navegador | `useAtajos` consulta al detector antes de actuar; letras sueltas (D, N, T, P, F) solo con una línea o la post-venta enfocadas; prueba de ráfaga en el paso 14 |
| R5 | Escaneo con el cobro abierto se agrega al carrito de fondo (el cobro no es un diálogo Radix, §1.5) | Con `PanelAdaptable` desaparece; decidir si se quiere lo contrario (D10) |
| R6 | Rendimiento: grilla con scroll infinito + imágenes; incidente de 2026-09-14 por ráfagas de consultas | Página de 16/20, `IntersectionObserver` con un solo pedido en vuelo, cancelar al cambiar de búsqueda; la RPC ya pagina |
| R7 | Traducir ~575 cadenas en 4 idiomas mientras otros agentes editan `messages/*.json` | Namespaces propios, escritura justo antes del commit, revisión del diff |
| R8 | `tsc` sin memoria da un falso «0 errores» | Correrlo con heap ampliado (memoria «tsc»), comparar con los ~190 errores preexistentes |
| R9 | Los diálogos de caja están en edición por el agente de cajas | El POS solo necesita abrirlos por programa: pedir la prop, no tocarlos |

### 5.2 Huecos y contradicciones del diseño frente a la lógica

| # | Hueco | Evidencia | Propuesta |
|---|---|---|---|
| H1 | Los frames «sin caja» y «sin catálogo» de escritorio (capturas `65-pos-coherencia-antes-*`) usan el carrito viejo («Guardar», «Descuento», líneas de una fila) | `65-…-sin-caja.png`, `65-…-sin-catalogo.png` frente a `11-pos-v2-carrito-listo.png` | Seguir el carrito v2 (`244:64655`); anotar en Figma cuando vuelva el cupo |
| H2 | Tablet sin frames (grave 1) | matriz J-01…J-03 | D2 |
| H3 | Móvil sin frames de sin caja, en espera, con deuda, vacío, elegir sucursal, cobro con secciones abiertas y procesando (graves 2-5) | matriz §5 | Construir con los mismos componentes que escritorio en disposición móvil; capturas al dueño en el paso 15 |
| H4 | Métodos de pago fijos (Efectivo · Tarjeta · Transferencia · QR · Otro) | BD: activos `cash` 72, `card` 72, `transfer` 72, `wompi` 5, `QR` 1, `001` 1 organizaciones | `SelectorMetodoPago` con los N primeros de la organización + «Otro»; `Alt+1…4` por posición |
| H5 | «Caja 1 · 8:02» en la cabecera móvil: `pos_terminals` tiene 0 filas y `cash_sessions` no tiene terminal | BD | Mantener «Caja abierta · {hora}» (ya en código) salvo D3 |
| H6 | «Recibo enviado a …» marcado «Nuevo» y ya existe; falta la variante sin impresora | CD:1194-1263 | Sin badge; variante con el aviso de CD:1257 |
| H7 | Cobro con cupón y cargo de servicio dibujados sin respaldo en `pos_checkout_v1` | matriz E-29, E-32 | Fuera de esta entrega (D6) |
| H8 | `CheckoutDialog` dice «Total $ X» en la cabecera y «Total a pagar $ Y» (con propina y flete) | L9 de la matriz | Cabecera «Productos: $ X» |
| H9 | Propina 15 % y 20 % ofrecidas frente a la decisión 6 de cargos (tope 10 %) | CD:2359, `settingsSchema.ts:69` | D7 |
| H10 | «Anular» deuda: Figma lo dibuja con confirmación, el código no confirma | CV:630-645 | Confirmación (es destructivo; el diseño manda) |
| H11 | Escaneo de una variante con modificadores pierde la variante (B-06) | PS:338-345 | Conservar el comportamiento en esta entrega; arreglo aparte (preseleccionar la variante en el diálogo) |
| H12 | «Excluir impuesto» (C1) no se cobra igual que se muestra | POS-CARRITO-LINEAS-NOTAS §7.5 | **No se toca** (encargo); queda la decisión del dueño pendiente de ese documento |
| H13 | Reloj de la cabecera sin la zona de la organización | P:652 | Usar `formatTimeInTz(now, timezone)` (regla de fechas 3); es un cambio de presentación, no de lógica |
| H14 | Realtime de `cash_sessions` no llega (tabla fuera de la publicación) | BD | Fuera de esta entrega (migración de otro agente); la cabecera sigue refrescando al abrir/cerrar desde este equipo |

### 5.3 Decisiones que debe tomar el dueño (con recomendación)

| # | Decisión | Recomendación |
|---|---|---|
| D1 | Divisor arrastrable 75/25 de hoy frente a reparto fijo 808/560 de Figma | **Conservar el arrastre** con 560 px (≈ 39 % en 1440) como ancho por defecto y un mínimo de 400: no se pierde función y se cumple el diseño |
| D2 | Tablet 1024 × 768: lado a lado o vista móvil | **Lado a lado desde 1024** (carrito 400, grilla de 2) como hoy; **768 vertical = móvil con hoja**. Pedir los 4 frames de tablet cuando vuelva el cupo de Figma |
| D3 | «Caja 1» con nombre de terminal | **No** en esta entrega: «Caja abierta · 8:02». Nombre de terminal cuando existan terminales (`pos_terminals` vacía) |
| D4 | Sin caja: el botón pasa de deshabilitado a «Abrir caja para cobrar · F9» y **respeta `pos_require_cash_session`** (hoy el carrito lo ignora y el cobro sí lo mira) | Sí a las dos: con la configuración apagada se cobra sin caja, como ya permite el cobro |
| D5 | Descuento «A toda la venta» y badges de origen necesitan la columna `discount_source` (aprobada, sin migrar) | Esta entrega: botón «Descuento · D» con la pestaña «A un producto». «A toda la venta» cuando exista la columna y el agente del cobro valide descuentos en el servidor |
| D6 | Cargos de servicio y autorización de supervisor (diseños aprobados parcialmente) | **Después**, en su propia tarea: les falta todo el backend (`sale_service_charges`, `fn_calcular_cargos_servicio`, cambios en `pos_checkout_v1`, `pos.authorize`, PIN, `pos_authorizations`) y dependen de la RPC del cobro. Esta entrega deja los huecos: slot en `ResumenTotales`, sección en el cobro, acción «⋯» en `CartLine` |
| D7 | Porcentajes de propina 15/20 % frente al tope del 10 % | Ofrecer 5 y 10 % (y «otro valor») en el cobro y en la pantalla del cliente, leídos de la misma configuración |
| D8 | «Exacto» y montos rápidos sobre el total o sobre lo que falta (pago mixto) | Sobre **lo que falta**; es un cambio de comportamiento pequeño: va con su prueba y el dueño lo aprueba |
| D9 | Añadir `@testing-library/react` + `jest-environment-jsdom` (solo para los archivos que lo pidan con docblock) | **Sí**: permite pruebas de render de los componentes del kit (pendiente de KIT-CODIGO) y del POS; hoy solo se puede probar lógica |
| D10 | Escaneo con el cobro abierto | Ignorarlo (no agregar al carrito de fondo) con un toast «Cierra el cobro para agregar productos» |
| D11 | Abono parcial de una deuda desde el cobro (el servicio lo soporta, la pantalla lo impide) | No en esta entrega; se decide con el agente de CxC |
| D12 | Defecto de la vista en móvil (Tarjetas o Lista) | Tarjetas por defecto, recordando la elección por dispositivo |
| D13 | Comisión de vendedor con atajo `Alt+C` | Sí, si no se aprueban los cargos de servicio (que también querían `Alt+C`); si se aprueban, la comisión queda sin atajo |

### 5.4 Node id para leer en Figma en la fase de implementación

Los ids de los component set que los documentos dan como sección y no como id: `Kbd`, `KbdButton`, `CartTag`,
`CheckoutAccordion`, `CobrarButton`, `ProductCardMovil` (sección «POS v2» de `02 Componentes`), `ProductCard`
variante `pos` y `CategoryBar` (sección «Productos y POS»), `CustomerPicker` (`06 Clientes`), el frame
`Carrito (listo)` de `05 POS y ventas › Carrito` y el `ViewToggle` `103:3095` (medidas exactas). Además, cuando vuelva
el cupo: `155:7745` (`PosProductSearch`, estado real tras la decisión final), `250:81342` y `275:33959` (botón que
alterna), y el orden de capas pendiente de `874:582518` / `874:582587` (ya retirados por la decisión final; confirmar
que se borraron).
