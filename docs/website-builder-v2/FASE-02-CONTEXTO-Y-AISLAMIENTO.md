# Fase 02 — Contexto de sitio y aislamiento por outlet

Estado: pendiente; **etapa 1, se ejecuta junto con F03**. Depende de F01. Gobernada por [ADR-002](ADR-002-DECISIONES-Y-SECUENCIA.md) D1 (esquema), D3 (menús en el documento), D4 (adopción por sitio) y D7 (se reutilizan `resolver.ts`, `middleware.ts` y `OutletSelector`; se retira `theme-merge.ts` para sitios V2). Resultado: cada lectura/escritura resuelve inequívocamente sitio global u outlet.

## UX y componentes

El selector aparece desde branding y persiste al abrir identidad, páginas, menú, SEO y editor. Incluye outlets en borrador. Mostrar nombre comercial, estado y alcance: «Sitio de la organización» o «Sitio del outlet». Las listas y acciones dependen del contexto seleccionado, no de una variable global implícita.

Modificar la entrada de branding, `BrandingPagesTab.tsx`, `editor/OutletSelector.tsx` y la ruta del editor. Crear un proveedor administrativo de contexto si no existe uno adecuado. Cambio de sitio = transición única que resuelve página, pendientes y permisos juntos; evitar usar el branch del render anterior.

## Backend y rutas

- F02-01. Definir `SiteContext` resuelto en servidor: organización, sucursal nullable, referencia opaca, modo, base URL validada, prefijo, capacidades y versión de contrato. Un cliente puede pedir un sitio autorizado; no puede establecer `organization_id` efectivo.
- F02-02. ERP usa `getServerOrgContext()`/`withOrg` y verifica pertenencia de sucursal, página, menú y recurso. Un body con organización discordante recibe 403 y registro seguro. Permisos por acción se resuelven en servidor.
- F02-03. Websites resuelve host y ruta en `lib/get-org-context.ts` y `lib/outlet/resolver.ts`. Host desconocido, dominio no verificado u outlet no publicado no heredan accidentalmente el primer sitio encontrado.
- F02-04. Añadir lectores V2 explícitos por alcance, preservando los consumidores legacy y su cardinalidad. `null` = global, ID = outlet; prohibir `undefined` como «todos» en consultas V2 del visitante. Las consultas administrativas de varios sitios son funciones distintas.
- F02-05. Definir precedencia: página local sobre global heredada por slug/tipo; listar una sola versión efectiva. Distinguir heredar una página de enlazar a otra sede.
- F02-06. Cachés incluyen organización, sucursal, estado/revisión y parámetros relevantes. No reutilizar respuesta de un sitio para otro con el mismo slug.

## Base de datos y secuencia de despliegue

Verificar por MCP el esquema y constraints reales. No asumir que el plan histórico ya se ejecutó. Aplicar [ADR-001](ADR-001-ADICIONES-SIN-ALTERAR-LEGACY.md): almacenamiento nuevo para sitios V2, sin quitar los UNIQUE de settings/pages/menus ni insertar páginas de outlets en las tablas legacy. Preparar metadatos/flags por sitio; definir integridad de organización/sucursal y referencias, sin confiar en valores del navegador.

Secuencia obligatoria:

1. Preparar lectores V2 y selector de versión apagado; conservar el flujo público legacy. No dar por desplegado el código local.
2. Probar con fixtures que la importación conserva los datos y que el camino legacy devuelve sus contratos anteriores. La BD compartida no es un entorno aislado de ensayo.
3. Añadir `website_site_states`, `website_site_drafts` y `website_site_revisions` (ADR-002 D1) con unicidad por sitio, incluido global NULL, y RLS propia. En la misma migración, sustituir las políticas `anon` con `qual = true` de `website_pages`/`website_settings`/`website_page_sections` por políticas que filtren publicación, con prueba previa de todos los lectores inventariados en F00-A. Verificar que nuevas FK no vuelven ambiguas relaciones anteriores. Guardar migración exacta y rollback; ejecutar exclusivamente con MCP después de las compuertas de F00.
4. Mantener los UNIQUE globales y todas las filas actuales. Crear nuevas páginas de outlet dentro del documento V2 de su sitio, con IDs y slugs únicos en ese alcance.
5. Solo habilitar un sitio piloto cuando documento, permisos, renderer y recuperación se hayan validado. Las tiendas no adoptadas conservan el camino legacy.

Menús: decidido en ADR-002 D3. En V2 viven dentro del documento del sitio; `website_menus` y `website_menu_items` se importan una vez al adoptar y quedan legacy. No se crea tabla de asignaciones ni se añade `branch_id` a las tablas de menús.

## Aceptación y reversión

- [ ] Hotel y dos restaurantes admiten su propio `home` y `contacto`.
- [ ] Se conserva la forma correcta de settings en todos los consumidores del sitio global.
- [ ] Un usuario de otra organización no lee/escribe sitios, páginas ni recursos ajenos; probar con sesión real limitada además del service role.
- [ ] Navegación global no incorpora páginas de outlets por filtros omitidos.
- [ ] El flag es del sitio; un borrador no aparece públicamente por tener slug.
- [ ] Recuperación de un outlet solo V2 conserva su última revisión válida o responde no publicado/404; nunca muestra por fallback el sitio global u otra sucursal. Despublicar invalida también la caché de esa revisión.

Rollback: apagar la habilitación V2 y mantener lectores compatibles. Los UNIQUE globales nunca se retiraron. No borrar páginas/settings legacy ni documentos V2 como mecanismo de recuperación. Registrar precondiciones y recuperación hacia adelante.
