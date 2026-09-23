// ============================================================================
// Fase B, tanda 0 — el resolutor de zona de la capa de servicios (ADR-003)
// ============================================================================
// `resolveTimezone(organizationId, branchId?)` tiene que dar EXACTAMENTE lo
// mismo que `fn_timezone_for(p_organization_id, p_branch_id)` en Postgres. Si
// discrepan, el mismo dato tiene dos días según quién lo calcule: el servicio
// escribe un vencimiento con la zona de la organización y el trigger de la base
// lo recalcula con la de la sucursal (o al revés). Es el bug de la ronda 2.
//
// Se compara con dos cosas, y `fnTimezoneForOracle.ts` explica ambas: los datos
// reales leídos por MCP (ancla de regresión, hoy NO discriminan porque todo
// está en Bogotá) y una matriz sintética contra la transcripción del `.sql`.
// Para que la transcripción no envejezca en silencio, el primer `describe` LEE
// la migración y exige que sigan ahí los pasos en los que se apoya.
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

import {
  DEFECTO,
  MATRIZ,
  REALES,
  fnTimezoneForSQL,
} from '@/__tests__/timezone/fnTimezoneForOracle';

const MIGRACION_ZONA_ORG = '20260915235500_crm_v4_f00_44_organizations_timezone_valida.sql';

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
      join(RAIZ, 'supabase/migrations', MIGRACION_ZONA_ORG),
      'utf8',
    );
    expect(validacion).toContain('create trigger trg_validate_org_timezone');
  });
});

// ---------------------------------------------------------------------------
// Matriz sintética: resolutor vs. oráculo
// ---------------------------------------------------------------------------

const ORG = 120;
const SUCURSAL = 7;

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
