# Biblioteca de voces: esperas, cancelación y reintento

## Corrección de espera previa al handler — 2026-10-03

Una nueva captura seguía mostrando el timeout de 20 s junto con la comprobación
de TTS fallida y «Cargando agentes...». La captura incluye el nuevo botón de
reintento, por lo que no se atribuyó el problema a una versión antigua.

Se reprodujeron dos defectos adicionales sin consultar la base real:

- La validación remota de sesión dependía de que `fetch` y su cuerpo obedecieran
  una señal de cancelación de 1,5 s. Si no la obedecían, varios consumidores
  quedaban esperando la misma promesa antes de entrar al handler. Ahora un
  plazo explícito cubre petición y cuerpo; retira la promesa compartida y una
  respuesta tardía no puede dar sesión ni poblar la caché. Las comprobaciones
  de firma, usuario, rol, expiración y escritorio conservan sus contratos.
- La lista de agentes esperaba cuatro lecturas sin plazo, incluido el contexto
  del editor. La lista y los datos complementarios pasan a resolver por separado,
  con cancelación y un plazo finito. Un fallo complementario se informa sin
  convertir una lista válida en una carga infinita.
- Activar un agente recargaba la lista antes de limpiar su estado ocupado y
  dejaba todos los interruptores deshabilitados. Se limpia ese estado antes de
  recargar, conservando las guardas para una respuesta de otra organización.

Los GET de biblioteca, catálogo, proveedores y agentes registran etapas de
middleware con el identificador `x-go-crm-read-id`; Biblioteca reutiliza ese
identificador al entrar al handler y durante contexto y proveedor. Cada evento
incluye hora en milisegundos, duración, ruta fija y etapa. El cierre añade estado
HTTP y un código permitido. No registra búsquedas, tokens, credenciales, usuarios
ni organizaciones. Las escrituras no llevan estas trazas.

Un probe HTTP local con identidad sintética sólo para middleware, sin sesión
SSR, alcanzó los cuatro handlers y recibió sus 401 en unos 8 s. En Biblioteca
se midieron 10–12 ms de middleware, 6,7 s de compilación y unos 7,2 s de pausa
antes del handler, que terminó en 37 ms. No hubo consulta de datos ni proveedor.
Esto verifica el margen de arranque en ese entorno; no es una sesión CRM real.

Estas lecturas reutilizan el presupuesto de Llamadas: 60 s sólo en desarrollo,
20 s en producción. Se comprueba una lectura de 25 s en desarrollo, sin repetir
la petición, y el cierre finito a 60 s. El handler de Biblioteca conserva 18 s,
incluida sesión, membresía y proveedor; ese plazo comienza tras la compilación.
Las reproducciones no prueban que el fallo de la sesión reportada tenga la misma
causa. Para acreditarlo hay que correlacionar las etapas de su petición real;
no se declara verificada la biblioteca de ElevenLabs con una sesión de cliente.

## Verificación de la corrección del arranque

Jest global: 19.074 pruebas y 1.132 suites aprobadas, 8 pruebas y una suite
omitidas existentes. Son 64 regresiones nuevas respecto de la corrección de
Llamadas. Tipos globales y ESLint de los 15 archivos de código pasan. Las seis
zonas canónicas aprueban 809 pruebas en 26 suites cada una. Los nuevos focos de
Auth, handler, trazas, interfaz y activación también pasan en Bogotá.

Build final aprobado: Next 15.5.9, compilación en 5,4 minutos, 367 páginas,
optimización y trazas completas. Se compiló la fuente congelada en una copia
filtrada con `.vercelignore` y dependencias locales existentes; sólo esta
documentación y el acta se completaron después. Esta verificación local no
equivale a comprobar la sesión o los proveedores reales en producción.

## Origen de la corrección inicial

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
  para sesión, membresía y resultado; el navegador usa 20 s en producción
  y 60 s en desarrollo para incluir la compilación previa del handler.
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
