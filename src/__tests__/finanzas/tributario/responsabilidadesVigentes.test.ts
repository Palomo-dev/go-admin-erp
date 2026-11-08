/**
 * H2 · Responsabilidades del RUT vigentes en la fecha del documento.
 * `fn_responsabilidades_fiscales_en(org, fecha)` (migración 20261108140500,
 * sin aplicar) da las de la vigencia que rige; si no existe todavía, o falla,
 * el documento usa la ficha de la organización, como antes.
 */
import { fakeSupabase } from '@/lib/documents/__tests__/fakeSupabase';
import { cargarBase, diaDelDocumento } from '@/lib/documents/server/base';
import {
  esDiaCalendario,
  normalizarResponsabilidades,
  responsabilidadesFiscalesEn,
} from '@/lib/finanzas/tributario/responsabilidadesVigentes';

const ORG = 374;

/** Perfil por vigencias como lo resuelve la función SQL: 2026 → {O-48, O-23}; desde 2027 → {O-47}. */
function perfilEn(dia: string | null): string[] | null {
  if (!dia) return ['O-48', 'O-23'];
  if (dia >= '2027-01-01') return ['O-47'];
  if (dia >= '2026-01-01') return ['O-48', 'O-23'];
  return null;
}

function tablas(fiscal: string[] | null = ['O-13']) {
  return {
    organizations: [{ id: ORG, name: 'Empresa de prueba', legal_name: 'Empresa de prueba S.A.S.', nit: '900123456', dv: 7, timezone: 'America/Bogota', fiscal_responsibilities: fiscal }],
    branches: [{ id: 1, organization_id: ORG, name: 'Sede', timezone: null }],
    organization_settings: [],
  };
}

function sesion(rpc?: (args: Record<string, unknown>) => unknown, fiscal: string[] | null = ['O-13']) {
  const llamadas: Array<Record<string, unknown>> = [];
  const supabase = fakeSupabase(tablas(fiscal), rpc
    ? {
        fn_responsabilidades_fiscales_en: (args) => {
          llamadas.push(args);
          return rpc(args);
        },
      }
    : {});
  return { s: { userId: 'u-1', organizationId: ORG, roleId: 5, isSuperAdmin: false, supabase: supabase as never }, llamadas };
}

beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => undefined));
afterEach(() => jest.restoreAllMocks());

describe('responsabilidadesFiscalesEn', () => {
  const cliente = (r: { data: unknown; error: { code?: string; message?: string } | null }) => ({
    rpc: jest.fn(async () => r),
  });

  it('usa la vigencia que devuelve la base y le pasa el día', async () => {
    const db = cliente({ data: ['O-47', ' ', 'O-15 '], error: null });
    await expect(responsabilidadesFiscalesEn(db, ORG, '2027-01-01', ['O-13'])).resolves.toEqual(['O-47', 'O-15']);
    expect(db.rpc).toHaveBeenCalledWith('fn_responsabilidades_fiscales_en', { p_organization_id: ORG, p_fecha: '2027-01-01' });
  });

  it('función sin aplicar (PGRST202): la ficha, sin ruido', async () => {
    const db = cliente({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
    await expect(responsabilidadesFiscalesEn(db, ORG, '2027-01-01', ['O-13'])).resolves.toEqual(['O-13']);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('otro error: la ficha, con aviso en el registro', async () => {
    const db = cliente({ data: null, error: { code: '57014', message: 'timeout' } });
    await expect(responsabilidadesFiscalesEn(db, ORG, null, ['O-13'])).resolves.toEqual(['O-13']);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it('la base no devuelve nada (RLS): la ficha', async () => {
    await expect(responsabilidadesFiscalesEn(cliente({ data: null, error: null }), ORG, null, ['O-13'])).resolves.toEqual(['O-13']);
    await expect(responsabilidadesFiscalesEn(cliente({ data: null, error: null }), ORG, null, null)).resolves.toEqual([]);
  });

  it('un día mal formado no viaja a la base: va NULL (= hoy en la zona de la organización)', async () => {
    const db = cliente({ data: ['O-48'], error: null });
    await responsabilidadesFiscalesEn(db, ORG, '2027-01-01T03:00:00Z', []);
    expect(db.rpc).toHaveBeenCalledWith('fn_responsabilidades_fiscales_en', { p_organization_id: ORG, p_fecha: null });
  });

  it('normaliza y valida', () => {
    expect(normalizarResponsabilidades('O-13')).toBeNull();
    expect(normalizarResponsabilidades([1, ' O-13 ', ''])).toEqual(['O-13']);
    expect(esDiaCalendario('2026-11-07')).toBe(true);
    expect(esDiaCalendario('2026-11-07T00:00:00Z')).toBe(false);
  });
});

describe('diaDelDocumento: el día de la fecha de emisión en la zona de la organización', () => {
  it('un instante de la madrugada UTC es el día anterior en Bogotá', () => {
    expect(diaDelDocumento('2027-01-01T03:00:00Z', 'America/Bogota')).toBe('2026-12-31');
    expect(diaDelDocumento('2027-01-01T05:00:00Z', 'America/Bogota')).toBe('2027-01-01');
    expect(diaDelDocumento('2027-01-01T03:00:00Z', 'UTC')).toBe('2027-01-01');
  });
  it('un día calendario se respeta; sin fecha o ilegible: NULL', () => {
    expect(diaDelDocumento('2026-11-07', 'America/Bogota')).toBe('2026-11-07');
    expect(diaDelDocumento(null, 'America/Bogota')).toBeNull();
    expect(diaDelDocumento('no-es-fecha', 'America/Bogota')).toBeNull();
  });
});

describe('cargarBase: emisor del documento electrónico', () => {
  it('sin fecha del documento: la ficha, y no consulta el perfil (documentos que no son FE)', async () => {
    const { s, llamadas } = sesion((a) => perfilEn(a.p_fecha as string | null));
    const base = await cargarBase(s, 1);
    expect(base.emisor.responsabilidades).toEqual(['O-13']);
    expect(llamadas).toHaveLength(0);
  });

  it('con fecha: las vigentes ese día en la zona de la organización', async () => {
    const { s, llamadas } = sesion((a) => perfilEn(a.p_fecha as string | null));
    // 2027-01-01 03:00 UTC = 31 de diciembre de 2026 en Bogotá: rige la vigencia de 2026.
    const b2026 = await cargarBase(s, 1, { fechaDocumento: '2027-01-01T03:00:00Z' });
    expect(b2026.emisor.responsabilidades).toEqual(['O-48', 'O-23']);
    expect(llamadas[0]).toEqual({ p_organization_id: ORG, p_fecha: '2026-12-31' });
    const b2027 = await cargarBase(s, 1, { fechaDocumento: '2027-01-02T15:00:00Z' });
    expect(b2027.emisor.responsabilidades).toEqual(['O-47']);
  });

  it('caracterización: sin perfil, mismo resultado que antes del cambio', async () => {
    // La función SQL cae a organizations.fiscal_responsibilities: devuelve la ficha.
    const conFuncion = sesion(() => ['O-13']);
    const sinFuncion = sesion(undefined); // migración sin aplicar: la RPC falla
    const antes = await cargarBase(sesion(undefined).s, 1);
    const despues1 = await cargarBase(conFuncion.s, 1, { fechaDocumento: '2026-11-07T15:00:00Z' });
    const despues2 = await cargarBase(sinFuncion.s, 1, { fechaDocumento: '2026-11-07T15:00:00Z' });
    expect(despues1.emisor).toEqual(antes.emisor);
    expect(despues2.emisor).toEqual(antes.emisor);
  });
});
