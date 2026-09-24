/**
 * El contrato de «¿se ve esta página?», fijado para que no vuelva a romperse.
 *
 * El defecto que arregla (medido el 2026-09-23): el código que ESCRIBE
 * `organization_module_pages` daba la ausencia de fila por «activa» y el que
 * LEÍA la daba por «oculta». Resultado: cada página nueva del catálogo nacía
 * invisible, para siempre y sin avisar, en toda organización con lista previa.
 * Tres organizaciones con CRM activo (orgs 130, 134 y 138) no veían Leads,
 * Llamadas, Objeciones ni Agentes IA; seis no veían
 * `/app/finanzas/documentos-soporte`.
 *
 * Tres reglas y un guardarraíl:
 *  1. página ausente de la lista → visible;
 *  2. fila con `is_active = false` → oculta;
 *  3. módulo inactivo → todo oculto;
 *  4. `paginaActiva()` es el ÚNICO camino: ningún lector reimplementa la
 *     comprobación a mano.
 */
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { CATALOGO_NAV, moduloPorCodigo } from '../catalog';
import { filtrarNavegacion, type AccesoNav } from '../filtrar';
import { filtrarPaginasActivas, paginaActiva, type AccesoPaginas } from '../paginaActiva';

const RAIZ = join(__dirname, '..', '..', '..', '..');

function leer(ruta: string): string {
  return readFileSync(join(RAIZ, ruta), 'utf8');
}

const TODOS_LOS_MODULOS = CATALOGO_NAV.map((m) => m.codigo).filter((c): c is string => c !== null);

function acceso(parcial: Partial<AccesoPaginas> = {}): AccesoPaginas {
  return { modulosActivos: TODOS_LOS_MODULOS, paginasOcultas: {}, ...parcial };
}

function accesoNav(parcial: Partial<AccesoNav> = {}): AccesoNav {
  return {
    modulosActivos: TODOS_LOS_MODULOS,
    paginasOcultas: {},
    modulosCargo: null,
    paginasCargo: null,
    capacidades: new Set(),
    ...parcial,
  };
}

describe('paginaActiva — regla 1: una página ausente de la lista se ve', () => {
  test('sin ninguna entrada para el módulo, la página está activa', () => {
    expect(paginaActiva('crm', '/app/crm/leads', acceso())).toBe(true);
  });

  test('con lista parcial, la página que no figura sigue activa', () => {
    // El caso real de las orgs 130/134/138: la lista traía 8-10 páginas de CRM
    // y el catálogo tiene más. Las que faltan NO se esconden.
    const a = acceso({ paginasOcultas: { crm: ['/app/crm/segmentos'] } });
    expect(paginaActiva('crm', '/app/crm/leads', a)).toBe(true);
    expect(paginaActiva('crm', '/app/crm/llamadas', a)).toBe(true);
    expect(paginaActiva('crm', '/app/crm/agentes-ia', a)).toBe(true);
  });

  test('una página nueva del catálogo aparece en el menú de una organización con lista', () => {
    const menu = filtrarNavegacion(accesoNav({ paginasOcultas: { crm: ['/app/crm/segmentos'] } }));
    const crm = menu.flatMap((s) => s.modulos).find((m) => m.modulo.codigo === 'crm')!;
    const hrefs = crm.paginas.map((p) => p.href);
    expect(hrefs).toContain('/app/crm/leads');
    expect(hrefs).toContain('/app/crm/llamadas');
    expect(hrefs).not.toContain('/app/crm/segmentos');
  });
});

describe('paginaActiva — regla 2: una fila is_active = false oculta', () => {
  test('la página nombrada en la lista de ocultas no se ve', () => {
    const a = acceso({ paginasOcultas: { crm: ['/app/crm/llamadas'] } });
    expect(paginaActiva('crm', '/app/crm/llamadas', a)).toBe(false);
  });

  test('esa decisión se respeta aunque el resto del módulo esté intacto', () => {
    // Hay organizaciones con filas en false de verdad (orgs 120, 129, 132, 133,
    // 134, 138, 140, 145 el 2026-09-23). Son decisiones, no huecos.
    const a = acceso({ paginasOcultas: { pos: ['/app/pos/propinas', '/app/pos/cupones'] } });
    expect(paginaActiva('pos', '/app/pos/propinas', a)).toBe(false);
    expect(paginaActiva('pos', '/app/pos/cupones', a)).toBe(false);
    expect(paginaActiva('pos', '/app/pos/ventas', a)).toBe(true);
  });

  test('el menú tampoco la enseña', () => {
    const menu = filtrarNavegacion(accesoNav({ paginasOcultas: { pos: ['/app/pos/propinas'] } }));
    const pos = menu.flatMap((s) => s.modulos).find((m) => m.modulo.codigo === 'pos')!;
    expect(pos.paginas.map((p) => p.href)).not.toContain('/app/pos/propinas');
  });
});

describe('paginaActiva — regla 3: un módulo inactivo lo oculta todo', () => {
  test('ninguna página de un módulo que la organización no tiene está activa', () => {
    const a = acceso({ modulosActivos: ['pos'] });
    expect(paginaActiva('crm', '/app/crm/leads', a)).toBe(false);
    expect(paginaActiva('crm', '/app/crm/clientes', a)).toBe(false);
  });

  test('da igual que su lista esté vacía o completa', () => {
    const sinLista = acceso({ modulosActivos: [] });
    const conLista = acceso({ modulosActivos: [], paginasOcultas: { crm: [] } });
    for (const p of moduloPorCodigo('crm')!.paginas) {
      expect(paginaActiva('crm', p.href, sinLista)).toBe(false);
      expect(paginaActiva('crm', p.href, conLista)).toBe(false);
    }
  });

  test('un módulo sin código (Inicio) no depende de la organización', () => {
    expect(paginaActiva(null, '/app/inicio', acceso({ modulosActivos: [] }))).toBe(true);
  });
});

describe('filtrarPaginasActivas', () => {
  test('aplica la misma regla a una lista y conserva el orden del catálogo', () => {
    const paginas = moduloPorCodigo('crm')!.paginas;
    const visibles = filtrarPaginasActivas('crm', paginas, {
      modulosActivos: ['crm'],
      paginasOcultas: { crm: ['/app/crm/segmentos'] },
    });
    expect(visibles.length).toBe(paginas.length - 1);
    expect(visibles.map((p) => p.href)).toEqual(
      paginas.map((p) => p.href).filter((h) => h !== '/app/crm/segmentos')
    );
  });

  test('una fila de una página que ya no existe en el catálogo no ensucia nada', () => {
    // Filas huérfanas medidas en producción (p. ej. `/app/crm/configuracion`).
    const paginas = moduloPorCodigo('crm')!.paginas;
    const visibles = filtrarPaginasActivas('crm', paginas, {
      modulosActivos: ['crm'],
      paginasOcultas: { crm: ['/app/crm/configuracion', '/app/crm/ya-no-existe'] },
    });
    expect(visibles.length).toBe(paginas.length);
  });
});

describe('guardarraíl: paginaActiva() es el único camino', () => {
  // Lectores conocidos de la activación de páginas por organización. Si añades
  // uno, entra aquí Y usa `paginaActiva()`/`filtrarPaginasActivas()`.
  const LECTORES = [
    'src/lib/navigation/filtrar.ts',
    'src/lib/utils/moduleRedirect.ts',
    'src/lib/ai/agent/tools/navegacion.ts',
    'src/components/hrm/JobPositionPermissionsManager.tsx',
    'src/app/app/organizacion/modulos/page.tsx',
  ];

  test.each(LECTORES)('%s pasa por el helper', (ruta) => {
    const codigo = leer(ruta);
    expect(codigo).toMatch(/paginaActiva|filtrarPaginasActivas/);
  });

  test.each(LECTORES)('%s no reimplementa la comprobación a mano', (ruta) => {
    const codigo = leer(ruta);
    // La firma de la semántica vieja: preguntar si un href está DENTRO de la
    // lista de activas. Si vuelve a aparecer en un lector, la ausencia de fila
    // volvería a ocultar y el menú y el asistente dirían cosas distintas.
    expect(codigo).not.toMatch(/paginasActivas/);
    expect(codigo).not.toMatch(/activeModulePages/);
    expect(codigo).not.toMatch(/activeHrefs/);
    expect(codigo).not.toMatch(/getActiveModulePages/);
  });

  test('ningún otro archivo de src/ lee getActiveModulePages para decidir visibilidad', () => {
    // El único consumidor legítimo que queda es el propio servicio (que lo
    // define) y la ruta de API que lo expone para auditoría.
    const permitidos = new Set([
      'src/lib/services/moduleManagementService.ts',
      'src/app/api/modules/pages/route.ts',
    ]);
    const salida = execSync('git grep -l "getActiveModulePages" -- src', {
      cwd: RAIZ,
      encoding: 'utf8',
    })
      .split('\n')
      .map((l) => l.trim().replace(/\\/g, '/'))
      .filter(Boolean)
      .filter((f) => !f.includes('__tests__'));
    const inesperados = salida.filter((f) => !permitidos.has(f));
    expect(inesperados).toEqual([]);
  });
});
