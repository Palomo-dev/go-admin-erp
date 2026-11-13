import { filtrarFragmentos, resumenFragmentos, revisarFilasImportacion, tramoPrioridad } from '../conocimiento/conocimientoLogica';
import { creditosCobrados, diasDeRango, estadoTrabajo, puedeCancelar, puedeReintentar, tonoEstadoTrabajo } from '../ia/trabajos/trabajosLogica';
import { filtrarVisitantes } from '../widget/visitantesLogica';
import { celdaCsv, humanizarAccion } from '../audit/auditoriaLogica';

const frag = (p: Partial<{ title: string; content: string; tags: string[]; is_active: boolean; has_embedding: boolean; usage_count: number }>) => ({
  title: 'T',
  content: 'C',
  tags: [],
  is_active: true,
  has_embedding: false,
  usage_count: 0,
  ...p,
});

describe('Conocimiento', () => {
  it('busca sin tildes en título, contenido y etiquetas, y filtra por etiqueta', () => {
    const fs = [frag({ title: 'Envío a Medellín', tags: ['envíos'] }), frag({ title: 'Pagos', content: 'Nequi' })];
    expect(filtrarFragmentos(fs, 'medellin', null)).toHaveLength(1);
    expect(filtrarFragmentos(fs, 'NEQUI', null)).toHaveLength(1);
    expect(filtrarFragmentos(fs, '', 'envíos')).toHaveLength(1);
  });
  it('resume activos, listos y usos', () => {
    expect(resumenFragmentos([frag({ has_embedding: true, usage_count: 3 }), frag({ is_active: false, usage_count: 2 })])).toEqual({ total: 2, activos: 1, listos: 1, usos: 5, pctListos: 50 });
  });
  it('marca las filas de importación con error', () => {
    expect(revisarFilasImportacion([{ title: 'A', content: 'x' }, { title: ' ', content: 'x' }, { title: 'B', content: '' }]).map((r) => r.estado)).toEqual(['lista', 'faltaTitulo', 'faltaContenido']);
  });
  it('tramo de prioridad', () => {
    expect([tramoPrioridad(8), tramoPrioridad(5), tramoPrioridad(2)]).toEqual(['alta', 'media', 'baja']);
  });
});

describe('Trabajos de IA (valores del CHECK de ai_jobs)', () => {
  it('processing es el estado real; running se trata igual', () => {
    expect(estadoTrabajo('running')).toBe('processing');
    expect(puedeCancelar({ status: 'processing' })).toBe(true);
    expect(puedeCancelar({ status: 'completed' })).toBe(false);
    expect(puedeReintentar({ status: 'failed' })).toBe(true);
    expect(tonoEstadoTrabajo('failed')).toBe('peligro');
  });
  it('no inventa créditos', () => {
    expect(creditosCobrados({ metadata: {} })).toBeNull();
    expect(creditosCobrados({ metadata: { credits_charged: 2 } })).toBe(2);
  });
  it('rango de fechas', () => {
    expect([diasDeRango('hoy'), diasDeRango('7d'), diasDeRango('todo')]).toEqual([0, 6, null]);
  });
});

describe('Visitantes y auditoría', () => {
  const s = (p: object) => ({ is_active: false, customer_id: null, customer: undefined, channel: undefined, ...p });
  it('filtra visitantes por estado, cliente y texto', () => {
    const lista = [s({ is_active: true, customer_id: 'c', customer: { id: 'c', full_name: 'Natalia', email: null } }), s({})];
    expect(filtrarVisitantes(lista, { busqueda: '', estado: 'enLinea', cliente: 'todos' })).toHaveLength(1);
    expect(filtrarVisitantes(lista, { busqueda: '', estado: 'todos', cliente: 'anonimos' })).toHaveLength(1);
    expect(filtrarVisitantes(lista, { busqueda: 'natalia', estado: 'todos', cliente: 'todos' })).toHaveLength(1);
  });
  it('acciones sin traducción y CSV', () => {
    expect(humanizarAccion('update_website_settings')).toBe('Update website settings');
    expect(celdaCsv('a "b"')).toBe('"a ""b"""');
  });
});
