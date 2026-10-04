# Limpieza de CRM — cierre de código

Fecha: 2026-10-02. Rama: `feat/crm-flujo-completo`. Este documento registra la
limpieza y los escritores revisados; no acredita las 135 pantallas ni su E2E.

Se retiraron 44 archivos, con 9.797 líneas, después de buscar sus usos con `rg`
y construir un grafo de imports, reexports, imports dinámicos y `require` de
TypeScript. El grafo considera como raíces todos los archivos de producción
fuera de `src/components/crm`, por lo que conserva incluso consumidores ajenos
a las rutas actualmente visibles. Los archivos retirados no tienen un
consumidor de producción alcanzable. Incluyen tres barrels y la página de
redirección `pipeline/edit-opportunity`.

Las familias retiradas son las pantallas antiguas de Actividades, listas y
detalle antiguos de Oportunidades, kanban y drawer anteriores de Pipeline,
gestores de etapas anteriores, diálogos de acciones rápidas reemplazados y
sus selectores privados. Se conservaron `ActividadForm`, `OpportunityForm`,
`CreateOpportunityDialog`, `CustomerSearchSelect`, `GateWarningDialog` y
`StageSelect`: tienen consumidores vivos. No se retiró el flujo financiero
que aún protege el contrato de `WonCloseModal`.

Los contratos que antes leían archivos muertos ahora verifican los
consumidores actuales: `AccionesRapidasCrm`, `ResumenOportunidad`,
`useFlujoEtapa` y `OportunidadDrawer`. Conservan las comprobaciones de país de
telefonía, fallback móvil, etapas y montaje del onboarding.

`opportunitiesService` y `pipelineService` ya no ejecutan mutaciones SQL
desde el navegador. Se retiraron seis métodos de escritura sin consumidores;
las cuatro operaciones vivas delegan en API de tareas, notas y clientes. Las
notas reutilizan sus rutas existentes y sus permisos de autoría.

La edición del cliente escribe los campos base del nombre con el reparto
canónico y nunca la columna generada `full_name`. Exige `crm.customers.edit`,
la organización de la sesión y una versión coincidente cuando el formulario
envía `expected_updated_at`. El formulario vivo envía esa versión y conserva
los campos normalizados y la nueva versión de la respuesta. Una ficha ajena
da 404; una versión obsoleta o una carrera durante el guardado da 409.

El checkbox de tareas exige autoría, asignación o `crm.activities.edit_any`,
valida la relación del CRM y pone `completed_at` en el servidor. Conserva las
tareas que el historial incluye por `customer_id` aunque su referencia
primaria sea de otro módulo o nula. Las referencias deben pertenecer a la
misma organización; los cambios simultáneos de autor, responsable, relación,
estado o versión impiden la actualización. No incorpora una segunda lógica
de progreso de PM. Repetir el mismo estado conserva la fecha existente.

El helper compartido de relaciones distingue una lectura SQL fallida de una
referencia ausente: los errores reales producen 500 sin una mutación ni
detalles privados, en vez de un 404 engañoso.

Los guardarraíles de §7.4 no usan excepciones:

- Mutaciones `insert/update/delete/upsert` sobre cualquier tabla en
  `pipeline`, `oportunidades`, `actividades`, `leads` y `kit`, incluidas cadenas
  de consultas, tablas dinámicas y variables inicializadas desde `from`.
- Cero literales `America/Bogota` en componentes CRM.
- Cero comparaciones de permisos por nombre de rol en componentes CRM.
- Igualdad exacta de las 1.886 claves `crm.*` en español, inglés, francés y portugués.

Son comprobaciones estáticas del código y contratos de rutas. No sustituyen
las pruebas de RLS en PostgreSQL, el recorrido con una sesión real o la
verificación visual. Las mutaciones de otros módulos y los alias construidos
mediante reasignaciones requieren su revisión correspondiente.

Verificación focal: 3 suites / 226 casos actuales, 3 suites / 39 casos de
regresión y 7 suites / 320 casos de limpieza pasaron, sin casos omitidos.
Lint de 18 archivos tocados y `git diff --check` pasaron. TypeScript, build y
la suite global finales se coordinan después de congelar los cambios de
todos los agentes; los resultados previos no acreditan este estado final.

El trigger duplicado se retiró por MCP como versión `20261002054026`, después
del dryrun de aplicación doble, rollback doble, reaplicación y actualización
sobre tabla temporal (1,9 segundos). Se conserva set_opportunities_updated_at
con su definición original; no se modificaron oportunidades reales. SQL exacto
registrado en supabase/migrations/20261002054100_crm_oportunidades_updated_at_unico.sql,
MD5 `ea9c37aef78b76f770ef085b57514472`; rollback correspondiente en
supabase/rollbacks, MD5 `3017edf0ad3044aeaba23b9c1f361a75`. La versión y bytes
coinciden con schema_migrations. El catálogo posterior acredita solo el
trigger canónico; el rollback probado recupera los 17 triggers originales.
