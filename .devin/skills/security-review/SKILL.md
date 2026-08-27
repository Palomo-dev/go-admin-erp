---
name: security-review
description: Usar SIEMPRE al escribir código que maneje autenticación, autorización, datos de usuarios/tenants, dinero, o input externo (formularios, APIs públicas, webhooks). También usar cuando el usuario pide explícitamente una revisión de seguridad o menciona vulnerabilidades.
---

# Revisión de seguridad

## Checklist de vulnerabilidades comunes

- **Inyección SQL**: usa siempre queries parametrizadas/ORM — nunca concatenación
  de strings con input del usuario en SQL crudo.
- **XSS**: si se renderiza HTML/contenido generado por usuario, sanitiza o usa
  el escape automático del framework — cuidado especial con `dangerouslySetInnerHTML` 
  en React o equivalentes.
- **IDOR (Insecure Direct Object Reference)**: si un endpoint recibe un `id` 
  (factura, cliente, transacción), siempre verifica que pertenezca al
  tenant/usuario autenticado, no solo que el registro exista.
- **Autenticación rota**: nunca implementes tu propio hashing de contraseñas
  (usa bcrypt/argon2 vía librería estándar, o delega en Supabase Auth/Firebase Auth).
  Tokens de sesión con expiración razonable, no infinitos.
- **CORS mal configurado**: no uses `Access-Control-Allow-Origin: *` en endpoints
  que requieren autenticación con cookies.
- **Rate limiting ausente**: endpoints de login, recuperación de contraseña, y
  webhooks públicos deben tener límite de intentos.
- **Secrets expuestos**: nunca en el código fuente, nunca en `NEXT_PUBLIC_*` si
  son sensibles, nunca en logs.

## Específico para multi-tenant/SaaS financiero
- Cada query a datos de tenant debe filtrar por `tenant_id` — no confíes solo en
  RLS de Supabase si también hay lógica de autorización en el backend; ambas capas
  deben ser consistentes (defensa en profundidad).
- Verifica siempre server-side los permisos del usuario para una acción, aunque
  el frontend ya oculte el botón — el frontend no es una barrera de seguridad.
- Logs de auditoría para acciones sensibles (cambios de permisos, transferencias
  de dinero, cambios de configuración de facturación).

## Al integrar servicios externos (webhooks, APIs de pago)
- Verifica siempre la firma/autenticidad del webhook antes de procesar.
- No confíes en montos o datos financieros que vengan del cliente sin
  recalcular/validar server-side.

## Formato de reporte al encontrar un problema
```
[severidad: crítico/alto/medio/bajo] Descripción del problema
Dónde: archivo/línea
Por qué es un riesgo:
Cómo arreglarlo:
```
