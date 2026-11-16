# Auditoría del diseño de Recursos humanos frente al sistema de diseño

Fecha: 2026-11-15.

**Qué se auditó.** Archivo `EAvjINVRnlzFM70GVoWXgl`:
- la página «20 Recursos humanos» (`2508:17`), con 122 pantallas;
- las secciones 10.RH.1, .2, .3 y .5 de «10 Configuración»;
- la sección 10.RH.4 de «08 Acceso y organización».

**Contra qué.** Las normas de `PATRONES-TRANSVERSALES.md`, `CATALOGO-ICONOS.md`, `SISTEMA-BADGES.md` y `KIT-CODIGO.md`, más las pantallas aprobadas de Chat (19), Roles (08) y Configuración (10).

**Origen.** El dueño encontró en la ficha un «← Empleados» suelto, cuando la regla es la cabecera de «Editar rol». De ahí pidió revisar todo el trabajo: «ese mini error me dice que el que hizo ese proyecto de Figma no estaba tan contextualizado».

**Método.** Scripts de solo lectura por pantalla, igual que en `AUDITORIA-COHERENCIA-FIGMA.md`.

## Lo que está bien
- **Colores y textos:** ninguna pantalla usa colores sueltos; todo va con variables del sistema. Todos los textos tienen estilo de texto.
- **Instancias:** no hay ninguna rota.
- **Kit en estados y formularios:** cargando usa `Skeleton` (108 usos) y vacío, error y sin permiso usan `EmptyState` (24). Los formularios usan `FormField`, `Select` y `Checkbox`; las insignias, `Badge`.
- **Marco de la app:** el mismo de Chat en la página 20 (`AppHeader`, `Sidebar Mode=rail`, `Isotipo`) y el mismo del diálogo de Configuración en la 10 (`Sidebar` expandida, `Firma`).

## Lo que no cumple

| # | Norma | Qué pasa | Alcance |
|---|---|---|---|
| H1 | §4 `PageHeader` | **0 instancias de `PageHeader`** en la página 20. Las 61 cabeceras de escritorio están armadas a mano y la ficha usa un componente propio, `CabeceraFicha`. El kit sí tiene `PageHeader` con `Variant=list / detail / form` × `desktop / mobile`. | 61 pantallas |
| H2 | §13 iconos | El icono del módulo no sigue el catálogo. `CATALOGO-ICONOS.md` fija HRM = `Briefcase`, y el diseño creó un `Icon/UserCog` local que reemplaza el puesto de «Proyectos y tareas» en el menú lateral. También creó `Icon/Network` local. Los iconos viven solo en «02 Componentes › Fundamentos › Iconos», importados de lucide. Las cabeceras no llevan el icono de su pantalla. | 61 pantallas + 2 iconos locales |
| H3 | §12 y §13 | 6 estados vacíos heredan `Icon/Package` (inventario) en lugar del icono del dominio. | 6 |
| H4 | §5 tablas | **0 instancias de `DataTable` / `TableCell`.** Las listas de empleados, cargos, plazas y aprobaciones usan filas propias (`FilaEmpleado`, `FilaPlaza`) en lugar de `DataTable Layout=table` en escritorio y `Layout=cards` / `ListCard` en celular. | 30 listas |
| H5 | §3 buscador y filtros | `SearchBar` aparece 19 veces, pero `FilterButton` solo 2, y `FilterPanel` y `FilterChips` 0. En la configuración: 8 buscadores y 1 botón de filtros. | casi todas las listas |
| H6 | §11 capas flotantes | **0 `PopoverCard`** y solo 4 `MenuItem`. Los menús «⋯» están dibujados como marcos. | menús de fila y de cabecera |
| H7 | §7 y §8 | Los resultados se muestran con avisos dibujados («Cambio aprobado…» arriba a la derecha) en lugar de `Toast` (0 usos). En el celular, los diálogos no usan `Layout=sheet` de su componente. | 4 errores de envío + éxitos |
| H8 | componentes duplicados | Hay componentes propios que repiten piezas del kit: `CabeceraFicha` (= `PageHeader Variant=detail`), `FilaEmpleado` y `FilaPlaza` (= filas de `DataTable` / `ListCard`), `BloqueoPermiso Layout=sección` (= `EmptyState Variant=forbidden`) y `AvisoSensible Tipo=banner` (= `Aviso`). En la configuración: `RH/FilaParametro`, `RH/FilaFestivo`, `RH/FilaRegla` y `RH/FilaAcceso`, cuando el resto de la Configuración usa `FilaDato`. | 13 componentes |
| H9 | §4.1 | Revisar acciones duplicadas: «Invitar al portal» aparece en la cabecera y en la tarjeta del Resumen. | ficha |
| H10 | §4 | En la Configuración de RR. HH., el celular no usa `MobileHeader` / `MobileTabBar`, a diferencia de Integraciones (referencia aprobada). | celular 10.RH |

## Qué se conserva como propio (no existe en el kit)
- `NodoOrganigrama`, `EventoHistorial`, `TarjetaDocumento` y `CampoPropuestoIA`. Son piezas nuevas de RR. HH., pero deben armarse con piezas del kit por dentro (`Badge`, `Button`, `Avatar`, `FilaDato`) y vivir en «02 Componentes» bajo un grupo «RR. HH.», no en la página del módulo.
- `AvisoSensible Tipo=insignia`: puede ser una variante de `Badge` documentada en `SISTEMA-BADGES.md`.

## Corrección
1. **Figma.** Rehacer con instancias del kit: `PageHeader` en todas las pantallas, `DataTable` / `ListCard`, `FilterButton` + `FilterPanel` + `FilterChips`, `PopoverCard` + `MenuItem`, `Toast`, `EmptyState` con el icono del dominio y `Briefcase` en el menú. Retirar o convertir los componentes duplicados y mover los propios a «02 Componentes». Agregar RR. HH. al catálogo de iconos.
2. **Código.** Usar SIEMPRE el kit (`PageHeader`, `DataTable`, `FilterPanel`, `RowActionsMenu`, `Toast`, `EmptyState`, `FilaDato`), aunque el Figma de hoy muestre un dibujo propio.
3. **Comprobación final.** Repetir estos scripts con 0 hallazgos antes de mostrarle el diseño al dueño.

## Corrección (2026-11-15)

**Qué se tocó.** La página «20 Recursos humanos» completa (122 pantallas más 6 nuevas), las secciones 10.RH.1, .2, .3, .5 y los componentes de RR. HH. de «10 Configuración», la sección 10.RH.4 de «08 Acceso y organización» y, en «02 Componentes», solo lo necesario: siete iconos nuevos, la entrada de RR. HH. en `Sidebar`, dos propiedades opcionales de `PageHeader Variant=form` y un grupo nuevo «RR. HH. (Nuevo 2026-11-15)». Todo por script, sección por sección, con una comprobación después de cada una.

### Decisiones

1. **Cabecera de detalle = la de «Editar rol».** `PageHeader Variant=detail` no admite el «←», así que la ficha, el cargo y los formularios usan `Variant=form`, igual que «Editar rol» (`1886:914236`): migas, «←» cuadrado junto al título, insignias y acciones a la derecha. Para que eso fuera posible sin inventar un tercer patrón, `Variant=form` ganó dos propiedades **apagadas por defecto** (ninguna instancia existente cambia): «Mostrar insignias» (hasta 3 `Badge`) y «Mostrar menú ⋯» (`IconButton`). Por la regla 5 de `CATALOGO-ICONOS.md` esa ranura es el «←» y no lleva icono. El detalle de un área en escritorio es un panel dentro del organigrama, así que conserva la cabecera de la lista.
2. **`CabeceraFicha` se eliminó.** En escritorio se sustituyó por `PageHeader Variant=form` + la fila de `TabItem` de la ficha. En el celular se desacopló en una composición documentada («Cabecera de la ficha (composición: Badge + Button + IconButton + TabItem)») bajo `MobileHeader Mode=page`.
3. **Tablas.** El kit no trae una `DataTable` configurable por columnas; se siguió el patrón aprobado de Miembros (página 08): marcos «DataTable · … (kit TableCell)» hechos solo de `TableCell`, con la casilla primero, las acciones al final (44 px) e importes en `Variant=money`. En el celular, `ListCard`.
4. **Configuración.** `RH/FilaParametro` pasó a `FilaDato`, como pide la tarea. `RH/FilaFestivo`, `RH/FilaRegla` y `RH/FilaAcceso` tienen 4 o 5 columnas que `FilaDato` (etiqueta + valor) no puede mostrar sin perder datos. Por eso pasaron a tablas de `TableCell Density=compact`, que es lo que usan las demás listas del diálogo de Configuración (secciones 4, 6, 7 y 8).
5. **Sin filtro de sede (§9).** Los selectores «Sede: Todas» y el chip «Sede Norte» salieron de las listas: la sede la fija el selector del header.
6. **Componentes propios que quedan** (`NodoOrganigrama`, `EventoHistorial`, `TarjetaDocumento`, `CampoPropuestoIA`, `RH/PasoAprobador` y `RH/FilaGrupoDatos`) se movieron a «02 Componentes › RR. HH. (Nuevo 2026-11-15)» sin perder instancias. `NodoOrganigrama` usa ahora `Icon/Network` y un `Button` del kit para «Expandir». `TarjetaDocumento` usa `Badge` en lugar de `BadgeVencimiento`, una instancia que no tenía componente.

### H1–H10: antes y después

| # | Antes | Después |
|---|---|---|
| H1 | 0 `PageHeader`; 61 cabeceras de escritorio hechas a mano; `CabeceraFicha` en 23 pantallas de escritorio y 11 de celular; 5 pantallas sin ninguna cabecera | **67 `PageHeader`** (61 pantallas más 6 nuevas): `list` en las listas y `form` en la ficha, el cargo, el alta y la edición. 0 escritorios sin `PageHeader`. Celular: 61 de 61 con `MobileHeader` (`root` en las listas y `page` en detalle y formulario). `CabeceraFicha` se borró |
| H2 | `Icon/UserCog` e `Icon/Network` locales; RR. HH. ocupaba el puesto de «Proyectos y tareas» en los 61 menús | 0 iconos locales. Siete iconos importados de lucide a la rejilla del kit (`Network`, `IdCard`, `Armchair`, `Stamp`, `Gavel`, `CalendarOff`, `ScrollText`). `Sidebar` del kit (rail, expandida y cajón) con su propia entrada «Recursos humanos» y `Briefcase`. En los 61 menús, «Proyectos y tareas» volvió a su sitio. 0 cabeceras `list` sin icono o con `Image` o `Package` |
| H3 | 6 vacíos con `Package` en la página 20, 4 en la Configuración y 2 en la 08 | 0. Llevan `Briefcase`, `Network`, `IdCard`, `Armchair` o `Stamp` según su dominio |
| H4 | 0 `DataTable` o `TableCell`. 59 instancias de `FilaEmpleado` y 20 de `FilaPlaza`; tablas de cargos y aprobaciones hechas a mano; 76 filas `RH/*` en la Configuración | 14 tablas de `TableCell` en la página 20 (868 celdas) y 17 en la Configuración (583 celdas). `ListCard`: 48 en la página 20 y 39 en la Configuración. 0 filas propias. `FilaEmpleado` y `FilaPlaza` se borraron |
| H5 | `SearchBar` 19 y `FilterButton` 2 en la página 20; en la Configuración, 8 buscadores de lista y 1 botón; 0 `FilterPanel` y 0 `FilterChips` | Página 20: 35 `SearchBar` y 35 `FilterButton`, 4 `FilterPanel` abiertos (popover en 20.1.17, 20.2.10 y 20.7.5; hoja en el celular 20.2.2) y 2 `FilterChips`. Configuración: 11 y 11 (sin contar el buscador de ajustes de la navegación), 5 `FilterPanel` (popover en 10.RH.1, .2, .3 y .5; hoja en el celular de .5) y 2 `FilterChips`. Las listas con chips de tipo sueltos (Mis aprobaciones, festivos) los pasaron al panel |
| H6 | 0 `PopoverCard`; 4 `MenuItem` sueltos en un marco dibujado | 4 `PopoverCard` con 15 `MenuItem`, pegados al disparador (borde derecho, 4 px por debajo): fila de Empleados (20.2.2), fila de Cargos (20.1.18), cabecera de Empleados (20.2.11) y cabecera de la ficha (20.3.17). Lo destructivo va al final, en rojo y con un divisor antes |
| H7 | 0 `Toast`; «Cambio aprobado» dibujado arriba a la derecha; 4 errores de envío dibujados dentro del formulario; 1 hoja dibujada en el celular | 6 `Toast`: 2 de éxito y 4 de error con «Reintentar». El primario de cada formulario volvió a su acción. «Hoja · Cocina» pasó a `BottomSheet`. La confirmación móvil ya usaba `ConfirmDialog Layout=sheet`. La `BulkActionBar` de escritorio flota ahora al pie (§1); antes estaba en el flujo, sobre la tabla. En el celular, `BulkActionBar Layout=mobile` reemplaza a la barra dibujada |
| H8 | 13 componentes que duplicaban el kit | 0. Se borraron `CabeceraFicha`, `FilaEmpleado`, `FilaPlaza`, `BloqueoPermiso`, `AvisoSensible` y `RH/FilaParametro`, `/FilaFestivo`, `/FilaRegla` y `/FilaAcceso`, todos con 0 instancias al borrarlos. `BloqueoPermiso` pasó a `EmptyState Variant=forbidden` (3) o, en un campo, a un `Badge`. `AvisoSensible` pasó a `Badge` neutro de contorno con candado (20, documentado en `SISTEMA-BADGES.md`) y a `Aviso Tono=información` (8) |
| H9 | «Invitar al portal» en la cabecera y en la tarjeta del Resumen | 1: en la cabecera. Se cerraron otras tres duplicaciones del mismo tipo: «Solicitar plaza» en la cabecera y en el aviso de Plazas (el aviso dice ahora «Revisar el traslado»); «Exportar» e «Importar» compitiendo con el primario (Exportar va al «⋯»); y «Cancelar / Crear empleado» repetidos en la cabecera y en la barra fija de tres formularios largos (§4.1: quedan solo en el pie) |
| H10 | Configuración de RR. HH. en el celular: 0 de 28 con `MobileHeader`, 0 con `MobileTabBar`, filas dibujadas | 29 de 29 con `MobileHeader Mode=page`. 25 con `MobileTabBar Active=none`, como Integraciones; las 4 con barra fija de «cambios sin guardar» no la llevan, porque la barra ocupa ese lugar. Listas con `ListCard` y filtros con `FilterChips` |

### Revisión de copia (§12)

- **Contadores.** «Mostrando 1–10 de 50 empleados» (antes sin sustantivo) y «Seleccionar los 50» en la barra masiva (antes 46, el total de activos y no el de la lista). La barra móvil dice «Todos (50)».
- **Vacíos.** Los «Volver al catálogo» heredados de Inventario pasaron a «Ir al inicio» (Áreas y Empleados sin permiso), «Volver al Resumen» (salario sin permiso) y «Continuar con el alta» (alta sin permiso de salario).
- **Confirmación.** El título «¿Invitar a 3 personas…?» con el primario «Enviar 2 invitaciones» se reescribió como «¿Enviar 2 invitaciones al portal del empleado?», y la descripción explica quién queda fuera y por qué.
- **`BulkActionBar` móvil.** Se quitó la papelera heredada: a un empleado no se le borra desde una selección.
- **Anotaciones.** Las notas de las pantallas nuevas van fuera del marco, como las demás (§12.1).

### Comprobación por script (después)

| Comprobación | Página 20 (128 pantallas · 8.434 instancias) | Configuración 10.RH (61 pantallas · 3.678) | 08 · 10.RH.4 (11 · 563) |
|---|---:|---:|---:|
| Escritorio sin `PageHeader` | 0 de 67 | n/a (diálogo) | 0 |
| Celular sin `MobileHeader` | 0 de 61 | 0 de 29 | 0 |
| Listas con filas propias, sin `DataTable` ni `ListCard` | 0 | 0 | 0 |
| `SearchBar` sin `FilterButton` | 0 | 0 | 0 |
| Menús sin `PopoverCard` o `MenuItem` | 0 | 0 | 0 |
| `EmptyState` con `Package` | 0 | 0 | 0 |
| Iconos locales en la página | 0 | 0 | 0 |
| Instancias rotas | 0 | 0 | 0 |
| Textos «← » sueltos | 0 | 0 | 0 |
| 1 · Secciones que se solapan | 0 | 0 (antes 3: 10.RH.1/.2/.3/.5 se pisaban; se apilaron) | 0 |
| 2 · Marcos que se solapan en su sección | 0 | 0 | 0 |
| 3 · Nodos fuera de su sección | 0 | 0 | 0 |
| 4 · Contenido fuera de su marco | 0 (se ajustaron 11 velos y 1 hoja) | 0 | 0 |
| 5 · Instancias rotas | 0 | 0 | 0 |
| 6 · Cabeceras sin icono, con `Image` o `Package`, o con un icono fuera del catálogo | 0 | n/a | 0 |

### Pantallas nuevas

20.1.17 Cargos — panel de filtros abierto · 20.1.18 Cargos — menú de la fila · 20.2.10 Empleados — panel de filtros abierto · 20.2.11 Empleados — menú ⋯ de la cabecera · 20.3.17 Ficha — menú ⋯ de la cabecera · 20.7.5 Mis aprobaciones — panel de filtros abierto. En la Configuración: el panel de filtros abierto de 10.RH.1, .2, .3 y .5, y la hoja de filtros del registro de accesos en el celular.

### Capturas

Se volvieron a exportar, con el mismo nombre, los 122 PNG de pantalla y los 35 de configuración de `figma/95-hrm-*`. Se agregaron:
- 6 de pantallas nuevas (`95-hrm-01-17…`, `01-18`, `02-10`, `02-11`, `03-17` y `07-05`);
- 5 de la Configuración (`95-hrm-config-36` a `40`);
- 2 de componentes (`95-hrm-06-componente-paso-aprobador.png` y `95-hrm-06-componente-fila-grupo-datos.png`).

`95-hrm-06-componentes-seccion-completa.png` muestra ahora el grupo de 02. Se borraron las cinco capturas de los componentes eliminados (`aviso-sensible`, `bloqueo-permiso`, `cabecera-ficha`, `fila-empleado` y `fila-plaza`).

### Lo que queda abierto

- Los diálogos de formulario de escritorio (registrar un cambio, solicitar plaza, editar contacto o beneficiario, aprobar cambio y agregar día propio) siguen siendo composiciones de piezas del kit: el kit no tiene un diálogo de formulario genérico.
- En la navegación del diálogo de Configuración, «Punto de venta» lleva `Package`. No es de RR. HH. y no se tocó.
- En el código no se cambió nada: ver «Cambios pendientes en el código» en la adenda RR. HH. de `CATALOGO-ICONOS.md` y el punto 2 de «Corrección» más arriba.
