# Fase 10 — Hotel, habitaciones y experiencias

Estado: pendiente; **etapa 5**. Depende de F09. Resultado: sitios hoteleros completos con diseño propio, páginas internas editables y operaciones conectadas.

## UX y plantillas

Construir al menos tres direcciones a partir de las referencias: hotel editorial inmersivo, hotel contemporáneo dividido y villa/hospedaje natural. Usar Hotellia/Mariven/Rumaya/Constellare para jerarquía y navegación; Tidehouse para composición contemporánea; Karaya/BetheWind/Aurelia para vivienda completa, naturaleza y disponibilidad. Los presets son puntos de partida editables, no diseños rígidos por tipo de sucursal.

Páginas incluidas: inicio, listado de habitaciones, detalle, experiencias/listado y detalle, restaurantes del hotel, spa/servicios, ofertas, galería, ubicación/contacto y disponibilidad/reserva. Habilitar únicamente páginas respaldadas por capacidades del negocio; no inventar módulos del plan.

## Componentes y backend

- F10-01. Extender `components/sections/hotel/`, `SpacesCards.tsx`, `BookingCtaBanner.tsx` y `app/espacios/[id]/page.tsx`. El detalle usa plantilla del sitio con datos del espacio; el layout fijo existente permanece como fallback legacy.
- F10-02. Habitación: galería, ocupación, camas, superficie, amenidades, políticas, tarifa aplicable y CTA. Los campos operativos llegan del PMS; contenido editorial e imágenes se personalizan sin alterar disponibilidad.
- F10-03. Composiciones de habitaciones: tarjetas, filas editoriales, carrusel y destacado con secundarios. Los enlaces conservan hotel/outlet y plantilla de detalle.
- F10-04. Colección de restaurantes/negocios relacionados: selección explícita de sitios publicados, imagen/logo propio, descripción y enlace resuelto. Un restaurante externo al catálogo del hotel no aparece por compartir organización.
- F10-05. Disponibilidad: fechas, huéspedes, tipo de alojamiento y validación usando timezone de la organización. Diferenciar consultar disponibilidad, enviar solicitud y confirmar reserva. Si el motor solo admite solicitud, la interfaz lo declara.
- F10-06. Reutilizar servicios/RPC de reserva existentes tras inventario. Si falta una operación imprescindible, crear el subtrabajo con contrato, transacción, permisos, idempotencia y estados antes de habilitar CTA. No duplicar cálculo de tarifas ni ocupación en el componente.
- F10-07. Ofertas/paquetes muestran vigencia y condiciones de la fuente real. Datos de ejemplo no se publican como disponibilidad o descuentos reales del cliente.

## Base de datos

Verificar por MCP `spaces` y el modelo real de tipos, tarifas, reservas, amenidades y experiencias. El plan no presupone columnas ni nuevas tablas operativas. Primero resolver por sitio/sucursal y reutilizar relaciones existentes.

Si hacen falta descripciones/editorial/galerías por espacio, modelarlas como extensión de presentación con organización y FK correctas, o como overrides del documento referenciando la entidad. No copiar datos transaccionales a website settings. Identificar claramente nuevas tablas de contenido frente a cambios del PMS, que requieren revisión de dominio propia.

## Aceptación y reversión

- [ ] Un hotel y restaurante relacionado tienen identidad, shell y enlaces propios sin perder la relación entre ellos.
- [ ] La ficha de habitación cambia desde el editor y conserva capacidad/tarifa correctas del espacio seleccionado.
- [ ] Fechas inválidas, ocupación excedida y disponibilidad agotada muestran estados reales; probar cambio de día/timezone.
- [ ] El formulario conecta al servicio autorizado; reintento no crea reservas duplicadas.
- [ ] Preview simula sin reservar ni cobrar; la publicación conserva presentación, con datos vivos actualizados.
- [ ] Todas las familias A del catálogo tienen datos vacíos, móvil, loading/error y navegación de detalle.

Despliegue: hotel de ensayo y luego adopción explícita por sitio. Reversión a revisión anterior de presentación; nunca borrar o revertir reservas generadas válidamente. Las operaciones pendientes siguen el flujo del PMS.
