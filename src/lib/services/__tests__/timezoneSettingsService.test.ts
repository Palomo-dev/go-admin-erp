// ============================================================
// Cierre de fase A — el único escritor de zonas horarias.
//
// Dos cosas que no se pueden romper sin que se note:
//  1. La escritura va por PUT /api/organization/timezone, donde el permiso se
//     comprueba en el servidor. Nada de `supabase.from('organizations')`.
//  2. Un guardado correcto invalida los DOS cachés y avisa a los contextos
//     montados. Sin eso la pantalla sigue formateando con la zona anterior
//     hasta un F5, que es exactamente el bug que esta fase cierra.
// ============================================================

const invalidadasOrg: Array<number | undefined> = [];
const invalidadasSucursal: Array<number | undefined> = [];
let avisos = 0;

jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => 120,
}));
jest.mock('@/lib/services/organizationTimezoneService', () => ({
  invalidateTimezoneCache: (id?: number) => { invalidadasOrg.push(id); },
}));
jest.mock('@/lib/services/branchTimezoneService', () => ({
  invalidateBranchTimezoneCache: (id?: number) => { invalidadasSucursal.push(id); },
  notifyTimezonesUpdated: () => { avisos += 1; },
}));

import {
  guardarZonaOrganizacion,
  guardarZonaSucursal,
} from '@/lib/services/timezoneSettingsService';

interface Llamada {
  url: string;
  metodo: string;
  cabeceras: Record<string, string>;
  cuerpo: Record<string, unknown>;
}

const llamadas: Llamada[] = [];
let respuesta: { ok: boolean; status: number; json: unknown } = {
  ok: true,
  status: 200,
  json: { ok: true, scope: 'organization', timezone: 'Europe/Madrid' },
};

beforeEach(() => {
  llamadas.length = 0;
  invalidadasOrg.length = 0;
  invalidadasSucursal.length = 0;
  avisos = 0;
  respuesta = {
    ok: true,
    status: 200,
    json: { ok: true, scope: 'organization', timezone: 'Europe/Madrid' },
  };
  (global as unknown as { fetch: unknown }).fetch = jest.fn(
    async (url: string, init: { method: string; headers: Record<string, string>; body: string }) => {
      llamadas.push({
        url,
        metodo: init.method,
        cabeceras: init.headers,
        cuerpo: JSON.parse(init.body),
      });
      return {
        ok: respuesta.ok,
        status: respuesta.status,
        json: async () => respuesta.json,
      };
    },
  );
});

describe('la zona de la organización', () => {
  it('se escribe por la ruta con permiso en servidor, no contra PostgREST', async () => {
    await guardarZonaOrganizacion('Europe/Madrid');
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].url).toBe('/api/organization/timezone');
    expect(llamadas[0].metodo).toBe('PUT');
    expect(llamadas[0].cuerpo).toEqual({ scope: 'organization', timezone: 'Europe/Madrid' });
  });

  it('la organización viaja en la cabecera, y el servidor la valida contra la sesión', () => {
    return guardarZonaOrganizacion('Europe/Madrid').then(() => {
      expect(llamadas[0].cabeceras['x-organization-id']).toBe('120');
    });
  });

  it('invalida los dos cachés y avisa a los contextos montados', async () => {
    await guardarZonaOrganizacion('Europe/Madrid');
    expect(invalidadasOrg).toEqual([120]);
    expect(invalidadasSucursal).toEqual([120]);
    expect(avisos).toBe(1);
  });

  it('un 403 del servidor NO invalida nada y sube el error a la pantalla', async () => {
    respuesta = { ok: false, status: 403, json: { error: 'Requiere rol de administrador' } };
    await expect(guardarZonaOrganizacion('Europe/Madrid')).rejects.toThrow(
      /Requiere rol de administrador/,
    );
    expect(invalidadasOrg).toEqual([]);
    expect(invalidadasSucursal).toEqual([]);
    expect(avisos).toBe(0);
  });
});

describe('la zona de una sucursal', () => {
  it('«heredar» se manda como null, que es el NULL de la columna', async () => {
    respuesta = { ok: true, status: 200, json: { ok: true, scope: 'branch', timezone: null } };
    await guardarZonaSucursal(4102, null);
    expect(llamadas[0].cuerpo).toEqual({ scope: 'branch', branchId: 4102, timezone: null });
  });

  it('guardar una sucursal también invalida el caché de la organización', async () => {
    respuesta = {
      ok: true,
      status: 200,
      json: { ok: true, scope: 'branch', branchId: 4102, timezone: 'Europe/Madrid' },
    };
    await guardarZonaSucursal(4102, 'Europe/Madrid');
    // Las dos: la de sucursales porque cambió el override, y la de la
    // organización porque el contexto recarga ambas del mismo evento.
    expect(invalidadasSucursal).toEqual([120]);
    expect(invalidadasOrg).toEqual([120]);
    expect(avisos).toBe(1);
  });

  it('una sucursal de otro inquilino (404) no invalida ni avisa', async () => {
    respuesta = { ok: false, status: 404, json: { error: 'La sucursal no es de esta organización' } };
    await expect(guardarZonaSucursal(999999, 'Europe/Madrid')).rejects.toThrow(
      /no es de esta organización/,
    );
    expect(invalidadasSucursal).toEqual([]);
    expect(avisos).toBe(0);
  });
});
