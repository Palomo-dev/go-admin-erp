# Catálogo de iconos por pantalla — norma única

Fecha: 2026-09-22 · Archivo Figma: «GO Admin — Sistema de diseño» (`EAvjINVRnlzFM70GVoWXgl`)
Patrón que lo invoca: `PATRONES-TRANSVERSALES.md` §14 «Iconos».

Este archivo responde a la pregunta del dueño: **«¿quién define esos iconos?»**.
Los define este documento. Ninguna pantalla elige su icono por su cuenta y
ninguna instancia se queda con el icono que traía el componente.

---

## 1. Reglas

1. **Fuente única: lucide.** Nada de mezclar familias. Trazo **1,5 px** sobre
   rejilla de 24, cabos y uniones redondeados, color heredado del trazo (variable
   `Color/Texto/Secundario`), nunca un hex suelto.
2. **Tamaños.** **20** en la cabecera de pantalla (dentro de una caja de 40×40 con
   el tinte de marca), **16** en menús, filas de tabla, botones y migas, **14** en
   badges y chips.
3. **Un icono por concepto, en todo el sistema.** Si «cliente» es `Users`, es
   `Users` en el menú, en la cabecera, en la actividad, en el estado vacío y en el
   selector. Nada de sinónimos visuales.
4. **La cabecera de una pantalla lleva el mismo icono que su entrada de menú.**
   Si el menú y la cabecera discrepan, manda esta tabla y el menú se corrige en
   código (ver §5).
5. **Sin icono, solo en dos sitios, y por regla escrita:**
   - `PageHeader Variant=form` — la ranura de la izquierda la ocupa **«← Volver»**.
     Un formulario no es una pantalla de módulo: es un paso dentro de una.
   - **Todas las cabeceras móviles** (`MobileHeader`, y las variantes
     `Layout=mobile` de `PageHeader` y `DocumentHeader`) — en 390 px la ranura
     izquierda es el botón de volver y la derecha la acción contextual. El icono
     de pantalla no cabe y no aporta: el título ya está solo.
6. **El marcador de imagen (`Icon/Image` dentro de `Miniatura`) queda prohibido
   como icono de pantalla.** La caja de 48×48 del `PageHeader Variant=detail`
   solo conserva una **foto real** donde la entidad tiene foto —hoy, únicamente el
   detalle de producto—. En el resto del sistema esa caja lleva **el icono de la
   entidad**, no un cuadro gris con una montañita.
7. **Tres nombres para la misma ranura.** El kit la llama `Icono` en
   `PageHeader Variant=list`, `Miniatura` en `Variant=detail` y `Caja de icono` en
   `DocumentHeader`. Se mantienen los nombres (son componentes publicados), pero
   el script de verificación comprueba las tres.

---

## 2. Conceptos y su icono — la tabla que manda

Un concepto, un icono. Si dos pantallas comparten concepto, comparten icono; si
dos pantallas son conceptos distintos, no pueden repetirlo.

| Concepto | Icono (lucide) | Dónde vive |
|---|---|---|
| Inicio · el escritorio de la persona | `Home` | menú, cabecera, tab bar |
| Analítica · leer números | `BarChart3` | analítica web, informes |
| Producto · catálogo | `Package` | menú, cabecera, detalle, picker |
| Existencias · niveles de stock | `Boxes` | stock por sucursal |
| Ajuste de existencias | `ClipboardCheck` | ajustes de inventario |
| Orden de compra | `ClipboardList` | listado y detalle |
| Punto de venta | `ShoppingCart` | menú, cabecera |
| Configuración | `Settings` | toda pantalla de ajustes |
| Aviso al cliente · mensajería | `MessageSquare` | avisos, chat |
| Venta · comprobante emitido | `Receipt` | historial de ventas, detalle |
| Caja · efectivo del turno | `Banknote` | cajas, arqueos, movimientos |
| Mesa · servicio en sala | `UtensilsCrossed` | plano, lista, detalle |
| Reserva de mesa | `CalendarClock` | agenda y lista de reservas |
| Comanda de cocina | `ChefHat` | tablero de comandas |
| Promoción | `BadgePercent` | listado y detalle |
| Cupón | `Ticket` | listado y detalle |
| Cargo de servicio | `Coins` | listado |
| Pedido online | `ShoppingBag` | listado, tablero y detalle |
| Cliente | `Users` | catálogo, detalle, picker, actividad |
| Impuesto | `Percent` | impuestos, selector de impuestos |
| Factura de venta | `FileText` | listado, detalle, formulario |
| Factura de compra | `ReceiptText` | listado, detalle, formulario |
| Cuenta por cobrar · cartera | `Wallet` | listado y detalle |
| Cuenta por pagar | `HandCoins` | listado y detalle |
| Miembro del equipo | `UserCheck` | miembros |
| Invitación | `UserPlus` | invitaciones |
| Sucursal | `MapPin` | sucursales, badge de sucursal |
| Plan y facturación | `CreditCard` | plan, suscripción |
| Módulo | `Grid3x3` | módulos, páginas del módulo |
| Organización | `Building2` | mis organizaciones, switcher |
| Dominio · web | `Globe` | dominios, tienda web |
| Información | `Info` | información de la organización |
| Proveedor | `Truck` | proveedores (sin pantalla en Figma aún) |
| Categoría | `Tags` | categorías (sin pantalla en Figma aún) |

---

## 3. Pantalla por pantalla

Columna «Ranura»: `Icono` (list) · `Miniatura` (detail) · `Caja de icono`
(DocumentHeader) · `—` (sin icono por la regla 5).

### 3.1 Página `03 Navegación y shell`

| Pantalla | Ruta | Ranura | Icono | Por qué |
|---|---|---|---|---|
| Inicio — dashboard (dueño · administrador), 5 estados | `/app/inicio` | `Icono` | `Home` | El saludo («Buenos días, Ana») es el **título**, no la identidad de la pantalla. La pantalla es «Inicio» y su entrada de nav ya usa `Home` (`Sidebar/NavItem.tsx:28`, `SubMenuPanel.tsx:94`, `SidebarNavigation.tsx:121`). Regla 4: cabecera = menú. Un `Package` ahí decía «inventario». |
| Inicio — panel de empleado | `/app/inicio` | `Icono` | `Home` | Misma pantalla, otro contenido: mismo icono. |
| Analítica web (Nuevo), 3 estados | `/app/inicio/analitica-web` | `Miniatura` | `BarChart3` | Vista propia de lectura de números. No es un documento con foto: llevaba el marcador de imagen porque se instanció `Variant=detail` sin sobrescribir. |
| Perfil de usuario (7 pantallas) | `/app/perfil` | `—` | — | Cabeceras móviles y bloques de formulario; el escritorio no usa `PageHeader`. Pendiente de la tanda de perfil. |

### 3.2 Página `04 Inventario`

| Pantalla | Ruta | Ranura | Icono | Por qué |
|---|---|---|---|---|
| Catálogo de productos (13 frames: listo, cargando, sin resultados, filtros, selección, cuadrícula, menús, sin sucursal) | `/app/inventario/productos` | `Icono` | `Package` | Ya correcto. `moduleConfig.ts` asigna `Package` a `inventory` y a «Productos». |
| Detalle de producto (42 frames: resumen, stock, precios, variantes, modificadores, seriales, imágenes, proveedores, notas, historial, con sus 4 estados) | `/app/inventario/productos/[id]` | `Miniatura` | `Package` | **Única excepción de la regla 6**: la caja es la foto del producto. Cuando no hay foto, el relleno es `Package`, el icono del concepto, no un marcador genérico. |
| Nuevo · Editar · Duplicar producto | `/app/inventario/productos/new`, `/editar` | `—` | — | Regla 5: `Variant=form`, la ranura es «← Volver». |
| Niveles de stock | `/app/inventario/stock` | `Icono` | `Boxes` | Ya correcto: varias cajas = existencias repartidas por sucursal. |
| Ajustes de inventario — lista | `/app/inventario/ajustes` | `Icono` | `ClipboardCheck` | Un ajuste es un **recuento comprobado**, no una existencia. Compartía `Boxes` con «Niveles de stock», que es otro concepto. |
| Ajuste — detalle | `/app/inventario/ajustes/[id]` | `Miniatura` | `ClipboardCheck` | Misma entidad que su listado. |
| Nuevo ajuste de inventario | `/app/inventario/ajustes/new` | `—` | — | Regla 5. |
| Importar productos (pasos 4 y 5) | `/app/inventario/productos/importar` | `—` | — | Regla 5: asistente. |
| Órdenes de compra — listado (6 frames) | `/app/inventario/ordenes-compra` | `Icono` | `ClipboardList` | Es un pedido al proveedor con su lista de renglones, no el catálogo. Llevaba `Package` heredado. |
| Orden de compra — detalle (4 frames) | `/app/inventario/ordenes-compra/[id]` | `Miniatura` | `ClipboardList` | Misma entidad. |
| Nueva · Editar orden de compra | `/app/inventario/ordenes-compra/new` | `—` | — | Regla 5. |

### 3.3 Página `05 POS y ventas`

| Pantalla | Ruta | Ranura | Icono | Por qué |
|---|---|---|---|---|
| Punto de venta (pantalla de venta) | `/app/pos` | `—` | — | El POS no lleva `PageHeader` ni migas (decisión previa vigente). Su cabecera propia es la barra de caja. |
| Configuración › POS (2 frames) | `/app/pos/configuracion` | `Icono` | `Settings` | `moduleConfig.ts` ya asigna `Settings` a «POS › Configuración». Llevaba `ShoppingCart`, que es el módulo, no la pantalla de ajustes. |
| Avisos al cliente (Nuevo) | `/app/pos/configuracion/avisos` | `Icono` | `MessageSquare` | Mensajes que se envían al comprador. |
| Historial de ventas (9 frames) | `/app/pos/ventas` | `Icono` | `Receipt` | Un comprobante emitido. `ShoppingCart` es la acción de vender; `Receipt` es la venta ya hecha. |
| Venta — detalle (7 frames) | `/app/pos/ventas/[id]` | `Miniatura` | `Receipt` | Misma entidad. Dos de esos frames (cargando y error) tienen la cabecera **oculta**: ver §7.2. |
| Cajas — listado (8 frames) | `/app/pos/cajas` | `Icono` | `Banknote` | El código le pone `Package` (`moduleConfig.ts`, POS › Cajas), que es inventario: una caja es efectivo. Pendiente en código (§5). |
| Caja — detalle (7 frames) | `/app/pos/cajas/[id]` | `Miniatura` | `Banknote` | Misma entidad. |
| Nuevo arqueo · Nuevo movimiento (6 frames) | `/app/pos/cajas/[id]/arqueo` | `—` | — | Regla 5. |
| Mesas — plano y lista (11 frames) | `/app/pos/mesas` | `Icono` | `UtensilsCrossed` | El código le pone `Grid3X3`, que ya es «Módulos» —dos conceptos con el mismo icono—. Una mesa es servicio en sala. Pendiente en código (§5). |
| Mesa — detalle (6 frames) | `/app/pos/mesas/[id]` | `Miniatura` | `UtensilsCrossed` | Misma entidad. |
| Reservas de mesas (6 frames) | `/app/pos/mesas/reservas` | `Icono` | `CalendarClock` | Una reserva es una hora apartada. |
| Comandas de cocina (6 frames) | `/app/pos/comandas` | `Icono` | `ChefHat` | Ya existe en el kit y es el icono que la cocina reconoce. |
| Promociones — listado (5 frames) | `/app/pos/promociones` | `Icono` | `BadgePercent` | Descuento con vigencia: el sello con el porcentaje. |
| Promoción — detalle | `/app/pos/promociones/[id]` | `Miniatura` | `BadgePercent` | Misma entidad. |
| Nueva promoción (asistente, 4 pasos) | `/app/pos/promociones/new` | `—` | — | Regla 5. |
| Cupones — listado (2 frames) | `/app/pos/cupones` | `Icono` | `Ticket` | Un código canjeable, distinto de la promoción que lo genera. |
| Cupón — detalle | `/app/pos/cupones/[id]` | `Miniatura` | `Ticket` | Misma entidad. |
| Cargos de servicio (2 frames) | `/app/pos/cargos-servicio` | `Icono` | `Coins` | Dinero que se añade a la cuenta. No es un impuesto (`Percent`) ni una promoción. |
| Pedidos online — listado (9 frames) | `/app/pos/pedidos-online` | `Icono` | `ShoppingBag` | La bolsa es el pedido del comprador; el carrito es la pantalla de vender. |
| Pedido online — detalle (3 frames) | `/app/pos/pedidos-online/[id]` | `Miniatura` | `ShoppingBag` | Misma entidad. |

### 3.4 Página `06 Clientes`

| Pantalla | Ruta | Ranura | Icono | Por qué |
|---|---|---|---|---|
| Catálogo de clientes (7 frames) | `/app/clientes` | `Icono` | `Users` | Ya correcto y coincide con `moduleConfig.ts` (`clientes: Users`). |
| Detalle de cliente (8 frames) | `/app/clientes/[id]` | `Miniatura` | `Users` | Un cliente no tiene foto: la caja llevaba el marcador de imagen. |
| Nuevo · Editar cliente | `/app/clientes/new`, `/editar` | `—` | — | Regla 5. |
| `CustomerPicker` y sus 5 contextos | — | — | `Users` en la fila y en el disparador | Componente compartido; el icono del concepto no cambia con el contexto. |

### 3.5 Página `07 Finanzas`

| Pantalla | Ruta | Ranura | Icono | Por qué |
|---|---|---|---|---|
| Impuestos — lista (4 frames) | `/app/finanzas/impuestos` | `Icono` | `Percent` | El código le pone `BarChart3`, que es «informes». Un impuesto es una tasa. Pendiente en código (§5). |
| Facturas de venta — listado (7 frames) | `/app/finanzas/facturas-venta` | `Icono` (nuevo) | `FileText` | La cabecera estaba **dibujada a mano**, sin ranura de icono. Se le añade la caja del kit. |
| Factura de venta — detalle y nueva (5 frames) | `/app/finanzas/facturas-venta/[id]` | `Caja de icono` | `FileText` | Ya correcto: es el defecto del `DocumentHeader`. |
| Facturas de compra — listado (6 frames) | `/app/finanzas/facturas-compra` | `Icono` (nuevo) | `ReceiptText` | Cabecera a mano. El recibo con renglones distingue la compra de la venta. |
| Factura de compra — detalle y nueva (7 frames) | `/app/finanzas/facturas-compra/[id]` | `Caja de icono` | `ReceiptText` | Heredaban `FileText` de la factura de venta: dos conceptos, un icono. |
| Cuentas por cobrar — listado (7 frames) | `/app/finanzas/cuentas-por-cobrar` | `Icono` (nuevo) | `Wallet` | Cabecera a mano. La cartera es lo que está por entrar. |
| Cuenta por cobrar — detalle (4 frames) | `/app/finanzas/cuentas-por-cobrar/[id]` | `Caja de icono` | `Wallet` | Heredaban `FileText`. |
| Cuentas por pagar — listado (6 frames) | `/app/finanzas/cuentas-por-pagar` | `Icono` (nuevo) | `HandCoins` | Cabecera a mano. Pagar es entregar dinero; cobrar es guardarlo. |
| Cuenta por pagar — detalle (4 frames) | `/app/finanzas/cuentas-por-pagar/[id]` | `Caja de icono` | `HandCoins` | Heredaban `FileText`. |
| Diálogos de cartera y de facturación (12 frames) | — | — | — | Un diálogo no es una pantalla: lleva título y, si acaso, el icono del `ConfirmDialog`. |

### 3.6 Página `08 Acceso y organización`

| Pantalla | Ruta | Ranura | Icono | Por qué |
|---|---|---|---|---|
| Entrar · Crear cuenta · Recuperar · Restablecer · Invitación · Verificación · Sesión expirada (16 frames) | `/auth/**` | — | — | Pantallas de acceso a página completa: no hay shell, no hay `PageHeader`. La marca (isotipo) hace de identidad. |
| Elegir organización (5 frames) · Crear organización (8 frames) | `/auth/select-organization` | — | — | Ídem: asistente a página completa. |
| Aviso «entras directo · confirma tu correo» | `/app/inicio?welcome=true` | `Icono` | `Home` | Es el Inicio con un aviso; su título ya dice «Inicio». |
| Organización › Información (4 frames) | `/app/organizacion/informacion` | `—` | — | Regla 5: es `Variant=form`. Su entrada de menú sí lleva `Info` (`moduleConfig.ts`). |
| Miembros (4 frames) | `/app/organizacion/miembros` | `Icono` | `UserCheck` | El código le pone `Users`, que ya es «Clientes»: ocho conceptos comparten `Users` hoy. Una persona del equipo está **validada** como miembro. Pendiente en código (§5). |
| Invitaciones | `/app/organizacion/invitaciones` | `Icono` | `UserPlus` | Ya correcto en el código; faltaba en la cabecera. |
| Sucursales (3 frames) | `/app/organizacion/sucursales` | `Icono` | `MapPin` | `moduleConfig.ts` ya usa `MapPin`. |
| Plan y facturación (2 frames) | `/app/plan` | `Miniatura` | `CreditCard` | `moduleConfig.ts` usa `CreditCard` para `subscriptions`. Llevaba el marcador de imagen. |
| Módulos (3 frames) | `/app/organizacion/modulos` | `Icono` | `Grid3x3` | `moduleConfig.ts` ya usa `Grid3X3`. |
| Mis organizaciones | `/app/organizacion/mis-organizaciones` | `Icono` | `Building2` | `moduleConfig.ts` ya usa `Building2`. |
| Dominios | `/app/organizacion/dominios` | `Icono` | `Globe` | Un dominio es la dirección pública. |
| Patrón · BulkActionBar antes/después (2 frames de documentación) | — | `Icono` | `UserCheck` | Reproducen la pantalla de Miembros: mismo icono que ella. |

### 3.7 Página `09 Documentos`

Sin cabeceras de pantalla: son plantillas de impresión. Los iconos que aparecen
dentro (`Doc/QR DIAN`, `Doc/Sello de firma`) son ilustraciones del documento, no
iconos de interfaz, y quedan fuera de este catálogo.

---

## 4. Iconos que faltaban en el kit

Añadidos a `02 Componentes › Fundamentos › Iconos` con la misma construcción que
los 148 existentes (rejilla 24, trazo 1,5, cabos redondeados, trazo enlazado a la
variable de texto secundario):

`ClipboardCheck` · `ClipboardList` · `UtensilsCrossed` · `CalendarClock` ·
`BadgePercent` · `Ticket` · `Coins` · `ShoppingBag` · `HandCoins` · `UserCheck`

La rejilla pasa de 148 a 158 iconos: `figma/29-iconos-rejilla-kit.png`.

### Antes y después

| | Antes | Después |
|---|---|---|
| Inicio — «Buenos días, Ana» | `figma/29-iconos-antes-inicio.png` (paquete) | `figma/29-iconos-despues-inicio.png` (`Home`) |
| Detalle de cliente | `figma/29-iconos-antes-cliente.png` (marcador de imagen) | `figma/29-iconos-despues-cliente.png` (`Users`) |

---

## 5. Cambios pendientes en código — NO aplicados en esta tanda

`src/config/moduleConfig.ts` asigna hoy iconos a 59 entradas de menú. Estos son
los que contradicen este catálogo. **No se han tocado**: van en su propia tarea,
porque cambiar el menú sin cambiar las cabeceras deja el sistema a medias.

| Entrada de menú | Icono hoy | Debe ser | Motivo |
|---|---|---|---|
| POS › Cajas | `Package` | `Banknote` | `Package` es inventario; una caja es efectivo. |
| POS › Mesas | `Grid3X3` | `UtensilsCrossed` | `Grid3X3` ya es «Módulos». |
| POS › Cuentas por Cobrar | `BarChart3` | `Wallet` | `BarChart3` es «informes». |
| POS › Devoluciones | `BarChart3` | `Undo` | Ídem. |
| POS › Pagos Pendientes | `BarChart3` | `Clock` | Ídem. |
| POS › Carritos | `ShoppingCart` | `ShoppingBag` | Repite el icono del módulo POS. |
| Inventario › Categorías | `Grid3X3` | `Tags` | `Grid3X3` ya es «Módulos». |
| Inventario › Proveedores | `Users` | `Truck` | `Users` ya es «Clientes». |
| Finanzas › Impuestos | `BarChart3` | `Percent` | `BarChart3` es «informes». |
| Finanzas › Facturas de Venta | `BarChart3` | `FileText` | Ídem. |
| Finanzas › Monedas | `BarChart3` | `Coins` | Ídem. |
| Finanzas › Finanzas (raíz) | `BarChart3` | `Landmark` | El módulo ya es `Landmark` en `moduleIcons`; el submenú lo contradice. |
| Finanzas › Activos Fijos | `Package` | `Building2`… ver nota | `Package` es inventario. |
| Finanzas › Centro de Costos | `Grid3X3` | `GitBranch` | `Grid3X3` ya es «Módulos». |
| Organización › Miembros | `Users` | `UserCheck` | `Users` ya es «Clientes». |
| Sucursales › Empleados | `Users` | `Briefcase` | Ídem. |
| Clientes › Contactos | `Users` | `Contact` | Ídem. |
| Clientes › Grupos | `Users` | `Layers` | Ídem. |
| Clientes › Historial | `Calendar` | `History` | `Calendar` es «agenda». |
| HRM | `Users` | `Briefcase` | Ídem. |
| Roles › Configuración y Sucursales › Configuración | `Settings` (x2) | `Settings` | Correcto: es el mismo concepto. |

Ocho conceptos distintos comparten hoy `Users` (clientes, miembros, proveedores,
empleados, contactos, grupos, HRM y equipo del CRM) y seis comparten `BarChart3`.
Esa es la raíz de la queja, y se arregla aquí y, después, en el menú.

---

## 6. Conteo antes y después

Universo: **238 cabeceras de escritorio** de las páginas `03`–`08` (194
`PageHeader` con ranura o que deberían tenerla, 17 `DocumentHeader` de escritorio
y 27 cabeceras dibujadas a mano). Quedan fuera, por la regla 5, las 27 cabeceras
`Variant=form`, las 4 `DocumentHeader` móviles y todas las `MobileHeader`.

| Página | Cabeceras | Correctas antes | Icono equivocado | Marcador de imagen | Sin ranura | Correctas después |
|---|---:|---:|---:|---:|---:|---:|
| `03 Navegación y shell` | 9 | 0 | 6 | 3 | 0 | **9** |
| `04 Inventario` | 67 | 14 | 8 | 45 | 0 | **67** |
| `05 POS y ventas` | 82 | 0 | 56 | 17 | 9 | **82** |
| `06 Clientes` | 15 | 7 | 0 | 8 | 0 | **15** |
| `07 Finanzas` | 47 | 4 | 17 | 0 | 26 | **47** |
| `08 Acceso y organización` | 18 | 0 | 16 | 2 | 0 | **18** |
| **Total** | **238** | **25** | **103** | **75** | **35** | **238** |

Comprobado por script sobre las seis páginas, después de aplicar:

- **0** cabeceras con marcador de imagen (`Icon/Image` en la ranura).
- **0** cabeceras de escritorio sin icono fuera de las excepciones escritas.
- **0** conceptos con dos iconos distintos y **0** iconos compartidos por dos
  conceptos distintos: 33 conceptos, 33 iconos.
- **0** solapes entre Secciones y **0** entre frames de pantalla.
- **0** desbordes de contenido fuera de su frame.
- **0** instancias rotas sobre 54.267 instancias revisadas.

Fuera de cuenta: **2** `PageHeader` de «Ventas — detalle» (cargando y error) que
están **ocultos**. Una instancia oculta no expone hijos sobrescribibles, así que
su icono no se puede fijar hasta que se muestre —y mostrarla es lo que pide el
patrón 4—. Ver §7.2.

---

## 7. Hallazgos colaterales — no son de iconos

Se anotan porque salieron del recorrido y otra tanda los tendrá que cerrar:

1. **Ocho cabeceras de «Cajas — listado» tienen la ranura de icono borrada**
   dentro de la instancia. Se repararon reponiendo la instancia y volviendo a
   aplicar sus textos y acciones.
2. **«Ventas — detalle» en los estados cargando y error oculta el `PageHeader`
   entero** y dibuja un `Skeleton` en su lugar. Contradice el patrón 4 («el
   `PageHeader` se mantiene en el estado cargando»). Además, una instancia oculta
   **no expone hijos sobrescribibles**: mientras siga oculta, su icono no se puede
   fijar, y al mostrarla aparecerá con el marcador de imagen por defecto. Hay que
   mostrarla —que es lo que pide el patrón 4— y entonces aplicarle `Receipt`.
3. **Veintiséis cabeceras de `07 Finanzas` están dibujadas a mano** (migas +
   título + botones sueltos) en lugar de instanciar `PageHeader`. Aquí solo se les
   añadió la caja del icono; sustituirlas por el componente es otra tarea.
4. **Cuatro pantallas de error de `07 Finanzas` no tienen cabecera ninguna**
   —«Detalle factura de venta / de compra — no encontrada» y «Editar factura de
   venta / de compra — no editable»—: migas y, debajo, un `EmptyState`. El patrón
   4 pide que la cabecera se mantenga también en error.
5. **La misma ranura tiene tres nombres** (`Icono`, `Miniatura`, `Caja de icono`).
   Unificarlos obliga a tocar tres componentes publicados: se deja anotado.
