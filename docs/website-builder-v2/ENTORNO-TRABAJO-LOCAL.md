# Entorno Supabase — trabajo-local

**Estado actual: eliminada por solicitud explícita del usuario.** El MCP confirmó la eliminación y la consulta posterior de branches solo devolvió `main`, saludable. Los identificadores siguientes se conservan como historial; no deben usarse como destino de trabajo. El usuario eligió continuar sobre producción con precaución, según las condiciones del plan maestro.

Creado por solicitud del usuario mediante MCP. Fecha local: 2026-09-19; creación registrada por Supabase: 2026-09-20T03:30:20Z.

## Identificación y alcance

| Campo | Valor |
|---|---|
| Nombre | `trabajo-local` |
| Project ref de desarrollo | `xcxsfsdnbfbmvwzkemvb` |
| Branch ID | `6250cd88-55ab-495b-995b-b5776b4daf59` |
| Proyecto padre de producción | `jgmgphmzusbluqhuqihj` |
| Copia de datos | `with_data=false` |
| Persistente | `false` |
| Último estado antes de eliminar | `MIGRATIONS_FAILED` |

**Registro previo a la eliminación:** la instancia respondía a consultas mediante MCP, pero el esquema quedó parcialmente reconstruido. No se cambiaron variables de entorno de los repositorios ni se aplicaron correcciones en producción. El proyecto padre reportó `ACTIVE_HEALTHY`; esto es un estado de plataforma, no una prueba funcional de todos los módulos.

El precio confirmado por MCP para esta organización fue USD 0,01344 por hora de branch Micro. Se eliminó manualmente durante esta tarea; no se esperaron 48 horas. La eliminación no cancela los cargos que se hayan generado mientras existió. No se consultó la factura final.

## Evidencia del bloqueo

- La creación devolvió `CREATING_PROJECT` y luego `list_branches` mostró `MIGRATIONS_FAILED`.
- La última migración enumerada en la branch fue `20250609093504`, `rls_permissions`.
- La siguiente versión en el historial del padre es `20250609095433`, `habilitar_rls_tablas_adicionales`.
- Se verificó el esquema de metadatos por MCP y se leyó esa migración en producción, sin modificarla. Sus sentencias habilitan RLS sobre `branches`, `employee_permissions` e `invitations`.
- `list_tables` en la branch no muestra `public.invitations`. La ausencia de esa tabla es una causa probable del fallo al reproducir esa migración; no se obtuvo el log exacto del despliegue.
- El esquema parcial también mantiene varias tablas sin RLS. No cargar datos de clientes ni usarlo como entorno de prueba equivalente a producción en este estado.
- El panel web redirigió a inicio de sesión; el MCP disponible no expone logs del despliegue. `get_project` de la branch devolvió NotFound, aunque `list_branches`, `list_migrations` y `list_tables` sí acceden a ella.

## Qué copia y qué falta

La operación MCP utilizada reproduce migraciones en una base nueva y no transporta registros de producción. Puede haber catálogos iniciales insertados por las propias migraciones; eso no equivale a copiar organizaciones, usuarios, ventas o contenido de páginas. Los archivos de Storage tampoco deben darse por copiados.

La reconstrucción completa quedó pendiente y ya no es una tarea activa sobre esta branch eliminada. No cambiar el historial de producción, omitir migraciones ni crear tablas ficticias para resolver este incidente histórico. Si se retoma un entorno separado, requiere otra creación y otra verificación.

Las conexiones existentes de ambos proyectos permanecieron sin cambios. Crear y eliminar la branch no las redirige automáticamente.

Referencia: [funcionamiento de branching](https://supabase.com/docs/guides/deployment/branching), [facturación de branches](https://supabase.com/docs/guides/platform/manage-your-usage/branching).
