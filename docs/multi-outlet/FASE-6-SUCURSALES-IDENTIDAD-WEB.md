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
  // Corrección QA Ronda 2: usar BranchType en vez de string para consistencia
  branch_type?: BranchType;
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

> **Corrección QA Ronda 3 (tipado de `branch_type` en estado inicial)**:
> `BranchType` es una unión sin `''`, pero el estado inicial del formulario
> usa `branch_type: initialData.branch_type || ''` (sección 4.1). Para que
> TypeScript no se queje, **sobrescribir** el tipo de `branch_type` en
> `BranchFormData`:
>
> ```typescript
> export interface BranchFormData extends Omit<Branch, 'opening_hours' | 'features'> {
>   // El estado inicial usa '' como valor vacío (option "Sin especificar").
>   // El select debe hacer value={form.branch_type || ''}.
>   // Al guardar, si branch_type === '', tratar como null.
>   branch_type?: BranchType | '';
> }
> ```
>
> **Nota**: El estado inicial usa `''` como valor vacío. El `<select>` debe
> hacer `value={form.branch_type || ''}`. Al guardar (en `handleSubmit` o en
> `branchService`), si `branch_type === ''`, tratar como `null` para no
> persistir un string vacío en la columna `branch_type` (que es nullable).

---

## 4. Cambios en `BranchForm.tsx`

### 4.1 Estado inicial del formulario

En el `useState` del formulario (línea ~79), añadir los campos nuevos:

```typescript
const [form, setForm] = useState<BranchFormData>({
  // ... campos existentes ...
  branch_type: initialData.branch_type || '',
  // Corrección QA Ronda 2: branch_code debe inicializarse explícitamente
  branch_code: initialData.branch_code || '',
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
// Slugs reservados del router público — no pueden usarse como slug de outlet
const RESERVED_SLUGS = [
  'menu', 'categorias', 'productos', 'checkout', 'espacios',
  'servicios', 'contacto', 'nosotros', 'agendar', 'cotizar',
];
// Subdomain: único label DNS (sin puntos), max 63 chars, no empieza/termina en guion
const SUBDOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
// Dominio: labels DNS separados por puntos, cada label minúsculas, no empieza/termina en guion
// Corrección QA: la regex anterior aceptaba mayúsculas y labels que empezaban/terminaban en guion
const DNS_LABEL_REGEX = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
const DOMAIN_REGEX = /^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

function validateSlug(slug: string): string | null {
  if (!slug) return null; // opcional salvo is_web_published
  if (slug.length < 2) return 'El slug debe tener al menos 2 caracteres';
  if (slug.length > 60) return 'El slug no puede exceder 60 caracteres';
  if (!SLUG_REGEX.test(slug)) return 'Solo minúsculas, números y guiones (no consecutivos, ni al inicio/final). Sin espacios.';
  // Corrección QA: validar slugs reservados del router público
  if (RESERVED_SLUGS.includes(slug)) {
    return `El slug "${slug}" está reservado para el router público. Usa otro slug.`;
  }
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
  // Corrección QA: forzar minúsculas antes de validar
  const normalized = domain.toLowerCase().trim();
  if (normalized.length > 253) return `${field} no puede exceder 253 caracteres`;
  // Validar estructura global del dominio
  if (!DOMAIN_REGEX.test(normalized)) {
    return `${field} no es un dominio válido (solo minúsculas, sin guiones al inicio/final de cada label)`;
  }
  // Corrección QA Ronda 2: validar cada label DNS individualmente con DNS_LABEL_REGEX
  // (antes la regex DNS_LABEL_REGEX estaba declarada pero sin usar)
  const labelsValid = normalized.split('.').every(label => DNS_LABEL_REGEX.test(label));
  if (!labelsValid) {
    return `${field} tiene un label inválido (cada label: minúsculas, 1-63 chars, sin guion al inicio/final)`;
  }
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

> **Corrección QA Ronda 2 (normalización en onChange)**: `subdomain` y
> `custom_domain` deben normalizarse a minúsculas y sin espacios al ingresar,
> igual que `slug`. En vez de usar `handleChange` genérico para estos dos
> campos, definir un handler específico dentro del componente:

```typescript
// Dentro del componente BranchForm
const handleDomainChange = (field: 'subdomain' | 'custom_domain', value: string) => {
  // Corrección QA R7: normalizar a minúsculas, trim y eliminar espacios internos
  const normalized = value.toLowerCase().trim().replace(/\s+/g, '');
  setForm(prev => ({ ...prev, [field]: normalized }));
};
```

> **Corrección QA Ronda 3 (espacios internos en `handleDomainChange`)**:
> `handleDomainChange` solo hace `toLowerCase().trim()`, lo que elimina
> espacios al inicio/final pero **no** los espacios internos. Si el usuario
> pega `"mi hotel.com"` (con espacio interno), la validación de formato
> (`validateDomain` / `validateSubdomain`) lo rechazará en submit, pero el
> valor quedará visible en el input con el espacio hasta que el usuario lo
> corrija manualmente.
>
> **Recomendación obligatoria**: aplicar `.replace(/\s+/g, '')` en
> `handleDomainChange` para eliminar espacios internos. No es opcional:
>
> ```typescript
> const normalized = value.toLowerCase().trim().replace(/\s+/g, '');
> ```

### 4.3 Validación antes de submit

Dentro de `handleSubmit`, antes de llamar `onSubmit`.

> **Corrección QA (closure stale)**: NO usar `setForm(prev => ({ ...prev,
> is_web_published: true }))` y luego leer `form` — ese `setForm` es asíncrono
> y `form` en el resto del handler sigue siendo el valor anterior (stale
> closure). En su lugar, construir una **variable local** con el valor
> corregido y usarla tanto para `onSubmit` como para el JSON.

```typescript
// Corrección QA Ronda 2: e es opcional porque submitForm() invoca sin evento
const handleSubmit = async (e?: React.FormEvent) => {
  e?.preventDefault();
  setError(null);

  // --- Construir formWithPublished PRIMERO (auto-publish por subdomain/custom_domain) ---
  // Corrección QA Ronda 2: si el usuario ingresa subdomain/custom_domain sin
  // marcar el toggle, formWithPublished fuerza is_web_published=true. La
  // validación de slug obligatorio debe hacerse sobre formWithPublished, no
  // sobre form, para que el auto-publish también exija slug.
  const formWithPublished = {
    ...form,
    is_web_published: form.is_web_published || !!(form.subdomain || form.custom_domain),
  };

  // Validar branch_type obligatorio al publicar
  if (formWithPublished.is_web_published && !formWithPublished.branch_type) {
    setError('El tipo de negocio (branch_type) es obligatorio para publicar el outlet en la web')
    return
  }

  // Validar slug obligatorio al publicar
  if (formWithPublished.is_web_published && !formWithPublished.slug) {
    setError('El slug es obligatorio para publicar el outlet en la web')
    return
  }

  // --- Validaciones identidad web ---
  const slugError = validateSlug(formWithPublished.slug);
  if (slugError) { setError(slugError); return; }

  const subdomainError = validateSubdomain(formWithPublished.subdomain);
  if (subdomainError) { setError(subdomainError); return; }

  const customDomainError = validateDomain(formWithPublished.custom_domain, 'El dominio personalizado');
  if (customDomainError) { setError(customDomainError); return; }

  // Validar URLs de logo y cover (no fiarse solo del type="url" del input)
  const logoUrlError = validateUrl(formWithPublished.website_logo_url, 'La URL del logo');
  if (logoUrlError) { setError(logoUrlError); return; }

  const coverUrlError = validateUrl(formWithPublished.website_cover_url, 'La URL de portada');
  if (coverUrlError) { setError(coverUrlError); return; }

  // Corrección QA R9: la validación de slug obligatorio al publicar ya se hizo
  // arriba (antes de las validaciones de formato). No duplicar — el segundo
  // bloque era código muerto con mensaje distinto.

  // Corrección QA R9: normalizar branch_type vacío a null antes de construir el payload
  const normalizedBranchType = formWithPublished.branch_type || null;

  try {
    const formWithJson = {
      ...formWithPublished,
      branch_type: normalizedBranchType, // Corrección QA R9: '' → null
      opening_hours: JSON.stringify(openingHoursObj),
      features: JSON.stringify(featuresObj),
    };
    await onSubmit(formWithJson);
  } catch (err: any) {
    setError(err.message || 'Error al guardar la sucursal');
  }
};
```

> **Corrección QA (dual submit path)**: `BranchForm` expone `submitForm` vía
> `ref` (con `useImperativeHandle`). En el flujo de signup, `BranchStep.tsx`
> invoca `formRef.current.submitForm()`. Si `submitForm` llama `onSubmit`
> directamente, **se saltan todas las validaciones** de `handleSubmit`.
>
> **Solución**: `submitForm` debe llamar `handleSubmit` internamente (que
> ejecuta las validaciones antes de invocar `onSubmit`), no `onSubmit` directo:

```typescript
// Corrección QA Ronda 2: handleSubmit acepta evento opcional, por lo que
// submitForm puede invocarlo sin argumento sin que preventDefault() crashee.
const submitForm = () => {
  handleSubmit(); // sin evento, preventDefault es opcional (e?.preventDefault())
};
```

> Alternativamente, extraer las validaciones de identidad web a una función
> separada (`validateWebIdentity`) que ambos caminos (`handleSubmit` y
> `submitForm`) invoquen antes de llamar `onSubmit`. Lo importante es que
> **ningún camino de submit puede saltarse las validaciones**.

### 4.4 Sección "Identidad Web" en el JSX

Insertar **antes del cierre** del `<div className="p-4 sm:p-6 space-y-8">`
(línea ~511), es decir, como último hijo de ese container — **no después**
del cierre del div.

> **Corrección QA (container nesting)**: La sección "Identidad Web" debe
> insertarse **DENTRO** del `<div className="p-4 sm:p-6 space-y-8">`, antes
> de su cierre (línea 511), no después. Si se inserta después del cierre,
> queda fuera del container de padding y se rompe el layout. Verificar la
> estructura de divs anidados antes de implementar — el cierre del
> `space-y-8` es seguido por el cierre del `<form>` y luego del wrapper
> del modal/panel.

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
          // Corrección QA R10: comprimir guiones consecutivos y limpiar
          // guiones al inicio/final para cumplir SLUG_REGEX.
          const normalized = e.target.value
            .toLowerCase()
            .trim()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, '')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
          setForm(prev => ({ ...prev, slug: normalized }));
        }}
        placeholder="hotel, restaurante-1"
        className="input input-bordered w-full bg-gray-50 dark:bg-gray-700 dark:text-gray-100"
      />
      <p className="text-xs text-gray-400 mt-1">
        Solo minúsculas, números y guiones. Único por organización.
      </p>
      {/* Warning: slug reservado del router público */}
      {form.slug && RESERVED_SLUGS.includes(form.slug) && (
        <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-200">
          ⚠️ El slug "{form.slug}" está reservado para el router público
          (menu, categorias, productos, checkout, etc.). Si lo usas, el
          outlet no será accesible por path.
        </div>
      )}
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
          onChange={(e) => handleDomainChange('subdomain', e.target.value)}
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
        onChange={(e) => handleDomainChange('custom_domain', e.target.value)}
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
        {/* Corrección QA: preferir custom_domain de la org si existe */}
        {/* Corrección QA R10: guarda — si no hay subdomain ni custom_domain
            (ni de la branch ni de la org), no hay URL pública hasta
            configurar dominio o subdominio de la organización. */}
        {form.custom_domain
          ? `https://${form.custom_domain}`
          : form.subdomain
            ? `https://${form.subdomain}.goadmin.io`
            : form.slug
              ? (orgCustomDomain
                  ? `https://${orgCustomDomain}/${form.slug}`
                  : orgSubdomain
                    ? `https://${orgSubdomain}.goadmin.io/${form.slug}`
                    : 'Configura un dominio o subdominio de organización para tener URL pública')
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

### 4.6 Estado `orgCustomDomain` y `orgSubdomain` para preview de URL

> **Corrección QA**: El preview de URL por path debe preferir `custom_domain`
> de la organización si existe, en vez de usar siempre el subdominio. Añadir
> ambos al estado del `BranchForm`:

```typescript
const [orgSubdomain, setOrgSubdomain] = useState<string>('');
const [orgCustomDomain, setOrgCustomDomain] = useState<string>('');
```

Y en el `useEffect` que carga `initialData`, consultar ambos campos de la org:

```typescript
useEffect(() => {
  if (initialData.organization_id) {
    supabase
      .from('organizations')
      .select('subdomain, custom_domain')
      .eq('id', initialData.organization_id)
      .single()
      .then(({ data }) => {
        if (data?.subdomain) setOrgSubdomain(data.subdomain);
        if (data?.custom_domain) setOrgCustomDomain(data.custom_domain);
      });
  }
}, [initialData.organization_id]);
```

El preview de URL (sección 4.4) usa entonces:

```typescript
// Corrección QA R10: si la org no tiene custom_domain ni subdomain, no hay
// URL pública por path hasta configurarlos. Devolver null y mostrar mensaje.
const publicUrl = orgCustomDomain
  ? `https://${orgCustomDomain}/${slug}`
  : orgSubdomain
    ? `https://${orgSubdomain}.goadmin.io/${slug}`
    : null; // sin URL pública hasta configurar dominio/subdominio de la org
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
          {/* Corrección QA R10: guarda — si no hay subdomain ni custom_domain
              (ni de la branch ni de la org), mostrar mensaje en vez de URL
              inválida. */}
          {branch.custom_domain
            ? `https://${branch.custom_domain}`
            : branch.subdomain
              ? `https://${branch.subdomain}.goadmin.io`
              : branch.slug
                ? (orgCustomDomain
                    ? `https://${orgCustomDomain}/${branch.slug}`
                    : orgSubdomain
                      ? `https://${orgSubdomain}.goadmin.io/${branch.slug}`
                      : 'Configura un dominio o subdominio de organización')
                : 'Sin URL'}
        </div>
        {/* Botón Ver sitio */}
        {/* Corrección QA R10: solo mostrar el botón si hay URL pública real
            (no si falta dominio/subdominio de la org para resolución por path). */}
        {(branch.custom_domain || branch.subdomain || (branch.slug && (orgCustomDomain || orgSubdomain))) && (
          <a
            href={
              branch.custom_domain
                ? `https://${branch.custom_domain}`
                : branch.subdomain
                  ? `https://${branch.subdomain}.goadmin.io`
                  : orgCustomDomain
                    ? `https://${orgCustomDomain}/${branch.slug}`
                    : orgSubdomain
                      ? `https://${orgSubdomain}.goadmin.io/${branch.slug}`
                      : '#' // sin URL pública hasta configurar dominio/subdominio de la org
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

> **Corrección QA R8**: el toggle de publicación del tab debe usar
> `branchService.setWebPublished` (definido en F4 §2.7), no
> `updateBranch`. `setWebPublished` valida que `branch_type` esté definido
> antes de publicar. Si se llama `updateBranch` directamente, se salta esta
> validación y permite publicar un outlet sin `branch_type`, violando la
> regla de F4.
>
> **Corrección QA R9**: `setWebPublished` (F4 §2.7) valida tanto
> `branch_type` como `slug` antes de activar `is_web_published=true`. Si el
> branch no tiene slug, la publicación falla con error.

```typescript
const handleToggleWebPublished = async (branch: Branch) => {
  setFormLoading(true);
  setError(null);
  try {
    // Usar setWebPublished (F4 §2.7) que valida branch_type antes de publicar
    await branchService.setWebPublished(branch.id!, !branch.is_web_published, orgId)
    // Recargar lista
    await loadBranches()
  } catch (err: any) {
    setError(err.message || 'Error al cambiar publicación')
  } finally {
    setFormLoading(false);
  }
};
```

### 5.3 Variables `orgSubdomain` y `orgCustomDomain`

Para construir la URL de preview por path se necesita el subdominio y el
dominio personalizado de la organización. Añadir al estado del componente:

```typescript
const [orgSubdomain, setOrgSubdomain] = useState<string>('');
const [orgCustomDomain, setOrgCustomDomain] = useState<string>('');
```

Y en el `useEffect` inicial, consultar ambos campos de la org:

```typescript
useEffect(() => {
  if (orgId) {
    fetchBranches();
    fetchBranchLimit();
    // Fetch org subdomain + custom_domain for URL preview
    supabase
      .from('organizations')
      .select('subdomain, custom_domain')
      .eq('id', orgId)
      .single()
      .then(({ data }) => {
        if (data?.subdomain) setOrgSubdomain(data.subdomain);
        if (data?.custom_domain) setOrgCustomDomain(data.custom_domain);
      });
  }
}, [orgId]);
```

> **Nota**: asume que `organizations` tiene columnas `subdomain` y
> `custom_domain`. Si no existen aún, el preview por path usará un
> placeholder hasta que se implemente.

---

## 6. Cambios en `branchService.ts`

> **Corrección QA R10**: añadir al inicio del archivo el import de
> `validateWebIdentityFormat` (función síncrona exportada desde
> `src/lib/utils/webIdentityValidation.ts`):
>
> ```typescript
> import { validateWebIdentityFormat } from '@/lib/utils/webIdentityValidation';
> ```

### 6.1 `createBranch` — aceptar nuevos campos

En el objeto `formattedBranch` (línea ~161), añadir:

```typescript
const formattedBranch = {
  // ... campos existentes ...
  is_web_stock_source: branch.is_web_stock_source ?? false,
  // Corrección QA R9: normalizar branch_type '' a null
  branch_type: branch.branch_type || null,
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
// Corrección QA R9: normalizar branch_type '' a null
if (branch.branch_type !== undefined) formattedBranch.branch_type = branch.branch_type || null;
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
    if (typeof excludeBranchId === 'number') query = query.neq('id', excludeBranchId);
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
    if (typeof excludeBranchId === 'number') query = query.neq('id', excludeBranchId);
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
    if (typeof excludeBranchId === 'number') query = query.neq('id', excludeBranchId);
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
// Corrección QA R10: validateWebIdentityFormat es una función síncrona
// exportada (no un método async del service). Sin await y sin this.
const formatErrors = validateWebIdentityFormat({ slug: branch.slug, subdomain: branch.subdomain, custom_domain: branch.custom_domain });
if (formatErrors.length > 0) {
  throw new Error(formatErrors.join(', '));
}
```

> **Corrección QA Ronda 2 (formato)**: `validateWebIdentity` valida
> **unicidad** de slug/subdomain/custom_domain, pero **no** valida formato.
> La validación de formato se hace en el frontend con `validateSlug`,
> `validateSubdomain`, `validateDomain` (sección 4.2). Para evitar que un
> bypass directo al service guarde datos mal formateados, considerar añadir
> validación de formato también dentro de `validateWebIdentity` (o en un
> helper `validateWebIdentityFormat` previo) como defensa en profundidad.

> **Corrección QA Ronda 3 (defensa en profundidad — formato + unicidad)**:
> Añadir un helper `validateWebIdentityFormat` que valide **formato** además
> de unicidad. `validateWebIdentity` (unicidad) y `validateWebIdentityFormat`
> (formato) deben llamarse **juntos** antes de guardar, para defensa en
> profundidad: el frontend valida formato en onChange/submit, pero el service
> no debe confiar en el frontend — un bypass directo al service (p.ej. desde
> otro consumidor o un script) podría enviar datos mal formateados que pasen
> la validación de unicidad pero rompan la resolución de URL en
> `goadmin-websites`.
>
> ```typescript
> /**
>  * Valida FORMATO de slug, subdomain y custom_domain.
>  * A diferencia de validateWebIdentity (que valida unicidad contra la BD),
>  * este helper solo verifica que los valores cumplan las regex de formato.
>  * Debe llamarse junto con validateWebIdentity para defensa en profundidad.
>  */
> export function validateWebIdentityFormat(data: {
>   slug?: string | null;
>   subdomain?: string | null;
>   custom_domain?: string | null;
> }): string[] {
>   const errors: string[] = [];
>
>   if (data.slug) {
>     const err = validateSlug(data.slug);
>     if (err) errors.push(`slug: ${err}`);
>   }
>   if (data.subdomain) {
>     const err = validateSubdomain(data.subdomain);
>     if (err) errors.push(`subdomain: ${err}`);
>   }
>   if (data.custom_domain) {
>     const err = validateDomain(data.custom_domain, 'custom_domain');
>     if (err) errors.push(err); // Corrección QA R9: validateDomain ya incluye el nombre del campo en el mensaje
>   }
>
>   return errors;
> }
> ```
>
> **Corrección QA R7 (lógica invertida)**: el snippet anterior usaba
> `if (data.slug && !validateSlug(data.slug))`, pero `validateSlug` retorna
> `string | null` (el mensaje de error si inválido, `null` si válido).
> `!validateSlug()` es `true` cuando el resultado es `null` (válido) →
> rechazaba los slugs **válidos** en vez de los inválidos. La versión
> corregida usa `const err = validateSlug(...)` y `if (err)` para detectar
> correctamente los inválidos.
>
> **Nota**: `validateSlug`/`validateSubdomain`/`validateDomain` retornan
> `string` (mensaje de error) si inválido, `null` si válido. Por eso se usa
> `if (err)` no `if (!validateX())`.
>
> **Uso recomendado** dentro de `createBranch` y `updateBranch`, antes del
> `insert`/`update`:
>
> ```typescript
> // 1. Validar formato (defensa en profundidad — no confiar solo en el frontend)
> const formatErrors = validateWebIdentityFormat(branch);
> if (formatErrors.length > 0) {
>   throw new Error(`Formato inválido: ${formatErrors.join(', ')}`);
> }
> // 2. Validar unicidad contra la BD
> await this.validateWebIdentity(branch, organizationId, excludeBranchId);
> ```
>
> **Decisión F6**: extraer `validateSlug`, `validateSubdomain`, `validateDomain`
> a `src/lib/utils/webIdentityValidation.ts`. Importar desde `BranchForm.tsx`
> (frontend) y `branchService.ts` (backend). Ambas capas validan formato; el
> service también valida unicidad.
>
> **Integración**: `validateWebIdentityFormat` se llama **dentro del service**
> (`createBranch`/`updateBranch`) como defensa en profundidad, además de en el
> frontend. Ambas capas validan formato; el service también valida unicidad via
> `validateWebIdentity`. Así, un bypass directo al service (script, otro
> consumidor) no puede guardar datos mal formateados que rompan la resolución de
> URL en `goadmin-websites`.

Y dentro de `updateBranch` antes del `update`:

```typescript
await this.validateWebIdentity(
  { slug: branch.slug, subdomain: branch.subdomain, custom_domain: branch.custom_domain },
  /* organizationId se obtiene del branch existente o se pasa como param */,
  branchId
);
// Corrección QA R10: validateWebIdentityFormat es síncrona y exportada, no
// un método async del service. Sin await y sin this.
const formatErrors = validateWebIdentityFormat({ slug: branch.slug, subdomain: branch.subdomain, custom_domain: branch.custom_domain });
if (formatErrors.length > 0) {
  throw new Error(formatErrors.join(', '));
}
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
    // Corrección QA R10: usar variable local para el mensaje base, reutilizarla
    // en el enriquecimiento con URL pública (antes hardcodeaba t('branchUpdated')
    // incluso en creación).
    let message: string;
    if (editingBranch) {
      savedBranch = await branchService.updateBranch(editingBranch.id!, formData, orgId);
      message = t('branchUpdated');
    } else {
      savedBranch = await branchService.createBranch({ ...formData, organization_id: orgId });
      message = t('branchCreated');
    }
    setSuccessMessage(message);

    // Si quedó publicado, mostrar URL
    if (savedBranch.is_web_published) {
      // Corrección QA: preferir custom_domain de la org si existe
      // Corrección QA R10: guarda — si no hay subdomain ni custom_domain (ni
      // de la branch ni de la org), no hay URL pública hasta configurar dominio
      // o subdominio de la organización.
      const publicUrl = savedBranch.custom_domain
        ? `https://${savedBranch.custom_domain}`
        : savedBranch.subdomain
          ? `https://${savedBranch.subdomain}.goadmin.io`
          : savedBranch.slug
            ? (orgCustomDomain
                ? `https://${orgCustomDomain}/${savedBranch.slug}`
                : orgSubdomain
                  ? `https://${orgSubdomain}.goadmin.io/${savedBranch.slug}`
                  : null) // sin URL pública hasta configurar dominio/subdominio de la org
            : null;
      if (publicUrl) {
        setSuccessMessage(`${message} — URL pública: ${publicUrl}`);
      } else if (savedBranch.slug) {
        setSuccessMessage(`${message} — Configura un dominio o subdominio de organización para tener URL pública.`);
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
| `slug` | Solo `[a-z0-9-]`, min 2, max 60. Sin espacios. Sin guiones consecutivos, ni al inicio/final. | Frontend (onChange + submit) |
| `slug` | Único por `organization_id` | `branchService.validateWebIdentity` |
| `subdomain` | Único label DNS (sin puntos), max 63 chars. Regex `^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$`. Único global. | Frontend (`validateSubdomain`) + service |
| `custom_domain` | Formato de dominio válido (solo minúsculas, sin guiones al inicio/final de cada label). Regex `^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$`. Único global. | Frontend (`validateDomain`) + service |
| `website_logo_url` | URL válida `http(s)://` (no solo `type="url"` del input) | Frontend (`validateUrl` en submit) |
| `website_cover_url` | URL válida `http(s)://` (no solo `type="url"` del input) | Frontend (`validateUrl` en submit) |
| `is_web_published=true` | `slug` obligatorio | Frontend (submit) |
| `slug` | No debe ser un slug reservado del router público (`menu`, `categorias`, `productos`, `checkout`, `espacios`, `servicios`, `contacto`, `nosotros`, `agendar`, `cotizar`) | Frontend (`validateSlug` + warning en UI) |
| `subdomain` o `custom_domain` seteados | `is_web_published` debe ser `true` | Frontend (auto-forzar vía variable local, no `setForm`) |
| `branch_type` | Enum: hotel, restaurant, retail, gym, transport, parking, services | Frontend (select) |

---

## 9. Plan de pruebas

> **Corrección QA Ronda 2**: añadir plan de pruebas explícito para validar
> las correcciones de esta ronda y el comportamiento general de la identidad
> web en `BranchForm` / `branchService`.

### Casos de prueba

| # | Escenario | Pasos | Resultado esperado |
|---|---|---|---|
| 1 | Crear branch con slug válido | Llenar nombre + slug `hotel-central` → submit | Branch creada, sin error. Slug persiste en BD. |
| 2 | Crear branch con slug duplicado | Crear branch A con slug `hotel`. Crear branch B en la misma org con slug `hotel` → submit | Error: "El slug 'hotel' ya lo usa otra sucursal de esta organización". |
| 3 | Crear branch con slug reservado | Llenar slug `menu` (reservado del router público) → submit | Error de `validateSlug`: "El slug 'menu' está reservado para el router público". Warning visible en UI. |
| 4 | Subdomain con mayúsculas se normaliza | Escribir `HoTeL` en campo subdomain | `handleDomainChange` normaliza a `hotel` (minúsculas, trim). Valor guardado en BD es `hotel`. |
| 5 | Custom_domain inválido | Llenar custom_domain `-invalid..com` → submit | Error de `validateDomain`: dominio inválido (label con guion al inicio / label vacío). |
| 6 | Publicar branch sin slug | Marcar toggle `is_web_published` sin llenar slug → submit | Error: "El slug es obligatorio para publicar el outlet en la web". |
| 7 | Publicar branch con subdomain pero sin slug | Llenar subdomain `hotel` sin marcar toggle y sin slug → submit | Error: auto-publish fuerza `is_web_published=true` y exige slug. Mensaje: "El slug es obligatorio para publicar el outlet en la web". |
| 8 | Signup flow: submitForm() sin evento | En `BranchStep.tsx`, invocar `formRef.current.submitForm()` | `handleSubmit()` se ejecuta con `e=undefined`; `e?.preventDefault()` NO crashea. Validaciones se ejecutan normalmente. |
| 9 | Editar slug de outlet publicado | Editar branch con slug existente, cambiarlo → guardar | Warning visible en UI sobre URLs rotas. Guarda correctamente si el nuevo slug pasa validaciones. |
| 10 | Toggle rápido desde la tabla (sin branch_type) | En `BranchesTab`, click "Publicar" en branch sin `branch_type` | `setWebPublished` (F4 §2.7) rechaza con error de validación de `branch_type`. El toggle usa `setWebPublished`, no `updateBranch`. |
| 11 | Subdomain duplicado global | Crear branch con subdomain usado por otra org → submit | Error: "El subdominio 'X' ya está en uso por otra sucursal". |
| 12 | Custom_domain duplicado global | Crear branch con custom_domain usado por otra org → submit | Error: "El dominio 'X' ya está en uso por otra sucursal". |
| 13 | validateWebIdentityFormat llamado desde service | Crear branch con slug inválido (ej. 'slug con espacios') vía service directo (sin frontend) | Service rechaza con error de formato, sin llegar a la BD. |
| 14 | Publicar sin branch_type desde el formulario | Marcar toggle `is_web_published` sin seleccionar `branch_type` → submit | Error: "El tipo de negocio (branch_type) es obligatorio para publicar el outlet en la web". |
| 15 | validateDomain con nombre de campo | Crear branch con custom_domain inválido vía service directo | Error de `validateDomain` incluye el nombre del campo `custom_domain` (no "undefined"). |
| 16 | Slug con guiones consecutivos se comprime | Escribir `hotel--central` en campo slug | `onChange` normaliza a `hotel-central` (guiones consecutivos comprimidos, sin guion al inicio/final). |
| 17 | Preview URL sin dominio de org | Branch publicada con slug pero org sin `subdomain` ni `custom_domain` | Preview muestra "Configura un dominio o subdominio de organización" en vez de URL inválida (`https://.goadmin.io/slug`). Botón "Ver sitio" no se renderiza. |
| 18 | Toast de creación usa mensaje correcto | Crear branch nueva (no editar) que queda publicada con URL | Toast muestra `t('branchCreated')` (no `t('branchUpdated')`) + URL pública. |
| 19 | validateWebIdentityFormat síncrono desde service | Llamar `createBranch` con slug inválido | `validateWebIdentityFormat` (función exportada, sin `this.` ni `await`) rechaza con error de formato antes del insert. |

### Notas de ejecución

- Los casos 1-8 cubren las correcciones de QA Ronda 2 (especialmente #7
  auto-publish y #8 `submitForm` sin evento).
- Los casos 2, 11, 12 dependen de `branchService.validateWebIdentity`
  (sección 6.3) — requieren datos preexistentes en BD.
- El caso 8 es específico del flujo signup (`BranchStep.tsx`), donde la
  sección "Identidad Web" está oculta (`hideStatusSection=true`) pero
  `submitForm` debe seguir funcionando sin crashear.

---

## 10. Definition of Done

- [x] `Branch` interface tiene los 6 campos nuevos (`slug`, `subdomain`, `custom_domain`, `website_logo_url`, `website_cover_url`, `is_web_published`)
- [x] `src/types/branch.ts` actualizado con los 6 campos nuevos (ver snippet en sección 3)
- [x] `BranchForm` tiene sección "Identidad Web" con todos los campos
- [x] `branch_type` tiene `<select>` en el UI con los 7 valores (no solo en BD)
- [x] Validación de formato de `slug` (regex) funciona en tiempo real
- [x] Validación de slugs reservados del router público (`menu`, `categorias`, `productos`, `checkout`, `espacios`, `servicios`, `contacto`, `nosotros`, `agendar`, `cotizar`) bloquea el submit y muestra warning
- [x] Validación de `subdomain` como label DNS único (sin puntos, max 63, regex `^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$`) funciona en submit
- [x] Validación de formato de `custom_domain` funciona en submit (regex corregida: solo minúsculas, sin guiones al inicio/final de cada label)
- [x] Validación de `website_logo_url` y `website_cover_url` como URLs `http(s)://` válidas en submit (no solo `type="url"`)
- [x] `handleSubmit` usa variable local (`formWithPublished`) en vez de `setForm` + leer `form` (sin closure stale)
- [x] `submitForm` (expuesto vía ref) llama `handleSubmit` internamente, no `onSubmit` directo — ambos caminos ejecutan validaciones
- [x] **QA Ronda 2**: `handleSubmit` acepta `e?: React.FormEvent` y usa `e?.preventDefault()` — `submitForm()` no crashea sin evento
- [x] **QA Ronda 2**: `formWithPublished` se construye **antes** de las validaciones; la validación de slug obligatorio se hace sobre `formWithPublished` (auto-publish por subdomain/custom_domain exige slug)
- [x] **QA Ronda 2**: `DNS_LABEL_REGEX` integrada en `validateDomain` (valida cada label DNS individualmente)
- [x] **QA Ronda 2**: `handleDomainChange` normaliza `subdomain` y `custom_domain` a minúsculas + trim en onChange
- [x] **QA Ronda 2**: `branch_code: ''` inicializado explícitamente en `useState` del formulario
- [x] **QA Ronda 2**: `branch_type?: BranchType` (no `string`) en la interfaz `Branch`
- [x] **QA Ronda 2**: Nota sobre `validateWebIdentity` (valida unicidad, no formato) documentada
- [x] **QA Ronda 2**: Plan de pruebas (sección 9) ejecutado: 12 casos pasan
- [x] **QA Ronda 3**: `BranchFormData` sobrescribe `branch_type?: BranchType | ''` (estado inicial usa `''`, al guardar tratar como `null`)
- [x] **QA Ronda 3**: Preview de URL por path en `BranchesTab.tsx` usa template literal `/${branch.slug}` (no string literal `/{branch.slug}`)
- [x] **QA Ronda 3**: `handleDomainChange` aplica `.replace(/\s+/g, '')` para eliminar espacios internos (recomendación obligatoria, no opcional — ver §4.2)
- [x] **QA Ronda 3**: Helper `validateWebIdentityFormat` (formato) implementado y llamado junto con `validateWebIdentity` (unicidad) para defensa en profundidad
- [x] Sección "Identidad Web" insertada DENTRO del `<div className="p-4 sm:p-6 space-y-8">` antes de su cierre (no después)
- [x] Validación de unicidad de `slug` por org funciona en `branchService`
- [x] Validación de unicidad global de `subdomain` y `custom_domain` funciona
- [x] `is_web_published=true` requiere `slug` (bloquea submit si falta)
- [x] `subdomain` o `custom_domain` seteados auto-forzan `is_web_published=true` (vía variable local)
- [x] Sección "Identidad Web" oculta en flujo signup (`hideStatusSection=true` en `BranchStep.tsx`)
- [x] Única llamada productiva a `updateBranch` (`BranchesTab.tsx:210`) actualizada para pasar `orgId`
- [x] `BranchesTab` muestra columna "Sitio Web" con estado publicado/no publicado y preview de URL
- [x] `BranchesTab` muestra slug y URL pública calculada (preferir `custom_domain` de la org sobre `subdomain`)
- [x] Toggle `is_web_published` funciona desde la tabla (acción rápida)
- [x] Botón "Ver sitio" abre la URL pública en pestaña nueva
- [x] Preview de URL visible dentro del formulario al editar (preferir `custom_domain` de la org si existe)
- [x] Advertencia visible al cambiar `slug` de un outlet ya publicado
- [x] `branchService.createBranch` incluye los 6 campos nuevos en el insert (ver snippet en sección 6.1)
- [x] `branchService.updateBranch` incluye los 6 campos nuevos en el update (ver snippet en sección 6.2)
- [x] `branchService.validateWebIdentity` ejecuta antes de guardar
- [x] **QA R8**: `handleSubmit` valida `branch_type` obligatorio cuando `is_web_published === true` (F4 exige branch_type para publicar)
- [x] **QA R8**: `handleSubmit` valida `slug` obligatorio cuando `is_web_published === true` (mensaje consistente con F4)
- [x] **QA R8**: `BranchesTab.handleToggleWebPublished` usa `branchService.setWebPublished` (F4 §2.7), no `updateBranch` — no se salta la validación de `branch_type`
- [x] **QA R8**: `validateWebIdentityFormat` llama `validateDomain(data.custom_domain, 'custom_domain')` con el argumento `field` — los mensajes de error no contienen "undefined"
- [x] **QA R9**: `handleSubmit` tiene una sola validación de slug obligatorio al publicar (sin duplicar — el segundo bloque era código muerto)
- [x] **QA R9**: `handleSubmit` normaliza `branch_type` vacío (`''`) a `null` antes de construir el payload (`normalizedBranchType`)
- [x] **QA R9**: `createBranch` y `updateBranch` incluyen `branch_type` en `formattedBranch` normalizado a `null` si es `''`
- [x] **QA R9**: `handleToggleWebPublished` documenta que `setWebPublished` (F4 §2.7) valida tanto `branch_type` como `slug` antes de publicar
- [x] **QA R9**: `validateWebIdentityFormat` no duplica el prefijo `custom_domain:` en el mensaje de error (validateDomain ya lo incluye)
- [x] **QA R10**: `handleFormSubmit` usa variable local `message` para el toast de éxito y la reutiliza al enriquecer con URL pública (no hardcodea `t('branchUpdated')` en creación)
- [x] **QA R10**: `validateWebIdentityFormat` se invoca como función síncrona exportada (sin `await`, sin `this.`) en `createBranch` y `updateBranch`; import añadido al inicio de `branchService.ts`
- [x] **QA R10**: `onChange` de slug comprime guiones consecutivos (`.replace(/-+/g, '-')`) y limpia guiones al inicio/final (`.replace(/^-|-$/g, '')`)
- [x] **QA R10**: Preview de URL pública (§4.4 y §5.1) tiene guarda cuando la org no tiene `subdomain` ni `custom_domain` — muestra mensaje "Configura un dominio o subdominio de organización" en vez de URL inválida
- [x] **QA R10**: Mensaje de `validateSlug` precisa "no consecutivos, ni al inicio/final" para reflejar las reglas de `SLUG_REGEX`
- [ ] `npm run lint` limpio
- [ ] `tsc --noEmit` limpio
- [x] Cero archivos `.sql` en el repo (esquema vía MCP de Supabase)

---

## 11. Riesgos y mitigaciones

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

## 12. Archivos modificados (resumen)

| Archivo | Cambio |
|---|---|
| `src/types/branch.ts` | +6 campos en `Branch`, +`BranchType`, +`BRANCH_TYPES` |
| `src/components/branches/BranchForm.tsx` | +sección "Identidad Web", +validaciones, +preview URL |
| `src/components/organization/BranchesTab.tsx` | +columna "Sitio Web", +toggle, +botón "Ver sitio", +`orgSubdomain` |
| `src/lib/services/branchService.ts` | +campos en create/update, +`validateWebIdentity` |

**Sin cambios de esquema en esta fase** — las columnas se añaden en Fase 0
vía MCP de Supabase.
