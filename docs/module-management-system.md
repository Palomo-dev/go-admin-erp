# Sistema de Gestión de Módulos - Documentación

## Descripción General

El Sistema de Gestión de Módulos permite controlar qué funcionalidades están disponibles para cada organización según su plan de suscripción. El sistema distingue entre módulos core (siempre disponibles) y módulos pagados (limitados según el plan).

## Componentes Principales

### 1. Servicios Backend

- **moduleManagementService.ts**: Gestiona la activación/desactivación de módulos y verifica límites de plan
- **permissionService.ts**: Integrado con la gestión de módulos para verificar permisos
- **middleware.ts**: Protege rutas basado en módulos activos y redirige si es necesario

### 2. API Routes

- **/api/modules**: Endpoints para obtener, activar y desactivar módulos
- **/api/modules/audit**: Endpoints para auditar y corregir inconsistencias

### 3. Componentes Frontend

- **ModuleManagement.tsx**: Interfaz de administración para gestionar módulos
- **DynamicSidebar.tsx**: Sidebar que muestra solo módulos activos y accesibles
- **ModuleAccessDenied.tsx**: Página de error para acceso denegado

### 4. Hooks Personalizados

- **useActiveModules.ts**: Hook para gestionar módulos activos
- **useModuleAccess.ts**: Hook para verificar acceso a módulos específicos

## Módulos Core vs Pagados

### Módulos Core (siempre disponibles)
- **organizations**: Gestión de la organización
- **branding**: Personalización de marca
- **branches**: Gestión de sucursales
- **roles**: Gestión de roles y permisos
- **subscriptions**: Gestión de suscripciones

### Módulos Pagados (limitados por plan)
- **pos_retail**: Punto de venta
- **inventory**: Inventario
- **pms_hotel**: Sistema de gestión hotelera
- **parking**: Gestión de estacionamientos
- **crm**: Gestión de relaciones con clientes
- **hrm**: Gestión de recursos humanos
- **finance**: Finanzas
- **reports**: Reportes
- **notifications**: Notificaciones
- **integrations**: Integraciones
- **transport**: Transporte
- **calendar**: Calendario
- **operations**: Operaciones/Timeline

## Límites por Plan

| Plan | Módulos Pagados | Sucursales |
|------|----------------|------------|
| Free | 2 | 1 |
| Pro | 10 | 5 |
| Enterprise | 100 | 50 |

## Mapeo de Rutas a Módulos

| Ruta | Módulo |
|------|--------|
| /app/organizacion | organizations |
| /app/branding | branding |
| /app/sucursales | branches |
| /app/roles | roles |
| /app/pos | pos_retail |
| /app/inventario | inventory |
| /app/pms | pms_hotel |
| /app/pms/parking | parking |
| /app/crm | crm |
| /app/hrm | hrm |
| /app/finanzas | finance |
| /app/reportes | reports |
| /app/notificaciones | notifications |
| /app/integraciones | integrations |
| /app/transporte | transport |
| /app/calendario | calendar |
| /app/timeline | operations |

## Flujo de Trabajo para Administradores

### Activación de Módulos
1. Acceder a la interfaz de administración de módulos
2. Seleccionar la organización a gestionar
3. Ver módulos disponibles y activos
4. Activar módulos dentro de los límites del plan

### Desactivación de Módulos
1. Acceder a la interfaz de administración de módulos
2. Seleccionar la organización a gestionar
3. Ver módulos activos
4. Desactivar módulos pagados (los módulos core no pueden desactivarse)

### Auditoría y Corrección
1. Usar la función de auditoría para detectar inconsistencias
2. Aplicar correcciones automáticas o manuales según sea necesario

## Consideraciones Técnicas

### Rendimiento del Middleware
- Implementa caché de sesiones para reducir llamadas a Supabase
- Validación JWT local para mejorar tiempos de respuesta
- Actualización asíncrona de actividad de usuario
- Optimización de rutas excluidas

### Base de Datos
- Tabla `modules`: Contiene todos los módulos disponibles
- Tabla `organization_modules`: Relaciona organizaciones con módulos activos
- Tabla `plans`: Define límites de módulos y sucursales por plan
- Tabla `subscriptions`: Relaciona organizaciones con su plan actual

### Seguridad
- Validación de límites en base de datos con triggers
- Middleware que bloquea acceso a módulos inactivos
- Permisos granulares por módulo y función

## Solución de Problemas

### Módulos no aparecen en el sidebar
- Verificar que el módulo está activo en `organization_modules`
- Comprobar que el usuario tiene permisos para el módulo
- Revisar que el módulo está correctamente mapeado en el sidebar

### Error de acceso a módulo
- Verificar que la organización tiene acceso al módulo
- Comprobar que el usuario tiene los permisos necesarios
- Revisar logs del middleware para identificar el problema

### Límites de plan excedidos
- Usar la función de auditoría para detectar organizaciones que exceden límites
- Aplicar correcciones o contactar al cliente para upgrade de plan

## Mejoras Futuras

- Implementación de analytics de uso de módulos
- Workflow automatizado de upgrade de planes
- Sistema de notificaciones avanzado para límites
- Marketplace mejorado con descripciones detalladas de módulos
