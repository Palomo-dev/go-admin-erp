# F00-A — Inventario de consumidores y protección de contratos actuales

Fecha de análisis: 2026-09-19. Alcance de esta entrega: inspección estática de ambos árboles y evidencia reproducible de archivos. No cambia código productivo, esquema, datos, conexiones, dominios ni flags. No constituye la aprobación de toda la fase 00: pruebas, auditoría MCP, respaldo, recorridos visuales y rendimiento se registran por separado mediante `/loop` en `PROGRESS.md`.

La instrucción más reciente del usuario exige **solo adiciones compatibles**. Para esta implementación se conservan la cardinalidad, restricciones y filas de las tablas actuales. La independencia de los outlets se construirá en almacenamiento V2 separado y privado, con activación por sitio; no depende de quitar los `UNIQUE` históricos ni de insertar más settings/páginas por organización en las tablas actuales.

## Cómo leer y reproducir la evidencia

- **E** corresponde a `C:/Users/USUARIO/CascadeProjects/go-admin-erp`.
- **W** corresponde a `C:/Users/USUARIO/goadmin-websites`.
- Las rutas de las tablas son relativas a esas raíces; `:N` indica línea, numerada desde 1. Son referencias al árbol local inspeccionado, no afirmaciones sobre el código desplegado.
- [F00-INVENTARIO-ESTATICO.json](F00-INVENTARIO-ESTATICO.json) registra fecha UTC, HEAD, alcance de búsqueda, cada coincidencia léxica, líneas de `.single()`/`.maybeSingle()` en los archivos coincidentes y hashes SHA256 de archivos protegidos. No contiene filas ni identidades de clientes.
- Una coincidencia de texto no es por sí sola una consulta: incluye tipos, comentarios y propiedades. Por ejemplo, `channel_website_settings` es otra tabla; la propiedad homónima en `chatChannelsService` no demuestra una consulta a `website_settings`. La matriz siguiente distingue las lecturas/escrituras verificadas.

La captura recorrió 4.496 archivos fuente en ERP y 407 en websites; encontró 138 líneas de referencia en 15 archivos ERP y 122 en 37 archivos websites. Los 42 archivos protegidos (11 ERP y 31 websites) estaban limpios respecto a Git al capturarse; el resto del árbol ERP tiene trabajo ajeno sin commit y no se modifica. La fila de carrito se añadió tras feedback del tester conservando los 41 hashes originales. HEAD local: ERP `68cb0fd8637ca0083dc137a30f90a62beb6424aa`; websites `b91cdf625189adac99f62bd189284921a18ce5fe`.

Comandos de búsqueda ejecutables desde cada raíz, sin red ni BD:

```powershell
# ERP
rg -n '\b(website_settings|website_pages|website_page_sections|website_menus|website_menu_items|website_page_versions|website_section_presets)\b' src supabase/functions scripts --glob '*.{ts,tsx,js,mjs,cjs}'
# Websites
rg -n '\b(website_settings|website_pages|website_page_sections|website_menus|website_menu_items|website_page_versions|website_section_presets)\b' app components lib scripts types middleware.ts --glob '*.{ts,tsx,js,mjs,cjs}'
```

La captura JSON se obtuvo leyendo esos alcances y guardando rutas/líneas/hashes, con exclusión de `node_modules`, `.next` y `.git`. Los hashes incluyen bytes y estado Git individual al capturarlos. Para comprobarlos desde ERP:

```powershell
$inventarioF00 = Get-Content -LiteralPath 'docs/website-builder-v2/F00-INVENTARIO-ESTATICO.json' -Raw | ConvertFrom-Json
foreach ($repositorioF00 in $inventarioF00.repositories.PSObject.Properties.Value) {
  foreach ($archivoF00 in $repositorioF00.protected_files) {
    $rutaF00 = Join-Path $repositorioF00.root $archivoF00.path
    $hashF00 = (Get-FileHash -LiteralPath $rutaF00 -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($hashF00 -ne $archivoF00.sha256) { throw "Cambió el archivo protegido: $rutaF00" }
  }
}
```

Este control demuestra igualdad de bytes entre captura y comprobación. No demuestra ausencia de errores previos, igualdad con producción ni recuperación de la base. Si otro trabajo modifica un archivo protegido, se revisa su diff y autoría; no se restaura automáticamente ni se reemplaza la evidencia anterior para ocultar el cambio.

## Matriz de dependencias en el ERP

| Consumidor y evidencia | Lectura/escritura y contrato actual | Dependencia que debe preservarse |
|---|---|---|
| E `src/app/app/organizacion/branding/page.tsx:78`, `:113`, `:317` | Al faltar settings crea configuración; guardar delega a tema/SEO/contenido/avanzado sin argumento de sucursal. `BrandingPagesTab` se monta sin `branchId`. | Incluso abrir branding puede crear una fila. El inventario visual en producción no debe tratar todas las pantallas como lectura inocua. El editor actual sigue apuntando a sus datos actuales. |
| E `src/lib/services/websiteSettingsService.ts:323`, `:359`, `:510` | `getSettings` filtra con helper y usa `limit(1).maybeSingle()`. `updateSettings` consulta y después actualiza/inserta; para outlet sin fila copia settings globales como base. Los métodos especializados escriben directamente. | `branchId=undefined` no filtra; `null` filtra global. No añadir filas V2 aquí ni cambiar el significado del helper compartido. La lectura con límite no prueba unicidad. |
| E `src/lib/services/branchFilterHelper.ts:59` | `applyBranchFilterStrict`: número válido → sucursal; `null` → global; `undefined` → sin filtro. | Su modificación tendría alcance más amplio que sitios web. V2 necesita un scope explícito y validado propio. |
| E `src/lib/services/websitePageBuilderService.ts:2701`, `:2722`, `:2766`, `:2875` | Lista global, combinada o sin filtro según argumento. Detalle por id con `.single()`; validaciones de organización/sucursal dependen de parámetros opcionales. Crear/editar valida slug por ámbito desde el cliente. | No asumir que el precheck de slug sustituye constraints o autorización. Mantener tablas, firmas y resultados legacy. El nuevo servidor V2 valida tenant/scope sin confiar en esos parámetros del cliente. |
| E `src/lib/services/websitePageBuilderService.ts:2937`, `:2999`, `:3038`, `:3219` | Crear/materializar secciones obtiene `branch_id` del padre. Reordenar y sembrar páginas hacen varias operaciones. | Una nueva pantalla V2 no debe llamar a estos escritores para guardar un borrador. No sembrar contenidos de prueba en las tablas de páginas activas. |
| E `src/app/organizacion/branding/editor/[pageId]/page.tsx:128`, `:155` | Carga página inicialmente por id; resuelve scope desde ella. El selector ofrece solo sucursales ya publicadas con tipo válido. | La experiencia V2 debe permitir preparar un outlet privado sin publicar el sitio actual para poder editarlo. |
| E `src/app/organizacion/branding/editor/[pageId]/page.tsx:347`, `:384`, `:420` | Cambiar página/outlet borra pendientes de secciones/settings, pero no todos los refs de SEO/layout/menús; `doOutletChange` cambia estado y llama `doPageChange`, que captura el `selectedBranchId` anterior. | Casos de carrera y pérdida/arrastre de cambios para pruebas sintéticas. No certificarlos como corregidos ni reproducirlos guardando datos de negocios. V2: cambio de scope atómico y descartar respuestas superadas. |
| E `src/app/organizacion/branding/editor/[pageId]/page.tsx:494`, `:516`, `:718` | Agregar/eliminar sección escribe inmediatamente. Guardar modifica secciones, orden, SEO, layout, settings y menús en operaciones separadas. | La previsualización actual no equivale a edición privada. V2 necesita guardar un documento privado y publicar por operación transaccional independiente. |
| E `src/app/organizacion/branding/editor/[pageId]/page.tsx:840` | Sincroniza galerías/testimonios/FAQ en campos globales de settings; varias secciones del mismo tipo pueden sobrescribir el mismo destino. | Las secciones V2 repetibles conservan datos por id de instancia; no usan ese volcado para publicar. |
| E `src/lib/services/websitePageBuilderService.ts:3478`, `:3496`, `:3622`, `:3715` | Hay métodos de draft/versiones/presets; `publishPage` modifica varias filas y guarda historial de secciones. El `handleSave` revisado no llama a ese publicador. | Su existencia no demuestra autosave privado o publicación atómica del sitio completo. No asumir confidencialidad de `draft_content` sin revisar privilegios y RLS por MCP. |
| E `src/lib/services/websiteMenuService.ts:56`, `:69`; `websitePageBuilderService.ts:3097`, `:3112` | Menús legacy derivados de páginas por organización, sin scope de outlet en la firma. | Insertar páginas V2 en estas tablas podría alterar navegación de sitios actuales incluso sin activar un renderer nuevo. |
| E `src/lib/services/websiteMenuGroupService.ts:116`, `:130`, `:169`, `:288`, `:324` | Menús nombrados por organización; mutaciones por id; migración de páginas a menús asigna `header_menu_id` en settings por organización. | No llamar a `migrateExistingPages` automáticamente desde V2. Usar importación de lectura y nuevo documento de navegación. |
| E `src/components/organization/branding/BrandingCheckoutTab.tsx:65`, `:101` | Lee settings de checkout por organización con `.single()`; escribe settings por organización. | La personalización visual V2 no debe modificar envío, tarifa, modos de entrega o reglas del checkout actual. |
| E `src/components/chat/channels/website/ChannelDetailContent.tsx:84`, `:146`; `src/app/app/chat/canales/sitio-web/[id]/page.tsx:96`, `:152` | Control del widget lee con `.maybeSingle()` y actualiza settings por organización, sin sucursal. | La cardinalidad de settings afecta también chat. No copiar scripts/widget reales al runtime de preview. |
| E `supabase/functions/ai-auto-response/index.ts:656` | La atención al cliente lee envío/impuestos de `website_settings` por organización con `.single()`. | Un cambio de cardinalidad alcanza la Edge Function y el comercio conversacional. Fuera del editor no implica fuera de riesgo. |
| E `src/components/organization/branding/editor/fields/EntityField.tsx:418` | Selector de páginas consulta `website_pages`. | Selectores V2 deben resolver páginas del documento/sitio V2, no mezclar automáticamente entidades legacy y nuevas. |
| E `src/lib/ai/assistant/undoService.ts:116` | Catálogo de dependencias de deshacer incluye `website_menu_items.category_id` para categorías. Es una dependencia declarativa del asistente, no la llamada directa `.from('website_settings')` de chat. | Menús V2 que referencien categorías necesitan declarar cómo conservar la integridad al borrar/deshacer entidades. No reutilizar el asistente para crear/eliminar datos de prueba en esta fase. |

## Matriz de dependencias en websites

| Consumidor y evidencia | Comportamiento observado | Dependencia que debe preservarse |
|---|---|---|
| W `lib/supabase/queries.ts:231`, `:265`, `:308` | Tres lecturas anidadas de `organizations` con `website_settings (*)`; se tipan como objeto de configuración. | Quitar la unicidad puede cambiar la forma del embed. Mantenerla. La nueva relación V2 debe tener nombre explícito y no crear ambigüedad con estas relaciones. |
| W `lib/get-org-context.ts:37`, `:79`, `:141` | Resuelve organización por headers; outlet por dominio/subsubdominio/prefijo. Ausencia de outlet produce `undefined`; settings efectivos reemplazan la propiedad en memoria. | Un flag visual no protege de cambios de BD. Nuevo contexto V2 debe ser lateral y no alterar las firmas/valores que esperan consultas actuales. |
| W `lib/outlet/resolver.ts:55`, `:84` | Solo resuelve outlets publicados; devuelve id, slug, nombre, tipo, dominio y publicación. No incluye identidad visual completa. | El borrador del outlet necesita resolución privada separada; no habilitar `branches.is_web_published` para poder verlo. |
| W `lib/outlet/theme-merge.ts:30`, `:55`, `:73` | Merge superficial: `null`/`undefined` heredan, otros valores sustituyen; excluye metadatos. Consultas global y outlet con `.maybeSingle()`. | No reinterpretar `null` legacy como borrar un valor. V2 expresa heredar/valor/vaciar y materializa publicación sin cambiar las filas actuales. |
| W `lib/supabase/queries.ts:1299` | Página por slug: primero outlet publicado; luego global. Ordena y filtra secciones visibles. | Importar de lectura conserva orden, variantes, visibilidad y contenido; no publicar versiones transformadas de forma implícita. |
| W `lib/supabase/queries.ts:1364`, `:1387` | Plantilla de detalle por organización + `page_type` + publicada, `.single()`, sin sucursal. | Más de una plantilla por tipo en legacy podría activar fallback. V2 resuelve sus plantillas en documento separado. |
| W `lib/supabase/queries.ts:1402`, `:1439`, `:1429`, `:1466` | Header/footer combina páginas de outlet y globales; con `undefined` no filtra. El árbol se arma por padre, sin precedencia/deduplicación explícita por slug. | No insertar páginas V2 aquí: contaminaría navegación legacy. Menús V2 se materializan en cada publicación y scope. |
| W `lib/supabase/queries.ts:2610`, `:2684`, `:2762`; `lib/get-org-context.ts:112` | Header asignado por id; footer carga todos los menús activos de ubicación footer/both de la organización. `getMenuById` no recibe organización. Lecturas de páginas/categorías por listas de ids tampoco añaden siempre filtro de organización. | No trasladar esos supuestos al API V2. Validar pertenencia de cada referencia y tener asignación de menús por sitio. Las garantías actuales requieren revisión adicional de datos/FK/permisos; no se probaron accesos cruzados. |
| W `app/[[...slug]]/page.tsx:43`, `:55`, `:83`, `:121`, `:131` | Tras consumir prefijo usa solo `effectivePath[0]`; canonical usa dominio de organización y ese slug. | Un detalle profundo bajo prefijo no es equivalente al detalle raíz. V2 necesita router de ruta completa y generador de URL por sitio; mantener intacta la resolución legacy mientras V2 está apagado. |
| W `app/productos/[id]/page.tsx:206`, `:273`; `app/categorias/[slug]/page.tsx:78`, `:99` | Detalles consultan plantillas por tipo global. Pasan al layout menos props de menús que el catchall. | No basta probar home. Cubrir detalle, categorías, enlaces, canonical y shell al adoptar V2. |
| W `app/espacios/[id]/page.tsx:58`, `:73`, `:76` | Layout de detalle propio con links raíz `/espacios`; no consume una plantilla V2. | Caso específico de hotel para fases posteriores. El inventario no demuestra funcionamiento de reservas bajo prefijo. |
| W `components/site/OrganizationLayout.tsx:68`, `:112`, `:124`; `components/site/SiteHeader.tsx:356` | El layout consume settings efectivos, pero fuente viene del preset; fondo usa clases fijas claro/oscuro. Header sigue leyendo la organización. | Tokens nuevos deben quedar acotados al shell V2; cambiar CSS global o el preset común puede modificar todas las tiendas. |
| W `app/checkout/page.tsx:98`, `:101`; `app/carrito/page.tsx:32` | Checkout vuelve a leer settings por organización con `.single()`; carrito lee el objeto de settings. | Proteger ambos aunque el catálogo se renderice con V2. No cambiar reglas de checkout ni datos operativos para lograr un tema independiente. |
| W `app/layout.tsx:27`, `app/api/favicon/route.ts:35`, `app/mi-cuenta/layout.tsx:19`, `app/pedido/[id]/page.tsx:33` | Metadatos, favicon, cuenta y pedido dependen también de la configuración/identidad del sitio. | Incluir superficies fuera de home. Cuenta/pedido no pueden exponer datos de otro sitio o tenant al cambiar contexto visual. |
| W `app/api/reviews/route.ts:104` | Moderación de reseñas consulta settings por organización con `.maybeSingle()`. | El tema nuevo no debe cambiar aprobación de reseñas ni añadir filas que vuelvan ambigua esa consulta. |
| W `lib/templates/apply-template.ts:25`, `:70`, `:80`; `app/api/templates/apply/route.ts:13`, `:33` | Aplicar plantilla actualiza settings y elimina páginas por organización antes de recrearlas. El handler acepta organización del body y no muestra autenticación dentro del propio handler. | **No invocar este endpoint ni reutilizar este servicio para probar/adoptar V2.** Hallazgo preexistente de alto impacto; falta verificar middleware/despliegue para determinar exposición. No se envió ninguna petición. |

Las páginas adicionales que consumen `organization.website_settings` y los componentes de productos, galería, mapa, hero y countdown están enumerados en el JSON. Consumir un objeto en cliente no significa que ese componente ejecute una consulta adicional; el costo se rastrea en el cargador de datos correspondiente.

## Caché e invalidación: comportamiento que no debe perderse

| Evidencia | Comportamiento observado | Condición para adiciones V2 |
|---|---|---|
| W `lib/supabase/cache.ts:35`, `:38`, `:41`, `:43` | `cacheStructural` usa `unstable_cache`, nombre + argumentos, tags por nombre; contenido 60 s y configuración 300 s. Convierte `undefined` en centinela antes de construir la clave. | Mantener la distinción `undefined`/`null` en legacy. Claves V2 incluyen organización, sitio, revisión y contrato. No cachear borradores como publicaciones. |
| W `lib/supabase/cache.ts:87`, `:97`; `queries.ts:2888`, `:2922` | Catálogo usa TTL 30 s y tags por organización/global; varias funciones usan también React `cache`. | No retirar la caché de catálogo ni invalidar todos los negocios al editar un sitio. Precio/stock finales siguen siendo competencia del flujo comercial. |
| E `src/app/api/website/revalidate/route.ts:17`; `src/lib/services/website/revalidarCatalogoWeb.ts:36`; W `app/api/revalidate/route.ts:24` | ERP deriva organización con `withOrg`, avisa con secreto de servidor a endpoints configurados; websites invalida catálogo. Timeout 5 s; falla sin bloquear la operación ERP. | Ese endpoint no es una publicación transaccional ni invalida todos los tags estructurales. V2 necesita invalidación dedicada por revisión/sitio y reintento, preservando la existente. |
| W `app/[[...slug]]/page.tsx:38`, `:162`, `:168`, `:179` | Home es `force-dynamic`; tipos de secciones pueden pedir lotes de hasta 500 productos/ofertas. Múltiples ramas pueden pedir un mismo dominio. | No añadir una consulta por sección. Preparar dependencias compartidas y límites. Esta ronda no mide requests reales ni atribuye al código un número de consultas ejecutadas por visita. |

## Preview actual y superficie comercial protegida

E `src/components/organization/branding/editor/EditorPreview.tsx:81` envía secciones con `postMessage` al origen calculado y conserva fallback `*`. W `components/sections/PreviewBridge.tsx:105`, `:110`, `:116` anuncia disponibilidad, valida una lista de orígenes y aplica secciones. El handler revisado no valida `event.source` ni una sesión/capability por sitio. W `components/sections/PreviewableSections.tsx:16` activa el bridge con `?preview=1`. El intercambio no incluye un documento completo de tema, header, footer, navegación y páginas.

La URL de preview sale de la organización en E `src/app/organizacion/branding/editor/[pageId]/page.tsx:139` y se compone por página/tipo en `:917`; cambiar outlet no reconstruye una URL privada por scope. El bloqueo de clic en W `components/sections/PreviewBridge.tsx:142` se limita a nodos dentro de `data-section-id`: **no es una garantía de impedir todas las acciones comerciales o scripts de la página**.

La futura preview V2 usará un origen controlado, sesión efímera, documento privado y adaptadores de acción sin mutaciones. F00-A no abre el editor con datos de una tienda para probar guardar, agregar o eliminar, ni efectúa compras/reservas.

| Flujo | Archivos/rutas a preservar y verificar antes del piloto |
|---|---|
| Carrito y venta | W `components/site/CheckoutWizard.tsx`, `app/carrito/page.tsx`, `app/checkout/page.tsx`, `app/api/orders/route.ts` |
| Inicio/cálculo de pago | W `app/api/checkout/init/route.ts`, `app/api/shipping/calculate/route.ts` |
| Confirmación externa | Todos los archivos TS bajo W `app/api/webhooks/`: bold, mercadopago, meta, paypal, payu, stripe y wompi_co. Aunque Meta no sea una pasarela, también queda protegido. |
| Hotel | W `app/api/reservations/route.ts`, `/cancel`, `/pricing`, `/pricing/multi`, `/availability`, `/calendar`; detalle `/espacios/[id]` |
| Restaurante | W `app/api/restaurant-reservations/route.ts`, `/availability`, `/[id]`, `/[id]/cancel` |
| Otros módulos presentes | W `app/api/classes/[id]/reserve/route.ts`, `app/api/transport/reserve-seat/route.ts`; no activar reservas reales desde preview. |
| Efectos fuera de APIs de venta | Widget, píxeles, scripts personalizados, reseñas, newsletter y mensajes: no montar sus emisores reales en preview. La auditoría de todos sus llamados sigue pendiente. |

En la lectura estática también se observó que W `app/api/orders/route.ts:27` recibe organización del body y valida pertenencia de sucursal, y W `app/api/shipping/calculate/route.ts:16` usa organización del body. No se declara que estas rutas ya cumplen el patrón canónico de contexto. Son dependencias sensibles preexistentes para revisión de seguridad independiente; esta entrega no las refactoriza ni prueba ataques contra producción.

## Propuesta aditiva para las fases siguientes

1. **Contrato nuevo puro**, sin importar clientes Supabase ni código de pagos: documento V2, scope inequívoco, ids de secciones, herencia explícita y validadores. Se prueba con fixtures sintéticos. Un adaptador de lectura puede convertir legacy a borrador V2; no hace escritura inversa.
2. **Almacenamiento lateral** de estado, borradores privados y revisiones V2. Son nombres lógicos pendientes de diseño/verificación MCP, no tablas que este documento afirme creadas. No se modifica `website_settings`, `website_pages`, `website_page_sections`, menús, datos comerciales ni sus restricciones. RLS y privilegios deben impedir lectura anónima de borradores desde el primer momento.
3. **Publicación V2 optativa** y atómica por sitio. Sin fila/flag habilitado el sistema conserva el camino actual. El flag no concede permisos, no sustituye validación tenant y no hace seguros cambios en tablas compartidas; por eso las tablas legacy permanecen intactas.
4. **Ensamblaje visual nuevo** con tokens acotados al contenedor V2, shell/contexto completos y rutas del sitio. Reutiliza servicios comerciales existentes por interfaces revisadas; no copia cálculo de dinero, stock, impuestos ni confirmación de pagos dentro del constructor.
5. **Activación gradual** solo después de pruebas de contrato, privacidad, rutas, rendimiento y recuperación. No se usa el endpoint destructivo de plantillas. No se publica una sucursal legacy ni se migra una tienda automáticamente para mostrar la prueba.
6. **Recuperación sin borrar datos**: desactivar adopción V2 o seleccionar revisión compatible conservando contenido nuevo. Recuperar una publicación no requiere restaurar/quitar constraints históricas. Cambios de flag o despliegue requieren su verificación concreta posterior; el documento no promete riesgo cero.

## Cobertura pendiente de F00 y límites

- Los conteos, constraints, políticas y privilegios actuales se verifican por MCP en la subparte de BD. Los conteos de auditorías anteriores no se presentan aquí como consultas nuevas.
- Los hashes cubren archivos enumerados, no todo el despliegue ni toda la BD. HEAD local tampoco identifica necesariamente el release productivo.
- El barrido fuente cubre ERP `src`, `supabase/functions`, `scripts`; websites `app`, `components`, `lib`, `scripts`, `types` y `middleware.ts`. No cubre código generado remoto, jobs configurados solo en plataforma, migraciones como historial, dependencias externas ni llamadas construidas dinámicamente que no contienen los tokens buscados.
- La búsqueda por tokens se completó y el grafo principal se revisó manualmente; `.single()` del JSON incluye consultas de otros dominios dentro de archivos compartidos. No equivale a una auditoría de todos los permisos del ERP/websites.
- Faltan el identificador del release desplegado, inventario operativo de jobs/correo externos y sus dependencias, confirmación del respaldo/restauración, recorridos visuales por viewport, sesiones legítimas de prueba y mediciones de red/render. No se declara compatibilidad funcional sin esa evidencia.
- Las 32 referencias y patrones continúan en [MATRIZ-32-REFERENCIAS.md](MATRIZ-32-REFERENCIAS.md) y [CATALOGO-COMPOSICIONES.md](CATALOGO-COMPOSICIONES.md); este inventario no aumenta artificialmente su cobertura de navegación.
- El tester ejecuta las verificaciones reales de esta subparte y reporta sus fallos; QA revisa después. El builder no se autocalifica. La fase 00 completa sigue las compuertas de [FASE-00-INVENTARIO-Y-PROTECCION.md](FASE-00-INVENTARIO-Y-PROTECCION.md).
