---
name: database-migrations
description: Usar SIEMPRE al crear o modificar el esquema de la base de datos (Postgres/Supabase) — nuevas tablas, columnas, índices, constraints, o cambios de tipo de datos en producción. Especialmente crítico cuando el sistema ya tiene datos reales de usuarios/tenants.
---

# Migraciones de base de datos

## Principios generales
- Toda migración es código versionado (usa el CLI de Supabase o Alembic si es
  Python/SQLAlchemy directo) — nunca cambios manuales vía dashboard/consola en
  un sistema con más de un ambiente.
- Cada migración debe ser revisable en PR como cualquier otro cambio de código.
- Prefiere migraciones pequeñas y frecuentes sobre una migración gigante que
  cambia medio esquema de una vez.

## Zero-downtime / cambios compatibles hacia atrás
Para sistemas en producción con tráfico real, sigue el patrón de "expand and
contract" en vez de cambios destructivos directos:

1. **Expandir**: agrega la columna/tabla nueva sin quitar la vieja. El código
   viejo sigue funcionando.
2. **Migrar datos**: backfill de datos existentes a la nueva estructura (en
   background si es una tabla grande, no bloqueante).
3. **Cambiar el código** para usar la estructura nueva, desplegar.
4. **Contraer**: una vez confirmado que todo usa lo nuevo, elimina la columna/
   tabla vieja en una migración separada, posterior.

Nunca hagas `DROP COLUMN` o `ALTER COLUMN TYPE` destructivo en la misma migración
que se despliega junto con el código que empieza a depender del cambio — deja
ventana para rollback.

## Índices
- Agrega índices para columnas usadas en `WHERE`, `JOIN`, `ORDER BY` frecuentes
  (especialmente `tenant_id` si casi toda query filtra por él).
- En tablas grandes, crear índices con `CREATE INDEX CONCURRENTLY` en Postgres
  para no bloquear escrituras durante la creación.

## RLS y multi-tenancy
- Toda tabla nueva con datos de tenant debe tener su policy de RLS creada en la
  misma migración que crea la tabla, no como una tarea separada "para después".

## Rollback
- Escribe la migración de rollback (`down`) cuando sea razonable, especialmente
  para cambios reversibles (agregar/quitar columna nullable). Para cambios de
  datos irreversibles (borrado masivo), ten un plan de backup antes de ejecutar.

## Checklist antes de aplicar en producción
- [ ] Probada en un ambiente de staging con datos representativos, no solo con
      una tabla vacía.
- [ ] Estimado el tiempo que tomará en una tabla con volumen real de producción
      (una migración que tarda segundos en dev puede tardar minutos/horas en
      una tabla de millones de filas y bloquear el sistema).
- [ ] RLS/policies actualizadas si la tabla es nueva o cambia de estructura.
