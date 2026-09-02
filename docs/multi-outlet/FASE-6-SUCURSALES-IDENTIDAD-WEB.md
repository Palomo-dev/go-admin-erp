# Fase 6 — Sucursales: Identidad Web

> **Plan padre**: `docs/multi-outlet/PLAN.md`
> **Depende de**: Fase 0 (Fundaciones BD — columnas de identidad web en `branches`)
> **Esfuerzo**: S (1-2 días)
> **Capa**: UI/ERP

---

## 1. Objetivo

El formulario de sucursales (`BranchForm`) del ERP debe permitir configurar la
**identidad web** de cada outlet (branch) para que el sitio público
(`goadmin-websites`) pueda resolverlo por subdominio o por path.

Hoy el `BranchForm` solo captura datos físicos/operativos (dirección, teléfono,
horarios, gerente, características). **No existe** ningún campo de identidad
web. La columna `branch_type` existe en la BD pero no se expone en el UI.

Con esta fase, cada branch podrá configurar:

| Campo | Propósito |
|---|---|
| `slug` | Resolución por path: `tugranhotel.com/{slug}` |
| `subdomain` | Resolución por subdominio: `{subdomain}.goadmin.io` |
| `custom_domain` | Dominio propio: `tugranhotel.com` |
| `website_logo_url` | Logo del outlet (override del logo de la org) |
| `website_cover_url` | Imagen de portada del outlet |
| `is_web_published` | Toggle: si `true`, el outlet tiene sitio público |
| `branch_type` | Tipo de negocio (ya en BD, falta en UI) |

### Resolución de URL pública (orden de prioridad)

```
1. custom_domain  → https://tugranhotel.com
2. subdomain      → https://hotel.goadmin.io
3. slug           → https://{org-subdomain}.goadmin.io/{slug}
```

---

## 2. Estado actual (verificado)

### Tabla `branches` (Supabase, proyecto `jgmgphmzusbluqhuqihj`)

Columnas existentes relevantes:

| Columna | Tipo | Nullable | Notas |
|---|---|---|---|
| `id` | integer | NO | PK |
| `organization_id` | integer | NO | FK |
| `name` | varchar | NO | |
| `branch_type` | varchar | YES | **Existe pero solo 2 rows con valor** |
| `is_web_stock_source` | boolean | NO | default `false` |
| `is_active` | boolean | YES | default `true` |
| `is_main` | boolean | YES | default `false` |

**Columnas que faltan** (se añaden en Fase 0 vía MCP de Supabase):

| Columna nueva | Tipo | Nullable | Default | Constraint |
|---|---|---|---|---|
| `slug` | varchar | YES | NULL | UNIQUE `(organization_id, slug)` |
| `subdomain` | varchar | YES | NULL | UNIQUE global |
| `custom_domain` | varchar | YES | NULL | UNIQUE global |
| `website_logo_url` | text | YES | NULL | |
| `website_cover_url` | text | YES | NULL | |
| `is_web_published` | boolean | NO | `false` | |

> **Regla del proyecto**: los cambios de esquema se aplican vía MCP de
> Supabase (`apply_migration`), nunca con archivos `.sql` en el repo.

### Archivos afectados

| Archivo | Líneas actuales | Rol |
|---|---|---|
| `src/types/branch.ts` | 62 | Interface `Branch` + `BranchFormData` |
| `src/components/branches/BranchForm.tsx` | 593 | Formulario de creación/edición |
| `src/components/organization/BranchesTab.tsx` | 769 | Tabla de listado + modal |
| `src/lib/services/branchService.ts` | 489 | CRUD de branches (Supabase) |

---

## 3. Cambios en `src/types/branch.ts`

Añadir los nuevos campos a la interface `Branch`:

```typescript
export interface Branch {
  id?: number;
  organization_id: number;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  country_code?: string;
  state_code?: string;
  municipality_id?: string;
  postal_code?: string;
  latitude?: number;
  longitude?: number;
  phone?: string;
  email?: string;
  manager_id?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  is_main?: boolean;
  tax_identification?: string;
  opening_hours?: OpeningHours;
  features?: BranchFeatures;
  capacity?: number;
  branch_type?: string;
  zone?: string;
  branch_code: string;
  is_active?: boolean;
  is_web_stock_source?: boolean;

  // --- Identidad Web (Fase 6) ---
  slug?: string;
  subdomain?: string;
  custom_domain?: string;
  website_logo_url?: string;
  website_cover_url?: string;
  is_web_published?: boolean;
};

export type BranchType = 'hotel' | 'restaurant' | 'retail' | 'gym' | 'transport' | 'parking' | 'services';

export const BRANCH_TYPES: { value: BranchType; label: string }[] = [
  { value: 'hotel', label: 'Hotel' },
  { value: 'restaurant', label: 'Restaurante' },
  { value: 'retail', label: 'Tienda / Retail' },
  { value: 'gym', label: 'Gimnasio' },
  { value: 'transport', label: 'Transporte' },
  { value: 'parking', label: 'Parqueadero' },
  { value: 'services', label: 'Servicios' },
];
```

`BranchFormData` hereda automáticamente los nuevos campos vía
`extends Omit<Branch, 'opening_hours' | 'features'>`.

---

## 4. Cambios en `BranchForm.tsx`

### 4.1 Estado inicial del formulario

En el `useState` del formulario (línea ~79), añadir los campos nuevos:

```typescript
const [form, setForm] = useState<BranchFormData>({
  // ... campos existentes ...
  branch_type: initialData.branch_type || '',
  // --- Identidad Web ---
  slug: initialData.slug || '',
  subdomain: initialData.subdomain || '',
  custom_domain: initialData.custom_domain || '',
  website_logo_url: initialData.website_logo_url || '',
  website_cover_url: initialData.website_cover_url || '',
  is_web_published: initialData.is_web_published ?? false,
  organization_id: initialData.organization_id!,
});
```

### 4.2 Validaciones de formato (helpers)

Añadir fuera del componente:

```typescript
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Subdomain: único label DNS (sin puntos), max 63 chars, no empieza/termina en guion
const SUBDOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const DOMAIN_REGEX = /^(?!:\/\/)([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;

function validateSlug(slug: string): string | null {
  if (!slug) return null; // opcional salvo is_web_published
  if (slug.length < 2) return 'El slug debe tener al menos 2 caracteres';
  if (slug.length > 60) return 'El slug no puede exceder 60 caracteres';
  if (!SLUG_REGEX.test(slug)) return 'Solo minúsculas, números y guiones. Sin espacios.';
  return null;
}

function validateSubdomain(subdomain: string): string | null {
  if (!subdomain) return null;
  if (subdomain.length > 63) return 'El subdominio no puede exceder 63 caracteres (label DNS)';
  if (subdomain.includes('.')) return 'El subdominio no debe contener puntos (es un único label)';
  if (!SUBDOMAIN_REGEX.test(subdomain)) {
    return 'Solo minúsculas, números y guiones. Debe empezar y terminar con letra o número.';
  }
  return null;
}

function validateDomain(domain: string, field: string): string | null {
  if (!domain) return null;
  if (domain.length > 253) return `${field} no puede exceder 253 caracteres`;
  if (!DOMAIN_REGEX.test(domain)) return `${field} no es un dominio válido`;
  return null;
}

function validateUrl(url: string, field: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return `${field} debe ser una URL http(s):// válida`;
    }
    return null;
  } catch {
    return `${field} no es una URL válida`;
  }
}
```

### 4.3 Validación antes de submit

Dentro de `handleSubmit`, antes de llamar `onSubmit`.

> **Corrección QA (closure stale)**: NO usar `setForm(prev => ({ ...prev,
> is_web_published: true }))` y luego leer `form` — ese `setForm` es asíncrono
> y `form` en el resto del handler sigue siendo el valor anterior (stale
> closure). En su lugar, construir una **variable local** con el valor
> corregido y usarla tanto para `onSubmit` como para el JSON.

```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setError(null);

  // --- Validaciones identidad web ---
  const slugError = validateSlug(form.slug);
  if (slugError) { setError(slugError); return; }

  const subdomainError = validateSubdomain(form.subdomain);
  if (subdomainError) { setError(subdomainError); return; }

  const customDomainError = validateDomain(form.custom_domain, 'El dominio personalizado');
  if (customDomainError) { setError(customDomainError); return; }

  // Validar URLs de logo y cover (no fiarse solo del type="url" del input)
  const logoUrlError = validateUrl(form.website_logo_url, 'La URL del logo');
  if (logoUrlError) { setError(logoUrlError); return; }

  const coverUrlError = validateUrl(form.website_cover_url, 'La URL de portada');
  if (coverUrlError) { setError(coverUrlError); return; }

  // Si is_web_published=true, slug es obligatorio (resolución por path fallback)
  if (form.is_web_published && !form.slug) {
    setError('Si el sitio web está publicado, el slug es obligatorio.');
    return;
  }

  // Si hay subdomain o custom_domain, forzar is_web_published=true
  // Usar variable local, NO setForm + leer form (evita closure stale)
  const shouldPublish = !!(form.subdomain || form.custom_domain);
  const formWithPublished = {
    ...form,
    is_web_published: form.is_web_published || shouldPublish,
  };

  try {
    const formWithJson = {
      ...formWithPublished,
      opening_hours: JSON.stringify(openingHoursObj),
      features: JSON.stringify(featuresObj),
    };
    await onSubmit(formWithJson);
  } catch (err: any) {
    setError(err.message || 'Error al guardar la sucursal');
  }
};
```

### 4.4 Sección "Identidad Web" en el JSX

Insertar **después** de la sección "Características" (línea ~511) y **antes**
de la sección "Estado" (línea ~514).

> **Corrección QA (signup flow)**: La sección debe envolverse en
> `{!hideStatusSection && (...)}` para que **no se muestre** durante el flujo
> de signup (`BranchStep.tsx` pasa `hideStatusSection={true}`). En el signup la
> org aún no existe y los campos de identidad web no aplican — se configuran
> después desde el ERP. Esto es consistente con cómo ya se ocultan las
> secciones "Gerente" y "Estado" en `BranchForm.tsx` (líneas 333 y 515).

```tsx
{/* Identidad Web — oculta durante signup (hideStatusSection) */}
{!hideStatusSection && (
<div className="bg-white dark:bg-gray-800 rounded-lg p-5 border border-gray-100 dark:border-gray-700 shadow-sm">
  <div className="flex items-center gap-2 mb-4">
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
    </svg>
    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Identidad Web</h3>
  </div>

  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
    {/* branch_type — select */}
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
        Tipo de negocio
      </label>
      <select
        name="branch_type"
        value={form.branch_type || ''}
        onChange={handleChange}
        className="select select-bordered w-full bg-gray-50 dark:bg-gray-700 dark:text-gray-100"
      >
        <option value="">Sin especificar</option>
        {BRANCH_TYPES.map(bt => (
          <option key={bt.value} value={bt.value}>{bt.label}</option>
        ))}
      </select>
      <p className="text-xs text-gray-400 mt-1">
        Determina las secciones disponibles en el editor de branding (Fase 4).
      </p>
    </div>

    {/* slug */}
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
        Slug (URL path)
      </label>
      <input
        type="text"
        name="slug"
        value={form.slug || ''}
        onChange={(e) => {
          // Auto-normalizar: lowercase, sin espacios
          const normalized = e.target.value
            .toLowerCase()
            .trim()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, '');
          setForm(prev => ({ ...prev, slug: normalized }));
        }}
        placeholder="hotel, restaurante-1"
        className="input input-bordered w-full bg-gray-50 dark:bg-gray-700 dark:text-gray-100"
      />
      <p className="text-xs text-gray-400 mt-1">
        Solo minúsculas, números y guiones. Único por organización.
      </p>
      {/* Advertencia al editar slug de un outlet ya publicado */}
      {initialData.id && initialData.slug && initialData.slug !== form.slug && (
        <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-200">
          ⚠️ Cambiar el slug romperá las URLs existentes
          ({initialData.slug} → {form.slug}). Los bookmarks y enlaces
          indexados dejarán de funcionar.
        </div>
      )}
    </div>

    {/* subdomain */}
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
        Subdominio
      </label>
      <div className="flex items-center">
        <input
          type="text"
          name="subdomain"
          value={form.subdomain || ''}
          onChange={handleChange}
          placeholder="hotel"
          className="input input-bordered flex-1 bg-gray-50 dark:bg-gray-700 dark:text-gray-100"
        />
        <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">.goadmin.io</span>
      </div>
      <p className="text-xs text-gray-400 mt-1">
        Único global. Ej: <code>hotel</code> → https://hotel.goadmin.io
      </p>
    </div>

    {/* custom_domain */}
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
        Dominio personalizado
      </label>
      <input
        type="text"
        name="custom_domain"
        value={form.custom_domain || ''}
        onChange={handleChange}
        placeholder="tugranhotel.com"
        className="input input-bordered w-full bg-gray-50 dark:bg-gray-700 dark:text-gray-100"
      />
      <p className="text-xs text-gray-400 mt-1">
        Único global. Requiere configurar DNS (registro A/CNAME).
      </p>
    </div>

    {/* website_logo_url */}
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
        URL del logo web
      </label>
      <input
        type="url"
        name="website_logo_url"
        value={form.website_logo_url || ''}
        onChange={handleChange}
        placeholder="https://.../logo-hotel.png"
        className="input input-bordered w-full bg-gray-50 dark:bg-gray-700 dark:text-gray-100"
      />
      <p className="text-xs text-gray-400 mt-1">
        Override del logo de la organización para este outlet.
      </p>
    </div>

    {/* website_cover_url */}
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
        URL de imagen de portada
      </label>
      <input
        type="url"
        name="website_cover_url"
        value={form.website_cover_url || ''}
        onChange={handleChange}
        placeholder="https://.../cover-hotel.jpg"
        className="input input-bordered w-full bg-gray-50 dark:bg-gray-700 dark:text-gray-100"
      />
    </div>

    {/* is_web_published — toggle */}
    <div className="md:col-span-2">
      <div className="bg-gray-50 hover:bg-blue-50 dark:bg-gray-700/50 dark:hover:bg-blue-900/20 p-3 rounded-lg transition-all duration-200">
        <label className="flex items-start space-x-3 cursor-pointer">
          <input
            type="checkbox"
            name="is_web_published"
            checked={!!form.is_web_published}
            onChange={handleChange}
            className="checkbox checkbox-sm checkbox-primary mt-0.5"
          />
          <span>
            <span className="block text-sm font-medium text-gray-800 dark:text-gray-200">
              Sitio web publicado
            </span>
            <span className="block text-xs text-gray-500 dark:text-gray-400">
              Si está activo, el outlet tiene sitio público accesible por
              subdominio, dominio propio o path.
            </span>
          </span>
        </label>
      </div>
    </div>
  </div>

  {/* Preview de URL pública */}
  {form.is_web_published && (
    <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800">
      <p className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-1">
        URL pública del outlet:
      </p>
      <code className="text-sm text-blue-800 dark:text-blue-200 break-all">
        {form.custom_domain
          ? `https://${form.custom_domain}`
          : form.subdomain
            ? `https://${form.subdomain}.goadmin.io`
            : form.slug
              ? `https://{org-subdomain}.goadmin.io/${form.slug}`
              : '— configura slug, subdominio o dominio para ver la URL'}
      </code>
    </div>
  )}
</div>
)}
```

### 4.5 Import a añadir al top del archivo

```typescript
import { BRANCH_TYPES } from '@/types/branch';
```

---

## 5. Cambios en `BranchesTab.tsx`

### 5.1 Nueva columna "Sitio web" en la tabla

Añadir el `<th>` después de `{t('thStatus')}` (línea ~455):

```tsx
<th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
  Sitio Web
</th>
```

Añadir el `<td>` correspondiente dentro del `branches.map` (después del `<td>`
de estado, línea ~608):

```tsx
<td className="px-6 py-4">
  <div className="text-sm">
    {branch.is_web_published ? (
      <div className="space-y-1">
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-800/30 dark:text-green-100">
          <svg className="mr-1.5 h-2 w-2 text-green-500 dark:text-green-400" fill="currentColor" viewBox="0 0 8 8">
            <circle cx="4" cy="4" r="3" />
          </svg>
          Publicado
        </span>
        <div className="text-xs text-gray-500 dark:text-gray-400 break-all">
          {branch.custom_domain
            ? `https://${branch.custom_domain}`
            : branch.subdomain
              ? `https://${branch.subdomain}.goadmin.io`
              : branch.slug
                ? `/{branch.slug}`
                : 'Sin URL'}
        </div>
        {/* Botón Ver sitio */}
        {(branch.custom_domain || branch.subdomain || branch.slug) && (
          <a
            href={
              branch.custom_domain
                ? `https://${branch.custom_domain}`
                : branch.subdomain
                  ? `https://${branch.subdomain}.goadmin.io`
                  : `https://${orgSubdomain}.goadmin.io/${branch.slug}`
            }
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center text-xs text-blue-600 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-100"
          >
            <svg className="h-3 w-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Ver sitio
          </a>
        )}
      </div>
    ) : (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
        No publicado
      </span>
    )}
  </div>
</td>
```

### 5.2 Toggle rápido `is_web_published`

Añadir en la columna de acciones (línea ~623), antes del botón de editar:

```tsx
{/* Toggle publicación web */}
<button
  className={`inline-flex items-center px-2.5 py-1.5 border text-xs font-medium rounded focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors ${
    branch.is_web_published
      ? 'border-green-300 text-green-700 bg-green-50 hover:bg-green-100 dark:border-green-600 dark:text-green-200 dark:bg-green-900/30'
      : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:bg-gray-800 dark:hover:bg-gray-900'
  }`}
  onClick={() => handleToggleWebPublished(branch)}
  disabled={formLoading}
  title={branch.is_web_published ? 'Despublicar sitio' : 'Publicar sitio'}
>
  <svg className="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
  </svg>
  {branch.is_web_published ? 'Despublicar' : 'Publicar'}
</button>
```

Handler en el componente:

```typescript
const handleToggleWebPublished = async (branch: Branch) => {
  // Si va a publicar y no tiene slug, advertir
  if (!branch.is_web_published && !branch.slug) {
    setError('Para publicar el sitio, primero edita la sucursal y asigna un slug.');
    return;
  }
  setFormLoading(true);
  setError(null);
  try {
    await branchService.updateBranch(branch.id!, {
      is_web_published: !branch.is_web_published,
    });
    await fetchBranches();
    setSuccessMessage(
      !branch.is_web_published ? 'Sitio web publicado' : 'Sitio web despublicado'
    );
    setTimeout(() => setSuccessMessage(null), 3000);
  } catch (err: any) {
    setError(err.message || 'Error al cambiar estado de publicación');
  } finally {
    setFormLoading(false);
  }
};
```

### 5.3 Variable `orgSubdomain`

Para construir la URL de preview por path se necesita el subdominio de la
organización. Añadir al estado del componente:

```typescript
const [orgSubdomain, setOrgSubdomain] = useState<string>('');
```

Y en el `useEffect` inicial, consultar el subdominio de la org:

```typescript
useEffect(() => {
  if (orgId) {
    fetchBranches();
    fetchBranchLimit();
    // Fetch org subdomain for URL preview
    supabase
      .from('organizations')
      .select('subdomain')
      .eq('id', orgId)
      .single()
      .then(({ data }) => {
        if (data?.subdomain) setOrgSubdomain(data.subdomain);
      });
  }
}, [orgId]);
```

> **Nota**: asume que `organizations` tiene columna `subdomain`. Si no existe
> aún, el preview por path usará un placeholder hasta que se implemente.

---

## 6. Cambios en `branchService.ts`

### 6.1 `createBranch` — aceptar nuevos campos

En el objeto `formattedBranch` (línea ~161), añadir:

```typescript
const formattedBranch = {
  // ... campos existentes ...
  is_web_stock_source: branch.is_web_stock_source ?? false,
  // --- Identidad Web ---
  slug: branch.slug || null,
  subdomain: branch.subdomain || null,
  custom_domain: branch.custom_domain || null,
  website_logo_url: branch.website_logo_url || null,
  website_cover_url: branch.website_cover_url || null,
  is_web_published: branch.is_web_published ?? false,
};
```

### 6.2 `updateBranch` — aceptar nuevos campos

En el bloque de `if (campo !== undefined)` (línea ~222), añadir:

```typescript
if (branch.slug !== undefined) formattedBranch.slug = branch.slug || null;
if (branch.subdomain !== undefined) formattedBranch.subdomain = branch.subdomain || null;
if (branch.custom_domain !== undefined) formattedBranch.custom_domain = branch.custom_domain || null;
if (branch.website_logo_url !== undefined) formattedBranch.website_logo_url = branch.website_logo_url || null;
if (branch.website_cover_url !== undefined) formattedBranch.website_cover_url = branch.website_cover_url || null;
if (branch.is_web_published !== undefined) formattedBranch.is_web_published = branch.is_web_published;
```

### 6.3 Validación de unicidad antes de guardar

Añadir un método helper de validación:

```typescript
/**
 * Valida unicidad de slug (por org), subdomain y custom_domain (globales).
 * Lanza Error si hay conflicto.
 */
async validateWebIdentity(
  data: { slug?: string; subdomain?: string; custom_domain?: string },
  organizationId: number,
  excludeBranchId?: number
): Promise<void> {
  // Validar slug único por organización
  if (data.slug) {
    let query = supabase
      .from('branches')
      .select('id, name')
      .eq('organization_id', organizationId)
      .eq('slug', data.slug);
    if (excludeBranchId) query = query.neq('id', excludeBranchId);
    const { data: existing } = await query.maybeSingle();
    if (existing) {
      throw new Error(`El slug "${data.slug}" ya lo usa otra sucursal de esta organización: ${existing.name}`);
    }
  }

  // Validar subdomain único global
  if (data.subdomain) {
    let query = supabase
      .from('branches')
      .select('id, name, organization_id')
      .eq('subdomain', data.subdomain);
    if (excludeBranchId) query = query.neq('id', excludeBranchId);
    const { data: existing } = await query.maybeSingle();
    if (existing) {
      throw new Error(`El subdominio "${data.subdomain}" ya está en uso por otra sucursal: ${existing.name}`);
    }
  }

  // Validar custom_domain único global
  if (data.custom_domain) {
    let query = supabase
      .from('branches')
      .select('id, name, organization_id')
      .eq('custom_domain', data.custom_domain);
    if (excludeBranchId) query = query.neq('id', excludeBranchId);
    const { data: existing } = await query.maybeSingle();
    if (existing) {
      throw new Error(`El dominio "${data.custom_domain}" ya está en uso por otra sucursal: ${existing.name}`);
    }
  }
},
```

Llamar la validación dentro de `createBranch` antes del `insert`:

```typescript
await this.validateWebIdentity(branch, branch.organization_id);
```

Y dentro de `updateBranch` antes del `update`:

```typescript
await this.validateWebIdentity(
  { slug: branch.slug, subdomain: branch.subdomain, custom_domain: branch.custom_domain },
  /* organizationId se obtiene del branch existente o se pasa como param */,
  branchId
);
```

> **Nota**: `updateBranch` recibe `Partial<Branch>` que no incluye
> `organization_id`. Hay dos opciones:
> 1. Pasar `organizationId` como parámetro extra a `updateBranch`.
> 2. Hacer un `getBranchById` previo para obtener el `organization_id`.
> Se recomienda la opción 1 para evitar una query extra:

```typescript
async updateBranch(
  branchId: number,
  branch: Partial<Branch>,
  organizationId?: number
): Promise<Branch> {
  // Validar unicidad si hay campos web
  if (branch.slug || branch.subdomain || branch.custom_domain) {
    if (!organizationId) {
      const existing = await this.getBranchById(branchId);
      organizationId = existing.organization_id;
    }
    await this.validateWebIdentity(
      { slug: branch.slug, subdomain: branch.subdomain, custom_domain: branch.custom_domain },
      organizationId,
      branchId
    );
  }
  // ... resto del método ...
}
```

Actualizar la llamada en `BranchesTab.tsx` (línea ~210):

```typescript
await branchService.updateBranch(editingBranch.id!, formData, orgId);
```

### 6.2.1 Inventario de llamadas a `branchService.updateBranch` en el repo

> **Corrección QA**: grep sobre el repo (excluyendo este doc) encontró **1
> llamada real** que debe actualizarse para pasar `organizationId` opcional.
> Las demás coincidencias son ejemplos dentro de este mismo documento.

| # | Archivo | Línea | Llamada actual | Acción requerida |
|---|---|---|---|---|
| 1 | `src/components/organization/BranchesTab.tsx` | 210 | `await branchService.updateBranch(editingBranch.id!, formData);` | Añadir `orgId` como 3er arg: `updateBranch(editingBranch.id!, formData, orgId)` |

**Detalle de la única llamada productiva** (`BranchesTab.tsx:210`):

```typescript
// ANTES
await branchService.updateBranch(editingBranch.id!, formData);

// DESPUÉS
await branchService.updateBranch(editingBranch.id!, formData, orgId);
```

> `orgId` ya está disponible en el scope de `BranchesTab` (se obtiene del
> contexto de organización). Sin este cambio, `updateBranch` tendría que
> hacer un `getBranchById` extra para inferir el `organization_id` al validar
> unicidad del `slug` por org (ver sección 6.3).
>
> **No se encontraron otras llamadas** en `src/` fuera de `BranchesTab.tsx`.
> Si en el futuro se añaden nuevos consumidores de `updateBranch` con campos
> de identidad web, deberán pasar `organizationId` explícitamente.

---

## 7. UI de Preview de URL pública

### 7.1 En el BranchForm (durante edición)

Ya incluido en la sección 4.4 — el bloque de preview se renderiza cuando
`is_web_published` es `true` y muestra la URL calculada según prioridad:

```
custom_domain > subdomain > slug
```

### 7.2 Después de guardar (toast/banner de éxito)

En `BranchesTab.tsx`, enriquecer el `successMessage` tras crear/editar para
incluir la URL pública si el outlet quedó publicado:

```typescript
const handleFormSubmit = async (formData: any) => {
  setFormLoading(true);
  setError(null);
  try {
    let savedBranch: Branch;
    if (editingBranch) {
      savedBranch = await branchService.updateBranch(editingBranch.id!, formData, orgId);
      setSuccessMessage(t('branchUpdated'));
    } else {
      savedBranch = await branchService.createBranch({ ...formData, organization_id: orgId });
      setSuccessMessage(t('branchCreated'));
    }

    // Si quedó publicado, mostrar URL
    if (savedBranch.is_web_published) {
      const publicUrl = savedBranch.custom_domain
        ? `https://${savedBranch.custom_domain}`
        : savedBranch.subdomain
          ? `https://${savedBranch.subdomain}.goadmin.io`
          : savedBranch.slug
            ? `https://${orgSubdomain}.goadmin.io/${savedBranch.slug}`
            : null;
      if (publicUrl) {
        setSuccessMessage(`${t('branchUpdated')} — URL pública: ${publicUrl}`);
      }
    }

    setShowForm(false);
    setEditingBranch(null);
    await fetchBranches();
    window.dispatchEvent(new CustomEvent(BRANCHES_UPDATED_EVENT));
    setTimeout(() => setSuccessMessage(null), 5000);
  } catch (err: any) {
    setError(err.message || t('errorSaving'));
  } finally {
    setFormLoading(false);
  }
};
```

### 7.3 Botón "Ver sitio" en la tabla

Ya incluido en la sección 5.1 — un `<a>` con `target="_blank"` que abre la
URL pública del outlet en una pestaña nueva.

---

## 8. Validaciones — Resumen

| Campo | Regla | Cuándo |
|---|---|---|
| `slug` | Solo `[a-z0-9-]`, min 2, max 60. Sin espacios. | Frontend (onChange + submit) |
| `slug` | Único por `organization_id` | `branchService.validateWebIdentity` |
| `subdomain` | Único label DNS (sin puntos), max 63 chars. Regex `^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$`. Único global. | Frontend (`validateSubdomain`) + service |
| `custom_domain` | Formato de dominio válido. Único global. | Frontend (`validateDomain`) + service |
| `website_logo_url` | URL válida `http(s)://` (no solo `type="url"` del input) | Frontend (`validateUrl` en submit) |
| `website_cover_url` | URL válida `http(s)://` (no solo `type="url"` del input) | Frontend (`validateUrl` en submit) |
| `is_web_published=true` | `slug` obligatorio | Frontend (submit) |
| `subdomain` o `custom_domain` seteados | `is_web_published` debe ser `true` | Frontend (auto-forzar vía variable local, no `setForm`) |
| `branch_type` | Enum: hotel, restaurant, retail, gym, transport, parking, services | Frontend (select) |

---

## 9. Definition of Done

- [ ] `Branch` interface tiene los 6 campos nuevos (`slug`, `subdomain`, `custom_domain`, `website_logo_url`, `website_cover_url`, `is_web_published`)
- [ ] `BranchForm` tiene sección "Identidad Web" con todos los campos
- [ ] `branch_type` tiene `<select>` en el UI con los 7 valores (no solo en BD)
- [ ] Validación de formato de `slug` (regex) funciona en tiempo real
- [ ] Validación de `subdomain` como label DNS único (sin puntos, max 63, regex `^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$`) funciona en submit
- [ ] Validación de formato de `custom_domain` funciona en submit
- [ ] Validación de `website_logo_url` y `website_cover_url` como URLs `http(s)://` válidas en submit (no solo `type="url"`)
- [ ] `handleSubmit` usa variable local (`formWithPublished`) en vez de `setForm` + leer `form` (sin closure stale)
- [ ] Validación de unicidad de `slug` por org funciona en `branchService`
- [ ] Validación de unicidad global de `subdomain` y `custom_domain` funciona
- [ ] `is_web_published=true` requiere `slug` (bloquea submit si falta)
- [ ] `subdomain` o `custom_domain` seteados auto-forzan `is_web_published=true` (vía variable local)
- [ ] Sección "Identidad Web" oculta en flujo signup (`hideStatusSection=true` en `BranchStep.tsx`)
- [ ] Única llamada productiva a `updateBranch` (`BranchesTab.tsx:210`) actualizada para pasar `orgId`
- [ ] `BranchesTab` muestra columna "Sitio Web" con estado publicado/no publicado
- [ ] `BranchesTab` muestra slug y URL pública calculada
- [ ] Toggle `is_web_published` funciona desde la tabla (acción rápida)
- [ ] Botón "Ver sitio" abre la URL pública en pestaña nueva
- [ ] Preview de URL visible dentro del formulario al editar
- [ ] Advertencia visible al cambiar `slug` de un outlet ya publicado
- [ ] `branchService.createBranch` acepta y persiste los nuevos campos
- [ ] `branchService.updateBranch` acepta y persiste los nuevos campos
- [ ] `branchService.validateWebIdentity` ejecuta antes de guardar
- [ ] `npm run lint` limpio
- [ ] `tsc --noEmit` limpio
- [ ] Cero archivos `.sql` en el repo (esquema vía MCP de Supabase)

---

## 10. Riesgos y mitigaciones

### Riesgo 1: Cambiar el slug de un outlet publicado rompe URLs existentes

**Impacto**: alto — bookmarks, enlaces indexados por Google, QR codes impresos,
redes sociales dejan de funcionar.

**Mitigación**:
- Mostrar advertencia amarilla en el `BranchForm` cuando se edita el `slug`
  de un branch que ya tenía uno distinto (sección 4.4).
- Considerar en una fase futura una tabla `branch_slug_redirects` para
  redirecciones 301 automáticas del slug antiguo al nuevo.
- Documentar en el tooltip que el cambio es destructivo para URLs.

### Riesgo 2: Conflicto de subdomain/custom_domain entre organizaciones

**Impacto**: medio — dos outlets de orgs distintas no pueden tener el mismo
subdominio.

**Mitigación**:
- Constraint `UNIQUE` global en la BD (Fase 0).
- Validación en `branchService.validateWebIdentity` antes de guardar.
- El error llega al usuario con el nombre de la sucursal que ya lo usa.

### Riesgo 3: Outlet publicado sin páginas configuradas

**Impacto**: bajo — el sitio responde pero muestra contenido vacío o el
fallback de la org.

**Mitigación**:
- No bloquear la publicación (el outlet puede estar "en construcción").
- En una fase futura, mostrar un indicador "sin páginas" en `BranchesTab`.

### Riesgo 4: `is_web_published` activado sin slug ni subdomain ni custom_domain

**Impacto**: medio — el outlet no es resoluble por ninguna ruta.

**Mitigación**:
- Frontend bloquea el submit si `is_web_published=true` y no hay `slug`.
- El `slug` es el mínimo requerido (resolución por path como fallback).

---

## 11. Archivos modificados (resumen)

| Archivo | Cambio |
|---|---|
| `src/types/branch.ts` | +6 campos en `Branch`, +`BranchType`, +`BRANCH_TYPES` |
| `src/components/branches/BranchForm.tsx` | +sección "Identidad Web", +validaciones, +preview URL |
| `src/components/organization/BranchesTab.tsx` | +columna "Sitio Web", +toggle, +botón "Ver sitio", +`orgSubdomain` |
| `src/lib/services/branchService.ts` | +campos en create/update, +`validateWebIdentity` |

**Sin cambios de esquema en esta fase** — las columnas se añaden en Fase 0
vía MCP de Supabase.
