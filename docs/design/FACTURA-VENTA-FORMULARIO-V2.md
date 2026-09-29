# Factura de venta — formulario nuevo / editar v2: análisis y propuesta en Figma

Fecha: 2026-09-28 · Encargo del dueño: «en Figma no creaste el formulario de nueva factura ni
compartiste los componentes con facturas de compra; el formulario de nueva factura de venta sigue
siendo el viejo. Organizarlo bien primero en Figma, que cumpla con todo, reutilice los componentes y
sea en base al manual de marca, pero que cumpla toda la funcionalidad que tiene actualmente, e incluso
si es posible mejorarla». Indicación posterior: **«Nueva factura de venta es igual a Editar»** — un solo
formulario con modos, no dos.

Alcance: **solo diseño en Figma y análisis**. El código de la app no cambia hasta que el dueño apruebe
(memoria «Figma primero, código tras aprobación»).

Archivo Figma «GO Admin — Sistema de diseño» (`EAvjINVRnlzFM70GVoWXgl`), página `07 Finanzas`
(`264:98915`) y `02 Componentes` (`3:2`). Sin nombres de organizaciones cliente: datos ficticios
(«Mi empresa S.A.S.», «Comercial Andina S.A.S.», «Distribuidora del Norte», «Laura Gómez»).

Fuentes que no se repiten: `AUDITORIA-CONTROLES-FINANZAS.md` §B.3, §B.4 y §B.7 (auditoría de 2026-09
con números de línea que ya no coinciden: aquí se actualizan) · `implementacion/FACTURAS-VENTA-CXC-PLAN.md`
§3.1, §3.2 fila «Nueva / editar», P8 y §8.3 · `implementacion/FACTURAS-COMPRA-CXP-PLAN.md` §3.2 y F6 ·
`KIT-CODIGO.md` (adenda 2026-09-24, `kit/documento/`) · `marca-azul-go-4361ee` (tokens de Figma).

---

## 0. Resumen

- **Hoy el formulario hace mucho más de lo que muestra.** 1.479 líneas en `NuevaFacturaForm.tsx` más
  1.558 en sus piezas: numeración con validación de duplicado, oportunidades del CRM, duplicar,
  promociones automáticas al guardar, resolución de impuesto por línea (F-42), aviso de líneas sin
  impuesto, seriales, faltantes de inventario, comisión con tasa sugerida, factura electrónica con
  preferencia global, «incluir en el arqueo». El inventario de §1 lista **97 controles y 23 lógicas
  ocultas**; el diseño v2 los conserva todos (§4, matriz de paridad).
- **Guardar ya es del servidor** (`POST/PUT /api/facturas-venta` → `fn_factura_venta_guardar`, una
  transacción) y emitir también (`POST …/[id]/emitir` → `fn_factura_venta_emitir`). Lo viejo es la
  pantalla: shadcn suelto, sin kit, sin «Emitir» (solo «Guardar factura»), sin aviso al salir, tabla con
  `min-w-[800px]` que en móvil obliga a desplazar de lado.
- **Compras ya está rediseñado en código** (`facturas-compra/formulario/FormularioFacturaCompra.tsx`,
  981 líneas) con `DocumentoCabecera`, `FormSection`, `FormField`, `CampoNumero`, `SupplierPicker`,
  `DocumentoLineas`, `DocumentoTotales`, `ProductSearchDialog` y un diálogo de ítem manual propio. La
  venta debe usar **las mismas piezas** (§2): un solo formulario de documento con dos variantes.
- **Un solo formulario para nueva y editar** (§3.1): mismo componente, mismas secciones; cambian título,
  botones y lo que queda bloqueado. En código será `FormularioFacturaVenta` montado en `/nuevo` y en
  `/[id]/editar`, como ya hace compras.
- **Hallazgos que el rediseño corrige** (§1.4): el interruptor de factura electrónica **encola el
  borrador** en la DIAN antes de emitirlo; editar **pierde** «incluir en el arqueo» y la tarifa de los
  impuestos aplicados; el impuesto «Predeterminado» no avisa al padre al desmarcarse; 32 `console.log`
  por render en `ImpuestosFactura`; `FormaPagoSelector` hace una consulta por método (N+1).
- **Figma** (§5): sección nueva en `07 Finanzas` con 26 frames. **Los diálogos aprobados de compras son
  ahora los de las dos**: «Agregar productos a la orden» (4 estados, eran frames sueltos) y «Agregar ítem
  manual» se convirtieron en componentes con variante Compra/Venta, y `CustomerPicker` recibió las
  variantes que ya tenía «Elegir proveedor». Los frames de órdenes de compra y de B.7 usan esas
  instancias. Dos piezas sin equivalente previo (`LineaDocumentoEdicion`, `ImpuestosLinea`) quedan como
  propuesta de estados de `DocumentLinesTable` (pregunta 1).

---

## 1. Inventario de la funcionalidad actual (código a 2026-09-28)

Rutas: `/app/finanzas/facturas-venta/nuevo` (`app/app/finanzas/facturas-venta/nuevo/page.tsx`: monta
`PageBackHeader` + `Card` + `NuevaFacturaForm`) y `/app/finanzas/facturas-venta/[id]/editar`
(`EditarFacturaVenta`, que carga y delega en el mismo `NuevaFacturaForm` con `esEdicion`). Rutas
abreviadas: `NFF` = `facturas-venta/nueva-factura/NuevaFacturaForm.tsx`, `IF` = `ItemsFactura.tsx`,
`CS` = `ClienteSelector.tsx`, `IMP` = `ImpuestosFactura.tsx`, `FP` = `FormaPagoSelector.tsx`,
`PBH` = `PageBackHeader.tsx`, `EFV` = `facturas-venta/editar/EditarFacturaVenta.tsx`.

### 1.1 Controles, uno por uno

| # | Tipo | Etiqueta (es) | Qué hace | Cuándo | Archivo:línea | En v2 |
|---|---|---|---|---|---|---|
| 1 | botón | ← (ArrowLeft) «Volver a facturas de venta» | Vuelve al listado (`router.push`) | Nueva | PBH:22-35 | ← de `DocumentHeader` (confirma si hay cambios) |
| 2 | texto | «Nueva factura de venta» / «Editar factura de venta» | Título | Siempre | PBH:36-41 · EFV:289-294 | Título por modo (§3.1) |
| 3 | campo | «Número de factura» (placeholder «Ej.: FACT-00001», requerido) | Número manual | Siempre | NFF:956-980 | «Numeración»: resolución + «se asigna al emitir»; número manual como opción avanzada |
| 4 | lógica | Verifica duplicado al salir del campo y 500 ms después de escribir | `checkDuplicateInvoiceNumber` | Nueva | NFF:549-584, 595-606, 964-969 | Igual, error en línea (sin toast) |
| 5 | botón | ⟳ «Generar número automático» | `generateInvoiceNumberUtil(org,'FACT')` en el navegador | Siempre | NFF:981-998, 609-619 | Desaparece: el número lo da `fn_get_next_invoice_number` al emitir (D9) |
| 6 | texto | «Este número de factura ya existe.» + borde rojo | Duplicado | Si duplicado | NFF:1000-1002, 978 | Error en línea del campo |
| 7 | campo | «Fecha de emisión» (`DatePicker`) | Al cambiar, vence = emisión + términos | Siempre | NFF:1005-1021 | `CampoFecha` (calendario del kit, `DateRange 104:3343`) |
| 8 | campo | «Fecha de vencimiento» (`DatePicker`) | Editable; por defecto hoy + 30 | Siempre | NFF:1023-1031, 180-185 | `CampoFecha` + ayuda «emisión + 30 días» |
| 9 | campo | «Moneda» («{código} - {nombre} ({símbolo})») | Monedas de la organización; base por defecto; respaldo `resolveOrgCurrency` | Siempre | NFF:1033-1065, 278-344 | Igual (`Select`) |
| 10 | texto | «Datos del cliente» | Sección | Siempre | NFF:1076-1078 | Tarjeta «Cliente» |
| 11 | campo | `BranchSelectorField` (requerido) | Sucursal; sigue a la del selector global | Siempre | NFF:1080-1084, 169-175 | «Sucursal» en Datos del documento |
| 12 | campo | Select «Buscar cliente» con buscador dentro | 100 clientes al abrir, búsqueda en servidor (nombre, correo, teléfono, razón social, nombre comercial, documento), 300 ms, 50 resultados | Siempre | CS:247-323, 196-228, 72-158 | `CustomerPicker` («Elegir cliente», F2) |
| 13 | texto | «Contacto: {nombre} ({cargo})» | Contacto principal de empresas | Por opción | CS:96-125, 312-314 | Igual en la fila del picker |
| 14 | estado | «Buscando…» · «Cargando clientes…» · «No se encontraron clientes» | Carga y vacío | — | CS:276-288 | Estados del picker |
| 15 | botón | «+» «Nuevo cliente» | Abre `ClienteFormDialog` (formulario completo) y selecciona el creado | Siempre | CS:326-351, 238-241 | «Crear “…”» en el picker + formulario rápido; «Formulario completo» sigue |
| 16 | texto | Avatar + nombre + «Correo: …» + «Teléfono: …» | Ficha del elegido | Si hay cliente | CS:355-383 | Tarjeta del cliente elegido (documento, contacto, cartera, «Cambiar · Ver · Editar · Quitar») |
| 17 | campo | «Oportunidad (opcional)» / «Sin oportunidad asociada» | Carga los productos de la oportunidad (con impuesto 0) y su cliente | Si hay oportunidades abiertas | NFF:1092-1129, 384-448 | «Oportunidad del CRM» en Datos del documento; las líneas pasan por la resolución de impuesto |
| 18 | texto | «Al seleccionar una oportunidad, se cargan sus productos…» | Ayuda | Con oportunidad | NFF:1122-1126 | Ayuda del campo |
| 19 | texto | «Ítems de la factura» | Sección | Siempre | NFF:1138-1140 | «Líneas de la factura» + contador |
| 20 | diálogo | `ProductSearchDialog mode="sale"` (moneda del documento, sucursal, marca los ya elegidos, «Crear producto») | Catálogo con variantes, modificadores, stock por sucursal, favoritos, más vendidos y recetas | Siempre | IF:201-208 · `shared/product-search/ProductSearchDialog.tsx` | `Diálogo · Agregar productos` Documento=Venta (el mismo de compras) |
| 21 | lógica | Agregar producto: precio + extra de modificadores, descripción con modificadores, impuesto y stock del producto | `agregarItemDirecto` | Al elegir | IF:85-129 | Igual |
| 22 | botón | «Agregar ítem manual» | Línea vacía editable en la tabla | Siempre | IF:210-224, 137-149 | `Diálogo · Agregar ítem manual` Documento=Venta (descripción, precio, impuesto, nota que sale en el PDF) |
| 23 | botón | «Capturar seriales» + contador | Abre `SerialSelectorDialog` (se abre solo al agregar un serializado) | Si hay serializados | IF:226-245, 55-62, 422-434 | «Elegir seriales» en la línea («⋯» y chip «Serial 0/1») |
| 24 | campo | «Descripción» (input por línea) | Editable | Por línea | IF:274-283 | Editable en la línea |
| 25 | badge | «Serial» · «{n}/{cantidad} seriales» (verde completo / naranja) | Progreso | Serializados | IF:284-306 | `Badge` éxito / advertencia |
| 26 | campo | «Cantidad» (mín. 1) con borde rojo si supera el stock | — | Por línea | IF:309-326 | `CampoNumero` |
| 27 | texto | «Stock: {cantidad}» (rojo) | Cantidad > existencias | Si `track_stock` | IF:321-331 | Aviso en línea: «Solo hay 3 en Sucursal Principal · faltan 2» (mejora M3) |
| 28 | campo | «Precio unit.» | — | Por línea | IF:334-346 | `CampoNumero` con prefijo de la moneda |
| 29 | campo | «Descuento» (valor) | — | Por línea | IF:349-362 | Igual (valor o %: mejora M9) |
| 30 | celda | «Impuesto»: «{tasa}%» o «N/A» | Solo muestra la tarifa del producto | Por línea | IF:364-370 | `ImpuestosLinea`: elegir uno o varios impuestos de la organización |
| 31 | etiqueta | `EtiquetaSinImpuesto` | La línea quedará sin impuesto | Si aplica | IF:371-373 | Estado «Sin impuesto» del selector + aviso |
| 32 | toggle | casilla «Incluido» por línea | `tax_included` de la línea | Si hay impuesto | IF:374-392 | «Incluido en el precio» dentro de `ImpuestosLinea` |
| 33 | cálculo | «Total» de la línea | `updateItem` recalcula con descuento e impuesto | Por línea | IF:395-397, 152-185 | Igual (lo calcula el servicio, `DocumentoLineas`) |
| 34 | botón | papelera «Quitar ítem» | Quita la línea | Por línea | IF:399-412 | Igual + «⋯» (nota, seriales, lote, duplicar línea) |
| 35 | estado | «No hay ítems en la factura» | Vacío | Sin líneas | IF:264-269 | `EmptyState` con «Buscar producto» y «Ítem manual» |
| 36 | texto | «Condiciones de pago» | Sección | Siempre | NFF:1163-1165 | Dentro de Datos del documento |
| 37 | campo | «Términos de pago»: Contado · 15 · 30 · 45 · 60 · 90 días · Personalizado | Recalcula el vencimiento | Siempre | NFF:1172-1212 | Igual |
| 38 | campo | Días personalizados (número + «días») | — | Si «Personalizado» | NFF:1214-1239 | `CampoNumero` con sufijo «días» |
| 39 | campo | «Forma de pago» | Métodos activos de la organización; elige el primero | Siempre | FP:104-148, 39-102 | Igual (una consulta, no N+1) |
| 40 | estado | «Cargando métodos…» / «No hay métodos de pago disponibles» | — | — | FP:127-134 | Estados del `Select` |
| 41 | campo | «Notas» (una línea, «Notas adicionales») | Texto libre | Siempre | NFF:1249-1265 | «Notas para el cliente» (área de texto) + «Términos y condiciones» (M8) |
| 42 | toggle | «Incluir en arqueo de caja» + ayuda | `include_in_cash_register` (por defecto sí) | Siempre | NFF:1266-1278, 193 | Casilla en Datos del documento |
| 43 | toggle | «Factura electrónica» (Zap) + tooltip | Envía a la DIAN **al guardar** | Siempre | NFF:1279-1293 · `ElectronicInvoiceToggle` | Interruptor que decide qué pasa **al emitir** (H1) |
| 44 | badge | «Global» | Forzado por la preferencia de la organización | `alwaysEnabled` | NFF:1289-1291, 197-202 | `Badge` información «Global» + interruptor bloqueado |
| 45 | texto | «Resumen e impuestos» | Sección | Siempre | IMP:427-429 | `DocumentTotals venta` |
| 46 | cálculo | «Subtotal:» + «(imp. incluidos)» | — | Siempre | IMP:433-441 | Fila «Subtotal» |
| 47 | toggle | «Impuestos incluidos en precios» | Propaga `tax_included` a todas las líneas | Siempre | IMP:449-469 · NFF:1303-1313 | Interruptor «Precios con impuestos incluidos» (tarjeta Impuestos de la organización) |
| 48 | toggle | casilla «{nombre} ({tasa}%)» por impuesto de la organización (sin retenciones) | Se aplica a las líneas **sin impuesto propio** | Siempre | IMP:473-528, 371-403 | Igual, con ayuda explícita |
| 49 | badge | «Predeterminado» | — | Impuesto por defecto | IMP:507-519 | Igual |
| 50 | estado | «No hay impuestos configurados» | — | Sin impuestos | IMP:523-527 | Igual + enlace a Tesorería › Impuestos |
| 51 | cálculo | «{nombre} ({tasa}%): (incluido)» + importe · «Total impuestos:» · «Total:» + «(incluye {subtotal} + impuestos)» | Desglose | Siempre | IMP:532-580 | Base por impuesto, incluidos aparte, retenciones informativas |
| 52 | texto | «Comisión de vendedor (opcional)» | Sección | Siempre | NFF:1329-1332 | Tarjeta «Comisión del vendedor» |
| 53 | campo | «Vendedor» (buscable, «Sin asignar») | Miembros de la organización; al elegir, sugiere la tasa (`fn_tasa_comision_vigente`) | Siempre | NFF:1338-1347, 350-381, 652-663 | Igual + ayuda «Tasa sugerida por la configuración» |
| 54 | campo | «Comisión» (% o $) | Tasa o monto | Siempre | NFF:1357-1378 | `CampoNumero` con sufijo/prefijo |
| 55 | toggle | «Porcentaje» / «Monto fijo» | `commission_method` | Siempre | NFF:1386-1405 | `SegmentedControl` |
| 56 | texto | «El porcentaje no puede superar 100 %» / «El monto supera el total de la factura» | Validación | Si excede | NFF:1379-1384, 1406-1417 | Error en línea del campo |
| 57 | cálculo | «Comisión estimada ({valor}):» + importe | Sobre el subtotal sin impuestos | Con vendedor y tasa | NFF:1420-1434, 255-275 | Fila informativa |
| 58 | aviso | `AvisoSinImpuesto` («se facturará sin impuesto») | Líneas que quedarían en 0 % | Si hay | NFF:1437, 226-243 | Aviso junto al resumen + estado de la línea |
| 59 | botón | «Cancelar» (← outline) → `router.back()` | Sale **sin preguntar** | Siempre | NFF:1445-1460 | «Cancelar» con «Salir sin guardar» |
| 60 | botón | «Guardar factura» / «Guardar cambios» / «Guardando…» | Guarda el borrador | Siempre | NFF:1461-1475 | «Guardar borrador» + «Emitir factura» |
| 61 | toast | faltan número, usuario, organización, sucursal, cliente, ítems | Validaciones | Al guardar | NFF:668-699 | Errores en línea + resumen arriba (M4) |
| 62 | toast | «Seriales requeridos» | Serializados sin completar | Al guardar | NFF:701-711 | Chip de la línea en advertencia + error al emitir |
| 63 | toast | «Número duplicado» | — | Al validar | NFF:573-575 | Error en línea |
| 64 | toast | «Guardada, pero sin existencias para emitir» + detalle | `faltantes` que devuelve la RPC | Tras guardar | NFF:906-911 | Aviso en la línea antes de guardar; diálogo al emitir |
| 65 | toast | «Factura creada y enviada a la DIAN» / «…error al enviarla» / «…no se pudo enviar» | Tras guardar con FE | Con FE | NFF:914-928 | Solo al emitir (H1) |
| 66 | toast | «La factura se creó correctamente.» | — | Sin FE | NFF:927 | «Borrador guardado» / «Factura FV-1043 emitida» |
| 67 | toast | «Factura duplicada» | Llega con `?duplicar=` | Duplicar | NFF:535 | Banda informativa «Copia de FV-1038» |
| 68 | toast | «Ya existe una factura con ese número.» · «No tienes permiso para crear facturas.» · «Ocurrió un error al guardar…» | Errores del servidor | Al guardar | NFF:931-941 | Banda de error arriba |
| 69 | estado | Esqueletos de cabecera y rejilla | Cargando la factura | Editar | EFV:187-217 | Modo «editar — cargando» |
| 70 | estado | `Alert` destructivo «No se puede editar una factura en estado «{estado}»…» + «Intentar de nuevo» · «Volver al detalle» | No es borrador / no existe / error | Editar | EFV:219-268 | Modo «no editable»: vista bloqueada con motivo y acciones permitidas |
| 71 | toast | «Factura actualizada» / «Error al actualizar» (+ `factura_no_borrador`, `numero_duplicado`) | Tras guardar | Editar | EFV:168-181 | Igual |

Además, dentro de los diálogos que abre el formulario (no se repiten aquí, están en sus auditorías):
`ProductSearchDialog` (≈14 controles: buscador, filtros, variantes, modificadores, crear producto),
`SerialSelectorDialog` (≈6), `ClienteFormDialog` (formulario completo de cliente) y `SearchSelect` del
vendedor. Con ellos, el formulario suma **97 controles**.

### 1.2 Lógica que no se ve y que hay que conservar

| # | Lógica | Dónde | En v2 |
|---|---|---|---|
| L1 | Duplicar: `?duplicar=<id>` copia líneas y aplica `cliente`, `moneda`, `terminos`, `metodo_pago`, `notas` | NFF:499-546 | Igual; banda «Copia de …» |
| L2 | `?cliente=<id>` sin duplicar: «Nueva venta» desde la ficha o el listado de clientes | NFF:497 | Igual |
| L3 | Moneda: la de la organización (tabla de monedas, base; respaldo `resolveOrgCurrency`); nunca COP supuesto | NFF:278-347 | Igual |
| L4 | Sucursal sincronizada con el selector global | NFF:169-175 | Igual |
| L5 | Vencimiento = emisión + términos (al cambiar cualquiera) | NFF:1014-1018, 1184-1188, 1224-1228 | Igual, en el día de la organización |
| L6 | Oportunidad: precarga productos y cliente, guarda `opportunity_id` | NFF:404-448, 881 | Igual; las líneas se resuelven con impuesto (hoy entran en 0) |
| L7 | Tasa de comisión sugerida al elegir vendedor (`useCommissionRate` → `fn_tasa_comision_vigente`) | NFF:652-663 | Igual |
| L8 | Comisión: `commission_type` `salesperson` / `none`, monto calculado sobre subtotal sin impuestos | NFF:836-841, 882-884 | Igual |
| L9 | Seriales: el selector se abre solo al agregar un serializado; seriales por `product_id`; se venden al **emitir** | IF:55-62 · NFF:701-711, 899-900 | Igual |
| L10 | Promociones del canal `finances` al guardar (solo líneas sin descuento manual) | NFF:723-751 | Igual; **mejora M10**: mostrarlas antes de guardar |
| L11 | F-42: cada línea sin tarifa pasa por `resolveLineTax` (línea → impuestos aplicados → producto → predeterminado → 0) | NFF:757-788 · EFV:112-141 | Igual (en el servidor al guardar, como ya hace la RPC) |
| L12 | Totales desde las líneas (no desde el estado asíncrono de `ImpuestosFactura`) | NFF:797-816 | Igual |
| L13 | Aviso de líneas sin impuesto (`useLineasSinImpuesto`) | NFF:226-243 | Igual |
| L14 | Impuestos aplicados de la organización (`appliedTaxes`) se aplican a líneas sin impuesto propio; varias tarifas se suman | IMP:150-201 | Igual; además, varios impuestos por línea explícitos (M2) |
| L15 | «Precios con impuestos incluidos» cambia todas las líneas | NFF:1303-1313 | Igual, con confirmación si ya hay líneas editadas a mano |
| L16 | Guardar: una llamada `POST /api/facturas-venta` → `fn_factura_venta_guardar` (venta ligada, borrador, líneas, impuestos aplicados, comisión) | NFF:869-902 · `lib/finanzas/ventas/clienteFacturas.ts` | Igual |
| L17 | Editar: `PUT /api/facturas-venta/[id]`; solo borradores (`factura_no_borrador`) | EFV:40-66, 146-166 | Igual |
| L18 | Faltantes de inventario: la RPC los devuelve al guardar; emitir los bloquea con 409 `stock_insuficiente` | NFF:906-911 · `api/facturas-venta/[id]/emitir/route.ts` | Aviso en línea + diálogo al emitir |
| L19 | Emitir: `fn_factura_venta_emitir` asigna el número (`fn_get_next_invoice_number` con la resolución de la sucursal; respaldo `FACT-####`), descuenta inventario, crea cartera | migración `20260924075934` (l. 279-299) | Botón «Emitir factura» en el formulario (guarda y emite) |
| L20 | FE: preferencia «siempre activa» (`useElectronicInvoicePreference`) fuerza el interruptor | NFF:195-202 | Igual («Global») |
| L21 | Impuestos iniciales en edición: `invoice_applied_taxes` o, en facturas viejas, los `tax_code` de las líneas | NFF:627-648 | Igual |
| L22 | Errores del servidor por código (`numero_duplicado`, `sin_permiso`, `factura_no_borrador`) | NFF:931-941 · EFV:171-181 | Igual, en la banda de error |
| L23 | Organización y permisos en el servidor (`withOrg`, `finance.create`) | `api/facturas-venta/**` | Igual; sin permiso, «Emitir» deshabilitado con motivo |

### 1.3 El formulario de compra, ya rediseñado (para comparar)

`facturas-compra/formulario/FormularioFacturaCompra.tsx` (981 líneas): `DocumentoCabecera variante
formulario` con Cancelar · Guardar borrador · Confirmar factura (:458-481) · banda de error (:483-487) ·
`FormSection` «Datos del documento» con `SupplierPicker` (sugiere el plazo del proveedor, :493-508),
número del proveedor + consecutivo (:510-542), sucursal, emisión, plazo con «vence el …», vencimiento,
moneda e «IVA incluido» (:543-642) · `DocumentoLineas modo="edicion"` con `ProductSearchDialog
mode="purchase"` e «Ítem manual» en el pie y «⋯» por línea (tarifa 0/5/19, nota, seriales)
(:645-689, :337-353) · retenciones (:691-778) · notas (:780-795) · `DocumentoTotales variante="compra"`
con neto a pagar (:799-808) · `DialogoItemManual` (:881-952) y `DialogoTextoLinea` (:954-981) privados
del archivo · confirmación posterior `DialogoConfirmarCompra` (:847-876). Aviso al salir con
`beforeunload` y **`window.confirm` nativo** (:264-272, :435-439). Fechas con `<input type="date">`
nativo (:564-609), no con `CampoFecha` del kit.

Lo que el código de compras todavía **no** tiene del diseño aprobado:

- Productos: usa el `ProductSearchDialog` viejo (`shared/product-search/`, título «Catálogo de productos»);
  en la revisión del dueño muestra descripciones con **HTML crudo** y **costo $ 0,00** (no se reprodujo en
  el navegador en esta tarea). El diseño aprobado es «Agregar productos a la orden» (buscador con escáner, chips, vista
  lista/cuadrícula, «Enter agrega el primero», «+ Crear producto», «Listo (n agregados)»).
- Proveedor: `SupplierPicker` simple (solo buscador); el aprobado «Elegir proveedor» tiene chips de filtro,
  NIT · DV, contacto, «Por pagar $…» / «Al día», «+ Crear proveedor» y «Más datos».
- El botón **«#»** junto al número del proveedor (`FormularioFacturaCompra.tsx:523-539`) llama a
  `clienteCompras.siguienteNumero()` y pone el **consecutivo interno** de la organización cuando la factura
  del proveedor no trae número. Hoy su único rótulo es el `title` «Sugerir consecutivo». En el diseño: tooltip
  «Usar consecutivo interno — solo si la factura del proveedor no trae número» y la ayuda del campo lo
  dice (frame `1045:106073`; B.7 listo actualizado con el icono `Hash`).

### 1.4 Hallazgos (se corrigen en el rediseño; no se tocó código)

| # | Hallazgo | Evidencia | Propuesta |
|---|---|---|---|
| H1 | **El interruptor de factura electrónica encola el borrador**: tras guardar, `sendToFactus(guardada.id)` llama a `POST /api/factus/invoice`, que no comprueba el estado; la factura aún no está emitida ni tiene número de resolución | NFF:914-926 · `api/factus/invoice/route.ts:29-57` | El interruptor decide qué pasa **al emitir**; guardar borrador nunca envía |
| H2 | Editar **pierde «incluir en el arqueo»** (el payload de edición no lo manda) y el interruptor FE se muestra pero no hace nada | NFF:819-858 · EFV:146-166 | Mismo payload en los dos modos |
| H3 | Editar manda impuestos aplicados **sin tarifa** (`{ tax_code }`) | EFV:162-164 | Mismo payload que crear |
| H4 | Desmarcar el impuesto «Predeterminado» no avisa al padre: el total cambia en pantalla pero `appliedTaxes` no | IMP:406-417 | Un solo estado de impuestos |
| H5 | 32 `console.log` en el cálculo de totales, que corren en cada render y por línea | IMP:78-80, 103-108, 116-128, 226-243 | Sin logs; cálculo puro testeable |
| H6 | `FormaPagoSelector` hace una consulta por método (N+1) | FP:64-86 | Una consulta con relación |
| H7 | «Cancelar» sale sin preguntar (compra pregunta con `window.confirm`) | NFF:1445-1460 · compra :435-439 | Diálogo del kit en los dos |
| H8 | El número se genera en el navegador (`FACT-`) y se valida con una consulta por pulsación; D9 dice «borrador sin número, numeración al emitir» | NFF:549-619 · plan venta §7 D9 | Numeración de la resolución al emitir |
| H9 | La oportunidad carga líneas con impuesto 0 (se corrige al guardar por F-42, pero la pantalla muestra totales sin impuesto) | NFF:426-437 | Resolver impuesto al cargar |
| H10 | Tabla con `min-w-[800px]`: en móvil siempre hay desplazamiento lateral | IF:249-250 | Tarjetas en móvil (`DocumentoLineas` ya lo hace) |

---

## 2. Qué se comparte entre venta y compra

| Pieza | Figma (hoy) | Código (hoy) | Venta | Compra | Estado en v2 |
|---|---|---|---|---|---|
| Cabecera del formulario | `DocumentHeader Variant=formulario` `405:157349` | `kit/documento/DocumentoCabecera` | Cancelar · Guardar borrador · **Emitir factura** | Cancelar · Guardar borrador · **Confirmar factura** | ya compartida |
| Secciones y campos | `FormSection 109:4781`, `FormField 50:2685`, `Select 103:3174`, `NumberInput 103:3283` | `FormSection`, `FormField`, `CampoNumero` | sí | sí | ya compartida |
| Fechas | `DateRange 104:3343` (calendario del kit) | `kit/CampoFecha.tsx` | emisión, vencimiento | emisión, vencimiento (hoy `<input type="date">`) | venta la usa; **compra pendiente** de pasar a `CampoFecha` |
| Tercero («Elegir …» y tarjeta) | `SupplierPicker 415:160070` (ya tenía `dialog` con filtros, `inline` elegido y `field`) · `CustomerPicker 192:11644` (no los tenía) | `kit/SelectorEntidad` + `CustomerPicker` / `SupplierPicker` | «Elegir cliente»: chips Persona · Empresa · Con saldo por cobrar; «Por cobrar $…» / «Al día»; «+ Crear cliente» | «Elegir proveedor» (aprobado) | **Se actualizó `CustomerPicker`** con las 4 variantes que ya tenía el de proveedor (§5.2); la pareja SupplierPicker/CustomerPicker es la variante Compra/Venta del mismo diálogo |
| Agregar productos | «Diálogo · Agregar productos a la orden» (4 estados en `04 Inventario`, eran frames sueltos) | `shared/product-search/ProductSearchDialog` (`mode` sale · purchase) | precio de venta, stock de la sucursal, lotes, serial, sin «Solo del proveedor» | costo del proveedor, «Solo del proveedor», stock | **Convertido en componente** `Diálogo · Agregar productos` (Documento=Compra · Venta × Estado); los 4 frames de órdenes de compra ya son instancias |
| Ítem manual | «Diálogo / Agregar ítem manual» (frame de B.7) | `DialogoItemManual` privado de compras | descripción, precio unitario, impuesto, nota que sale en el PDF | descripción, costo unitario, impuesto, nota | **Convertido en componente** `Diálogo · Agregar ítem manual` (Documento=Compra · Venta); en código, subir `DialogoItemManual` a `kit/documento/` |
| Línea en edición | `DocumentLinesTable Mode=edición` `415:12083` (tabla completa con datos de ejemplo, sin estado de aviso) | `kit/documento/DocumentoLineas` | aviso de stock, serial, lote | diferencia con la orden, seriales | `LineaDocumentoEdicion` (Documento × Estado=producto · manual · aviso · error): **propuesta de estados para `DocumentLinesTable`**, no un componente paralelo (pregunta 1) |
| Impuestos por línea | casilla «Incluido» + select en la tabla de compra | menú «⋯» con 0/5/19 % en compra; tarifa fija en venta | uno o varios impuestos de la organización + incluido | ídem | `ImpuestosLinea` (Estado=cerrado · abierto · sin-impuesto): ídem, se integra en `DocumentLinesTable` si se aprueba |
| Totales | `DocumentTotals` `413:12549` (venta · compra · cotización) | `kit/documento/DocumentoTotales` | base por impuesto, incluidos, retenciones informativas | retenciones que restan, neto a pagar | ya compartida |
| Notas y seriales de línea | — | `DialogoTextoLinea` privado de compras | nota de línea | nota y seriales | subir a `kit/documento/` en código |
| Salir con cambios | `ConfirmDialog 113:4903` | `ui/confirm-dialog` | sí | sí (hoy `window.confirm`) | un solo diálogo |

Regla: **ninguna pieza calcula el negocio**. Los totales, la resolución de impuesto, los faltantes y la
comisión los calcula el servicio o la RPC (`fn_factura_venta_guardar`), igual que en compras.

---

## 3. Propuesta

### 3.1 Un solo formulario, cinco modos

En código: **un componente `FormularioFacturaVenta({ id? })`** en
`components/finanzas/facturas-venta/formulario/`, montado por `/nuevo` y por `/[id]/editar` (como
`FormularioFacturaCompra`). En Figma: un frame base y sus copias por modo, con el mismo orden de
secciones.

| Modo | Título | Subtítulo | Botones de la cabecera | Qué se bloquea |
|---|---|---|---|---|
| Nueva — vacía | «Nueva factura de venta» | «Borrador sin guardar · Sucursal Principal · COP» | Cancelar · Guardar borrador · **Emitir factura** (deshabilitado con motivo «Elige un cliente y agrega una línea») | nada |
| Nueva — con datos | ídem | ídem | Cancelar · Guardar borrador · **Emitir factura** | nada |
| Editar — borrador | «Editar factura · borrador» (el número aún no existe: D9) | «Guardado hace 5 min por Laura Gómez · Sucursal Principal · COP» + `StatusBadge` Borrador | Cancelar · **Guardar cambios** · **Emitir factura** | sucursal y moneda si la venta ligada ya tiene pagos o seriales reservados (se muestra el candado con motivo); lo demás, editable |
| Editar — cargando | «Editar factura» | — | deshabilitados | todo (esqueletos; la cabecera no se esqueletiza) |
| Editar — no editable (emitida o anulada) | «Factura FV-1042» | «Emitida el 28 sep 2026 · no se puede editar» + `StatusBadge` + estado DIAN | Ver factura · **Crear nota crédito** · «⋯» Duplicar como nueva | todo: los mismos bloques en solo lectura, con la banda del motivo y las acciones permitidas |

Duplicar (`?duplicar=`) y «Nueva venta» del cliente (`?cliente=`) son la variante «Nueva — con datos»
con una banda informativa.

### 3.2 Estructura (escritorio 1440)

1. `DocumentHeader formulario`: migas Finanzas › Facturas de venta › Nueva factura; ←; título; acciones.
2. Fila de dos columnas: **Datos del documento** (numeración de la resolución con «próximo FV-1043, se
   asigna al emitir», emisión, términos, vencimiento, sucursal, moneda, forma de pago, oportunidad del
   CRM; interruptor «Factura electrónica al emitir» con «Global»; casilla «Incluir en el arqueo de caja»)
   y **Cliente** (tarjeta con `CustomerPicker Layout=inline, State=selected`, igual que la de proveedor).
3. **Líneas de la factura** a todo el ancho: «Buscar producto» (F3) · «Agregar ítem manual»; filas
   `LineaDocumentoEdicion` con `ImpuestosLinea`; avisos en la línea.
4. Abajo a la izquierda: **Notas y términos** y **Comisión del vendedor**. A la derecha, fijo al
   desplazar: `DocumentTotals venta` (bases por impuesto, incluidos, retenciones informativas),
   **Impuestos de la organización** (incluidos en precios, impuestos que se aplican a líneas sin impuesto
   propio) y **Atajos**.

Tableta 1024: menú en riel, una columna (cliente arriba, datos, líneas, totales). Móvil 390: cabecera de
página con «Guardar», secciones plegables con resumen, líneas en tarjetas, «Agregar producto» abre la
hoja `Diálogo · Agregar productos` Estado=Hoja móvil, total y «Emitir factura» fijos abajo.

### 3.3 Mejoras (cada una para aprobación del dueño)

| # | Mejora | Por qué |
|---|---|---|
| M1 | **Guardar borrador** separado de **Emitir factura** en el formulario (emitir = guardar + `fn_factura_venta_emitir`) | Hoy hay que guardar, ir al detalle y emitir; el botón «Guardar factura» deja un borrador que muchos creen emitido |
| M2 | **Varios impuestos por línea** elegidos de la lista de la organización (`ImpuestosLinea`), con «Incluido en el precio» por línea | Hoy la línea solo muestra la tarifa del producto; lo «múltiple» depende de casillas globales que se aplican a líneas sin impuesto, difícil de entender |
| M3 | **Aviso de stock en la línea** («Solo hay 3 en Sucursal Principal · faltan 2») antes de guardar, en vez del toast posterior | El usuario ve el problema donde lo puede arreglar; al emitir, el diálogo de faltantes ofrece «Ajustar cantidades» o «Guardar como borrador» |
| M4 | **Validación en línea** y resumen arriba («Revisa 3 campos») con enlace a cada uno | Hoy son toasts que desaparecen |
| M5 | **Vencimiento por términos** visible («emisión + 30 días = 28 oct 2026») y términos por defecto del cliente (si el cliente tiene crédito, se sugiere su plazo, como compras hace con el proveedor) | Menos errores de vencimiento |
| M6 | **Atajos**: F2 cliente, F3 buscar producto, Alt+M ítem manual, Ctrl+S guardar borrador, Ctrl+Enter emitir, Esc cerrar diálogo (con `useAtajos` y `Kbd` del kit) | Captura rápida para quien factura mucho |
| M7 | **Retenciones informativas** que practicará el cliente (según su responsabilidad fiscal), sin restar del total | Plan de venta D13; el usuario sabe cuánto le consignarán |
| M8 | «Notas para el cliente» (van al PDF) y «Términos y condiciones» (texto por defecto de la organización, editable) | Hoy «Notas» es una línea |
| M9 | Descuento por línea en valor **o en %** | Pedido frecuente en ventas |
| M10 | **Promociones visibles antes de guardar** (chip «Promoción −$ 12.000» en la línea) | Hoy se aplican en silencio al guardar |
| M11 | **Salir con cambios** con «Guardar borrador y salir» | Hoy se pierde todo |
| M12 | **Estado «no editable» útil**: la factura emitida se muestra en solo lectura con su motivo y las acciones permitidas (nota crédito, duplicar) en vez de un error | Hoy es un `Alert` rojo |
| M13 | Guardado del borrador **automático** cada 30 s cuando ya existe (no en la primera vez) | Evita perder trabajo; pendiente de decidir (pregunta 3) |
| M14 | Resumen del cliente en la tarjeta: cartera por cobrar y vencida, crédito y lista de precios | Evita facturar a crédito a quien está en mora |

---

## 4. Matriz de paridad: nada se pierde

Cada control de §1.1 tiene su lugar en v2 (columna «En v2»). Ninguno desaparece salvo:

- #5 «Generar número automático»: sustituido por la numeración de la resolución al emitir (D9). Si el
  dueño quiere seguir numerando a mano (migraciones, facturas de contingencia), queda «Número manual»
  como opción avanzada del campo Numeración, con la misma validación de duplicado.
- #65 envío a la DIAN al guardar: pasa a ocurrir al emitir (H1).

Lógicas L1–L23: todas se conservan; L6 y L10 mejoran (H9, M10).

---

## 5. Figma

### 5.1 Dónde verlo

- Sección **«Facturas de venta — Nueva y editar v2 (propuesta)»** `1034:97025`, página `07 Finanzas`,
  en x = 0, y = 66.600 (debajo de «Documentos v2»):
  https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1034-97025
- Enlazada desde el **Índice** (`264:98925`, entrada 25 con hipervínculo a la sección).
- La sección vieja `424:169265` pasó a llamarse «Facturas de venta — nueva y editar (B.3 · B.4) — versión
  anterior» y lleva una nota arriba que apunta a la v2. **No se borró nada.**
- Componentes: `02 Componentes` › sección «Finanzas — Formulario de documento: venta y compra (Nuevo)»
  `1032:32705` (x = 80.000, y = 110.000):
  https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1032-32705

### 5.2 Componentes

| Componente | Id | Qué se hizo | Variantes |
|---|---|---|---|
| `Diálogo · Agregar productos` | set `1042:34652` | **Los 4 frames sueltos «Agregar productos a la orden»** de `04 Inventario` › «Órdenes de compra — selectores con filtros» (`586:293332`) convertidos en componente; los frames de la OC ahora son instancias (mismo aspecto) | Documento=Compra · Venta × Estado=Sin filtros · Filtros abiertos · Filtros aplicados · Sin resultados · Hoja móvil (Compra/Sin filtros `1042:33921`, Venta/Sin filtros `1042:34074`) |
| `Diálogo · Agregar ítem manual` | set `1042:134761` | El diálogo de B.7 (`425:181296`) convertido en componente; el frame de B.7 usa la instancia | Documento=Compra `1042:134690` · Venta `1042:134760` |
| `CustomerPicker` (existente) | `192:11644` | **4 variantes añadidas** copiando las de `SupplierPicker` y pasando a cliente: nada existente cambió | `Layout=inline, State=selected` `1041:33785` · `Layout=dialog, State=filtros-abiertos` `1041:33841` · `Layout=dialog, State=filtrado` `1041:34046` · `Layout=field, State=idle` `1041:34174` |
| `LineaDocumentoEdicion` (Nuevo, propuesta) | set `1032:33591` | Fila de `DocumentLinesTable` en edición con aviso y error en línea | Documento=venta · compra × Estado=producto · manual · aviso · error |
| `ImpuestosLinea` (Nuevo, propuesta) | set `1032:32779` | Selector de uno o varios impuestos por línea + «Incluido en el precio» | Estado=cerrado · abierto · sin-impuesto |

Reutilizados tal cual: `Sidebar`, `AppHeader`, `DocumentHeader formulario` (`405:157349`), `DocumentTotals
venta` (`413:12549`), `FormField`, `Select`, `DateRange` (calendario del kit), `NumberInput`, `Switch`,
`Checkbox`, `Badge`, `Button`, `IconButton`, `SegmentedControl`, `Kbd`, `EmptyState`, `Skeleton`, `Toast`,
`Tooltip`, `ListCard`, `MobileHeader`, `ProductCard`, `RangoNumeracion`, `QuickCustomerForm`,
`SupplierPicker`. Se retiraron los sets provisionales `TarjetaTercero`, `AgregarProductosDialog` e
`ItemManualDialog` que había creado antes de la indicación del dueño; sus instancias pasaron a los
componentes de arriba.

### 5.3 Frames de la sección v2

Un solo formulario; los modos son copias del frame base con el mismo orden de secciones.

| Frame | Id |
|---|---|
| Escritorio · Modo=nueva — con datos (base) | `1034:97035` |
| Escritorio · Modo=nueva — vacía | `1034:98562` |
| Escritorio · Modo=editar — borrador | `1034:99656` |
| Escritorio · Modo=editar — cargando | `1034:100150` |
| Escritorio · Modo=editar — no editable | `1034:100667` |
| Escritorio · Modo=nueva — errores de validación | `1034:101732` |
| Escritorio · Modo=nueva — emitiendo | `1034:102762` |
| Diálogo / Elegir cliente (CustomerPicker, filtros) | `1036:102933` |
| Diálogo / Crear cliente en línea (picker + QuickCustomerForm) | `1036:103119` |
| Venta / Cliente creado vuelve elegido | `1045:105326` |
| Diálogo / Agregar productos (venta) | `1036:103328` |
| Diálogo / Crear producto (venta) | `1045:105410` |
| Venta / Producto creado vuelve como línea | `1045:105525` |
| Diálogo / Agregar ítem manual (venta) | `1036:103616` |
| Panel / Impuestos por línea abierto | `1036:103788` |
| Diálogo / Emitir con faltantes de stock | `1036:103905` |
| Diálogo / Salir con cambios sin guardar | `1036:103966` |
| Panel / Datos del documento — numeración y factura electrónica | `1036:104002` |
| Panel / Comisión del vendedor — estados | `1036:104138` |
| Tableta 1024 · Modo=nueva — con datos | `1037:103500` |
| Móvil 390 · Modo=nueva — con datos | `1037:104577` |
| Móvil 390 · Agregar productos (hoja) | `1037:105409` |
| Diálogo / Crear proveedor — formulario rápido (compra) | `1045:105618` |
| Compra / Proveedor creado vuelve elegido | `1045:105885` |
| Diálogo / Crear producto (compra) | `1045:105970` |
| Compra / Número del proveedor y consecutivo interno | `1045:106073` |

Qué cambia entre modos (en código: un solo `FormularioFacturaVenta`):

| | Nueva | Editar borrador | No editable |
|---|---|---|---|
| Título | «Nueva factura de venta» | «Editar factura · borrador» | «Factura FV-1042» |
| Subtítulo | «Borrador sin guardar · sucursal · moneda» | «Guardado hace 5 min por … · sucursal · moneda» | «Emitida el … · cliente · estado DIAN» |
| Botones | Cancelar · Guardar borrador · **Emitir factura** | Cancelar · **Guardar cambios** · **Emitir factura** | Ver factura · Duplicar como nueva · **Crear nota crédito** |
| Bloqueado | nada | sucursal y moneda solo si la venta ligada ya reservó seriales (con motivo) | todo; sin «⋯»/quitar en líneas, sin «Buscar producto» ni «Ítem manual»; banda con el motivo |
| Número | «FV-1043 (al emitir)» | igual (el borrador no tiene número, D9) | el emitido |

### 5.4 Cómo funciona cada diálogo, paso a paso

**Elegir cliente** (venta, `CustomerPicker Layout=dialog`) — igual que «Elegir proveedor» en compras.
1. F2 en el formulario (o «Elegir cliente · F2» en la tarjeta vacía) abre el diálogo con el foco en el
   buscador y los recientes listados.
2. Escribir busca en el servidor por nombre, documento, correo o teléfono (300 ms, la búsqueda anterior se
   cancela). ↑/↓ recorren la lista, Enter elige, Esc cierra sin cambiar.
3. «Filtros» abre el panel: Estado (solo activos), Tipo de persona (Persona · Empresa), Saldo del cliente
   (Por cobrar · Todos · Al día), Responsable de IVA, Régimen simple, Con correo de facturación. Se aplican
   al instante y quedan como chips bajo el buscador; «Limpiar todo» los quita.
4. Cada fila: iniciales, nombre, insignia Persona/Empresa, documento, contacto y «Por cobrar $…» / «Al día».
5. «+ Crear cliente» abre el formulario rápido (`QuickCustomerForm`) con lo escrito en el buscador;
   «Crear y elegir» guarda y **vuelve con el cliente elegido** en la tarjeta (insignia «Recién creado» y
   toast «Cliente creado»); el foco pasa a «Buscar producto». «Más datos» abre el formulario completo.

**Elegir proveedor** (compra, `SupplierPicker Layout=dialog`): el mismo recorrido con Empresa/Persona, «Con
saldo por pagar», «Por pagar $…» / «Al día», «+ Crear proveedor» (formulario rápido: tipo de persona, NIT +
DV, razón social, contacto, días de crédito) y «Crear y elegir», que deja el proveedor elegido y sus días de
crédito en términos y vencimiento.

**Agregar productos** (`Diálogo · Agregar productos`, Compra/Venta).
1. F3 (o «Buscar producto · F3») abre el diálogo con el foco en el buscador; el escáner de código de barras
   agrega directo.
2. Escribir filtra; «Enter agrega el primero», ↑/↓ para moverse, Enter agrega el enfocado, Esc cierra.
3. Compra: costo del proveedor, stock y chip «Solo del proveedor». Venta: precio de venta de la lista,
   stock de la sucursal, lotes y serial, sin «Solo del proveedor»; «Con stock» opcional. Un producto sin
   stock en venta muestra «Sin stock» (en compra se agrega igual).
4. Cada «Agregar» suma una línea y el pie cuenta «N agregados a la factura»; «Listo (N agregados)» cierra.
5. «+ Crear producto» abre el formulario rápido (nombre, SKU o código, precio de venta o costo del
   proveedor, impuesto, categoría, «Controla inventario»); «Crear y agregar» lo crea en el catálogo y
   **vuelve como línea** (en venta con aviso de stock si aún no hay existencias).
6. En móvil es una hoja inferior con el mismo contenido.

**Agregar ítem manual** (`Diálogo · Agregar ítem manual`, Compra/Venta). Alt+M lo abre con el foco en
«Descripción del ítem»; Tab recorre precio/costo, impuesto y nota; la vista previa muestra el total de la
línea; Enter en el último campo o «Agregar ítem» lo agrega; Esc cierra. En venta la nota sale en el PDF.

**Impuestos por línea** (`ImpuestosLinea`). Clic o Enter en la celda abre el panel; Espacio marca cada
impuesto de la organización; el interruptor decide «Incluido en el precio»; «Sin impuesto (excluir esta
línea)» deja la línea al 0 % con aviso; Esc cierra.

**Emitir con faltantes.** «Emitir factura» guarda el borrador y llama a emitir; si la base responde 409
`stock_insuficiente`, el diálogo lista cada faltante con la bodega que sí tiene y ofrece «Ver existencias»,
«Seguir como borrador» y «Ajustar y emitir» (deja cada línea en lo disponible y reintenta).

**Salir con cambios.** Cancelar, ← o cerrar la pestaña con cambios: «Seguir editando» (Esc) · «Salir sin
guardar» · «Guardar borrador y salir» (primario). Mismo diálogo en compra (hoy `window.confirm`).

### 5.5 Sustituciones en los frames de compra

Hechas (seguras: mismo contenido):
- `04 Inventario` › órdenes de compra: los 4 diálogos «Agregar productos a la orden» (`586:293333`,
  `586:293540`, `586:293829`, `586:294037`) son ahora instancias de `Diálogo · Agregar productos`
  Documento=Compra.
- B.7 «Diálogo / ProductPicker (modo compra)» (`425:181172`): el `ProductPicker Mode=purchase` se sustituyó
  por la instancia Compra del diálogo compartido, con el título «Agregar productos a la factura de compra».
- B.7 «Diálogo / Agregar ítem manual» (`425:181296`): instancia del componente Documento=Compra.
- B.7 listo (`425:178191`): el botón junto al número del proveedor usa el icono `Hash` y la ayuda del campo
  explica el consecutivo interno.

Pendientes (anotadas, no hechas):
- La tabla de líneas de B.7 sigue siendo `DocumentLinesTable Mode=edición`; pasa a filas
  `LineaDocumentoEdicion` solo si el dueño aprueba integrarlas en `DocumentLinesTable` (pregunta 1).
- «Móvil / Agregar productos (sheet)» de la OC (`586:298269`) usa `BottomSheet` con contenido suelto; se
  cambia por `Diálogo · Agregar productos` Estado=Hoja móvil cuando se apruebe.
- Los frames de compra usan fechas con `Select`; la venta usa `DateRange` (calendario del kit). Unificar en
  compras cuando termine la sesión que revisa el calendario.

### 5.6 Chequeo por script (use_figma, 2026-09-28)

| Comprobación | Resultado |
|---|---|
| Solapes entre nodos de primer nivel de la sección v2 | **0** (1 anotación móvil se subió) |
| Sección v2 contra el resto de la página | **0** |
| Sección de componentes contra el resto de `02 Componentes` · `CustomerPicker` contra sus hermanos | **0 · 0** |
| Nodos fuera de su sección | **0** |
| Instancias rotas (sección v2, componentes, B.7, órdenes de compra, CustomerPicker; 1.178 instancias) | **0** |
| Textos desbordados (2.435 textos) | 25 al primer paso → **0** tras acortar la ayuda de totales, truncar la descripción de línea y fijar dos marcos |
| Nombres reales de organizaciones (contra la lista de la base, en textos y nombres de capa) | **0** |

Revisión visual: en las variantes Venta, los textos ligados a propiedades de componentes (chips, filtros,
buscador, botones) no cambiaban con un reemplazo de texto; se pasaron por `setProperties`, y el chip
«Proveedor: …» quedó oculto en las variantes Venta. En «Filtros abiertos» (Venta) el panel conserva el
campo «Lista de precios: General» en lugar de «Proveedor». El `Sidebar` quedó con «Finanzas» activo.

### 5.7 Capturas

`docs/design/figma/74-factura-venta-form-*.png` (13): `nueva-con-datos`, `nueva-vacia`,
`editar-no-editable`, `errores`, `elegir-cliente`, `agregar-productos`, `item-manual`, `impuestos-linea`,
`faltantes`, `tableta`, `movil`, `compra-crear-proveedor`, `componentes`. No se versionan (el commit lleva
solo este documento).

---

## 6. Preguntas para el dueño

| # | Pregunta | Recomendación |
|---|---|---|
| 1 | `LineaDocumentoEdicion` e `ImpuestosLinea` no existían: ¿se integran como estados de `DocumentLinesTable` (aviso, error, impuestos por línea) para venta y compra? | Sí: evita dos tablas de líneas; el código ya es uno (`DocumentoLineas`) |
| 2 | Numeración: ¿se quita el número manual y se numera siempre al emitir con la resolución (D9)? | Sí, con «Número manual» solo como opción avanzada para contingencia o migración |
| 3 | ¿Guardado automático del borrador cada 30 s (M13)? | Sí, solo cuando el borrador ya existe y sin toast |
| 4 | ¿«Emitir factura» en el formulario (guardar + emitir en un paso), además de en el detalle? | Sí (M1) |
| 5 | Impuestos múltiples por línea: ¿se permiten dos impuestos en la misma línea (p. ej. IVA + impuesto a ultraprocesados)? | Sí, desde la lista de la organización |
| 6 | Faltantes al emitir: ¿«Ajustar y emitir» deja la línea en lo disponible automáticamente? | Sí, mostrando antes el cambio |
| 7 | En venta, ¿se puede agregar un producto sin stock desde «Agregar productos»? | Sí, con aviso en la línea (el bloqueo real es al emitir) |
| 8 | Cliente vacío: ¿se ofrece «Consumidor final» como atajo? | Pendiente de su decisión; no está en el código de hoy |
| 9 | Los 4 frames de órdenes de compra y los de B.7 ya usan los componentes: ¿se aprueba cambiar también la hoja móvil de la OC y la tabla de B.7? | Sí, tras la pregunta 1 |

---

## 7. Factura de compra con la misma estructura

Decisión del dueño (2026-09-28): la factura de venta se queda con la v2 de este documento y «facturas de
venta y de compra deben tener una estructura IGUAL». Aclaración posterior: **igual la estructura, no los
botones**: misma organización de la pantalla (cabecera arriba, mismas zonas y orden de tarjetas, resumen a
la derecha, mismos componentes del kit y mismos patrones de estados), pero cada factura conserva sus
acciones, campos y flujos. La compra no toma «Emitir», oportunidad, forma de pago, factura electrónica,
arqueo ni comisión; conserva «Confirmar factura», el número del proveedor, el modo «desde orden de compra»,
las retenciones y la confirmación con recepción y documento soporte.

Alcance: solo Figma y este documento. El código de la app no cambió.

### 7.1 Dónde verlo

- Sección **«Facturas de compra — Nueva y editar v2 (misma estructura que venta)»** `1066:105465`, página
  `07 Finanzas`, en x = 0, y = 76.000 (debajo de la v2 de venta), 14.720 × 8.526:
  https://www.figma.com/design/EAvjINVRnlzFM70GVoWXgl/?node-id=1066-105465
- **Índice** (`264:98925`): entrada 26 con hipervínculo a la sección.
- La sección vieja `425:178189` pasó a llamarse «Facturas de compra — nueva y editar (B.7) — versión
  anterior» y lleva arriba la nota `1072:113901` con enlace a la v2. **No se borró ni se movió nada**
  (mismo criterio que la venta: su versión anterior tampoco se movió a «99 Archivo»).
- Los frames se hicieron **duplicando los de la venta v2** y adaptándolos, para que la igualdad de estructura
  sea literal: mismo `Sidebar`, `AppHeader`, `DocumentHeader Variant=formulario`, tarjetas, tabla de líneas,
  columna derecha y bandas de estado.

### 7.2 Estructura compartida y lo propio de cada una

| Zona (mismo orden en las dos) | Estructura compartida | Venta v2 | Compra v2 |
|---|---|---|---|
| Cabecera | `DocumentHeader formulario`: migas, ←, título, subtítulo, tres acciones | Cancelar · Guardar borrador · **Emitir factura** | Cancelar · Guardar borrador · **Confirmar factura** (icono `CheckCircle`, como en el código) |
| Banda de estado (debajo de la cabecera) | Misma banda: información, candado, error, progreso | resolución, venta ligada, emitida | desde orden, borrador, confirmada, anulada |
| Fila 1, izquierda | Tarjeta «Datos del documento» | numeración de la resolución, fechas, términos, sucursal, moneda, forma de pago, oportunidad, FE, arqueo | número del proveedor + «#», sucursal que recibe, emisión, plazo en días, vencimiento, moneda, «Los precios incluyen IVA», recepción y documento soporte |
| Fila 1, derecha | Tarjeta del tercero con el picker `inline selected` y su ayuda | `CustomerPicker` | `SupplierPicker` (el par Compra/Venta del mismo diálogo) |
| Fila 2 | «Líneas de la factura»: barra (contador, «Buscar producto · F3», «Agregar ítem manual»), encabezado, filas `LineaDocumentoEdicion`, pie con unidades y total | `Documento=venta` (stock, lote, serial, aviso de faltantes) | `Documento=compra` (stock o recibido, seriales, aviso «Diferencia con la orden») |
| Fila 3, izquierda | Tarjeta «Notas» + tarjeta propia | Notas y términos · Comisión del vendedor | Notas internas · **Retenciones** |
| Fila 3, derecha (fija al desplazar) | `DocumentTotals` + tarjeta propia + Atajos | `Variant=venta` · Impuestos de la organización | `Variant=compra` (retenciones que restan y **neto a pagar**) · **Pago al proveedor** |
| Modos | nueva vacía · nueva con datos · editar borrador · cargando · no editable · errores · guardando · tableta 1024 · móvil 390 | + emitiendo con faltantes | + **desde orden de compra** · no editable en dos variantes (**confirmada** y **anulada**) · guardando y confirmando |
| Diálogos | los mismos componentes con variante | Elegir cliente, Agregar productos Venta, Ítem manual Venta, Emitir con faltantes | Elegir proveedor, Crear proveedor, Agregar productos Compra, Crear producto (compra), Ítem manual Compra, **Confirmar factura** |

### 7.3 Correspondencia campo a campo

Código de compra: `src/components/finanzas/facturas-compra/formulario/FormularioFacturaCompra.tsx` (FFC)
y `facturas-compra/detalle/DialogosCompra.tsx` (DC). Tipo: **C** = estructura compartida, **V** = propio de
venta, **P** = propio de compra.

| # | Venta v2 | Compra v2 | Tipo | Compra hoy (código) | En Figma |
|---|---|---|---|---|---|
| 1 | Migas Finanzas › Facturas de venta › Nueva factura | Finanzas › Facturas de compra › Nueva factura / número | C | FFC:458-466 | igual |
| 2 | «Nueva factura de venta» / «Editar factura · borrador» | «Nueva factura de compra» / «Editar factura FE-88213» | C | `tituloNueva`, `tituloEditar` | igual al código |
| 3 | Subtítulo: organización · sucursal · moneda | «Registra la factura que te envió el proveedor» · sucursal · moneda; «Desde la orden OC-…» | C | `subtitulo`, `desdeOrden` | igual + sucursal y moneda |
| 4 | Cancelar | Cancelar | C | FFC:467-471 | igual |
| 5 | Guardar borrador | Guardar borrador (también al editar) | C | FFC:472-475 | igual (no se forzó «Guardar cambios») |
| 6 | **Emitir factura** | **Confirmar factura** | V / P | FFC:476-479 | confirma con el diálogo de DC |
| 7 | Numeración de la resolución + número «al emitir» | **Número de la factura del proveedor** * + botón **«#»** | V / P | FFC:511-542 (`siguienteNumero`) | tooltip «Usar consecutivo interno — solo si la factura del proveedor no trae número» (hoy solo `title` «Sugerir consecutivo»: **cambio de texto**) |
| 8 | Sucursal * | **Sucursal que recibe** * (fija si viene de una orden) | C | FFC:544-563 (`disabled={!!poId}`) | igual; en «desde orden», deshabilitada con «Fija: la de la orden» |
| 9 | Fecha de emisión * | Emisión * (no posterior a hoy) | C | FFC:565-577 (`CampoFecha`, `max` hoy) | `DateRange` del kit |
| 10 | Términos de pago (select) | **Plazo** en días (`NumberInput` con sufijo «días») + «Vence el …» | V / P | FFC:579-592 | igual; el proveedor elegido llena el plazo con sus días de crédito |
| 11 | Vencimiento (emisión + términos) | Vencimiento (emisión + plazo; cambiarlo vacía el plazo) | C | FFC:594-607 | igual, ayuda «Al cambiarla, el plazo se vacía» |
| 12 | Moneda * | Moneda (por defecto la base) | C | FFC:609-628 | «COP (moneda base)» |
| 13 | Forma de pago | — | V | no existe en compra | no se dibujó |
| 14 | «Precios con impuestos incluidos» (tarjeta Impuestos de la organización) | **«Los precios incluyen IVA»** en Datos del documento | P | FFC:630-641 | igual al código |
| 15 | Oportunidad del CRM | — (el equivalente es la orden de compra, que llega por `?orden=`) | V / P | FFC:92, 209-257 | modo «desde orden de compra» con banda y aviso en la línea |
| 16 | Factura electrónica al emitir | Recepción y documento soporte: **se eligen al confirmar** | V / P | DC:40-88 (`recepcionar`, `generar_ds`) | fila informativa: **Propuesta** (anotada fuera del frame); las casillas reales están en el diálogo «Confirmar factura» |
| 17 | Incluir en el arqueo de caja | — | V | no existe | no se dibujó |
| 18 | Tarjeta Cliente (`CustomerPicker`) | Tarjeta **Proveedor** (`SupplierPicker inline selected`: NIT · DV, contacto, «Por pagar», datos fiscales para documento soporte) | C | FFC:494-509 (`SupplierPicker` simple) | picker aprobado con filtros (ya en el kit de Figma) |
| 19 | Líneas: `LineaDocumentoEdicion Documento=venta` | `Documento=compra` | C | FFC:649-689 (`DocumentoLineas modo="edicion"`) | igual |
| 20 | Columna «Precio unit.» | «Costo unit.» | P | `precioUnitario` = costo | igual |
| 21 | Columna «Impuestos» (varios por línea, M2) | «IVA» por línea (0 · 5 · 19 % desde «⋯») | P | FFC:75 `TARIFAS`, `accionesLinea` | la fila usa `ImpuestosLinea` de la variante compra; ver pregunta 2 |
| 22 | Buscar producto · F3 (`Agregar productos Venta`) | Buscar producto · F3 (`Agregar productos Compra`, chip «Proveedor: …» = «Solo del proveedor», costo del proveedor, stock) | C | FFC:669-676 (`ProductSearchDialog mode="purchase"`, `supplierId`) | instancia `Documento=Compra, Estado=Filtros aplicados`; «entrega N días» (`product_suppliers.lead_time_days`) como **Propuesta** |
| 23 | Agregar ítem manual (`Ítem manual Venta`) | Agregar ítem manual (`Ítem manual Compra`) | C | FFC:677-684 (hoy el botón dice «Concepto sin producto») | componente compartido; ver pregunta 3 |
| 24 | Seriales de la línea (chip y «⋯») | Seriales de la línea («⋯», uno por renglón) | C | `DialogoTextoLinea` | chip «Seriales 5/5» |
| 25 | Aviso de faltantes de stock | Aviso «Diferencia con la orden» | V / P | — | variante `aviso` de cada documento |
| 26 | Notas para el cliente + Términos y condiciones | **Notas internas** | V / P | FFC:779-795 | igual al código |
| 27 | Comisión del vendedor | — (el estado se conserva al editar, no se muestra) | V | FFC:108-114 | no se dibujó |
| 28 | — | **Retenciones**: retención configurada, base, tarifa, valor, quitar; total retenido | P | FFC:689-777: concepto de **texto libre**, «Retención en la fuente» 2,5 % por defecto | **Cambio**: se eligen de las retenciones de Finanzas › Impuestos › Retenciones (`organization_taxes.kind = withholding`); se guarda `tax_code` en `invoice_purchase_withholdings` (la columna ya existe); base editable, tarifa de la configuración |
| 29 | `DocumentTotals Variant=venta` (retenciones informativas) | `Variant=compra`: subtotal, descuentos, base por impuesto, retenciones que restan, total, **neto a pagar** | C | FFC:798-807 | igual |
| 30 | Impuestos de la organización | **Pago al proveedor**: «Pagarás a … a más tardar el …» | V / P | FFC:808-810 (`resumenPago`) | tarjeta con el mismo texto + «la cuenta por pagar se crea al confirmar, por el neto» |
| 31 | Atajos (M6) | Atajos (F2 proveedor, F3, Alt+M, Ctrl+S, Ctrl+Enter confirmar) | C | no existen en compra | **Propuesta** compartida (insignia «Mejora M6») |
| 32 | Salir con cambios (`ConfirmDialog`) | ídem | C | FFC:436-440: **`window.confirm` nativo** | mismo diálogo que venta |
| 33 | No editable: solo lectura con motivo y acciones | ídem: **confirmada** (Ver factura · Descargar PDF · Registrar pago; anular desde el detalle) y **anulada** (motivo; sin pagos) | C | FFC:442-453: `EmptyState` «ya no es un borrador» | **Propuesta** (anotada) |
| 34 | Errores en línea + resumen arriba (M4) | ídem: proveedor, número del proveedor, línea sin descripción | C | FFC:484-488 (`errorGeneral`) + error por campo | igual al patrón de venta |
| 35 | Emitiendo (pasos) | Guardando y confirmando (borrador, CxP por el neto, asiento, recepción) | C | «Guardando…» en el botón; `DialogoConfirmarCompra` con `cargando` | lista de pasos: **Propuesta** |
| 36 | — | **Confirmar factura**: consecuencias, «Recepcionar al confirmar» (sí por defecto), «Generar documento soporte» | P | FFC:847-876 · DC:40-88 | diálogo dibujado con el texto del código |

Nota: §1.3 de este documento dice que compras usa `<input type="date">`; el código ya pasó a `CampoFecha`
(FFC:565-607).

### 7.4 Frames de la sección

| Frame | Id |
|---|---|
| Escritorio · Modo=nueva — con datos (base) | `1066:105475` |
| Escritorio · Modo=nueva — vacía | `1068:106373` |
| Escritorio · Modo=nueva — desde orden de compra | `1068:107142` |
| Escritorio · Modo=editar — borrador | `1068:108236` |
| Escritorio · Modo=editar — cargando | `1068:108674` |
| Escritorio · Modo=no editable — confirmada | `1068:661685` |
| Escritorio · Modo=no editable — anulada | `1068:662704` |
| Escritorio · Modo=nueva — errores de validación | `1068:663599` |
| Escritorio · Modo=nueva — guardando y confirmando | `1068:664604` |
| Diálogo / Elegir proveedor (SupplierPicker, filtros) | `1069:111929` |
| Diálogo / Crear proveedor — formulario rápido | `1069:112338` |
| Compra / Proveedor creado vuelve elegido | `1069:112365` |
| Diálogo / Agregar productos (compra · Solo del proveedor) | `1069:112373` |
| Diálogo / Crear producto (compra) | `1069:112874` |
| Diálogo / Agregar ítem manual (compra) | `1069:112901` |
| Compra / Número del proveedor y consecutivo interno («#») | `1069:113059` |
| Panel / Retenciones desde la configuración (cambio) | `1069:113080` |
| Diálogo / Confirmar factura (recepción y documento soporte) | `1069:113139` |
| Diálogo / Salir con cambios sin guardar | `1069:113180` |
| Tableta 1024 · Modo=nueva — con datos | `1069:665725` |
| Móvil 390 · Modo=nueva — con datos | `1069:666353` |

Cada frame lleva encima una nota que dice qué es igual a venta, qué es propio de compra y qué es
**Propuesta** o **Cambio** frente al código de hoy.

Datos del ejemplo (ficticios): proveedor «Distribuidora del Norte», factura FE-88213, orden OC-2026-0311;
4 líneas (IVA 19 %, un descuento, 5 seriales, un flete manual), subtotal $ 5.918.000, IVA $ 1.119.404,
total $ 7.011.004, retenciones $ 204.203 (ReteFuente compras 2,5 % y ReteICA Bogotá 0,966 % sobre
$ 5.891.600), neto a pagar $ 6.806.801. Los modos «desde orden» y «errores» recalculan sus totales.

### 7.5 Chequeo por script (use_figma, 2026-09-28)

| Comprobación | Resultado |
|---|---|
| Solapes entre nodos de primer nivel de la sección | **0** |
| Sección contra el resto de la página · nodos fuera de la sección | **0 · 0** |
| Nota de «versión anterior» contra los frames de B.7 | **0** (B.7 ya tenía 2 solapes propios entre anotaciones, previos a este cambio) |
| Instancias rotas (1.858) | **0** |
| Textos desbordados o recortados por su marco (1.973 textos) | **0** |
| Rellenos sólidos sin variable en nodos propios (no instancias) · familias tipográficas | **0** · solo Inter |
| Nombres reales de organizaciones (contra la lista de la base; textos, capas, índice y nota de B.7) | **0** |

Hallazgos del chequeo que no se resolvieron dentro de esta sección (no se editaron componentes ajenos):

- El set `Diálogo · Agregar productos` (`1042:34652`) **tiene errores**: sus dos variantes «Hoja móvil»
  (`1032:34685`, `1032:34864`) quedaron sin nombres de propiedad (`=AgregarProductosDialog, =Venta, =Hoja
  móvil`) y la columna del nombre del producto queda en 25–28 px, con el SKU desbordado. Pasa igual en la
  hoja de venta (`1037:105409`). Por eso la hoja móvil de compra **no se incluyó** en la sección: hay que
  corregir primero la variante en `02 Componentes`.
- En «Diálogo / Salir con cambios sin guardar» de la venta (`1036:103966`) el pie no cabe en 480 px y
  «Seguir editando» se recorta; en la copia de compra el diálogo se ensanchó a 600 px.
- El `Índice` de la página ya era más alto que su sección y toca «Impuestos» (y = 896); la entrada 26 le
  sumó una línea.

### 7.6 Capturas

`docs/design/figma/76-factura-compra-v2-*.png` (20): `00-seccion`, `01-nueva-con-datos`, `02-nueva-vacia`,
`03-desde-orden-de-compra`, `04-editar-borrador`, `05-editar-cargando`, `06-no-editable-confirmada`,
`07-no-editable-anulada`, `08-errores`, `09-guardando-confirmando`, `10-tableta`, `11-movil`,
`12-elegir-proveedor`, `13-crear-proveedor`, `14-agregar-productos`, `15-item-manual`,
`16-numero-consecutivo`, `17-retenciones-configuracion`, `18-confirmar-factura`, `19-salir-con-cambios`.
No se versionan (el commit lleva solo este documento).

### 7.7 Preguntas para el dueño

| # | Pregunta | Recomendación |
|---|---|---|
| 1 | ¿Se aprueba que las retenciones de la compra se elijan de las configuradas (Finanzas › Impuestos › Retenciones) en lugar de escribirse a mano? | Sí: evita conceptos y tarifas mal escritos; la base sigue editable y se guarda `tax_code` (sin migración: la columna ya existe) |
| 2 | El IVA por línea de compra hoy es un menú con 0 · 5 · 19 %: ¿pasa a `ImpuestosLinea` con los impuestos de la organización, como en venta? | Sí, con la misma pieza; así el impoconsumo y otras tarifas también sirven en compras |
| 3 | El botón y el diálogo de compra dicen hoy «Concepto sin producto»; el componente compartido dice «Agregar ítem manual». ¿Cuál queda? | «Agregar ítem manual» en las dos, con la ayuda «servicios, fletes u otros gastos que no entran al inventario» |
| 4 | Factura confirmada o anulada: ¿se muestra en solo lectura con su motivo y acciones (como venta) en vez del `EmptyState` de hoy? | Sí: misma estructura, y el usuario ve qué puede hacer (pagar, PDF, anular desde el detalle) |
| 5 | ¿La fila informativa «Recepción y documento soporte: se eligen al confirmar» se queda en Datos del documento? | Sí, como texto de ayuda; las casillas siguen en «Confirmar factura» |
| 6 | ¿«Agregar productos» de compra muestra el plazo de entrega del proveedor (`lead_time_days`)? | Sí, en la línea secundaria, solo cuando el producto tiene ese dato para el proveedor elegido |
| 7 | ¿Atajos de teclado (M6) también en compra? | Sí, los mismos; Ctrl+Enter abre «Confirmar factura» |
| 8 | ¿Se corrige la variante «Hoja móvil» de `Diálogo · Agregar productos` antes de dibujar la hoja móvil de compra? | Sí; la corrige quien mantiene el componente y después se agrega el frame a esta sección |
