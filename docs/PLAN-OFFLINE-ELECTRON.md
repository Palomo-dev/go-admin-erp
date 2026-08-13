# Plan: Soporte Offline Completo en Electron

## Objetivo
Que la app de escritorio (Electron) funcione sin internet: todos los componentes visibles, datos cacheados, y acciones encoladas para sincronizar al volver la conexión.

---

## Estado actual (lo que ya funciona)

| Funcionalidad | Archivo | Estado |
|---|---|---|
| Cache del HTML (app shell) | `electron/src/main/offlineManager.ts` | Funciona |
| Cache de datos GET en IndexedDB | `src/lib/utils/offlineCache.ts` | Funciona, TTL 5 min |
| Cola de acciones POST/PATCH/DELETE | `src/lib/utils/offlineCache.ts` | Funciona |
| Sync automática al volver online | `src/lib/utils/offlineCache.ts` | Funciona |
| Banner offline en UI | `src/components/app-layout/OfflineIndicator.tsx` | Funciona |
| Cache HTTP de Chromium (assets JS/CSS) | Electron integrado | Funciona para `_next/static/` |
| Refresh token persistido en disco | `electron/src/main/store.ts` | Funciona (safeStorage) |
| Sesión en cookies + localStorage | `src/lib/supabase/config.ts` | Funciona online |

---

## Problemas que impiden offline completo

### 1. TTL de 5 minutos en cache de datos
- **Archivo:** `src/lib/utils/offlineCache.ts:85`
- **Problema:** `CACHE_TTL_MS = 5 * 60 * 1000` — después de 5 min sin internet, el cache expira y devuelve `null`, resultando en error 503.
- **Solución:** Cuando estemos offline, servir cache sin importar antigüedad. El TTL solo aplica para refrescar datos cuando hay conexión.

### 2. Auth no funciona offline
- **Archivo:** `src/lib/supabase/config.ts:242` (excluye `/auth/v1/`)
- **Problema:** Las peticiones de auth se excluyen del cache. Sin sesión válida, el middleware redirige a `/auth` y no carga nada.
- **Solución:** El middleware ya tiene `HARD_EXPIRY = 7 días` (línea 53 de `middleware.ts`), así que un JWT expirado recientemente pasa. El problema es que Supabase client intenta refrescar la sesión y falla sin internet. Hay que interceptar el refresh para que offline use la sesión cacheada sin intentar red.

### 3. Assets JS de Next.js pueden desaparecer
- **Archivo:** Cache HTTP de Chromium (no persistente por defecto en Electron)
- **Problema:** Si el cache de Chromium se limpia (disk pressure, tiempo), los chunks JS no cargan y la app queda en blanco.
- **Solución:** Usar `session.defaultSession.cache` con configuración persistente + precachear el app shell HTML que ya funciona. El cache de Chromium en Electron es persistente por defecto si no se limpia manualmente (ya removimos el cache clearing en sesión anterior).

### 4. No hay pre-cacheo de datos críticos
- **Problema:** Solo se cachea lo que el usuario visita. Si no abrió POS antes del corte, no hay datos.
- **Solución:** Al iniciar sesión en desktop, disparar un pre-cacheo de tablas críticas (products, categories, branches, organization).

---

## Plan de implementación

### Fase 1: Quitar TTL del cache offline (Prioridad ALTA)

**Archivo:** `src/lib/utils/offlineCache.ts`

**Cambio:** Modificar `getCachedResponse` para que cuando `isOnline === false`, sirva el cache sin verificar TTL.

```typescript
// Antes:
const age = Date.now() - entry.timestamp;
if (age > CACHE_TTL_MS) {
  resolve(null);
  return;
}

// Después:
if (isOnline) {
  const age = Date.now() - entry.timestamp;
  if (age > CACHE_TTL_MS) {
    resolve(null);
  return;
  }
}
// Si estamos offline, servir sin importar antigüedad
```

**Líneas afectadas:** ~84-88 de `offlineCache.ts`

---

### Fase 2: Persistir sesión auth offline (Prioridad ALTA)

**Archivos:**
- `src/lib/supabase/config.ts` (fetch wrapper)
- `electron/src/preload/index.ts` (bridge)
- `electron/src/main/store.ts` (ya guarda refresh token)

**Cambios:**

1. **En `config.ts` fetch wrapper:** Cuando estemos offline y la petición sea de auth (`/auth/v1/`), no intentar red. Devolver la sesión cacheada desde localStorage.

2. **En el preload:** Exponer un método `getStoredSession()` que lea el refresh token cifrado de `store.ts` y lo devuelva al renderer.

3. **En `config.ts`:** Al detectar que estamos en desktop y offline, usar el token guardado en localStorage (Supabase ya persiste ahí con `persistSession: true`).

**Lógica:**
```
Si isDesktopApp AND offline AND es petición auth:
  → Leer sesión de localStorage (sb-xxx-auth-token)
  → Si existe, devolver como Response cacheada
  → Si no existe, devolver error 401
```

**Líneas afectadas:** ~242-247 de `config.ts`, nuevo método en `preload/index.ts`

---

### Fase 3: Garantizar cache de assets JS (Prioridad ALTA)

**Archivo:** `electron/src/main/index.ts`

**Cambios:**

1. **Configurar cache persistente de Chromium explícitamente:**
   ```typescript
   session.defaultSession.setCacheMode('persistent');
   ```

2. **Aumentar límite de cache de disco:**
   ```typescript
   // En webPreferences de mainWindow.ts
   webPreferences: {
     // ... existente
     // El cache de Chromium usa hasta ~80% del espacio disponible
     // No necesita configuración extra si es persistente
   }
   ```

3. **No limpiar cache en startup** (ya está hecho de sesión anterior).

4. **Precachear el app shell en cada carga exitosa** (ya está en `mainWindow.ts:158-166`).

**Líneas afectadas:** ~50-52 de `index.ts`

---

### Fase 4: Pre-cachear datos críticos al iniciar sesión (Prioridad MEDIA)

**Archivos:**
- `src/lib/utils/offlineCache.ts` (nueva función `precacheCriticalData`)
- `src/components/app-layout/AppLayout.tsx` (disparar pre-cacheo)

**Cambios:**

1. **Nueva función en `offlineCache.ts`:**
   ```typescript
   export async function precacheCriticalData(): Promise<void> {
     // Disparar fetch GET a tablas críticas para que se cacheen
     const criticalTables = [
       'products',
       'categories',
       'branches',
       'organizations',
       'payment_methods',
     ];
     for (const table of criticalTables) {
       try {
         await fetch(`/api/offline-precache?table=${table}`);
       } catch { /* silenciar */ }
     }
   }
   ```

2. **En `AppLayout.tsx`:** Al montar el layout en desktop, llamar `precacheCriticalData()` en background.

**Líneas afectadas:** Nueva función + modificación en `AppLayout.tsx`

---

### Fase 5: Mejorar UX del banner offline (Prioridad BAJA)

**Archivo:** `src/components/app-layout/OfflineIndicator.tsx`

**Cambios:**
- Mostrar timestamp de última sincronización
- Mostrar qué datos están cacheados vs no disponibles
- Botón "Reintentar conexión" manual

---

## Archivos a modificar (resumen)

| # | Archivo | Cambio | Fase |
|---|---|---|---|
| 1 | `src/lib/utils/offlineCache.ts` | Quitar TTL cuando offline | 1 |
| 2 | `src/lib/supabase/config.ts` | Intercept auth offline, servir sesión cacheada | 2 |
| 3 | `electron/src/preload/index.ts` | Exponer `getStoredSession()` | 2 |
| 4 | `electron/src/main/index.ts` | Cache persistente explícito | 3 |
| 5 | `src/lib/utils/offlineCache.ts` | Función `precacheCriticalData` | 4 |
| 6 | `src/components/app-layout/AppLayout.tsx` | Disparar pre-cacheo | 4 |
| 7 | `src/components/app-layout/OfflineIndicator.tsx` | Mejorar UX | 5 |

---

## Orden de ejecución

1. **Fase 1** — Quitar TTL offline (1 cambio, ~5 líneas)
2. **Fase 2** — Auth offline (3 archivos, ~30 líneas)
3. **Fase 3** — Cache persistente (1 cambio, ~2 líneas)
4. **Fase 4** — Pre-cacheo (2 archivos, ~40 líneas)
5. **Fase 5** — UX banner (1 archivo, ~20 líneas)

## Riesgos

- **Datos stale offline:** Si un producto cambió de precio online y el usuario lo ve cacheado offline, puede vender al precio viejo. **Mitigación:** El banner ya avisa que está offline.
- **Conflictos de sync:** Si dos cajeros editan el mismo registro (uno offline, otro online). **Mitigación:** Por ahora se maneja con last-write-wins en la cola de sync.
- **Espacio en disco:** El cache de IndexedDB + Chromium puede crecer. **Mitigación:** Limitar tablas pre-cacheadas a las esenciales.

## Testing

1. Abrir app con internet, navegar por POS, inventario, etc.
2. Desconectar internet (apagar WiFi)
3. Verificar: banner offline aparece, datos siguen visibles, se pueden crear ventas (se encolan)
4. Reconectar internet
5. Verificar: cola se sincroniza, banner desaparece, datos se actualizan
