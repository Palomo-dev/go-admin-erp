# Paridad — Organización (compras, cupos, miembros y sucursales) e Importar desde la web

Archivo Figma «GO Admin — Sistema de diseño» (`EAvjINVRnlzFM70GVoWXgl`). Tanda del 2026-09-22,
posterior a la revisión del dueño: «se escapan piezas — al pulsar comprar usuarios / comprar
sucursales y nueva sucursal en Organización no hay diálogo dibujado, y en Inventario tampoco está
el importador desde la web».

Fuentes de verdad: `docs/design/AUDITORIA-CONTROLES-ACCESO-ORGANIZACION.md` (secciones C.3, C.4,
C.5, C.6, E.5, E.6 y F.9) y la lectura directa del código de los 19 componentes implicados.

## Secciones creadas (y solo estas se han tocado)

| Página | Sección nueva | Frames | Instancias del kit | Badges «Nuevo» |
|---|---|---:|---:|---:|
| `08 Acceso y organización` | **13. Organización — compras y cupos** | 47 | 1.023 | 38 |
| `08 Acceso y organización` | **14. Organización — miembros y sucursales** | 34 | 1.570 | 12 |
| `04 Inventario` | **11. Importar desde la web** | 16 | 750 | 34 |
| | **Total** | **97** | **3.343** | **84** |

**Chequeo por script sobre las tres Secciones: 0 solapes de frame, 0 solapes de Sección,
0 desbordes de contenido, 0 instancias rotas y 0 textos truncados.**

No se ha movido, renombrado ni reordenado ninguna Sección ajena. Las tres Secciones nuevas se
colocaron debajo de la última existente de su página (`08` a partir de `y = 22.438`; `04` a partir
de `y = 52.018`).

Estados: **calcado** (existe en código y se dibujó igual) · **Nuevo** (no existe en código; lleva
badge «Nuevo» en Figma) · **sustituido por …** (lo roto se reemplaza por el componente correcto del
kit) · **omitido: motivo**. Cero «omitido» sin motivo.

Convenciones: escritorio 1440 de ancho, móvil 390; cada pieza con sus cuatro estados (listo,
cargando, error, éxito o bloqueo) y sus diálogos abiertos en frames propios; 160 px entre frames y
400 px entre Secciones; paginación única del kit; badges según `docs/design/SISTEMA-BADGES.md`.
Nombres ficticios: «Mi empresa S.A.S.», «Sucursal Principal», «Sucursal Norte», «Bodega Central»,
«Distribuidora del Norte», «Ana Gómez», «Carlos Ruiz», «Diana Peña», «Felipe Soto».

**Moneda.** Todos los importes van en la moneda seleccionada de la organización (aquí, pesos
colombianos) y **sin decimales**, según F.9.

---

## 0. Decisiones (delegadas por el dueño, 2026-09-22)

Las cinco dudas que abrió esta tanda quedan cerradas así, y así están dibujadas.

### D1. Precio de los complementos: aprobado y con tabla propia por moneda

Los complementos **dejan de estar cableados en el cliente** (hoy: `1000`, `800` y `4` centavos de
dólar literales en `BuyUsersModal`, `BuyBranchesModal` y `BuyAiCreditsModal`). Van a una tabla
**`addon_prices`**, hermana de `plan_prices`:

| Columna | Notas |
|---|---|
| `addon_code` | `extra_users` · `extra_branches` · `ai_credits` |
| `currency_code` | → `currencies(code)` |
| `price_month` · `price_year` | precio fijo, cargado a mano, sin decimales |
| | **única por `(addon_code, currency_code)`** |

El precio se **consulta al servidor** y el cliente solo lo muestra. El anual son **10 meses**,
igual que los planes.

| Complemento (mes) | COP | USD | EUR | MXN | CLP | BRL | GBP | CAD | AUD | JPY |
|---|---|---|---|---|---|---|---|---|---|---|
| Usuario adicional | 30.000 | 9 | 8 | 160 | 9.000 | 45 | 7 | 13 | 13 | 1.500 |
| Sucursal adicional | 25.000 | 8 | 7 | 130 | 7.500 | 39 | 6 | 11 | 11 | 1.200 |
| Paquete de 500 créditos de IA | 60.000 | 19 | 16 | 330 | 18.000 | 95 | 14 | 26 | 27 | 3.000 |

Anual (10 meses): usuario COP 300.000 · USD 90 · EUR 80 · MXN 1.600 · CLP 90.000 · BRL 450 ·
GBP 70 · CAD 130 · AUD 130 · JPY 15.000. Sucursal COP 250.000 · USD 80 · EUR 70 · MXN 1.300 ·
CLP 75.000 · BRL 390 · GBP 60 · CAD 110 · AUD 110 · JPY 12.000. Los créditos de IA son compra
puntual: **no tienen precio anual**.

GBP, CAD, AUD y JPY se completaron con el mismo criterio que la tabla de planes: conversión a la
tasa del 2026-09-22 y redondeo a cifra redonda (unidad en USD, EUR, GBP, CAD y AUD; decena en MXN;
cinco en BRL; millar en CLP; centena en JPY).

**Cada moneda necesita además su precio creado en la pasarela de pago.** Sin eso, `addon_prices`
solo sirve para pintar.

El crédito de IA queda en **120 pesos** con **paquete mínimo de 500 créditos (60.000)**: eso
sustituye el `min={100}` y el texto `Mínimo: 100 créditos` del código.

→ Frame **«Referencia · addon_prices (precios de complementos por moneda)»** en la Sección 13.

### D2. Prorrateo e impuestos: se construyen

«Cobrar sin mostrar el total es lo que genera disputas y contracargos.» Reglas:

1. El complemento se cobra **prorrateado hasta la fecha de renovación** y desde ahí entra completo.
2. El desglose muestra, en este orden: **días restantes del ciclo**, **importe prorrateado**,
   **cupón** si lo hay, **impuesto** y **total a pagar hoy**.
3. Cierra con la línea **«Desde el {fecha} pagarás {importe}/mes»**.
4. **El impuesto no se cablea al 19 %**: sale de la configuración fiscal de la organización, con la
   etiqueta `{nombre} {tasa}`. Si no aplica (cliente fuera de Colombia), **la línea no se muestra**.
5. El botón dice **«Pagar {importe}»**, nunca «Confirmar» ni «Suscribir» a secas.

→ Aplicado en los cuatro diálogos de cobro. El frame **«Diálogo · Comprar usuarios — sin impuesto
(fuera de Colombia)»** dibuja el caso 4: sin línea de impuesto y con el botón en «Pagar $ 90.000».

### D3. Plan «A medida»: se conecta desde Mi Plan

«Un diálogo ya construido que nadie abre es trabajo tirado.» `EnterpriseConfigModal` pasa de código
muerto a tener dos entradas:

- **Mi Plan** → tarjeta «¿Tu operación se queda corta con Ultimate?» con el botón
  **«Configurar plan a medida»**.
- **Cambiar plan** → la fila «A medida» pasa de `Seleccionar` a **«Configurar a medida»**.

El diálogo recoge sucursales, usuarios, módulos **y un campo nuevo «Necesidades»**, y al enviar
**crea una solicitud** (no cobra): el botón es **«Enviar solicitud»** y el estado final es
**«Solicitud enviada · Te contactamos en menos de un día hábil»**. La parte de crear la solicitud
va marcada «Nuevo»: no existe ni en el cliente ni en el servidor.

### D4. Importador web: la creación automática se mantiene, pero con control

En el paso de destino, antes de importar:

- Aviso de lo que se va a crear: **«Se creará el proveedor «Aero» y 3 categorías nuevas»**.
- Casilla **marcada por defecto**: **«Crear proveedor y categorías que no existan»**.
- Si se desmarca, los productos entran **sin proveedor** y todos a la categoría que se elija en el
  propio paso (**«Categoría para los que no existan»**, deshabilitada mientras la casilla esté
  marcada).
- Al final, el resumen **«Qué se creó»**.

(El ejemplo del encargo decía «Nova»; aquí es «Aero» porque es la marca que usan las tarjetas de la
vista previa y los datos tienen que cuadrar entre frames del mismo flujo.)

### D5. El conteo del importador cuadra siempre

El resultado distingue **Importados · Omitidos (ya existían) · Fallidos · No intentados**, con los
**omitidos en gris** (`text/muted`) y no en rojo, y **siempre suma el total seleccionado**. Bajo los
contadores va la línea que lo demuestra:

- resultado limpio: «42 seleccionados · 39 importados + 3 omitidos + 0 fallidos + 0 sin intentar»;
- error parcial: «42 seleccionados · 36 importados + 3 omitidos + 2 fallidos + 1 sin intentar».

Es exactamente el fallo encontrado en el código (`Ya existe (omitido)` vuelve como `ok:false` y se
pinta como fallo; y los lotes que nunca se ejecutan desaparecen del recuento). **El diseño no lo
hereda.**

---

## 1. `08` › Sección 13 — Organización — compras y cupos

### 1.1 Comprar usuarios adicionales — `BuyUsersModal.tsx`

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| C.6 #96 | Diálogo `Comprar Usuarios Extra` (icono + título) | Escritorio / Plan — Comprar usuarios (listo) | calcado |
| C.6 #97 | `Agrega usuarios adicionales a tu plan. Se cobran mensualmente.` | ídem | calcado |
| C.6 #98 | `Límite actual: {n} usuarios · Usados: {n}` (+ `· Addons activos: {n}`) | ídem | calcado |
| C.6 #99 | Encabezado `Paquetes` | ídem | calcado |
| C.6 #100-#103 | Cuatro tarjetas: `5 / 10 / 25 / 50 usuarios extra` con su precio | ídem | calcado; el precio sale de `addon_prices` (D1), no del `1000` cableado |
| C.6 #104 | Badge `Popular` sobre el paquete de 10 | ídem | calcado (pasa a `Badge Tono=marca Variant=sólido` del kit) |
| C.6 #105 | Check de la tarjeta seleccionada | ídem | calcado |
| C.6 #106 | Encabezado `Cantidad personalizada` | ídem | calcado |
| C.6 #107 | Campo numérico, `min 1`, placeholder `Ej.: 7` | ídem | sustituido por `NumberInput` del kit (hoy es un `<input type=number>` sin `<label>`, admite negativos y el botón sigue activo) |
| C.6 #108 | `= $X/mes` en vivo | ídem | calcado |
| C.6 #109 | `Mínimo: 1 usuario` | ídem | calcado |
| C.6 #110 | Resumen `Usuarios a agregar:` / `Costo mensual:` | ídem (bloque «Resumen de la compra») | calcado y ampliado |
| — | `Precio unitario`, `Subtotal mensual`, `Días restantes del ciclo`, `Prorrateo de 9 días`, `IVA 19 %`, `Total a pagar hoy` y `Desde el 1 de octubre pagarás $ 357.000/mes` | ídem | **Nuevo** (D2): el modal no calcula prorrateo, impuestos ni total; solo multiplica cantidad × precio |
| — | Sin línea de impuesto cuando la organización no lo tiene configurado | Diálogo · Comprar usuarios — sin impuesto (fuera de Colombia) | **Nuevo** (D2 regla 4) |
| C.6 #111 | Botón `Cancelar` | ídem | calcado, pero se bloquea durante el cobro (hoy sigue activo) |
| C.6 #112 | Botón `Suscribir` / `Procesando...` | ídem + Diálogo · Comprar usuarios — procesando | **sustituido por `Pagar $ 107.100`** (D2 regla 5); el estado de carga conserva `Procesando…` |
| C.6 #112 | Errores `Error al procesar la compra` / `No se recibió URL de pago` | Diálogo · Comprar usuarios — error de pago | sustituido por alerta del kit con «Reintentar» (hoy es un `<p>` rojo sin `role="alert"`) |
| — | Estado de éxito con el cobro aprobado y el cupo nuevo | Diálogo · Comprar usuarios — éxito | **Nuevo**: hoy redirige a la pasarela y nunca vuelve a decir nada |
| — | El plan no admite complementos | Diálogo · Comprar usuarios — el plan no lo permite | **Nuevo**: el modal no consulta el plan y deja comprar siempre |
| — | Versión móvil | Móvil / Plan — Comprar usuarios (hoja) | **Nuevo**: no hay variante táctil |

### 1.2 Comprar sucursales adicionales — `BuyBranchesModal.tsx`

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| C.6 #113-#129 | Todo el diálogo `Comprar Sucursales Extra`, paquetes `1 / 3 / 5 / 10 sucursales extra`, `Mínimo: 1 sucursal`, resumen y pie | Escritorio / Plan — Comprar sucursales (listo) | calcado (es un clon exacto del anterior; mismas correcciones) |
| C.6 #129 | `Procesando...` | Diálogo · Comprar sucursales — procesando | calcado |
| C.6 #129 | Error de cobro | Diálogo · Comprar sucursales — error de pago | sustituido por alerta del kit |
| — | Éxito, con enlace a «Crear sucursal» | Diálogo · Comprar sucursales — éxito | **Nuevo** |
| — | Bloqueo por plan | Diálogo · Comprar sucursales — el plan no lo permite | **Nuevo** |
| — | Móvil | Móvil / Plan — Comprar sucursales (hoja) | **Nuevo** |

### 1.3 Comprar créditos de IA — `BuyAiCreditsModal.tsx`

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| C.6 #130 | Diálogo `Comprar Créditos de IA` | Escritorio / Plan — Comprar créditos de IA (listo) | calcado |
| C.6 #131 | `Los créditos comprados no expiran y se suman a tu saldo actual…` | ídem | calcado |
| C.6 #132-#135 | Paquetes `5.000 / 15.000 / 50.000 / 100.000 créditos` | ídem | calcado |
| C.6 #136-#138 | Bonos `+10% bonus = 16.500 total`, `+15%`, `+20%` | ídem | calcado, escrito como `+10 % de bonificación = 16.500 en total` |
| C.6 #139-#142 | Cantidad personalizada, `min 100`, `step 1000`, `Mínimo: 100 créditos` | ídem | **sustituido por `Mínimo: 500 créditos ($ 60.000)`** (D1): el paquete mínimo pasa de 100 a 500 |
| — | La bonificación se aplica también a la cantidad personalizada | ídem (nota junto al campo) | **Nuevo**: hoy el bono solo existe en los paquetes, lo que es incoherente para el usuario |
| — | `Saldo actual`, `Incluidos en el plan`, fecha de renovación | ídem | **Nuevo**: el modal no recibe el saldo |
| C.6 #143-#145 | Resumen `Créditos a comprar:` / `Total a pagar:` | ídem | calcado y ampliado con `IVA 19 %` y `Total a pagar` (**Nuevo**) |
| C.6 #146 | `Cancelar` · `Comprar ahora` / `Procesando...` | ídem + Diálogo · Créditos de IA — procesando | calcado |
| C.6 #146 | Error de cobro | Diálogo · Créditos de IA — error de pago | sustituido por alerta del kit |
| — | Éxito con saldo anterior → saldo nuevo | Diálogo · Créditos de IA — éxito | **Nuevo** |
| — | El plan no incluye IA | Diálogo · Créditos de IA — el plan no lo permite | **Nuevo** |
| — | Móvil | Móvil / Plan — Comprar créditos de IA (hoja) | **Nuevo** |

### 1.4 Cambio de plan — `ChangePlanModal.tsx` + `SubscriptionPlanSelector.tsx`

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| C.6 #85 | `Cambiar Plan de Suscripción` | Escritorio / Plan — Cambiar plan (listo) | calcado |
| C.6 #86 | `Estás cambiando el plan de suscripción para {organizationName}.` | ídem | calcado |
| C.6 #87 | Segmento `Mensual` / `Anual` | ídem | calcado |
| C.6 #87 | Sufijo `-20%` del segmento | ídem | **sustituido por** `Anual: pagas 10 meses y usas 12 — ahorras 2 meses`. Hoy conviven tres definiciones del descuento anual (`-20%` en la pestaña, `×10` en Enterprise y `price_usd_year` en la tabla) y la etiqueta miente: 199 / (20 × 12) es −17 % |
| C.6 #88-#92 | Tarjetas de plan a **una columna** (`grid-cols-1`), nombre, descripción, precio, características y botón `Seleccionar` / `✓ Seleccionado` | ídem | calcado en estructura; los textos y precios salen de `PlanOption` (Sección 12 de `08`) para no inventar cifras |
| C.6 #89 | Badge `Popular` / `Plan Actual` | ídem | calcado |
| C.6 #93 | `CouponInput` embebido | ídem | calcado |
| C.6 #94 | `Cancelar` | ídem | calcado |
| C.6 #95 | `Cambiar Plan` / `Procesando...` | ídem + Diálogo · Cambiar plan — procesando | calcado |
| C.6 #95 | `Ya tienes este plan seleccionado.` | — | **omitido: es un síntoma de un fallo, no un estado**. El botón se deshabilita comparando el id completo y la validación compara el código base, así que mensual → anual del mismo plan está activo y al enviar salta ese error. El diseño deshabilita por plan **y** periodo, así que el mensaje deja de poder aparecer. Consta en el informe |
| — | `Resumen del cambio`: plan actual, plan nuevo, crédito por los días sin usar, prorrateo del nuevo plan, descuento del cupón, `IVA 19 %` y `Total a pagar hoy` | ídem | **Nuevo**: hoy el usuario aplica el cupón a ciegas y nunca ve un total |
| C.6 #147-#149 | `¿Tienes un código de descuento?`, placeholder `Ingresa tu código`, `Aplicar` | CouponInput · los cuatro estados | calcado |
| C.6 #150 | Spinner del botón durante la validación | ídem (`Validando…`) | sustituido: hoy el spinner vacía el botón y no dice nada |
| C.6 #151-#152 | Chip `{code} — {name}` + descripción de duración + botón de quitar | ídem | calcado; el botón de quitar recibe nombre accesible |
| C.6 #153 | `Cupón no válido` | ídem + Diálogo · Cambiar plan — cupón no válido | sustituido por alerta del kit; el total se recalcula sin el descuento |
| — | Móvil | Móvil / Plan — Cambiar plan (hoja) | **Nuevo** |

### 1.5 Configuración a medida — `EnterpriseConfigModal.tsx` + `EnterpriseConfigSelector.tsx`

La auditoría deja sus 8 controles fuera del conteo de C.6 porque «el componente no tiene
consumidores». Por D3 **se conecta**: entra desde Mi Plan (tarjeta «¿Tu operación se queda corta
con Ultimate?» → `Configurar plan a medida`) y desde la fila «A medida» del diálogo de cambio de
plan (`Configurar a medida`). Y deja de ser una configuración que se guarda: **crea una solicitud**.

| Control (código) | Frame Figma | Estado |
|---|---|---|
| `Configuración Enterprise` + icono calculadora + ✕ | Escritorio / Plan — Configuración a medida (listo) | calcado |
| Panel azul con contadores `Módulos` · `Sucursales` · `Usuarios` y `Precio estimado:` | ídem | calcado |
| Desglose `Base $199 + N módulos ($49c/u) + N sucursales ($59c/u) + N usuarios ($19c/u)` | ídem | calcado, en pesos (ver duda 1) |
| `IVA 19 %`, total con impuestos y equivalente anual | ídem | **Nuevo** |
| `Sucursales` (`min 1`, `max 50`, ayuda `$59 por sucursal/mes`) | ídem | calcado |
| `Usuarios` (`min 1`, `max 200`, ayuda `$19 por usuario/mes`) | ídem | calcado |
| `Créditos IA` (`min 0`, `step 1000`, ayuda `$0.03 por crédito`) | ídem | calcado |
| `Módulos Core (Incluidos)` con los 6 chips no interactivos | ídem | calcado (chips `Variant=readonly` del kit) |
| `Módulos Adicionales (Máx. 15)` + `({n}/15 seleccionados)` | ídem | sustituido: los pseudo-checkbox (`<button>` con un cuadrito dibujado, sin `role`) pasan al `Checkbox` del kit |
| — | Campo `Necesidades` (texto libre) con la ayuda `Esto llega con la solicitud; no es un cobro.` | ídem | **Nuevo** (D3) |
| — | Entradas desde Mi Plan y desde la fila «A medida» del cambio de plan | Escritorio / Plan — Método de pago (listo) · Escritorio / Plan — Cambiar plan (listo) | **Nuevo** (D3): hoy el componente no tiene ningún consumidor |
| Nota amarilla `Nota: El precio final se calculará y confirmará…` | ídem | sustituida: `Nota: Esto no es un cobro. Al enviar la solicitud un asesor confirma el precio final…` |
| `Cancelar` · `Guardar Configuración` / `Guardando...` | ídem + Diálogo · Configuración a medida — guardando | **sustituido por `Enviar solicitud`** (D3); `Cancelar` se bloquea al enviar |
| `Error al guardar configuración` | Diálogo · Configuración a medida — error | sustituido por alerta del kit con «Reintentar» |
| Cierre silencioso tras guardar | Diálogo · Configuración a medida — guardada → **«Solicitud enviada»** + `Te contactamos en menos de un día hábil` | **Nuevo** (D3): hoy el modal desaparece sin toast ni confirmación, y la solicitud no existe |
| Tope de 15 módulos | Diálogo · Configuración a medida — tope de módulos | **Nuevo**: hoy solo se atenúan sin explicar por qué |
| Móvil | Móvil / Plan — Configuración a medida (hoja) | **Nuevo** |

### 1.6 Método de pago — `PaymentMethodCard.tsx`

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| C.6 #154 | Tarjeta `Método de Pago` + `Gestiona tu método de pago para suscripciones` | Escritorio / Plan — Método de pago (listo) | calcado |
| C.6 #155 | Botón `Gestionar Facturación` / `Abriendo...` | ídem | calcado |
| C.6 #156 | Mini-tarjeta con las 4 primeras letras de la marca | ídem | calcado (se conserva el recorte «MAST», que es lo que hace el código; ver informe) |
| C.6 #157 | `💳 Visa •••• {last4}` | ídem → `Visa •••• 4242` | **sustituido**: el emoji 💳 se retira, según `SISTEMA-BADGES.md` §1.7 («nunca un emoji») |
| C.6 #158 | `Expira {MM}/{AAAA}` | ídem | calcado |
| C.6 #159 | Badge `Predeterminada` | ídem | calcado |
| C.6 #160 | Papelera + `title` `Eliminar` / `No puedes eliminar el único método de pago` | Tarjeta · Método de Pago — una sola tarjeta | **sustituido**: el motivo deja de vivir en un `title` de un botón deshabilitado (hover-only, invisible en táctil) y se escribe bajo la tarjeta |
| — | `Marcar como predeterminada` | Escritorio / Plan — Método de pago (listo) | **Nuevo**: el modelo trae `isDefault` y la API acepta `action`, pero no hay control |
| C.6 #161 | `Sin métodos de pago` + `Agregar Método de Pago` | Tarjeta · Método de Pago — sin métodos de pago | sustituido por `EmptyState` del kit |
| C.6 #161 | `Sin método de pago` / `El método de pago se configurará al seleccionar un plan de pago.` | Tarjeta · Método de Pago — sin cliente de facturación | sustituido: deja de ser un callejón sin salida, con botón `Ver planes` (**Nuevo**) |
| C.6 #162 | `PaymentMethodSkeleton` | Tarjeta · Método de Pago — cargando | sustituido por `Skeleton` del kit |
| C.6 #163 | `Error al cargar métodos de pago` | Tarjeta · Método de Pago — error al cargar | sustituido por alerta con «Reintentar» |
| C.6 #166 | `confirm()` nativo `¿Estás seguro de eliminar este método de pago?` | ConfirmDialog · Eliminar método de pago | **sustituido por `ConfirmDialog` del kit** (E.5) |
| — | Móvil | Móvil / Plan — Método de pago | **Nuevo** |

### 1.7 Cupos por miembro — `quotas/MemberQuotasSheet · QuotaEditor · QuotaHistory`

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| C.6 #167 | `Sheet` lateral `sm:max-w-xl` | Escritorio / Miembros — Cupos del miembro (hoja abierta) | calcado (576 px a la derecha, a pantalla completa) |
| C.6 #168 | `Cuotas de {member.name}` | ídem | calcado |
| C.6 #169 | `Metas por periodo y cumplimiento real calculado con sus ventas, actividades y llamadas.` | ídem | calcado |
| C.6 #170 | `No se pudieron cargar las cuotas` + `Reintentar` | Sheet · Cuotas del miembro — error | calcado; `Reintentar` pasa de enlace subrayado a botón del kit |
| C.6 #175 | `Nueva cuota` | ídem | calcado |
| C.6 #176 | `Periodo` (`Mensual` / `Trimestral` / `Anual`) | ídem | calcado |
| C.6 #177 | `Tipo de meta` (`Ingresos` / `Negocios ganados` / `Actividades` / `Llamadas`) | ídem | calcado |
| C.6 #178 | `Un día del periodo` + ayuda `{periodo} · {inicio} → {fin}` | ídem | calcado |
| C.6 #179 | `Meta ({currency})` / `Meta (cantidad)` | ídem | calcado |
| C.6 #180 | Errores por campo con `role="alert"` | ídem (`FormField State=error` en el kit) | calcado |
| C.6 #181 | `Guardar cuota` / `Guardando…` | ídem | calcado |
| C.6 #185 | `Cargando cuotas` (2 skeletons) | Sheet · Cuotas del miembro — cargando | calcado con `Skeleton` del kit |
| C.6 #186 | Vacío `Este miembro aún no tiene cuotas…` | Sheet · Cuotas del miembro — vacío | calcado con `EmptyState` del kit |
| C.6 #187-#190 | Etiqueta de periodo (`Septiembre 2026`, `2.º trimestre 2026`, `Año 2026`) y badges `En ritmo` / `Cuota cumplida` / `Por debajo del ritmo` / `Periodo cerrado sin cumplir` | ídem | calcado |
| C.6 #191 | `QuotaProgressBar` con `role="progressbar"` | ídem | calcado con `Progress` del kit (`Threshold=normal/warning/limit`) |
| C.6 #192 | `{logrado} de {meta} · {raw_pct} %`, `Superada en {valor}`, `Faltan {valor} · {n} días · ritmo {valor}/día` | ídem | calcado, pero **sin decimales** — sustituido: hoy `formatQuotaValue` fuerza dos decimales en es-CO («$ 5.000.000,00») mientras `formatMonedaSinDecimales` existe para eso |
| C.6 #193-#195 | `ConfirmDialog` `¿Eliminar la cuota de {periodo}?` + `Se borra la meta; las ventas, actividades y llamadas del miembro no se tocan.` + `Sí, eliminar` | ConfirmDialog · Eliminar cuota | calcado |
| — | Sin permiso de gestión | Sheet · Cuotas del miembro — sin permiso | **Nuevo**: hoy, sin permiso, el editor simplemente no se monta y nadie explica por qué |
| — | Móvil | Móvil / Miembros — Cupos del miembro (hoja) | **Nuevo** |

---

## 2. `08` › Sección 14 — Organización — miembros y sucursales

### 2.1 Invitaciones — `InvitationsTab.tsx` (C.4, 98 controles)

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| C.4 #1-#2, #6-#7 | Título `Invitaciones` y `Gestiona las invitaciones de tu organización` | Escritorio / Invitaciones — listo | calcado (una sola cabecera; hoy está duplicada en la página y en el tab) |
| C.4 #10-#23 | Panel de filtros a mano: `Filtrar invitaciones`, badge de conteo, `Limpiar todos`, `Email`, `Rol`, `Estado` con `Todos / Pendientes / Aceptadas / Revocadas` | ídem | **sustituido por** buscador único (`SearchBar`) + `FilterButton` con contador, la decisión vigente del kit |
| C.4 #24 | `Enviar Nueva Invitación` | ídem | calcado |
| C.4 #25-#26 | `Usuarios: {current}/{max}` + `(+{count} invitaciones pendientes)` | ídem | calcado |
| C.4 #27-#28 | `Actualizar plan` + `Has alcanzado el límite de usuarios de tu plan…` | Escritorio / Invitaciones — cupo de usuarios al tope | **sustituido**: el aviso ofrece dos salidas, `Comprar usuarios` (enlaza con la Sección 13) y `Cambiar de plan`. Hoy solo enlaza a `/app/organizacion/plan` |
| C.4 #31, #45 | `Debes confirmar tu correo electrónico para invitar nuevos usuarios.` + `title` `Confirma tu correo electrónico para usar esta función` | Escritorio / Invitaciones — correo sin confirmar | sustituido: el `title` de un envoltorio con `pointer-events:none` pasa a aviso visible con acción |
| C.4 #32-#33 | `Correo Electrónico` + `ejemplo@correo.com` | Escritorio / Invitaciones — listo | calcado |
| C.4 #34-#36 | `Rol` + `Selecciona un rol` + `Administrador / Gerente / Empleado / Cliente` | ídem | calcado |
| C.4 #37-#39 | `Sucursal *` + `Selecciona una sucursal` + `El empleado será asignado automáticamente a esta sucursal al aceptar la invitación.` | ídem | calcado |
| C.4 #40-#42 | `Cargo` + `Sin cargo específico` + `El cargo determina los permisos de visualización del usuario en el sistema.` | ídem | calcado |
| C.4 #43-#44 | `Enviar Invitación` / `Enviando...` | ídem | calcado |
| C.4 #46-#49 | Tarjeta `Invitaciones`, `Envía invitaciones a nuevos miembros para tu organización`, `(X de Y)`, `Ocultar filtros` | ídem | calcado |
| C.4 #50-#59 | Tabla de 9 columnas: `Email`, `Rol`, `Sucursal`, `Cargo`, `Estado`, `Fecha de Envío`, `Fecha de Expiración`, `Link`, `Acciones` | ídem | sustituido por `DataTable` del kit; la sucursal usa `BranchBadge` (con «todas» para administradores) |
| C.4 #60 | `No hay invitaciones pendientes` | DataTable · Invitaciones — vacío | sustituido por `EmptyState` con acción; además se corrige el `colSpan={8}` sobre 9 columnas |
| C.4 #61 | `No se encontraron invitaciones con los filtros aplicados` | DataTable · Invitaciones — sin resultados | calcado |
| C.4 #62-#65 | Badges `Revocada` / `Aceptada` / `Expirada` / `Pendiente` | Escritorio / Invitaciones — listo | calcado, con los tonos de `SISTEMA-BADGES.md` (peligro / éxito / neutro / información) |
| C.4 #66 | `No expira` | ídem | calcado |
| C.4 #67-#72 | `Ver link`, botón de copiar, check verde de 2 s, `—` | ídem | calcado; el botón de copiar recibe nombre accesible |
| C.4 #73-#74 | `Reenviar` / `Enviando...` | ídem + ConfirmDialog · Reenviar invitación | calcado + confirmación **Nueva** (hoy extiende 30 días sin preguntar ni decirlo) |
| C.4 #75-#79 | `Revocar` + `¿Estás seguro de que deseas revocar esta invitación?` + `La invitación a {email} será cancelada…` + `Cancelar` / `Revocar` | ConfirmDialog · Revocar invitación | calcado |
| C.4 #80 | `Mostrando {start} a {end} de {total} registros` · `Filas` | Escritorio / Invitaciones — listo | sustituido por la **paginación única** del kit |
| C.4 #3, #81 | `InvitationsSkeleton` | DataTable · Invitaciones — cargando | sustituido por `Skeleton` del kit |
| C.4 #82 | `Error al cargar invitaciones` | DataTable · Invitaciones — error al cargar | sustituido: el error ya no borra la tabla ni muestra jerga de Postgres |
| C.4 #83-#89 | Validaciones `Por favor completa todos los campos obligatorios`, `Ya existe una invitación activa para este correo electrónico`, `Este usuario ya es miembro de la organización`, `Has alcanzado el límite de {max} usuarios…` | Escritorio / Invitaciones — listo (estados del formulario) y Toasts · Invitaciones | calcado como error en línea del `FormField`, no como banda en la cabecera |
| C.4 #90 | `Invitación creada para {email}. Envía esta URL manualmente: {url}` | Toasts · Invitaciones (`Invitación creada, correo no enviado`) | **sustituido**: deja de escupir la URL cruda en pantalla; la acción es `Copiar link` |
| C.4 #91, #93, #97 | `Invitación enviada exitosamente a {email}`, `Invitación revocada correctamente`, `Invitación reenviada exitosamente a {email}` | Escritorio / Invitaciones — invitación enviada + Toasts · Invitaciones | **sustituido por Toast del kit**: hoy son bandas verdes que nunca se auto-ocultan y viven en la tarjeta de envío aunque la acción venga de la tabla, que está más abajo (toast invisible de facto si has hecho scroll) |
| C.4 #92, #94, #98 | `Error al enviar / revocar / reenviar la invitación` | Toasts · Invitaciones | sustituido por Toast del kit con «Reintentar» |
| C.4 #95-#96 | `No se pudo obtener la información de la invitación`, `Invitación actualizada para {email}. URL: {url}` | Toasts · Invitaciones | sustituido igual que #90 |
| — | Móvil | Móvil / Invitaciones — enviar y lista | **Nuevo**: la tabla de 9 columnas pasa a tarjetas y paginación compacta |

### 2.2 Miembros — `MembersTab.tsx` (C.3)

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| C.3 #10-#24 | Panel de filtros con 5 campos (`Nombre`, `Email`, `Rol`, `Sucursal`, `Estado`) | Escritorio / Miembros — listo | sustituido por buscador único + `FilterButton`. Se corrige además el filtro de sucursal, que hoy compara número con texto y **nunca filtra** (MembersTab.tsx:335 vs :511) |
| C.3 #27-#29 | `Miembros de la Organización`, `Lista de miembros actuales`, `(X de Y)` | ídem | calcado |
| C.3 #30 | `{members.length}/{maxUsers} usuarios` | ídem | calcado (badge rojo al llegar al tope) |
| C.3 #32 | Tabla de 8 columnas `Nombre`, `Email`, `Rol`, `Cargo`, `Sucursal`, `Estado`, `Fecha de Registro`, `Acciones` | ídem | sustituido por `DataTable` del kit |
| C.3 #33-#34 | `No hay miembros registrados` / `No se encontraron miembros con los filtros aplicados` | DataTable · Miembros — vacío / sin resultados | sustituido por `EmptyState` del kit |
| C.3 #35-#37 | `<select>` de rol en línea con `Seleccionar rol` y las cuatro opciones | Escritorio / Miembros — listo | calcado como `Select` del kit… |
| C.3 #35 | …pero **con confirmación** | Escritorio / Miembros — cambiar rol (confirmación) | **sustituido**: hoy el `select` escribe en la base de datos al instante, sin confirmar y sin deshacer |
| C.3 #38-#39 | Chips de sucursal / `Sin sucursal` | Escritorio / Miembros — listo | sustituido por `BranchBadge` del kit |
| C.3 #40 | `Gestionar Sucursales` / `Asignar Sucursales` | ídem | calcado |
| C.3 #41 | Badge-botón `Activo` / `Inactivo` | ídem + ConfirmDialog · Desactivar | **sustituido por `Switch` del kit**: hoy hay que adivinar que el badge es pulsable (solo se insinúa con `hover:opacity-80`) |
| C.3 #42-#43 | `Cuotas` + `aria-label` `Cuotas de {member.full_name}` | ídem | calcado (y su hoja está en la Sección 13) |
| C.3 #44-#45 | `Eliminar` + `confirm()` nativo `¿Estás seguro de que deseas eliminar este miembro de la organización?` | ConfirmDialog · Eliminar miembro | **sustituido por `ConfirmDialog` del kit** (E.5); la copia advierte además de que hoy es un borrado físico |
| C.3 #46 | `Mostrando X a Y de Z registros` · `Filas` | Escritorio / Miembros — listo | paginación única del kit |
| C.3 #25 | `MembersSkeleton` | DataTable · Miembros — cargando | sustituido por `Skeleton` del kit |
| C.3 #26, #52-#55 | Franja roja que **reemplaza toda la pestaña** | DataTable · Miembros — error al cargar | **sustituido**: la tabla se conserva y el error es un `EmptyState` acotado |
| C.3 #49-#51 | `Rol actualizado correctamente`, `Usuario activado/desactivado correctamente`, `Miembro eliminado correctamente` | Toasts · Miembros y sucursales | **sustituido por Toast del kit**: hoy se escriben en el estado `success` pero **nunca se pintan** |
| C.3 #56-#63 | `Asignación de Sucursales`, `{memberName}`, `Todas las sucursales`, una casilla por sucursal, `Cancelar` / `Guardar` | Escritorio / Miembros — asignación de sucursales | calcado en contenido; **sustituido** el modal casero (sin `Esc`, sin foco atrapado, sin `role="dialog"`, con autocierre a los 1.000 ms) por el `Dialog` del kit |
| C.3 #59-#61 | `Asignaciones actualizadas correctamente`, `No hay sucursales disponibles`, spinner daisyUI | Toasts · Miembros y sucursales | sustituido por Toast y `EmptyState` del kit |
| — | Aviso de escritura atómica | ídem | **Nuevo**: hoy el guardado hace `DELETE` de todas las asignaciones y luego `INSERT`; si el insert falla, el miembro se queda sin ninguna sucursal |
| — | Móvil | Móvil / Miembros — lista en tarjetas | **Nuevo**: hoy la tabla tiene `min-w-[1300px]` y no hay variante táctil |

### 2.3 Sucursales y formulario — `BranchesTab.tsx` + `branches/BranchForm.tsx` (C.5)

| # auditoría | Control | Frame Figma | Estado |
|---|---|---|---|
| C.5 #1-#2, #9-#10 | Títulos `Sucursales` (×3) y `{n} sucursales registradas` | Escritorio / Sucursales — listo | **sustituido**: una sola cabecera; hoy hay tres títulos apilados |
| C.5 #11-#14 | `Tabla` / `Mapa` / `Mapa Completo` | — | **omitido: fuera de encargo**. La vista de mapa y `BranchMapModal` los cubre la Sección 9 de `08`; aquí se dibujan el listado y el formulario, que es lo que pidió el dueño |
| C.5 #15 | `{branches.length}/{maxBranches}` | Escritorio / Sucursales — listo y — cupo del plan alcanzado | calcado (rojo al tope) |
| C.5 #16 | `Nueva Sucursal` | ídem | calcado |
| C.5 #15-#16 | `Has alcanzado el límite de {max} sucursales de tu plan. Contrata un addon para crear más sucursales.` | Escritorio / Sucursales — cupo del plan alcanzado | **sustituido**: hoy ese aviso entra por el error global y **borra la tabla** (BranchesTab.tsx:198-201 vs :580). Aquí es un banner con `Comprar sucursales` y `Cambiar de plan`, y la tabla se queda |
| C.5 #28-#36 | Tabla de 9 columnas `Sucursal`, `Ubicación`, `Contacto`, `Gerente`, `Horarios`, `Estado`, `Sitio Web`, `Asignación`, `Acciones` | Escritorio / Sucursales — listo | sustituido por `DataTable` + paginación del kit (hoy `min-w-[1300px]`, sin paginar y sin `limit`) |
| C.5 #37-#38, #52-#59 | Badges `Principal`, `Web`, `Activa` / `Inactiva`, `Publicado` / `No publicado`, `Asignado` / `No asignado` | ídem | calcado |
| C.5 #46-#48 | `Asignar gerente` / `Sin gerente` | ídem | calcado |
| C.5 #49-#51 | Resumen de horarios / `Sin horarios` | ídem | calcado |
| C.5 #60-#66 | `Publicar` / `Despublicar`, `Asignar` / `Cambiar`, `Ver`, `Editar`, `Eliminar` | ídem | calcado como `IconButton` con tooltip |
| — | Cuatro `StatCard` (activas, con gerente, publicadas, cupo) | ídem | **Nuevo** |
| C.5 #67-#69 | Diálogo `Nueva Sucursal` / `Editar Sucursal` + su subtítulo | Escritorio / Sucursales — nueva sucursal · — editar sucursal | calcado |
| C.5 #129-#131 | **Dos** botones de guardar (el del toolbar es inerte porque no hay `<form>`) | ídem | **sustituido**: un único botón al pie |
| C.5 #132-#134 | `Información básica`, `Nombre *`, `Código de sucursal` + `Asignado automáticamente` | ídem | calcado (el código sigue siendo de solo lectura) |
| C.5 #89-#95 | `NIT / Identificación fiscal`, `Zona`, `Capacidad` | ídem | **Nuevo**: existen en `branches` y se ven en el detalle, pero **no tienen ningún control en el formulario** |
| — | `Estado del registro` (`status`) | ídem | **Nuevo**: existe en el modelo y queda fijo en `active`, sin control |
| — | `Coordenadas` | ídem | **Nuevo** en el formulario (hoy solo se editan desde el mapa) |
| C.5 #135-#138 | `Ubicación`, `Dirección`, `LocationSelector` (País / Departamento / Ciudad), `Código Postal` | ídem | calcado |
| C.5 #139-#141 | `Información de contacto`, `Teléfono` (`PhoneInput`), `Email` | ídem | calcado |
| C.5 #142-#143 | `Gerente de sucursal`, `Asignar Gerente`, `El gerente tendrá permisos administrativos sobre esta sucursal.` | ídem | calcado |
| C.5 #144-#148 | `Horarios de apertura`: tabla `Día` · `Abierto` · `Hora apertura` · `Hora cierre`, siete filas, `Sí` / `No`, horas deshabilitadas si el día está cerrado | ídem | calcado con los valores por defecto reales (L-V 09:00-18:00, sábado 10:00-15:00, domingo cerrado) |
| C.5 #149-#155 | `Características`: `WiFi`, `Estacionamiento`, `Delivery`, `Área exterior`, `Accesible para sillas de ruedas`, `Aire acondicionado` | ídem | calcado |
| C.5 #156-#158 | `Identidad Web`, `Tipo de negocio` (7 opciones), `Slug (URL path)` | ídem | calcado |
| C.5 #159-#160 | Avisos de slug reservado y de slug cambiado | Nueva sucursal / Editar sucursal | calcado (uno en cada modo) |
| C.5 #161-#164 | `Subdominio`, `Dominio personalizado`, `Conectar`, `Comprar` | ídem | calcado; los `title` de los botones pasan a etiqueta visible |
| C.5 #165-#166 | `Logo del sitio web` (2 MB) e `Imagen de portada` (5 MB) | ídem | calcado con `ImageUploader` del kit |
| C.5 #167-#168 | `Sitio web publicado` y la previsualización `URL pública del outlet:` | ídem | calcado |
| C.5 #169-#172 | `Estado`, `Sucursal principal`, `Sucursal activa`, `Surte la tienda web` | ídem | calcado |
| C.5 #173 | Error único al pie (`El tipo de negocio (branch_type) es obligatorio…`) | — | **sustituido por error por campo** (`FormField State=error`): hoy hay un solo `error` global, solo el primero, al final de un formulario de ocho secciones y sin scroll automático |
| C.5 #78-#81 | `ConfirmDialog` de borrado | ConfirmDialog · Eliminar sucursal | **sustituido**: hoy está mal cableado — usa `Error al eliminar sucursal` como descripción y la pregunta como etiqueta del botón |
| C.5 #76 | `AssignManagerModal` | Diálogo · Asignar Gerente | calcado; el `Resumen del cambio` pasa de decir «Asignado» / «Se asignará» a decir **quién** |
| C.5 #122, #128 | `AssignMembersModal` | Diálogo · Asignar Miembros | calcado + buscador (**Nuevo**) |
| C.5 #143 | `ManagerSelector` | ManagerSelector · abierto | **sustituido**: hoy las opciones son `<div onClick>` sin `role`, sin teclado, sin `Esc`, sin modo oscuro y sin mostrar el correo |
| C.5 #174-#175 | `BuyDomainDialog` / `AddCustomDomainDialog` | — | **omitido: ya diseñados** en la Sección 11 de `08` («Dominios», C.9). Aquí solo se dibujan los dos botones que los abren |
| — | Móvil | Móvil / Sucursales — lista en tarjetas · — nueva sucursal (hoja por pasos) · — asignar gerente (hoja) | **Nuevo**: el formulario de ocho secciones se agrupa en cuatro pasos con pie fijo |

---

## 3. `04` › Sección 11 — Importar desde la web

`src/components/inventario/productos/scraping/ScrapingProductos.tsx` (786 líneas) y la Edge
Function `product-scraper`. El componente **no está en la auditoría de productos**, así que aquí
los controles se numeran por paso.

| Paso · control | Frame Figma | Estado |
|---|---|---|
| Entrada `Importar con IA` desde la cabecera del catálogo | — | **omitido: ya existe** en `04` › «Productos — Catálogo (menús)» (menú `Importar ▾`) |
| Título `Importar productos con IA` + icono | Escritorio / Importar con IA — paso 1 URL | calcado |
| Descripción por paso (`Pegue la URL…` / `Se encontraron {n} productos…` / `Resultado de la importación.`) | los tres pasos | calcado, pasado a tuteo para alinearlo con el resto de la app (hoy el importador es el único que trata de usted) |
| Indicador de pasos `1. URL · 2. Vista previa · 3. Resultado` | los tres pasos | **Nuevo**: hoy **no hay ningún indicador de progreso de pasos** — el único hilo es el texto de la descripción |
| `URL de la página` + placeholder `https://ejemplo.com/categoria/televisores` | paso 1 URL | calcado |
| Ayuda `Funciona con páginas de listados de productos o de un producto individual…` | paso 1 URL | calcado |
| `Destino de la importación`: `Sucursal destino`, `Si ya existe`, `Impuesto por defecto`, `Margen para el costo`, `Proveedor` | paso 1 URL | **Nuevo**. Hoy la sucursal sale de `selectedBranchId` del contexto global **sin decirlo** (si es `null`, el stock que escribes se descarta en silencio); no hay impuesto (el importador de archivos sí mapea la columna `Impuesto`); no hay costo, así que nunca se crea `product_costs` y el proveedor queda vinculado con `cost: 0` |
| Aviso `Se creará el proveedor «Aero» y 3 categorías nuevas` + casilla marcada `Crear proveedor y categorías que no existan` + `Categoría para los que no existan` | paso 1 URL · paso 1 analizando · Móvil paso 1 | **Nuevo** (D4): la comodidad se mantiene, pero se ve antes de importar y se puede desactivar |
| Coste en créditos de IA | paso 1 URL | **Nuevo** |
| `Cancelar` · `Analizar página` / `Analizando con IA...` | paso 1 URL · paso 1 analizando | calcado |
| Progreso del análisis con fase y aviso de no cerrar | paso 1 analizando | **sustituido**: hoy son hasta **180 s** sin barra, sin fases y sin porcentaje, con el texto solo dentro del botón |
| `URL inválida` / `Ingrese una URL válida que comience con http:// o https://` | Diálogo · Importar con IA — URL inválida | sustituido: pasa a error en el propio campo además del toast |
| `Sin productos` / `No se encontraron productos en esa página. Intente con otra URL.` | Diálogo · Importar con IA — Sin productos | sustituido: deja de vivir solo en un toast |
| `Error al analizar` + el mensaje de timeout | Diálogo · Importar con IA — Error al analizar | sustituido, con «Reintentar» |
| `Seleccionar todos ({n}/{m})` | paso 2 vista previa | calcado |
| `Si ya existe:` con `Omitir (no duplicar)` / `Actualizar existente` / `Crear como nuevo` | paso 2 vista previa | calcado |
| Tarjeta por producto: miniatura, `Nombre del producto`, `Precio venta`, `Precio compar.`, `Categoría`, `Stock inicial` | paso 2 vista previa | calcado (son los 5 campos editables reales) |
| Badges `Datos incompletos`, marca, variantes (`Color, Talla`), `{n} imágenes` | paso 2 vista previa | calcado; se corrige la pluralización («1 imágenes») |
| `Ya existe · se omite` por fila | paso 2 vista previa | **Nuevo**: hoy solo se sabe al final, y contado como fallo |
| `Quitar de la lista` | paso 2 vista previa | **Nuevo**: hoy un producto solo se puede deseleccionar, no quitar |
| Scroll infinito `Cargando más productos... ({n}/{m})` | paso 2 vista previa (`Se muestran 4 de 42 · desplázate para cargar más`) | **sustituido**: el texto actual miente (no carga nada, solo renderiza más ítems ya en memoria) |
| `Obteniendo detalles...` por tarjeta | paso 2 enriqueciendo | calcado |
| `Enriqueciendo {n}/{m}... (Cancelar)` como **único** botón rojo que sustituye a «Importar» | paso 2 enriqueciendo | **sustituido**: el progreso pasa a barra y `Cancelar enriquecimiento` es un botón secundario aparte; «Importar» ya no desaparece |
| `Lote {x} de {y}` + `{n} / {m} productos` + barra | paso 2 importando por lotes | calcado |
| Porcentaje escrito y aviso de no cerrar | paso 2 importando por lotes | **Nuevo** |
| `Atrás` · `Importar {n} seleccionados` / `Importando {n} productos...` | paso 2 (todos) | calcado |
| Contadores `Importados` y `Fallidos` | paso 3 resultado | calcado |
| Contador `Omitidos`, **en gris** | paso 3 resultado | **Nuevo y crítico** (D5): con el modo por defecto (`Omitir`), cada duplicado vuelve del backend como `ok:false` con el texto `Ya existe (omitido)` y **hoy se pinta como FALLIDO**, en rojo y en la lista de errores |
| Contador `No intentados` + `Reanudar el lote pendiente` | paso 3 error parcial | **Nuevo y crítico** (D5): si un lote falla, el bucle se corta y los productos de los lotes que nunca se ejecutaron **no se cuentan en ningún sitio** (`importados + fallidos ≠ seleccionados`), sin explicación |
| Línea `42 seleccionados · 39 importados + 3 omitidos + 0 fallidos + 0 sin intentar` | paso 3 resultado y paso 3 error parcial | **Nuevo** (D5): el recuento cuadra siempre con el total seleccionado, y se ve que cuadra |
| Lista `{nombre}: {error}` | paso 3 error parcial | calcado |
| Motivo del fallo global (`Lote {x}/{y}: {mensaje}`) | paso 3 error parcial | **sustituido**: hoy solo existe en un toast que llega a la vez que el cambio de pantalla |
| Bloque `Qué se creó` (productos nuevos, actualizados, categorías, proveedores, sucursal, origen, créditos) | paso 3 resultado | **Nuevo**: el backend crea categorías y **proveedores a partir de la marca** en silencio, y el cliente descarta el `results[].action` que ya recibe |
| `Importar otra página` · `Finalizar` | paso 3 (ambos) | calcado, más `Ver los {n} productos` (**Nuevo**) |
| Cierre del diálogo durante el trabajo | ConfirmDialog · Cerrar el importador | **Nuevo**: hoy `Esc`, el clic fuera y la ✕ cierran el diálogo en mitad del análisis o de la importación sin preguntar, y el progreso visual se pierde |
| Toasts del flujo | Toasts · Importar con IA | sustituidos por `Toast` del kit |
| Móvil | Móvil / Importar con IA — paso 1 URL · paso 2 vista previa · paso 3 resultado | **Nuevo**: el diálogo `sm:max-w-3xl` no tiene variante táctil |

### 3.1 Relación con el `ImportWizard` ya diseñado

Frame **«Relación con el ImportWizard del kit»** (Sección 11 de `04`), con una instancia real de
`ImportWizard / Source=web, Step=origen`.

- **Se reutiliza el mismo componente.** `ImportWizard` (`02 Componentes › Productos y POS`) ya
  tiene `Source=web` con `Step=origen` y `Step=previsualizacion`, más `Source=ai-assistant`.
- **Lo que comparten y se reutiliza tal cual:** el recuento final con iconos de éxito y error, el
  botón primario con el conteo embebido (`Importar {n} …`), `Atrás` / `Cancelar` secundarios con
  icono, los tres modos de duplicado y la creación automática de categorías y proveedores.
- **En qué difieren.** El componente asume los **cinco** pasos del importador de archivos
  (`Origen · Mapeo · Validación · Previsualización · Resultado`) y `ScrapingProductos` solo tiene
  **tres** (`URL · Vista previa · Resultado`): **no hay pantalla de mapeo de columnas** —el mapeo
  es implícito en la Edge Function— **ni paso de validación por fila**. Además el scraping permite
  seleccionar producto a producto y editar en línea, cosa que el importador de archivos no hace.
- **Lo que se añade aquí y debería volver al componente:** contador `Omitidos`, contador
  `No intentados`, el bloque `Destino de la importación` con impuesto y costo, el porcentaje en la
  barra de lotes y el `ConfirmDialog` de cierre.

---

## 4. Lo roto que no se calcó (resumen)

1. **`confirm()` nativos** (E.5): `MembersTab.tsx:301` (borrado físico de la membresía) y
   `PaymentMethodCard.tsx:83`. Sustituidos por `ConfirmDialog` del kit.
2. **Mensajes de éxito invisibles**: `MembersTab` escribe `success` y **nunca lo renderiza**
   (líneas 244, 291, 316). Pasan a `Toast`.
3. **Mensajes de éxito que no se auto-ocultan y viven lejos de la acción**: `InvitationsTab`.
   Pasan a `Toast`.
4. **El error secuestra la pantalla**: `MembersTab` hace `return` temprano y borra la tabla
   entera; `BranchesTab` mete el aviso de cupo por el mismo canal que los errores y borra la
   tabla. Aquí los errores son acotados.
5. **Tooltips de hover como única información**: `No puedes eliminar el único método de pago`,
   `Confirma tu correo electrónico para usar esta función`, `Conectar un dominio que ya compraste`.
   Pasan a texto visible.
6. **Cuatro modales caseros** sin `Esc`, sin foco atrapado, sin `role="dialog"`
   (`BranchAssignmentModal`, `AssignManagerModal`, `AssignMembersModal`, `EnterpriseConfigModal`)
   y un combobox sin teclado (`ManagerSelector`). Pasan al `Dialog` del kit.
7. **`ConfirmDialog` mal cableado** en `BranchesTab.tsx:1006-1007`.
8. **`colSpan={8}` sobre 9 columnas** en el vacío de `InvitationsTab.tsx:1029`.
9. **Dos botones de guardar** en `BranchForm`, uno de ellos inerte.
10. **Decimales inconsistentes**: `toLocaleString()` sin opciones en los tres modales de compra,
    `toFixed(2)` en Enterprise y `formatCurrency` a dos decimales en las cuotas. Todo pasa a
    **sin decimales**, según F.9.
11. **Duplicados omitidos contados como fallidos** y **productos perdidos sin contar** en el
    importador web. Cerrado por **D5**.
12. **`onPurchased` nunca se usa** en los tres modales de compra, y el estado `success` de
    `ChangePlanModal` y el `showAddModal` de `PaymentMethodCard` son código muerto: no se dibujan.
13. **Precios de complementos cableados en centavos de dólar** (`1000`, `800`, `4`) y `unitPrice`
    como estado muerto que nadie escribe. Cerrado por **D1**: `addon_prices` y consulta al servidor.
14. **`EnterpriseConfigModal` sin consumidores.** Cerrado por **D3**: dos entradas y solicitud.
15. **Cobro sin total visible** (el cupón se aplica a ciegas). Cerrado por **D2**.
16. **Creación silenciosa de categorías y proveedores** en el importador web. Cerrado por **D4**.

## 5. Lo que se dibujó tal cual aunque chirría (y por qué)

- La mini-tarjeta de marca muestra `brand.substring(0,4)` → «MAST», «UNIO». Se calca porque es
  lo que ve el usuario hoy; se propone sustituirla, no se decide aquí.
- El código de sucursal sigue siendo de solo lectura (`Asignado automáticamente`): es una
  decisión de producto, no un fallo.
- Los precios de los planes salen de `PlanOption` (Sección 12), no se inventan aquí.
