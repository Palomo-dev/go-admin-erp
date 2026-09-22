# Inventario de tablas auxiliares sin RLS — 2026-09-19

**Estado:** registrado; sin cambios aplicados.
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
