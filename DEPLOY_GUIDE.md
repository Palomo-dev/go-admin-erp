# 🚀 Guía de Deploy en Vercel - GO Admin ERP

## Requisitos Previos
- ✅ Cuenta de Vercel
- ✅ Dominio goadmin.io comprado en Vercel (usaremos app.goadmin.io)
- ✅ Cuenta de Supabase configurada
- ✅ Cuenta de Stripe configurada
- ✅ Repositorio de GitHub/GitLab/Bitbucket

---

## 📋 Paso 1: Preparar el Repositorio

### 1.1 Verificar que .env.local NO esté en el repositorio
```bash
git status
# Asegúrate de que .env.local aparezca ignorado
```

### 1.2 Commit de archivos de configuración (si aún no lo hiciste)
```bash
git add vercel.json .env.example DEPLOY_GUIDE.md
git commit -m "chore: Configuración para deploy en Vercel"
git push origin main
```

---

## 🌐 Paso 2: Configurar Proyecto en Vercel

### 2.1 Importar Proyecto
1. Ve a [vercel.com/dashboard](https://vercel.com/dashboard)
2. Click en **"Add New Project"**
3. Selecciona tu repositorio de **go-admin-erp**
4. Click en **"Import"**

### 2.2 Configurar Framework Preset
- **Framework Preset:** Next.js
- **Root Directory:** `./` (dejar por defecto)
- **Build Command:** `next build` (automático)
- **Output Directory:** `.next` (automático)
- **Install Command:** `npm install` (automático)

### 2.3 Configurar Variables de Entorno
En la sección **"Environment Variables"**, agrega:

#### Supabase
```
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_clave_anon_supabase
```
**⚠️ IMPORTANTE:** Copia tus claves reales desde tu archivo `.env.local`

#### Stripe
```
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_TU_CLAVE_PUBLICA_STRIPE
STRIPE_SECRET_KEY=sk_live_TU_CLAVE_SECRETA_STRIPE
```
**⚠️ IMPORTANTE:** Copia tus claves reales desde tu archivo `.env.local`

#### OpenExchangeRates
```
NEXT_PUBLIC_OPENEXCHANGERATES_API_KEY=tu_api_key_openexchangerates
```
**⚠️ IMPORTANTE:** Copia tu API key real desde tu archivo `.env.local`

#### Dominio de Aplicación
```
NEXT_PUBLIC_APP_URL=https://app.goadmin.io
```

**⚠️ IMPORTANTE:** Marca todas las variables para los tres ambientes:
- ✅ Production
- ✅ Preview
- ✅ Development

### 2.4 Deploy Inicial
Click en **"Deploy"** y espera 2-5 minutos

---

## 🌍 Paso 3: Configurar Dominio Personalizado

### 3.1 Ir a Configuración de Dominio
1. En el dashboard de tu proyecto, ve a **"Settings"**
2. Click en **"Domains"**

### 3.2 Agregar app.goadmin.io (Dominio Principal)
1. En el campo "Domain", escribe: `app.goadmin.io`
2. Click en **"Add"**
3. Vercel detectará automáticamente que compraste el dominio con ellos

### 3.3 Configurar Subdominios para Organizaciones (Multi-tenancy)
Para que cada organización tenga su subdominio:
```
*.app.goadmin.io → apunta al mismo proyecto
```

1. Agrega un nuevo dominio: `*.app.goadmin.io`
2. Vercel lo configurará automáticamente
3. Ejemplos: 
   - `empresa1.app.goadmin.io`
   - `empresa2.app.goadmin.io`

### 3.4 Configurar Dominio Raíz (Opcional)
Si quieres que `goadmin.io` redirija a `app.goadmin.io`:
1. Agrega: `goadmin.io`
2. En las opciones de ese dominio, configura **"Redirect to app.goadmin.io"**
3. Esto enviará a los usuarios de `goadmin.io` → `app.goadmin.io` automáticamente

---

## 🔧 Paso 4: Configurar Supabase para el Dominio

### 4.1 Actualizar URLs Permitidas en Supabase
1. Ve a [app.supabase.com](https://app.supabase.com)
2. Selecciona tu proyecto: **jgmgphmzusbluqhuqihj**
3. Ve a **Authentication → URL Configuration**

### 4.2 Agregar URLs de Producción
En **"Site URL"**:
```
https://app.goadmin.io
```

En **"Redirect URLs"**:
```
https://app.goadmin.io/**
https://app.goadmin.io/auth/callback
https://app.goadmin.io/auth/login
https://*.app.goadmin.io/**
https://goadmin.io/**
https://*.vercel.app/**
```

### 4.3 Configurar CORS
En **Authentication → CORS**:
```
https://app.goadmin.io
https://*.app.goadmin.io
https://goadmin.io
https://*.vercel.app
```

---

## 🔐 Paso 5: Configurar Stripe para Producción

### 5.1 Webhooks de Stripe
1. Ve a [dashboard.stripe.com/webhooks](https://dashboard.stripe.com/webhooks)
2. Click en **"Add endpoint"**
3. Endpoint URL: `https://app.goadmin.io/api/webhooks/stripe`
4. Selecciona eventos:
   - `checkout.session.completed`
   - `payment_intent.succeeded`
   - `invoice.paid`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`

### 5.2 Copiar Webhook Secret
1. Copia el **Signing secret** (empieza con `whsec_...`)
2. Ve a Vercel → Settings → Environment Variables
3. Agrega:
```
STRIPE_WEBHOOK_SECRET=whsec_tu_secret_aqui
```

---

## ✅ Paso 6: Verificaciones Post-Deploy

### 6.1 Verificar Deploy
```bash
# Accede a tu aplicación
https://app.goadmin.io
```

### 6.2 Verificar Funcionalidades Clave
- ✅ **Login:** Prueba iniciar sesión en `https://app.goadmin.io/auth/login`
- ✅ **Autenticación Google:** Verifica OAuth
- ✅ **Supabase:** Verifica que las consultas funcionen
- ✅ **Stripe:** Prueba crear una suscripción de prueba
- ✅ **Subdominios:** Prueba `https://empresa1.app.goadmin.io`

### 6.3 Verificar Middleware
El middleware debe funcionar para:
- Redirecciones de autenticación
- Manejo de subdominios de organizaciones
- Protección de rutas

### 6.4 Revisar Logs en Vercel
1. Ve a tu proyecto en Vercel
2. Click en **"Logs"** en el menú superior
3. Verifica que no haya errores

---

## 🐛 Troubleshooting Común

### Error: "Session not found"
**Solución:**
1. Verifica que las URLs de redirect estén en Supabase
2. Limpia cookies del navegador
3. Verifica que `NEXT_PUBLIC_SUPABASE_URL` sea correcta

### Error: Subdominios no funcionan
**Solución:**
1. Verifica que agregaste `*.app.goadmin.io` en Vercel Domains
2. Espera 5-10 minutos para propagación DNS
3. Verifica el middleware en `/src/middleware.ts` líneas 496-507
4. Verifica que el hostname parsing sea correcto para subdominios de tercer nivel

### Error: Stripe webhooks fallan
**Solución:**
1. Verifica que `STRIPE_WEBHOOK_SECRET` esté configurado
2. Verifica que el endpoint en Stripe sea `https://app.goadmin.io/api/webhooks/stripe`
3. Verifica los logs de Stripe Dashboard

### Error de compilación
**Solución:**
```bash
# Localmente, limpia y reconstruye
npm run build

# Si funciona local, verifica:
# 1. Node version en vercel.json (actualmente >= 20.0.0)
# 2. Variables de entorno en Vercel
```

---

## 🔄 Re-Deploy y Actualizaciones

### Para actualizar el proyecto:
```bash
# 1. Hacer cambios
git add .
git commit -m "feat: nueva funcionalidad"
git push origin main

# 2. Vercel auto-desplegará
# 3. Verifica en https://vercel.com/dashboard
```

### Para rollback:
1. Ve a Vercel Dashboard → Deployments
2. Encuentra el deploy anterior que funcionaba
3. Click en **"︙"** → **"Promote to Production"**

---

## 📊 Monitoreo Post-Deploy

### Analytics de Vercel
- Ve a tu proyecto → **Analytics**
- Monitorea: Requests, Errors, Performance

### Logs en Tiempo Real
```bash
# Instala Vercel CLI
npm i -g vercel

# Login
vercel login

# Ver logs en tiempo real
vercel logs goadmin-erp --follow
```

---

## 🎯 Checklist Final

- [ ] Proyecto desplegado en Vercel
- [ ] Dominio app.goadmin.io configurado
- [ ] Subdominios *.app.goadmin.io configurados
- [ ] Redirect de goadmin.io → app.goadmin.io (opcional)
- [ ] Variables de entorno configuradas
- [ ] Supabase URLs actualizadas
- [ ] Stripe webhooks configurados
- [ ] Login funcional en app.goadmin.io
- [ ] Middleware funcionando con subdominios
- [ ] Sin errores en logs
- [ ] SSL/HTTPS activo (automático con Vercel)

---

## 📞 Soporte

Si encuentras problemas:
1. Revisa logs en Vercel Dashboard
2. Verifica configuración de Supabase
3. Revisa la consola del navegador (F12)
4. Contacta a soporte de Vercel si es necesario

---

**✨ ¡Tu aplicación GO Admin ERP está lista para producción en app.goadmin.io!**
