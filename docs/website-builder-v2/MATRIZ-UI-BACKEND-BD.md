# Matriz de implementación — UI/UX, backend y base de datos

Estado: **especificación propuesta, pendiente de implementación**. Complementa el [plan maestro](PLAN-MAESTRO.md). Cada entrega se completa de extremo a extremo: control del editor, validación, persistencia, vista previa y comportamiento público. Una mejora visual aislada no cierra una capacidad funcional.

## Recorrido principal de la persona que edita

1. **Elegir sitio.** Mostrar organización o outlet, dirección pública, estado y revisión publicada. Permitir preparar un outlet todavía no publicado. Al cambiar de sitio, resolver cambios pendientes y limpiar selección, SEO, menús y recursos temporales del anterior.
2. **Elegir página.** Árbol con portada, páginas editoriales y plantillas de detalle. Mostrar cuáles son propias y cuáles heredadas. «Personalizar aquí» crea una copia editable local; editar el original es otra acción explícita.
3. **Editar viendo el resultado.** Páginas y capas a la izquierda, página real al centro, propiedades a la derecha. Seleccionar texto, foto, sección, header o footer abre sus controles aplicables. El modo Interactuar permite probar navegación sin ejecutar operaciones reales.
4. **Revisar móvil.** Cambiar ancho del viewport y herencia de estilos por dispositivo. El zoom solo cambia el tamaño visual del lienzo. Los componentes ocultos siguen disponibles en el árbol.
5. **Guardar y publicar.** Autoguardado del borrador, estado visible y recuperación de errores. Publicar muestra el sitio y los cambios incluidos; solo después de validar se cambia la revisión pública completa.

La pantalla de branding conserva su función de entrada y resumen. El editor concentra la modificación visual. Las pantallas antiguas deben reconocer si el sitio adoptó V2 y evitar escrituras directas que omitan sus borradores.

## Entregas conectadas

Los nombres de tablas siguientes son **propuestas lógicas**, sujetas a verificación y reutilización del esquema mediante MCP. No son afirmaciones de existencia ni SQL ejecutable. «Documento» significa el contrato versionado de presentación de F01, persistido en borradores y revisiones de F03.

| Capacidad y fase | Cambio UI/UX | Backend | Base de datos | Evidencia para cerrar |
|---|---|---|---|---|
| Contexto de sitio · F02 | Selector de organización/outlet con estado y URL; incluye outlets en preparación | Resolver organización desde sesión; comprobar pertenencia del outlet y permisos; cancelar respuestas del contexto anterior | Alcance global/outlet inequívoco; índices y unicidad compatibles con ambos | Cambiar del hotel al restaurante no mezcla datos, ni siquiera con peticiones lentas |
| Borrador · F03 | Estados Cambios locales, Guardando, Guardado, Error y Conflicto | Validar documento y versión esperada; reintentar fallos transitorios sin sobrescribir otra versión | Borrador por sitio, versión optimista y revisión base | Agregar, borrar o cambiar cualquier elemento no modifica el sitio público |
| Publicación · F03 | Resumen del sitio completo y errores vinculados al campo | RPC atómica, idempotencia, validación de recursos y compatibilidad del renderer | Revisión inmutable, puntero público y evento de invalidación | Publicación repetida no duplica efectos; fallo antes del commit conserva la revisión anterior |
| Historial · F03/F08 | Deshacer/rehacer local y panel separado de revisiones publicadas | Restaurar como borrador nuevo; verificar revisión y sitio | Conservar revisiones y autoría autorizada; nunca borrar historia para restaurar | Recuperar una revisión restaura también tema, menús, SEO y shell |
| Marca y fondo · F04 | Identidad pública, logos, fuentes y fondos independientes para cada sitio | Resolver tokens y herencia explícita; validar valores y referencias | Documento con heredar/definir/vaciar; snapshot efectivo al publicar | Restaurante cambia fondo y marca sin cambiar hotel ni identidad legal |
| Header/footer · F05 | Elegir composición, navegación, CTA, colores, alturas y comportamiento móvil | Resolver shell único para portada, páginas y detalles | Configuración del shell y `menus[]` dentro del documento (ADR-002 D3); sin tabla de asignaciones | Una página de habitación o producto conserva el header/footer del sitio correcto |
| Páginas y enlaces · F05 | Crear, ordenar, duplicar y ocultar páginas; selector de enlaces internos | Constructor único de URLs; rutas profundas, SEO y contexto de outlet | Identidad estable de página y slug único por sitio; referencias internas por ID | Enlace al detalle funciona desde dominio propio y desde prefijo del outlet |
| Imágenes/videos · F06 | Biblioteca con recursos iniciales, reemplazo, recorte, punto focal, poster y texto alternativo | Validar tipo/tamaño, acceso y disponibilidad; generar derivados cuando se necesiten | Metadatos, procedencia/licencia y referencias por revisión; políticas de Storage | Cambiar una foto no cambia otras; un recurso usado por una revisión no desaparece |
| Preview real · F07 | Página viva con estados Cargando, Reconectando y Error recuperable | Mismo renderer; sesión temporal limitada; protocolo con ACK, secuencia y resincronización | Sesión revocable con hash de capacidad, alcance y expiración si requiere persistencia | Fondo, header, footer, páginas y secciones cambian antes de guardar o publicar |
| Acciones en preview · F07 | Respuestas de demostración claramente identificadas | Adaptador de acciones y acceso de solo lectura; bloquear mutaciones con credenciales de preview | Ningún pedido, pago, mensaje o reserva real generado | Probar Comprar/Reservar en el lienzo no produce efectos operativos |
| Edición sobre lienzo · F08 | Seleccionar, editar texto, arrastrar, duplicar y mover también por teclado | Operaciones tipadas; validación de ranuras y límites del contrato | IDs nuevos al duplicar; documento como fuente de verdad | Guardar y recargar reproduce exactamente el orden, texto y diseño editados |
| Responsive · F04/F08/F09 | Mostrar valor heredado y excepción por dispositivo; restablecer excepción | Resolver estilos deterministas con los mismos breakpoints en preview y público | Excepciones responsive dentro del documento; sin tabla por dispositivo | Una excepción móvil no modifica escritorio; teclado y lector de pantalla siguen operables |
| Secciones y presets · F01/F09 | Catálogo con miniaturas, variantes, ejemplo inicial y campos pertinentes | Registro común de esquema, controles y renderer; migración de versiones | Props independientes por instancia; presets versionados y recursos referenciados | Dos galerías o menús en una página mantienen contenido propio; ningún control queda sin efecto |
| Hotel · F10 | Habitaciones, amenidades, experiencias y reservas con diseño configurable | Consultar PMS y disponibilidad desde servicios existentes; preservar permisos y alcance | Referencias a entidades operativas, sin copiar disponibilidad al documento | La habitación mostrada y la acción de reserva corresponden al sitio y a datos vigentes |
| Restaurante · F11 | Carta real, categorías/pestañas, platos, horarios y acciones configurables | Adaptadores de catálogo y servicios de reserva/pedido existentes; declarar integración faltante | Referencias a catálogo/sucursal; contenido editorial separado de precio operativo | Pestañas filtran realmente; enlaces y reservas/pedidos completan el flujo que anuncian |
| Tiendas y servicios · F12 | Productos, colecciones, campañas, formularios y continuidad visual del carrito | Reutilizar pedidos, impuestos, stock y pagos; formularios con destino validado | No duplicar tablas operativas por cambiar presentación | Editar diseño no cambia totales ni stock; los formularios entregan al destino configurado |
| Adopción segura · F00/F13 | Activación explícita por sitio, comparación previa y recuperación | Adaptadores legado/V2, versión compatible de ambos proyectos y despliegue gradual | Migraciones verificadas, respaldo lógico de presentación y flags de adopción | Sitios que no adoptan V2 conservan su contenido y comportamiento |

## Estados y errores que forman parte de la UX

- **Guardado fallido:** conservar cambios locales, explicar el problema y ofrecer reintentar. No mostrar «Guardado» hasta recibir confirmación con versión del servidor.
- **Conflicto entre editores:** conservar una copia recuperable del trabajo; permitir revisar la versión remota. No resolver con «última escritura gana» silencioso.
- **Herencia:** mostrar origen del valor y acciones Personalizar aquí / Volver a heredar. El cambio del padre no publica automáticamente el sitio hijo.
- **Datos vacíos:** ofrecer configurar la fuente o crear contenido mediante el flujo existente. Los ejemplos de plantilla no deben aparentar ser productos o reservas reales disponibles.
- **Funcionalidad sin integración:** explicar qué falta y ofrecer configurar el destino. No presentar un botón de éxito simulado en el sitio público. El cierre de la fase exige la integración real cuando esa capacidad forma parte del alcance.
- **Multimedia procesándose:** mostrar progreso y alternativa; impedir publicar referencias que todavía no tengan representación pública válida.
- **Preview desconectado:** mantener edición y borrador; reconectar y reenviar el snapshot antes de nuevas operaciones. Una respuesta antigua no debe aparecer en el sitio recién seleccionado.
- **Publicación con caché pendiente:** distinguir commit confirmado de propagación pendiente; reintentar invalidación sin crear revisiones repetidas.

## Responsabilidad de los datos

| Información | Dónde vive | Regla |
|---|---|---|
| Diseño, contenido editorial, SEO, menús y referencias multimedia | Documento de borrador y revisión publicada | Validación por contrato y alcance del sitio |
| Precio, impuestos, stock, disponibilidad, pedidos, pagos y reservas | Servicios y tablas operativas existentes | Se consultan con contexto autorizado; no se congelan como verdad comercial en una plantilla |
| Cursor, hover, zoom y selección | Estado del editor | No forman parte de la publicación |
| Archivos multimedia | Storage con política explícita; metadatos y referencias en BD | El acceso de borrador y publicado debe corresponder al estado real del recurso |
| Capacidad de preview | Memoria del cliente y registro revocable del servidor cuando corresponda | Expira, está limitada a un sitio y no autoriza mutaciones operativas |

Toda tabla nueva de tenant debe incluir aislamiento y pertenencia comprobable; no basta con que el frontend filtre por organización. Las operaciones que modifican varias tablas deben ser transaccionales. Antes de escribir SQL se verifican tablas, columnas, índices y políticas por MCP; aplicación y archivos de migración/rollback siguen la política del ERP.

## Puerta de cierre por capacidad

Registrar evidencia de: **editar → ver preview → guardar → recargar → publicar → comprobar sitio público → recuperar revisión**, incluyendo la variante móvil y un outlet distinto. Añadir pruebas de aislamiento, conflicto o transacción cuando la capacidad lo requiera.

La matriz especifica los cambios necesarios; no certifica que ya estén implementados. Los detalles de archivos, dependencias, pruebas y recuperación están en cada fase enlazada desde el plan maestro.
