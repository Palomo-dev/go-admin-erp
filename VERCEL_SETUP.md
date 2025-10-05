# 🎯 Configuración Rápida en Vercel para app.goadmin.io

## Paso 1: Deploy Inicial en Vercel

### 1. Importar Proyecto
1. Ve a [vercel.com/new](https://vercel.com/new)
2. Conecta tu repositorio de GitHub/GitLab/Bitbucket
3. Busca y selecciona **go-admin-erp**
4. Click en **"Import"**

### 2. Configurar Variables de Entorno

**⚠️ IMPORTANTE:** Antes de hacer deploy, configura estas variables:

```env
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co

NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_clave_anon_supabase

NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_TU_CLAVE_PUBLICA_STRIPE

STRIPE_SECRET_KEY=sk_live_TU_CLAVE_SECRETA_STRIPE

NEXT_PUBLIC_OPENEXCHANGERATES_API_KEY=tu_api_key_openexchangerates

NEXT_PUBLIC_APP_URL=https://app.goadmin.io
```

**⚠️ IMPORTANTE:** Copia todas tus claves reales desde tu archivo `.env.local` cuando configures en Vercel.

**Marca las 3 opciones** para cada variable:
- ✅ Production
- ✅ Preview  
- ✅ Development

### 3. Deploy
Click en **"Deploy"** y espera 2-5 minutos.

---

## Paso 2: Configurar Dominios

### Opción A: Solo app.goadmin.io (Recomendado)

#### 1. Agregar Dominio Principal
1. Ve a tu proyecto en Vercel
2. Click en **"Settings"** → **"Domains"**
3. Escribe: `app.goadmin.io`
4. Click en **"Add"**
5. Vercel lo configurará automáticamente (ya compraste el dominio con ellos)

#### 2. Agregar Wildcard para Subdominios de Organizaciones
1. En la misma sección de Domains
2. Escribe: `*.app.goadmin.io`
3. Click en **"Add"**
4. Esto permitirá: `empresa1.app.goadmin.io`, `empresa2.app.goadmin.io`, etc.

**✅ Listo! Tu app estará disponible en:**
- Principal: `https://app.goadmin.io`
- Organizaciones: `https://[nombre].app.goadmin.io`

---

### Opción B: Con Redirect desde goadmin.io

Si quieres que `goadmin.io` redirija a `app.goadmin.io`:

#### 1. Primero agrega app.goadmin.io (ver Opción A)

#### 2. Agregar Dominio Raíz con Redirect
1. En **"Settings"** → **"Domains"**
2. Escribe: `goadmin.io`
3. Click en **"Add"**
4. Selecciona: **"Redirect to app.goadmin.io"**
5. Marca: **"Permanent (308)"**

**Resultado:**
- `goadmin.io` → redirige a `app.goadmin.io`
- `www.goadmin.io` → redirige a `app.goadmin.io` (automático)

---

## Paso 3: Configurar Supabase

### 1. Ir a Configuración de Supabase
1. Ve a [app.supabase.com](https://app.supabase.com)
2. Selecciona tu proyecto: **jgmgphmzusbluqhuqihj**
3. Click en **"Authentication"** en el menú lateral
4. Click en **"URL Configuration"**

### 2. Actualizar Site URL
En el campo **"Site URL"**, pon:
```
https://app.goadmin.io
```

### 3. Actualizar Redirect URLs
En el campo **"Redirect URLs"**, agrega estas líneas (una por línea):
```
https://app.goadmin.io/**
https://app.goadmin.io/auth/callback
https://app.goadmin.io/auth/login
https://*.app.goadmin.io/**
https://goadmin.io/**
https://*.vercel.app/**
```

### 4. Configurar CORS (si está disponible)
Si hay una sección de CORS, agrega:
```
https://app.goadmin.io
https://*.app.goadmin.io
https://goadmin.io
```

### 5. Guardar Cambios
Click en **"Save"** al final de la página.

---

## Paso 4: Configurar Stripe (si usas pagos)

### 1. Ir a Webhooks de Stripe
1. Ve a [dashboard.stripe.com/webhooks](https://dashboard.stripe.com/webhooks)
2. Click en **"Add endpoint"**

### 2. Configurar Endpoint
- **Endpoint URL:** `https://app.goadmin.io/api/webhooks/stripe`
- **Description:** Webhook producción GO Admin ERP

### 3. Seleccionar Eventos
Marca estos eventos:
- ✅ `checkout.session.completed`
- ✅ `payment_intent.succeeded`
- ✅ `invoice.paid`
- ✅ `customer.subscription.updated`
- ✅ `customer.subscription.deleted`

### 4. Copiar Webhook Secret
1. Click en **"Add endpoint"**
2. Copia el **Signing secret** (empieza con `whsec_...`)
3. Ve a Vercel → Settings → Environment Variables
4. Agrega nueva variable:
   - **Name:** `STRIPE_WEBHOOK_SECRET`
   - **Value:** `whsec_...` (el valor que copiaste)
   - Marca: Production, Preview, Development

### 5. Re-deploy (para aplicar nueva variable)
1. Ve a tu proyecto en Vercel
2. Click en **"Deployments"**
3. Click en los **"︙"** del último deploy
4. Click en **"Redeploy"**

---

## Paso 5: Verificaciones Finales

### 1. Verificar Login
```
https://app.goadmin.io/auth/login
```
- Intenta iniciar sesión con tu cuenta
- Verifica que no haya errores de cookies

### 2. Verificar Subdominio de Organización
```
https://[tu-empresa].app.goadmin.io
```
- Reemplaza `[tu-empresa]` con el subdomain de tu organización
- Verifica que la cookie `organization` se establezca correctamente
- Abre DevTools (F12) → Application → Cookies

### 3. Verificar Logs en Vercel
1. Ve a tu proyecto en Vercel
2. Click en **"Logs"** en el menú superior
3. Verifica que no haya errores 500 o 404

### 4. Verificar SSL/HTTPS
- Vercel configura SSL automáticamente
- Verifica que el candado verde aparezca en el navegador
- Puede tardar 1-2 minutos después de agregar el dominio

---

## 🐛 Troubleshooting

### Problema: "Domain not found" en Vercel
**Solución:**
- Verifica que compraste el dominio con Vercel
- Si lo compraste en otro lugar, configura los DNS manualmente
- Espera 5-10 minutos para propagación

### Problema: Subdominios no funcionan
**Solución:**
1. Verifica que agregaste `*.app.goadmin.io` en Vercel
2. Espera propagación DNS (5-10 min)
3. Limpia cache del navegador (Ctrl + Shift + R)
4. Verifica el middleware en DevTools Network

### Problema: "Session not found" o errores de login
**Solución:**
1. Verifica que las URLs estén en Supabase Authentication
2. Limpia cookies del navegador completamente
3. Intenta en ventana de incógnito
4. Verifica que `NEXT_PUBLIC_SUPABASE_URL` esté correcta en Vercel

### Problema: Cambios no se reflejan
**Solución:**
1. Haz un nuevo commit y push
2. O en Vercel: Deployments → "︙" → Redeploy
3. Limpia cache del navegador

---

## 🎯 Checklist Final

- [ ] Proyecto desplegado en Vercel
- [ ] Variable `NEXT_PUBLIC_APP_URL=https://app.goadmin.io` configurada
- [ ] Dominio `app.goadmin.io` agregado en Vercel
- [ ] Wildcard `*.app.goadmin.io` agregado en Vercel
- [ ] Site URL en Supabase actualizado
- [ ] Redirect URLs en Supabase actualizados
- [ ] Stripe webhook configurado (si aplica)
- [ ] Login funciona en `app.goadmin.io`
- [ ] Subdominios funcionan correctamente
- [ ] Sin errores en Vercel Logs

---

## 📱 URLs de Referencia Rápida

- **App Principal:** https://app.goadmin.io
- **Supabase Config:** https://app.supabase.com/project/jgmgphmzusbluqhuqihj/auth/url-configuration
- **Stripe Webhooks:** https://dashboard.stripe.com/webhooks
- **Vercel Dashboard:** https://vercel.com/dashboard
- **Vercel CLI:** `npm i -g vercel` → `vercel login` → `vercel logs --follow`

---

**✨ ¡Tu aplicación está lista en app.goadmin.io!**

Para soporte adicional, revisa el archivo `DEPLOY_GUIDE.md` con la guía completa.
