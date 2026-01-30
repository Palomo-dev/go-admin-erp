# Módulo de Transporte - GO Admin ERP

## Descripción General

El módulo de transporte soporta dos casos de uso principales:

1. **Logística de Productos**: Envíos de mercancía a clientes
2. **Transporte de Pasajeros**: Gestión de flotas de buses, rutas y boletos

---

## Tablas de Base de Datos

### Catálogos Base (FASE 1)

| Tabla | Descripción |
|-------|-------------|
| `transport_carriers` | Transportadoras (terceros o flota propia) |
| `vehicles` | Vehículos de la flota |
| `driver_credentials` | Licencias y credenciales de conductores |
| `transport_stops` | Paradas, terminales y puntos de entrega |
| `customer_addresses` | Direcciones múltiples por cliente |

### Rutas y Programación (FASE 2)

| Tabla | Descripción |
|-------|-------------|
| `transport_routes` | Rutas definidas (origen, destino, paradas) |
| `route_stops` | Secuencia ordenada de paradas por ruta |
| `route_schedules` | Horarios programados de salida |

### Operación (FASE 3)

| Tabla | Descripción |
|-------|-------------|
| `trips` | Viajes ejecutados (para pasajeros) |
| `trip_tickets` | Boletos vendidos por viaje |
| `shipments` | Envíos de carga/productos |
| `shipment_items` | Detalle de productos en envíos |

### Tracking y Etiquetas (FASE 4)

| Tabla | Descripción |
|-------|-------------|
| `transport_events` | Timeline unificado de eventos |
| `delivery_attempts` | Intentos de entrega |
| `proof_of_delivery` | Prueba de entrega (POD) |
| `shipping_labels` | Etiquetas de envío generadas |

### Manifiestos y Tarifas (FASE 5)

| Tabla | Descripción |
|-------|-------------|
| `dispatch_manifests` | Manifiestos de despacho |
| `manifest_shipments` | Relación manifiesto-envíos |
| `transport_fares` | Tarifas de pasajeros |
| `shipping_rates` | Tarifas de envío de carga |

---

## Integración con Google Maps

### Variables de Entorno Requeridas

```bash
# .env.local
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your-api-key
```

### Cómo Obtener la API Key

1. Ir a [Google Cloud Console](https://console.cloud.google.com/)
2. Crear un proyecto nuevo o seleccionar uno existente
3. Ir a **APIs & Services** → **Library**
4. Habilitar las siguientes APIs:
   - **Directions API** - Cálculo de rutas
   - **Geocoding API** - Conversión dirección ↔ coordenadas
   - **Places API** - Autocompletado y búsqueda de lugares
   - **Distance Matrix API** - Distancias entre múltiples puntos
   - **Maps JavaScript API** - Mapas interactivos en el frontend
5. Ir a **APIs & Services** → **Credentials**
6. Crear una **API Key**
7. (Opcional pero recomendado) Restringir la key:
   - **Application restrictions**: HTTP referrers para frontend, IP addresses para backend
   - **API restrictions**: Solo las APIs listadas arriba

### Uso del Servicio

```typescript
import { googleMapsService } from '@/lib/services/googleMapsService';

// Calcular ruta entre dos puntos
const route = await googleMapsService.getDirections({
  origin: { lat: 6.2442, lng: -75.5812 }, // Medellín
  destination: { lat: 4.7110, lng: -74.0721 }, // Bogotá
  travelMode: 'DRIVING',
});

// Geocodificar dirección
const result = await googleMapsService.geocode('Carrera 7 #45-23, Bogotá, Colombia');

// Autocompletado de direcciones
const suggestions = await googleMapsService.placesAutocomplete('Carrera 7 Bogotá');

// Optimizar orden de paradas
const optimized = await googleMapsService.optimizeRoute(
  origin,
  destination,
  [parada1, parada2, parada3]
);
```

---

## Dónde Configurar las Credenciales

### Desarrollo Local
Agregar en `.env.local`:
```bash
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIza...
```

### Producción (Vercel)
1. Ir al proyecto en [Vercel Dashboard](https://vercel.com)
2. **Settings** → **Environment Variables**
3. Agregar:
   - Name: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
   - Value: Tu API key de producción
   - Environment: Production, Preview, Development

### Supabase (Edge Functions)
Si usas Google Maps desde Edge Functions:
1. Ir a **Project Settings** → **Edge Functions**
2. Agregar secret: `GOOGLE_MAPS_API_KEY`

---

## Métodos de Pago en Website

Se agregaron campos a `organization_payment_methods` para controlar visibilidad en el sitio web público:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `show_on_website` | boolean | Si se muestra en el website |
| `website_display_order` | int | Orden de visualización |
| `website_display_name` | text | Nombre personalizado |
| `website_description` | text | Instrucciones para el cliente |
| `website_icon` | text | URL o nombre del icono |

### Query para obtener métodos visibles en website

```sql
SELECT 
  opm.*,
  pm.name as method_name,
  pm.code
FROM organization_payment_methods opm
JOIN payment_methods pm ON pm.code = opm.payment_method_code
WHERE opm.organization_id = $1
  AND opm.is_active = true
  AND opm.show_on_website = true
ORDER BY opm.website_display_order ASC;
```

---

## Flujos de Trabajo

### Envío de Productos (Logística)

```
Venta (POS/Web)
    ↓
Crear Shipment (source_type='sale', source_id=sale.id)
    ↓
Agregar ShipmentItems (productos de la venta)
    ↓
Generar ShippingLabel
    ↓
Asignar a DispatchManifest
    ↓
Conductor recibe manifiesto en app móvil
    ↓
Registrar DeliveryAttempts
    ↓
Registrar ProofOfDelivery (firma, fotos)
    ↓
Actualizar Shipment.status = 'delivered'
    ↓
Si COD: Registrar Payment
```

### Transporte de Pasajeros

```
Definir TransportRoute + RouteStops
    ↓
Crear RouteSchedule (horarios de salida)
    ↓
Sistema genera Trip para cada fecha/horario
    ↓
Cliente compra TripTicket (genera Sale)
    ↓
Día del viaje: Conductor asignado
    ↓
Registrar boarding/alighting de pasajeros
    ↓
Registrar TransportEvents (llegadas, salidas)
    ↓
Completar Trip
```

---

## Integraciones Futuras

- [ ] **Coordinadora API** - Envíos nacionales Colombia
- [ ] **Servientrega API** - Envíos nacionales Colombia
- [ ] **TCC API** - Envíos nacionales Colombia
- [ ] **Stripe** - Pago de boletos online
- [ ] **Wompi** - Pago de boletos (Colombia)
- [ ] **WhatsApp** - Notificaciones de estado de envío
- [ ] **SMS** - Notificaciones de viaje

---

## Notas Técnicas

- **PostGIS**: No está habilitado actualmente. Se usan columnas `latitude`/`longitude` simples
- **RLS**: Todas las tablas tienen Row Level Security habilitado
- **Triggers**: 
  - `ensure_single_default_address`: Solo una dirección por defecto por cliente
  - `increment_label_print_count`: Contador de impresiones de etiquetas
  - `update_manifest_counts`: Actualiza contadores en manifiestos
