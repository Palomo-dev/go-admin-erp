/** Filtros de Conexiones en la URL (2026-11-09): chips, chips rápidos de Actividad y filtrado local. */
import {
  CLAVES_A_LIMPIAR,
  cambiosPorFiltroRapido,
  chipsDeFiltros,
  clavePlaceholderBusqueda,
  filtrarCatalogoPorEstado,
  filtrarConexiones,
  filtrarLlaves,
  filtrarWebhooks,
  filtroRapidoDeUrl,
  grupoDeUrl,
} from '../filtrosConexiones';
import type { ConexionResumen, ItemCatalogo } from '@/lib/services/integrations/conexiones/clienteConexiones';

const textos = {
  chip: (clave: string, valor?: string) => (valor ? `${clave}: ${valor}` : clave),
  valor: (clave: string, v: string) => `${clave}/${v}`,
  nombreConexion: (id: string) => `cx ${id}`,
};

const conexion = (extra: Partial<ConexionResumen>): ConexionResumen =>
  ({ id: 'c1', nombre: 'Wompi prod', proveedor: 'wompi', proveedorNombre: 'Wompi', estado: 'connected', necesitaAtencion: false, usadaPor: [], eventos24h: 0, ...extra }) as ConexionResumen;

describe('chips por pestaña', () => {
  it('catálogo: grupo y estado; mis conexiones: estado, grupo y atención', () => {
    expect(chipsDeFiltros('catalogo', { grupo: 'cobros', estado: 'conectado' }, textos)).toEqual([
      { clave: 'grupo', etiqueta: 'grupo: grupo/cobros' },
      { clave: 'estado', etiqueta: 'estado: estadoCatalogo/conectado' },
    ]);
    expect(chipsDeFiltros('mis', { estado: 'pausada', atencion: '1', grupo: 'inventado' }, textos).map((c) => c.clave)).toEqual(['estado', 'atencion']);
  });

  it('actividad: conexión, con error, resultado, sentido y periodo; desarrolladores: estado de las llaves', () => {
    expect(chipsDeFiltros('actividad', { conexion: 'c1', errores: '1', estado: 'error', sentido: 'inbound', periodo: '7d' }, textos).map((c) => c.etiqueta)).toEqual([
      'conexion: cx c1',
      'errores',
      'resultado: estadoEvento/error',
      'sentido: sentido/inbound',
      'periodo: periodo/7d',
    ]);
    expect(chipsDeFiltros('desarrolladores', { estado: 'revocadas' }, textos)).toEqual([{ clave: 'estado', etiqueta: 'estado: estadoLlave/revocadas' }]);
    expect(chipsDeFiltros('desarrolladores', { estado: 'pausada' }, textos)).toEqual([]);
  });

  it('actividad (85-57): periodo de 30 días, «Solo webhooks» y «Solo pruebas de conexión»', () => {
    expect(chipsDeFiltros('actividad', { periodo: '30d', webhooks: '1', pruebas: '1' }, textos).map((c) => c.clave)).toEqual(['periodo', 'webhooks', 'pruebas']);
    expect(chipsDeFiltros('actividad', { periodo: '90d', webhooks: 'si' }, textos)).toEqual([]);
    expect(CLAVES_A_LIMPIAR).toMatchObject({ webhooks: null, pruebas: null });
  });

  it('un valor fuera de la lista blanca no pinta chip', () => {
    expect(chipsDeFiltros('catalogo', { estado: 'drop table' }, textos)).toEqual([]);
    expect(grupoDeUrl({ grupo: 'x' })).toBe('todos');
  });
});

describe('chips rápidos de Actividad (85-14)', () => {
  it('se derivan de la URL y son excluyentes entre sí', () => {
    expect(filtroRapidoDeUrl({})).toBe('todas');
    expect(filtroRapidoDeUrl({ errores: '1', conexion: 'c1' })).toBe('errores');
    expect(filtroRapidoDeUrl({ periodo: 'hoy' })).toBe('hoy');
    expect(filtroRapidoDeUrl({ conexion: 'c1' })).toBe('c:c1');
    expect(cambiosPorFiltroRapido('c:c1')).toEqual({ errores: null, periodo: null, conexion: 'c1' });
    expect(cambiosPorFiltroRapido('hoy')).toEqual({ errores: null, periodo: 'hoy', conexion: null });
    expect(cambiosPorFiltroRapido('todas')).toEqual({ errores: null, periodo: null, conexion: null });
  });

  it('cambiar de pestaña limpia búsqueda, filtros, página y evento abierto', () => {
    expect(Object.keys(CLAVES_A_LIMPIAR)).toEqual(expect.arrayContaining(['q', 'pagina', 'tamano', 'evento', 'grupo', 'estado', 'conexion', 'periodo']));
    expect(Object.values(CLAVES_A_LIMPIAR).every((v) => v === null)).toBe(true);
    expect(clavePlaceholderBusqueda('desarrolladores')).toBe('desarrolladores.buscar');
  });
});

describe('filtrado local', () => {
  it('catálogo por estado', () => {
    const items = [{ id: 'a', estado: 'conectado' }, { id: 'b', estado: 'disponible' }] as ItemCatalogo[];
    expect(filtrarCatalogoPorEstado(items, { estado: 'disponible' }).map((i) => i.id)).toEqual(['b']);
    expect(filtrarCatalogoPorEstado(items, {}).map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('mis conexiones por estado, grupo, atención y texto', () => {
    const lista = [
      conexion({ id: 'c1' }),
      conexion({ id: 'c2', proveedor: 'booking', proveedorNombre: 'Booking', nombre: 'Hotel', estado: 'paused' }),
      conexion({ id: 'c3', necesitaAtencion: true, estado: 'connected' }),
    ];
    const grupoDe = (p: string) => (p === 'wompi' ? 'cobros' : 'hospedaje') as 'cobros' | 'hospedaje';
    expect(filtrarConexiones(lista, { estado: 'pausada' }, '', grupoDe).map((c) => c.id)).toEqual(['c2']);
    expect(filtrarConexiones(lista, { grupo: 'cobros' }, '', grupoDe).map((c) => c.id)).toEqual(['c1', 'c3']);
    expect(filtrarConexiones(lista, { atencion: '1' }, '', grupoDe).map((c) => c.id)).toEqual(['c3']);
    expect(filtrarConexiones(lista, { estado: 'conErrores' }, '', grupoDe).map((c) => c.id)).toEqual(['c3']);
    expect(filtrarConexiones(lista, {}, 'hotel', grupoDe).map((c) => c.id)).toEqual(['c2']);
  });

  it('llaves activas/revocadas y webhooks por nombre o dirección', () => {
    const llaves = [
      { id: 'k1', nombre: 'Tienda', mascara: 'goak_··3f2a', activa: true, revocada: null },
      { id: 'k2', nombre: 'Vieja', mascara: 'goak_··07be', activa: false, revocada: '2026-01-01' },
    ];
    expect(filtrarLlaves(llaves, { estado: 'activas' }, '').map((k) => k.id)).toEqual(['k1']);
    expect(filtrarLlaves(llaves, { estado: 'revocadas' }, '').map((k) => k.id)).toEqual(['k2']);
    expect(filtrarLlaves(llaves, {}, '07be').map((k) => k.id)).toEqual(['k2']);
    const webhooks = [{ nombre: 'ERP', url: 'https://erp.ejemplo.co/hooks' }, { nombre: 'Bodega', url: 'https://bodega.ejemplo.co/stock' }];
    expect(filtrarWebhooks(webhooks, 'stock').map((w) => w.nombre)).toEqual(['Bodega']);
    expect(filtrarWebhooks(webhooks, '')).toHaveLength(2);
  });
});
