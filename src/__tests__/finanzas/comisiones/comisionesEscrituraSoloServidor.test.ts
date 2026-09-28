/// <reference types="jest" />
/**
 * Pendiente 1 (docs/hallazgos/comisiones-e-impuestos-2026-09-28.md): la
 * política commissions_org_member_all (ALL) y los GRANT de anon/authenticated
 * dejaban a cualquier miembro —un vendedor— cambiar por API el estado o el
 * importe de sus comisiones. Migración 20260928213000: lectura por
 * pertenencia (sin gestión, solo las suyas, como GET /api/crm/commissions),
 * authenticated solo SELECT, anon nada; las transiciones por
 * fn_comision_aplicar_transicion y la nómina por fn_comisiones_pagar_por_nomina.
 *
 * Probado por MCP en un DO … RAISE que se deshace, con `set local role
 * authenticated`: el admin ve 208/208 de su organización; UPDATE directo →
 * 42501 (admin y empleado); campo ajeno → campo_no_permitido; paid→paid →
 * transicion_invalida; cuenta de otra organización → cuenta_bancaria_invalida;
 * cancelar sin motivo → motivo_obligatorio; pago por la RPC → 1 fila, 1 asiento
 * de pago, payroll_slip_id descartado y paid_by estampado; el empleado ve 0 de
 * las ajenas y la RPC le responde sin_permiso.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { transitionCommission } from '@/lib/services/crm/commissionAdminService';
import { CommissionTransitionError } from '@/lib/services/crm/commissionTransitions';
import { STAGE_MANAGER_ROLE_IDS } from '@/lib/services/crm/stagePermissions';

const raiz = process.cwd();
const leer = (p: string) => readFileSync(join(raiz, p), 'utf8');
const sinComentarios = (s: string) => s.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
const MIG = sinComentarios(leer('supabase/migrations/20260928213000_comisiones_escritura_solo_servidor.sql'));

function archivos(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) {
      if (n === '__tests__' || n === 'node_modules') continue;
      archivos(p, out);
    } else if (/\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n)) {
      out.push(p);
    }
  }
  return out;
}

describe('guardarraíl: nadie escribe commissions desde Node ni el navegador', () => {
  it('ningún archivo de src hace insert/update/upsert/delete sobre commissions', () => {
    const culpables = archivos(join(raiz, 'src')).filter((f) => {
      const src = readFileSync(f, 'utf8').replace(/\s+/g, ' ');
      return /\.from\(['"]commissions['"]\)\s*\.(insert|update|upsert|delete)\(/.test(src);
    });
    expect(culpables).toEqual([]);
  });
});

describe('migración: lectura por pertenencia, escritura solo por RPC', () => {
  it('anon sin nada; authenticated solo SELECT; sin la política ALL', () => {
    expect(MIG).toMatch(/revoke all on table public\.commissions from anon;/);
    expect(MIG).toMatch(/revoke insert, update, delete, truncate, references, trigger on table public\.commissions from authenticated;/);
    expect(MIG).toMatch(/grant select on table public\.commissions to authenticated;/);
    expect(MIG).toMatch(/drop policy if exists commissions_org_member_all on public\.commissions;/);
    expect(MIG).not.toMatch(/create policy[^;]*for (all|insert|update|delete)/i);
  });

  it('sin gestión, solo las suyas (payee_id = auth.uid()), como la ruta', () => {
    expect(MIG).toMatch(/for select to authenticated/);
    expect(MIG).toMatch(/payee_id = \(select auth\.uid\(\)\)\s+or organization_id in \(select public\.fn_comisiones_orgs_ver_todas\(\)\)/);
  });

  it('«gestor» en la base es la misma regla que canManageCommissions (roles 1, 2, 5 o superadmin)', () => {
    expect([...STAGE_MANAGER_ROLE_IDS]).toEqual([1, 2, 5]);
    expect(MIG).toMatch(/coalesce\(om\.is_super_admin, false\) or om\.role_id in \(1, 2, 5\)\)\);/);
  });

  it('la transición exige gestor, transición válida, campos permitidos y no deja fijar payroll_slip_id', () => {
    const fn = MIG.slice(MIG.indexOf('function public.fn_comision_aplicar_transicion'), MIG.indexOf('function public.fn_comisiones_pagar_por_nomina'));
    expect(fn).toMatch(/if not public\.fn_comisiones_es_gestor\(p_org\) then\s+raise exception 'sin_permiso'/);
    expect(fn).toMatch(/v_clave not in \('status', 'paid_at', 'notes', 'metadata', 'updated_at'\)/);
    expect(fn).toMatch(/\(p_desde = 'accrued' and v_hacia in \('paid', 'cancelled'\)\) or \(p_desde = 'paid' and v_hacia = 'cancelled'\)/);
    expect(fn).toMatch(/\(\(p_cambios->'metadata'\) - 'payroll_slip_id'\)/);
    expect(fn).toMatch(/where c\.id = p_id and c\.organization_id = p_org and c\.status = p_desde/);
    expect(fn).not.toMatch(/commission_amount|base_amount|payee_id/);
  });

  it('las RPC nuevas no se abren a anon', () => {
    for (const f of ['fn_comisiones_es_gestor(integer)', 'fn_comisiones_orgs_ver_todas()', 'fn_comision_aplicar_transicion(integer, uuid, text, jsonb)', 'fn_comisiones_pagar_por_nomina(uuid)']) {
      expect(MIG).toContain(`revoke all on function public.${f} from public, anon;`);
    }
  });
});

describe('commissionAdminService: los rechazos de la base conservan su código HTTP', () => {
  function cliente(error: { code: string; message: string }) {
    return {
      from: () => {
        const q: Record<string, unknown> = {};
        q.select = () => q; q.eq = () => q;
        q.maybeSingle = async () => ({ data: { id: 'c-1', status: 'accrued', paid_at: null, metadata: null, notes: null, organization_id: 120 }, error: null });
        return q;
      },
      rpc: () => ({ select: () => ({ maybeSingle: async () => ({ data: null, error }) }) }),
    } as never;
  }

  it.each([
    ['sin_permiso', '42501', 403, 'MANAGER_REQUIRED'],
    ['cuenta_bancaria_invalida', '22023', 400, 'BANK_ACCOUNT_INVALID'],
    ['transicion_invalida', '22023', 409, 'INVALID_TRANSITION'],
  ])('%s → %i', async (message, code, statusCode, codigo) => {
    const p = transitionCommission('pay', 'c-1', 120, cliente({ code, message }));
    await expect(p).rejects.toBeInstanceOf(CommissionTransitionError);
    await expect(transitionCommission('pay', 'c-1', 120, cliente({ code, message }))).rejects.toMatchObject({ statusCode, code: codigo });
  });

  it('otro error de la base sigue siendo error de base (502 en la ruta)', async () => {
    await expect(transitionCommission('pay', 'c-1', 120, cliente({ code: 'XX000', message: 'boom' }))).rejects.toMatchObject({ code: 'XX000' });
  });
});
