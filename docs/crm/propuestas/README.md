# Propuestas SQL pendientes del CRM

Estos archivos son candidatos revisables y **no están aplicados**. No son registros de schema_migrations y no pertenecen al conjunto ejecutable de supabase/migrations.

La reparación de historial de reuniones y su reversión tienen revisión estática independiente. Los bytes finales todavía requieren pruebas reales, MD5 por MCP y comprobación de limpieza; la conexión SQL terminó por timeout. Los resultados del candidato anterior no validan estos archivos.

El estado, la evidencia y el siguiente gate están en la sección 60 de [PLAN-FIGMA-A-CODIGO.md](../PLAN-FIGMA-A-CODIGO.md). Tras pasar ese gate, la aplicación se hará únicamente por MCP, con SQL exacto, rollback y versión real documentados conforme a [POLITICA-MIGRACIONES.md](../../POLITICA-MIGRACIONES.md).
