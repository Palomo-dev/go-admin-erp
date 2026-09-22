# Fase 12 — Comercio y servicios: completar las familias de referencia

Estado: pendiente; **etapa 5**. Depende de F09. Incluye la familia V (gimnasio, transporte, parqueadero) y E13 según [MAPEO-TIPOS-LEGACY.md](MAPEO-TIPOS-LEGACY.md). Resultado: ampliar posibilidades de diseño para las tiendas actuales y cubrir las referencias no gastronómicas.

## UX y plantillas

Tres direcciones de comercio: editorial minimalista (Elian Valen/Arum), natural/producto (All Natural/Leafore) y campañas de catálogo (Nestria/Volt/Ecom). Servicios: portadas, beneficios, pasos, planes e integraciones inspirados en Scalable/PayGin/Fusion AI. PayGin se utiliza como referencia visual; este plan no crea una billetera financiera.

Páginas comerciales: inicio, colecciones/categorías, listado/búsqueda, producto, carrito, checkout, resultado y políticas. Servicios: inicio, servicios/detalle, equipo, artículos y contacto; precios/planes solo si tienen fuente y acción definidas.

## Componentes y backend

- F12-01. Implementar familias E: tarjetas/categorías, producto contextual sobre fotografía, colecciones editoriales, campañas, beneficios, bundles, tarjetas regalo y sedes. Bundles/tarjetas regalo requieren capacidad operativa real; si no existe, no ofrecer comprar una demostración.
- F12-02. Página de producto editable en presentación manteniendo selección de variantes, precio vigente, stock, impuestos y carrito actuales. Todas sus secciones reciben la entidad y contexto correctos.
- F12-03. Ofertas y cuenta regresiva solo con inicio/fin y condiciones válidas; no fabricar urgencia ni descuentos de demo al instalar un preset.
- F12-04. Completar componentes universales de planes, comparación, pasos e integraciones. Un logo de integración puede ser contenido editorial; no implica una integración activada.
- F12-05. Revisar carrito por contexto: no mezclar accidentalmente outlets, pero conservar cualquier regla existente de compra entre sucursales hasta decidirla explícitamente. El diseño no redefine las reglas comerciales.
- F12-06. Checkout adopta identidad visual mediante tokens compatibles antes de cambios estructurales. `CheckoutWizard.tsx`, `/api/orders`, `/api/checkout/init`, cálculo de envío y webhooks son rutas críticas: extracción de presentación primero, operación después y solo cuando sea imprescindible al alcance.
- F12-07. Reutilizar validación y cálculo del servidor. Precio/stock/envío/impuestos no se aceptan del documento de diseño. Las credenciales y reglas de pasarela quedan fuera del snapshot.

## Base de datos

No cambiar tablas de ventas/pagos para personalizar la apariencia. Verificar toda nueva consulta por MCP y ampliar tipos manuales de websites según columnas reales. Nuevas relaciones editoriales de productos usan documento o tablas con FK/organización y RLS según necesidad; no duplicar precios ni stock.

Si el inventario de F00 demuestra una capacidad faltante que exige cambios de dinero/checkout, documentar subfase separada, escenarios de regresión y alcance autorizado antes de ejecutarla. No esconder un desarrollo comercial nuevo dentro de una variante de sección.

## Aceptación y reversión

- [ ] Sitio legacy conserva catálogo, carrito, envío, pago y seguimiento sin adoptar el nuevo tema.
- [ ] Sitio adoptado puede cambiar header/footer/fondo en todo el recorrido comercial sin alterar resultados monetarios.
- [ ] Variantes de producto y enlaces de categoría conservan contexto de sitio/outlet.
- [ ] Un preset no publica descuentos, productos, reseñas o condiciones ficticias como reales.
- [ ] Las siete referencias de comercio y tres de servicios están trazadas a composiciones implementadas o a una capacidad pendiente declarada.
- [ ] Pruebas operativas usan modo de prueba/simulación autorizado; preview nunca ejecuta cobros ni pedidos reales.

Rollback de diseño sin cambiar pedidos ni configuración de cobro. No hacer rollback de webhooks junto con un tema. Mantener contratos de la versión comercial previa y observar cualquier caída de conversión/fallo técnico antes de ampliar adopción.
