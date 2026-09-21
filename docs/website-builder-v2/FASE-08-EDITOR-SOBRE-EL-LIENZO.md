# Fase 08 — Editor visual sobre la página

Estado: pendiente; **etapa 6** (ADR-002). Depende de F07. Ya no condiciona a F09. Resultado: experiencia de edición directa inspirada en herramientas de lienzo, dentro de una estructura web responsive.

## UX y componentes

Tres zonas: árbol de páginas/secciones a la izquierda, lienzo al centro e inspector contextual a la derecha. Barra superior para sitio/página, dispositivo, zoom, historial, guardado y publicación. Diferenciar modo Editar y modo Interactuar: en el primero un clic selecciona; en el segundo abre menús, pestañas y navegación de demostración.

Reutilizar `EditorSidebar.tsx`, `EditorHeader.tsx`, `useHistory.ts`, campos existentes y `PageSEOPanel.tsx`. Crear componentes propuestos `CanvasSelectionOverlay`, `CanvasToolbar`, `LayersPanel`, `BlockInspector` y un store/reducer único del documento. Las piezas nuevas deben extraerse del editor actual, no crear un segundo editor divergente.

- F08-01. Clic/hover identifica sección y bloque con IDs estables. Breadcrumb del seleccionado: página → sección → bloque. Inspector muestra contenido, datos, diseño y visibilidad aplicables.
- F08-02. Edición de texto inline para slots declarados, con confirmación/cancelación y saneamiento. El DOM no es la fuente de verdad: cada cambio se convierte en operación tipada del documento. Manejar composición de texto/IME sin cortar palabras.
- F08-03. Reordenar secciones/bloques mediante arrastrar y también botones/teclado. Mostrar destinos válidos; no permitir soltar un bloque en una ranura incompatible.
- F08-04. Duplicar, copiar estilo, ocultar por dispositivo, guardar preset y restablecer. Duplicar genera IDs nuevos; copiar estilo no cambia datos/acciones del destino.
- F08-05. Selección de imagen abre biblioteca y punto focal; video permite poster/alternativa. Redimensionamiento usa anchos/proporciones permitidas, no posiciones absolutas que rompan móvil.
- F08-06. Undo/redo cubre todo el documento: tema, páginas, SEO, menús, header/footer y secciones. Agrupar escritura/drag en operaciones coherentes; no guardar una entrada por carácter. Publicación tiene historial distinto.
- F08-07. Cambio de página/sitio solicita resolver cambios locales cuando haga falta, preserva borrador y limpia todos los pendientes del contexto anterior. La advertencia se muestra solo cuando hay riesgo real de perder cambios.

## Backend

El reducer local alimenta F03 y F07: una operación produce estado para preview y para persistencia, evitando mapas pendientes incompatibles. Autoguardado con versión esperada; error de red no dispara publicaciones ni reescrituras completas sin control. Un conflicto muestra versiones y permite conservar trabajo como borrador recuperable.

Comandos permitidos: insertar, mover, cambiar campo, cambiar variante, duplicar, eliminar, restablecer y asignar recurso. Validarlos otra vez en servidor al persistir. Las variantes nuevas migran campos compatibles y advierten qué campos dejan de mostrarse, sin perder datos hasta confirmar.

## Base de datos

Reutilizar borrador/versionado de F03 y presets de F01/F09. No guardar posición del cursor, hover o zoom en tablas de negocio. Preferencias de usuario pueden persistirse por usuario/sitio si se necesita, con RLS; nunca como configuración publicada.

Contenido heredado se edita mediante «personalizar aquí» o mediante apertura explícita del original. La acción de personalizar crea IDs/referencias locales consistentes, no cambia los registros del sitio padre.

## Aceptación y reversión

- [ ] Se completa portada → cambiar foto/título/fondo → mover sección → cambiar footer → preview móvil → publicar sin salir del editor.
- [ ] Deshacer/rehacer produce exactamente el estado esperado en lienzo y guardado.
- [ ] Edición por teclado y lector de pantalla tiene alternativa a drag/drop y selección por coordenadas.
- [ ] Zoom no cambia el breakpoint: 390 px sigue siendo un viewport de 390 aunque el lienzo se muestre reducido.
- [ ] Una sección oculta en móvil permanece en el árbol y se puede volver a activar.
- [ ] Error de guardado, token expirado o renderer incompatible conservan el trabajo y muestran recuperación.

Recuperación: desactivar edición inline/drag y mantener inspector y comandos del documento. No perder contenido ni volver a escritura directa sobre secciones publicadas.
