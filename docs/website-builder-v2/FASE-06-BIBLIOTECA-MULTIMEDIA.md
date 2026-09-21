# Fase 06 — Imágenes, videos y recursos preestablecidos

Estado: pendiente; **etapa 4, en paralelo con F09**. Depende de F03 y del contrato visual de F04. Resultado: una plantilla se ve terminada desde el primer momento y el cliente reemplaza sus recursos desde el editor.

Preferencia del usuario: usar el MCP de Higgsfield si hace falta generar imágenes o videos para el catálogo inicial. Aplicar su skill y capacidades pertinentes cuando se ejecute esa tarea; registrar procedencia, condiciones de uso y archivo generado. Esta preferencia no modifica imágenes actuales ni activa generación durante F00.

## UX y componentes

Ampliar `fields/ImageField.tsx` y el cargador actual de `websiteSettingsService.ts`. Crear componentes propuestos `MediaLibrary`, `MediaPicker`, `VideoField`, `FocalPointEditor` y `AssetUsagePanel` en el dominio de branding. Pestañas: recursos propios, biblioteca inicial y archivos usados por el sitio.

Permitir subir/reemplazar, buscar, filtrar por imagen/video/logo, elegir recorte y foco por dispositivo, editar texto alternativo, elegir poster, revisar progreso/error y reintentar. Reemplazar cambia la referencia del bloque seleccionado; no sobreescribe el archivo compartido por otras páginas.

Los presets contienen recursos iniciales por propósito: hotel, habitaciones, gastronomía, bebidas, panadería, comercio y servicios. Identificar claramente los textos/fotos de demostración. Aplicar una plantilla a un sitio existente ofrece previsualización y selección de alcance; no borra sus archivos ni reemplaza silenciosamente el contenido actual.

## Backend y procesamiento

- F06-01. Verificar Storage existente y rutas de subida. Reutilizar `organization-assets` solo si sus políticas y naturaleza pública/privada son adecuadas; el nombre encontrado en código no prueba permisos efectivos.
- F06-02. Autorizar subida por organización/sitio, validar MIME real, formato, tamaño y dimensiones. Nombres opacos, sin overwrite y sin datos de cliente en rutas públicas. Limitar formatos iniciales a un conjunto soportado; rechazar SVG/HTML activo sin saneamiento específico.
- F06-03. Generar derivados para miniatura, tarjeta y hero con dimensiones apropiadas. Guardar ancho/alto, checksum y peso; conservar original para futuros recortes autorizados.
- F06-04. Video con poster obligatorio, sin sonido automático, fallback de imagen y opción de movimiento reducido. Validar formatos reproducibles y límites configurables. Archivos grandes requieren procesamiento asíncrono: estado pendiente/procesando/listo/error; nunca bloquear la petición esperando una transcodificación larga.
- F06-05. Definir presupuestos iniciales por tipo y medir en F00/F13: miniaturas, hero, video y documento de preview. Seleccionar servicio de derivados/transcodificación disponible después de inventariar infraestructura, sin inventar una dependencia ya instalada. Habilitar solo los formatos/procesos realmente implementados.
- F06-06. Publicación verifica que todos los recursos obligatorios estén listos y accesibles con la política esperada. Eliminar un recurso referenciado se bloquea o archiva; las revisiones retenidas siguen siendo restaurables.
- F06-07. Presets del sistema usan manifiesto de recursos versionado: procedencia, licencia, autor cuando corresponda, alcance de distribución y atribución. Recursos privados del cliente nunca se incorporan al catálogo global.

## Base de datos propuesta

Reutilizar catálogo multimedia si existe tras verificar MCP. De lo contrario: `website_media_assets` para activos de tenant, referencias de uso/revisión y una cola de trabajos si no hay infraestructura equivalente. Metadatos: organización, sitio propietario opcional, clave de almacenamiento, tipo, medidas, duración, poster, derivados y estado. Todos son campos propuestos.

Separar archivos privados/borrador y recursos públicos. Una URL pública no se vuelve privada al borrar su fila: la política de almacenamiento y publicación debe ser real. Para recursos privados, servir URLs temporales solo a sesiones autorizadas. El catálogo compartido del sistema tiene lectura pública explícita y escritura administrativa restringida; no confundirlo con una organización cliente.

## Aceptación y reversión

- [ ] Instalar preset en borrador produce una composición con imágenes/videos listos; sustituir cada recurso funciona sin código.
- [ ] Subidas de otra organización, archivos inválidos y cuotas excedidas se rechazan en servidor.
- [ ] Fallo/cancelación de subida no rompe lo publicado; archivos huérfanos se limpian con retención y registro.
- [ ] Restaurar revisión conserva los recursos que utiliza; las nuevas publicaciones no reutilizan URLs privadas vencidas.
- [ ] Video no impide leer contenido ni reservar; móvil y movimiento reducido reciben alternativa adecuada.

Reversión: desactivar nuevos procesadores/presets y mantener lectura de recursos ya publicados. Dropbox puede añadirse después como importador autorizado; no es necesario para el lienzo ni para el catálogo inicial y no se conecta en esta fase por defecto.
