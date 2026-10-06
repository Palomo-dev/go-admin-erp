// websitePageBuilderService crea el cliente del navegador al importarse: sin entorno en Jest.
jest.mock('@/lib/supabase/config', () => ({ supabase: { from: jest.fn() }, getProjectRef: jest.fn(() => 'test') }));
jest.mock('@/lib/utils/offlineCache', () => ({
  isAppOnline: jest.fn(() => true),
  getCachedResponse: jest.fn(() => null),
  setCachedResponse: jest.fn(),
  queueAction: jest.fn(),
  setOnline: jest.fn(),
}));

import { SECTION_CATALOG } from '@/lib/services/websitePageBuilderService';
import {
  FUENTE_DE_SECCION,
  FUENTES_DATOS,
  avisoFaltanDatos,
  conteoDesdeRespuesta,
} from '../fuentesDatosSecciones';
import { contarFuentesDatos } from '../fuentesDatosService';

describe('avisoFaltanDatos', () => {
  test('sin registros en la fuente: aviso con la acción al módulo', () => {
    const aviso = avisoFaltanDatos('room_types', 'Habitaciones', { tipos_habitacion: 0 });
    expect(aviso).toEqual(
      expect.objectContaining({
        fuente: 'tipos_habitacion',
        titulo: 'Habitaciones necesita habitaciones creadas en Hotel',
        accion: { texto: 'Ir a Hotel', href: '/app/pms/tipos-espacio' },
      }),
    );
    expect(aviso?.detalle).toMatch(/^Tu organización aún no tiene tipos de habitación\./);
  });

  test('con registros no avisa', () => {
    expect(avisoFaltanDatos('room_types', 'Habitaciones', { tipos_habitacion: 3 })).toBeNull();
  });

  test('no avisa de lo que no pudo contar (conteos nulos o fuente ausente)', () => {
    expect(avisoFaltanDatos('room_types', 'Habitaciones', null)).toBeNull();
    expect(avisoFaltanDatos('room_types', 'Habitaciones', {})).toBeNull();
  });

  test('una sección sin fuente del ERP nunca dice «Faltan datos»', () => {
    expect(avisoFaltanDatos('hero', 'Portada', { productos: 0 })).toBeNull();
  });

  test('en una sede el sujeto es la sede', () => {
    expect(avisoFaltanDatos('products_grid', 'Productos', { productos: 0 }, 'Sede Norte')?.detalle).toMatch(/^Sede Norte /);
  });

  test('toda sección con fuente existe en el catálogo y su fuente está definida', () => {
    const tipos = new Set(SECTION_CATALOG.map((s) => s.type));
    for (const [tipo, fuente] of Object.entries(FUENTE_DE_SECCION)) {
      expect(tipos.has(tipo)).toBe(true);
      expect(FUENTES_DATOS[fuente]).toBeDefined();
    }
  });
});

describe('conteoDesdeRespuesta', () => {
  test('solo acepta fuentes conocidas con enteros ≥ 0', () => {
    expect(
      conteoDesdeRespuesta({ fuentes: { productos: 4, tipos_habitacion: -1, otra: 3, categorias: 1.5, ofertas: 0 } }),
    ).toEqual({ productos: 4, ofertas: 0 });
    expect(conteoDesdeRespuesta(null)).toEqual({});
  });
});

describe('contarFuentesDatos', () => {
  /** Cliente falso: registra filtros y responde el conteo configurado por tabla. */
  function clienteFalso(respuestas: Record<string, { count: number | null; error?: unknown }>) {
    const llamadas: { tabla: string; filtros: unknown[][] }[] = [];
    const cliente = {
      from(tabla: string) {
        const filtros: unknown[][] = [];
        llamadas.push({ tabla, filtros });
        const q: Record<string, unknown> = {};
        for (const m of ['select', 'eq', 'is', 'or', 'gt']) {
          q[m] = (...args: unknown[]) => {
            filtros.push([m, ...args]);
            return q;
          };
        }
        q.then = (ok: (v: unknown) => unknown) => ok({ count: respuestas[tabla]?.count ?? 0, error: respuestas[tabla]?.error ?? null });
        return q;
      },
    };
    return { cliente: cliente as never, llamadas };
  }

  test('devuelve conteos por fuente y siempre filtra por la organización', async () => {
    const { cliente, llamadas } = clienteFalso({ space_types: { count: 2 }, products: { count: 0 } });
    const r = await contarFuentesDatos(cliente, 120, null, ['tipos_habitacion', 'productos']);
    expect(r).toEqual({ tipos_habitacion: 2, productos: 0 });
    for (const l of llamadas) {
      expect(l.filtros).toContainEqual(['eq', 'organization_id', 120]);
      expect(l.filtros[0]).toEqual(['select', 'id', { count: 'exact', head: true }]);
    }
  });

  test('parking_zones (sin organization_id) filtra por la sede de la organización', async () => {
    const { cliente, llamadas } = clienteFalso({ parking_zones: { count: 1 } });
    await contarFuentesDatos(cliente, 120, 7, ['zonas_parqueo']);
    expect(llamadas[0].filtros).toContainEqual(['eq', 'branches.organization_id', 120]);
    expect(llamadas[0].filtros).toContainEqual(['eq', 'branch_id', 7]);
  });

  test('clases, rutas, flota y planes: los mismos filtros con los que el sitio los carga', async () => {
    const { cliente, llamadas } = clienteFalso({
      gym_classes: { count: 3 },
      transport_routes: { count: 0 },
      vehicles: { count: 2 },
      membership_plans: { count: 4 },
    });
    const r = await contarFuentesDatos(cliente, 120, 7, ['clases', 'rutas', 'flota', 'planes_membresia']);
    expect(r).toEqual({ clases: 3, rutas: 0, flota: 2, planes_membresia: 4 });
    const por = Object.fromEntries(llamadas.map((l) => [l.tabla, l.filtros]));
    for (const tabla of ['gym_classes', 'transport_routes', 'vehicles', 'membership_plans']) {
      expect(por[tabla]).toContainEqual(['eq', 'organization_id', 120]);
    }
    expect(por.gym_classes).toContainEqual(['eq', 'status', 'active']);
    expect(por.gym_classes).toContainEqual(['or', expect.stringMatching(/^end_at\.gte\."[^"]+",recurrence\.not\.is\.null$/)]);
    expect(por.gym_classes).toContainEqual(['or', 'branch_id.is.null,branch_id.eq.7']);
    expect(por.vehicles).toContainEqual(['eq', 'is_active', true]);
    expect(por.vehicles).toContainEqual(['or', 'branch_id.is.null,branch_id.eq.7']);
    expect(por.transport_routes).toContainEqual(['eq', 'is_active', true]);
    expect(por.membership_plans).toContainEqual(['eq', 'is_active', true]);
  });

  test('las secciones de gym y transporte avisan «Faltan datos» con su módulo', () => {
    expect(avisoFaltanDatos('class_schedule', 'Horario de clases', { clases: 0 })?.accion).toEqual({
      texto: 'Ir a Clases',
      href: '/app/membresias/clases',
    });
    expect(avisoFaltanDatos('routes', 'Rutas', { rutas: 0 })?.accion.href).toBe('/app/transporte/rutas');
    expect(avisoFaltanDatos('fleet_showcase', 'Flota', { flota: 0 })?.accion.href).toBe('/app/transporte/vehiculos');
    expect(avisoFaltanDatos('membership_plans', 'Planes', { planes_membresia: 0 })?.accion.href).toBe('/app/membresias/planes');
    expect(avisoFaltanDatos('membership_plans', 'Planes', { planes_membresia: 2 })).toBeNull();
  });

  test('una fuente que falla no aparece (no se avisa de lo que no se pudo contar)', async () => {
    const { cliente } = clienteFalso({ space_types: { count: null, error: { message: 'x' } }, products: { count: 5 } });
    expect(await contarFuentesDatos(cliente, 1, null, ['tipos_habitacion', 'productos'])).toEqual({ productos: 5 });
  });
});
