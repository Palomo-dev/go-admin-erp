/**
 * @jest-environment jsdom
 */
// ============================================================================
// Regla única de zona horaria (decisión del dueño, 2026-09-30)
// ============================================================================
// La zona es la de la SUCURSAL si la tiene; si no, la de la ORGANIZACIÓN; el
// fallback del sistema solo como último recurso. No hay zona por persona.
//
//  - Mostrar: sin sucursal en el dato, manda la sucursal activa del header;
//    con «Todas», la organización. El branch_id del dato gana siempre.
//  - Calcular (día de negocio, cierres, reportes por día): la misma zona.
//  - Servidor: `zonaHorariaEnServidor` delega en `fn_timezone_for`.
//
// Se corre con TZ=UTC y TZ=America/Bogota (npm run test:tz-all): nada de lo
// que se afirma aquí puede depender de la zona del proceso. Organización
// ficticia 120 con dos sucursales: 7 en America/Mexico_City y 8 sin zona
// propia (como las 94 sucursales reales a 2026-09-30).
// ============================================================================

import React from 'react';
import { render, act, cleanup } from '@testing-library/react';
import {
  sucursalParaZona,
  sucursalActivaDelHeader,
} from '@/lib/utils/sucursalParaZona';
import { resolveTimezoneForBranch } from '@/lib/utils/branchTimezoneCascade';
import { formatDateTimeInTz, toPlainDate } from '@/lib/utils/dateDisplay';

const ORG_TZ = 'America/Bogota';
const MEXICO = 'America/Mexico_City';
const ZONAS_SUCURSAL: Record<number, string | null> = { 7: MEXICO, 8: null };

// 2026-09-30 05:30 UTC = 00:30 del 30/09 en Bogotá y 23:30 del 29/09 en CDMX
// (México no tiene horario de verano desde 2022). Cruza el día a propósito.
const INSTANTE = '2026-09-30T05:30:00Z';

let seleccion: { selectedBranchId: number | null; isAllSelected: boolean; branches: Array<{ id: number; name: string }> } | undefined;

jest.mock('@/lib/context/BranchContext', () => ({
  useBranchOpcional: () => seleccion,
}));
jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => 120,
  ORGANIZATION_CHANGED_EVENT: 'organization-changed',
}));
jest.mock('@/lib/services/organizationTimezoneService', () => ({
  getOrganizationTimezone: async () => 'America/Bogota',
  invalidateTimezoneCache: () => undefined,
}));
jest.mock('@/lib/services/organizationOperatingHoursService', () => ({
  getOperatingHours: async () => null,
}));
jest.mock('@/lib/services/branchTimezoneService', () => ({
  getBranchTimezones: async () => ({ 7: 'America/Mexico_City', 8: null }),
  invalidateBranchTimezoneCache: () => undefined,
  TIMEZONES_UPDATED_EVENT: 'timezones-updated',
}));
jest.mock('@/lib/utils/timezoneFallback', () => ({
  avisarResolucionZonaHoraria: () => undefined,
}));

import {
  OrganizationTimezoneProvider,
  useFormatDate,
  useTimezoneFor,
} from '@/lib/context/OrganizationTimezoneContext';

describe('qué sucursal cuenta (puro)', () => {
  test('sin dato: la sucursal activa del header', () => {
    expect(sucursalParaZona(undefined, 7)).toBe(7);
  });
  test('sin dato y con «Todas» o sin selección: organización', () => {
    expect(sucursalParaZona(undefined, sucursalActivaDelHeader({ selectedBranchId: 7, isAllSelected: true }))).toBeNull();
    expect(sucursalParaZona(undefined, sucursalActivaDelHeader(undefined))).toBeNull();
    expect(sucursalParaZona(undefined, sucursalActivaDelHeader({ selectedBranchId: null, isAllSelected: false }))).toBeNull();
  });
  test('el branch_id del dato gana al del header', () => {
    expect(sucursalParaZona(8, 7)).toBe(8);
  });
  test('dato sin sucursal (null explícito): organización aunque el header tenga una', () => {
    expect(sucursalParaZona(null, 7)).toBeNull();
  });
  test('ids basura no cuentan como sucursal', () => {
    expect(sucursalParaZona(0, 7)).toBeNull();
    expect(sucursalParaZona(undefined, -3)).toBeNull();
    expect(sucursalParaZona(Number.NaN, 7)).toBeNull();
  });
});

describe('cascada + formato, sin depender de la zona del proceso', () => {
  const zonaDe = (dato: number | null | undefined, header: number | null) =>
    resolveTimezoneForBranch(sucursalParaZona(dato, header), ZONAS_SUCURSAL, ORG_TZ);

  test('header en la sucursal de México: hora y día de México', () => {
    const z = zonaDe(undefined, 7);
    expect(z).toMatchObject({ timezone: MEXICO, source: 'branch' });
    expect(formatDateTimeInTz(INSTANTE, z.timezone)).toContain('29/09/2026');
    expect(formatDateTimeInTz(INSTANTE, z.timezone)).toContain('23:30');
    expect(toPlainDate(new Date(INSTANTE), z.timezone)).toBe('2026-09-29');
  });

  test('sucursal sin zona propia: exactamente la de la organización (como hoy)', () => {
    const z = zonaDe(undefined, 8);
    expect(z).toMatchObject({ timezone: ORG_TZ, source: 'organization' });
    expect(formatDateTimeInTz(INSTANTE, z.timezone)).toContain('30/09/2026');
    expect(formatDateTimeInTz(INSTANTE, z.timezone)).toContain('00:30');
    expect(toPlainDate(new Date(INSTANTE), z.timezone)).toBe('2026-09-30');
  });

  test('«Todas»: organización', () => {
    expect(zonaDe(undefined, null)).toMatchObject({ timezone: ORG_TZ, source: 'organization' });
  });
});

function Sonda({ dato }: { dato?: number | null }) {
  const { formatDateTime, toDate, timezone } = useFormatDate(dato);
  const { source } = useTimezoneFor(dato);
  return (
    <p>
      {timezone}|{source}|{formatDateTime(INSTANTE)}|{toDate(new Date(INSTANTE))}
    </p>
  );
}

async function montar(dato?: number | null): Promise<string> {
  const { container } = render(
    <OrganizationTimezoneProvider>
      <Sonda dato={dato} />
    </OrganizationTimezoneProvider>,
  );
  // El provider carga la zona con import() dinámico: se deja drenar la cola.
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
  return container.textContent ?? '';
}

describe('useFormatDate / useTimezoneFor (punto único de cliente)', () => {
  afterEach(cleanup);

  test('sin argumento y header en México: muestra y calcula en México', async () => {
    seleccion = { selectedBranchId: 7, isAllSelected: false, branches: [{ id: 7, name: 'Sucursal Norte' }] };
    const [tz, fuente, texto, dia] = (await montar()).split('|');
    expect(tz).toBe(MEXICO);
    expect(fuente).toBe('branch');
    expect(texto).toContain('29/09/2026');
    expect(texto).toContain('23:30');
    expect(dia).toBe('2026-09-29');
  });

  test('sin argumento y header en una sucursal sin zona: igual que antes (organización)', async () => {
    seleccion = { selectedBranchId: 8, isAllSelected: false, branches: [] };
    const [tz, fuente, texto, dia] = (await montar()).split('|');
    expect(tz).toBe(ORG_TZ);
    expect(fuente).toBe('organization');
    expect(texto).toContain('30/09/2026');
    expect(dia).toBe('2026-09-30');
  });

  test('«Todas las sucursales»: organización', async () => {
    seleccion = { selectedBranchId: 7, isAllSelected: true, branches: [] };
    expect((await montar()).split('|')[0]).toBe(ORG_TZ);
  });

  test('fuera del BranchProvider (sin contexto de sucursal): organización', async () => {
    seleccion = undefined;
    expect((await montar()).split('|')[0]).toBe(ORG_TZ);
  });

  test('el branch_id del dato manda sobre el header', async () => {
    seleccion = { selectedBranchId: 8, isAllSelected: false, branches: [] };
    expect((await montar(7)).split('|')[0]).toBe(MEXICO);
    seleccion = { selectedBranchId: 7, isAllSelected: false, branches: [] };
    expect((await montar(null)).split('|')[0]).toBe(ORG_TZ);
  });
});

describe('zonaHorariaEnServidor (punto único de servidor)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { zonaHorariaEnServidor } = require('@/lib/utils/zonaHorariaServidor') as typeof import('@/lib/utils/zonaHorariaServidor');
  const cliente = (resp: { data: unknown; error: { message: string } | null }) => {
    const llamadas: unknown[] = [];
    return {
      llamadas,
      supabase: { rpc: async (fn: string, args: unknown) => { llamadas.push([fn, args]); return resp; } },
    };
  };

  test('delega en fn_timezone_for con la organización del contexto y la sucursal', async () => {
    const c = cliente({ data: MEXICO, error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tz = await zonaHorariaEnServidor({ supabase: c.supabase as any, organizationId: 120 }, 7);
    expect(tz).toBe(MEXICO);
    expect(c.llamadas).toEqual([['fn_timezone_for', { p_organization_id: 120, p_branch_id: 7 }]]);
  });

  test('sin sucursal: p_branch_id null (organización)', async () => {
    const c = cliente({ data: ORG_TZ, error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await zonaHorariaEnServidor({ supabase: c.supabase as any, organizationId: 120 });
    expect(c.llamadas).toEqual([['fn_timezone_for', { p_organization_id: 120, p_branch_id: null }]]);
  });

  test('error o zona ilegible: fallback del sistema, sin lanzar', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const conError = cliente({ data: null, error: { message: 'boom' } });
    const basura = cliente({ data: 'Marte/Olympus', error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await zonaHorariaEnServidor({ supabase: conError.supabase as any, organizationId: 120 }, 7)).toBe('America/Bogota');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await zonaHorariaEnServidor({ supabase: basura.supabase as any, organizationId: 120 }, 7)).toBe('America/Bogota');
    warn.mockRestore();
  });
});
