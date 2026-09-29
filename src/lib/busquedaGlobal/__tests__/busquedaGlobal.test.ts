/**
 * Buscador global — reglas puras: normalización sin tildes (la de la búsqueda
 * única de clientes), orden de páginas y grupos, visibilidad por módulos y
 * permisos, atajos de teclado y recientes por usuario + organización.
 */
import { CATALOGO_NAV } from '@/lib/navigation/catalog';
import { filtrarNavegacion } from '@/lib/navigation/filtrar';
import { ACCIONES_RAPIDAS, GRUPOS_ENTIDAD, TIPOS_ENTIDAD, type GrupoResultados } from '../definiciones';
import {
  accionAtajo,
  accionesPermitidas,
  coincideCampos,
  estadoBusqueda,
  filtrarPaginas,
  gruposPermitidos,
  ordenarGrupos,
  palabrasBusqueda,
  patronCandidato,
  rutaDentroDe,
  type TeclaPulsada,
} from '../logica';
import {
  agregarReciente,
  claveRecientes,
  filtrarRecientes,
  guardarRecientes,
  leerRecientes,
  MAX_RECIENTES,
  type Reciente,
} from '../recientes';

const hrefsCatalogo = new Set(CATALOGO_NAV.flatMap((m) => m.paginas.map((p) => p.href)));

describe('definiciones: toda página nombrada existe en el catálogo de navegación', () => {
  it.each(GRUPOS_ENTIDAD.flatMap((g) => g.paginas.map((p) => [g.tipo, p])))('grupo %s → %s', (_tipo, pagina) => {
    expect(hrefsCatalogo.has(pagina)).toBe(true);
  });
  it.each(ACCIONES_RAPIDAS.map((a) => [a.id, a.pagina]))('acción %s → %s', (_id, pagina) => {
    expect(hrefsCatalogo.has(pagina)).toBe(true);
  });
  it('cada tipo de entidad tiene su grupo, en el mismo orden', () => {
    expect(GRUPOS_ENTIDAD.map((g) => g.tipo)).toEqual([...TIPOS_ENTIDAD]);
  });
  it('toda acción lleva al menos un permiso y un destino dentro de su página o igual a ella', () => {
    for (const a of ACCIONES_RAPIDAS) {
      expect(a.permisos.length).toBeGreaterThan(0);
      expect(rutaDentroDe(a.href, a.pagina)).toBe(true);
    }
  });
});

describe('normalización coherente con la búsqueda única de clientes', () => {
  it('ignora tildes, mayúsculas y signos', () => {
    expect(coincideCampos(['Medellín'], palabrasBusqueda('MEDELLIN'))).toBe(true);
    expect(coincideCampos(['Facturación electrónica'], palabrasBusqueda('facturacion elec'))).toBe(true);
  });
  it('exige TODAS las palabras, en cualquier orden', () => {
    expect(coincideCampos(['Pérez Gómez, Ana'], palabrasBusqueda('ana perez'))).toBe(true);
    expect(coincideCampos(['Pérez Gómez, Ana'], palabrasBusqueda('ana lopez'))).toBe(false);
  });
  it('encuentra códigos con o sin separadores', () => {
    expect(coincideCampos(['FV-001'], palabrasBusqueda('fv001'))).toBe(true);
    expect(coincideCampos(['900.123.456-7'], palabrasBusqueda('9001234567'))).toBe(true);
    expect(coincideCampos(['900.123.456-7'], palabrasBusqueda('900.123'))).toBe(true);
  });
  it('sin palabras útiles no coincide nada', () => {
    expect(coincideCampos(['Algo'], palabrasBusqueda('(,)'))).toBe(false);
  });
});

describe('patronCandidato: seguro dentro de un .or() de PostgREST', () => {
  it('usa la palabra más larga y cambia vocales por «_» (trae «Medellín» con «medellin»)', () => {
    expect(patronCandidato(palabrasBusqueda('bodega medellin'))).toBe('%m_d_ll_n%');
  });
  it('una palabra numérica larga se intercala con «%»', () => {
    expect(patronCandidato(palabrasBusqueda('1.020.456'))).toBe('%1%0%2%0%4%5%6%');
  });
  it('nunca deja comas, puntos, paréntesis ni comillas', () => {
    for (const q of ['a,b)', 'x.or(id.eq.1)', "o'neil", 'name.ilike.*', '%_%', 'ñandú 12,5']) {
      const p = patronCandidato(palabrasBusqueda(q));
      if (p !== null) expect(p).toMatch(/^[a-z0-9_%]+$/);
    }
  });
  it('sin palabras útiles no hay patrón', () => {
    expect(patronCandidato(palabrasBusqueda('(,)'))).toBeNull();
  });
});

describe('filtrarPaginas', () => {
  const paginas = [
    { id: '1', name: 'Cuentas por cobrar', url: '/app/finanzas/cuentas-por-cobrar', description: 'Finanzas' },
    { id: '2', name: 'Facturas de venta', url: '/app/finanzas/facturas-venta', description: 'Finanzas' },
    { id: '3', name: 'Facturación electrónica', url: '/app/finanzas/facturacion-electronica', description: 'Finanzas' },
    { id: '4', name: 'Productos', url: '/app/inventario/productos', description: 'Inventario' },
  ];
  it('primero las que empiezan por la consulta; sin tildes', () => {
    expect(filtrarPaginas(paginas, 'factura').map((p) => p.id)).toEqual(['2', '3']);
    expect(filtrarPaginas(paginas, 'facturacion').map((p) => p.id)).toEqual(['3']);
  });
  it('busca también por el módulo y la ruta', () => {
    expect(filtrarPaginas(paginas, 'inventario').map((p) => p.id)).toEqual(['4']);
    expect(filtrarPaginas(paginas, 'cobrar').map((p) => p.id)).toEqual(['1']);
  });
  it('vacío o sin palabras: nada', () => {
    expect(filtrarPaginas(paginas, '')).toEqual([]);
    expect(filtrarPaginas(paginas, '  ,  ')).toEqual([]);
  });
});

describe('visibilidad: módulos activos, cargo y permisos (lo decide el servidor)', () => {
  const visibles = (modulosActivos: string[], paginasCargo: string[] | null = null) =>
    new Set(
      filtrarNavegacion({ modulosActivos, paginasOcultas: {}, modulosCargo: null, paginasCargo, capacidades: new Set() }).flatMap((s) =>
        s.modulos.flatMap((m) => m.paginas.map((p) => p.href)),
      ),
    );

  it('sin Finanzas no se buscan facturas; sin PMS ni reservas ni espacios', () => {
    const tipos = gruposPermitidos(visibles(['clientes', 'inventory'])).map((g) => g.tipo);
    expect(tipos).toEqual(expect.arrayContaining(['customer', 'product', 'supplier', 'category']));
    expect(tipos).not.toContain('invoice');
    expect(tipos).not.toContain('reservation');
    expect(tipos).not.toContain('space');
  });

  it('el cargo que no ve «Productos» no busca productos aunque el módulo esté activo', () => {
    const tipos = gruposPermitidos(visibles(['inventory'], ['/app/inventario/categorias'])).map((g) => g.tipo);
    expect(tipos).toEqual(['category']);
  });

  it('el parqueadero usa la primera página visible de sus candidatas', () => {
    const g = gruposPermitidos(visibles(['parking'])).find((x) => x.tipo === 'parking_vehicle');
    expect(g?.pagina).toBe('/app/parking/operacion');
  });

  it('acciones: página visible Y permiso; el admin no necesita permisos', () => {
    const hrefs = visibles(['pos', 'finance', 'clientes', 'inventory']);
    expect(accionesPermitidas({ hrefsVisibles: hrefs, permisos: new Set(), esAdmin: false })).toEqual([]);
    expect(accionesPermitidas({ hrefsVisibles: hrefs, permisos: new Set(['finance.create']), esAdmin: false }).map((a) => a.id)).toEqual([
      'nuevaFactura',
    ]);
    expect(accionesPermitidas({ hrefsVisibles: hrefs, permisos: new Set(), esAdmin: true }).map((a) => a.id)).toEqual([
      'nuevaVenta',
      'nuevaFactura',
      'nuevoCliente',
      'nuevoProducto',
    ]);
  });

  it('con el permiso pero sin el módulo, la acción no aparece', () => {
    const hrefs = visibles(['clientes']);
    expect(accionesPermitidas({ hrefsVisibles: hrefs, permisos: new Set(['finance.create', 'pos.create']), esAdmin: false })).toEqual([]);
  });
});

describe('ordenarGrupos', () => {
  const item = (tipo: GrupoResultados['tipo'], id: string) => ({ id, tipo, titulo: id, url: '/app/x', detalle: {} });
  it('orden del Figma, sin vacíos y con límite por grupo', () => {
    const r = ordenarGrupos([
      { tipo: 'invoice', items: [item('invoice', 'f1')] },
      { tipo: 'branch', items: [] },
      { tipo: 'customer', items: Array.from({ length: 8 }, (_, i) => item('customer', `c${i}`)) },
    ]);
    expect(r.map((g) => g.tipo)).toEqual(['customer', 'invoice']);
    expect(r[0].items).toHaveLength(5);
  });
});

describe('estadoBusqueda', () => {
  const base = { consulta: 'taladro', cargando: false, error: false, totalLocal: 0, totalServidor: 0 };
  it.each([
    [{ ...base, consulta: '' }, 'inicial'],
    [{ ...base, consulta: 't', totalLocal: 2 }, 'escribiendo'],
    [{ ...base, consulta: 't' }, 'sin-resultados'],
    [{ ...base, cargando: true }, 'cargando'],
    [{ ...base, error: true }, 'error'],
    [{ ...base, error: true, totalLocal: 1 }, 'resultados'],
    [{ ...base, totalServidor: 3 }, 'resultados'],
    [base, 'sin-resultados'],
  ])('%o → %s', (p, esperado) => {
    expect(estadoBusqueda(p)).toBe(esperado);
  });
});

describe('accionAtajo: Ctrl K, ⌘ K y «/» sin robar el foco', () => {
  const tecla = (p: Partial<TeclaPulsada>): TeclaPulsada => ({
    key: '',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    defaultPrevented: false,
    ...p,
  });
  it('Ctrl K y ⌘ K alternan, incluso escribiendo en un campo', () => {
    expect(accionAtajo(tecla({ key: 'k', ctrlKey: true }), true, false)).toBe('alternar');
    expect(accionAtajo(tecla({ key: 'K', metaKey: true }), false, true)).toBe('alternar');
    expect(accionAtajo(tecla({ key: 'k', ctrlKey: true, shiftKey: true }), false, false)).toBeNull();
  });
  it('«/» abre solo fuera de campos editables y con la paleta cerrada', () => {
    expect(accionAtajo(tecla({ key: '/' }), false, false)).toBe('abrir');
    expect(accionAtajo(tecla({ key: '/' }), true, false)).toBeNull();
    expect(accionAtajo(tecla({ key: '/' }), false, true)).toBeNull();
  });
  it('«/» cede al buscador de la página (SearchInput hace preventDefault antes)', () => {
    expect(accionAtajo(tecla({ key: '/', defaultPrevented: true }), false, false)).toBeNull();
  });
  it('durante una composición (IME) no hace nada', () => {
    expect(accionAtajo(tecla({ key: 'k', ctrlKey: true, isComposing: true }), false, false)).toBeNull();
  });
});

describe('recientes por usuario y organización', () => {
  const r = (url: string, titulo = url): Reciente => ({ tipo: 'page', id: url, titulo, url });
  const memoria = () => {
    const datos = new Map<string, string>();
    return { getItem: (k: string) => datos.get(k) ?? null, setItem: (k: string, v: string) => void datos.set(k, v), datos };
  };

  it('la clave separa usuario y organización; sin alguno no hay clave', () => {
    expect(claveRecientes('u1', 120)).not.toBe(claveRecientes('u1', 121));
    expect(claveRecientes('u1', 120)).not.toBe(claveRecientes('u2', 120));
    expect(claveRecientes(null, 120)).toBeNull();
    expect(claveRecientes('u1', null)).toBeNull();
  });

  it('agrega primero, sin duplicar la URL, con tope', () => {
    let lista: Reciente[] = [];
    for (let i = 0; i < MAX_RECIENTES + 2; i++) lista = agregarReciente(lista, r(`/app/p${i}`));
    lista = agregarReciente(lista, r('/app/p3', 'otra vez'));
    expect(lista).toHaveLength(MAX_RECIENTES);
    expect(lista[0]).toEqual(r('/app/p3', 'otra vez'));
    expect(lista.filter((x) => x.url === '/app/p3')).toHaveLength(1);
  });

  it('guarda y lee; JSON roto o almacenamiento bloqueado devuelven vacío sin lanzar', () => {
    const m = memoria();
    const clave = claveRecientes('u1', 120);
    expect(guardarRecientes(m, clave, [r('/app/clientes')])).toBe(true);
    expect(leerRecientes(m, clave)).toEqual([r('/app/clientes')]);
    m.datos.set(clave!, '{roto');
    expect(leerRecientes(m, clave)).toEqual([]);
    const bloqueado = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
    };
    expect(leerRecientes(bloqueado, clave)).toEqual([]);
    expect(guardarRecientes(bloqueado, clave, [r('/app/x')])).toBe(false);
    expect(leerRecientes(null, clave)).toEqual([]);
  });

  it('descarta entradas manipuladas o que apuntan fuera de la app', () => {
    const m = memoria();
    const clave = claveRecientes('u1', 120)!;
    m.datos.set(
      clave,
      JSON.stringify([r('/app/ok'), { tipo: 'page', id: 'x', titulo: 'x', url: 'https://malo.example' }, { tipo: 'otro', id: 'y', titulo: 'y', url: '/app/y' }, 5]),
    );
    expect(leerRecientes(m, clave).map((x) => x.url)).toEqual(['/app/ok']);
  });

  it('solo se enseñan los que caen en páginas que la persona ve hoy', () => {
    const lista = [
      r('/app/clientes/9f0c'),
      r('/app/finanzas/facturas-venta/1'),
      r('/app/inventario/productos'),
      r('/app/inventario/productos-viejos'),
    ];
    expect(filtrarRecientes(lista, ['/app/clientes', '/app/inventario/productos']).map((x) => x.url)).toEqual([
      '/app/clientes/9f0c',
      '/app/inventario/productos',
    ]);
  });
});
