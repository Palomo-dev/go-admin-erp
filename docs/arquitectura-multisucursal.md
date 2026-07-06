# Arquitectura Multi-Sucursal — GO Admin ERP

Documento de referencia de la arquitectura por sucursal (branch) implementada en el sistema.
Cubre el modelo de datos, la capa frontend (contexto y selector global), la seguridad (RLS)
y las fases 6–9 de la iniciativa multi-sucursal.

> Proyecto Supabase: `jgmgphmzusbluqhuqihj`

---

## 1. Visión general

Cada organización (`organizations`) puede tener múltiples **sucursales** (`branches`). La mayoría de
las entidades operativas y financieras están asociadas a una sucursal mediante la columna `branch_id`.

El sistema garantiza consistencia por sucursal en cuatro capas:

- **Frontend**: un selector global de sucursal + contexto React que expone la selección a toda la app.
- **Servicio**: `branchService` resuelve qué sucursales puede ver/usar cada usuario según su rol.
- **Base de datos (lecturas)**: RLS con el helper `app_branch_access`.
- **Base de datos (escrituras)**: auditoría (`trg_branch_audit`) + `branch_id` por defecto (`trg_branch_default`).

---

## 2. Modelo de datos

| Tabla | Rol |
|-------|-----|
| `organizations` | Organización (tenant). |
| `branches` | Sucursales de la organización. Campo `is_main` marca la principal. |
| `organization_members` | Membresía usuario↔organización (`user_id`, `organization_id`, `role_id`, `is_super_admin`, `is_active`). |
| `member_branches` | Asignación de sucursales a un miembro (`organization_member_id`, `branch_id`). |

**Reglas de acceso por rol:**

- **Super Admin / Admin de organización** (o `is_super_admin = true`): acceso a **todas** las sucursales de la organización.
- **Miembro regular**: acceso **solo** a las sucursales listadas en `member_branches`.

---

## 3. Frontend

### 3.1 Helpers de almacenamiento — `src/lib/hooks/useOrganization.ts`

La sucursal seleccionada se persiste en `localStorage` (`currentBranchId`) y el modo "Todas" en
`branchFilterAll`. Funciones clave:

- `getCurrentBranchId(): number | null` — sucursal concreta seleccionada (con caché de 30s).
  **Usar para ESCRITURAS** (crear ventas, pagos, cajas, etc.).
- `getBranchFilter(): number | null` — sucursal para **FILTRAR LECTURAS**. Devuelve `null` en modo "Todas".
- `getBranchFilterAll(): boolean` — indica si el modo "Todas las sucursales" está activo.
- `invalidateBranchIdCache()` — invalida la caché al cambiar de sucursal.
- `BRANCH_CHANGED_EVENT` — evento global (`window`) emitido al cambiar de sucursal/modo.

### 3.2 Contexto global — `src/lib/context/BranchContext.tsx`

`BranchProvider` carga las sucursales accesibles y expone `useBranch()`:

| Propiedad | Descripción |
|-----------|-------------|
| `branches` | Sucursales accesibles del usuario. |
| `selectedBranchId` | Sucursal concreta seleccionada (para escrituras/valores por defecto). |
| `isAllSelected` | `true` cuando se elige "Todas las sucursales". |
| `branchFilter` | Filtro para lecturas: `null` = no filtrar (modo Todas), o el `id` concreto. |
| `setSelectedBranch(sel)` | Cambia la selección (`number` o `ALL_BRANCHES`). |
| `canSelectAll` | `true` si el usuario tiene acceso a >1 sucursal. |
| `isLoading` | Carga del listado de sucursales. |

**Patrón de uso en páginas (lecturas):**

```tsx
const { branchFilter } = useBranch();

useEffect(() => {
  cargarDatos(); // usa branchFilter (null = todas)
}, [branchFilter]);
```

### 3.3 Selector — `src/components/common/BranchSelector.tsx`

Componente de UI (en el header de `AppLayout`) que permite elegir sucursal o "Todas".
Persiste la selección y dispara `BRANCH_CHANGED_EVENT`.

### 3.4 Servicio — `src/lib/services/branchService.ts`

`getAccessibleBranches(organizationId)` retorna `{ branches, canSelectAll }` aplicando la lógica de rol
descrita en la sección 2. **Es la fuente única** para poblar selectores y dropdowns de sucursal
(incluidos los filtros de reportes).

---

## 4. Seguridad en lecturas (RLS)

Helper de base de datos: **`app_branch_access`**. Las políticas RLS de las tablas con `branch_id` lo usan
para restringir las filas visibles a las sucursales accesibles del usuario autenticado.

- Migración: `20260705194647_branch_access_helper_function`
- Endurecimiento (eliminación de fail-open): `20260706030028_harden_app_branch_access_remove_failopen`

Además, la asignación inicial de `branch_id` a datos existentes se realizó por lotes:

- `20260705194704_branch_id_lote_3a_pos_caja`
- `20260705194733_branch_id_lote_3b_finanzas`
- `20260705194753_branch_id_lote_3c_bancos`
- `20260705194815_branch_id_lote_3d_pms_gym`

Creación automática de sucursal principal + período fiscal al crear una organización:
`fn_create_default_branch_and_period` (migración `20260705045304`).

---

## 5. Fase 6 — Auditoría de escrituras por sucursal

Registra toda inserción/actualización/borrado en tablas sensibles con su `branch_id` para trazabilidad.

- **Función**: `fn_branch_write_audit()` → inserta en **`public.ops_audit_log`**.
- **Trigger**: `trg_branch_audit` (`AFTER INSERT/UPDATE/DELETE`).
- **Tablas (10)**: `accounts_payable`, `accounts_receivable`, `bank_transactions`, `bank_transfers`,
  `cash_counts`, `cash_movements`, `class_reservations`, `credit_notes`, `rates`, `table_sessions`.
- **Migraciones**: `20260706031822_fase6_branch_write_audit`, `20260706031905_fase6_fix_audit_generated_column`.

---

## 6. Fase 7 — Consistencia UX del selector

El selector global y todos los dropdowns de sucursal muestran **solo las sucursales accesibles**
del usuario (vía `branchService.getAccessibleBranches`), evitando exponer sucursales sin acceso.
El modo "Todas" solo se ofrece si el usuario tiene acceso a más de una (`canSelectAll`).

---

## 7. Fase 8 — Reportes y agregados por sucursal

Los reportes agregan y filtran por sucursal y quedan **sincronizados con el selector global**.

- **Sincronización**: cada página de reporte lee `branchFilter` de `useBranch()` e inicializa/actualiza
  su `filters.branchId`; al cambiar la sucursal global, el reporte se recarga (y resetea paginación
  cuando aplica).
- **Dropdowns**: `getBranches()` de cada servicio de reporte delega en
  `branchService.getAccessibleBranches` (solo sucursales accesibles).
- **Reportes sincronizados** (con filtro de sucursal): `ventas`, `inventario`, `pms`, `hrm`, `finanzas`.
- **`auditoria`**: no filtra por sucursal (filtros: módulo/acción/usuario); su `getBranches` se alineó
  por consistencia aunque no se use.
- **Archivos**: `src/app/app/reportes/{ventas,inventario,pms,hrm,finanzas}/page.tsx` y
  `src/components/reportes/{ventas,inventario,pms,hrm,finanzas,auditoria}/*ReportService.ts`.

---

## 8. Fase 9 — `branch_id` por defecto en creaciones

Red de seguridad a nivel BD: si una inserción llega **sin** `branch_id`, se rellena automáticamente.

- **Función**: `fn_branch_set_default()` (`BEFORE INSERT`, `SECURITY DEFINER`).
- **Trigger**: `trg_branch_default`.
- **Prioridad de asignación**:
  1. Sucursal **asignada única** del usuario en la organización (`member_branches`).
  2. Sucursal **principal** (`branches.is_main = true`).
  3. **Primera** sucursal de la organización.
- **Tablas (12, `branch_id` nullable)**: `accounts_payable`, `accounts_receivable`, `bank_transactions`,
  `bank_transfers`, `cash_counts`, `cash_movements`, `class_reservations`, `credit_notes`, `rates`,
  `table_sessions`, `payments`, `reservations`.
- **No aplican** (ya tienen `branch_id NOT NULL`; el frontend lo envía): `sales`, `web_orders`, `cash_sessions`.
- **Comportamiento**: es aditivo. Si el insert ya trae `branch_id` (p.ej. POS con `getCurrentBranchId()`),
  el trigger no lo modifica. Corre `BEFORE INSERT`, por lo que la auditoría de Fase 6 (`AFTER INSERT`)
  registra el `branch_id` final.
- **Migración**: `20260706041253_fase9_branch_default_on_insert`.

---

## 9. Guía rápida para desarrolladores

**Al CREAR registros** en tablas con `branch_id`:

```ts
import { getCurrentBranchId, getOrganizationId } from '@/lib/hooks/useOrganization';

await supabase.from('tabla').insert({
  organization_id: getOrganizationId(),
  branch_id: getCurrentBranchId(), // sucursal seleccionada en el selector global
  // ...resto de campos
});
```

Si por algún motivo no se envía `branch_id`, el trigger `trg_branch_default` lo rellenará (Fase 9).

**Al LISTAR/CONSULTAR** por sucursal:

```tsx
const { branchFilter } = useBranch();

let query = supabase.from('tabla').select('*').eq('organization_id', orgId);
if (branchFilter) query = query.eq('branch_id', branchFilter); // null = todas
```

**Para poblar selectores de sucursal** usar siempre `branchService.getAccessibleBranches(orgId)`.

---

## 10. Referencia de objetos de BD

| Objeto | Tipo | Propósito |
|--------|------|-----------|
| `app_branch_access` | función | Helper RLS de acceso por sucursal. |
| `fn_create_default_branch_and_period` | función | Crea sucursal principal + período fiscal al crear organización. |
| `fn_branch_write_audit` / `trg_branch_audit` | función/trigger | Auditoría de escrituras (Fase 6) → `ops_audit_log`. |
| `fn_branch_set_default` / `trg_branch_default` | función/trigger | `branch_id` por defecto en inserciones (Fase 9). |
| `ops_audit_log` | tabla | Log de auditoría de operaciones. |
