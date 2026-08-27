---
name: env-secrets-management
description: Usar SIEMPRE al configurar variables de entorno, manejar API keys/secrets, o preparar configuración para distintos ambientes (desarrollo, staging, producción). Aplica a proyectos Next.js, FastAPI, Electron, Capacitor/React Native, y configuración de CI/CD.
---

# Manejo de variables de entorno y secrets

## Reglas base
- Nunca commitear archivos `.env`, `.env.local`, `.env.production` con valores
  reales — solo `.env.example` con nombres de variables y valores dummy/placeholder.
- `.gitignore` debe excluir todos los `.env*` excepto `.env.example`.
- Un secret filtrado a git (aunque se borre después) debe considerarse comprometido
  — rotarlo, no solo eliminarlo del commit.

## Por entorno
- Variables distintas por ambiente (dev/staging/prod), nunca la misma key de
  Stripe/Supabase/proveedor de pago en desarrollo y producción.
- En producción, usa el gestor de secrets de la plataforma de hosting (Vercel env
  vars, variables de entorno del servidor, GitHub Actions secrets) — no un archivo
  `.env` subido manualmente al servidor.

## Next.js específico
- `NEXT_PUBLIC_*` se expone al bundle del cliente — solo para valores que
  realmente pueden ser públicos (URL de Supabase, anon key). Nunca `service_role
  key`, secretos de Stripe (`sk_...`), o claves de proveedores financieros ahí.
- Variables sin ese prefijo solo están disponibles en Server Components/Server
  Actions/Route Handlers.

## Apps móviles/desktop (Capacitor, Electron, React Native)
- Nada verdaderamente secreto puede vivir en el bundle de una app cliente —
  cualquier string embebido en el binario es extraíble. Secrets reales viven en
  el backend; la app solo tiene claves públicas/anon o tokens de sesión de corta
  duración.
- Para Electron, ten especial cuidado: el código empaquetado es inspeccionable
  fácilmente, no confíes en "ofuscación" como seguridad.

## Validación
- Valida al arrancar la aplicación que las variables de entorno requeridas
  existan (fail-fast), en vez de fallar más tarde con un error críptico cuando
  se use la variable faltante.
