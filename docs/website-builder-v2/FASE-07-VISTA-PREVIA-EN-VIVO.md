# Fase 07 — Vista previa interactiva del borrador

Estado: pendiente; **etapa 6** (ADR-002). Depende de F03–F05. Hasta entonces el preview es el iframe actual recargado tras guardar el borrador, apuntando al sitio/outlet seleccionado con su revisión de borrador. Resultado: editar fondo, header, footer, texto, imagen, video, menú o sección actualiza la página visible sin publicar ni recargarla completamente.

## Decisión y alternativas

Usar un iframe de preview en origen controlado distinto del ERP, servido por `goadmin-websites`, que reutilice sus componentes de presentación. El editor envía el estado del borrador y el iframe devuelve selección/navegación y confirmación de aplicación. El render público puede seguir usando sus optimizaciones de servidor; no convertir todo el sitio en una SPA para permitir edición.

Un sandbox de ejecución por organización no aporta valor al editar documentos declarativos y añade arranque, coste y otra versión del renderer. Dropbox almacena archivos, no resuelve renderizado. Next.js Draft Mode permite previsualizar contenido no publicado, pero no suministra por sí solo selección de elementos ni actualización de estado en memoria. Referencia: [Draft Mode de Next.js 14](https://nextjs.org/docs/14/app/building-your-application/configuring/draft-mode).

## UX y componentes

ERP: evolucionar `EditorPreview.tsx`; mostrar estado conectando/listo/reconectando/incompatible, ancho real del viewport, escala del lienzo, selección y último cambio aplicado. Si se pierde conexión, conservar el borrador y ofrecer reconectar; no sustituirlo silenciosamente por la página publicada.

Websites: evolucionar `PreviewBridge.tsx` y `PreviewableSections.tsx`; crear ruta propuesta `/__editor-preview`, `PreviewSiteRoot` y adaptador de acciones de demostración. Reutilizar `SiteShell`, tema y renderizador. Extraer funciones de presentación compartidas donde existan componentes acoplados a consultas de servidor; los adaptadores obtienen datos, las vistas los presentan.

## Sesión y aislamiento

- F07-01. ERP crea sesión de preview mediante `POST /api/website/preview-sessions`, partiendo de `getServerOrgContext()` y permiso de edición. Scope: sitio, borrador, usuario, origen editor, origen preview y expiración. El selector no envía una organización efectiva.
- F07-02. El iframe inicia sin contenido privado. Intercambio READY/INIT con `event.origin` y `event.source` exactos; entregar capacidad temporal solo al iframe esperado. No tokens en URL, historial, logs, `localStorage` ni HTML indexable. Mantenerlos en memoria y renovar mediante sesión ERP válida.
- F07-03. La capacidad solo permite leer DTOs de preview del sitio/borrador. El backend de preview valida expiración, revocación, audiencia y alcance. No aceptar esa capacidad en APIs de pedidos/pagos/reservas. Evitar dependencia de cookies de terceros para el iframe.
- F07-04. Configurar `frame-ancestors` para los orígenes ERP autorizados, CSP y sandbox mínimo probado. Si se necesitan scripts y `allow-same-origin`, el origen debe ser distinto del padre. No habilitar formularios, popups ni navegación del padre por comodidad. Los medios externos requeridos se autorizan de forma acotada.
- F07-05. Desactivar analytics de producción, píxeles, chat externo y acciones con efectos. `PreviewActionProvider` intercepta reservar/comprar/enviar y muestra una simulación declarada. Las APIs de preview son de lectura; esta separación no depende de ocultar un botón o de `?preview=1`.

La validación de emisor/destino y del mensaje sigue [postMessage en MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage). El sandbox requiere elegir explícitamente las capacidades permitidas; ver [iframe en MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe). Son mecanismos de aislamiento, no sustitutos de la autorización de servidor.

## Protocolo propuesto

| Mensaje | Propósito |
|---|---|
| `READY` | Versión de bridge, renderer y capacidades disponibles |
| `INIT` / `SNAPSHOT` | Documento completo validado, página, sesión y secuencia |
| `PATCH` | Cambios tipados con secuencia/base conocidas, sin HTML arbitrario |
| `ACK` / `ERROR` / `RESYNC` | Confirmación, incompatibilidad o solicitud de snapshot |
| `SELECT` / `HOVER` | ID estable de página/sección/bloque editable |
| `NAVIGATE` | Ruta interna de preview conservando contexto y borrador |
| `VIEWPORT` / `SCROLL_TO` | Ancho real y desplazamiento al elemento |

Todos incluyen versión de protocolo, ID de sesión y secuencia; IDs/tipos/tamaños se validan. No usar `'*'` como fallback. Descartar mensajes viejos; si cambia sitio/página/sesión, cancelar las respuestas pendientes del anterior. Al recargar iframe, reenviar snapshot aunque el contenido no haya cambiado respecto al último envío de la sesión previa.

Cambios visuales usan estado local con debounce corto; autoguardado tiene un ritmo independiente. Las fuentes de datos se consultan en lote al cambiar sus parámetros, con caché por contexto y límite, no en cada pulsación. Navegar dentro del preview no abandona su origen ni abre accidentalmente el sitio vivo.

## Base de datos

Persistir sesiones revocables solo si no existe un mecanismo adecuado: tabla propuesta `website_preview_sessions` con hash de token, usuario, organización/sitio, alcance, expiración y revocación, RLS y sin lectura pública. No guardar token en claro. El documento permanece en F03; no crear una copia por cada pulsación. Referencias a datos operativos se resuelven con autorización y proyección mínima.

## Aceptación y recuperación

- [ ] Cambios de tema, header/footer y secciones se ven sin guardar/publicar; reload/reconexión recupera el estado correcto.
- [ ] Objetivo medible: actualización visual p95 ≤300 ms tras el debounce en documento representativo de 40 secciones; medir dispositivo y condiciones en F00.
- [ ] Preview no envía pedidos, mensajes, reservas, eventos de marketing ni cobros reales.
- [ ] Mensaje de ventana/origen/sitio incorrecto, token vencido y permisos revocados se rechazan.
- [ ] Cambio rápido entre páginas/outlets no aplica patches ni datos del contexto anterior.
- [ ] Publicar el mismo documento reproduce su presentación, salvo datos vivos y overlays del editor.

Reversión: desactivar puente interactivo y usar preview autenticado del borrador guardado con el mismo renderer. Nunca volver a exponer borradores públicamente como solución de contingencia.
