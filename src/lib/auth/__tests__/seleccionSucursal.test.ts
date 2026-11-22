/// <reference types="jest" />
/**
 * Paso «¿En qué sucursal trabajas hoy?» (Figma 2728:69155, nota de reglas
 * 2026-11-21): horario, orden, ruta y validación en el servidor. Datos ficticios.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  estadoHorario,
  indiceDeAtajo,
  leerEleccion,
  momentoEnZona,
  ordenarSucursalesEntrada,
  rutaPasoSucursal,
  RUTA_PASO_SUCURSAL,
} from '../seleccionSucursal';
import { sucursalesDeEntrada, validarEleccionSucursal, type SujetoEntrada } from '../sucursalesEntrada.server';

const SEMANA = (open: string, close: string) =>
  Object.fromEntries(['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].map((d) => [d, { open, close, closed: false }]));

describe('estadoHorario', () => {
  const horario = { ...SEMANA('08:00', '20:00'), saturday: { open: '09:00', close: '13:00', closed: false }, sunday: { open: '09:00', close: '18:00', closed: true } };

  test('sin horario o con el de por defecto (sin revisar) no dice nada', () => {
    expect(estadoHorario(null, { dia: 'monday', minutos: 600 })).toBeNull();
    const porDefecto = { ...SEMANA('09:00', '18:00'), saturday: { open: '10:00', close: '15:00', closed: false }, sunday: { open: '09:00', close: '18:00', closed: true } };
    expect(estadoHorario(porDefecto, { dia: 'monday', minutos: 600 })).toBeNull();
  });

  test('dentro del turno: abierta', () => {
    expect(estadoHorario(horario, { dia: 'monday', minutos: 10 * 60 })).toEqual({ abierta: true });
  });

  test('antes de abrir: abre hoy a la hora del turno', () => {
    expect(estadoHorario(horario, { dia: 'monday', minutos: 7 * 60 })).toEqual({ abierta: false, abre: { dia: null, hora: '08:00' } });
  });

  test('cerrada el resto del día: el próximo día con turnos', () => {
    expect(estadoHorario(horario, { dia: 'saturday', minutos: 14 * 60 })).toEqual({ abierta: false, abre: { dia: 'monday', hora: '08:00' } });
  });

  test('turno que cruza la medianoche sigue abierto de madrugada', () => {
    const bar = { ...SEMANA('18:00', '02:00') };
    expect(estadoHorario(bar, { dia: 'tuesday', minutos: 60 })).toEqual({ abierta: true });
    expect(estadoHorario(bar, { dia: 'tuesday', minutos: 3 * 60 })).toEqual({ abierta: false, abre: { dia: null, hora: '18:00' } });
  });

  test('turnos partidos: cerrada al mediodía, abre en el segundo', () => {
    const partido = { monday: { open: '08:00', close: '20:00', closed: false, tramos: [{ open: '08:00', close: '12:00' }, { open: '14:00', close: '20:00' }] } };
    expect(estadoHorario(partido, { dia: 'monday', minutos: 13 * 60 })).toEqual({ abierta: false, abre: { dia: null, hora: '14:00' } });
  });
});

describe('momentoEnZona', () => {
  test('el día y la hora son los de la sede, no los del servidor', () => {
    // 2026-11-23 es lunes; 03:30 UTC es domingo 22:30 en Bogotá (UTC-5).
    const instante = new Date(Date.UTC(2026, 10, 23, 3, 30));
    expect(momentoEnZona(instante, 'America/Bogota')).toEqual({ dia: 'sunday', minutos: 22 * 60 + 30 });
    expect(momentoEnZona(instante, 'Europe/Madrid')).toEqual({ dia: 'monday', minutos: 4 * 60 + 30 });
  });
});

describe('ordenarSucursalesEntrada', () => {
  const base = { ciudad: null, direccion: null, principal: false };
  const sedes = [
    { ...base, id: 1, nombre: 'Sede Norte', ciudad: 'Bogotá' },
    { ...base, id: 2, nombre: 'Centro', principal: true },
    { ...base, id: 3, nombre: 'Alameda', direccion: 'Calle 63' },
    { ...base, id: 4, nombre: 'Chapinero' },
  ];

  test('última usada, luego la principal, luego por nombre', () => {
    expect(ordenarSucursalesEntrada(sedes, { ultimaId: 4 }).map((s) => s.id)).toEqual([4, 2, 3, 1]);
    expect(ordenarSucursalesEntrada(sedes).map((s) => s.id)).toEqual([2, 3, 4, 1]);
  });

  test('busca en nombre, ciudad y dirección sin tildes ni mayúsculas', () => {
    expect(ordenarSucursalesEntrada(sedes, { texto: 'bogota' }).map((s) => s.id)).toEqual([1]);
    expect(ordenarSucursalesEntrada(sedes, { texto: 'CALLE' }).map((s) => s.id)).toEqual([3]);
  });
});

describe('ruta, elección y atajos', () => {
  test('el paso cuelga de /auth/select-organization (el middleware lo deja pasar con sesión)', () => {
    expect(RUTA_PASO_SUCURSAL.startsWith('/auth/select-organization')).toBe(true);
    expect(rutaPasoSucursal('/app/pos?x=1')).toBe(`${RUTA_PASO_SUCURSAL}?dest=${encodeURIComponent('/app/pos?x=1')}`);
  });

  test('invitación y alta no pasan por el paso', () => {
    expect(rutaPasoSucursal('/auth/invite?invite_code=ABC')).toBe('/auth/invite?invite_code=ABC');
  });

  test('solo un id positivo o «todas»', () => {
    expect(leerEleccion(5)).toBe(5);
    expect(leerEleccion('7')).toBe(7);
    expect(leerEleccion('todas')).toBe('todas');
    for (const malo of [0, -1, 1.5, 'x', null, undefined, {}, '7; drop']) expect(leerEleccion(malo)).toBeNull();
  });

  test('1–9 eligen; 0 y letras no', () => {
    expect(indiceDeAtajo('1')).toBe(0);
    expect(indiceDeAtajo('9')).toBe(8);
    expect(indiceDeAtajo('0')).toBeNull();
    expect(indiceDeAtajo('a')).toBeNull();
  });
});

// ─── Servidor ────────────────────────────────────────────────────────────────

type Resultado = { data: unknown; error: { message: string } | null; count?: number };

/** Cliente falso: cada tabla responde según los filtros recibidos. */
function clienteFalso(responder: (tabla: string, filtros: Record<string, unknown>) => Resultado) {
  return {
    from(tabla: string) {
      const filtros: Record<string, unknown> = {};
      const b: Record<string, unknown> = {};
      b.select = (cols: string) => ((filtros.select = cols), b);
      b.eq = (col: string, v: unknown) => ((filtros[col] = v), b);
      b.in = (col: string, v: unknown) => ((filtros[`${col}:in`] = v), b);
      b.maybeSingle = () => Promise.resolve(responder(tabla, { ...filtros, single: true }));
      b.then = (res: (x: Resultado) => void, rej?: (e: unknown) => void) => Promise.resolve(responder(tabla, filtros)).then(res, rej);
      return b;
    },
  };
}

const HORARIO_BOGOTA = { ...SEMANA('08:00', '20:00') };

function sujeto(opciones: { admin: boolean; asignadas: number[] }): SujetoEntrada {
  const supabase = clienteFalso((tabla, f) => {
    if (tabla === 'organizations') return { data: { timezone: 'America/Bogota' }, error: null };
    if (tabla === 'member_branches') return { data: opciones.asignadas.map((branch_id) => ({ branch_id })), error: null };
    if (tabla === 'organization_members') return { data: null, error: null, count: 2 };
    if (tabla === 'cash_sessions') {
      expect(f).toMatchObject({ organization_id: 120, opened_by: 'u-1', status: 'open' });
      return { data: [{ id: 41, branch_id: 11 }, { id: 42, branch_id: null }], error: null };
    }
    if (tabla === 'branches' && f.select === 'id') return { data: [{ id: 10 }, { id: 11 }, { id: 12 }], error: null };
    if (tabla === 'branches') {
      const ids = f['id:in'] as number[];
      return {
        data: [
          { id: 10, name: 'Principal', city: 'Bogotá', address: 'Cra 45', is_main: true, opening_hours: HORARIO_BOGOTA, timezone: null },
          { id: 11, name: 'Norte', city: 'Bogotá', address: 'Calle 140', is_main: false, opening_hours: null, timezone: null },
          { id: 12, name: 'Sur', city: null, address: null, is_main: false, opening_hours: HORARIO_BOGOTA, timezone: 'Europe/Madrid' },
        ].filter((b) => ids.includes(b.id)),
        error: null,
      };
    }
    return { data: [], error: null };
  });
  return {
    userId: 'u-1',
    organizationId: 120,
    organizationName: 'Org de prueba',
    roleId: opciones.admin ? 2 : 7,
    roleName: opciones.admin ? 'Admin de organización' : 'Cajero',
    isSuperAdmin: false,
    memberId: 900,
    supabase: supabase as never,
  };
}

describe('sucursalesDeEntrada (servidor)', () => {
  // Lunes 2026-11-23 15:00 UTC = 10:00 en Bogotá y 16:00 en Madrid.
  const ahora = new Date(Date.UTC(2026, 10, 23, 15, 0));

  test('miembro con sucursales asignadas: solo esas y sin «Todas»', async () => {
    const r = await sucursalesDeEntrada(sujeto({ admin: false, asignadas: [10, 11] }), ahora);
    expect(r.sucursales.map((s) => s.id).sort()).toEqual([10, 11]);
    expect(r.verTodas).toBe(false);
    expect(r.rol).toBe('Cajero');
    expect(r.organizaciones).toBe(2);
  });

  test('admin: todas las activas y «Todas las sucursales»', async () => {
    const r = await sucursalesDeEntrada(sujeto({ admin: true, asignadas: [] }), ahora);
    expect(r.sucursales.map((s) => s.id).sort()).toEqual([10, 11, 12]);
    expect(r.verTodas).toBe(true);
  });

  test('horario en la zona de cada sede y caja abierta de la persona', async () => {
    const r = await sucursalesDeEntrada(sujeto({ admin: true, asignadas: [] }), ahora);
    const por = Object.fromEntries(r.sucursales.map((s) => [s.id, s]));
    expect(por[10].horario).toEqual({ abierta: true });
    expect(por[11].horario).toBeNull();
    // Madrid: 16:00 dentro de 08:00–20:00.
    expect(por[12].horario).toEqual({ abierta: true });
    expect(por[11].cajaAbierta).toBe(41);
    expect(por[10].cajaAbierta).toBeNull();
  });

  test('la elección se valida contra el alcance: ajena → 403', async () => {
    const ctx = sujeto({ admin: false, asignadas: [10, 11] });
    await expect(validarEleccionSucursal(ctx, 11)).resolves.toBeDefined();
    await expect(validarEleccionSucursal(ctx, 12)).rejects.toMatchObject({ statusCode: 403, code: 'BRANCH_FORBIDDEN' });
    await expect(validarEleccionSucursal(ctx, 'todas')).rejects.toMatchObject({ statusCode: 403, code: 'BRANCH_SCOPE_REQUIRED' });
  });
});

describe('cableado', () => {
  const raiz = join(__dirname, '..', '..', '..', '..');
  const leer = (ruta: string) => readFileSync(join(raiz, ruta), 'utf8');

  test('el selector de organización y el login con una sola pasan por el paso de sucursal', () => {
    expect(leer('src/app/auth/select-organization/page.tsx')).toContain('rutaPasoSucursal(destino)');
    expect(leer('src/app/auth/login/page.tsx')).toContain("rutaPasoSucursal(destinoTrasLogin(sessionStorage.getItem('redirectTo')))");
  });

  test('la pantalla valida en el servidor antes de guardar y reutiliza el guardado de la barra superior', () => {
    const pagina = leer('src/app/auth/select-organization/sucursal/page.tsx');
    const post = pagina.indexOf("method: 'POST'");
    const guardar = pagina.indexOf('guardarSucursalActiva(eleccion');
    expect(post).toBeGreaterThan(-1);
    expect(guardar).toBeGreaterThan(post);
    expect(leer('src/lib/context/BranchContext.tsx')).toContain('guardarSucursalActiva(selection)');
  });

  test('la ruta resuelve la organización por sesión y rechaza un body con otra', () => {
    const ruta = leer('src/app/api/me/sucursales/route.ts');
    expect(ruta).toContain('withOrg(');
    expect(ruta).toContain('readOrgBody(ctx, req');
  });
});
