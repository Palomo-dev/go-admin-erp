# Plan de Implementación i18n con `next-intl`

## Resumen

Internacionalización completa de GO Admin ERP usando `next-intl`.  
El idioma se determina por la preferencia del usuario almacenada en `profiles.preferred_language` (default: `'es'`).

**Idiomas soportados:** Español (es), English (en), Português (pt), Français (fr)

---

## 1. Arquitectura General

```
go-admin-erp/
├── messages/                    ← Archivos de traducción
│   ├── es.json                  ← Español (idioma base/default)
│   ├── en.json                  ← English
│   ├── pt.json                  ← Português
│   └── fr.json                  ← Français
├── src/
│   ├── i18n/
│   │   ├── config.ts            ← Locales disponibles, locale default
│   │   ├── request.ts           ← getRequestConfig para server components
│   │   └── provider.tsx         ← Client provider que lee idioma del perfil
│   ├── app/
│   │   └── layout.tsx           ← Integración del NextIntlClientProvider
│   └── ...
```

### Decisión clave: Sin rutas por idioma

No usamos `/es/...`, `/en/...`. El idioma se lee del perfil del usuario (DB) y se aplica vía React Context.  
Esto evita cambios en el routing existente.

---

## 2. Esquema de Base de Datos (ya existe)

```sql
-- Tabla: profiles
-- Columna: preferred_language (text, default 'es')
-- Valores válidos: 'es', 'en', 'pt', 'fr'
```

No se requieren migraciones.

---

## 3. Estructura de Archivos de Traducción

Cada archivo JSON se organiza por **namespace** (módulo). Ejemplo de `messages/es.json`:

```json
{
  "common": {
    "save": "Guardar",
    "cancel": "Cancelar",
    "delete": "Eliminar",
    "edit": "Editar",
    "create": "Crear",
    "search": "Buscar",
    "loading": "Cargando...",
    "error": "Error",
    "success": "Éxito",
    "confirm": "Confirmar",
    "back": "Volver",
    "next": "Siguiente",
    "yes": "Sí",
    "no": "No",
    "or": "O",
    "close": "Cerrar"
  },
  "auth": {
    "login": {
      "title": "Iniciar Sesión",
      "email": "Correo electrónico",
      "password": "Contraseña",
      "submit": "Iniciar Sesión",
      "forgotPassword": "¿Olvidaste tu contraseña?",
      "noAccount": "¿No tienes cuenta?",
      "signUp": "Regístrate",
      "googleLogin": "Continuar con Google",
      "invalidCredentials": "Credenciales inválidas"
    },
    "signup": {
      "title": "Crear Cuenta",
      "firstName": "Nombre",
      "lastName": "Apellido",
      "email": "Correo electrónico",
      "password": "Contraseña",
      "confirmPassword": "Confirmar contraseña",
      "phone": "Teléfono",
      "preferredLanguage": "Idioma preferido",
      "submit": "Crear cuenta",
      "hasAccount": "¿Ya tienes cuenta?",
      "login": "Iniciar sesión"
    },
    "selectOrganization": {
      "title": "Selecciona una organización",
      "subtitle": "Elige una organización para continuar o crea una nueva.",
      "createNew": "Crear nueva organización",
      "loadingOrgs": "Cargando organizaciones..."
    },
    "forgotPassword": {
      "title": "Recuperar contraseña",
      "subtitle": "Ingresa tu correo para recibir instrucciones",
      "submit": "Enviar instrucciones",
      "backToLogin": "Volver al inicio de sesión"
    },
    "resetPassword": {
      "title": "Nueva contraseña",
      "newPassword": "Nueva contraseña",
      "confirmPassword": "Confirmar contraseña",
      "submit": "Cambiar contraseña"
    }
  },
  "nav": {
    "home": "Inicio",
    "organization": "Organización",
    "clients": "Clientes",
    "pos": "Punto de Venta",
    "inventory": "Inventario",
    "finance": "Finanzas",
    "pms": "PMS",
    "crm": "CRM",
    "hrm": "Recursos Humanos",
    "reports": "Reportes",
    "notifications": "Notificaciones",
    "integrations": "Integraciones",
    "transport": "Transporte",
    "calendar": "Calendario",
    "timeline": "Timeline",
    "settings": "Configuración",
    "profile": "Perfil",
    "logout": "Cerrar Sesión",
    "mySubscription": "Mi Suscripción",
    "myOrganizations": "Mis Organizaciones"
  }
}
```

Equivalente en `messages/en.json`:

```json
{
  "common": {
    "save": "Save",
    "cancel": "Cancel",
    "delete": "Delete",
    "edit": "Edit",
    "create": "Create",
    "search": "Search",
    "loading": "Loading...",
    "error": "Error",
    "success": "Success",
    "confirm": "Confirm",
    "back": "Back",
    "next": "Next",
    "yes": "Yes",
    "no": "No",
    "or": "Or",
    "close": "Close"
  },
  "auth": {
    "login": {
      "title": "Log In",
      "email": "Email address",
      "password": "Password",
      "submit": "Log In",
      "forgotPassword": "Forgot your password?",
      "noAccount": "Don't have an account?",
      "signUp": "Sign up",
      "googleLogin": "Continue with Google",
      "invalidCredentials": "Invalid credentials"
    },
    "signup": {
      "title": "Create Account",
      "firstName": "First name",
      "lastName": "Last name",
      "email": "Email address",
      "password": "Password",
      "confirmPassword": "Confirm password",
      "phone": "Phone",
      "preferredLanguage": "Preferred language",
      "submit": "Create account",
      "hasAccount": "Already have an account?",
      "login": "Log in"
    },
    "selectOrganization": {
      "title": "Select an organization",
      "subtitle": "Choose an organization to continue or create a new one.",
      "createNew": "Create new organization",
      "loadingOrgs": "Loading organizations..."
    }
  },
  "nav": {
    "home": "Home",
    "organization": "Organization",
    "clients": "Clients",
    "pos": "Point of Sale",
    "inventory": "Inventory",
    "finance": "Finance",
    "pms": "PMS",
    "crm": "CRM",
    "hrm": "Human Resources",
    "reports": "Reports",
    "notifications": "Notifications",
    "integrations": "Integrations",
    "transport": "Transport",
    "calendar": "Calendar",
    "timeline": "Timeline",
    "settings": "Settings",
    "profile": "Profile",
    "logout": "Log Out",
    "mySubscription": "My Subscription",
    "myOrganizations": "My Organizations"
  }
}
```

> Los archivos `pt.json` y `fr.json` siguen la misma estructura.

---

## 4. Fases de Implementación

### Fase 0 — Setup base (1 sesión)

| Tarea | Detalle |
|-------|---------|
| Instalar `next-intl` | `npm install next-intl` |
| Crear `src/i18n/config.ts` | Definir locales: `['es', 'en', 'pt', 'fr']`, default: `'es'` |
| Crear `src/i18n/request.ts` | `getRequestConfig` para server components |
| Crear `src/i18n/provider.tsx` | Provider client que lee `preferred_language` del perfil |
| Crear archivos base | `messages/es.json`, `messages/en.json` (con namespaces `common`, `auth`, `nav`) |
| Integrar en `layout.tsx` | Envolver la app con `NextIntlClientProvider` |
| Crear hook `useLocale` custom | Lee idioma del perfil, fallback a `'es'`, persiste en localStorage |

**Archivos a crear/modificar:**
- `messages/es.json` (nuevo)
- `messages/en.json` (nuevo)
- `messages/pt.json` (nuevo)
- `messages/fr.json` (nuevo)
- `src/i18n/config.ts` (nuevo)
- `src/i18n/request.ts` (nuevo)
- `src/i18n/provider.tsx` (nuevo)
- `src/app/layout.tsx` (modificar — agregar provider)

---

### Fase 1 — Módulo `auth` (1 sesión)

Traducir todas las páginas de autenticación:

| Página | Ruta | Archivo |
|--------|------|---------|
| Login | `/auth/login` | `src/app/auth/login/page.tsx` |
| Signup | `/auth/signup` | `src/app/auth/signup/page.tsx` |
| Select Org | `/auth/select-organization` | `src/app/auth/select-organization/page.tsx` |
| Forgot Password | `/auth/forgot-password` | `src/app/auth/forgot-password/page.tsx` |
| Reset Password | `/auth/reset-password` | `src/app/auth/reset-password/page.tsx` |
| Verify | `/auth/verify` | `src/app/auth/verify/page.tsx` |
| Session Expired | `/auth/session-expired` | `src/app/auth/session-expired/page.tsx` |
| Invite | `/auth/invite` | `src/app/auth/invite/page.tsx` |

**Componentes de auth:**
- `src/components/auth/PersonalInfoStep.tsx`
- `src/components/auth/OrganizationStep.tsx`
- `src/components/auth/BranchStep.tsx`
- `src/components/auth/VerificationStep.tsx`
- `src/components/auth/SubscriptionStep.tsx`
- `src/components/auth/PaymentMethodStep.tsx`

**Patrón de migración por componente:**

```tsx
// ANTES
<h2>Iniciar Sesión</h2>
<label>Correo electrónico</label>
<button>Iniciar Sesión</button>

// DESPUÉS
import { useTranslations } from 'next-intl';

const t = useTranslations('auth.login');

<h2>{t('title')}</h2>
<label>{t('email')}</label>
<button>{t('submit')}</button>
```

---

### Fase 2 — Layout y navegación (1 sesión)

Traducir el layout principal de la app:

| Componente | Archivo |
|------------|---------|
| Sidebar | `src/components/app-layout/Sidebar/SidebarNavigation.tsx` |
| Header | `src/components/app-layout/AppHeader.tsx` |
| Profile Menu | `src/components/app-layout/ProfileDropdownMenu.tsx` |
| AppLayout | `src/components/app-layout/AppLayout.tsx` |

**Namespace:** `nav`

---

### Fase 3 — Módulos principales (1 sesión por módulo)

Traducir módulo por módulo en este orden de prioridad:

| # | Módulo | Ruta base | Namespace |
|---|--------|-----------|-----------|
| 1 | Inicio | `/app/inicio` | `home` |
| 2 | Organización | `/app/organizacion` | `organization` |
| 3 | Perfil | `/app/perfil` | `profile` |
| 4 | Clientes | `/app/clientes` | `clients` |
| 5 | POS | `/app/pos` | `pos` |
| 6 | Inventario | `/app/inventario` | `inventory` |
| 7 | Finanzas | `/app/finanzas` | `finance` |
| 8 | PMS | `/app/pms` | `pms` |
| 9 | CRM | `/app/crm` | `crm` |
| 10 | HRM | `/app/hrm` | `hrm` |
| 11 | Reportes | `/app/reportes` | `reports` |
| 12 | Notificaciones | `/app/notificaciones` | `notifications` |
| 13 | Integraciones | `/app/integraciones` | `integrations` |
| 14 | Transporte | `/app/transporte` | `transport` |
| 15 | Calendario | `/app/calendario` | `calendar` |
| 16 | Timeline | `/app/timeline` | `timeline` |
| 17 | Roles | `/app/roles` | `roles` |
| 18 | Plan | `/app/plan` | `plan` |
| 19 | Parking | `/app/parking` | `parking` |
| 20 | Gym | `/app/gym` | `gym` |
| 21 | Chat | `/app/chat` | `chat` |

---

### Fase 4 — Admin panel (1 sesión)

| Componente | Ruta |
|------------|------|
| Admin Dashboard | `/admin` |
| Admin Sidebar | `src/components/admin/...` |

**Namespace:** `admin`

---

## 5. Flujo Técnico

```
┌─────────────┐     ┌──────────────┐     ┌────────────────┐
│   Login     │     │   profiles   │     │  messages/     │
│   (auth)    │────▶│  .preferred  │────▶│  {locale}.json │
│             │     │  _language   │     │                │
└─────────────┘     └──────────────┘     └────────────────┘
                          │                      │
                          ▼                      ▼
                    ┌──────────┐         ┌───────────────┐
                    │ Context  │────────▶│  useTransla-  │
                    │ Provider │         │  tions('ns')  │
                    └──────────┘         └───────────────┘
                                                │
                                                ▼
                                         ┌────────────┐
                                         │  UI en el  │
                                         │  idioma    │
                                         │  del user  │
                                         └────────────┘
```

### Detalle del flujo:

1. **Login/Signup:** El usuario elige `preferred_language` → se guarda en `profiles`
2. **App carga:** El provider lee `preferred_language` del perfil (o localStorage como cache)
3. **Provider:** Carga dinámicamente `messages/{locale}.json`
4. **Componentes:** Usan `useTranslations('namespace')` para obtener textos
5. **Cambio de idioma:** Si el usuario cambia idioma en settings → actualiza DB + recarga traducciones

---

## 6. Configuración de `next-intl`

### `src/i18n/config.ts`
```ts
export const locales = ['es', 'en', 'pt', 'fr'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'es';

export const localeNames: Record<Locale, string> = {
  es: 'Español',
  en: 'English',
  pt: 'Português',
  fr: 'Français',
};
```

### `src/i18n/provider.tsx`
```tsx
'use client';

import { NextIntlClientProvider } from 'next-intl';
import { useEffect, useState } from 'react';
import { defaultLocale, Locale, locales } from './config';

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>(defaultLocale);
  const [messages, setMessages] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    // 1. Leer de localStorage (cache rápido)
    const cached = localStorage.getItem('preferredLanguage') as Locale;
    if (cached && locales.includes(cached)) {
      setLocale(cached);
    }

    // 2. Leer del perfil (fuente de verdad)
    // Se actualiza cuando el perfil carga vía useOrganization o similar
  }, []);

  useEffect(() => {
    // Cargar mensajes del locale actual
    import(`../../../messages/${locale}.json`)
      .then((mod) => setMessages(mod.default))
      .catch(() => import(`../../../messages/es.json`).then((m) => setMessages(m.default)));
  }, [locale]);

  if (!messages) return null; // o skeleton

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
```

---

## 7. Ejemplo de Uso en Componentes

### Componente simple
```tsx
import { useTranslations } from 'next-intl';

export function LoginForm() {
  const t = useTranslations('auth.login');

  return (
    <form>
      <h2>{t('title')}</h2>
      <label>{t('email')}</label>
      <input type="email" placeholder={t('email')} />
      <label>{t('password')}</label>
      <input type="password" />
      <button type="submit">{t('submit')}</button>
      <a href="/auth/forgot-password">{t('forgotPassword')}</a>
    </form>
  );
}
```

### Con interpolación
```json
{
  "welcome": "Hola, {name}",
  "itemCount": "Tienes {count, plural, =0 {ningún item} one {# item} other {# items}}"
}
```

```tsx
const t = useTranslations('home');
t('welcome', { name: 'Juan' });      // "Hola, Juan"
t('itemCount', { count: 5 });         // "Tienes 5 items"
```

### Con formato de fecha/moneda
```tsx
import { useFormatter } from 'next-intl';

const format = useFormatter();
format.dateTime(new Date(), { dateStyle: 'long' });    // "20 de marzo de 2026"
format.number(1500, { style: 'currency', currency: 'COP' }); // "$1.500"
```

---

## 8. Reglas de Migración

1. **No romper nada existente** — Los textos hardcoded siguen funcionando hasta que se migran
2. **Un módulo a la vez** — No mezclar migración de múltiples módulos en un mismo PR
3. **Namespace por módulo** — Cada módulo tiene su propio namespace en el JSON
4. **Español como base** — Se escribe primero en `es.json`, luego se traduce a los demás
5. **Keys en camelCase** — `auth.login.forgotPassword`, no `auth.login.forgot-password`
6. **No traducir keys de DB** — Nombres de organización, nombres de usuario, etc. NO se traducen
7. **Commit por fase** — `feat(i18n): add translations for auth module`

---

## 9. Cambio de Idioma en Runtime

### En la página de perfil (`/app/perfil`)

```tsx
import { locales, localeNames } from '@/i18n/config';

// Select de idioma
<select
  value={currentLocale}
  onChange={async (e) => {
    const newLocale = e.target.value;
    // 1. Actualizar en DB
    await supabase.from('profiles').update({ preferred_language: newLocale }).eq('id', userId);
    // 2. Actualizar cache local
    localStorage.setItem('preferredLanguage', newLocale);
    // 3. Recargar traducciones (el provider detecta el cambio)
    window.location.reload(); // o usar state management
  }}
>
  {locales.map((loc) => (
    <option key={loc} value={loc}>{localeNames[loc]}</option>
  ))}
</select>
```

---

## 10. Testing

- **Visual:** Cambiar idioma en perfil → toda la UI debe cambiar
- **Fallback:** Si falta una key en `en.json`, debe mostrar la versión de `es.json`
- **Persistencia:** Cerrar sesión y volver a entrar → debe mantener el idioma elegido
- **Nuevos usuarios:** Default `'es'` hasta que elijan otro

---

## 11. Estimación de Esfuerzo

| Fase | Descripción | Sesiones estimadas |
|------|-------------|-------------------|
| 0 | Setup base + config | 1 |
| 1 | Módulo auth | 1 |
| 2 | Layout y navegación | 1 |
| 3 | Módulos principales (21) | 10-15 |
| 4 | Admin panel | 1 |
| **Total** | | **14-19 sesiones** |

> Cada sesión = una conversación de Cascade enfocada en ese módulo.

---

## 12. Dependencias

| Paquete | Versión | Propósito |
|---------|---------|-----------|
| `next-intl` | `^3.x` | Librería principal de i18n |

No se requieren otras dependencias.

---

## 13. Checklist Pre-implementación

- [ ] Instalar `next-intl`
- [ ] Crear estructura de carpetas `messages/` y `src/i18n/`
- [ ] Crear `es.json` con namespaces `common`, `auth`, `nav`
- [ ] Crear `en.json` con las mismas keys traducidas
- [ ] Crear `pt.json` y `fr.json` (pueden estar incompletos inicialmente)
- [ ] Crear provider y config
- [ ] Integrar en `layout.tsx`
- [ ] Verificar que la app funciona sin cambios en componentes existentes
- [ ] Migrar primer componente de prueba (`select-organization`)
- [ ] Verificar cambio de idioma en runtime
