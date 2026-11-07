/**
 * Finanzas ronda 2: reglas de la cuenta de abono de PayFac en el SERVIDOR.
 * - A9: la única cuenta verificada no se quita con dispersiones pendientes (409).
 * - A10: el titular de la cuenta tiene que ser la organización (422).
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  baseDocumento,
  motivoNoQuitarCuentaAbono,
  normalizarNombreTitular,
  titularCoincideConOrganizacion,
} from '../cuentaAbonoReglas';

// ─── Base doble para payoutService (getSupabaseAdmin) ────────────────────────
type Row = Record<string, unknown>;
let tablas: Record<string, Row[]>;
const actualizaciones: Array<{ tabla: string; payload: Row }> = [];
const inserciones: Array<{ tabla: string; payload: Row }> = [];

function db() {
  return {
    from(tabla: string) {
      const filtros: Array<(r: Row) => boolean> = [];
      let op: 'select' | 'update' | 'insert' = 'select';
      let payload: Row = {};
      let conteo = false;
      const filas = () => (tablas[tabla] ?? []).filter((r) => filtros.every((f) => f(r)));
      const b = {
        select: (_c?: string, o?: { count?: string; head?: boolean }) => ((conteo = Boolean(o?.head)), b),
        eq: (c: string, v: unknown) => (filtros.push((r) => String(r[c]) === String(v)), b),
        neq: (c: string, v: unknown) => (filtros.push((r) => String(r[c]) !== String(v)), b),
        in: (c: string, v: unknown[]) => (filtros.push((r) => v.includes(r[c])), b),
        update: (p: Row) => ((op = 'update'), (payload = p), b),
        insert: (p: Row) => ((op = 'insert'), (payload = p), b),
        maybeSingle: async () => ({ data: filas()[0] ?? null, error: null }),
        single: async () => {
          if (op === 'insert') {
            inserciones.push({ tabla, payload });
            return { data: { id: 'pa-nueva' }, error: null };
          }
          return { data: filas()[0] ?? null, error: null };
        },
        then: (ok: (v: unknown) => unknown) => {
          if (op === 'update') {
            actualizaciones.push({ tabla, payload });
            return Promise.resolve({ error: null }).then(ok);
          }
          const rs = filas();
          return Promise.resolve({ data: conteo ? null : rs, count: rs.length, error: null }).then(ok);
        },
      };
      return b;
    },
  };
}
jest.mock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: () => db() }));

import { payoutService } from '../payoutService';

beforeEach(() => {
  actualizaciones.length = 0;
  inserciones.length = 0;
  tablas = {
    organizations: [
      { id: 120, name: 'Tienda de ejemplo', legal_name: 'Tienda de Ejemplo S.A.S.', nit: '900.123.456-7', tax_id: null },
      { id: 121, name: 'Otra', legal_name: 'Otra Org Ltda.', nit: null, tax_id: null },
    ],
    organization_payout_accounts: [
      { id: 'pa-1', organization_id: 120, is_verified: true, is_active: true },
      { id: 'pa-2', organization_id: 120, is_verified: false, is_active: true },
    ],
    organization_payouts: [{ id: 'po-1', organization_id: 120, status: 'pending' }],
  };
});

describe('regla pura: quitar la cuenta de abono', () => {
  test('bloquea solo la única verificada con dispersiones pendientes', () => {
    expect(motivoNoQuitarCuentaAbono({ verificada: true, otrasVerificadas: 0, dispersionesPendientes: 2 })).toBe('unica_verificada_con_pendientes');
    expect(motivoNoQuitarCuentaAbono({ verificada: true, otrasVerificadas: 1, dispersionesPendientes: 2 })).toBeNull();
    expect(motivoNoQuitarCuentaAbono({ verificada: true, otrasVerificadas: 0, dispersionesPendientes: 0 })).toBeNull();
    expect(motivoNoQuitarCuentaAbono({ verificada: false, otrasVerificadas: 0, dispersionesPendientes: 5 })).toBeNull();
  });
});

describe('regla pura: el titular es la organización', () => {
  test('normaliza nombres y documentos', () => {
    expect(normalizarNombreTitular('Mi Empresa S.A.S.')).toBe('MIEMPRESASAS');
    expect(normalizarNombreTitular('Compañía Ñandú')).toBe('COMPANIANANDU');
    expect(baseDocumento('900.123.456-7')).toBe('900123456');
    expect(baseDocumento('900123456')).toBe('900123456');
  });

  test('con NIT manda el documento (con o sin dígito de verificación)', () => {
    const org = { legal_name: 'Tienda de Ejemplo S.A.S.', nit: '900.123.456-7' };
    expect(titularCoincideConOrganizacion({ nombre: 'Cualquiera', documento: '900123456' }, org)).toBe(true);
    expect(titularCoincideConOrganizacion({ nombre: 'Cualquiera', documento: '900.123.456-7' }, org)).toBe(true);
    expect(titularCoincideConOrganizacion({ nombre: 'Tienda de ejemplo SAS', documento: '9001234567' }, org)).toBe(true);
    expect(titularCoincideConOrganizacion({ nombre: 'Tienda de Ejemplo S.A.S.', documento: '80123456' }, org)).toBe(false);
  });

  test('sin NIT manda el nombre (razón social o nombre)', () => {
    const org = { name: 'Otra', legal_name: 'Otra Org Ltda.', nit: null, tax_id: '' };
    expect(titularCoincideConOrganizacion({ nombre: 'otra org ltda', documento: '1' }, org)).toBe(true);
    expect(titularCoincideConOrganizacion({ nombre: 'OTRA', documento: '1' }, org)).toBe(true);
    expect(titularCoincideConOrganizacion({ nombre: 'Persona Natural', documento: '1' }, org)).toBe(false);
    expect(titularCoincideConOrganizacion({ nombre: '', documento: '1' }, org)).toBe(false);
  });
});

describe('payoutService.deactivateAccount (servidor)', () => {
  test('la única verificada con dispersiones pendientes NO se desactiva', async () => {
    const r = await payoutService.deactivateAccount(null, 'pa-1');
    expect(r).toEqual({ success: false, codigo: 'unica_verificada_con_pendientes' });
    expect(actualizaciones).toEqual([]);
  });

  test('con otra verificada sí se desactiva', async () => {
    tablas.organization_payout_accounts[1].is_verified = true;
    const r = await payoutService.deactivateAccount(null, 'pa-1');
    expect(r).toEqual({ success: true });
    expect(actualizaciones).toEqual([{ tabla: 'organization_payout_accounts', payload: expect.objectContaining({ is_active: false }) }]);
  });

  test('sin dispersiones pendientes sí se desactiva', async () => {
    tablas.organization_payouts[0].status = 'completed';
    expect(await payoutService.deactivateAccount(null, 'pa-1')).toEqual({ success: true });
  });

  test('una cuenta sin verificar se desactiva aunque haya pendientes', async () => {
    expect(await payoutService.deactivateAccount(null, 'pa-2')).toEqual({ success: true });
  });

  test('cuenta inexistente → sin éxito y sin escribir', async () => {
    expect(await payoutService.deactivateAccount(null, 'pa-x')).toEqual({ success: false });
    expect(actualizaciones).toEqual([]);
  });
});

describe('payoutService.createAccount (servidor)', () => {
  const entrada = {
    bankName: 'Banco',
    accountType: 'savings',
    accountNumber: '0000004321',
    accountHolderName: 'Tienda de Ejemplo S.A.S.',
    accountHolderId: '900123456-7',
    accountHolderIdType: 'NIT',
  };

  test('titular de la organización → crea', async () => {
    expect(await payoutService.createAccount(null, entrada, 120)).toEqual({ id: 'pa-nueva' });
    expect(inserciones[0].payload).toEqual(expect.objectContaining({ organization_id: 120, is_verified: false }));
  });

  test('titular ajeno → titular_no_coincide y no inserta', async () => {
    const r = await payoutService.createAccount(null, { ...entrada, accountHolderId: '80123456', accountHolderIdType: 'CC' }, 120);
    expect(r.codigo).toBe('titular_no_coincide');
    expect(inserciones).toEqual([]);
  });

  test('organización sin NIT: compara la razón social', async () => {
    expect((await payoutService.createAccount(null, { ...entrada, accountHolderName: 'Otra Org Ltda', accountHolderId: '1' }, 121)).id).toBe('pa-nueva');
    expect((await payoutService.createAccount(null, { ...entrada, accountHolderName: 'Un tercero', accountHolderId: '1' }, 121)).codigo).toBe('titular_no_coincide');
  });
});

describe('rutas', () => {
  const RAIZ = path.resolve(__dirname, '..', '..', '..', '..', '..', '..');
  const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), 'utf-8');

  test('DELETE responde 409 con el código; POST responde 422 con el código', () => {
    const del = leer('src/app/api/integrations/payfac/payout-accounts/[id]/route.ts');
    expect(del).toMatch(/result\.codigo === UNICA_VERIFICADA_CON_PENDIENTES[\s\S]{0,300}status: 409/);
    const post = leer('src/app/api/integrations/payfac/payout-accounts/route.ts');
    expect(post).toMatch(/account\.codigo === TITULAR_NO_COINCIDE[\s\S]{0,300}status: 422/);
  });
});
