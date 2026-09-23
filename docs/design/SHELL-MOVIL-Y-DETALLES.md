# Shell móvil y detalles — sincronización y propuestas (2026-09-23)

Archivo de Figma `EAvjINVRnlzFM70GVoWXgl`. Capturas en `docs/design/figma/36-shell-*.png`.

## Parte A — Figma sincronizado con el código

Todo en `02 Componentes`. Como las pantallas usan instancias, los cambios llegan solos a todas
las páginas.

| Qué | Nodo | Cambio |
|---|---|---|
| OrgAvatar | `41:1094` | Iniciales de 2 letras («Mi empresa S.A.S.» → «ME»; ignora «de», «del», «S.A.S.», «Ltda.»), texto de 10 px a 24 px, radio 6 (`radius/sm`). Propiedad booleana nueva **«Logo»**: logo sobre `bg/surface` con borde de 1 px (`border/default`) y un icono genérico de muestra. Para poner un logo real, se pone la imagen como relleno de la capa «Logo» de la instancia. |
| OrgSwitcher | `42:1408` | Sin el isotipo «GO». En `header`, el avatar lo pone OrgPicker (antes estaba oculto con un override). En `header-mobile`: OrgAvatar + «Org / Sucursal» + ⌃⌄ (`ChevronsUpDown`, como en el código); el texto se trunca y ya no se sale del marco en el modo pos. |
| OrgPicker | `41:1175` | OrgAvatar **expuesto** en las 12 variantes, con «ME». |
| OrgRow / OrgPickerPanel | `41:1309` / `42:1199` | OrgAvatar expuesto; el rol se trunca con «…». En el panel: fila activa «ME», una fila con **logo** y otra con iniciales «TA». |
| AppHeader | `45:2224` | OrgSwitcher expuesto; descripción actualizada. |
| MobileHeader | `48:2550` | OrgSwitcher expuesto en `root` y `pos`. Propiedades nuevas en `pos`: **«Menú ⋯ (POS)»**, que sale del código actual, y **«Volver (← en POS)»**, que es propuesta (Parte B). |
| SessionPopover / SessionSheet | `27:2017` / `27:2195` | Cabecera como en `PanelSesion.tsx`: una sola zona «Zona → Mi perfil» con [avatar + nombre / correo / organización · rol + ›], y a la derecha, aparte, «Cambiar de cuenta» [⇆ + ⌄/⌃]. Los textos se truncan. Idioma: «Español ›». Orden: Tema oscuro → Idioma también en `Accounts=open`. |
| MenuItem | `10:239` | Propiedad nueva «Chevron tras atajo»: pone un › de 16 px tras el valor (en las variantes `Trailing=atajo`). |
| PlanUsageMeter | `619:378172`; la variante original `11:126` sigue siendo la que usan las instancias | Ahora es un set con `Créditos=dentro del cupo` («3.750 de 5.000») y `Créditos=sobre el cupo` («1.000 disponibles», barra llena). |
| MobileDrawer | `30:954` | Se quita «Reportar problema». En móvil vive en SessionSheet, entre «Mi suscripción» y «Cerrar sesión» (verificado en las dos variantes). |
| Sidebar `Mode=drawer` | `44:2497` | Se quitan el divisor y «Acciones (fijas)» con «Reportar problema». |
| Decisiones 17 y 21 | `57:3103`, `67:3076` | La 17 habla ahora del avatar y ya no del isotipo; la 21 manda «Reportar problema» móvil a SessionSheet. |

**Copias sueltas.** Se revisaron las 11 páginas: no hay ningún frame desacoplado
(`detachedInfo` = 0), y todos los headers, sidebars y barras son instancias. Solo apareció un
compuesto hecho a mano, en `05 POS y ventas`: el frame «MobileHeader Mode=pos + ⋯» (`187:7937`),
que ponía un IconButton ⋯ encima del chip de caja. Se sustituyó por la instancia `187:7938` con
«Menú ⋯ (POS)» = true. El frame «Escritorio / Sidebar sesión — cerrado» (`14:17`) ya muestra «ME»
(`36-shell-escritorio-sesion.png`).

## Parte B — Propuestas para aprobación (no existen en código)

Los componentes están en `02 Componentes` › sección «Shell móvil y detalles (Propuesta
2026-09-23)» (`622:13648`). Las pantallas y recorridos, con notas fuera de los frames, están en
`03 Navegación y shell` › «Propuestas — shell móvil y detalles (Nuevo)» (`627:17020`).

1. **Menú móvil por niveles.** Componentes: `DrawerPageRow` (`622:13657`) y `MobileDrawerNivel2`
   (`622:13996`: Finanzas `622:13659`, Inventario `622:13796`, Punto de venta `622:13912`). El
   nivel 1 es el `Sidebar Mode=drawer` de hoy. El nivel 2 tiene «← Menú», el título con un chip de
   28 px y las páginas agrupadas con los rótulos de `catalog.ts`. Pantallas: `627:17024` (nivel 1),
   `627:384099` (tira de transición), `627:17066` (Finanzas), `627:17087` (Finanzas con página
   activa) y `627:17108` (Inventario con scroll).
2. **POS con «←».** Propiedad «Volver (← en POS)» de MobileHeader. Pantallas `627:19029` (caja
   abierta, verde) y `627:19108` (caja cerrada, ámbar). «←» vuelve a la página anterior y, si no
   hay historial, a Inicio.
3. **Detalle de notificación.** Componente `NotificationDetail` (`625:14683`), escritorio 440 /
   móvil × listo, cargando, sin datos y error. Recorrido en escritorio: `627:378998` → `627:379020`
   (stock bajo) y `627:379586` (CxC vencida). En móvil: `627:380091` → `627:380112`, más
   `627:380398`, `627:380653` y `627:380904` (estados).
4. **Vista rápida de tarea.** `TaskQuickView` (`626:14723`), escritorio / móvil × listo,
   completada y error, y `PosponerMenu` (`626:14725`). Pantallas en escritorio: `627:381663`,
   `627:382109` y `627:382601`. En móvil: `627:383064`, `627:383318`, `627:383614` y `627:383876`.

Chequeo por script de las dos secciones nuevas: 0 solapes, 0 nodos fuera de sección, 0 instancias
rotas, 0 textos recortados y 0 anotaciones dentro de frames.

## Hallazgos que no se tocaron

- En `Badge` (`7:70`), las variantes `Size=sm` no enlazan su texto a la propiedad «Texto»: una
  instancia sm conserva el texto de la variante («Pendiente», «Borrador») aunque se cambie la
  propiedad. En las propuestas se sobrescribió la capa de texto directamente.
- En las secciones Sesión y Header de `02` ya había textos recortados: filas de AccountRow con
  «organización · rol» largo, textos del FeedbackDialog y el tooltip de FeedbackButton.
- En código, `NotificationDetailSheet.tsx` usa colores sueltos (`bg-white`, `gray-*`, `blue-*`)
  en lugar de tokens.
- En código, `src/lib/hooks/useTaskReminders.ts` deriva «hoy» con `toISOString().split('T')[0]`,
  que CLAUDE.md prohíbe (ver `docs/reglas-fechas-timezone.md`).

## Preguntas abiertas para el dueño

1. Menú por niveles: ¿el UserBlock queda fijo también en el nivel 2, como está dibujado, o el
   nivel 2 usa toda la altura para las páginas?
2. Al abrir el menú desde una página de un módulo, ¿se abre directo en su nivel 2, como está
   dibujado, o siempre en el nivel 1?
3. En el nivel 2, ¿las páginas llevan icono, como en el catálogo, o solo texto, como en el
   escritorio?
4. POS con «←»: si hay un carrito abierto, ¿se sale sin preguntar y el carrito queda en espera, o
   se pide confirmación? Con «←» se ocultó el BranchBadge, porque la sucursal ya va en el texto
   del selector: ¿de acuerdo?
5. Detalle de notificación: al abrirlo, ¿se marca leída automáticamente (así es hoy) y se ofrece
   «Marcar como no leída», o se marca solo al pulsar la acción principal?
6. «Descartar» una notificación, ¿la oculta solo para el usuario o para toda la organización?
7. Tarea completada: ¿la hoja se queda abierta con «Deshacer», como está dibujado, o se cierra
   con un toast?
8. «Posponer»: ¿las opciones mañana 8:00 y próximo lunes 8:00 sirven, o la hora sale de la
   configuración de la organización?
