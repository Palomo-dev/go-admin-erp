# Implementación de Eliminación de Cuenta con Cumplimiento GDPR/LOPD

## Resumen

Implementa el flujo completo de eliminación de cuenta según los requisitos de la política de datos que se publica el 2-oct-2026. Promete suprimir o anonimizar datos personales en máximo 15 días hábiles, conservando facturación y contabilidad por 10 años.

## ¿Qué hace esta implementación?

### 1. Flujo actual documentado

El componente `EliminarCuentaSection.tsx` marca el perfil como `pending_deletion` pero:
- ❌ La columna `deletion_requested_at` NO existía en la tabla `profiles`
- ❌ No había ningún proceso que borre o anonimice después
- ❌ El mensaje decía "todos sus datos serán eliminados permanentemente" (incorrecto legalmente)

### 2. Cambios implementados

#### Base de datos (Migración `20260930235000`)
- ✅ Agregada columna `profiles.deletion_requested_at timestamptz`
- ✅ Tabla de auditoría `account_deletion_audit` sin datos personales
- ✅ RPC `get_pending_account_deletions(p_days_after)` filtra por plazo
- ✅ RPC `is_sole_admin_with_active_subscription(user_id)` previene bloqueos
- ✅ Índices para performance y rollback completo

#### Mensaje de confirmación
**ANTES:**
> Una vez eliminada su cuenta, todos sus datos personales serán eliminados permanentemente

**AHORA (texto de Legal):**
> Eliminaremos tus datos personales en un plazo máximo de 15 días hábiles. Conservaremos solo lo que la ley nos obliga a guardar, como la facturación y la contabilidad, por 10 años.

Este texto aparece en:
- Descripción de la sección
- Diálogo de confirmación
- Correo de solicitud
- Correo de completado

#### Proceso programado (Cron diario a las 4 AM)
`/api/cron/process-account-deletions` ejecuta cada día:

1. **Obtiene cuentas pendientes** con más de 10 días calendario (15 días hábiles aprox.)
2. **Verifica bloqueos**: si es único admin de org con suscripción activa, marca para revisión manual
3. **Anonimiza perfil**: `first_name`, `last_name`, `phone`, `avatar_url`, `department` → `NULL`
4. **Elimina avatar** del storage `profiles/avatars`
5. **Quita accesos**: marca `organization_members.is_active = false` (conserva la referencia)
6. **Deshabilita Auth**: elimina o anonimiza el correo para liberar el email
7. **NO toca facturas ni contabilidad**: quedan intactas por 10 años
8. **Registra auditoría** sin datos personales en `account_deletion_audit`
9. **Envía correo** de confirmación al usuario

#### Correos
- **Al solicitar** (`/api/account-deletion/request-notification`): confirma solicitud, explica plazo, ofrece cancelar
- **Al completar** (desde el cron): confirma eliminación, lista qué se borró y qué se conserva

#### Casos límite
- **Único admin con suscripción activa**: NO se elimina, se marca para revisión manual
- **Varios admins**: se elimina normalmente
- **Sin organizaciones**: se elimina normalmente
- **Organizaciones sin suscripción**: se elimina normalmente

### 3. Qué borra y qué conserva

#### Se borra o anonimiza:
- ✅ Nombre, apellido, teléfono, avatar, departamento
- ✅ Preferencias personales (metadata)
- ✅ Acceso a organizaciones (marca inactivo)
- ✅ Usuario de Supabase Auth (libera el correo)
- ✅ Avatar del storage

#### Se conserva (obligación legal):
- 🔒 Facturas de venta (`invoice_sales`)
- 🔒 Facturas de compra (`invoice_purchase`)
- 🔒 Asientos contables (`accounting_entries`)
- 🔒 Movimientos financieros (`payments`, `cash_movements`)
- 🔒 Cuentas por cobrar/pagar (`accounts_receivable`, `accounts_payable`)
- 🔒 Documentos de soporte
- 🔒 Referencia de `user_id` en membresías (anonimizada pero sin romper FK)

#### Auditoría (sin datos personales):
- ✅ `user_id`, `email`, fechas, acciones tomadas
- ✅ IDs de organizaciones donde pertenecía
- ✅ Referencia a datos retenidos: `{"invoices": [123, 456]}`
- ❌ NO nombres, teléfonos, ni datos identificables

### 4. Configuración necesaria

#### Variables de entorno (ya existentes):
- `CRON_SECRET` - Protege el endpoint del cron
- `RESEND_API_KEY` - Para enviar correos
- `RESEND_FROM_EMAIL` - Email remitente (default: `noreply@goadmin.io`)
- `SUPABASE_SERVICE_ROLE_KEY` - Para operaciones de servicio

#### Cron de Vercel
```json
{
  "path": "/api/cron/process-account-deletions",
  "schedule": "0 4 * * *"
}
```
**Ya agregado** en `vercel.json`. Ejecuta cada día a las 4 AM UTC.

### 5. Testing

Archivo: `src/lib/services/__tests__/accountDeletionService.test.ts`

Verifica:
- ✅ Obtención de cuentas pendientes filtradas por plazo
- ✅ Bloqueo de único admin con suscripción activa
- ✅ Anonimización correcta del perfil
- ✅ Cumplimiento del plazo de 10 días
- ✅ Conservación de datos legales (NO elimina facturas)
- ✅ Auditoría sin datos personales

**Comando:**
```bash
npm test -- accountDeletionService
```

### 6. Verificación antes de merge

```bash
# Tests
npm test

# TypeScript
npx tsc --noEmit -p tsconfig.json

# Build
npx next build

# Lint (solo archivos nuevos)
npx eslint src/lib/services/accountDeletion*.ts src/app/api/cron/process-account-deletions/ src/app/api/account-deletion/
```

## Archivos creados/modificados

### Nuevos
- `supabase/migrations/20260930235000_account_deletion_gdpr_compliance.sql`
- `supabase/rollbacks/20260930235000_account_deletion_gdpr_compliance_rollback.sql`
- `src/lib/services/accountDeletionService.ts`
- `src/lib/services/accountDeletionEmails.ts`
- `src/app/api/cron/process-account-deletions/route.ts`
- `src/app/api/account-deletion/request-notification/route.ts`
- `src/lib/services/__tests__/accountDeletionService.test.ts`

### Modificados
- `src/components/profile/EliminarCuentaSection.tsx` (mensaje legal + columna correcta)
- `vercel.json` (nuevo cron)

## Revisión Legal pendiente

⚠️ **IMPORTANTE**: El texto del correo usa la frase exacta proporcionada pero debe ser revisado por Legal antes de merge:

> Eliminaremos tus datos personales en un plazo máximo de 15 días hábiles. Conservaremos solo lo que la ley nos obliga a guardar, como la facturación y la contabilidad, por 10 años.

## Despliegue

1. **NO ejecutar la migración en producción manualmente** - se aplicará automáticamente
2. Verificar que `CRON_SECRET` esté configurado en Vercel
3. Verificar que `RESEND_API_KEY` esté configurado
4. El cron se activará automáticamente al hacer merge

## Testing manual

1. **Solicitar eliminación**:
   - Login → Mi perfil → Eliminar cuenta
   - Completar el flujo de 4 confirmaciones
   - Verificar que llega el correo de solicitud
   - Verificar que `deletion_requested_at` se guarda en BD

2. **Simular procesamiento** (en desarrollo):
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" \
        "http://localhost:3000/api/cron/process-account-deletions?daysAfter=0"
   ```

3. **Verificar en BD**:
   ```sql
   -- Ver solicitudes pendientes
   SELECT * FROM get_pending_account_deletions(0);
   
   -- Ver auditoría
   SELECT * FROM account_deletion_audit ORDER BY deletion_completed_at DESC LIMIT 5;
   
   -- Verificar anonimización
   SELECT id, email, first_name, last_name, status FROM profiles WHERE status = 'pending_deletion';
   ```

## Deuda técnica / Mejoras futuras

- [ ] Dashboard de administración para ver solicitudes pendientes y omitidas
- [ ] Notificación a admins cuando se omite por ser único propietario
- [ ] Cálculo real de días hábiles de Colombia (hoy usa 10 días calendario)
- [ ] Proceso de cancelación de solicitud desde el correo
- [ ] Métricas de eliminaciones en el dashboard de admin

## Referencias

- Política de datos: se publica 2-oct-2026
- Auditoría de perfil: `docs/design/AUDITORIA-CONTROLES-PERFIL-CAJAS.md` §A.10.8
- GDPR Art. 17 (derecho al olvido)
- Código de Comercio de Colombia (retención 10 años)
