# Fase 11 — Restaurante, cafetería, panadería y carta digital

Estado: pendiente; **etapa 5**. Depende de F09; integración con F10. Resultado: varias marcas gastronómicas de una organización con diseño y carta propios.

## UX y plantillas

Familias completas: restaurante de autor oscuro/dividido; restaurante editorial cálido; café/panadería gráfica; comida informal de campaña; carta compacta QR. Referencias trazadas en la [matriz](MATRIZ-32-REFERENCIAS.md), incluyendo Qitchen, Bramble, Camino, Chowk House, MĒR, Latte, Riteora, Coffee GR8R, Deux, Matchioo, Luna Rossa, Slice Town, ScanEats y Umami.

Páginas: inicio, carta, historia/chef, galería/ambiente, eventos privados, ubicaciones/horarios y reserva. Carta QR puede vivir como página específica con navegación compacta dentro del mismo sitio. No imponer carrito a un restaurante que solo necesita presentar la carta.

## Componentes y backend

- F11-01. Evolucionar `components/sections/restaurant/` y `MenuPreviewTabs.tsx`: implementar tres comportamientos distintos, lista con categorías, navegación por anclas y pestañas reales. Selección mantiene foco y permite enlaces profundos cuando corresponda.
- F11-02. Presentación de plato: imagen opcional, nombre, descripción, precio operativo, tamaños/variantes, etiquetas y disponibilidad. No inventar disponibilidad por tener fotografía ni fijar precios como texto cuando provienen del catálogo.
- F11-03. Cartas por servicio: desayuno, almuerzo, cena, bebidas, bar, degustación. Horarios de cocina y bar separados. Resolver alcance/horario con datos declarados y timezone; mostrar estados cerrado/no disponible sin eliminar silenciosamente toda la carta.
- F11-04. Chef/equipo, origen de ingredientes, proceso, ambiente, eventos y comunidad. Los sellos/reseñas de demostración se sustituyen por contenido autorizado del negocio.
- F11-05. Reserva de mesa: personas, fecha/hora, contacto y preferencias permitidas; validar capacidad/servicio en el backend real. Si es consulta manual, nombrar la acción como solicitud. Éxito de envío no equivale a mesa confirmada.
- F11-06. Pedidos/domicilio solo si la capacidad existe: reutilizar servicios de catálogo, carrito, precios, ventas e impuestos. CTA a WhatsApp usa el contacto propio del restaurante y mensaje configurable; no se envía automáticamente desde preview.
- F11-07. Relación con hotel configurable: enlace a alojamiento, sello opcional y navegación de regreso. Cambiar tema o footer de restaurante no cambia el hotel ni otros restaurantes.
- F11-08. Implementar familias R y decoraciones necesarias: filas con precio, cartas ilustradas, bebidas recortadas, perfiles, banners de campaña, contacto compacto y horarios.

## Base de datos

Verificar categorías, productos, precios vigentes, fuentes de stock, mesas y reservas por MCP. No asumir `products.price` o `is_active`. Filtrar por contexto y reglas de visibilidad existentes; una categoría visible no autoriza un producto ajeno.

Definir agrupaciones editoriales de carta por sitio en documentos si solo ordenan referencias. Si representan una operación nueva —turnos de reserva, capacidad o vigencia comercial— asignar su implementación al dominio correspondiente con RPC/transacción y RLS. Alérgenos/etiquetas solo se muestran si están registrados; no inferirlos de texto o imagen.

## Aceptación y reversión

- [ ] Dos restaurantes comparten organización y tienen cartas, fondos, logos, headers, horarios y footers distintos.
- [ ] La carta soporta cientos de elementos mediante carga acotada, búsqueda/filtros donde estén ofrecidos, y navegación móvil rápida.
- [ ] Precio/tamaño/disponibilidad mostrados corresponden al catálogo operativo autorizado.
- [ ] Reserva/envío maneja cerrado, cupo agotado, error, reintento y confirmación según capacidad real.
- [ ] Variante QR tiene acciones legibles y no necesita una portada larga para llegar a la carta.
- [ ] Cada plantilla incluye carta, historia, contacto/reserva y no solo una portada atractiva.

Activación por restaurante; rollback de presentación por revisión. Conservar pedidos/reservas válidos y catálogos operativos. Si un componente nuevo falla, usar variante compatible que conserve los datos, no esconder una carta publicada completa.
