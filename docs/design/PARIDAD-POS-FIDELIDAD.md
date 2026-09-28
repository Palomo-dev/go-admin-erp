# Paridad POS — tanda de fidelidad (Figma: `05 POS y ventas`, `06 Clientes`, `07 Finanzas`)

Archivo Figma «GO Admin — Sistema de diseño» (`EAvjINVRnlzFM70GVoWXgl`). Las pantallas viven en `05 POS y ventas`
(Secciones «Cobro», «Cabecera y caja», «Carrito», «Buscador y grid», «Configuración › POS»), en `06 Clientes`
(«CustomerPicker») y en `07 Finanzas` («Impuestos»); los componentes, en `02 Componentes`; la página de trabajo
`04 POS — fidelidad` se consolidó y se eliminó el 2026-09-22 por decisión del dueño (ver «Consolidación» al final).
Fuente de verdad: `docs/design/AUDITORIA-CONTROLES-PRODUCTOS-POS.md`. Una fila por control de la
auditoría. Estados: **calcado** (existe en código y se dibujó igual), **Nuevo** (no existe en código;
lleva badge «Nuevo» en Figma), **sustituido por …** (lo roto de B.19 se reemplaza por el componente
del kit), **omitido: motivo**.

Convenciones de los frames: escritorio 1440 de ancho, móvil 390; cada sección lleva sus diálogos
abiertos y sus estados en frames propios. Los textos son las etiquetas exactas del código; cuando la
auditoría marca una tilde ausente («codigo», «Ya pague», «Sesion», «metodo») se dibuja corregida.

## 1. Cobro — B.16 `CheckoutDialog`, B.17 QR, B.18 post-venta, B.6 seriales

Sección Figma: `05 POS y ventas › Cobro` (título interno «Cobro — B.16 CheckoutDialog · B.17 QR · B.18 post-venta · B.6 seriales»).
Frames: `Escritorio / POS — Cobro (CheckoutDialog, 2 columnas)` (1440×1829, overlay sobre el POS),
`Móvil / POS — Cobro (Sheet a pantalla completa)` (390×2927), `CheckoutDialog — estado «Falta dinero»`,
`CheckoutDialog — estado «Procesando...»`, `TipFromDisplayNotice — 5 estados`, `QrPaymentDialog` ×4,
`SerialSelectorDialog`, `ConfirmDialog «Stock insuficiente de ingredientes»`, `Post-venta` ×2,
`Toasts del cobro` (18), `Móvil / POS — Cobro › Pago QR (sheet)`, `Móvil / … › ¡Venta Completada!`,
`Móvil / … › Selección de Seriales`.

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| B.16 #1 | toast «No hay caja abierta» · «Debe abrir una caja antes de realizar ventas. Vaya a POS → Cajas.» | Toasts del cobro | calcado (Toast error del kit) |
| B.16 #2 | cabecera «Procesar Pago» + «{n} productos · Total: {$}» con icono CreditCard verde | CheckoutDialog escritorio y sheet móvil | calcado |
| B.16 #3 | botón X cierra | CheckoutDialog (IconButton X) | calcado |
| B.16 #4 | tabla «Resumen de Venta» «{name} x{qty}» {$} | CheckoutDialog › Resumen de Venta | calcado |
| B.16 #5 | «Subtotal:» / «Impuestos:» / «Descuentos:» «-$» / «Total:» | CheckoutDialog › Resumen de Venta | calcado |
| B.16 #6 | tarjeta azul «Subtotal: (base imponible)» / «Impuestos:» / «Propina:» / «Flete:» / «Total a pagar:» / «Total pagado:» / «Falta:» / «Cambio:» | CheckoutDialog › Totales a pagar (Cambio en estado ok; Falta en estado «Falta dinero») | calcado |
| B.16 #6 (ampliación E.7c) | desglose «{nombre} {tasa}» por impuesto bajo «Impuestos:» | CheckoutDialog › Totales a pagar › «Desglose por impuesto» | Nuevo (badge) — el cobro hoy no desglosa por nombre |
| B.16 #7 | sección (Truck) «Entrega» | CheckoutDialog › Entrega | calcado |
| B.16 #8 | segmento «Recoger» / «Envío propio» / «Tercero» | Entrega (Envío propio en la pantalla principal; Recoger en «Falta dinero»; Tercero en «Procesando...») | calcado |
| B.16 #9 | menú «Conductor asignado» «{name} · {phone}» | Entrega (solo Envío propio) | calcado |
| B.16 #10 | aviso (MapPin) «Dirección del cliente cargada. Puedes modificarla si el envío es a otro lugar.» | Entrega | calcado |
| B.16 #11 | campo «Dirección de entrega *» «Escribe la dirección o busca por nombre/teléfono...» | Entrega (estado focus con resultados abiertos) | calcado |
| B.16 #12 | menú de resultados «{name}» + (MapPin) «{address}, {city}» | Entrega › Resultados de dirección | calcado |
| B.16 #13 | campo «Ciudad» | Entrega | calcado |
| B.16 #14 | campo «Teléfono contacto» «300 123 4567» | Entrega | calcado |
| B.16 #15 | campo «Nombre contacto» «Nombre de quien recibe» | Entrega | calcado |
| B.16 #16 | campo «Instrucciones» «Portón negro, apartamento 302...» | Entrega | calcado |
| B.16 #17 | menú «Tarifa de envío» «{rate_name} - {$}» | Entrega | calcado |
| B.16 #18 | segmento «Pago del envío»: «Pagado» / «Pendiente» | Entrega | calcado |
| B.16 #19 | texto «El envío se creará como pendiente de pago. Podrás marcarlo como pagado al entregar.» | Entrega | calcado |
| B.16 #20 | sección (Wallet) «Métodos de Pago» | CheckoutDialog › Métodos de Pago | calcado |
| B.16 #21 | botón (Plus) «Agregar» (pago mixto) | Métodos de Pago | calcado |
| B.16 #22 | «Pago {n}» por entrada | Métodos de Pago › Pago 1 / Pago 2 | calcado |
| B.16 #23 | botón (Trash) «Eliminar» | Métodos de Pago › Pago n | calcado |
| B.16 #24 | menú «Método» → `{method.name}` | Métodos de Pago (Efectivo / QR Bancolombia) | calcado |
| B.16 #25 | campo «Monto» | Métodos de Pago | calcado |
| B.16 #26 | botones «Exacto» + montos rápidos «50k» «100k» «200k» «500k» «1M» | Métodos de Pago › Pago 1 (Chips toggle) | calcado |
| B.16 #27 | botón (QrCode) «Generar QR de pago» / «Generando…» | Métodos de Pago › Pago 2 («Generando…» en estado «Procesando...») | calcado |
| B.16 #28 | toast «Link de pago abierto» · «Se abrió el link de pago de Bold…» | Toasts del cobro | calcado (tilde corregida) |
| B.16 #29 | checkbox (Percent) «Impuestos incluidos en precios» | CheckoutDialog columna derecha | calcado |
| B.16 #30 | sección (Banknote) «Propina (opcional)» | CheckoutDialog › Propina | calcado |
| B.16 #31 | aviso «Pantalla del cliente: esperando la propina…» + «Omitir» / «La pantalla muestra las propinas sugeridas…» + «Continuar» | TipFromDisplayNotice — 5 estados (y dentro del cobro escritorio) | calcado |
| B.16 #32 | «Cliente eligió {p} % ({$})» / «…una propina de {$}» / «…no dejar propina» + «Aplicar» / «Cambiar» / «Entendido» | TipFromDisplayNotice — 5 estados (y dentro del sheet móvil) | calcado |
| B.16 #33 | botones «5%» «10%» «15%» «20%» | Propina (10 % seleccionado) | calcado |
| B.16 #34 | campo «Monto personalizado» | Propina | calcado |
| B.16 #35 | menú «Mesero (opcional)» «Seleccionar...» | Propina | calcado |
| B.16 #36 | «Propina:» {$} verde | Propina | calcado |
| B.16 #37 | sección (User) «Comisión de Vendedor (opcional)» | CheckoutDialog › Comisión | calcado |
| B.16 #38 | menú «Vendedor» | Comisión | calcado |
| B.16 #39 | segmento «Comisión»: «%» / «Monto» | Comisión | calcado |
| B.16 #40 | campo tasa/importe | Comisión › «Tasa (%)» | calcado |
| B.16 #41 | «Comisión ({rate}%):» {$} azul | Comisión | calcado |
| B.16 #42 | switch (Zap) «Factura Electrónica» + (Info) tooltip + badge «Global» | CheckoutDialog › Factura Electrónica + Tooltip dibujado | calcado |
| B.16 #43 | botón (X) «Cancelar» | pie del CheckoutDialog (disabled en «Procesando...») | calcado |
| B.16 #44 | botón «Completar Venta · {$}» / «Falta dinero» / «Procesando...» | pie: pantalla principal / estado «Falta dinero» / estado «Procesando...» | calcado (color: primario de marca en vez de verde, decisión de manual) |
| B.16 #45 | diálogo «Selección de Seriales» | SerialSelectorDialog (+ sheet móvil) | calcado |
| B.16 #46 | diálogo «Stock insuficiente de ingredientes» «¿Deseas continuar…?» «Cancelar» / «Continuar» | ConfirmDialog del kit | calcado |
| B.16 #47 | toast «El cliente indica que ya pagó» | Toasts del cobro | calcado |
| B.16 #48 | toasts «Se requiere una sucursal…» · «No hay saldo pendiente…» · «Método QR no soportado» · «Error al generar QR» | Toasts del cobro | calcado (tilde corregida) |
| B.16 #49 | `alert('Error al procesar el pago: …')` nativo | Toasts del cobro › «Error al procesar el pago» | sustituido por Toast error (B.19 #2) |
| B.16 estados | «Procesando...» / «Generando…»; offline «Sin conexión: venta {nº} guardada…», envío manual, factura DIAN; impresión «No hay impresora…», «No se pudo encolar…»; DIAN «Enviando…», «Factura enviada a DIAN», «Error al enviar a DIAN», «…enviada a impresora» | estado «Procesando...» + Toasts del cobro | calcado; skeleton al cargar métodos/impuestos/meseros: omitido: el código no lo tiene y el diálogo abre con datos ya cargados (decisión: no inventar) |
| B.16 «No existe» | cliente obligatorio, cargo a habitación, fiado desde el cobro, WhatsApp/correo, notas, cupones, redondeo, voucher, datáfono | — | omitido: no existe en código y el brief pide no inventar sin decisión del dueño (pregunta abierta) |
| B.17 #1 | diálogo (QrCode) «Pago QR - {providerLabel}» · «Escanea el código QR…» | QrPaymentDialog ×4 + sheet móvil | calcado (tilde corregida) |
| B.17 #2 | imagen QR 208×208 | QrPaymentDialog esperando/verificando | calcado |
| B.17 #3 | (Clock) «Expira en mm:ss» | QrPaymentDialog | calcado |
| B.17 #4 | checkbox «Mostrar en pantalla del cliente» + «(sin pantalla conectada)» | QrPaymentDialog esperando / verificando | calcado |
| B.17 #5 | tabla «Referencia» · «Monto» · «Proveedor» | QrPaymentDialog | calcado |
| B.17 #6 | «Cancelar» / «Cerrar» | QrPaymentDialog (Cerrar en pagado y expirado) | calcado |
| B.17 #7 | «Ya pagué» / «Verificando...» | QrPaymentDialog esperando / verificando | calcado (tilde corregida) |
| B.17 #8 | «Pago confirmado» · «Se cerrará automáticamente en unos segundos.» + toast «Pago QR confirmado» | QrPaymentDialog pagado + Toasts | calcado |
| B.17 #9 | «El tiempo ha expirado» · «Solicita un nuevo código QR…» | QrPaymentDialog expirado | calcado |
| B.18 #1 | «¡Venta Completada!» · «Venta #{id} procesada exitosamente» | Post-venta ×2 + sheet móvil | calcado |
| B.18 #2 | badge «Pendiente de sincronizar · {receipt_number_local}» | Post-venta (offline) | calcado |
| B.18 #3 | «Total:» · «Pagado:» · «Cambio:» | Post-venta | calcado |
| B.18 #4 | (Printer) «Re-imprimir Recibo» | Post-venta | calcado |
| B.18 #5 | (Printer) «Factura Electrónica» | Post-venta | calcado |
| B.18 #6 | «Cerrar» | Post-venta | calcado |
| B.6 #1 | diálogo (Package) «Selección de Seriales» | SerialSelectorDialog | calcado |
| B.6 #2 | «Selecciona los seriales… Total: {N} producto(s) serializado(s).» | SerialSelectorDialog | calcado |
| B.6 #3 | `{name}` · «SKU: {sku} · Cantidad: {N}» (verde al completar) | SerialSelectorDialog (5 productos) | calcado |
| B.6 #4 | badge «{sel}/{req}» verde / naranja | SerialSelectorDialog | calcado |
| B.6 #5 | «Cargando seriales disponibles...» | SerialSelectorDialog › producto 3 | calcado |
| B.6 #6 | (AlertCircle) «Error cargando seriales» | SerialSelectorDialog › producto 5 | calcado |
| B.6 #7 | «No hay seriales disponibles en stock para este producto.» | SerialSelectorDialog › producto 4 | calcado |
| B.6 #8 | campo (Search) «Buscar serial...» | SerialSelectorDialog | calcado |
| B.6 #9 | fila check + serial | SerialSelectorDialog › producto 1 | calcado |
| B.6 #10 | badge «Garantía hasta: {warranty_end}» | SerialSelectorDialog › producto 1 | calcado |
| B.6 #11 | «Solo hay {N} serial(es) disponible(s) pero se requieren {M}.» | SerialSelectorDialog › producto 2 | calcado |
| B.6 #12 | «Cancelar» | SerialSelectorDialog | calcado |
| B.6 #13 | «Confirmar Seriales» (disabled hasta completar) | SerialSelectorDialog | calcado |
| B.19 #10 | dos toggles «impuestos incluidos» y dos totales distintos | CheckoutDialog | calcado como está (el dueño debe decidir si el del cobro persiste al carrito: pregunta abierta) |

## 2. Cabecera del POS y caja — B.1, B.1a, B.1b, B.1c, B.9, B.10, B.11

Sección Figma: `05 POS y ventas › Cabecera y caja` (título interno «Cabecera del POS y caja — B.1 · B.1a · B.1b · B.1c · B.9 · B.10 · B.11»).
Frames: `Escritorio / POS — cabecera: caja abierta · «Sin conexión» 3 · reloj · pantalla conectada · 2 Activos / 1 En Espera`,
`… sin caja («Abrir Caja») · pantalla desactivada · menú del indicador abierto`, `… caja de otro cajero («Cerrar Caja»
deshabilitado + tooltip) · «Sin conexión» en revisión · pantalla sin señal`, `… recargando carritos (opacidad 60 %)`,
`… carga inicial (skeleton)`, `… «Organización no encontrada»`, `CustomerDisplayIndicator — 4 estados + 3 menús`,
`AperturaCajaDialog` ×3, `CierreCajaDialog` ×3, `PendientesSinConexionDialog` ×2, `OfflineCustomerDialog` ×2,
`LocalCatalogNotice — 5 estados`, `Toasts (30)`, `Móvil / POS — cabecera (MobileHeader Mode=pos + ⋯) y sheet «Caja y
dispositivo»`, `Móvil / POS — Apertura de Caja (sheet)`, `Móvil / POS — Arqueo y Cierre de Caja (sheet)`, `Móvil / POS —
Pendientes de sincronizar (sheet)`, `Móvil / POS — Nuevo cliente (sin conexión) (sheet)`.

Decisión móvil (documentada en el frame): en `MobileHeader Mode=pos` se añade un botón «⋯» (Nuevo) que abre el
BottomSheet «Caja y dispositivo» con: estado de caja + «Abrir/Cerrar Caja», indicador de pantalla del cliente con
«Abrir»/«Cerrar», «Sin conexión» + N → Pendientes, aviso de catálogo local + «Actualizar catálogo ahora», reloj con
zona horaria y contadores «N Activos / N En Espera». El badge del header muestra «Caja abierta · hh:mm» / «Sin caja».

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| B.1 #1 | icono ShoppingCart en círculo azul | Cabecera del POS (barra bajo el AppHeader) | calcado |
| B.1 #2 | «Sistema POS» | Cabecera del POS | calcado |
| B.1 #3 | `{organization.name}` / «Caja rápida / Venta» | Cabecera del POS («Mi empresa S.A.S. · Caja rápida / Venta») | calcado |
| B.1 #4 | badge «Sucursal: {branch}» (solo lectura) | — | sustituido por el BranchPicker del OrgSwitcher del AppHeader (decisión previa: sucursal del header = filtro) |
| B.1 #5 | (Lock) «Abrir Caja» | pantalla «sin caja» | calcado (color primario de marca en vez de verde) |
| B.1 #6 | (Lock) «Cerrar Caja» | pantalla «caja abierta» | calcado (destructive) |
| B.1 #7 | «Cerrar Caja» deshabilitado + tooltip «Solo el cajero que abrió la caja o un administrador puede cerrarla» | pantalla «caja de otro cajero» | calcado (Tooltip del kit); el permiso resuelto en cliente (B.19 #4) es asunto de código |
| B.1 #8 | (CloudOff / AlertTriangle) «Sin conexión» + badge N; destructive con filas en revisión | pantallas 1 (outline, 3) y 3 (destructive, 5) | calcado |
| B.1 #9 | (Clock) HH:MM | Cabecera del POS | calcado; B.19 #5: en móvil se muestra con la zona horaria de la organización |
| B.1 #10 | indicador de pantalla del cliente | Cabecera del POS + CustomerDisplayIndicator — 4 estados | calcado |
| B.1 #11 | badge «{N} Activos» | Cabecera del POS | calcado |
| B.1 #12 | badge «{N} En Espera» | Cabecera del POS | calcado |
| B.1 #13 | divisor arrastrable productos/carrito + tooltip | — | omitido: el divisor 75/25 está en `POS — Cabecera y caja › Escritorio / POS — cabecera: caja abierta…` (sustituye al antiguo `buscador de productos (75/25)`, hoy en `99 Descartes`); el tooltip «Arrastra para ampliar…» se anota allí, no se redibuja |
| B.1 #14 | skeleton inicial | `Escritorio / POS — carga inicial (skeleton)` | calcado (Skeleton del kit) |
| B.1 #15 | «Organización no encontrada» / «Configure su organización…» | `Escritorio / POS — «Organización no encontrada»` | calcado (EmptyState error) |
| B.1 #16 | opacidad 60 % + sin interacción al recargar | `Escritorio / POS — recargando carritos` | calcado |
| B.1 #17 | 10 toasts sonner (caja, cocina, sucursal) | Toasts (30) | sustituido por Toast del kit (hoy invisibles, B.19 #3) |
| B.1 #18 | 5 `window.alert` | Toasts (30) | sustituido por Toast error/info (B.19 #2) |
| B.1a #1 | (Banknote) «Apertura de Caja» | AperturaCajaDialog ×3 | calcado |
| B.1a #2 | X cierra | AperturaCajaDialog | calcado |
| B.1a #3 | (Store) «Sucursal» + nombre | AperturaCajaDialog | calcado |
| B.1a #4 | (UserCircle) «Cajero» + nombre | AperturaCajaDialog | calcado |
| B.1a #5 | (Calendar) «Fecha y hora» | AperturaCajaDialog | calcado; se muestra con la zona horaria de la organización (B.19 #5) |
| B.1a #6 | «Alcance de la Caja» | branch y global | calcado |
| B.1a #7 | (Building2) «Esta sucursal» / `{branchName}` | cashMode=branch (seleccionada) | calcado |
| B.1a #8 | (Globe) «Todas las sucursales» / «Caja global» | cashMode=global (seleccionada) | calcado |
| B.1a #9 | «Todos los usuarios de todas las sucursales registrarán ventas en esta caja.» | cashMode=global | calcado |
| B.1a #10 | tarjeta «Mi caja en {branchName}» + 2 textos | cashMode=user | calcado |
| B.1a #11 | «Detalles de Apertura» | AperturaCajaDialog | calcado |
| B.1a #12 | «Monto Inicial *» (default 100000) | AperturaCajaDialog | calcado |
| B.1a #13 | «Equivale a: {formatCurrency}» | AperturaCajaDialog | calcado |
| B.1a #14 | «Notas (Opcional)» RichTextEditor «Observaciones de apertura...» | AperturaCajaDialog | calcado (editor con barra B/I/U/lista) |
| B.1a #15 | aviso «Importante: Una vez abierta la caja…» | AperturaCajaDialog | calcado |
| B.1a #16 | «Cancelar» | AperturaCajaDialog (disabled en «Abriendo...») | calcado |
| B.1a #17 | «Abrir Caja» / «Abriendo...» | branch / user | calcado |
| B.1a #18 | toasts «El monto inicial no puede ser negativo» · «Caja abierta…» · «Error al abrir caja» | Toasts (30) | calcado como Toast del kit |
| B.19 #14 | modales de caja a mano sin focus-trap ni Esc | AperturaCajaDialog / CierreCajaDialog | sustituido por Dialog / Sheet del kit |
| B.1b #1 | (Calculator) «Arqueo y Cierre de Caja» | CierreCajaDialog ×3 | calcado |
| B.1b #2 | X cierra | CierreCajaDialog | calcado |
| B.1b #3 | «Resumen de Movimientos» | CierreCajaDialog | calcado |
| B.1b #4 | «Monto inicial:» · «Ventas en efectivo:» · «Ventas totales:» · «Ingresos:» · «Egresos:» | CierreCajaDialog | calcado |
| B.1b #5 | «Vuelto entregado:» -X | CierreCajaDialog | calcado |
| B.1b #6 | «Devoluciones:» -X | CierreCajaDialog | calcado |
| B.1b #7 | (ArrowUpCircle) «Ingresos por método de pago:» | CierreCajaDialog | calcado (tilde corregida) |
| B.1b #8 | (ShoppingCart) «Ventas por método de pago:» + «Total ventas:» | CierreCajaDialog | calcado |
| B.1b #9 | (Receipt) «Recibos de Caja (Abonos a Cuentas por Cobrar):» · «Total recibido:» | CierreCajaDialog | calcado |
| B.1b #10 | (ArrowDownCircle) «Egresos por método de pago (compras):» + «Total Pagos a Proveedores:» | CierreCajaDialog | calcado |
| B.1b #11 | (EyeOff en ciego) «Monto esperado:» X / «****» | CierreCajaDialog normal / ciego | calcado |
| B.1b #12 | «Movimientos de la Sesión (N)»: icono, `label #ref`, contraparte / «Sin contraparte», badge método, +/-monto | CierreCajaDialog (3 filas) | calcado (tilde corregida) |
| B.1b #13 | «Arqueo por Método de Pago» | CierreCajaDialog | calcado |
| B.1b #14 | por método: nombre · «Esperado: X/****» · «Contado real» · «Diferencia» | CierreCajaDialog (Efectivo, Tarjeta, QR) | calcado |
| B.1b #15 | «Total esperado…» · «Total contado…» · «Diferencia total:» | CierreCajaDialog | calcado |
| B.1b #16 | «Sobrante en el arqueo total» / «Faltante en el arqueo total» | CierreCajaDialog normal | calcado |
| B.1b #17 | «Observaciones del Cierre (Opcional)» RichTextEditor | CierreCajaDialog | calcado |
| B.1b #18 | aviso «Atención: Hay una diferencia total de {X} (sobrante/faltante) en el arqueo.» | CierreCajaDialog normal | calcado |
| B.1b #19 | «Cancelar» | CierreCajaDialog | calcado |
| B.1b #20 | «Cerrar Caja» / «Cerrando...» | normal / ciego | calcado |
| B.1b #21 | skeleton 3 líneas | CierreCajaDialog — cargando | calcado |
| B.1b #22 | 5 toasts | Toasts (30) | calcado como Toast del kit |
| B.1c #1 | punto verde «Pantalla del cliente conectada» | CustomerDisplayIndicator | calcado |
| B.1c #2 | punto gris «Pantalla desactivada» | CustomerDisplayIndicator | calcado |
| B.1c #3 | punto ámbar «Pantalla abierta, sin señal» | CustomerDisplayIndicator | calcado |
| B.1c #4 | punto gris «Sin pantalla» | CustomerDisplayIndicator | calcado |
| B.1c #5 | «La ventana de la pantalla del cliente está abierta, pero la caja no recibe su señal…» | menú (sin señal) | calcado |
| B.1c #6 | «Desactivada en Configuración › POS › Pantalla del cliente» | menú (desactivada) | calcado |
| B.1c #7 | «Este navegador no admite la pantalla del cliente…» | menú (unsupported) | calcado |
| B.1c #8 | (Power) «Activar y abrir pantalla del cliente» | menú (desactivada) | calcado |
| B.1c #9 | (ExternalLink) «Abrir pantalla del cliente» | los 3 menús | calcado |
| B.1c #10 | (MonitorX) «Cerrar» (disabled si nada que cerrar) | los 3 menús | calcado |
| B.1c #11 | 5 toasts | Toasts (30) | calcado |
| B.9 #1 | «Sin conexión y sin catálogo local: conecta a internet una vez para replicarlo.» | LocalCatalogNotice | calcado |
| B.9 #2 | «Catálogo local del {fecha} · {N} productos · {N} clientes» | LocalCatalogNotice | calcado |
| B.9 #3 | «Catálogo local: {N} productos · actualizado {fecha}» / «Catálogo local sin replicar» | LocalCatalogNotice (+ pantalla 1) | calcado |
| B.9 #4 | (RefreshCw) «Actualizar catálogo ahora» / «Actualizando…» | LocalCatalogNotice | calcado |
| B.9 #5 | `{error}` | LocalCatalogNotice | calcado |
| B.10 #1 | (CloudOff) «Pendientes de sincronizar» | PendientesSinConexionDialog | calcado |
| B.10 #2 | texto explicativo largo | PendientesSinConexionDialog | calcado |
| B.10 #3 | resumen «{N} pendiente(s) (…) · {N} en revisión · {N} sincronizado(s) (últimos 7 días)» | PendientesSinConexionDialog | calcado |
| B.10 #4 | (RefreshCw) «Sincronizar ahora» | PendientesSinConexionDialog (disabled en vacío) | calcado |
| B.10 #5 | secciones «Requieren revisión» · «Pendientes» · «Sincronizados» | PendientesSinConexionDialog | calcado |
| B.10 #6 | «No hay operaciones pendientes.» | PendientesSinConexionDialog — vacío | calcado |
| B.10 #7 | icono + nº recibo local · nombre / «Cliente sin nombre» · «Apertura de caja» … | filas | calcado |
| B.10 #8 | badge «Pendiente» / «Sincronizando» / «Sincronizado» / «Requiere revisión» | filas | calcado |
| B.10 #9 | importe · fecha · detalles · «Intentos: N» · id | filas | calcado |
| B.10 #10 | `{lastError}` caja roja | fila en revisión | calcado |
| B.10 #11 | (RefreshCw) «Reintentar» | filas no sincronizadas | calcado |
| B.10 #12 | (Download) «Exportar» | todas las filas | calcado |
| B.10 #13 | 5 toasts | Toasts (30) | calcado |
| B.11 #1 | «Nuevo cliente (sin conexión)» | OfflineCustomerDialog ×2 + sheet | calcado |
| B.11 #2 | (WifiOff) «Se guarda en este equipo…» | OfflineCustomerDialog | calcado |
| B.11 #3 | «Nombres *» | OfflineCustomerDialog | calcado |
| B.11 #4 | «Apellidos» | OfflineCustomerDialog | calcado |
| B.11 #5 | «Tipo de documento» (CC, CE, NIT, TI, PP, PEP) | OfflineCustomerDialog | calcado |
| B.11 #6 | «Número de documento» | OfflineCustomerDialog | calcado |
| B.11 #7 | «Email» | OfflineCustomerDialog | calcado |
| B.11 #8 | «Teléfono» | OfflineCustomerDialog | calcado |
| B.11 #9 | «El nombre es obligatorio» / error | OfflineCustomerDialog — error | calcado |
| B.11 #10 | «Cancelar» | OfflineCustomerDialog | calcado |
| B.11 #11 | «Guardar cliente» / «Guardando…» | escritorio / sheet móvil | calcado |
| B.1 «No existe» | selector de turno, «Ventas de hoy», nombre del cajero, atajos, pantalla completa | — | omitido: no existe en código; el nombre del cajero sí aparece en el sheet móvil «Caja y dispositivo» (Nuevo) |

## 3. Carrito completo — B.8, B.13, B.14, B.15 (+ B.7 panel de cliente)

Sección Figma: `05 POS y ventas › Carrito` (título interno «Carrito completo — B.8 pestañas · B.13 líneas · B.14 totales · B.15 acciones · B.7 panel de cliente»).
Frames: `Escritorio / POS — carrito completo (activo…)` (1440×1421, carrito a 480 px), `Móvil / POS — carrito completo`
(390, alto completo), `Carrito completo / hold`, `/ debt`, `/ sin caja + sin cliente`, `/ edición inline + selector abierto`,
`/ vacío`, `/ sin carritos`, `TaxSummary — cargando`, `Badges de cocina y pestañas`, diálogos «¿Cerrar este carrito?»,
«Poner Carrito en Espera», «Registrar Deuda», «¿Anular la deuda…?» (Nuevo), «¿Quitar … del carrito?» (Nuevo),
«Detalle de Factura», `Toasts del carrito (10)`, y 3 sheets móviles.

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| B.8 #1 | pestaña (ShoppingCart / Clock si hold) + «Carrito {n}» o nombre del cliente (8 chars + «…»); activa azul, en espera amarilla | CartTabs en todos los carritos + strip «variantes de pestaña» | calcado |
| B.8 #2 | badge total abreviado («$12k») | CartTab | calcado; la moneda sale de la organización (B.19 #6) |
| B.8 #3 | badge nº de líneas | CartTab | calcado |
| B.8 #4 | X (role=button) cierra → confirmación | CartTab | calcado |
| B.8 #5 | arrastre horizontal | CartTabs (la 3.ª pestaña queda recortada a propósito: scroll) | calcado |
| B.8 #6 | (Plus) outline crea carrito | CartTabs | calcado |
| B.8 #7 | card resumen «Items: N» · «Cliente: …» · «En espera: {motivo}» · total · hora | Resumen del carrito activo (hora con tz de la org, B.19 #5) | calcado |
| B.8 #8 | «No hay carritos activos» / «Crea un nuevo carrito para comenzar una venta» + «Crear Carrito» | `Carrito completo / sin carritos` (EmptyState compact) | calcado |
| B.8 #9 | «¿Cerrar este carrito?» — «Se eliminarán todos los productos… Tiene {N} producto(s) por {total}.» — «Cancelar» / «Sí, cerrar carrito» | ConfirmDialog destructive (escritorio + sheet) | calcado |
| B.7 #1 | (Users) «Cliente» | Panel de cliente | calcado |
| B.7 #2 | trigger «Seleccionar cliente» / «Buscar por nombre, email o teléfono» + Search (popover) | `/ sin caja + sin cliente` | calcado (instancia del CustomerPicker, sección 4) |
| B.7 #3 | igual, Dialog ≤640 px | sección 4 (Layout=dialog / sheet) | calcado |
| B.7 #4-#12 | «Buscar Cliente», campo, «ESPACIOS OCUPADOS», «CLIENTES», filas, «Crear nuevo cliente», skeleton, vacíos | sección 4 CustomerPicker | calcado (ver sección 4) |
| B.7 #13 | card azul: avatar + nombre + «Pendiente de sincronizar» + email + teléfono + «{doc_type}: {doc_number}» | CustomerCard en todos los carritos (`/ edición inline` con badge pendiente) | calcado |
| B.7 #13 (ampliación F.2) | saldo CxC en la card | CustomerCard `/ edición inline` | Nuevo (badge) |
| B.7 #14 | (X) «Quitar cliente» | CustomerCard | calcado; se añaden «Cambiar» / «Ver» / «Editar» (F.5, Nuevo en sección 4) |
| B.7 #15 | `window.alert` «Error al asignar cliente al carrito» | Toasts (30) de la sección 2 | sustituido por Toast |
| B.13 #1 | (ShoppingCart) «Carrito» | Cabecera del carrito | calcado |
| B.13 #2 | badge «Espera» | `/ hold` | calcado |
| B.13 #3 | badge (FileText) «Deuda» | `/ debt` | calcado |
| B.13 #4 | badge «Enviado a cocina» / «En preparación» / «¡Listo!» / «Entregado» (carrito) | `/ debt` («Entregado») + strip de badges | calcado |
| B.13 #5 | (Play) «Reactivar» | `/ hold` (cabecera y acciones) | calcado |
| B.13 #6 | «Deuda registrada - Ver en Cuentas por Cobrar» | `/ debt` | calcado (sin emoji: icono CreditCard) |
| B.13 #7 | «Cliente: {full_name}» | Cabecera del carrito | calcado |
| B.13 #8 | miniatura 40/48 px (fallback Package) | CartLine | calcado |
| B.13 #9 | `{product.name}` | CartLine | calcado |
| B.13 #10 | badge de cocina por línea | CartLine «Pan artesanal» («En preparación» / «Enviado a cocina» / «¡Listo!») | calcado |
| B.13 #11 | badge «{atributo}: {valor}» | CartLine «Zapatilla…» («Talla: 40 · Color: Negro») | calcado |
| B.13 #12 | badge «{mod.name} (+$X)» (solo lectura) | CartLine «Zapatilla…» | calcado |
| B.13 #13 | badge (StickyNote) «{notes}» | CartLine «Zapatilla…» («Envolver para regalo») | calcado |
| B.13 #14 | campo «Ej: Sin cebolla, bien cocido...» | `/ edición inline` («Sin cebolla») | calcado |
| B.13 #15 | (Check) «Guardar nota» | `/ edición inline` | calcado |
| B.13 #16 | (X) «Cancelar» nota | `/ edición inline` | calcado |
| B.13 #17 | badge `{sku}` | CartLine | calcado |
| B.13 #18 | «{$unit_price} / {unit_code}» | CartLine («$ 15.000 / srv») | calcado |
| B.13 #19 | «Sin impuesto (excluido)» | CartLine «Servicio de bordado» | calcado |
| B.13 #20 | «+$X impuestos» / «(inc. $X impuestos)» | CartLine 1 y 2 | calcado |
| B.13 #21 | badge (Tag) «-$X» rojo | CartLine «Zapatilla…» | calcado |
| B.13 #22 | campo «Descuento» | `/ edición inline` | calcado |
| B.13 #23 | (Check) «Aplicar descuento» | `/ edición inline` | calcado |
| B.13 #24 | (X) «Cancelar» | `/ edición inline` | calcado |
| B.13 #25 | «+ Agregar descuento» | CartLine sin descuento | calcado |
| B.13 #26 | chips «-$X» frecuentes | CartLine «Pan artesanal» | calcado |
| B.13 #27 | «Frecuentes:» + chips durante edición | `/ edición inline` | calcado |
| B.13 #28 | `{$total}` y «{qty} × {$unit_price}» | CartLine | calcado |
| B.13 #29 | (Minus); a 0 elimina sin confirmar | CartLine | calcado + ConfirmDialog «¿Quitar … del carrito?» (Nuevo, B.19 #11) |
| B.13 #30 | campo cantidad | CartLine | calcado |
| B.13 #31 | (Plus) | CartLine | calcado |
| B.13 #32 | checkbox «Incluido» (disabled en hold o excluido) | CartLine (atenuado en «Servicio de bordado» y en `/ hold`) | calcado |
| B.13 #33 | (ReceiptText) excluir impuesto | CartLine | calcado |
| B.13 #34 | (StickyNote) nota | CartLine | calcado |
| B.13 #35 | (Trash) eliminar | CartLine | calcado |
| B.13 #36 | Enter / Escape | — | omitido: atajo de teclado sin representación visual; documentado aquí |
| B.13 estado vacío | (Package) «El carrito está vacío» + «Busca productos para agregar» | `/ vacío` | calcado |
| B.14 #1 | (Calculator) «Resumen» | TaxSummary | calcado |
| B.14 #2 | (Settings) sin onClick | TaxSummary | calcado; se propone que abra Finanzas › Impuestos (B.19 #7, pregunta abierta) |
| B.14 #3 | switch «Impuestos incluidos» | TaxSummary (off en activo, on en `/ edición inline`) | calcado |
| B.14 #4 | «Subtotal:» + «(inc. impuestos)» | TaxSummary | calcado |
| B.14 #5 | «Impuestos disponibles:» | TaxSummary | calcado |
| B.14 #6 | «Ningún impuesto seleccionado» / «{name} ({rate}%)» / «{n} impuestos seleccionados» | TaxSummary | calcado |
| B.14 #7 | «Selecciona los impuestos a aplicar:» | TaxSummary `/ edición inline` (popover abierto) | calcado |
| B.14 #8 | filas checkbox «{name} ({rate}%)» + badge «predeterminado» + Check | popover (4 impuestos, incl. retención) | calcado |
| B.14 #9 | «Impuestos aplicados:» + «{name} ({rate}%)» + badge «incluido» + importe | TaxSummary | calcado (nombres reales, nunca «IVA») |
| B.14 #10 | «Total Impuestos:» azul | TaxSummary | calcado |
| B.14 #11 | «Descuento:» rojo | TaxSummary | calcado |
| B.14 #12 | «Total Final:» verde | TaxSummary | calcado |
| B.14 #13 | «No hay impuestos configurados para estos productos» | `/ vacío` | calcado |
| B.14 estados | cargando 2 Skeleton | `TaxSummary — cargando` | calcado |
| B.15 #1 | (Pause) «Espera» | Acciones | calcado |
| B.15 #2 | (FileText) «Deuda» (disabled sin cliente) | Acciones (`/ sin caja + sin cliente` deshabilitado) | calcado |
| B.15 #3 | (Send) «Enviar Cocina» / «Enviando...» | Acciones (`/ edición inline` «Enviando...») | calcado |
| B.15 #4 | (CreditCard) «Cobrar» (disabled en hold/deuda/sin caja) | Acciones | calcado |
| B.15 #5 | «Debe abrir una caja antes de cobrar» | `/ sin caja + sin cliente` | calcado |
| B.15 #6 | (FileText) «Ver Factura» / «Cargando...» | `/ debt` | calcado |
| B.15 #7 | (Printer) «Imprimir» | `/ debt` | calcado |
| B.15 #8 | «Cobrar» (deuda) | `/ debt` | calcado |
| B.15 #9 | (X) «Anular» sin confirmación | `/ debt` + ConfirmDialog «¿Anular la deuda…?» | calcado + sustituido (confirmación Nueva, B.19 #11) |
| B.15 #10 | «Poner Carrito en Espera» | diálogo + sheet | calcado |
| B.15 #11 | «Motivo (opcional)» textarea | diálogo + sheet | calcado |
| B.15 #12 | «Cancelar» / (Pause) «Poner en Espera» | diálogo + sheet | calcado |
| B.15 #13 | (FileText) «Registrar Deuda» | diálogo + sheet | calcado |
| B.15 #14 | «Cliente:» · «Total a adeudar:» | diálogo | calcado |
| B.15 #15 | «Motivo de la deuda *» | diálogo | calcado |
| B.15 #16 | «Días para vencimiento» + «días» + «(Vence: {fecha})» | diálogo (fecha con tz de la org, B.19 #5) | calcado |
| B.15 #17 | «Se creará:» · 3 ítems | diálogo | calcado (sin emoji) |
| B.15 #18 | «Cancelar» | diálogo | calcado |
| B.15 #19 | «Registrar Deuda» / «Procesando...» | diálogo (disabled sin motivo) | calcado |
| B.15 #20 | «Detalle de Factura» (90vw × 90vh) + cargando + error | diálogo 1200 px | calcado (contenido = DetalleFactura de Finanzas) |
| B.15 estados | 9 toasts | Toasts del carrito (10) | calcado |
| diseño anterior | «Guardar» y «Descuento global» | fila inferior de Acciones con badge «Nuevo» | Nuevo (inventados; decisión pendiente del dueño) |
| B.12 #1-#4 | vista «productos» / «carrito», «Seguir comprando», botón flotante | `Móvil / POS — carrito completo` («Seguir comprando»); botón flotante ya en `03 › Móvil / POS — productos` | calcado |

## 4. `CustomerPicker` compartido — sección F y panel de cliente B.7

Componentes (en `02 Componentes › Clientes`): `CustomerRow` (Type=person|company|space × State=default|selected|
pending|multi), `CustomerCard` (Actions=full|compact, Pending), `QuickCustomerForm`, `CustomerPicker` (Layout=popover|
dialog|inline|sheet × State=idle|typing|loading|results|empty|error + multi). Sección de pantallas: `06 Clientes › CustomerPicker`
(título interno «CustomerPicker compartido — F · B.7 panel de cliente del POS») con `Escritorio / POS — panel de cliente: CustomerPicker popover abierto`,
`Móvil / POS — «Seleccionar Cliente» (sheet)`, fila de 5 ejemplos de uso (POS, factura de venta, CRM, reserva PMS,
envío de transporte), `QuickCustomerForm` y `Sheet «Más datos» → ClientForm completo`.

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| B.7 #2 | trigger «Seleccionar cliente» / «Buscar por nombre, email o teléfono» + Search | panel de cliente (trigger en foco) | calcado |
| B.7 #3 | Dialog «Seleccionar Cliente» ≤640 px | `Móvil / POS — «Seleccionar Cliente» (sheet)` (Layout=sheet; Layout=dialog en el set) | calcado (Dialog móvil → Sheet del kit) |
| B.7 #4 | «Buscar Cliente» | CustomerPicker Layout=popover | calcado |
| B.7 #5 | campo (Search) «Nombre, email, teléfono o documento...» autoFocus | CustomerPicker (todos los estados) | calcado |
| B.7 #6 | (Building2) «ESPACIOS OCUPADOS ({N})» | CustomerPicker context=pos, State=results | calcado |
| B.7 #7 | `{space_label}` + badge «Ocupada» + (User) nombre + (Mail) email | CustomerRow Type=space | calcado |
| B.7 #8 | (User) «CLIENTES ({N})» | CustomerPicker State=results | calcado |
| B.7 #9 | avatar + nombre + (Building2 si empresa) + «Pendiente de sincronizar» + «Contacto: {nombre} ({cargo})» + email + teléfono | CustomerRow Type=person/company/pending | calcado (+ badge Empresa/Persona, documento, ciudad y saldo CxC según F.5) |
| B.7 #10 | (UserPlus) «Crear nuevo cliente» (w-full) | CustomerPicker pie (showCreate) | calcado; online → ClientForm completo (Sheet «Más datos»), offline → OfflineCustomerDialog (sección 2) |
| B.7 #11 | skeleton 3 líneas | CustomerPicker State=loading | calcado |
| B.7 #12 | «No se encontraron resultados» / «Intenta con otro término de búsqueda» · «No hay clientes registrados» / «Crea un nuevo cliente para comenzar» | CustomerPicker State=empty (dos textos) | calcado |
| B.7 #13 | card azul del seleccionado | CustomerCard | calcado |
| B.7 #14 | (X) «Quitar cliente» | CustomerCard | calcado |
| B.7 #15 | `window.alert` | Toasts (sección 2) | sustituido por Toast |
| F.5 Layout | popover · dialog · inline · sheet | CustomerPicker set (10 variantes) | Nuevo (unifica 22 implementaciones) |
| F.5 State | idle · typing · loading · results · empty · error | CustomerPicker set | calcado (POS tiene skeleton y vacíos; error visible solo existía en CRM) |
| F.5 mode=multi | checkboxes + «{N} seleccionados» + «Seleccionar (N)» | CustomerPicker State=multi | calcado (solo `BulkActionsDialog` lo tenía) |
| F.5 allowEmpty | fila «Sin cliente» | CustomerPicker Layout=inline (CRM) | calcado (CRM `allowEmpty`) |
| F.5 filter | customerType, branchId, onlyWithAddress | ejemplos PMS («Sucursal Principal») y transporte («Solo con dirección») | calcado (existían dispersos) |
| F.5 CustomerRow | avatar, nombre, badge empresa/persona, documento, email, teléfono, «Pendiente de sincronizar», ciudad | CustomerRow | calcado (unión F.2) |
| F.5 CustomerRow saldo CxC | «Saldo CxC: $X» | CustomerRow State=multi, CustomerCard Pending | Nuevo (badge) — nadie lo muestra hoy; sale de `accounts_receivable` |
| F.5 CustomerCard | «Cambiar» · «Ver» · «Editar» · «Quitar» | CustomerCard Actions=full | Nuevo (badge) para Cambiar/Ver/Editar; «Quitar» calcado |
| F.5 QuickCustomerForm | nombres*, apellidos, tipo y nº de documento, email, teléfono, persona/empresa | QuickCustomerForm | calcado (unión de POS offline, chat, gym, lead) |
| F.5 «Más datos» | ClientForm completo en Sheet | Sheet «Más datos» | calcado (ClientForm existe; el Sheet como contenedor es decisión de diseño) |
| F.5 Size=sm | variante compacta | — | omitido: documentado como prop; se dibuja al consolidar en `02` (misma anatomía con controles sm) |

## 5. Impuestos — E.2 Finanzas › Impuestos, E.3 producto

Componentes (en `02 Componentes › Impuestos`): `TaxForm`, `TaxMultiSelect` (+ `/ cerrado`). Sección `07 Finanzas ›
Impuestos` (título interno «Impuestos — E.2 Finanzas › Impuestos · E.3 producto · sin «IVA» fijo»): `Escritorio / Finanzas › Impuestos — lista`, `Móvil / Finanzas › Impuestos — lista (cards)`, `TaxForm` ×4
(nuevo con plantilla, editar, sin plantilla + error, guardando), «Eliminar Impuesto», `Producto › Precios y costos ›
Impuestos`, `Estados de la lista`, `Acción masiva «Asignar impuesto»` (Nuevo), `Móvil / … «Nuevo Impuesto» (sheet)`.

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| E.2 #1 | «Nuevo Impuesto» | lista escritorio (PageHeader) y móvil (flotante) | calcado |
| E.2 #2 | «Buscar impuestos...» | lista (SearchBar del kit) | calcado |
| E.2 #3 | tabla «Nombre» · «Tasa» · «Descripción» · «Estado» · «Predeterminado» · «Incluido en precio» · «Acciones» | lista escritorio (+ columna «Tipo», Nuevo) | calcado |
| E.2 #4 | badge `{rate}%` + «Incluido» | lista | calcado |
| E.2 #5 | toggle «Activo» / «Inactivo» | lista | calcado (debe pasar por la RPC, E.7 #14: asunto de código) |
| E.2 #6 | badge «Predeterminado» | lista | calcado |
| E.2 #7 | badge «Incluido» | lista | calcado |
| E.2 #8 | (lápiz) / (papelera) | lista | calcado |
| E.2 #9 | «Nuevo Impuesto» / «Editar Impuesto» | TaxForm ×4 | calcado |
| E.2 #10 | «Plantillas sugeridas: …» | TaxForm (creación) | calcado (sin emoji) |
| E.2 #11 | checkbox «Usar plantilla de impuesto» | TaxForm (creación) | calcado |
| E.2 #12 | select nativo «Plantillas de Impuestos Disponibles (CO)» | TaxForm (Select del kit) | sustituido por Select del kit (era `<select>` nativo) |
| E.2 #13 | «No hay plantillas de impuestos disponibles para su país» | TaxForm sin plantilla | calcado (variante «— (sin plantilla)») |
| E.2 #14 | «Nombre *» («Ej: IVA 19%») | TaxForm (placeholder «Ej: Impuesto general 19%») | calcado; placeholder sin «IVA» (E.7 #5) |
| E.2 #15 | «Tasa (%) *» («Ej: 19») | TaxForm | calcado |
| E.2 #16 | «Descripción» | TaxForm | calcado |
| E.2 #17 | «Impuesto activo» | TaxForm | calcado |
| E.2 #18 | «Impuesto predeterminado» | TaxForm | calcado |
| E.2 #19 | «Impuesto incluido en el precio» + ayuda | TaxForm | calcado |
| E.2 #20 | «Cancelar» / «Guardar» / «Guardando...» | TaxForm | calcado |
| E.2 #21 | «Eliminar Impuesto» · «¿Está seguro…? … eliminado permanentemente.» | ConfirmDialog | calcado |
| E.2 #22 / E.7 (a) | «Tipo de tributo» (IVA / INC / ICA / retención / otro) | TaxForm | Nuevo (badge) |
| E.7 (a) | «Código DIAN / plantilla» | TaxForm | Nuevo (badge) — hoy solo por `tax_templates.code` |
| E.7 (a) | «Aplica sobre» (base o subtotal) | TaxForm | Nuevo (badge) |
| E.7 (a) | «Exento / excluido» | TaxForm | Nuevo (badge) |
| E.7 (c) | «Retención» (línea negativa) | TaxForm + popover del carrito («Retención en la fuente 4 %») | Nuevo (badge) |
| E.3 #1 | SearchSelect «Impuesto» de un solo valor («Seleccionar impuesto», «Buscar impuesto...», «No se encontraron impuestos», «Sin impuesto») | TaxMultiSelect (mismos textos, N valores) | sustituido por TaxMultiSelect (la N es Nueva, badge) |
| E.3 #4 | cabecera del detalle «Impuesto: {name} {rate}%» (fallback «IVA») | `Producto › Precios y costos › Impuestos` (nota) | calcado sin fallback «IVA» (E.7 #2) |
| E.3 #7 | «Duplicar configuración de impuestos» | — | omitido: pertenece a la página de Duplicar producto de `03` (sin cambios) |
| E.3 #9 | acciones masivas sin impuesto | `Acción masiva «Asignar impuesto»` | Nuevo (badge) |
| E.4 #7-#10 | selector y desglose del carrito | sección 3 (TaxSummary) | calcado |
| E.5 #1-#2 | cobro «Impuestos:» + checkbox | sección 1 (CheckoutDialog, con desglose Nuevo) | calcado |
| E.5 #5-#6 | pantalla del cliente «Desglose de impuestos» · «IVA incluido» cableado | sección 7 (Pantalla del cliente: «Impuestos incluidos») | sustituido: texto sin «IVA» (E.7 #4) |
| E.7 #5 | placeholders y muestras con «IVA» | todos los frames nuevos usan «Impuesto general 19 %» / «Impoconsumo 8 %» | sustituido |

Frames de pantallas (hoy en `04 Inventario` y `05 POS y ventas`) que quedaron obsoletos por «IVA 19 %» fijo (resueltos en la consolidación del 2026-09-22, ver
al final: los que tenían equivalente de fidelidad pasaron a `99 Descartes`; el resto sigue en `05 POS y ventas` con chips):
`Escritorio / Nuevo producto`, `Escritorio / Editar producto`, `Escritorio / Duplicar producto — «Qué copiar»`,
`Escritorio / Detalle — Resumen`, `Escritorio / Detalle — Resumen · editando Precios en Sheet`, `Escritorio / Detalle —
Inventario`, `Escritorio / Detalle — Precios y costos`, `Escritorio / Importar — paso 4 previsualización`,
`Escritorio / POS — buscador de productos (75/25)`, `Escritorio / POS — diálogo de variantes y modificadores`,
`Escritorio / POS — cargando`, `Escritorio / POS — sin catálogo local`, `Escritorio / POS — «Elige la sucursal para
vender»`, `Móvil / Nuevo producto — paso 2`, `Móvil / Detalle — Resumen`, `Móvil / POS cobrando — sin tab bar`,
`Móvil / POS — carrito`.

## 6. Buscador y grid — B.2, B.3, B.4, B.5 (solo lo que faltaba)

Sección `05 POS y ventas › Buscador y grid` (título interno «Buscador y grid — B.2 · B.3 · B.4 · B.5 (solo lo que
faltaba)»): `Escritorio / POS — grid en error`, escáner (escritorio ×2, móvil ×2), `CategoryBar — 3 modos`, `Receta de
producción` (tarjeta + diálogo ×3 estados; el diálogo es ahora el componente `RecipeSheet` del kit), `VariantSelectorDialog — validación`, `VariantSelectorDialog — lista fallback`, `Toasts (10)`.

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| B.2 #1-#12 | buscador, escáner, limpiar, «Mostrar:», densidad, «{total} prod.» | `POS — Cabecera y caja › Escritorio / POS — cabecera: caja abierta…` y `PosProductSearch` del kit (el antiguo `buscador de productos (75/25)` está en `99 Descartes`) | calcado (no se redibuja) |
| B.2 #13 | lector físico USB/BT (wedge) | escáner escritorio (nota en el overlay) | calcado como anotación (sin UI propia) |
| B.2 #14 | toasts «Código no encontrado» · «Producto agotado» · «Error» | Toasts (10) | calcado |
| B.2 #15 | overlay «Escáner de código de barras» / «Apunta la cámara…» con vídeo | escáner escritorio y móvil | calcado; B.19 #1 (simulado) → lector real |
| B.2 #16 | (X) cierra el escáner | escáner | calcado |
| B.2 #17 | cruz roja + «Escaneando...» | escáner | calcado |
| B.2 #18 | «No se pudo acceder a la cámara. Verifica los permisos e intenta de nuevo.» + «Cerrar» | escáner — error (escritorio y móvil) | calcado |
| B.2 #19 | toast «Código escaneado» / «Buscando producto con código: {barcode}» | Toasts (10) | calcado |
| B.2 #20 | (ChefHat) «Receta de producción» + nombre | diálogo | calcado |
| B.2 #21 | «Producto» · «SKU» · «Rendimiento» · «Estado» badge · «Versión» | diálogo | calcado |
| B.2 #22 | «Notas» | diálogo | calcado |
| B.2 #23 | «Ingredientes ({N})» — #, nombre, SKU, cantidad, badge «Opcional» | diálogo | calcado |
| B.2 #24 | «Esta receta no tiene ingredientes definidos.» | diálogo — empty | calcado |
| B.2 #25 | skeleton | diálogo — loading | calcado |
| B.2 #26 | toast «No se pudo cargar la receta del producto» | Toasts (10) | calcado |
| B.3 #1 | SearchSelect «Categorías» · «Buscar categoría...» · «No se encontraron categorías» · «Todas las categorías» | CategoryBar Mode=combobox + SearchSelect abierto + vacío | calcado |
| B.3 #2-#4 | modo images: «Todas» 80×80, tarjeta por categoría, ★ | CategoryBar Mode=images (kit) | calcado |
| B.3 #5-#9 | modo buttons: «Todas» + badge, píldoras con icono/color, «Top», conteo, ★ | CategoryBar Mode=chips (kit) | calcado |
| B.3 #10 | arrastre horizontal | — | calcado como comportamiento (sin UI) |
| B.3 #11 | sin vacío ni carga; error solo console | «No se encontraron categorías» + «No se pudieron cargar las categorías» + «Reintentar» | sustituido (Nuevo estado de error, B.19 #13) |
| B.4 #1-#15, #17, #19-#23 | tarjeta, badges, ★, precio, paginación | ya en `03` y `ProductCard` del kit | calcado (no se redibuja) |
| B.4 #16 | (ChefHat) «Ver receta de producción» | `ProductCard + botón receta` | calcado |
| B.4 #24 | skeleton del grid | `03 › Escritorio — POS › Escritorio / POS — cargando (primera carga)` (totales con chips desde 2026-09-22) | calcado (no se redibuja) |
| B.4 #25 | «Error al cargar productos» + «Reintentar» | `Escritorio / POS — grid en error` (PosProductSearch State=error) | calcado |
| B.4 #26 | «No se encontraron productos» + «Limpiar filtros» | `PosProductSearch State=empty` del kit | calcado (no se redibuja) |
| B.4 #10, #18, #27 | toasts favoritos / agotado / carga | Toasts (10) | calcado |
| B.5 #1-#10, #13-#15 | diálogo de variantes y modificadores | `VariantModifierDialog` del kit y `03 › Escritorio — POS › Escritorio / POS — diálogo de variantes y modificadores` (totales con chips desde 2026-09-22) | calcado (no se redibuja) |
| B.5 #8 | badge «Sin precio» | lista fallback | calcado |
| B.5 #11 | «Selecciona una opción en "{grupo}"» / «Selecciona al menos {N} opciones en "{grupo}"» | `VariantSelectorDialog — validación` | calcado |
| B.5 #12 | lista de variantes sin atributos: nombre · «SKU: {sku}» · precio o «-» | `VariantSelectorDialog — lista fallback` | calcado |
| B.5 #16 | error de carga solo console | — | omitido: sin UI en código; se cubre con el Toast «No se pudieron cargar los productos» |

## 7. Configuración › POS — D.17

Sección `05 POS y ventas › Configuración › POS` (título interno «Configuración › POS — D.17 (13 tarjetas + 6 diálogos + impresoras)»): `Escritorio / Configuración › POS —
página completa` (1440×3492), `Móvil / Configuración › POS — página completa`, diálogos: Consecutivos (lista + nuevo +
editar + importar + eliminar + resetear), Previsualizar Impresiones (HTML y ESC/POS), Agente de Impresión (Desktop,
navegador, móvil), «Go Admin Desktop» (descarga), Pantalla del cliente, «Nueva Impresora» ×3 (red, Bluetooth, sistema),
«¿Eliminar impresora?», Propinas y Cargos de Servicio (embebidos).

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| D.17.1 #1 | skeleton de carga | — | omitido: mismo patrón que `Escritorio / POS — carga inicial (skeleton)` de la sección 2 (no se duplica) |
| D.17.1 #2 | cabecera `!embedded` (nunca se ve) | — | omitido: código muerto (D.17.13 #3) |
| D.17.1 #3 | 5 stats | página completa (StatCard ×5) | calcado («Sec. Facturación» sin sección: pregunta abierta) |
| D.17.1 #4 | «Configuración Avanzada» · «Accede a configuraciones específicas del sistema» | página | calcado |
| D.17.1 #5-#10 | 6 accesos (Consecutivos, Propinas, Cargos, Previsualizar, Agente, Pantalla del cliente) | página | calcado |
| D.17.2 #1-#2 | «Requerir Caja Abierta» + switch + textos de estado | página | calcado |
| D.17.2 #3-#5 | «Caja por Cajero» + switch + aviso «Modo cajero activo» | página | calcado |
| D.17.2 #6-#7 | «Cierre Ciego» + switch | página | calcado (tilde «información» corregida) |
| D.17.3 #1-#5 | «Horas de Operación» + switch + «Hora de inicio» / «Hora de cierre» + «Guardar horas de operación» | página | calcado |
| D.17.3 #6 | «Guardar» (solo si nunca se guardó) | «Desactivar horas de operación» | sustituido (Nuevo, D.17.13 #1) |
| D.17.4 #1-#4 | «Visualización de Categorías»: 3 chips + «Orden de las categorías» + ayuda | página | calcado (etiquetas de orden sin nombres internos, D.17.13 #9) |
| D.17.4 #5-#8 | «Métodos de Pago» + tarjetas + switch | página (8 métodos) | calcado; «Añadir método» Nuevo (D.17.13 #7) |
| D.17.4 #9-#11 | «Impuestos» solo lectura + tabla | página | calcado + enlace «Ir a Finanzas › Impuestos» |
| D.17.4 #12-#15 | «Cargos de Servicio» + tarjetas + switch | página | calcado |
| D.17.5 #1-#7 | «Impresoras» + «Nueva Impresora» + tarjetas (tipo, sucursal, switch, badges de estación, Editar/Eliminar) | página | calcado |
| D.17.5 #3 | skeleton · «No hay impresoras configuradas» | — | omitido: patrón de skeleton/vacío ya cubierto en la sección 5 (estados de lista) |
| D.17.5 #8 | «¿Eliminar impresora?» | ConfirmDialog | calcado |
| D.17.6 #1-#15 | «Nueva Impresora»: nombre, sucursal, tipo, detectar, errores, panel de detección, IP/puerto, avisos Bluetooth/sistema, MAC, ancho, estaciones, notas, validación, botones | «Nueva Impresora» ×3 | calcado (tildes corregidas) |
| D.17.7 #1-#6 | «Print Agent (Estado)» + badge versión + «Descargar Go Admin Desktop» + refresco + filas de agentes | página | calcado (hora con tz de la org) |
| D.17.7 #5 | vacío «No se ha registrado ningún agente…» | — | omitido: variante de texto documentada aquí; misma tarjeta con lista vacía |
| D.17.7 #7 | diálogo «Go Admin Desktop» | «Go Admin Desktop» (descarga) | calcado |
| D.17.8 #1-#4 | «Trabajos de Impresión Recientes» + tabla + paginación | página (Pagination del kit) | calcado (paginación propia → kit) |
| D.17.9 #1-#11 | Consecutivos: cabecera, Importar/Exportar/Nuevo, stats, buscador, vacío, tabla, menú ⋯, formulario, eliminar, resetear, importar | 6 frames | calcado |
| D.17.10 #1-#10 | Previsualizar: imprimir, «Qué quieres revisar», 5 documentos, camino, ancho, métricas, vista previa, avisos, desborde | 2 frames | calcado (tildes corregidas) |
| D.17.11 #1 | navegador: aviso | «Agente de Impresión — navegador» | calcado |
| D.17.11 #2-#4 | móvil: Bluetooth, botones, red | «Agente de Impresión — móvil» | calcado |
| D.17.11 #5-#10 | Desktop: estado, iniciar/detener, sucursales, arranque automático, detección ×4 | «Agente de Impresión — Go Admin Desktop» | calcado (+ texto explicativo de «Iniciar agente» deshabilitado, Nuevo) |
| D.17.12 #1-#6 | pantalla del cliente: intro, switch, error, monitor, estado, «Abrir ahora» | «Pantalla del cliente» | calcado |
| D.17.12 #7-#12 | «Esta caja»: estados, «Elegir terminal», vincular/renombrar/activar, formularios | «Pantalla del cliente» | calcado |
| D.17.12 #13-#23 | propina, porcentajes, calificación, desglose, nombre, reposo, imágenes, tiempo, idioma, táctil, guardar | «Pantalla del cliente» | calcado («IVA incluido» → «Impuestos incluidos», E.7 #4) |
| D.17.1 #6-#7 | Propinas y Cargos de Servicio embebidos | 2 diálogos placeholder | omitido el contenido: son módulos completos fuera de esta auditoría (`/app/pos/propinas`, `/app/pos/cargos-servicio`) |

## Capturas y verificación

Capturas en `docs/design/figma/10-pos-*.png` (una por sección + 4 pantallas clave). El MCP de Figma limita las
capturas a 1024 px en su lado mayor, así que las de sección son vistas generales; el detalle se revisa en el archivo.

Comprobación por script al cerrar (2026-09-22): 0 solapes entre secciones, 0 solapes entre frames de primer nivel
dentro de cada sección, 0 frames fuera de su sección, 0 nodos sueltos en la página, 0 nombres de organización cliente.

## Consolidación 2026-09-22 (decisión del dueño: solo `01 Sistema`, `02 Componentes`, `03 Pantallas`, `99 Descartes`)

- Las 7 Secciones de pantallas de `04 POS — fidelidad` se movieron a `03 Pantallas` con prefijo («POS — Cobro»,
  «POS — Cabecera y caja», «POS — Carrito», «POS — CustomerPicker», «Finanzas — Impuestos», «POS — Buscador y grid»,
  «Configuración › POS»), debajo de las Secciones de Producto, 400 px entre Secciones, 0 solapes. Los frames
  conservan su nombre; los títulos internos con las referencias de auditoría se mantienen.
- Componentes al kit (`02 Componentes`): 24 iconos lucide a «Fundamentos › Iconos»; `CustomerRow`, `CustomerCard`,
  `QuickCustomerForm` y `CustomerPicker` a la Sección nueva «Clientes»; `TaxForm`, `TaxMultiSelect` y
  `TaxMultiSelect / cerrado` a la Sección nueva «Impuestos» (tras «Formularios»).
- `SerialPicker` y `RecipeSheet`: la versión completa con etiquetas exactas (el `SerialSelectorDialog` de «POS —
  Cobro» y el diálogo «Receta de producción» de «POS — Buscador y grid») se convirtió en componente del kit y
  ocupa el sitio de la versión resumida en «Productos y POS»; en las pantallas queda una instancia. Las versiones
  resumidas están en `99 Descartes › Sustituidos por fidelidad 2026-09-22`. La nota «El kit ya tiene RecipeSheet
  (versión resumida)» y su instancia se retiraron del frame «Receta de producción».
- Sustituidos por la versión de fidelidad (a `99 Descartes › Sustituidos por fidelidad 2026-09-22`):
  `Escritorio / POS — buscador de productos (75/25)` → «POS — Cabecera y caja › cabecera: caja abierta…»;
  `Móvil / POS cobrando — sin tab bar` → «POS — Cobro › Móvil / POS — Cobro (Sheet a pantalla completa)»;
  `Móvil / POS — carrito` → «POS — Carrito › Móvil / POS — carrito completo».
- Sin equivalente de pantalla completa, siguen en `05 POS y ventas › Escritorio — POS` con el «IVA 19 %» del resumen del carrito
  sustituido por chips del kit («IVA 19 %» + «INC 8 %», `Chip Variant=filter` sin acción): `diálogo de variantes y
  modificadores`, `cargando (primera carga)`, `sin catálogo local (Desktop offline)`, `«Elige la sucursal para
  vender»`. Sus filas se corrieron a la izquierda para cerrar el hueco.
- Las sustituciones en los frames de productos (Nuevo/Editar/Duplicar producto, móvil paso 2, Importar paso 4,
  Detalle — Resumen ×2, Inventario, Precios y costos, móvil Resumen) están en
  `docs/design/PARIDAD-DETALLE-PRODUCTO-FIDELIDAD.md › Consolidación`.
- Chequeo por script al cerrar (2026-09-22, `02` y `03`): 0 solapes entre Secciones, 0 solapes entre frames de primer
  nivel, 0 nodos fuera de Sección, 0 instancias desvinculadas, 0 textos «IVA 19 %» fuera de un chip de impuesto.
  Páginas del archivo: `01 Sistema`, `02 Componentes`, `03 Pantallas`, `99 Descartes`.
- Vistas generales: `docs/design/figma/10-consolidado-02-componentes.png` y
  `docs/design/figma/10-consolidado-03-pantallas.png`.

## Sustitución por POS UX v2 (2026-09-22)

- Carrito, cobro, post-venta y móvil de esta tanda se sustituyeron por la v2 (`docs/design/POS-UX-V2.md`): los
  frames `Escritorio / POS — carrito completo…`, `Carrito completo / hold · debt · active ×3 · Col`, `Móvil / POS —
  carrito completo`, `Escritorio / POS — Cobro (CheckoutDialog…)`, `Móvil / POS — Cobro (Sheet…)`, `CheckoutDialog —
  «Falta dinero»`, `— «Procesando...»`, `Post-venta ×2`, `Móvil / POS — Cobro › ¡Venta Completada!` y `Móvil / POS —
  productos` están en `99 Descartes › POS fidelidad (sustituido por v2 2026-09-22)`.
- Se conservan en `03` con retoques (`Kbd` F9/F10/Enter): «POS — Cabecera y caja», «POS — Buscador y grid» (+ frame
  `Escritorio / POS v2 — Grid…`), «POS — CustomerPicker», «Finanzas — Impuestos», «Configuración › POS», y los
  diálogos, toasts y sheets de «POS — Carrito» y «POS — Cobro».

## Reorganización por módulos (2026-09-22)

Petición del dueño: «en Figma podríamos separar mejor las pantallas para que no se vea tan
complicado, por módulos […] en este momento una sola página se está haciendo muy difícil de leer».
Las 26 Secciones de `03 Pantallas` se repartieron por módulo, con sus frames y anotaciones intactos
(nada se rehízo). Páginas del archivo tras la reorganización: `01 Sistema` · `02 Componentes` ·
`03 Navegación y shell` · `04 Inventario` · `05 POS y ventas` · `06 Clientes` · `07 Finanzas` ·
`99 Descartes`.

Cada página lleva arriba a la izquierda una Sección «Índice» con el nombre del módulo y la lista de
sus Secciones (texto de 18 px con el color `text/secondary` — pizarra — de `01 Sistema`). Dentro de
cada página las Secciones quedan apiladas por flujo (lista → detalle → diálogos → móvil), a 400 px
una de otra y con `x = 0`.

Renombrados (se quitó el prefijo de módulo cuando quedaba repetido con el nombre de la página):

| Sección (antes) | Página nueva | Sección (después) |
|---|---|---|
| POS — Cabecera y caja | `05 POS y ventas` | Cabecera y caja |
| POS — Buscador y grid | `05 POS y ventas` | Buscador y grid |
| POS — Carrito | `05 POS y ventas` | Carrito |
| POS — Cobro | `05 POS y ventas` | Cobro |
| POS — Mapa de atajos | `05 POS y ventas` | Mapa de atajos |
| POS — Móvil v2 | `05 POS y ventas` | Móvil v2 |
| Escritorio — POS | `05 POS y ventas` | Escritorio — POS (sin cambio: «POS» distingue la familia de Secciones por dispositivo) |
| Móvil — POS | `05 POS y ventas` | Móvil — POS (sin cambio, misma razón) |
| Configuración › POS | `05 POS y ventas` | Configuración › POS (sin cambio) |
| POS — CustomerPicker | `06 Clientes` | CustomerPicker |
| Finanzas — Impuestos | `07 Finanzas` | Impuestos |

Chequeo por script al cerrar (las 8 páginas): 0 solapes entre Secciones, 0 solapes entre frames de
primer nivel, 0 nodos fuera de Sección en las páginas de pantallas, 0 instancias desvinculadas
(las instancias siguen apuntando a sus maestros de `02 Componentes`, que no se movió).


Vistas generales de las páginas nuevas: `docs/design/figma/12-mapa-03-navegacion-y-shell.png`,
`12-mapa-04-inventario.png`, `12-mapa-05-pos-y-ventas.png`, `12-mapa-06-clientes.png`,
`12-mapa-07-finanzas.png`.
