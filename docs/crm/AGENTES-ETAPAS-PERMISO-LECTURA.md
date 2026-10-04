# Etapas del editor de agentes: permiso de lectura

El aviso «Error: Etapa» de la lista y el fallo del paso «Guion por etapas»
compartían `GET /api/crm/voice-agents/editor-context`. Esa ruta lee embudos,
productos y la URL de la política de datos con la sesión del usuario. Un error
en cualquiera de las tres consultas impide publicar el contexto completo.

El catálogo real de Supabase confirmó que `comm_settings.data_policy_url`
existía, pero `authenticated` no tenía `SELECT` sobre esa columna. La migración
que añadió la URL había omitido el grant. Los permisos CRM del administrador
no sustituyen los privilegios de PostgreSQL. La relación `stages.pipeline_id`
con `pipelines.id` y las columnas del editor son válidas.

Se aplicó por MCP `20261004023314_crm_editor_voz_lectura_politica_datos`:
`GRANT SELECT (data_policy_url) ON TABLE public.comm_settings TO authenticated`.
El archivo versionado coincide con `schema_migrations.statements` (MD5
`44d7328a84913377acce684bc2533c10`). Incluye rollback del único permiso añadido.
No modifica filas, permisos de escritura, credenciales ni políticas RLS.

La prueba previa en `BEGIN/ROLLBACK` concedió el permiso dos veces y comprobó
la planificación de la consulta bajo `authenticated`, sin leer datos de una
organización ni representar una sesión real. Después del rollback el permiso
seguía ausente. Después de aplicar, la consulta compila y el catálogo confirma:

| Comprobación | Resultado |
| --- | --- |
| SELECT de `data_policy_url` para authenticated | permitido |
| UPDATE de `data_policy_url` para authenticated | denegado |
| SELECT de toda `comm_settings` para authenticated | denegado |
| SELECT del token Twilio para authenticated | denegado |
| SELECT de `data_policy_url` para anon | denegado |
| RLS de `comm_settings` | activo |
| Hash de las políticas antes y después | idéntico |

El hash de políticas es `f2b62e5db469758166b971462e96e057`. La escritura de la
URL conserva su ruta de configuración, con administrador y organización
validados en el servidor; no necesita conceder UPDATE al cliente.

El test del handler real sustituye sólo sesión e I/O del SDK. Comprueba
contrato de etapas/productos/política, filtros por organización, permisos CRM
canónicos, denegación previa a consultas y errores sin devolver catálogos
vacíos ni exponer SQL. Una URL no configurada permite consultar las etapas.
Esta evidencia no acredita una sesión real ni integraciones de llamadas.

La lista identifica qué lectura falló, en lugar de mostrar «Error: Etapa».
El editor distingue la denegación de la lectura y conserva el kit de estados
existente. Sus GET reutilizan el plazo común (60 segundos en desarrollo,
20 en producción), cancelan al abandonar o cambiar de contexto y descartan
respuestas retiradas. Los reintentos son manuales; no repiten escrituras.

Recargar tras guardar una etapa mantiene montados los borradores de las demás.
Un borrador conserva la versión con la que comenzó; una relectura no le asigna
la versión de un cambio ajeno. Las filas limpias se reconcilian y un guardado
propio incorpora la versión devuelta por el servidor. Durante una lectura
incompleta o fallida se bloquea guardar, sin borrar los borradores.

## Verificación final

- 47 pruebas focales aprobadas: 11 del handler y 36 de lista/editor/política.
- Jest global: 19.104 casos y 1.134 suites aprobados; ocho casos y una suite
  omitidos existentes, sin fallos. Son 30 regresiones nuevas frente a fase 84.
- TypeScript global y ESLint de los seis archivos TypeScript del delta: salida 0.
- Seis zonas canónicas: 809 casos y 26 suites aprobados por zona.
- Next 15.5.9: build aprobado con 367 páginas estáticas y trazas completas.
  Fuente de producción congelada antes de compilar, idéntica por SHA256 a la
  copia filtrada con `.vercelignore`; las pruebas finales se ejecutaron en el
  árbol de trabajo. Se reutilizaron las dependencias locales instaladas. Los
  avisos existentes de configuración y parche opcional SWC/DNS no impidieron
  compilar. Esto no acredita el runtime remoto ni una sesión de usuario real.
