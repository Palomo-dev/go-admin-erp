# Plan Pro: Acceso a Facturación Electrónica DIAN

## Contexto

**Fecha:** 1 de octubre de 2026  
**Decisión:** El dueño de GoAdmin determina que la facturación electrónica DIAN viene incluida en TODOS los planes, incluido Pro, y GoAdmin reemplaza el facturador del cliente (Siigo, Alegra, etc.).

## Estado actual (antes del cambio)

### Plan Pro - `module_config`
```json
{
  "core_modules": ["clientes", "organizations", "roles"],
  "available_modules": ["pos", "inventory"],
  "core_count": 3,
  "total_max_modules": 11,
  "max_additional_modules": 2
}
```

**Problema:** El módulo `finance` NO está en `available_modules`, por lo que las organizaciones con plan Pro no pueden:
- Emitir facturas electrónicas ante la DIAN
- Configurar el proveedor de facturación electrónica (Factus)
- Gestionar resoluciones DIAN
- Acceder a funcionalidades de finanzas necesarias para facturación

## Cambio propuesto

### Plan Pro - `module_config` DESPUÉS
```json
{
  "core_modules": ["clientes", "organizations", "roles"],
  "available_modules": ["pos", "inventory", "finance"],
  "core_count": 3,
  "total_max_modules": 12,
  "max_additional_modules": 3
}
```

**Cambios:**
- `available_modules`: agrega `"finance"`
- `total_max_modules`: 11 → 12 (+1)
- `max_additional_modules`: 2 → 3 (+1)
- `max_modules` en la tabla `plans`: 12 → 13 (+1)

## Qué incluye el módulo `finance`

El módulo `finance` NO es solo facturación electrónica. Incluye **24 páginas** organizadas en 4 grupos:

### 1. Documentos (6 páginas)
- Facturas de venta
- Cotizaciones
- Facturas de compra
- Notas crédito
- Documentos soporte
- **Facturación electrónica** ← La página específica de DIAN/Factus

### 2. Tesorería (7 páginas)
- Ingresos
- Egresos
- Transferencias
- Bancos
- Cuentas por cobrar
- Saldos a favor
- Cuentas por pagar

### 3. Contabilidad (9 páginas)
- Contabilidad (dashboard)
- Plan de cuentas
- Asientos
- Mayor contable
- Balance de comprobación
- Estado de resultados
- Balance general
- Períodos fiscales
- Reglas contables
- Centros de costos
- Activos fijos
- Presupuestos

### 4. Configuración (4 páginas)
- Impuestos
- Métodos de pago
- Monedas
- Comisiones

**Total:** 24 páginas

## Cómo se decide el acceso por plan

### En la base de datos

**Tabla `plans`:**
- Columna `module_config` (JSONB): define qué módulos están disponibles por plan
- Columna `max_modules` (integer): límite de módulos pagados que se pueden activar

**Tabla `organization_modules`:**
- Guarda qué módulos tiene activos cada organización
- Columna `is_active` (boolean): módulo activado o no
- Columna `module_code` (text): código del módulo (ej: 'finance')

**Tabla `modules`:**
- Catálogo de todos los módulos disponibles
- Columna `is_core` (boolean): módulos core no cuentan para el límite del plan

### En el código

**`moduleManagementService.ts`:**
- `getOrganizationModuleStatus()`: lee el plan actual y cuenta módulos activos
- `activateModule()`: verifica si el módulo está en `available_modules` del plan
- `canAccessModule()`: consulta si una organización tiene activo un módulo

**`catalog.ts`:**
- Define todas las páginas de cada módulo
- El módulo `finance` tiene código `'finance'` y 24 páginas

**`modulePages.ts`:**
- Deriva las páginas desde `catalog.ts`
- Se usa para activar/desactivar páginas individuales por organización

**Sidebar y navegación:**
- Leen de `catalog.ts` y filtran según módulos activos de la organización
- `filtrarNavegacion()` aplica permisos por cargo y páginas desactivadas

## Migración SQL

**Archivo:** `supabase/migrations/20261001000000_plan_pro_facturacion_electronica.sql`

**Qué hace:**
1. Muestra conteo de organizaciones Pro con finance activo ANTES (debería ser 0)
2. Actualiza el `module_config` del plan Pro para agregar 'finance'
3. Incrementa `max_modules` en 1
4. Actualiza `updated_at`
5. Muestra el `module_config` actualizado

**Rollback:** `supabase/rollbacks/20261001000000_plan_pro_facturacion_electronica_rollback.sql`
- Revierte los cambios
- Advierte si hay organizaciones Pro con finance activo (no las desactiva automáticamente)

## Impacto y riesgos

### ✅ Lo que SÍ cambia
1. Las organizaciones Pro verán el módulo "Finanzas" disponible en `/app/organizacion/modulos`
2. Podrán activar el módulo desde la UI
3. Al activarlo, verán TODO el menú de finanzas en el sidebar (24 páginas)
4. Podrán configurar facturación electrónica en `/app/finanzas/facturacion-electronica`

### ❌ Lo que NO cambia automáticamente
1. El módulo NO se activa automáticamente en organizaciones Pro existentes
2. Si no activan el módulo, no ven ningún cambio
3. El precio del plan Pro NO cambia (esto es una decisión de negocio, no técnica)
4. Los límites de otros módulos NO cambian

### ⚠️ Riesgos

#### Riesgo 1: Organizaciones Pro existentes ven el módulo disponible de repente
- **Probabilidad:** Alta
- **Impacto:** Medio - pueden confundirse o activarlo sin estar preparados
- **Mitigación:** 
  - Comunicar el cambio a clientes Pro antes del deploy
  - Preparar documentación de configuración
  - El módulo requiere configuración (proveedor, resolución DIAN) antes de poder usarlo

#### Riesgo 2: Usuarios activan finance pero no tienen configuración completa
- **Probabilidad:** Media
- **Impacto:** Bajo - verán pantallas vacías o mensajes de "configura primero"
- **Mitigación:**
  - La página de facturación electrónica muestra claramente qué falta configurar
  - No pueden emitir facturas sin: proveedor configurado, resolución DIAN, datos de empresa

#### Riesgo 3: Confusión entre módulo Finance completo vs solo facturación electrónica
- **Probabilidad:** Media
- **Impacto:** Medio - usuarios esperan solo facturación electrónica pero ven todo finanzas
- **Mitigación:**
  - Documentar claramente que finance incluye toda la suite de finanzas
  - Considerar crear páginas desactivadas por defecto para organizaciones Pro nuevas
  - La decisión del dueño fue "facturación electrónica", pero técnicamente es el módulo completo

#### Riesgo 4: Organizaciones Pro que ya tienen finance activo "ilegalmente"
- **Probabilidad:** Baja (según datos, hay 0 actualmente)
- **Impacto:** Bajo - seguirán funcionando igual
- **Mitigación:** El conteo en la migración detecta y reporta estos casos

## Requisitos para usar facturación electrónica

Después de activar el módulo `finance`, para usar facturación electrónica necesitan:

1. **Datos de empresa completos** (`organizations` table):
   - NIT o CC
   - Razón social
   - Dirección completa
   - Teléfono
   - Email

2. **Configuración del proveedor** (Factus):
   - Credenciales OAuth2 configuradas
   - Ambiente (producción o pruebas)
   - Estado activo

3. **Resolución DIAN cargada:**
   - Prefijo (ej: "FACT")
   - Rango de numeración
   - Fecha de vigencia

4. **Impuestos configurados:**
   - IVA (mínimo)
   - Retenciones (opcional)

5. **Métodos de pago definidos:**
   - Efectivo, tarjeta, transferencia, etc.

## Cómo probar con una organización Pro

### Opción A: En staging/desarrollo

1. Aplicar la migración en ambiente de desarrollo
2. Crear una organización de prueba con plan Pro
3. Ir a `/app/organizacion/modulos`
4. Verificar que "Finanzas" aparece en la lista de módulos disponibles
5. Activar el módulo
6. Verificar que el menú de Finanzas aparece en el sidebar
7. Ir a `/app/finanzas/facturacion-electronica`
8. Verificar que la página carga y muestra el estado de configuración

### Opción B: Simular sin aplicar la migración

1. En el código, temporalmente agregar 'finance' a `available_modules` del plan Pro
2. Seguir pasos 2-8 de la Opción A
3. Revertir el cambio temporal

### Script de verificación

```sql
-- Verificar plan Pro ANTES
SELECT code, name, max_modules, module_config 
FROM plans 
WHERE code = 'pro';

-- Contar organizaciones Pro con finance activo (debería ser 0)
SELECT count(*) as orgs_pro_con_finance
FROM organizations o
JOIN subscriptions s ON s.organization_id = o.id AND s.status = 'active'
JOIN plans p ON p.id = s.plan_id AND p.code = 'pro'
WHERE EXISTS (
  SELECT 1 FROM organization_modules om
  WHERE om.organization_id = o.id
    AND om.module_code = 'finance'
    AND om.is_active = true
);

-- APLICAR MIGRACIÓN AQUÍ

-- Verificar plan Pro DESPUÉS
SELECT code, name, max_modules, module_config 
FROM plans 
WHERE code = 'pro';

-- Verificar que finance está en available_modules
SELECT 
  code,
  module_config->'available_modules' @> '["finance"]'::jsonb as tiene_finance
FROM plans
WHERE code = 'pro';
```

## Siguiente paso recomendado

Después de aprobar este cambio:

1. **Aplicar en staging primero**
2. **Crear organización de prueba Pro y verificar funcionalidad completa**
3. **Preparar comunicación a clientes Pro:**
   - Email anunciando nueva funcionalidad incluida
   - Guía de configuración de facturación electrónica
   - FAQ sobre el módulo Finance
4. **Aplicar en producción**
5. **Monitorear activaciones del módulo finance en organizaciones Pro**
6. **Dar soporte a primeros usuarios que configuren facturación electrónica**

## Alternativa: Módulo separado de facturación electrónica

Si se prefiere dar SOLO acceso a facturación electrónica sin todo el módulo Finance:

1. Crear un nuevo módulo `electronic_invoicing` en la tabla `modules`
2. Mover la página `/app/finanzas/facturacion-electronica` a ese módulo
3. Agregar `electronic_invoicing` al plan Pro en lugar de `finance`
4. Ajustar permisos y navegación

**Desventaja:** Facturación electrónica depende de funcionalidades de finance (impuestos, métodos de pago, clientes), por lo que igual necesitarían acceso parcial a finance.

**Decisión actual:** Dar acceso al módulo completo `finance` es más simple y coherente.
