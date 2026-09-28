/**
 * GO-sec 2026-09-28, punto 6.
 *
 * payment_qr_sessions: lectura por pertenencia estándar (antes
 *    current_setting('app.current_organization_id'), que nadie fija: la página
 *    salía vacía). Probado en la base viva (transacción deshecha): service role
 *    escribe; miembro lee las de su organización (con y sin sucursal) y no
 *    escribe; miembro de otra organización lee 0; anon sin privilegios.
 */
import * as fs from 'fs';
import * as path from 'path';

const RAIZ = path.resolve(__dirname, '..', '..', '..');
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), 'utf-8');

describe('payment_qr_sessions', () => {
  const base = '20260928175231_gosec_payment_qr_sessions_lectura_por_pertenencia';
  const sql = leer(`supabase/migrations/${base}.sql`);

  test('migración con rollback', () => {
    expect(fs.existsSync(path.join(RAIZ, 'supabase', 'rollbacks', `${base}_rollback.sql`))).toBe(true);
  });

  test('pertenencia estándar, sin current_setting, solo lectura desde el cliente', () => {
    expect(sql).toMatch(/drop policy if exists payment_qr_sessions_org_isolation/);
    const politica = /create policy payment_qr_sessions_lectura_miembros[\s\S]*?;/.exec(sql)?.[0] ?? '';
    expect(politica).toMatch(/for select to authenticated/);
    expect(politica).toMatch(/om\.user_id = \(select auth\.uid\(\)\) and om\.is_active/);
    expect(politica).not.toMatch(/current_setting/);
    expect(sql).toMatch(/revoke all on table public\.payment_qr_sessions from anon/);
    expect(sql).toMatch(/revoke insert, update, delete, truncate on table public\.payment_qr_sessions from authenticated/);
    // La restrictiva por sucursal se conserva: la migración no la toca.
    expect(sql).not.toMatch(/drop policy if exists branch_access_restrictive/);
  });

  test('quien escribe sesiones QR lo hace con service role; la página solo lee', () => {
    for (const f of [
      'src/lib/services/integrations/qrShared/qrSessionService.ts',
      'src/lib/services/integrations/qrShared/paymentConfirmation.ts',
      'src/app/api/integrations/qr/expire-sessions/route.ts',
    ]) {
      expect(leer(f)).toMatch(/getSupabaseAdmin|getServiceClient/);
    }
    const pagina = leer('src/app/app/finanzas/metodos-pago/qr-sessions/page.tsx');
    expect(pagina).not.toMatch(/from\('payment_qr_sessions'\)[\s\S]{0,120}\.(insert|update|upsert|delete)\(/);
  });
});
