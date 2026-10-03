# Biblioteca de voces: esperas, cancelación y reintento

La petición `/api/crm/voices/library?page=0&language=es` podía seguir esperando
en el servidor después del límite de 20 s del navegador. El transporte y el
cuerpo de respuesta de ElevenLabs no tenían límite. Además, el estado inicial
de proveedores se mostraba como una lectura fallida antes de consultar el
registro; esa consulta esperaba primero al catálogo y su enriquecimiento.
Estos defectos se reprodujeron con transportes simulados. No identifican por
sí solos qué servicio estuvo lento en la sesión reportada.

## Comportamiento corregido

- La lectura de configuración TTS tiene 4 s y falla explícitamente con 503/504.
  Una lectura desconocida no activa la clave de plataforma. El fallback
  establecido sigue disponible cuando se confirma que no hay credencial propia.
- Las lecturas de ElevenLabs tienen 10 s, incluida la lectura del cuerpo y de
  errores. Las rutas de biblioteca, catálogo y configuración TTS tienen 18 s
  para sesión, membresía y resultado; el navegador conserva sus 20 s.
- La cancelación llega al transporte Supabase y al proveedor. Un aborto por
  navegación no se informa como timeout ni como falta de permisos.
- Catálogo y estado de proveedores se consultan en paralelo. La comprobación
  pendiente no se presenta como un fallo. Si ElevenLabs no responde, el catálogo
  nativo conserva sus filas sin inventar datos de plan ni previsualización.
- Las lecturas coincidentes de biblioteca, workspace y plan comparten petición
  por organización y huella de la credencial. Cancelar un consumidor no cancela
  los demás; cancelar el último retira y aborta la petición. Fallos y respuestas
  retiradas no repueblan la caché. Rotar una clave invalida su identidad de caché;
  el audio también se separa por voz y modelo. No se cachean secretos.
- El scroll se detiene tras un error; sólo el botón de reintento o un cambio de
  filtros inicia otra carga. Respuestas de filtros u organizaciones anteriores
  se descartan. Tras añadir, clonar, importar, borrar o cambiar la voz por defecto,
  la recarga fuerza una lectura nueva aunque hubiera otra pendiente.
- Los POST/DELETE no se reintentan automáticamente. Síntesis y clonación conservan
  presupuestos propios de 60/120 s; añadir y borrar usan 30 s. No se cambian roles,
  permisos, sucursales, credenciales ni políticas.

## Evidencia y alcance

Pruebas de regresión locales cubren headers/cuerpo/error-body detenidos,
cancelación antes y después de headers, limpieza de timers, 401/403 reales,
deadline del contexto, error recuperable sin catálogo vacío ficticio, configuración
desconocida sin fallback, tenant/rotación, consumidores concurrentes, finalización
tardía, scroll y recarga posterior a escritura. Se ejecutan sin base de datos ni
proveedores reales.

Tablas y columnas de `provider_configs` y `voices` verificadas por el MCP de
Supabase; `abortSignal` contrastado con la referencia oficial JavaScript.
No hay migración SQL, pruebas de carga, envíos, síntesis ni llamadas externas en
esta corrección. El resultado global de tipos, pruebas y build se registra en
la fase 82 de `PROGRESS.md`. El despliegue del preview no acredita una sesión
CRM real ni el estado actual de la cuenta ElevenLabs.
