# Figma — limpieza de nodos sueltos y reglas para agentes (2026-09-29)

Archivo «GO Admin — Sistema de diseño» (`EAvjINVRnlzFM70GVoWXgl`). Solo se tocó Figma y este documento;
ningún archivo de la app.

## Qué pasó

Queja del dueño (2026-09-29, con captura): en la página del sistema de diseño aparecía un selector de
organización (tarjeta de acceso con buscador y filas de organizaciones de ejemplo) flotando encima de la
paleta, la tipografía y el Léeme.

Causa: cuando un agente crea nodos con un plugin, Figma los pone en la **página activa**, que casi siempre
es la primera (`01 Sistema`), en x = 0, y = 0. Si el agente no los mueve a su sección, quedan sueltos y
tapan lo que haya en el origen. Pasó en `01 Sistema` (5 nodos) y en `07 Finanzas` (4 nodos encima del
Índice). No es corrupción: es trabajo sin terminar de ordenar.

## Método

Todo con scripts de `use_figma`, recorriendo las 15 páginas:

- (a) hijos de primer nivel de cada página que no son `SECTION`;
- (b) solapes entre secciones e hijos de sección que se salen de ella y pisan otra;
- (c) `COMPONENT` / `COMPONENT_SET` fuera de `02 Componentes`, con su número de instancias;
- (d) secciones vacías o con nombre duplicado;
- (e) frames «Nuevo» / «Propuesta» sueltos;
- instancias sin componente principal (rotas) y enlaces de cada Índice.

Para saber quién creó cada cosa y dónde debía ir se cruzaron los ids con `docs/design/*.md`
(`FACTURA-VENTA-FORMULARIO-V2.md`, `AUTH-ACCESO-V2.md`, `FINANZAS-DOCUMENTOS-V2.md`, entre otros).

## Hallazgos y correcciones

| # | Página | Node-id | Nombre | Qué es | Dónde debía estar / origen | Corrección |
|---|---|---|---|---|---|---|
| 1 | 01 Sistema | `1031:45` | `Estado=cerrado` | COMPONENT suelto, 0 instancias | Copia de la variante del set `ImpuestosLinea` `1032:32779` (02 Componentes › «Finanzas — Formulario de documento: venta y compra (Nuevo)»), `FACTURA-VENTA-FORMULARIO-V2.md` §5.2 | Movido a 99 Archivo › «Retirados de otras páginas — limpieza 2026-09-29» y renombrado `_Retirado · ImpuestosLinea (copia suelta) · Estado=cerrado` (el `_` evita que se publique) |
| 2 | 01 Sistema | `1031:88` | `Estado=abierto` | COMPONENT suelto, 0 instancias (el «Estado abierto» visible en la captura) | Ídem | Ídem |
| 3 | 01 Sistema | `1031:96` | `Estado=sin-impuesto` | COMPONENT suelto, 0 instancias | Ídem | Ídem |
| 4 | 01 Sistema | `1139:747884` | `TarjetaAcceso` | INSTANCE (Ancho=Móvil) con el selector de organización relleno: buscador y dos filas de organizaciones de ejemplo, una con badge «Principal» | Resto del Acceso v3 (`AUTH-ACCESO-V2.md` §11; ids 1139:7479xx). Las pantallas de 08 › «18. Acceso v3» ya tienen sus propias instancias | Movido a 99 Archivo › «Retirados…» con nota. Ya no está en 01 Sistema |
| 5 | 01 Sistema | `1139:747973` | `OrgSelectCard` | INSTANCE (Estado=congelada) con una organización de ejemplo | Ídem. El componente vive en 02 Componentes › Acceso (`351:137969`) | Ídem |
| 6 | 01 Sistema | `6:2` | `Documentación` | FRAME del sistema (paleta, tipografía, espaciado, radios, elevación, isotipo) suelto en el primer nivel | Contenido propio de la página: faltaba la sección | Envuelto en la sección nueva «Sistema de diseño — variables, tipografía, espaciado, radios y elevación» (`1170:744206`) |
| 7 | 01 Sistema | `16:1075` | `Léeme` | FRAME suelto en el primer nivel | Ídem | Envuelto en la sección nueva «Léeme y reglas de trabajo» (`1170:744207`); se le añadieron las reglas (ver abajo) |
| 8 | 07 Finanzas | `1016:88880` | `Tarjeta · Pasos para activar` | FRAME suelto en (0, 0), encima del Índice; ancho colapsado a 185 px | Construcción fallida de «Finanzas — Documentos v2 (propuesta)» `1016:88299`; la buena es `1018:90376` (752 px) dentro de la sección | Movido a 99 Archivo › «Retirados…» |
| 9 | 07 Finanzas | `1016:89445` | `Tarjeta · Resoluciones y numeración` | FRAME suelto, 255 px | Ídem; la buena es `1018:91198` | Ídem |
| 10 | 07 Finanzas | `1022:93176` | `Líneas acreditadas` | FRAME suelto, 102 px | Ídem; la buena es `1023:94973` | Ídem |
| 11 | 07 Finanzas | `1020:91999` | `CustomerPicker` | INSTANCE suelta (popover, idle), sin pantalla que la use | Instancia de prueba del mismo trabajo (ids 1020, bloque Saldos a favor) | Ídem |
| 12 | 07 Finanzas | `264:98924` / `195:12716` | `Índice` / `Impuestos` | Solape entre secciones: el texto del Índice (2.714 × 1.036) se salía de su sección (1.386 × 1.028) y pisaba «Impuestos» | Índice que creció con cada agente | Índice reconstruido (1.702 × 772, termina antes de y = 896). 0 solapes |
| 13 | 02 Componentes | `724:18240`, `724:64495`, `724:64704` | `PhoneInput`, `PhoneCountryRow`, `PhoneCountryPopover` | Sets que se salían de su sección «Teléfono — PhoneInput (Nuevo)» `717:17024` (400 px de alto) y pisaban «Finanzas — Documentos (Nuevo)» `729:17880` | Su sección, que nunca se agrandó | Sección movida a x = 6.000 (mismo y) y agrandada a 2.400 × 1.870. Sin cambios en los componentes ni en sus instancias |
| 14 | 03 Navegación y shell | `642:25956` (11 frames hijos) | «Inicio — Dashboard por módulo (propuesta)» | La sección medía 4.000 × 3.000 y sus frames llegaban a x = 9.520, y = 39.025; cinco pisaban «GO Asistente — escritorio (propuesta)» `667:34452` | La misma sección | Sección agrandada a 9.600 × 6.705; «GO Asistente — escritorio» bajada de y = 36.000 a y = 39.400 |
| 15 | 03 Navegación y shell | `341:57756` | «Anotación · hoja con scroll» | TEXT que se salía 10 px de «Móvil — sesión» | Ídem | Sección a 2.680 de ancho |
| 16 | 08 Acceso y organización | `832:538100` | Nota «Móvil y PWA instalada…» | TEXT fuera de «16. Arranque de la app (Nuevo)» | Ídem | Sección a 5.860 de ancho |
| 17 | 11 CRM | `773:472975` | «Acciones rápidas — qué hace cada botón» | FRAME que se salía por abajo de «CRM — Leads, actividades y acciones rápidas» | Ídem | Sección a 9.551 de alto |
| 18 | 99 Descartes | `165:4188` | «Descartes — productos y POS (tanda 4)» | FRAME suelto en el primer nivel | Página de descartes, sin sección | Envuelto en la sección «Descartes — productos y POS (tanda 4)» (`1170:744208`) |
| 19 | 99 Descartes | `502:18` … `502:25` | «DESCARTADO · 01…08 · Editor …» | 8 FRAME sueltos del editor web descartado | Ídem | Envueltos en la sección «Editor web — pantallas descartadas (01–08)» (`1170:744209`), misma rejilla |

**Nada se borró.** Los 9 restos (filas 1–5 y 8–11) quedaron en `99 Archivo — versiones anteriores` ›
«Retirados de otras páginas — limpieza 2026-09-29» (`1170:744194`, x = 10.400), cada uno con su etiqueta
(id, nombre, página de origen) y una nota que explica por qué sobran. Ninguno tenía instancias ni lo usaba
una pantalla, así que se pueden borrar cuando el dueño lo decida.

### (c) Componentes fuera de 02 Componentes que se dejan donde están

Están documentados a propósito en su página; se respetan y no se abren nuevos:

| Página | Sección | Sets / componentes | Documento |
|---|---|---|---|
| 03 Navegación y shell | «Componentes — Inicio (Nuevo)» | `TarjetaHoy`, `ChipModulo`, `FilaModulo`, `SelectorPeriodo` (4) | `PARIDAD-DASHBOARD-INICIO.md` |
| 04 Inventario | «Componentes — Etiquetas y categoría (Nuevo)» · «Componentes — Recetas y subsecciones (Nuevo)» | `QuickCategoryForm` + 8 de recetas y subsecciones (9) | `PARIDAD-ETIQUETAS-CATEGORIA.md`, `PRODUCTO-RECETAS-Y-SUBSECCIONES.md` |
| 05 POS y ventas | «Cabecera y caja» · «Componentes — Mesas y promociones» | 5 diálogos de caja + 8 de mesas y promociones (13) | `PARIDAD-PERFIL-CAJAS.md`, `PARIDAD-MESAS-PROMOCIONES.md` |
| 09 Documentos | «Componentes — Documentos» · «Componentes — Etiquetas (Nuevo)» | `Doc/*` (9) | `DOCUMENTOS-PDF.md`, `PARIDAD-ETIQUETAS-CATEGORIA.md` |
| 10 Configuración | «Componentes — Configuración (Nuevo)» | `SettingRow`, `SettingsSaveBar`, `SecretField`, `ConfigNav`, `ConfigSearchCommand` (5) | `PARIDAD-CONFIGURACION.md` |
| 99 Descartes / 99 Archivo | secciones de descartes y retirados | 9 + 3 | son descartes |

### (d) Secciones vacías o duplicadas

Ninguna, antes ni después. (En 08 hay dos secciones que empiezan por «16.»: «Ubicación del dispositivo» y
«Arranque de la app». Son distintas; no se renombraron para no romper referencias de otros documentos.)

### (e) Frames «Nuevo» / «Propuesta» sueltos

Ninguno fuera de su sección, aparte de los de la tabla.

## Índices

Estado antes:

| Página | Entradas | Enlaces | Problemas |
|---|---|---|---|
| 03 | 11 de 14 secciones | 0 | Faltaban «Inicio — Marcar turno», «Dashboard por módulo» y «GO Asistente — escritorio» |
| 04 | 16 de 51 | 1 | Faltaban las columnas x = 13.000, 22.000, 42.000, 62.000, 76.000 (35 secciones) |
| 05 | 28 líneas para 35 secciones | 3 | Dos columnas de texto encimadas; «19.» repetido; entrada «20. Mesas — plano y detalle», sección que ya estaba en 99 Archivo |
| 06 | 4 de 4 | 0 | Sin enlaces |
| 07 | 25 de 27 | 2 | Faltaban «Contabilidad v2» y «Documentos v2»; salto del 22 al 24; el texto se salía y pisaba «Impuestos» |
| 08 | 18 de 19 | 2 | Numeración del índice distinta de la de las secciones |
| 09 | 16 de 16 | 16 | Correcto |
| 10 | 10 de 10 | 0 | Sin enlaces; lista partida en dos textos |

Corrección: cada Índice se reconstruyó con el mismo formato. Lleva el título «Índice — <página>» con el estilo
de título del Léeme, una línea que explica cómo leerlo y una entrada **enlazada** por sección (hipervínculo
a su node-id, subrayado). Las entradas van agrupadas por columna del lienzo («Columna principal (x = 0)»,
«Columna x = 14.000»…) y de arriba abajo, en columnas de texto que no bajan de la primera sección. Las notas
útiles de los índices viejos (componentes compartidos en 04 y 07, descripciones de Tesorería y Facturas v2
en 07, fuentes de verdad en 10) se conservaron como notas al lado. En 03–07 y 09 se numera por posición.
En 08 y 10 se deja la numeración que ya traen las secciones en su nombre.

Resultado: 03 14/14 · 04 51/51 · 05 35/35 · 06 4/4 · 07 27/27 · 08 18/18 (+1 enlace a la sección archivada) · 09 16/16 · 10 10/10 (enlaces
por secciones). 0 enlaces rotos, 0 duplicados, ningún Índice pisa otra sección.

Edición concurrente: mientras se hacía esto, otra sesión archivó «17. Acceso (auth) v2» (ahora en
`99 Archivo`, `1073:675594`) y reescribió las últimas líneas del Índice de 08, con lo que se corrieron los
enlaces. Se volvieron a aplicar línea por línea sin cambiar su texto. La entrada 17 enlaza a la sección
archivada; es el único enlace del Índice de 08 que sale de la página, y es intencional.

11 CRM (2 secciones), 12 PM y tareas y 13 Membresías (1 sección cada una) no tienen Índice: con una o dos
secciones no hace falta. Si alguna crece, se le añade siguiendo la regla 6.

## Reglas para agentes en este archivo

Quedaron escritas en `01 Sistema` › «Léeme y reglas de trabajo» › Léeme, bloque «Reglas para agentes en
este archivo (2026-09-29)» (`1170:744277` / `1170:744278`):

1. Todo frame nuevo va dentro de una SECTION propia, en la página correcta. Primero se crea la sección y
   luego se construye dentro de ella, nunca en la página activa por defecto.
2. Nada suelto en el primer nivel de una página: ni instancias, ni frames, ni grupos, ni textos. En el
   primer nivel solo hay SECTION, incluido el «Índice».
3. Componentes nuevos solo en `02 Componentes`, dentro de la sección de su familia. Las secciones de
   componentes documentadas en 03, 04, 05, 09 y 10 se respetan, pero no se abren nuevas.
4. Sin solapes: ni entre secciones ni hijos que se salgan de su sección. Si una sección crece, se agranda y
   se corre hacia abajo la siguiente.
5. No dejar instancias de prueba ni construcciones fallidas. Si algo sobra y hay duda, se mueve a
   `99 Archivo — versiones anteriores` con una nota.
6. Toda sección nueva lleva su entrada enlazada en el Índice de la página, en su columna y en orden.
7. Chequeo al terminar, por script: 0 nodos de primer nivel que no sean SECTION, 0 solapes entre
   secciones, 0 hijos fuera de su sección, 0 instancias sin componente principal y 0 componentes nuevos
   fuera de 02. El resultado se anota en el `.md` del trabajo.

## Chequeo final (script, 2026-09-29)

Top = hijos de primer nivel de la página. Sueltos = los que no son SECTION. Desbordes = hijos de sección
que se salen de ella. Instancias = instancias de nivel superior (las que no están dentro de otra
instancia). Rotas = instancias sin componente principal.

| Página | Top antes → después | Sueltos antes → después | Solapes entre secciones | Desbordes | Instancias antes → después | Rotas |
|---|---|---|---|---|---|---|
| 01 Sistema | 7 → 2 | 7 (2 intencionales) → 0 | 0 → 0 | 0 → 0 | 19 → 7 | 0 → 0 |
| 02 Componentes | 40 → 40 | 0 → 0 | 0 → 0 | 3 → 0 | 6.910 → 6.910 | 0 → 0 |
| 03 Navegación y shell | 15 → 15 | 0 → 0 | 0 → 0 | 12 → 0 | 1.312 → 1.312 | 0 → 0 |
| 04 Inventario | 52 → 52 | 0 → 0 | 0 → 0 | 0 → 0 | 12.319 → 12.319 | 0 → 0 |
| 05 POS y ventas | 36 → 36 | 0 → 0 | 0 → 0 | 0 → 0 | 10.061 → 10.061 | 0 → 0 |
| 06 Clientes | 5 → 5 | 0 → 0 | 0 → 0 | 0 → 0 | 977 → 977 | 0 → 0 |
| 07 Finanzas | 32 → 28 | 4 → 0 | 1 → 0 | 1 → 0 | 6.428 → 6.424 | 0 → 0 |
| 08 Acceso y organización | 20 → 19 (*) | 0 → 0 | 0 → 0 | 1 → 0 | 2.963 → 2.182 (*) | 0 → 0 |
| 09 Documentos | 17 → 17 | 0 → 0 | 0 → 0 | 0 → 0 | 423 → 423 | 0 → 0 |
| 10 Configuración | 11 → 11 | 0 → 0 | 0 → 0 | 0 → 0 | 340 → 340 | 0 → 0 |
| 11 CRM | 2 → 2 | 0 → 0 | 0 → 0 | 1 → 0 | 2.696 → 2.696 | 0 → 0 |
| 12 PM y tareas | 1 → 1 | 0 → 0 | 0 → 0 | 0 → 0 | 598 → 598 | 0 → 0 |
| 13 Membresías | 1 → 1 | 0 → 0 | 0 → 0 | 0 → 0 | 476 → 476 | 0 → 0 |
| 99 Descartes | 21 → 14 | 9 → 0 | 0 → 0 | 0 → 0 | 1.515 → 1.515 | 0 → 0 |
| 99 Archivo — versiones anteriores | 1 → 3 (*) | 0 → 0 | 0 → 0 | 0 → 0 | 485 → 1.288 (*) | 0 → 0 |

(*) Parte del cambio en 08 y 99 Archivo es de otra sesión que trabajaba en paralelo: archivó «17. Acceso
(auth) v2» y con ella se fueron 781 instancias. Esta limpieza solo añadió la sección «Retirados…».

Totales después: **0** nodos de primer nivel sueltos (no quedan intencionales: el sistema y el Léeme ya
tienen sección), **0** solapes entre secciones, **0** hijos fuera de su sección, **0** instancias rotas,
**0** secciones vacías o duplicadas y **0** componentes fuera de 02 que no estén documentados.

Capturas de 01 Sistema antes y después: se revisaron en la sesión; el antes coincide con la captura del dueño.
El después muestra solo las dos secciones «Sistema de diseño…» y «Léeme y reglas de trabajo».
