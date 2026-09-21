# F00-C — Esquema, aislamiento y recuperación

Estado: inventario realizado; recuperación y cierre pendientes de evidencia. Fecha local: 2026-09-19. Proyecto: `jgmgphmzusbluqhuqihj`.

## Método y límites

Se verificaron columnas y relaciones mediante `list_tables` MCP antes de consultar tablas. Consultas de inventario con `BEGIN READ ONLY` y `statement_timeout` de 5 segundos; metadatos, conteos y agrupaciones sin nombres de clientes, secretos ni contenido de páginas. No se aplicaron migraciones, backfills, semillas, cambios de políticas ni escrituras operativas.

El campo `rows` de `list_tables` no se usó como conteo exacto: varias tablas devolvieron cero estimado aunque contienen filas. Los conteos siguientes provienen de `count(*)`.

[F00-BD-LECTURAS.json](F00-BD-LECTURAS.json) conserva los metadatos sanitizados de ocho tablas, 39 constraints, 19 índices y los 57 pares de secciones obtenidos por MCP. No es un backup ni un snapshot global: corresponde a lecturas distintas durante esta ronda.

## Inventario actual verificado

| Entidad | Filas | Alcance y observación |
|---|---:|---|
| website_settings | 84 | Todas con branch_id NULL |
| website_pages | 1.064 | Todas con branch_id NULL |
| website_page_sections | 1.944 | Todas con branch_id NULL |
| website_menus | 148 | Sin columna branch_id |
| website_menu_items | 830 | Sin columna branch_id |
| website_page_versions | 0 | Versiona páginas; no es snapshot completo del sitio |
| website_section_presets | 0 | Tiene content; no persiste settings de la sección |
| branches | 89 | Cero con is_web_published=true |

Se observaron 37 tipos de sección y 57 pares tipo/variante guardados. `categories_grid` tiene `default` 2, `grid` 25, `horizontal` 24 e `icons` 1. Los aliases guardados deben conservarse aunque no aparezcan en el selector del editor. La comparación de organización y sucursal entre página y sección arrojó cero discrepancias actuales; no garantiza que una futura escritura inválida sea rechazada por las FK actuales.

## Contratos de integridad que se conservan

- `website_settings_organization_id_key`: UNIQUE por organización.
- `website_pages_organization_id_slug_key`: UNIQUE por organización y slug.
- `website_menus_organization_id_slug_key`: UNIQUE por organización y slug.
- Existen además índices únicos por organización/sucursal en settings y páginas, pero no eliminan las restricciones globales anteriores. No significan que se puedan insertar múltiples settings por organización.
- FK de página/sección/sucursal/organización se declaran por separado; no todas prueban pertenencia compuesta. La validación V2 deberá comprobar la cadena completa en servidor y reforzar sus tablas nuevas.
- Los índices consultados de settings/pages/sections aparecen válidos. La lectura de secciones visibles dispone de índice por `page_id, sort_order`; los índices de navegación contemplan organización y publicación.
- El historial de páginas depende de `website_pages` por FK; cambiar o borrar páginas legacy puede arrastrar versiones y secciones. La adopción V2 no debe usar borrado/recreación de páginas.

Se identificaron por metadatos cinco funciones públicas cuyo cuerpo referencia estas tablas: `create_default_pages`, `create_default_website_settings`, `sync_section_branch_id`, `sync_sections_branch_on_page_update` y `trigger_create_website_settings`. No se ejecutaron ni se extrajeron sus cuerpos a documentación.

Los triggers activos incluyen creación de settings al insertar organización, sincronización de sucursal de sección, propagación al cambiar la sucursal de una página, validación de pertenencia de sucursal en settings/pages/sections y actualización de timestamp de settings. Su existencia se verificó en catálogo; no se probaron escrituras para certificar sus resultados. Crear una organización sintética en producción puede disparar estas altas, por lo que no se hizo como parte del inventario de lectura.

## Lectura y privacidad

Settings, páginas, secciones, menús, versiones y presets tienen RLS habilitada, pero eso no equivale a aislamiento efectivo. Se inspeccionaron las políticas y se realizó una lectura acotada bajo rol `anon`:

| Prueba de solo lectura | Resultado |
|---|---:|
| Rol efectivo | anon |
| Páginas legibles | 1.064 |
| Páginas no publicadas legibles | 7 |
| Páginas legibles con draft_content no NULL | 0 |

Es un hallazgo preexistente: las políticas permisivas `Allow anon select website_pages/settings/page_sections` incluyen condición `true`, por lo que otra política que filtre por publicación no las restringe. No se extrajo contenido de esas páginas. Los borradores privados V2 necesitan almacenamiento y acceso separados; no se puede prometer privacidad usando `website_pages.draft_content` bajo las políticas actuales.

También se observaron políticas legacy basadas en nombre/id de rol; las nuevas autorizaciones deben usar permisos de servidor según AGENTS. No se modificaron permisos para evitar romper lectores existentes. El inventario no constituye una auditoría completa de seguridad de todos los módulos.

## Recursos y Storage

Se verificaron columnas de `storage.buckets`. Una consulta limitada a los buckets usados/referenciados devolvió `product-images`, público, límite 5 MiB y MIME JPEG/PNG/WebP/GIF; no devolvió `organization-assets`. El servicio del editor referencia ese último nombre y debe trazarse su flujo antes de prometer uploads funcionales. No se creó un bucket ni se trasladaron recursos. La ausencia del bucket no prueba que todos los uploads actuales fallen: pueden existir rutas alternativas.

## Contrato de columnas de tracking

Se leyó `scripts/verify-tracking.mjs` de websites sin ejecutarlo, porque usa REST directo y una guía de producción. Se extrajeron los tres SELECT actuales de `getShipmentByTracking` en `lib/supabase/queries.ts`: 13 columnas de shipments, 4 de proof_of_delivery y 4 de transport_events. Se verificaron esos esquemas con MCP y se comprobó su compilación SQL mediante `WHERE false LIMIT 0`, en transacción de solo lectura: las tres consultas terminaron sin error y sin leer filas de clientes.

La inspección fuente también confirmó filtro por organización y ausencia de `.single()` en esa función. Esto valida nombres de columnas y dos condiciones estáticas; **no equivale a ejecutar todo verify:tracking**, a probar una guía real, ni a verificar autorización/serialización de PostgREST o el flujo HTTP. Ese recorrido permanece pendiente y no se presenta como aprobado.

## Hallazgo adicional en la aplicación local de plantillas

La revisión independiente de `goadmin-websites` confirmó una operación destructiva sin autorización comprobada en el código local. **Severidad crítica para ese código; exposición del despliegue productivo sin verificar.** No se ejecutó el endpoint ni se envió una petición de prueba.

- `middleware.ts:137` llama a `supabase.auth.getUser()` y descarta el resultado. El matcher incluye `/api/templates/apply`, pero las salidas de las líneas 208/231 continúan la petición; no validan usuario, membresía ni permiso para esta acción.
- `app/api/templates/apply/route.ts:16` recibe `organization_id` del body y llama al servicio en la línea 33 sin derivar la organización de un contexto autorizado.
- `lib/templates/apply-template.ts:15` obtiene un cliente que usa service role cuando está configurado, según `lib/supabase/server.ts:68`. No se le asocia una sesión de usuario que limite esa operación.
- `lib/templates/apply-template.ts:70` actualiza settings; las líneas 80–82 eliminan todas las páginas de la organización indicada, sin filtro por sucursal o publicación. Las inserciones posteriores son independientes y pueden fallar mientras el resultado final declara éxito; no existe transacción que recupere las páginas originales.

Esto refuerza la decisión de no reutilizar ese endpoint ni ese servicio para preview, importación o adopción V2. Antes de habilitar una aplicación de plantillas se requiere organización derivada del contexto, permiso comprobado en servidor y escritura en borrador compatible. Una corrección del flujo legacy debe inventariar sus clientes y preservar las llamadas autorizadas; no se cambia durante este inventario de lectura.

La inspección no examinó secretos, WAF/proxy externos ni la revisión desplegada. No demuestra explotación ni pérdida de contenido. Las calificaciones de inventario documental no aprueban la seguridad del endpoint.

## Recuperación antes de escribir

### Correspondencia con despliegues

El 2026-09-20 se consultó el conector Vercel en modo de lectura. `list_teams` devolvió una lista vacía. Ambos repositorios tienen identificadores de proyecto/equipo en `.vercel/project.json`; usarlos con `list_deployments` devolvió **403 Forbidden por falta de autorización para ese equipo** en ambos casos. `get_project` también presentó una discrepancia entre su esquema expuesto y el argumento `idOrName` exigido internamente. No se intentaron credenciales alternativas, cambios de permisos ni despliegues.

Por tanto, sigue sin verificarse qué revisión local coincide con producción. Se necesita acceso autorizado del conector al equipo correspondiente o metadatos verificables de las revisiones desplegadas. Los hashes locales y los builds aislados no permiten atribuir automáticamente a producción los hallazgos del endpoint de plantillas o de la ruta del manifiesto.

### Respaldo y recuperación

**Pendiente de verificación:** fecha del último backup disponible, alcance, retención, restauración posible y estado de los recursos externos. Las herramientas MCP disponibles no exponen consulta de backups. La navegación al dashboard quedó en inicio de sesión en la revisión anterior; se solicitó al usuario acceso al panel para comprobar los datos, sin pedir credenciales por el chat.

No deducir un backup utilizable solo por el plan comercial, la versión de Postgres o el estado `ACTIVE_HEALTHY`. No ejecutar una restauración para probar en producción: podría interrumpir el servicio o perder operaciones posteriores. Una copia lógica de presentación tampoco reemplaza un respaldo completo de negocio ni recupera archivos borrados de Storage.

Orden de recuperación preferido para cambios V2:

1. Desactivar adopción/lectura V2 del sitio y mantener código compatible.
2. Recuperar una revisión de presentación válida, preservando pedidos y pagos posteriores.
3. Aplicar una corrección compatible si el fallo es de contrato o consulta.
4. Reservar restauración completa para un incidente que realmente la justifique, con alcance y pérdida potencial de operaciones evaluados.

## Condiciones de salida

- [x] Esquema y conteos actuales obtenidos por MCP, sin escrituras.
- [x] Constraints que condicionan compatibilidad identificados y conservados.
- [x] Prueba real de lectura anónima con resultados agregados.
- [x] Decisión [aditiva](ADR-001-ADICIONES-SIN-ALTERAR-LEGACY.md) registrada.
- [ ] Disponibilidad de respaldo y procedimiento de recuperación verificados.
- [ ] Pruebas actuales y evaluación independiente del tester/QA completadas.
- [ ] No iniciar la primera migración sin resolver esas condiciones; tareas locales que no dependan de BD pueden prepararse sin afirmar cierre de F00.
