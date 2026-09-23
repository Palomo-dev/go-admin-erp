// ============================================================================
// Fase B, tanda 0 — el resolutor de zona de la capa de servicios (ADR-003)
// ============================================================================
// `resolveTimezone(organizationId, branchId?)` tiene que dar EXACTAMENTE lo
// mismo que `fn_timezone_for(p_organization_id, p_branch_id)` en Postgres. Si
// discrepan, el mismo dato tiene dos días según quién lo calcule: el servicio
// escribe un vencimiento con la zona de la organización y el trigger de la base
// lo recalcula con la de la sucursal (o al revés). Es el bug de la ronda 2.
//
// Cómo se compara, y por qué así:
//
//   1. **Datos reales, leídos por MCP en solo lectura el 2026-09-23.** Son
//      honestos pero NO discriminan: las 85 organizaciones y las 90 sucursales
//      están en `America/Bogota` y ninguna sucursal tiene override, así que
//      cualquier implementación rota —cascada invertida incluida— pasaría. Se
//      conservan como ancla de regresión, y esta nota está aquí para que nadie
//      confunda «verde» con «probado».
//   2. **Matriz sintética contra un oráculo transcrito del `.sql` real.**
//      `fnTimezoneForSQL` es la transcripción del cuerpo de `fn_timezone_for`
//      (migración 20260923200000). Para que la transcripción no se quede vieja
//      en silencio, el test LEE la migración y exige que sigan ahí los cuatro
//      pasos en los que se apoya. Si alguien cambia el SQL, estos casos caen.
//
// La matriz mete a propósito zonas de signo contrario y con DST (Madrid,
// Kiritimati, Mexico_City) para que el resultado no pueda acertar por
// coincidir con el default colombiano.
// ============================================================================

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Dobles de las dos lecturas cacheadas. El resolutor no debe hacer nada más.
// ---------------------------------------------------------------------------
const dobles = {
  zonaOrganizacion: new Map<number, string>(),
  sucursales: new Map<number, Record<number, string | null>>(),
  llamadasOrg: 0,
  llamadasSucursales: 0,
  invalidacionesOrg: [] as Array<number | undefined>,
  invalidacionesSucursal: [] as Array<number | undefined>,
};

jest.mock('@/lib/services/organizationTimezoneService', () => ({
  getOrganizationTimezone: async (orgId: number): Promise<string> => {
    dobles.llamadasOrg += 1;
    return dobles.zonaOrganizacion.get(orgId) ?? 'America/Bogota';
  },
  invalidateTimezoneCache: (orgId?: number): void => {
    dobles.invalidacionesOrg.push(orgId);
  },
}));

jest.mock('@/lib/services/branchTimezoneService', () => ({
  getBranchTimezones: async (orgId: number): Promise<Record<number, string | null>> => {
    dobles.llamadasSucursales += 1;
    return dobles.sucursales.get(orgId) ?? {};
  },
  invalidateBranchTimezoneCache: (orgId?: number): void => {
    dobles.invalidacionesSucursal.push(orgId);
  },
  TIMEZONES_UPDATED_EVENT: 'timezones-updated',
}));

import {
  resolveTimezone,
  resolveTimezoneWithSource,
  invalidateResolvedTimezone,
} from '@/lib/services/timezoneResolver';

const DEFECTO = 'America/Bogota';
const RAIZ = join(__dirname, '..', '..', '..');
const SQL_CASCADA = readFileSync(
  join(RAIZ, 'supabase/migrations/20260923200000_zona_horaria_por_sucursal.sql'),
  'utf8',
);

beforeEach(() => {
  dobles.zonaOrganizacion.clear();
  dobles.sucursales.clear();
  dobles.llamadasOrg = 0;
  dobles.llamadasSucursales = 0;
  invalidateResolvedTimezone();
  // Después de invalidar: la propia llamada anota una invalidacion global.
  dobles.invalidacionesOrg = [];
  dobles.invalidacionesSucursal = [];
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Oráculo: transcripción del cuerpo de fn_timezone_for
// ---------------------------------------------------------------------------

function esZonaUsable(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Transcripción del cuerpo real de `fn_timezone_for`:
 *   1) sucursal (solo si pertenece a la organización pedida);
 *   2) `organizations.timezone` si la sucursal no aportó NADA;
 *   2bis) legado `organization_settings.key='calendar'`;
 *   3) `'America/Bogota'` si nadie aportó;
 *   4) lo aportado se descarta a favor del default si Postgres no lo reconoce.
 *
 * El matiz que se paga caro: un valor PRESENTE pero ilegible **corta** la
 * cascada (paso 4) en vez de bajar al nivel siguiente, porque el paso 2 solo
 * mira la organización cuando `v_tz is null or btrim(v_tz) = ''`.
 */
export function fnTimezoneForSQL(entrada: {
  branchTimezone?: string | null;
  organizationTimezone?: string | null;
  legacyTimezone?: string | null;
}): string {
  const vacio = (v: string | null | undefined): boolean =>
    v === null || v === undefined || v.trim() === '';

  let tz: string | null | undefined = entrada.branchTimezone;
  if (vacio(tz)) tz = entrada.organizationTimezone;
  if (vacio(tz)) tz = entrada.legacyTimezone;
  if (vacio(tz)) return DEFECTO;

  const valor = (tz as string).trim();
  return esZonaUsable(valor) ? valor : DEFECTO;
}

describe('el oráculo sigue describiendo el SQL vigente', () => {
  it('la migración conserva los cuatro pasos que transcribe el oráculo', () => {
    expect(SQL_CASCADA).toContain('select b.timezone into v_tz');
    expect(SQL_CASCADA).toContain('b.organization_id = p_organization_id');
    expect(SQL_CASCADA).toContain('select o.timezone into v_tz');
    expect(SQL_CASCADA).toContain("os.key = 'calendar'");
    expect(SQL_CASCADA).toContain("return 'America/Bogota'");
    // El paso 2 solo entra si la sucursal no aportó NADA: eso es lo que hace
    // que una zona rota corte la cascada en vez de heredar.
    expect(SQL_CASCADA).toContain("if v_tz is null or btrim(v_tz) = '' then");
    expect(SQL_CASCADA).toContain('v_prueba := (now() at time zone v_tz)::date;');
  });

  it('una zona inválida en la organización no puede llegar a la columna', () => {
    // Por eso el oráculo puede tratar `organizations.timezone` como válido: la
    // escritura ya la valida un trigger (migración 20260915235500).
    const validacion = readFileSync(
      join(RAIZ, 'supabase/migrations/20260915235500_crm_v4_f00_44_organizations_timezone_valida.sql'),
      'utf8',
    );
    expect(validacion).toContain('create trigger trg_validate_org_timezone');
  });
});

// ---------------------------------------------------------------------------
// Matriz sintética: resolutor vs. oráculo
// ---------------------------------------------------------------------------

interface Caso {
  nombre: string;
  branchTimezone: string | null;
  organizationTimezone: string;
}

const ORG = 120;
const SUCURSAL = 7;

const MATRIZ: Caso[] = [
  { nombre: 'sucursal sin override hereda', branchTimezone: null, organizationTimezone: 'Europe/Madrid' },
  { nombre: 'override manda sobre la organización', branchTimezone: 'Pacific/Kiritimati', organizationTimezone: 'Europe/Madrid' },
  { nombre: 'override con DST y signo contrario', branchTimezone: 'America/Mexico_City', organizationTimezone: 'Europe/Madrid' },
  { nombre: 'cadena vacía = heredar', branchTimezone: '', organizationTimezone: 'Europe/Madrid' },
  { nombre: 'solo espacios = heredar', branchTimezone: '   ', organizationTimezone: 'America/Mexico_City' },
  { nombre: 'zona rota en la sucursal corta la cascada', branchTimezone: 'Marte/Olympus', organizationTimezone: 'Europe/Madrid' },
  { nombre: 'organización y sucursal iguales', branchTimezone: 'Europe/Madrid', organizationTimezone: 'Europe/Madrid' },
  { nombre: 'organización en el default, sucursal fuera', branchTimezone: 'Asia/Kathmandu', organizationTimezone: DEFECTO },
];

describe('resolveTimezone coincide con fn_timezone_for', () => {
  it.each(MATRIZ)('$nombre', async ({ branchTimezone, organizationTimezone }) => {
    // `getOrganizationTimezone` devuelve, por contrato, lo que da
    // `fn_timezone_for(org, null)`: la organización más el legado más el default.
    dobles.zonaOrganizacion.set(ORG, fnTimezoneForSQL({ organizationTimezone }));
    dobles.sucursales.set(ORG, { [SUCURSAL]: branchTimezone });

    const esperado = fnTimezoneForSQL({ branchTimezone, organizationTimezone });
    await expect(resolveTimezone(ORG, SUCURSAL)).resolves.toBe(esperado);
  });

  it('sin sucursal devuelve la zona de la organización', async () => {
    dobles.zonaOrganizacion.set(ORG, 'Europe/Madrid');
    dobles.sucursales.set(ORG, { [SUCURSAL]: 'Pacific/Kiritimati' });
    await expect(resolveTimezone(ORG)).resolves.toBe('Europe/Madrid');
    await expect(resolveTimezone(ORG, null)).resolves.toBe('Europe/Madrid');
  });

  it('una sucursal desconocida hereda, no revienta', async () => {
    dobles.zonaOrganizacion.set(ORG, 'Europe/Madrid');
    dobles.sucursales.set(ORG, {});
    await expect(resolveTimezone(ORG, 999999)).resolves.toBe('Europe/Madrid');
  });

  it('dice de qué nivel salió la zona', async () => {
    dobles.zonaOrganizacion.set(ORG, 'Europe/Madrid');
    dobles.sucursales.set(ORG, { [SUCURSAL]: 'Pacific/Kiritimati' });
    await expect(resolveTimezoneWithSource(ORG, SUCURSAL)).resolves.toEqual({
      timezone: 'Pacific/Kiritimati',
      source: 'branch',
    });
    await expect(resolveTimezoneWithSource(ORG)).resolves.toEqual({
      timezone: 'Europe/Madrid',
      source: 'organization',
    });
  });
});

// ---------------------------------------------------------------------------
// Datos reales leídos por MCP (solo lectura) el 2026-09-23
// ---------------------------------------------------------------------------

/** (organización, sucursal, `branches.timezone`, `fn_timezone_for`). */
const REALES: Array<[number, number, string | null, string]> = [
  [1, 47, null, DEFECTO],
  [2, 2, null, DEFECTO],
  [2, 21, null, DEFECTO],
  [46, 16, null, DEFECTO],
  [85, 59, null, DEFECTO],
  [90, 64, null, DEFECTO],
];

describe('datos reales de la base (ancla de regresión, no discrimina)', () => {
  it.each(REALES)('org %s / sucursal %s', async (org, sucursal, override, esperado) => {
    dobles.zonaOrganizacion.set(org, DEFECTO);
    dobles.sucursales.set(org, { [sucursal]: override });
    await expect(resolveTimezone(org, sucursal)).resolves.toBe(esperado);
  });

  it('ids que no existen dan el default, igual que la función de la base', async () => {
    // `fn_timezone_for(999999, null)`, `(null, null)`, `(2, 999999)` → Bogotá.
    await expect(resolveTimezone(999999)).resolves.toBe(DEFECTO);
    await expect(resolveTimezone(2, 999999)).resolves.toBe(DEFECTO);
  });
});

// ---------------------------------------------------------------------------
// Robustez: nunca lanza, e ids que no sirven
// ---------------------------------------------------------------------------

describe('nunca lanza (se llama desde escrituras de dinero)', () => {
  it.each([0, -1, NaN, 1.5])('organizationId %p cae al default sin consultar', async (id) => {
    await expect(resolveTimezone(id as number)).resolves.toBe(DEFECTO);
    expect(dobles.llamadasOrg).toBe(0);
  });

  it('un fallo de la lectura devuelve el default y no se cachea', async () => {
    const servicio = jest.requireMock('@/lib/services/organizationTimezoneService');
    const original = servicio.getOrganizationTimezone;
    servicio.getOrganizationTimezone = async () => {
      throw new Error('RLS');
    };
    await expect(resolveTimezone(ORG)).resolves.toBe(DEFECTO);

    servicio.getOrganizationTimezone = original;
    dobles.zonaOrganizacion.set(ORG, 'Europe/Madrid');
    await expect(resolveTimezone(ORG)).resolves.toBe('Europe/Madrid');
  });
});

// ---------------------------------------------------------------------------
// Caché e invalidación
// ---------------------------------------------------------------------------

describe('caché', () => {
  it('no repite la consulta para la misma pareja', async () => {
    dobles.zonaOrganizacion.set(ORG, 'Europe/Madrid');
    dobles.sucursales.set(ORG, { [SUCURSAL]: 'Pacific/Kiritimati' });
    await Promise.all([resolveTimezone(ORG, SUCURSAL), resolveTimezone(ORG, SUCURSAL)]);
    await resolveTimezone(ORG, SUCURSAL);
    expect(dobles.llamadasOrg).toBe(1);
    expect(dobles.llamadasSucursales).toBe(1);
  });

  it('sin sucursal no pide el mapa de sucursales', async () => {
    dobles.zonaOrganizacion.set(ORG, 'Europe/Madrid');
    await resolveTimezone(ORG);
    expect(dobles.llamadasSucursales).toBe(0);
  });

  it('cachea por sucursal, no por organización', async () => {
    dobles.zonaOrganizacion.set(ORG, 'Europe/Madrid');
    dobles.sucursales.set(ORG, { 7: 'Pacific/Kiritimati', 8: 'America/Mexico_City' });
    await expect(resolveTimezone(ORG, 7)).resolves.toBe('Pacific/Kiritimati');
    await expect(resolveTimezone(ORG, 8)).resolves.toBe('America/Mexico_City');
  });

  it('invalidar limpia TAMBIÉN los dos cachés de debajo', async () => {
    dobles.zonaOrganizacion.set(ORG, 'Europe/Madrid');
    await resolveTimezone(ORG);

    invalidateResolvedTimezone(ORG);
    expect(dobles.invalidacionesOrg).toEqual([ORG]);
    expect(dobles.invalidacionesSucursal).toEqual([ORG]);

    // Y la siguiente llamada vuelve a leer: si solo se limpiara esta capa, el
    // valor viejo de debajo se recachearía aquí como si fuera fresco.
    dobles.zonaOrganizacion.set(ORG, 'America/Mexico_City');
    await expect(resolveTimezone(ORG)).resolves.toBe('America/Mexico_City');
    expect(dobles.llamadasOrg).toBe(2);
  });

  it('invalidar una organización no toca a las demás', async () => {
    dobles.zonaOrganizacion.set(ORG, 'Europe/Madrid');
    dobles.zonaOrganizacion.set(ORG + 1, 'America/Mexico_City');
    await resolveTimezone(ORG);
    await resolveTimezone(ORG + 1);
    invalidateResolvedTimezone(ORG);
    await resolveTimezone(ORG + 1);
    expect(dobles.llamadasOrg).toBe(2);
  });

  it('el evento global vacía de verdad la caché del resolutor', async () => {
    // El entorno de Jest es `node`: no hay `window`. Se finge uno ANTES de
    // cargar el módulo, que es cuando se registra el oyente.
    const oyentes: Array<() => void> = [];
    (globalThis as unknown as { window?: unknown }).window = {
      addEventListener: (_tipo: string, cb: () => void) => oyentes.push(cb),
    };
    try {
      let modulo!: typeof import('@/lib/services/timezoneResolver');
      jest.isolateModules(() => {
        modulo = jest.requireActual('@/lib/services/timezoneResolver');
      });
      expect(oyentes).toHaveLength(1);

      dobles.zonaOrganizacion.set(ORG, 'Europe/Madrid');
      await expect(modulo.resolveTimezone(ORG)).resolves.toBe('Europe/Madrid');

      dobles.zonaOrganizacion.set(ORG, 'America/Mexico_City');
      await expect(modulo.resolveTimezone(ORG)).resolves.toBe('Europe/Madrid');

      oyentes[0]();
      await expect(modulo.resolveTimezone(ORG)).resolves.toBe('America/Mexico_City');
    } finally {
      delete (globalThis as unknown as { window?: unknown }).window;
    }
  });

  it('el guardado de una zona llega al resolutor por el evento global', () => {
    // El único escritor (`timezoneSettingsService`) y `branchService` emiten
    // `TIMEZONES_UPDATED_EVENT` tras guardar; el resolutor se suscribe y vacía
    // su caché. Sin ese enganche, un servicio seguiría escribiendo vencimientos
    // con la zona anterior hasta recargar la pestaña.
    const escritor = readFileSync(
      join(RAIZ, 'src/lib/services/timezoneSettingsService.ts'),
      'utf8',
    );
    expect(escritor).toContain('notifyTimezonesUpdated()');

    const resolutor = readFileSync(join(RAIZ, 'src/lib/services/timezoneResolver.ts'), 'utf8');
    expect(resolutor).toContain('window.addEventListener(TIMEZONES_UPDATED_EVENT');
  });
});
