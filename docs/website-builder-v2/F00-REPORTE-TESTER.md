# F00 — Reporte del tester

Fecha de ejecución: 2026-09-19, zona horaria America/Bogota. Estado: **línea base y verificaciones documentales terminadas; F00 completa pendiente**. Este reporte no aprueba F00 ni acredita seguridad de un despliegue.

## Alcance y protección

Se verifica la línea base local de `go-admin-erp` y `goadmin-websites`, antes de implementar Website Builder V2. Ambos árboles contienen trabajo ajeno; no se corrigen sus fallos, no se revierten cambios y no se modifica la base de datos.

Las ejecuciones de Node usan un preload temporal que impide salida mediante `fetch`, HTTP/HTTPS, TCP y UDP. Solo permite los hosts públicos de fuentes `fonts.googleapis.com` y `fonts.gstatic.com`, necesarios para compilar. Se comprobó el rechazo de `fetch`, HTTPS y TCP antes de lanzar las suites. `NEXT_TELEMETRY_DISABLED=1`. Los logs y el preload permanecen fuera del repositorio, en `%TEMP%/goadmin-website-f00-20260919/`.

El registro final del guard contiene siete rechazos antes de conectar: tres autotests, un intento a Supabase desde un proceso de prueba y tres intentos a Supabase durante el build websites. No se atribuye la llamada de Jest a una suite concreta sin evidencia adicional ni se presenta como prueba live exitosa. El stack del build websites apunta a `app/api/debug/auth-test/route.ts` y `signInWithPassword`: la compilación puede evaluar esa ruta de depuración, aunque no se solicite abrirla. El bloqueo impidió el tráfico de autenticación. No se inspeccionaron ni publicaron los valores de sus argumentos.

No se ejecutan peticiones a checkout, pedidos, reservas, pagos, autenticación o webhooks reales. No se ejecuta `verify:tracking`, porque su implementación REST no respeta el requisito de acceso exclusivo a BD mediante MCP. Las verificaciones live omitidas por las propias suites permanecen omitidas.

## Línea base ejecutada

| Comprobación | Resultado actual | Evidencia local |
|---|---|---|
| ERP Jest, dos workers | 359 suites pasan, 1 falla, 1 omitida; 6.666 casos pasan, 2 fallan, 8 omitidos; 230,493 s | `erp-jest.log`, `erp-jest.json` |
| ERP guardrails, dentro de la suite anterior | 91/91 casos pasan | Suite `src/__tests__/guardrails.test.ts`, registrada en `erp-jest.json` |
| ERP TypeScript, sin caché incremental | Proceso agotó el heap predeterminado; salida 134, sin completar comprobación | `erp-tsc.log` |
| ERP TypeScript, segundo intento | Salida 0, heap 8 GB y caché incremental en TEMP | `erp-tsc-8gb.log` |
| ERP Next build | Salida 0 en copia temporal aislada; compilación 6,1 min y 335 páginas generadas | `erp-build-isolated.log` |
| Websites TypeScript | Salida 0 | `websites-tsc.log` |
| Websites Next build | Salida 0 en copia temporal aislada; 48 páginas generadas, con conexiones de depuración bloqueadas | `websites-build-isolated.log` |

Los comandos usan los binarios ya instalados en `node_modules`, equivalentes a `npx jest`, `npx tsc` y `npx next`, sin descargar paquetes. En TypeScript se cambia únicamente la ubicación de la caché o se desactiva; no se alteran los archivos incluidos ni los diagnósticos exigidos.

El build ERP omite TypeScript y ESLint por configuración existente del repositorio; no se interpreta como sustituto del typecheck independiente ni se reporta lint exitoso. Se observaron advertencias previas de `swcMinify` no reconocido y del `runtime` reexportado de un webhook CRM. La compilación aislada completada no añadió intentos al registro de conexiones bloqueadas.

Websites compiló con advertencias de API Node en Edge Runtime y datos de Browserslist antiguos. Su salida 0 acredita compilación bajo el bloqueo descrito, **no** autenticación real ni lectura funcional de producción. El log muestra el error esperado `F00_NETWORK_BLOCKED` durante prerender de la ruta de depuración; no se ocultó para declarar un build sin advertencias.

**Incidencia de aislamiento local:** el primer intento de build ERP utilizó `.next-desktop`, que ya contenía artefactos de otro trabajo, y lo regeneró parcialmente. Se había comprobado que no había un proceso usándolo, pero eso no justificaba reutilizar su salida. El tester detuvo su proceso y conservó el log (`erp-build.log`, salida interrumpida -1); ese intento no cuenta como pass. Se inició una compilación nueva desde una copia en TEMP, con fuentes/configuración copiados y dependencias existentes enlazadas, salida propia y sin `NEXT_DIST_DIR`. No se detuvo el `next dev` del usuario ni se modificaron fuentes o conexiones productivas. El contenido previo de `.next-desktop` no se restauró y no se afirma integridad de ese artefacto generado.

## Fallos y límites detectados

1. **Contrato de secciones, fallo previo:** `src/lib/services/website/__tests__/sectionContract.test.ts` mantiene dos casos fallidos. El fixture local del manifiesto no declara `product_specs`, `product_faq` y `product_shipping`; tampoco reconoce las variantes heredadas `categories_grid:grid`, `categories_grid:horizontal` y `categories_grid:icons` como incorporadas al catálogo. El contraste fuente confirma los tres tipos de producto en `components/sections/SectionRenderer.tsx:390` del proyecto websites y ausencia en el fixture ERP. Por ello el primer fallo señala desfase del fixture; no demuestra que las páginas actuales hayan dejado de renderizar. Los aliases existentes siguen siendo parte del contrato a conservar.
2. **Memoria del verificador:** la primera ejecución de TypeScript ERP agotó el heap. La repetición con límite de 8 GB terminó con salida 0, sin modificar el alcance del proyecto. Se conserva evidencia de ambas ejecuciones.
3. **Pruebas live no realizadas:** una integración de correo y siete verificaciones CRM dependientes de privilegios de BD no se ejecutaron. No se presentan como comprobaciones exitosas de producción.

## Verificación de la entrega F00-A

Entrega: [inventario de consumidores](F00-INVENTARIO-CONSUMIDORES.md) y [captura estática](F00-INVENTARIO-ESTATICO.json). Se ejecutó un verificador independiente en Python, fuera del repositorio, contra los bytes actuales de ambos proyectos.

**150 comprobaciones pasan; cero fallos después de la corrección.** Evidencia: `verify-inventory.py` y `verify-inventory.json` en el directorio TEMP indicado arriba.

- Se reprodujeron los alcances de búsqueda: 4.496 archivos ERP y 407 websites; 15 archivos/138 líneas ERP y 37 archivos/122 líneas websites con los tokens auditados. Se compararon las rutas, cada línea, cada token y todas las líneas `.single()`/`.maybeSingle()` registradas, no solo los totales.
- Se verificaron 42 hashes SHA256, tamaños y estados Git limpios: 11 ERP y 31 websites. Coinciden ambos HEAD. Los siete archivos de webhooks están incluidos.
- Se verificaron enlaces relativos, rutas fuente y rangos de línea de las referencias completas; JSON/Markdown UTF-8 sin NUL.
- Se ejecutaron controles negativos en memoria: hash falso, ruta inexistente y línea sin el token esperado. Se detectaron sin alterar ningún archivo productivo.
- La primera revisión detectó cinco referencias abreviadas de preview y la ausencia del hash de carrito. El builder normalizó las rutas y añadió únicamente ese archivo al inventario, conservando las 41 huellas anteriores. La segunda ejecución confirma las correcciones.

Estos controles prueban la fidelidad y reproducibilidad de la captura local. No demuestran por sí solos funcionamiento visual, compatibilidad de un despliegue ni ausencia de errores anteriores.

Los mismos 42 archivos protegidos se comprobaron después en las copias temporales usadas para compilar: 42/42 idénticos al inventario, evidencia `isolated-copy-hashes.json`.

Al terminar ambos builds se volvieron a comparar los archivos fuente originales: **42/42 hashes y tamaños intactos**, evidencia `final-source-hashes.json`. No quedaron procesos propios de Jest, TypeScript o Next build; el `next dev` del usuario continuó activo. Se conservaron copias y logs TEMP.

## Verificación documental de F00-C

Se contrastaron [el esquema y la recuperación](F00-ESQUEMA-Y-RECUPERACION.md), [su evidencia JSON](F00-BD-LECTURAS.json), [ADR-001](ADR-001-ADICIONES-SIN-ALTERAR-LEGACY.md), el plan maestro y F02/F03. **87 comprobaciones pasan; cero fallos.** Evidencia local: `verify-f00-c-docs.json`.

Se comprobó consistencia interna de 8 esquemas, 39 constraints, 19 índices, 57 pares de sección, 37 tipos y 1.944 usos; nombres de columnas y pares sin duplicados; tres UNIQUE históricos por nombre/definición; validez registrada de índices; aliases de categorías; 89 sucursales y cero publicadas; cero discrepancias de scope. Se validaron enlaces y UTF-8 de los documentos disponibles en esta ejecución.

El tester no repitió las consultas MCP del orquestador. Esta prueba valida coherencia de los artefactos recibidos, no constituye una segunda inspección independiente de producción. El respaldo, retención y restauración permanecen expresamente pendientes; tampoco se equipara la comprobación SQL de tracking sin filas con una prueba HTTP real.

Después de la ampliación de evidencia se ejecutaron **7 controles adicionales, todos exitosos**: siete resultados de conteo, lectura anon agregada sin exportar contenido, resultado Storage acotado, tracking con 21 columnas y cero filas leídas/sin HTTP, y recuperación de un outlet existente solo en V2 en F02/F03/ADR. Evidencia: `verify-f00-c-additions.json`.

La nota suplementaria de plantillas se contrastó con los fuentes locales: **10/10 condiciones estáticas coinciden** (`verify-template-finding.json`). La organización procede del body; no aparece una compuerta local de contexto/permisos; el servicio prefiere admin, actualiza settings y elimina páginas por organización; las inserciones no forman una RPC transaccional y un fallo de página continúa. El middleware descarta el resultado de `getUser`. No se llamó al endpoint, no se consultó BD para esta prueba y no se verificó la exposición del despliegue. Es evidencia de un hallazgo, no aprobación de seguridad del endpoint ni corrección aplicada.

## Verificación documental de F00-B

Entrega: [fichas de referencias](F00-FICHAS-REFERENCIAS.md). **262 comprobaciones pasan; cero fallos**, registradas en `verify-f00-b-docs.json`.

Se comprobaron las 32 fichas secuenciales, 32 orígenes distintos correspondientes a la matriz original, fuentes enlazadas y campos Observado/Móvil/Reutilización/Pendiente en cada ficha; identificadores dentro de los 105 patrones del catálogo y fases dentro de 00–13. El documento declara expresamente la cobertura parcial de rutas, menús, footers y viewports, y la ausencia de operaciones comerciales ejecutadas.

No se repitió la navegación del builder ni se verificó la calidad visual de las capturas de su sesión. Esta prueba acredita estructura, trazabilidad y límites declarados; no convierte 32 fichas en una auditoría visual exhaustiva ni 105 patrones propuestos en componentes implementados.

## F00-B2 — Inspección visual independiente de capturas

Estado: **muestras B2a/B2b/B2c verificadas; cobertura exhaustiva pendiente**. Los builders navegaron las referencias públicas en sesiones separadas. El tester no controló esas sesiones: comprobó metadatos y abrió las capturas con `view_image`. Ver una pareja de estados corrobora su contenido visible, pero no equivale a repetir la acción, verificar teclado/foco o probar el backend de una demo.

### Primer bloque: cuatro prioridades

Manifiesto: `%TEMP%/goadmin-f00-b2-agent-browser/manifest-prioridades.json`. Contiene 27 PNG de PayGin, Latte, ScanEats y Luna Rossa. **191/191 comprobaciones pasan:** rutas dentro del directorio de evidencia, firma PNG, dimensiones reales, coincidencia con viewport solicitado, SHA256, URL pública, anotaciones y UTF-8 sin NUL ni U+FFFD. Evidencia del tester: `%TEMP%/goadmin-website-f00-20260919/verify-b2-priorities.json`.

Se abrieron realmente **14 de las 27 imágenes**. No se presenta el resto como inspeccionado visualmente por el tester.

| Referencia | Capturas inspeccionadas | Resultado y límite |
|---|---|---|
| PayGin | `mobile-top`, `desktop-footer`, `desktop-contact` | Hero móvil con fotografía, título, formulario y dispositivos visible; no aparece el header de inicio. Footer de cuatro columnas y header/formulario de contacto concuerdan con anotaciones. No se verificó menú ni envío. |
| Latte | `mobile-top`, `mobile-menu-open`, `mobile-footer-contact` | Antes/después muestra hamburguesa y overlay con Menu/News/contacto/redes. La toma de footer tiene menú cerrado y horarios/mapa; el header se superpone al título, como declara el builder. No se verificó cierre por Escape, foco ni todas las partes del footer. |
| ScanEats | `mobile-top`, `mobile-menu-open`, `mobile-catalog`, `mobile-drink`, `desktop-footer` | Overlay distinto del inicio; All Menu y Drink presentan resultados diferentes y Drink aparece activo con dos bebidas. El hero inicial muestra scroll interno horizontal y vertical. Footer de escritorio conserva columna estrecha sobre patrón. No se ejecutaron pedidos, reservas o suscripciones. |
| Luna Rossa | `mobile-menu-open`, `mobile-menu-closed`, `desktop-footer-final` | Menú abierto con 13 enlaces; cerrado aún conserva fragmento HOMEPAGE bajo el header, por lo que cierre estable sigue pendiente. Footer de escritorio presenta páginas, artículos, contacto y mapa; anotación coincide. |

Las imágenes examinadas concuerdan con los límites declarados. Esta muestra todavía no cubre las 32 referencias, todos sus menús, footers, internas o tamaños. No se mide contraste ni se certifica accesibilidad a partir de la apariencia de una captura.

### Segundo bloque: Hotellia y BetheWind

Manifiesto: `%TEMP%/goadmin-f00-b2-hotel/manifest.json`, corte inicial de 17 capturas de estas dos referencias. **138/138 comprobaciones de metadatos pasan**: firma/dimensiones PNG, viewport solicitado y reportado, hash, URL, rutas y snapshots de soporte. Evidencia: `verify-b2-hotel-first.json` en el directorio TEMP del tester. Se abrieron realmente **8 capturas**.

- Hotellia: `home-mobile`, `menu-mobile`, `menu-closed-mobile` e `internal-desktop`. Los estados concuerdan con apertura/cierre y la carta interna conserva la marca del hotel. En la toma abierta, RESERVE todavía aparece borroso; se pidió una captura estable o declarar ese límite antes de acreditar el estado final.
- BetheWind: `menu-mobile`, `menu-escape-mobile`, `menu-closed-mobile` y `booking-anchor-desktop`. Las dos primeras muestran menú abierto y la tercera lo muestra cerrado, coherentes con la acción anotada por el builder. El tester no repitió Escape ni certifica manejo del foco. La ancla muestra un formulario de solicitud de disponibilidad, sin datos introducidos; no se cuenta como página interna independiente ni reserva confirmada.

Se solicitó que acciones y observaciones quedaran en el manifiesto o documento por estado, además de las dimensiones/URL: el mensaje del builder permite interpretar este bloque, pero no debe ser la única trazabilidad persistente.

### Tercer bloque: Nestria, Volt y Elian Valen

Manifiesto: `%TEMP%/goadmin-f00-b2-agent-browser/manifest-comercio-parcial.json`. **142/142 controles de metadatos pasan** sobre 20 PNG; evidencia `verify-b2-commerce.json`. Se abrieron realmente **13 capturas**.

- Nestria: tríptico de menú móvil cerrado/abierto/cerrado, Specification de producto y footer de escritorio. El panel tiene cinco enlaces y se contrae; tras cerrarlo el header aparece blanco, mientras al inicio se superpone a la fotografía. Specification presenta dimensiones legibles y footer cuatro columnas/marca grande. No se acredita que el aspecto exacto del header vuelva al inicial ni se accionaron compras.
- Volt: tríptico del menú, dos imágenes de galería y footer de escritorio. La segunda imagen presenta perfil lateral y cambia el borde de miniatura seleccionado. Menú de categorías/cuenta excede la altura del viewport; footer tiene cinco columnas y badges de la demo cubren parte del extremo derecho, como declara el builder. No se probaron todas las categorías, compra, cuenta o newsletter.
- Elian Valen: opciones de producto móvil y footer de escritorio. Se observan tallas independientes de dos prendas, cantidad y acordeones; header móvil de varias filas y marca grande en footer. Las capturas no prueban selección de tallas, stock ni venta.

Las 13 observaciones concuerdan con las anotaciones recibidas. El tester no afirma haber visto las otras siete imágenes del bloque.

### Cuarto bloque: MĒR y corrección de Hotellia

Se abrieron siete PNG de MĒR en el directorio de evidencia hotelera: `internal-mobile`, `drinks-mobile`, `internal-desktop`, `drinks-desktop`, `menu-mobile`, `menu-closed-mobile` y `footer-desktop`. Las parejas de carta muestran cambio de servicio, horario, subcategorías y productos; desktop usa varias columnas y móvil apila. El menú móvil abierto aparece recortado por el borde izquierdo, coherente con el límite declarado por el builder; el estado cerrado recupera la portada tipo recibo. La captura llamada `internal-drinks-mobile`, que el builder identificó como exploratoria mal nombrada, no se usa como evidencia de bebidas. El manifiesto final de este bloque queda pendiente.

Se volvió a abrir `hotellia-menu-mobile.png`: ahora RESERVE aparece nítido junto con los otros tres enlaces. **Límite de trazabilidad:** el builder había sobrescrito esa ruta antes de recibir la solicitud de conservar la captura inicial con otro nombre. La toma borrosa está registrada en la inspección anterior, pero no permanece como archivo independiente; el manifiesto final debe identificar el nuevo hash. No se afirma conservación de ambos PNG. Para futuras recapturas se solicitó nombre distinto.

### Quinto bloque: All Natural y Ecom

Entrega del coordinador como builder, verificada por este tester independiente: `%TEMP%/goadmin-f00-b2-root-commerce/manifest-primeros-dos.json`. **149/149 controles pasan** sobre 21 PNG; evidencia `verify-b2-root-commerce-first.json`. Se abrieron realmente **12 capturas**.

- All Natural: menú abierto, subnivel Products, estado cerrado, dos imágenes de producto y footer de escritorio. El subnivel agrupa Shop/Category/Type y tarjetas; el cierre devuelve home. En la galería cambia envase por textura y se mueve el indicador. No se atribuye el cambio del hero al cierre del menú: el builder declara reproducción automática. El footer incluye marca, cuatro grupos, pagos y newsletter fotográfico; sin prueba de envío.
- Ecom: menú abierto, subnivel Shop, captura posterior a Escape, filtros antes/después de Men y footer de escritorio. El estado posterior muestra home, sin certificar foco. Men seleccionado coincide con contador 1, control Clear y productos diferentes en el grid. El footer negro con grupos/newsletter/pagos concuerda. No se accionó Clear, no se probaron filtros móviles ni se equipara el aspecto del catálogo con una venta funcional.

Las 12 capturas son consistentes con sus anotaciones. No se cuentan popups descartados por el builder como capturas válidas de footer, ni las otras nueve imágenes como vistas por el tester.

### Sexto bloque: cierre B2c con Leafore

Se verificó el manifiesto final de comercio adicional: `%TEMP%/goadmin-f00-b2-root-commerce/manifest-final.json`. **240/240 controles pasan** sobre 31 PNG, incluidos los hashes intactos de los primeros 21; evidencia `verify-b2-root-commerce-final.json`. Se abrió una muestra adicional de **9 de las 10 capturas de Leafore**: menú abierto/post-Escape/cerrado, producto móvil/segunda imagen/escritorio, ambos footers y hero de escritorio. Sumadas a las doce anteriores de All Natural/Ecom, son 21 imágenes distintas vistas por este tester en B2c.

La pareja posterior a Escape conserva el panel translúcido abierto y añade contorno al cierre; el tercer estado muestra la portada sin panel. La galería cambia envase por retrato y el segundo indicador queda activo. Las URL del manifiesto conservan `#image-1`, de acuerdo con el límite declarado; no se infiere sincronización entre hash y foto. En escritorio se observan dos columnas, controles de tamaños/cantidad y acordeones sin afirmar que se probaron. Ambos footers muestran el panel translúcido sobre hojas, navegación, newsletter y pagos; badges cubren parte de las redes en móvil. El hero de escritorio tiene las dos mitades descritas.

Se contrastó [el documento B2c](F00-B2-COMERCIO-ADICIONAL.md): enlaces locales existentes, UTF-8 correcto, referencias al catálogo y límites expresos. Esta prueba no repite las acciones del builder ni acredita ventas, foco, teclado completo o todas las rutas. La sesión del builder figura cerrada; este tester no operó su navegador.

**Robustez B2c: 9,6/10, limitada a evidencia y observaciones de las tres referencias en los estados declarados.** Los recortes incompletos de footer móvil, controles no ejercitados, fallo de Escape y ausencia de tablet quedan abiertos. No equivale a aprobación de accesibilidad ni cobertura visual exhaustiva de las 32 referencias; la QA de esta entrega corresponde a un agente distinto de su autor.

### Séptimo bloque: ocho referencias complementarias y cierre B2a

El manifiesto `manifest-complementarias.json` contiene 48 PNG y pasa **338/338 controles**; evidencia `verify-b2-complementarias.json`. El tester abrió **28 capturas distintas** de ese bloque, enumeradas en `verify-b2-builder-a-final.json`. La unión final de B2a tiene 95 PNG de 15 orígenes, conserva íntegros los tres manifiestos entregados y sus hashes actuales coinciden.

| Referencia | Capturas vistas de este bloque | Resultado comprobado y límite |
|---|---:|---|
| Arum | 3 | Menú crema con grupos e imagen frente a portada cerrada; detalle de producto con tamaños y acordeones. No se probaron esas opciones comerciales. |
| Qitchen | 3 | Overlay oscuro con cinco enlaces frente a About cerrado; foto izquierda y mosaico/barra final de escritorio. El contorno visible no prueba por sí solo el manejo completo de foco. |
| Bramble | 4 | Apertura/cierre móvil coherente; reserva muestra icono de contenido fallido, sin formulario operativo; footer desktop solo platos/marca/legal. No se atribuye el error a todos los visitantes. |
| Scalable | 3 | Panel de enlaces/CTA abierto y hero recuperado al cerrar; footer con CTA grande y barra final. Pages de escritorio continúa sin probar. |
| Riteora | 3 | Inicio y página de carta diferentes; no aparece hamburguesa en estos recortes. Footer desktop muestra contacto, navegación y redes. No se equipara el CTA comercial con un menú de navegación. |
| Coffee GR8R | 3 | Cinco enlaces/CTA en apertura y hero cerrado; interna de sedes muestra solo título e ilustración. Las tarjetas de sedes no quedan verificadas por esa captura. |
| Deux Bakery | 3 | Panel abierto frente a hero cerrado; ficha de carta con precio/unidad y tabla. El texto describe chocolate bajo un producto de pan: se conserva la observación de contenido inconsistente. |
| Matchioo | 6 | Abierto/cerrado coherentes; las tomas de clic Menu y Load More permanecen en el hero, sin éxito demostrado. La apertura directa de la ancla en escritorio sí muestra seis bebidas; footer amplía navegación/contacto/redes. |

Las observaciones coinciden con [la continuación B2a](F00-COBERTURA-VISUAL-AMPLIADA.md), cuyos enlaces locales y UTF-8 se comprobaron. En total, este tester vio 55 de los 95 PNG de B2a: 14 prioridades, 13 comercio y 28 complementarias. No declara inspeccionadas las otras 40 imágenes.

**Robustez B2a: 9,5/10, limitada a fidelidad de la evidencia y cobertura declarada de sus 15 referencias.** No acredita una revisión exhaustiva: permanecen pendientes header de PayGin, cierre estable de Luna Rossa, mapa/iframe externos, porciones de footer, tarjetas de sedes, interacciones móviles de Matchioo, rutas y controles no ejercitados. Los fallos de UI se registran como hallazgos de las demos, no como fallos de GoAdmin ni como resultados exitosos.

### Octavo bloque: cierre visual B2b

El manifiesto hotelero final contiene 120 PNG actuales: **118 incluidos y dos exploratorios excluidos**, de 14 orígenes. Pasa **964/964 controles** de firma, dimensiones, viewport real/solicitado, hash, URL, anotaciones, snapshots y referencias entre estados; evidencia `verify-b2-hotel-final.json`. Estos hashes describen las versiones finales, no conservan los bytes de tomas sobrescritas. Se mantienen expresamente los límites de Hotellia y otros intentos iniciales; `mariven-home-desktop` y `mer-internal-drinks-mobile` quedan excluidos.

Además de los ocho PNG iniciales y los siete de MĒR, se abrieron **25 nuevos PNG**, para 40 archivos distintos de B2b inspeccionados realmente. La segunda apertura de Hotellia tras su sustitución es una inspección adicional de la misma ruta, no otro archivo.

| Referencia/estado nuevo | PNG vistos | Resultado y límite |
|---|---:|---|
| Tidehouse interna desktop/móvil, menú abierto/cerrado | 4 | Hero de texto/foto pasa de dos columnas a apilado. Abrir navegación desplaza el contenido; persiste barra horizontal. El cierre vuelve al hero. |
| Umami interna desktop/móvil | 2 | Evento con fecha y borde ondulado, foto y detalle inferior. Móvil oculta CTA superior de reserva en el recorte; no se prueban entradas o reservas. |
| Camino carta/bebidas móvil | 2 | Cambia botón activo, categoría y productos/precios visibles; CTA de reserva fijo permanece. No se comprueba servicio de reservas. |
| Hotellia FAQ cerrado/abierto | 2 | Primera respuesta visible y filas siguientes desplazadas, coherente con apertura local. No se prueban los otros acordeones. |
| Mariven portada final desktop | 1 | Header completo, marca centrada y hero asentado. La captura exploratoria anterior se excluye. |
| Aurelia menú móvil/footer desktop | 2 | Panel verde oscuro con cinco enlaces y contacto; footer negro de cuatro grupos. No se certifica cierre con esta pareja de imágenes. |
| Constellare interna desktop/menú móvil | 2 | Suite con fotos y tarjeta lateral; overlay crema con navegación/CTA. No se certifican tarifa ni disponibilidad. |
| Karaya home desktop/interna móvil | 2 | Marco redondeado y header flotante; ficha de villa conserva identidad y atributos. No se prueban CTA. |
| Rumaya menú móvil/footer desktop | 2 | Panel vino de dos grupos; footer con cuatro grupos y marca grande. No se infiere recorrido por todas esas rutas. |
| Slice Town home desktop/interna móvil | 2 | Pizza y burger emplean distinta composición dentro de la misma identidad naranja; CTA fijo de pedido visible, sin accionar. |
| Fusion AI pricing mensual/anual desktop | 2 | Selector activo y valores cambian: Plus 22→29, Pro 69→49; permanece etiqueta mensual. No se interpreta como cálculo comercial correcto. |
| Chowk House inicio móvil/ancla Visit desktop | 2 | Imagen en arco y título; ancla con contacto/horarios/mapa. No se inventa menú colapsable ni página independiente. |

Las anotaciones del manifiesto concuerdan con esta muestra. [El documento B2b](F00-B2-HOTEL-Y-RESTAURANTE.md) pasa **135/135 controles**: 120 enlaces PNG únicos e idénticos a los del manifiesto, enlaces de soporte existentes, UTF-8 y límites declarados; evidencia `verify-b2-hotel-doc.json`.

**Robustez B2b: 9,5/10, limitada a fidelidad de las versiones finales de evidencia y observaciones del alcance declarado.** La pérdida de tomas sobrescritas queda reconocida y no se considera resuelta ni se presenta como trazabilidad inmutable. Para elevar esa parte se necesitan capturas nuevas con nombre único desde el primer intento y preservación fuera de TEMP. Los recortes de footer, interacciones no ejercitadas y cobertura de otras rutas/tamaños siguen abiertos; no se aprueba accesibilidad, operación comercial, independencia de outlets ni F00 completa.

### Reconciliación de orígenes B2

Los tres manifiestos finales contienen **244 capturas incluidas, sin rutas de archivo duplicadas, que corresponden exactamente a los 32 orígenes de la matriz inicial**; no faltan ni sobran orígenes. Evidencia `verify-b2-global-origins.json`. El tester ha inspeccionado 116 rutas PNG distintas (55 B2a, 40 B2b, 21 B2c), con al menos una muestra de cada referencia; además volvió a abrir una ruta Hotellia sustituida.

Este conteo verifica distribución y procedencia de evidencia. **No acredita todos los menús, todas las porciones de footer, todas las internas, animaciones, tablet o accesibilidad**, ni vuelve exitosas las interacciones pendientes. B2 no recibe una aprobación exhaustiva por el número de archivos u orígenes.

## Nota estática adicional para F01: ruta del manifiesto

Se verificó sin servidor ni red la copia websites compilada en TEMP: **8/8 condiciones coinciden**, evidencia `verify-f01-manifest-route.json` con hashes de los cinco artefactos examinados. Existe `app/api/_sections/manifest/route.ts`, exporta `GET` y coincide byte a byte con el fuente original; sin embargo, `.next/server/app-paths-manifest.json` enumera 111 rutas y ninguna contiene `section` o `manifest`. `.next/routes-manifest.json` declara `rewrites: []`; ni `middleware.ts` ni `next.config.js` aportan un mapeo alternativo para esa ruta.

El código de la dependencia Next instalada, `node_modules/next/dist/build/index.js:507`, aplica `ignorePartFilter` a segmentos que comienzan por `_`, coherente con la ausencia de `_sections` en el artefacto compilado. Es un hallazgo de generación de rutas local que debe atender F01; no se llamó al endpoint ni se verificó un despliegue real. Esta nota no cambia las calificaciones visuales B2 ni acredita seguridad o funcionamiento HTTP.

## Cobertura no probada

- Flujo completo de ventas, reservas y pagos reales; no se realizan operaciones comerciales como parte de esta auditoría.
- Recorridos visuales y responsive del editor y sitios representativos.
- Recuperación de respaldos, restauración y ensayo de migraciones.
- Aislamiento real entre sesiones de organizaciones distintas; las suites con mocks no acreditan por sí solas RLS en producción.
- Implementación V2: todavía no existe una funcionalidad nueva que pueda darse por validada.

## Calificación de robustez

**F00-A, inventario estático: 9,7/10.** Captura reproducible y correcciones verificadas; los límites del barrido léxico, el despliegue real y los consumidores externos están declarados. No se califica como funcionalidad V2 implementada.

**F00-C, coherencia documental: 9,6/10 en esa parte acotada.** La recuperación operativa y el respaldo no reciben calificación de cierre. F00 completa permanece sin aprobación mientras haya cobertura obligatoria pendiente. El veredicto de QA corresponde a otro agente.

**F00-B, estructura y trazabilidad: 9,6/10.** Cobertura visual exhaustiva pendiente, separada de esta calificación documental.

**F00-C3, evidencia de la línea base de pruebas: 9,5/10.** La nota califica únicamente la fidelidad de los resultados, su trazabilidad a logs y la cobertura declarada: suites y tipos ejecutados, builds definitivos aislados, errores/advertencias preservados y 42 hashes fuente comprobados al cierre. La suite no verde está identificada como línea base; no se presenta como código aprobado ni se oculta el bloqueo de llamadas durante el build. No califica la seguridad global, autenticación, recuperación, ventas o F00 completa.

Para llegar a 10 en esta parte: disponer de un procedimiento reutilizable que exija una carpeta de salida nueva antes de cada build, conserve los códigos de salida junto con cada log y permita atribuir cada intento bloqueado de red a su suite. La regeneración parcial de `.next-desktop` fue un error del proceso de verificación; el aislamiento de los builds definitivos corrige las ejecuciones posteriores, pero no restaura ni acredita el artefacto previo. Esta calificación no convierte esa incidencia en una práctica aceptable.
