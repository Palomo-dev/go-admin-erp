/**
 * GO Assistant — Fase 6: explicaciones sobre el estado real (§12).
 *
 * Lo que se prueba aquí es lo que rompió el ERP antes: **hablar de memoria**.
 * El bug original (C10) era un prompt con módulos y rutas escritos a mano, así
 * que a un gimnasio se le explicaba Inventario → Productos. Las pruebas van
 * dirigidas a eso:
 *
 * 1. Ninguna ruta ni ningún módulo está escrito en el archivo de herramientas.
 * 2. Un módulo que la organización no tiene NO se explica: se dice cuáles sí.
 * 3. Una consulta que falla devuelve "no pude comprobarlo", nunca "no hay".
 *
 * El cliente de base de datos es un doble: estas herramientas solo leen, así
 * que basta con devolverles filas y comprobar lo que concluyen.
 */

import fs from 'fs';
import path from 'path';
import {
  estadoConfiguracion,
  explicarConfiguracion,
  listarModulosActivos,
  NAVEGACION_TOOLS,
} from '@/lib/ai/agent/tools/navegacion';
import type { ToolContext } from '@/lib/ai/agent/types';
import { MODULE_PAGES } from '@/lib/config/modulePages';

/**
 * Páginas que una organización ve de un módulo: TODO el catálogo menos lo que
 * esté apagado a propósito. Desde el 2026-09-23 la ausencia de fila en
 * `organization_module_pages` significa «activa» (ver
 * `src/lib/navigation/paginaActiva.ts`), así que estas pruebas ya no pueden
 * suponer que la lista de la organización es la lista de lo que existe.
 */
function visibles(codigo: string, apagadas: string[] = []): Array<{ nombre: string; ruta: string }> {
  return (MODULE_PAGES[codigo] ?? [])
    .filter((p) => !apagadas.includes(p.href))
    .map((p) => ({ nombre: p.name, ruta: p.href }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

// ---------------------------------------------------------------------------
// Doble del cliente de Supabase
// ---------------------------------------------------------------------------

interface Respuesta {
  data?: unknown;
  count?: number | null;
  error?: { message: string } | null;
}

/** Lo que devolverá cada tabla. `count` para los `head: true`. */
type Tablas = Record<string, Respuesta>;

interface Espia {
  /** Filtros aplicados, para comprobar que se acota por organización. */
  filtros: Array<[string, unknown]>;
  tablasConsultadas: string[];
}

function fakeSupabase(tablas: Tablas, espia: Espia) {
  const constructor = (tabla: string) => {
    espia.tablasConsultadas.push(tabla);
    let respuesta: Respuesta = tablas[tabla] ?? { data: [], count: 0, error: null };

    const builder: Record<string, unknown> = {};
    const encadenable = () => builder;

    builder.select = encadenable;
    builder.order = encadenable;
    builder.limit = encadenable;
    builder.eq = (col: string, val: unknown) => {
      espia.filtros.push([col, val]);
      return builder;
    };
    // `in` sí filtra de verdad: es como la herramienta acota las páginas al
    // módulo pedido, y un doble que lo ignorara no probaría nada.
    builder.in = (col: string, vals: unknown[]) => {
      if (Array.isArray(respuesta.data)) {
        const filas = respuesta.data as Array<Record<string, unknown>>;
        respuesta = { ...respuesta, data: filas.filter((f) => vals.includes(f[col])) };
      }
      return builder;
    };
    // Await sobre el builder: es como resuelve postgrest-js.
    builder.then = (
      resolver: (r: Respuesta) => unknown,
      rechazar?: (e: unknown) => unknown
    ) => Promise.resolve(respuesta).then(resolver, rechazar);

    return builder;
  };

  return { from: constructor };
}

function ctx(supabase: unknown): ToolContext {
  return {
    organizationId: 42,
    branchId: null,
    userId: 'usuario-de-prueba',
    supabase: supabase as ToolContext['supabase'],
    capabilities: {
      level: 'read',
      enabledTools: null,
      permissions: new Set<string>(),
      isAdmin: false,
      activeModules: new Set<string>(),
      undoWindowMinutes: 15,
      bulkMaxRows: 500,
    },
    locale: 'es-CO',
    currency: 'COP',
    channel: 'text',
    conversationId: null,
  };
}

/**
 * Módulos de una organización de membresías TAL COMO ESTÁN EN LA BASE
 * (2026-09-29): «gym» se generalizó como «memberships» y un disparador mantiene
 * activas las dos filas (43 organizaciones). El asistente tiene que ver UN
 * módulo, el canónico, con su nombre vigente.
 */
const MODULOS_DE_GIMNASIO = {
  data: [
    { module_code: 'gym', modules: { name: 'Gimnasio', description: 'Gestión de gimnasios', is_core: false, rank: 10 } },
    {
      module_code: 'memberships',
      modules: { name: 'Membresías', description: 'Gimnasios, academias, clubes, coworking y spa', is_core: false, rank: 10 },
    },
    {
      module_code: 'configuracion',
      modules: { name: 'Configuración', description: null, is_core: true, rank: 150 },
    },
  ],
  error: null,
};

/**
 * Filas de `organization_module_pages` del gimnasio: son las páginas APAGADAS
 * a propósito, porque la consulta las pide con `is_active = false`. Una está
 * guardada bajo el código viejo: sigue contando como apagada.
 */
const APAGADAS_DEL_GIMNASIO = {
  data: [
    { module_code: 'memberships', page_href: '/app/membresias/clases' },
    { module_code: 'gym', page_href: '/app/membresias/reservas' },
  ],
  error: null,
};

const APAGADAS = ['/app/membresias/clases', '/app/membresias/reservas'];

function espiaNuevo(): Espia {
  return { filtros: [], tablasConsultadas: [] };
}

// ---------------------------------------------------------------------------

describe('F6 — contrato de las herramientas', () => {
  it('las tres son de solo lectura, sin módulo y disponibles por voz', () => {
    expect(NAVEGACION_TOOLS).toHaveLength(3);
    for (const t of NAVEGACION_TOOLS) {
      expect(t.risk).toBe('low');
      expect(t.minLevel).toBe('read');
      // Explicar el ERP no puede depender de tener contratado un módulo: es
      // justo la pregunta que hace quien todavía no tiene nada montado.
      expect(t.requiredModule).toBeNull();
      expect(t.availableInVoice).toBe(true);
      expect(t.name).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(t.description.length).toBeGreaterThan(30);
    }
  });

  it('los nombres son los que declara el §12', () => {
    expect(NAVEGACION_TOOLS.map((t) => t.name).sort()).toEqual([
      'estado_configuracion',
      'explicar_configuracion',
      'listar_modulos_activos',
    ]);
  });

  it('explicar_configuracion valida su argumento', () => {
    expect(explicarConfiguracion.parseArgs({ modulo: ' inventario ' })).toEqual({ modulo: 'inventario' });
    expect(explicarConfiguracion.parseArgs({ modulo: '' })).toBeNull();
    expect(explicarConfiguracion.parseArgs({ modulo: 7 })).toBeNull();
    expect(explicarConfiguracion.parseArgs(null)).toBeNull();
    expect(explicarConfiguracion.parseArgs({})).toBeNull();
  });

  it('las que no reciben argumentos aceptan cualquier ruido del modelo', () => {
    expect(listarModulosActivos.parseArgs(undefined)).toEqual({});
    expect(estadoConfiguracion.parseArgs({ sobra: 1 })).toEqual({});
  });
});

describe('F6 — preview no escribe (invariante 1)', () => {
  it('ninguna de las tres toca la base en preview()', async () => {
    const prohibido = new Proxy(
      {},
      {
        get() {
          throw new Error('preview() no puede tocar la base de datos');
        },
      }
    );

    for (const t of NAVEGACION_TOOLS) {
      const preview = await t.preview(ctx(prohibido), { modulo: 'inventory' } as never);
      expect(preview.reversible).toBe(true);
      expect(preview.estimatedCredits).toBe(0);
    }
  });
});

describe('F6 — nada de módulos ni de rutas cableadas (C10)', () => {
  const fuente = fs.readFileSync(
    path.join(process.cwd(), 'src', 'lib', 'ai', 'agent', 'tools', 'navegacion.ts'),
    'utf8'
  );
  // Los comentarios explican el porqué y citan rutas de ejemplo; lo que no
  // puede haber es una ruta en el CÓDIGO.
  const codigo = fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('no hay ninguna ruta del ERP escrita en el código', () => {
    const rutas = codigo.match(/['"`]\/app\/[^'"`]*['"`]/g) ?? [];
    expect(rutas).toEqual([]);
  });

  it('las rutas se leen de organization_module_pages', () => {
    expect(codigo).toContain('organization_module_pages');
  });

  it('los módulos se leen de organization_modules', () => {
    expect(codigo).toContain('organization_modules');
  });
});

describe('F6 — listar_modulos_activos', () => {
  it('devuelve los módulos de la organización con sus pantallas reales', async () => {
    const espia = espiaNuevo();
    const db = fakeSupabase(
      {
        organization_modules: MODULOS_DE_GIMNASIO,
        organization_module_pages: APAGADAS_DEL_GIMNASIO,
      },
      espia
    );

    const res = await listarModulosActivos.execute(ctx(db), {});
    expect(res.ok).toBe(true);
    expect(res.message).toContain('Membresías');
    // El código viejo no aparece como un módulo aparte y sin pantallas.
    expect(res.message).not.toContain('Gimnasio');

    const data = res.data as { total: number; modulos: Array<{ codigo: string; paginas: unknown[] }> };
    expect(data.total).toBe(2);
    // Ordenados por `rank`: membresías (10) antes que configuración (150).
    expect(data.modulos.map((m) => m.codigo)).toEqual(['memberships', 'configuracion']);
    // Todas las del catálogo menos las dos apagadas: una página que nadie
    // apagó se ve, aunque la organización no tenga fila para ella.
    expect(data.modulos[0].paginas).toEqual(
      visibles('memberships', APAGADAS)
    );
    expect(data.modulos[0].paginas).toContainEqual({
      nombre: 'Membresías',
      ruta: '/app/membresias/membresias',
    });
    expect(data.modulos[0].paginas).not.toContainEqual({ nombre: 'Clases', ruta: '/app/membresias/clases' });
    // La apagada bajo el código viejo también se respeta.
    expect(data.modulos[0].paginas).not.toContainEqual({ nombre: 'Reservas', ruta: '/app/membresias/reservas' });
  });

  it('siempre acota por la organización del contexto', async () => {
    const espia = espiaNuevo();
    const db = fakeSupabase({ organization_modules: MODULOS_DE_GIMNASIO }, espia);
    await listarModulosActivos.execute(ctx(db), {});
    expect(espia.filtros).toContainEqual(['organization_id', 42]);
  });

  it('si la consulta falla lo dice, no responde con una lista vacía', async () => {
    const espia = espiaNuevo();
    const db = fakeSupabase(
      { organization_modules: { data: null, error: { message: 'RLS' } } },
      espia
    );
    const res = await listarModulosActivos.execute(ctx(db), {});
    expect(res.ok).toBe(false);
    expect(res.errorCode).toBe('query_error');
  });
});

describe('F6 — estado_configuracion', () => {
  it('marca listo lo que tiene filas y pendiente lo que no', async () => {
    const espia = espiaNuevo();
    const db = fakeSupabase(
      {
        organization_modules: {
          data: [
            {
              module_code: 'finance',
              modules: { name: 'Finanzas', description: null, is_core: false, rank: 400 },
            },
          ],
          error: null,
        },
        // Nada apagado: el catálogo de finanzas entero está a la vista.
        organization_module_pages: { data: [], error: null },
        branches: { count: 2, error: null },
        organization_currencies: { count: 1, error: null },
        organization_payment_methods: { count: 3, error: null },
        organization_taxes: { count: 0, error: null },
        invoice_sequences: { count: 0, error: null },
        electronic_invoicing_config: { count: 0, error: null },
      },
      espia
    );

    const res = await estadoConfiguracion.execute(ctx(db), {});
    expect(res.ok).toBe(true);

    const data = res.data as {
      total: number;
      listos: number;
      puntos: Array<{ clave: string; estado: string; ruta: string | null; por_que_importa: string | null }>;
    };
    expect(data.total).toBe(6);
    expect(data.listos).toBe(3);

    const porClave = Object.fromEntries(data.puntos.map((p) => [p.clave, p]));
    expect(porClave.sucursales.estado).toBe('listo');
    expect(porClave.impuestos.estado).toBe('pendiente');
    // Lo pendiente explica por qué importa; lo listo no da la charla.
    expect(porClave.impuestos.por_que_importa).toBeTruthy();
    expect(porClave.sucursales.por_que_importa).toBeNull();
    // La ruta sale de las páginas de ESTA organización.
    expect(porClave.impuestos.ruta).toBe('/app/finanzas/impuestos');
    expect(porClave.metodos_pago.ruta).toBe('/app/finanzas/metodos-pago');
    // Antes esta prueba daba por hecho que sin fila no hay pantalla; hoy
    // `facturacion_electronica` SÍ es una página del catálogo de finanzas y
    // nadie la apagó, así que la ruta existe.
    expect(porClave.facturacion_electronica.ruta).toBe('/app/finanzas/facturacion-electronica');

    expect(res.message).toContain('Faltan 3 de 6');
  });

  it('una consulta rota es "no pude comprobarlo", no "no hay"', async () => {
    const espia = espiaNuevo();
    const db = fakeSupabase(
      {
        organization_module_pages: { data: [], error: null },
        branches: { count: null, error: { message: 'permission denied' } },
        organization_currencies: { count: 1, error: null },
        organization_payment_methods: { count: 1, error: null },
        organization_taxes: { count: 1, error: null },
        invoice_sequences: { count: 1, error: null },
        electronic_invoicing_config: { count: 1, error: null },
      },
      espia
    );

    const res = await estadoConfiguracion.execute(ctx(db), {});
    const data = res.data as { puntos: Array<{ clave: string; estado: string; detalle: string }> };
    const sucursales = data.puntos.find((p) => p.clave === 'sucursales');

    expect(sucursales?.estado).toBe('desconocido');
    expect(sucursales?.detalle).toBe('No se pudo comprobar.');
    // Y no se cuenta como pendiente: no se le dice al cliente que le falta algo
    // que en realidad no se pudo mirar.
    expect(res.message).not.toContain('Sucursales');
  });

  it('todo configurado se dice en una frase', async () => {
    const espia = espiaNuevo();
    const lleno = { count: 1, error: null };
    const db = fakeSupabase(
      {
        organization_module_pages: { data: [], error: null },
        branches: lleno,
        organization_currencies: lleno,
        organization_payment_methods: lleno,
        organization_taxes: lleno,
        invoice_sequences: lleno,
        electronic_invoicing_config: lleno,
      },
      espia
    );

    const res = await estadoConfiguracion.execute(ctx(db), {});
    expect(res.message).toBe('La configuración de arranque está completa.');
  });
});

describe('F6 — explicar_configuracion', () => {
  it('un gimnasio NO recibe una explicación de inventario (§14, aceptación de F6)', async () => {
    const espia = espiaNuevo();
    const db = fakeSupabase({ organization_modules: MODULOS_DE_GIMNASIO }, espia);

    const res = await explicarConfiguracion.execute(ctx(db), { modulo: 'inventario' });
    expect(res.ok).toBe(true);

    const data = res.data as { encontrado: boolean; modulos_activos: Array<{ codigo: string }> };
    expect(data.encontrado).toBe(false);
    // Se le dice lo que SÍ tiene, en vez de dejarlo en "no puedo".
    expect(data.modulos_activos.map((m) => m.codigo)).toEqual(['memberships', 'configuracion']);
    expect(res.message).toContain('Membresías');
    // Y en ningún caso se menciona una pantalla de inventario.
    expect(res.message).not.toContain('/app/inventario');
    expect(espia.tablasConsultadas).not.toContain('products');
  });

  it('acepta el nombre en español además del código', async () => {
    const espia = espiaNuevo();
    const db = fakeSupabase(
      {
        organization_modules: MODULOS_DE_GIMNASIO,
        organization_module_pages: APAGADAS_DEL_GIMNASIO,
      },
      espia
    );

    const res = await explicarConfiguracion.execute(ctx(db), { modulo: 'Membresías' });
    const data = res.data as { encontrado: boolean; modulo: { codigo: string } };
    expect(data.encontrado).toBe(true);
    expect(data.modulo.codigo).toBe('memberships');
  });

  it('el código viejo «gym» encuentra el módulo canónico', async () => {
    const espia = espiaNuevo();
    const db = fakeSupabase({ organization_modules: MODULOS_DE_GIMNASIO, organization_module_pages: APAGADAS_DEL_GIMNASIO }, espia);
    const res = await explicarConfiguracion.execute(ctx(db), { modulo: 'gym' });
    const data = res.data as { encontrado: boolean; modulo: { codigo: string } };
    expect(data.encontrado).toBe(true);
    expect(data.modulo.codigo).toBe('memberships');
  });

  it('para un módulo con comprobaciones propias devuelve qué falta y dónde', async () => {
    const espia = espiaNuevo();
    const db = fakeSupabase(
      {
        organization_modules: {
          data: [
            {
              module_code: 'inventory',
              modules: { name: 'Inventario', description: null, is_core: false, rank: 300 },
            },
          ],
          error: null,
        },
        // Apagadas a propósito: dos pantallas de trazabilidad.
        organization_module_pages: {
          data: [
            { module_code: 'inventory', page_href: '/app/inventario/lotes' },
            { module_code: 'inventory', page_href: '/app/inventario/seriales' },
          ],
          error: null,
        },
        products: { count: 120, error: null },
        categories: { count: 0, error: null },
        suppliers: { count: 4, error: null },
      },
      espia
    );

    const res = await explicarConfiguracion.execute(ctx(db), { modulo: 'inventory' });
    const data = res.data as {
      pantallas: Array<{ nombre: string; ruta: string }>;
      puntos: Array<{ titulo: string; estado: string; ruta: string | null }>;
    };

    // El catálogo de inventario menos las dos apagadas. Antes esta prueba
    // esperaba 3 —las filas de la organización— y con eso se colaba el defecto:
    // una pantalla sin fila desaparecía del asistente.
    expect(data.pantallas).toEqual(
      visibles('inventory', ['/app/inventario/lotes', '/app/inventario/seriales'])
    );
    expect(data.pantallas.map((p) => p.ruta)).toContain('/app/inventario/productos');
    expect(data.pantallas.map((p) => p.ruta)).not.toContain('/app/inventario/lotes');
    const categorias = data.puntos.find((p) => p.titulo === 'Categorías');
    expect(categorias?.estado).toBe('pendiente');
    expect(categorias?.ruta).toBe('/app/inventario/categorias');
    expect(data.puntos.find((p) => p.titulo === 'Productos')?.estado).toBe('listo');
    expect(res.message).toContain('Categorías');
  });

  it('un módulo sin comprobaciones propias se explica igual, con sus pantallas', async () => {
    const espia = espiaNuevo();
    const db = fakeSupabase(
      {
        organization_modules: MODULOS_DE_GIMNASIO,
        organization_module_pages: APAGADAS_DEL_GIMNASIO,
      },
      espia
    );

    const res = await explicarConfiguracion.execute(ctx(db), { modulo: 'memberships' });
    const data = res.data as { encontrado: boolean; pantallas: unknown[]; puntos: unknown[] };
    expect(data.encontrado).toBe(true);
    expect(data.pantallas).toEqual(visibles('memberships', APAGADAS));
    // Sin extras declarados no se inventa ninguno.
    expect(data.puntos).toEqual([]);
    expect(res.ok).toBe(true);
  });
});
