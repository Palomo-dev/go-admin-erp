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
