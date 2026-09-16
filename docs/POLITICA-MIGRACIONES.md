# Política de migraciones

> Vigente desde 2026-09-09. Sustituye a la regla anterior ("aplicar solo por MCP, cero `.sql` en el repo")
> que aparece en los documentos `docs/crm-revenue-os/FASE-*.md`. Esos documentos conservan la redacción
> antigua porque describen rondas ya cerradas; para trabajo nuevo manda este archivo.

## Qué cambia y por qué

La regla anterior prohibía versionar `.sql` para evitar que alguien aplicara migraciones a mano y
la base de datos y el repo se desincronizaran. El efecto secundario fue peor que el problema: los
cambios de esquema no dejaban rastro en el repo, no se podían revisar en un diff y no había forma
de revertir un cambio salvo reconstruirlo de memoria.

La nueva política mantiene el MCP como **única vía de ejecución** y añade el `.sql` como **registro
y como reversión**.

## Las tres piezas

Cada cambio de esquema produce tres cosas, no una:

1. **La aplicación**, con `apply_migration` del MCP de Supabase. Sigue siendo la única forma de
   tocar la base. Nada de `psql` a mano, nada de SQL suelto en el editor de Supabase.
2. **El archivo aplicado**, en `supabase/migrations/<timestamp>_<nombre>.sql`, con el SQL
   **exactamente como se aplicó**. Si al aplicar hubo que corregir algo, el archivo refleja la
   versión final, no el primer intento.
3. **El rollback**, en `supabase/rollbacks/<mismo timestamp>_<nombre>_rollback.sql`, que deshace
   la migración. Se escribe en el mismo momento, no "cuando haga falta" — cuando hace falta es
   siempre a las 2 de la madrugada con producción caída.

Los tres pasos van en el mismo commit.

## Reglas del contenido

- **Idempotente**: `IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP ... IF EXISTS`. Aplicarla dos veces
  no puede romper nada.
- **Verificación antes de aplicar**: probar el bloque dentro de `begin; … rollback;` y comprobar
  que las consultas de verificación devuelven lo esperado.
- **Sin credenciales, nunca**. Ni `service_role`, ni `anon`, ni tokens de proveedores, ni siquiera
  como ejemplo. El repositorio es público. El 2026-09-09 el `baseline_schema.sql` llegó a tener la
  `service_role` de producción incrustada cuatro veces; se redactó a `<SERVICE_ROLE_KEY>` antes de
  versionarlo. Si una función necesita una clave, va por Vault o por `current_setting`.
- **Toda función con elevación** (`SECURITY DEFINER`) lleva su `REVOKE ... FROM anon, public` y su
  comprobación de pertenencia a la organización **en la misma migración**. Una guarda sin su revoke
  no es media medida: es ninguna.
- **Un rollback que no revierte datos, lo dice**. Si la migración borra o transforma filas, el
  rollback restaura la estructura pero no los datos; que el archivo lo advierta en un comentario.

## Deuda actual

Migraciones versionadas sin su rollback correspondiente (2026-09-09):

- `20260909130000_fase0_respuestas_rapidas_uso.sql`
- `20260909140000_buscador_catalogo_normalizacion.sql`
- `20260909150000_buscador_catalogo_funcion.sql`
- `20260909160000_catalogo_modelos_ia.sql`
- `20260909170000_buscador_catalogo_permisos.sql`
- `20260909180000_tarifas_gpt4o_legacy.sql`

`supabase/migrations/00000000000000_baseline_schema.sql` es el volcado del esquema completo y no
tiene rollback por naturaleza; sirve de referencia, no se aplica.

Saldado el 2026-09-15 (F0-DB ronda 3): las 55 migraciones `crm_v4_*` y `crm_customer_lifecycle_ladder`
que se aplicaron por MCP sin dejar archivo se reconstruyeron desde
`supabase_migrations.schema_migrations` (cuerpo byte a byte, md5 verificado) con su rollback.
Rollbacks con limitación explícita (documentada en cada archivo; corregida el 2026-09-15 en la ronda 4
tras la verificación del tester y del QA): `crm_v4_f00_29` es un no-op **a propósito**: la versión
anterior de `fn_update_customer_channel_identity` sí es recuperable (`schema_migrations` versión
`20260110211238`, 2 296 caracteres) pero se omite porque era defectuosa y revertía todo INSERT entrante
en `messages`; el archivo cita la fuente para reconstruirla con criterio. `crm_v4_f00_30` lleva el
cuerpo **exacto** de la versión anterior (`schema_migrations` versión `20260901202059`, sha256 en el
archivo) y una advertencia de orden: solo es válido si antes se revierte `20260909052947` (F9-31), que
es la versión viva de `fn_sync_status_from_stage`. Los de seeds/backfills (`f00_04`, `f00_07`, `f00_21`,
`f00_24`, `f00_31`, `f06_01`) advierten que no restauran datos. Para migraciones futuras: el `.sql` se
escribe ANTES de aplicar; la reconstrucción posterior solo es posible mientras
`schema_migrations.statements` conserve el texto.
