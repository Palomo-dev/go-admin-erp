# Inventario de tablas auxiliares sin RLS — 2026-09-19

**Estado:** cerrado el 2026-09-23 (ver «Cierre» al final). Queda pendiente la propuesta de archivarlas.
**Riesgo:** tablas en el esquema expuesto `public` con RLS desactivado.

| Tabla | Filas estimadas | Tiene `organization_id` |
|---|---:|:---:|
| `_bkp_tallas_co_137` | 13.915 | No |
| `_bkp_tallas_co_137_padres` | 2.619 | No |
| `_bkp_tallas_co_137_stock` | 16.407 | No |
| `_map_tallas_co_137` | 8.816 | No |
| `_map_sufijos_137` | 105 | No |
| `_afectados_sufijos_137` | 240 | No |
| `_bkp_variant_values_137` | 355 | No |
| `_nuevas_tallas_137` | 3.627 | No |
| `_plan_ropa_137` | 3.479 | No |

Aunque ninguna contiene `organization_id`, varias contienen identificadores de
productos, sucursales, lotes, existencias, costos, SKU y atributos. La ausencia de
la columna no significa ausencia de datos de una organización: la pertenencia se
puede inferir por las referencias copiadas.

## Decisión pendiente

No habilitar RLS a ciegas. Primero determinar para cada tabla si todavía participa
en una operación o si es un artefacto temporal ya prescindible:

1. revisar dependencias, funciones, vistas y consultas del repositorio;
2. revisar privilegios efectivos de `anon` y `authenticated`;
3. si ya no se usa, exportar el respaldo fuera del esquema expuesto y retirarla
   mediante una migración aprobada;
4. si debe permanecer, agregar una pertenencia de organización explícita y sus
   políticas antes de habilitar RLS;
5. comprobar desde un usuario de otra organización que no puede leer ni mutar.

Hasta completar esa clasificación, el hallazgo permanece abierto y separado de
F-52.

## Cierre — 2026-09-23

Para entonces eran **11**: a las nueve de arriba se sumaron `_plan_sueltos_137`
(121 filas) y `_bkp_sueltos_nike_137` (11 filas), creadas el 21-09. Todas tenían
`ALL` para `anon` y `authenticated`: con la clave publicable se podían leer o
vaciar por PostgREST. `get_advisors` las marcaba como `rls_disabled_in_public`
(ERROR).

Clasificación hecha antes de tocarlas (los pasos 1 y 2 de la decisión pendiente):

- Ninguna se creó por migración: no están en `supabase_migrations.schema_migrations`.
  Tampoco aparecen en el historial de ninguna sesión de Claude Code. Se crearon a
  mano con SQL directo.
- Ninguna tiene función, vista, clave foránea entrante ni tarea de `pg_cron` que
  la use, y ningún archivo del repositorio las nombra.
- La limpieza que las usó terminó: las 121 filas de `_plan_sueltos_137` tienen su
  `nuevo_id`, y los 121 productos existen.

Como ninguna participa en una operación viva, se cerraron **sin borrar datos**
con `20260923141328_tablas_auxiliares_137_fuera_de_la_api.sql` (el rollback está
en `supabase/rollbacks/`): RLS activada sin políticas y `REVOKE ALL` a `anon` y
`authenticated`. Se verificó que `anon` y un usuario de otra organización reciben
42501, y que `service_role` y `postgres` siguen leyendo. `rls_disabled_in_public`
desapareció. Ahora figuran como `rls_enabled_no_policy` (INFO), que es lo buscado.

El paso 4 (pertenencia y políticas) no aplica, porque ningún usuario debe leerlas.

### Propuesta pendiente: sacarlas de `public`

Son artefactos de una operación terminada y no tienen por qué estar en el esquema
que expone la API. La propuesta es moverlas a un esquema no expuesto, sin
borrarlas:

```sql
create schema if not exists archivo;
revoke all on schema archivo from anon, authenticated;
alter table public._bkp_tallas_co_137 set schema archivo;  -- y las otras 10
```

`ALTER TABLE ... SET SCHEMA` conserva los datos, los índices y los GRANT. Nada las
referencia, así que el cambio no rompe nada. Cuando se dé por cerrada la limpieza
de la org 137, se puede decidir exportarlas y retirarlas. Eso requiere
aprobación explícita.
