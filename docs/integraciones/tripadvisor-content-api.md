# Integración TripAdvisor – Content API

> **Ref oficial:** https://tripadvisor-content-api.readme.io/reference/overview  
> **Developer Portal:** https://www.tripadvisor.com/developers  
> **Manage API Key:** https://www.tripadvisor.com/developers?screen=credentials  
> **FAQ:** https://tripadvisor-content-api.readme.io/reference/faq  
> **Display Requirements:** https://tripadvisor-content-api.readme.io/reference/display-requirements  
> **API Master Terms:** https://tripadvisor-content-api.readme.io/reference/api-master-terms-new  
> **Fecha:** 2026-03-15

---

## 1. Resumen General

La TripAdvisor Content API permite a GO Admin ERP acceder al contenido de TripAdvisor (reseñas, fotos, ratings, detalles de ubicación) para mostrarlo en las propiedades listadas. TripAdvisor tiene **7.5 millones de ubicaciones**, **1 billón de reseñas** y soporte para **29 idiomas**.

| Funcionalidad | Descripción |
|---------------|-------------|
| **Location Details** | Información completa de una propiedad: nombre, dirección, rating, URL en TripAdvisor |
| **Location Photos** | Hasta 5 fotos recientes en alta calidad por ubicación |
| **Location Reviews** | Hasta 5 reseñas más recientes por ubicación |
| **Location Search** | Buscar ubicaciones por texto (hasta 10 resultados) |
| **Nearby Search** | Buscar ubicaciones cercanas por lat/lng (hasta 10 resultados) |

### Relación con integración iCal existente

| Método | Estado | Alcance |
|--------|--------|---------|
| **iCal (actual)** | ✅ Implementado | Solo disponibilidad (bloqueos). Latencia 15-30 min |
| **Content API (futuro)** | 📋 Planificado | Contenido: reseñas, fotos, ratings, búsqueda. Solo lectura |

> La integración iCal actual seguirá funcionando para sincronización de disponibilidad. La Content API **complementa** con contenido enriquecido.

### Separación con conectores existentes

| Conector en BD | Propósito |
|----------------|-----------|
| `tripadvisor_ical` | iCal import/export (Channel Manager actual) |
| `tripadvisor_content` | 📋 **Nuevo** — Content API (API Key, solo lectura de contenido) |

---

## 2. Arquitectura de TripAdvisor Content API

```
TripAdvisor Content API
├── Developer Portal (tripadvisor.com/developers)
│   ├── API Key Management
│   ├── Billing & Usage
│   └── Daily Budget Control
├── Content API (REST JSON)
│   ├── Location Details      GET /location/{locationId}/details
│   ├── Location Photos       GET /location/{locationId}/photos
│   ├── Location Reviews      GET /location/{locationId}/reviews
│   ├── Location Search       GET /location/search
│   └── Nearby Location Search GET /location/nearby_search
└── Hotel Pricing API (acceso separado, no incluido)
    └── Requiere solicitud directa a TripAdvisor
```

### Conceptos clave

- **Location**: Cualquier lugar en TripAdvisor — hotel, restaurante o atracción
- **Location ID**: Identificador numérico único de una ubicación en TripAdvisor
- **API Key**: Clave de acceso única por cuenta (1 key por cuenta)
- **Daily Budget**: Presupuesto diario configurable que limita llamadas por día
- **Bubble Rating**: Sistema de puntuación visual de TripAdvisor (1-5 burbujas)
- **Ollie Logo**: Logo oficial de TripAdvisor (obligatorio al mostrar contenido)
- **Content Attribution**: Requisito obligatorio de mostrar marca TripAdvisor junto al contenido

---

## 3. Requisitos Previos

### 3.1. Para GO Admin (una sola vez)

| Requisito | Descripción |
|-----------|-------------|
| **Cuenta TripAdvisor** | Registrarse en [tripadvisor.com/developers](https://www.tripadvisor.com/developers) |
| **API Key** | Crear en [Manage API Key](https://www.tripadvisor.com/developers?screen=credentials) |
| **Tarjeta de crédito** | Requerida para suscripción (primeras 5,000 llamadas/mes gratis) |
| **Daily Budget** | Configurar presupuesto diario máximo |
| **HTTPS obligatorio** | Todas las llamadas deben ser sobre HTTPS |
| **Display Requirements** | Cumplir con requisitos de atribución de marca |

### 3.2. Para cada Propiedad (Cliente de GO Admin)

| Requisito | Descripción |
|-----------|-------------|
| **Propiedad listada en TripAdvisor** | La propiedad debe existir en TripAdvisor |
| **Location ID** | Identificar el `location_id` de la propiedad (vía Location Search) |
| **Mapeo en GO Admin** | Vincular `location_id` con la propiedad en el PMS |

---

## 4. Credenciales y Autenticación

### 4.1. Método de Autenticación

TripAdvisor Content API usa **API Key** como query parameter. No usa OAuth ni tokens Bearer.

```
GET https://api.content.tripadvisor.com/api/v1/location/{locationId}/details?key={API_KEY}&language=es_CO
```

| Campo | Descripción |
|-------|-------------|
| `key` | API Key como query parameter en cada request |
| `language` | Código de idioma opcional (default: `en`) |
| `currency` | Código de moneda opcional (para precios) |

### 4.2. Obtener API Key

```
1. Ir a www.tripadvisor.com/developers
2. Registrarse o iniciar sesión con cuenta TripAdvisor
3. Click "Create API key"
4. Configurar Daily Budget
5. Proporcionar información de facturación
6. API Key disponible inmediatamente
```

### 4.3. Variables de Entorno (servidor GO Admin)

```env
# TripAdvisor Content API
TRIPADVISOR_API_KEY=your_api_key_here
TRIPADVISOR_ENVIRONMENT=production  # No hay sandbox separado
```

### 4.4. Credenciales por Organización (en BD: `integration_credentials`)

Se guarda 1 registro en `integration_credentials` al crear la conexión:

| Campo | `credential_type` | Descripción |
|-------|-------------------|-------------|
| `api_key` | `api_key` | API Key de TripAdvisor Content API |

> **Seguridad**: La API Key debe mantenerse en el servidor. Si se expone en frontend, TripAdvisor puede revocarla.

---

## 5. Base URL y Formato

### 5.1. URL Base

| Servidor | URL | Uso |
|----------|-----|-----|
| **Content API** | `https://api.content.tripadvisor.com/api/v1` | Todos los endpoints |

> No existe sandbox separado. Se usa la misma URL para desarrollo y producción.

### 5.2. Formato de Request/Response

| Formato | Descripción |
|---------|-------------|
| **JSON** | Todos los endpoints usan REST JSON |
| **HTTPS** | Obligatorio para todas las llamadas |
| **GET** | Todos los endpoints son solo lectura (GET) |

---

## 6. APIs Principales

### 6.1. Location Details

Retorna información completa de una ubicación.

**Endpoint:**

```
GET /location/{locationId}/details?key={API_KEY}&language={lang}&currency={currency}
```

**Parámetros:**

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `locationId` | path | ✅ | ID numérico de la ubicación en TripAdvisor |
| `key` | query | ✅ | API Key |
| `language` | query | ❌ | Código de idioma (default: `en`) |
| `currency` | query | ❌ | Código de moneda |

**Respuesta (campos principales):**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `location_id` | string | ID único de la ubicación |
| `name` | string | Nombre de la ubicación |
| `description` | string | Descripción completa |
| `web_url` | string | URL de la página en TripAdvisor |
| `address_obj` | object | Dirección completa (street, city, state, country, postal_code) |
| `ancestors` | array | Jerarquía geográfica (ciudad, región, país) |
| `latitude` | string | Latitud |
| `longitude` | string | Longitud |
| `timezone` | string | Zona horaria |
| `phone` | string | Teléfono |
| `website` | string | Sitio web de la propiedad |
| `email` | string | Email de contacto |
| `rating` | string | Rating promedio (1.0 - 5.0) |
| `rating_image_url` | string | URL de la imagen de bubble rating |
| `num_reviews` | string | Número total de reseñas |
| `ranking_data` | object | Ranking en la categoría y localidad |
| `price_level` | string | Nivel de precios ($, $$, $$$, $$$$) |
| `category` | object | Categoría (hotel, restaurant, attraction) |
| `subcategory` | array | Subcategorías |
| `hours` | object | Horarios de operación |
| `amenities` | array | Lista de amenidades |
| `cuisine` | array | Tipos de cocina (solo restaurantes) |
| `trip_types` | array | Tipos de viaje con porcentajes |
| `awards` | array | Premios de TripAdvisor |

**Ejemplo de respuesta:**

```json
{
  "location_id": "60745",
  "name": "Hotel Dann Carlton Bogota",
  "description": "Hotel de lujo en el corazón...",
  "web_url": "https://www.tripadvisor.com/Hotel_Review-g294074-d60745-...",
  "address_obj": {
    "street1": "Calle 93 No 19-44",
    "city": "Bogotá",
    "state": "Bogotá",
    "country": "Colombia",
    "postalcode": "110221",
    "address_string": "Calle 93 No 19-44, Bogotá, Colombia"
  },
  "latitude": "4.6782",
  "longitude": "-74.0456",
  "rating": "4.0",
  "rating_image_url": "https://www.tripadvisor.com/img/cdsi/img2/ratings/traveler/4.0-12345-4.svg",
  "num_reviews": "1234",
  "ranking_data": {
    "geo_location_id": "294074",
    "ranking_string": "#25 of 270 hotels in Bogotá",
    "geo_location_name": "Bogotá",
    "ranking_out_of": "270",
    "ranking": "25"
  },
  "price_level": "$$$",
  "category": {
    "key": "hotel",
    "name": "Hotel"
  },
  "amenities": ["Free Wifi", "Pool", "Restaurant", "Room Service"]
}
```

---

### 6.2. Location Photos

Retorna hasta 5 fotos recientes de una ubicación.

**Endpoint:**

```
GET /location/{locationId}/photos?key={API_KEY}&language={lang}
```

**Parámetros:**

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `locationId` | path | ✅ | ID de la ubicación |
| `key` | query | ✅ | API Key |
| `language` | query | ❌ | Código de idioma |

**Tamaños de imagen disponibles:**

| Tipo | Dimensiones | Descripción |
|------|-------------|-------------|
| `thumbnail` | 50x50 px | Recortada, optimizada |
| `small` | 150x150 px | Recortada, optimizada |
| `medium` | Max 250px (lado mayor) | Mantiene aspect ratio |
| `large` | Max 550px (lado mayor) | Mantiene aspect ratio |
| `original` | Resolución original | Tal como fue subida |

**Respuesta:**

```json
{
  "data": [
    {
      "id": 123456,
      "is_blessed": true,
      "caption": "Vista del lobby",
      "published_date": "2025-11-15T10:30:00",
      "images": {
        "thumbnail": {
          "height": 50,
          "width": 50,
          "url": "https://media-cdn.tripadvisor.com/media/photo-t/..."
        },
        "small": {
          "height": 150,
          "width": 150,
          "url": "https://media-cdn.tripadvisor.com/media/photo-l/..."
        },
        "medium": {
          "height": 167,
          "width": 250,
          "url": "https://media-cdn.tripadvisor.com/media/photo-f/..."
        },
        "large": {
          "height": 367,
          "width": 550,
          "url": "https://media-cdn.tripadvisor.com/media/photo-s/..."
        },
        "original": {
          "height": 1200,
          "width": 1800,
          "url": "https://media-cdn.tripadvisor.com/media/photo-o/..."
        }
      },
      "album": "Hotel & Grounds",
      "source": {
        "name": "Traveler",
        "localized_name": "Viajero"
      },
      "user": {
        "username": "traveler123"
      }
    }
  ]
}
```

---

### 6.3. Location Reviews

Retorna hasta 5 reseñas más recientes de una ubicación.

**Endpoint:**

```
GET /location/{locationId}/reviews?key={API_KEY}&language={lang}
```

**Parámetros:**

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `locationId` | path | ✅ | ID de la ubicación |
| `key` | query | ✅ | API Key |
| `language` | query | ❌ | Código de idioma (prioriza reseñas en ese idioma) |

**Respuesta:**

```json
{
  "data": [
    {
      "id": 987654,
      "lang": "es",
      "location_id": "60745",
      "published_date": "2026-02-20T14:30:00Z",
      "rating": 5,
      "helpful_votes": "12",
      "rating_image_url": "https://www.tripadvisor.com/img/cdsi/img2/ratings/traveler/s5.0-12345-5.svg",
      "url": "https://www.tripadvisor.com/ShowUserReviews-...",
      "title": "Excelente experiencia",
      "text": "Nos hospedamos 3 noches y la experiencia fue increíble...",
      "trip_type": "Family",
      "travel_date": "2026-02",
      "user": {
        "username": "viajero_col",
        "user_location": {
          "name": "Bogotá, Colombia"
        },
        "avatar": {
          "thumbnail": "https://media-cdn.tripadvisor.com/media/photo-t/...",
          "small": "https://media-cdn.tripadvisor.com/media/photo-l/...",
          "large": "https://media-cdn.tripadvisor.com/media/photo-s/..."
        }
      },
      "subratings": {
        "0": { "name": "RATE_VALUE", "localized_name": "Relación calidad-precio", "rating_image_url": "...", "value": "5" },
        "1": { "name": "RATE_ROOM", "localized_name": "Habitaciones", "rating_image_url": "...", "value": "5" },
        "2": { "name": "RATE_SERVICE", "localized_name": "Servicio", "rating_image_url": "...", "value": "5" },
        "3": { "name": "RATE_LOCATION", "localized_name": "Ubicación", "rating_image_url": "...", "value": "4" },
        "4": { "name": "RATE_CLEANLINESS", "localized_name": "Limpieza", "rating_image_url": "...", "value": "5" },
        "5": { "name": "RATE_SLEEP", "localized_name": "Calidad del sueño", "rating_image_url": "...", "value": "4" }
      }
    }
  ]
}
```

### Subratings disponibles (hoteles)

| Key | Nombre | Descripción |
|-----|--------|-------------|
| `RATE_VALUE` | Relación calidad-precio | Value for money |
| `RATE_ROOM` | Habitaciones | Room quality |
| `RATE_SERVICE` | Servicio | Service quality |
| `RATE_LOCATION` | Ubicación | Location convenience |
| `RATE_CLEANLINESS` | Limpieza | Cleanliness |
| `RATE_SLEEP` | Calidad del sueño | Sleep quality |

---

### 6.4. Location Search

Busca ubicaciones por texto.

**Endpoint:**

```
GET /location/search?key={API_KEY}&searchQuery={query}&category={cat}&phone={phone}&address={addr}&latLong={lat,lng}&radius={r}&radiusUnit={unit}&language={lang}
```

**Parámetros:**

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `key` | query | ✅ | API Key |
| `searchQuery` | query | ✅ | Texto de búsqueda |
| `category` | query | ❌ | Filtro: `hotels`, `attractions`, `restaurants`, `geos` |
| `phone` | query | ❌ | Número de teléfono |
| `address` | query | ❌ | Dirección |
| `latLong` | query | ❌ | Coordenadas `lat,lng` |
| `radius` | query | ❌ | Radio de búsqueda (requiere `latLong`) |
| `radiusUnit` | query | ❌ | Unidad: `km`, `mi`, `m` |
| `language` | query | ❌ | Código de idioma |

**Respuesta:**

```json
{
  "data": [
    {
      "location_id": "60745",
      "name": "Hotel Dann Carlton Bogota",
      "address_obj": {
        "street1": "Calle 93 No 19-44",
        "city": "Bogotá",
        "country": "Colombia",
        "address_string": "Calle 93 No 19-44, Bogotá 110221, Colombia"
      }
    }
  ]
}
```

> **Nota**: Este endpoint también puede retornar actividades bookables, pero no tienen detalles adicionales en Location Details.

> **Límite diario**: 10,000 llamadas/día para Search APIs (independiente del budget).

---

### 6.5. Nearby Location Search

Busca ubicaciones cercanas por coordenadas.

**Endpoint:**

```
GET /location/nearby_search?key={API_KEY}&latLong={lat,lng}&category={cat}&phone={phone}&address={addr}&radius={r}&radiusUnit={unit}&language={lang}
```

**Parámetros:**

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `key` | query | ✅ | API Key |
| `latLong` | query | ✅ | Coordenadas `lat,lng` |
| `category` | query | ❌ | Filtro: `hotels`, `attractions`, `restaurants`, `geos` |
| `radius` | query | ❌ | Radio de búsqueda |
| `radiusUnit` | query | ❌ | Unidad: `km`, `mi`, `m` |
| `language` | query | ❌ | Código de idioma |

---

## 7. Rate Limiting

| Concepto | Límite |
|----------|--------|
| **QPS (Queries Per Second)** | 50 llamadas/segundo |
| **Search APIs (diario)** | 10,000 llamadas/día |
| **Details/Photos/Reviews (diario)** | Determinado por Daily Budget |
| **Ventana de reset** | Rolling 24h desde primera llamada |
| **HTTP 429** | Too Many Requests (excede límite) |
| **Reset diario** | Medianoche UTC |

### Headers de respuesta de rate limiting

```
X-RateLimit-Limit: 50
X-RateLimit-Remaining: 49
X-RateLimit-Reset: 1679961600
```

---

## 8. Precios y Facturación

| Concepto | Detalle |
|----------|---------|
| **Modelo** | Pay-as-you-go (paga solo lo que uses) |
| **Primeras 5,000 llamadas/mes** | **GRATIS** |
| **Llamadas adicionales** | Precio por llamada (descuento por volumen) |
| **Daily Budget** | Configurable para evitar gastos inesperados |
| **Facturación** | Mensual |
| **Cancelación** | En cualquier momento, key activa hasta fin de ciclo |
| **>500,000 llamadas/mes** | Contactar equipo de ventas para descuento volumen |
| **Tarjeta requerida** | Sí, para activar suscripción |

### Capa gratuita

- 5,000 llamadas/mes incluidas
- Ideal para desarrollo y propiedades pequeñas
- Permite probar todos los endpoints

---

## 9. Localización (Idiomas)

### Idiomas soportados para Latinoamérica

| Código | Idioma/Región |
|--------|---------------|
| `es` | Español (España) |
| `es_CO` | Español (Colombia) |
| `es_MX` | Español (México) |
| `es_AR` | Español (Argentina) |
| `es_PE` | Español (Perú) |
| `es_VE` | Español (Venezuela) |
| `es_CL` | Español (Chile) |
| `pt` | Portugués (Brasil) |
| `pt_PT` | Portugués (Portugal) |
| `en` | Inglés (US) |

> Si no se especifica idioma, el contenido se retorna en `en` (inglés US). Para GO Admin Colombia, usar `es_CO`.

---

## 10. Caching Policy

| Dato | Caching permitido |
|------|-------------------|
| `location_id` | ✅ Ilimitado (para mejorar performance) |
| **Todo lo demás** | ❌ No se permite cachear, almacenar ni indexar |

> **Importante**: Solo el `location_id` puede almacenarse de forma persistente. Todos los demás datos (reseñas, fotos, ratings, detalles) deben obtenerse en tiempo real de la API y no almacenarse en base de datos.

---

## 11. Display Requirements (Requisitos de Visualización)

### 11.1. Logo obligatorio

| Contexto | Logo |
|----------|------|
| **Fondo claro** | Logo primario TripAdvisor (verde #00AA6C) |
| **Fondo oscuro** | Logo secundario TripAdvisor (#84E9BD) |

- Logo y lockups deben mostrarse **prominentemente** y en **proximidad** al contenido
- El Ollie Logo debe tener al menos **20px de altura**

### 11.2. Bubble Ratings

| Regla | Detalle |
|-------|---------|
| **Color estándar** | TripAdvisor Moss `#00AA6C` |
| **Dark mode** | `#84E9BD` |
| **Fondo** | Siempre sobre fondo blanco (excepto dark mode) |
| **Ancho mínimo** | 55px para gráfico de bubble rating |
| **Ollie Logo** | A la izquierda del bubble rating (para aggregate ratings) |
| **Alineación** | Siempre izquierda |

### 11.3. Reseñas individuales

- Usar bubble ratings **sin** Ollie Logo para reseñas individuales
- Solo se pueden citar reseñas de **5 burbujas** si el rating general es **≥ 4.0**
- Incluir **fecha** de la reseña citada
- Contenido entre **comillas**
- Acompañar con frases como *"Reseña de un viajero de Tripadvisor"*

### 11.4. Rankings

- Al citar ranking de popularidad, **DEBE** incluir mes y año específico
- Ejemplo: *"#1 Hotel en Bogotá según viajeros de Tripadvisor a marzo de 2026"*

---

## 12. Flujo Completo de Integración con GO Admin ERP

### 12.1. Flujo de Onboarding (una sola vez)

```
1. GO Admin registra cuenta en tripadvisor.com/developers
   ↓
2. Crear API Key
   ↓
3. Configurar Daily Budget según necesidades
   ↓
4. Guardar API Key como variable de entorno
   ↓
5. Implementar endpoints de Content API
   ↓
6. Cumplir Display Requirements (logos, bubble ratings)
   ↓
7. Listo para producción (no hay certificación)
```

### 12.2. Flujo de Conexión por Propiedad

```
1. Admin abre GO Admin → Integraciones → TripAdvisor
   ↓
2. Buscar propiedad: GET /location/search?searchQuery={nombre_hotel}&category=hotels
   ↓
3. GO Admin muestra resultados de búsqueda
   ↓
4. Admin selecciona la propiedad correcta
   ↓
5. GO Admin guarda location_id vinculado a la propiedad:
   - tripadvisor_location_id en channel_connections o integration_connections
   ↓
6. GO Admin obtiene detalles: GET /location/{locationId}/details
   ↓
7. GO Admin obtiene fotos: GET /location/{locationId}/photos
   ↓
8. GO Admin obtiene reseñas: GET /location/{locationId}/reviews
   ↓
9. Contenido disponible en el panel de la propiedad
```

### 12.3. Flujo de Visualización de Contenido (en vivo)

```
1. Usuario entra a la página de una propiedad en GO Admin
   ↓
2. GO Admin hace llamadas en tiempo real:
   - GET /location/{locationId}/details (rating, ranking)
   - GET /location/{locationId}/reviews?language=es_CO (últimas reseñas)
   - GET /location/{locationId}/photos (fotos recientes)
   ↓
3. UI renderiza:
   - Bubble Rating con Ollie Logo
   - Ranking de la propiedad
   - Últimas 5 reseñas con subratings
   - Galería de 5 fotos
   ↓
4. Datos NO se cachean (política de TripAdvisor)
   - Solo location_id se almacena
```

### 12.4. Flujo de Búsqueda de Propiedades Cercanas

```
1. Admin quiere ver competencia cercana
   ↓
2. GO Admin tiene lat/lng de la propiedad (de spaces)
   ↓
3. GET /location/nearby_search?latLong={lat},{lng}&category=hotels&radius=5&radiusUnit=km
   ↓
4. GO Admin muestra mapa con propiedades cercanas
   ↓
5. Click en una propiedad → GET /location/{id}/details
   ↓
6. Muestra detalles, rating, reseñas de la competencia
```

---

## 13. Base de Datos

### 13.1. Tablas Existentes (reutilizar)

| Tabla | Uso para TripAdvisor |
|-------|---------------------|
| `integration_providers` | Provider `tripadvisor` (ID: `7a497612-d4a0-4314-8fd6-effc49c99661`) |
| `integration_connectors` | Conector `tripadvisor_ical` existente + nuevo `tripadvisor_content` |
| `integration_connections` | Conexiones activas por propiedad |
| `integration_credentials` | API Key (a nivel organización) |
| `channel_connections` | Vinculación con propiedades PMS |

### 13.2. Nuevo Conector (propuesto)

```sql
INSERT INTO integration_connectors (
  id, provider_id, code, name, description, 
  supported_countries, is_active
) VALUES (
  gen_random_uuid(),
  '7a497612-d4a0-4314-8fd6-effc49c99661',  -- tripadvisor provider
  'tripadvisor_content',
  'TripAdvisor Content API',
  'Acceso a reseñas, fotos, ratings y detalles de ubicaciones en TripAdvisor',
  ARRAY['GLOBAL'],
  true
);
```

### 13.3. Tabla para mapeo de Location IDs (propuesta)

```sql
-- Mapeo de propiedades GO Admin ↔ Location ID de TripAdvisor
CREATE TABLE tripadvisor_location_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid REFERENCES integration_connections(id) ON DELETE CASCADE,
  organization_id integer NOT NULL,
  tripadvisor_location_id text NOT NULL,     -- ID numérico en TripAdvisor
  tripadvisor_name text,                      -- Nombre en TripAdvisor
  tripadvisor_url text,                       -- URL de la página en TripAdvisor
  property_type text,                         -- hotel, restaurant, attraction
  latitude text,
  longitude text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(connection_id, tripadvisor_location_id)
);

-- Log de llamadas a la API (para tracking de costos)
CREATE TABLE tripadvisor_api_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id integer NOT NULL,
  endpoint text NOT NULL,                     -- 'details', 'photos', 'reviews', 'search', 'nearby_search'
  location_id text,                           -- Location ID consultado
  status_code integer,                        -- HTTP status code
  response_time_ms integer,                   -- Tiempo de respuesta
  created_at timestamptz DEFAULT now()
);
```

---

## 14. Archivos a Crear

### 14.1. Servicios Backend

```
src/lib/services/integrations/tripadvisor/
├── tripadvisorTypes.ts              📋 Interfaces TypeScript
├── tripadvisorConfig.ts             📋 URLs, endpoints, constantes
├── tripadvisorContentService.ts     📋 Llamadas a Content API
├── tripadvisorConnectionService.ts  📋 Gestión de conexiones y location mapping
└── index.ts                         📋 Re-exportaciones
```

### 14.2. API Routes

| Ruta | Método | Descripción |
|------|--------|-------------|
| `/api/integrations/tripadvisor/search` | GET | Buscar ubicaciones por texto |
| `/api/integrations/tripadvisor/nearby` | GET | Buscar ubicaciones cercanas |
| `/api/integrations/tripadvisor/details` | GET | Obtener detalles de una ubicación |
| `/api/integrations/tripadvisor/photos` | GET | Obtener fotos de una ubicación |
| `/api/integrations/tripadvisor/reviews` | GET | Obtener reseñas de una ubicación |
| `/api/integrations/tripadvisor/health-check` | POST | Verificar API Key válida |
| `/api/integrations/tripadvisor/list-connections` | GET | Listar conexiones activas |
| `/api/integrations/tripadvisor/create-connection` | POST | Crear nueva conexión |

### 14.3. UI Componentes

| Componente | Descripción |
|------------|-------------|
| `TripAdvisorSearchDialog.tsx` | Dialog para buscar y seleccionar propiedad de TripAdvisor |
| `TripAdvisorReviewsCard.tsx` | Card con últimas reseñas y bubble ratings |
| `TripAdvisorRatingBadge.tsx` | Badge con Ollie Logo + bubble rating |
| `TripAdvisorPhotosGallery.tsx` | Galería de fotos de TripAdvisor |
| `TripAdvisorNearbyMap.tsx` | Mapa con propiedades cercanas |

---

## 15. Seguridad

1. **API Key solo en servidor** — Nunca exponer en frontend ni código cliente
2. **HTTPS obligatorio** — Todas las llamadas sobre HTTPS
3. **Daily Budget** — Configurar límite diario para evitar gastos excesivos
4. **No cachear contenido** — Solo `location_id` puede almacenarse (política de TripAdvisor)
5. **Brand Attribution** — Cumplir Display Requirements o se revocará la key
6. **Revocación** — TripAdvisor puede revocar key si detecta filtración o mal uso
7. **Copyright** — Reenviar notificaciones de copyright a content-api@tripadvisor.com

---

## 16. Comparativa iCal vs Content API

| Funcionalidad | iCal (actual) | Content API |
|---------------|:-------------:|:-----------:|
| Sincronizar disponibilidad | ✅ | ❌ |
| Bloqueos de calendario | ✅ | ❌ |
| Detalles de propiedad | ❌ | ✅ |
| Reseñas de huéspedes | ❌ | ✅ |
| Fotos de la propiedad | ❌ | ✅ |
| Rating y bubble rating | ❌ | ✅ |
| Ranking de popularidad | ❌ | ✅ |
| Búsqueda de ubicaciones | ❌ | ✅ |
| Búsqueda por cercanía | ❌ | ✅ |
| Amenidades | ❌ | ✅ |
| Datos de viaje (trip types) | ❌ | ✅ |
| Gestión de reservas | ❌ | ❌ |
| Push de precios/inventario | ❌ | ❌ |
| Mensajería con huéspedes | ❌ | ❌ |

> **Nota**: Content API es **solo lectura**. No gestiona reservas ni inventario. Para eso se mantiene iCal y se podría evaluar TripAdvisor Connectivity Partner Program por separado.

---

## 17. Diferencias con Otros Proveedores OTA

| Aspecto | TripAdvisor Content API | Booking.com Connectivity | Expedia EQC |
|---------|------------------------|--------------------------|-------------|
| **Tipo** | Solo contenido (lectura) | Reservas + contenido completo | Reservas + contenido |
| **Auth** | API Key (query param) | OAuth2 client_credentials | Basic Auth (EQC) |
| **Formato** | REST JSON | OTA XML + B.XML + JSON | OTA XML + JSON |
| **Reservas** | ❌ No soporta | ✅ Pull (polling 20s) | ✅ Pull + Push |
| **Precios/Inventario** | ❌ No soporta | ✅ Push | ✅ Push |
| **Reseñas** | ✅ Hasta 5 recientes | ✅ Guest Review API | ❌ No incluido |
| **Fotos** | ✅ Hasta 5 recientes | ✅ Photo API | ❌ No incluido |
| **Certificación** | No requerida | Por API individual | No requerida |
| **Costo** | Pay-as-you-go + 5K free/mes | Gratuito (partnership) | Gratuito (EQC account) |
| **Sandbox** | No (misma URL) | No (misma URL, diff accounts) | No (test properties) |

---

## 18. Plan de Implementación

### Fase A — Setup y Conexión Básica (1-2 semanas)

1. Registrar cuenta en TripAdvisor Developers
2. Obtener API Key
3. Implementar `tripadvisorConfig.ts` y `tripadvisorTypes.ts`
4. Implementar `tripadvisorContentService.ts` con todos los endpoints
5. Crear API routes proxy (server-side para proteger API Key)
6. Health-check endpoint

### Fase B — UI de Conexión y Búsqueda (1-2 semanas)

1. Crear nuevo conector `tripadvisor_content` en BD
2. `TripAdvisorSearchDialog.tsx` — Buscar y vincular propiedad
3. Wizard de conexión integrado al flujo estándar
4. Mapeo `location_id` ↔ propiedad GO Admin
5. API logging para tracking de costos

### Fase C — Visualización de Contenido (2-3 semanas)

1. `TripAdvisorRatingBadge.tsx` — Bubble rating con Ollie Logo
2. `TripAdvisorReviewsCard.tsx` — Card de reseñas con subratings
3. `TripAdvisorPhotosGallery.tsx` — Galería de fotos
4. Integración en página de propiedad del PMS
5. Cumplimiento completo de Display Requirements

### Fase D — Funcionalidades Avanzadas (1-2 semanas)

1. `TripAdvisorNearbyMap.tsx` — Mapa de propiedades cercanas
2. Dashboard comparativo (rating vs competencia)
3. Integración de reseñas en CRM (sentiment analysis)
4. Widget público para sitio web del hotel

---

## 19. Variables de Entorno (resumen)

### 19.1. Servidor GO Admin

```env
# TripAdvisor Content API
TRIPADVISOR_API_KEY=your_api_key_here
```

### 19.2. Credenciales por Organización (BD)

| `purpose` | Tipo | Ejemplo | Uso |
|-----------|------|---------|-----|
| `api_key` | `api_key` | `abc123xyz...` | Autenticación en cada request |

### 19.3. Datos por Propiedad (BD)

| Campo | Tabla | Ejemplo | Uso |
|-------|-------|---------|-----|
| `tripadvisor_location_id` | `tripadvisor_location_mappings` | `60745` | Identificar propiedad en TripAdvisor |

---

## 20. Consideraciones Específicas para Colombia

| Aspecto | Detalle |
|---------|---------|
| **Idioma** | Usar `es_CO` para contenido en español colombiano |
| **Moneda** | Usar `COP` en currency param para precios en pesos |
| **Zona horaria** | Reset de daily limit a medianoche UTC (7pm Colombia) |
| **Categorías** | Hotels, Restaurants, Attractions disponibles |
| **Cobertura** | Bogotá, Medellín, Cartagena, Santa Marta, etc. tienen buena cobertura |

---

## 21. Errores Comunes

| Error | Código | Causa | Solución |
|-------|--------|-------|----------|
| Unauthorized | 401 | API Key inválida o expirada | Verificar key en Developer Portal |
| Too Many Requests | 429 | Excede límite diario o QPS | Implementar exponential backoff, verificar daily budget |
| Not Found | 404 | Location ID no existe | Verificar ID con Location Search |
| Bad Request | 400 | Parámetros inválidos | Verificar query params |
| Forbidden | 403 | Suscripción cancelada o key revocada | Verificar estado en Developer Portal |

---

## 22. Hotel Pricing API (acceso separado)

> **Nota**: Existe una API adicional llamada **Hotel Pricing API** que permite mostrar precios de reserva. Esta API **no está incluida** en la Content API estándar y requiere solicitud directa a TripAdvisor vía [email](mailto:content-api@tripadvisor.com).

| Aspecto | Detalle |
|---------|---------|
| **Propósito** | Mostrar precios bookables de hoteles |
| **Acceso** | Solicitar por email con datos del sitio/app |
| **Requisito** | Tráfico mensual del sitio |
| **Estado** | 📋 Evaluar en futuro si se necesita booking directo |

---

## 23. Notas Importantes

- **Solo lectura**: Content API no gestiona reservas, precios ni inventario
- **Complemento a iCal**: La Content API complementa la integración iCal existente con contenido enriquecido
- **No cachear**: Política estricta — solo `location_id` se puede almacenar
- **Attribution obligatoria**: Siempre mostrar logo de TripAdvisor junto al contenido
- **5,000 llamadas gratis/mes**: Suficiente para desarrollo y propiedades pequeñas
- **1 key por cuenta**: Solo 1 API Key por cuenta de TripAdvisor
- **Datos globales**: 7.5 millones de ubicaciones en 29 idiomas
