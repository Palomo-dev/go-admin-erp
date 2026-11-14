/**
 * Funciones del Chat que volvieron tras el rediseño (auditoría del 2026-11-14,
 * docs/design/AUDITORIA-CHAT-FUNCIONES-PERDIDAS-2026-11-14.md): reglas puras y
 * textos `chatRecuperado` en los cuatro idiomas.
 */
import es from '../../../../messages/es.json';
import en from '../../../../messages/en.json';
import fr from '../../../../messages/fr.json';
import pt from '../../../../messages/pt.json';
import { addPlainDays } from '@/lib/utils/dateDisplay';
import { etiquetasDeFragmentos, filasNoCargadas, filtrarFragmentos, revisarFilasImportacion } from '../conocimiento/conocimientoLogica';
import { filtrarVisitantes } from '../widget/visitantesLogica';
import { ACTORES_AUDITORIA, diasDelFiltroAuditoria } from '../audit/auditoriaLogica';

const frag = (title: string, tags: string[]) => ({ title, content: '', tags, is_active: true, has_embedding: true, usage_count: 0 });

describe('Conocimiento: filtro por varias etiquetas', () => {
  const fs = [frag('A', ['envios', 'medellin']), frag('B', ['envios']), frag('C', ['pagos'])];
  test('con varias, el fragmento debe tenerlas todas', () => {
    expect(filtrarFragmentos(fs, '', ['envios', 'medellin']).map((f) => f.title)).toEqual(['A']);
    expect(filtrarFragmentos(fs, '', ['envios']).map((f) => f.title)).toEqual(['A', 'B']);
    expect(filtrarFragmentos(fs, '', [])).toHaveLength(3);
    expect(filtrarFragmentos(fs, '', null)).toHaveLength(3);
  });
  test('etiquetas disponibles sin repetir y ordenadas', () => {
    expect(etiquetasDeFragmentos(fs)).toEqual(['envios', 'medellin', 'pagos']);
  });
});

describe('Importar: filas que no se cargaron', () => {
  test('las de la vista previa y las del servidor, con la fila del archivo', () => {
    const revisadas = revisarFilasImportacion([
      { title: 'Uno', content: 'x' },
      { title: '', content: 'x' },
      { title: 'Tres', content: 'x' },
      { title: 'Cuatro', content: '' },
    ]);
    // El servidor recibió solo las válidas (filas 1 y 3) y rechazó la 2.ª enviada.
    const r = filasNoCargadas(revisadas, [
      { row: 2, message: 'duplicado' },
      { row: 0, message: 'Error de base de datos: x' },
    ]);
    expect(r).toEqual([
      { fila: 0, motivo: 'general' },
      { fila: 2, motivo: 'faltaTitulo' },
      { fila: 3, motivo: 'servidor', mensaje: 'duplicado' },
      { fila: 4, motivo: 'faltaContenido' },
    ]);
  });
});

describe('Visitantes del widget: filtro por canal', () => {
  const s = (id: string, canal: string) => ({ id, is_active: true, customer_id: null, customer: undefined, channel_id: canal, channel: { id: canal, name: canal, type: 'website' } });
  test('solo las sesiones del canal elegido; sin canal, todas', () => {
    const lista = [s('1', 'web-a'), s('2', 'web-b')];
    const base = { busqueda: '', estado: 'todos' as const, cliente: 'todos' as const };
    expect(filtrarVisitantes(lista, { ...base, canal: 'web-b' }).map((x) => x.id)).toEqual(['2']);
    expect(filtrarVisitantes(lista, { ...base, canal: null })).toHaveLength(2);
  });
});

describe('Auditoría: tipo de actor y fechas libres', () => {
  test('los tipos de actor tienen nombre en los 4 idiomas', () => {
    for (const m of [es, en, fr, pt]) {
      const actores = (m as unknown as { chatModulo: { auditoria: { actores: Record<string, string> } } }).chatModulo.auditoria.actores;
      for (const a of ACTORES_AUDITORIA) expect(actores[a]).toBeTruthy();
    }
  });
  test('Desde/Hasta incluye el último día y acepta el orden invertido', () => {
    expect(diasDelFiltroAuditoria('personalizado', '2026-11-14', { desde: '2026-11-01', hasta: '2026-11-10' }, addPlainDays)).toEqual({
      desde: '2026-11-01',
      hastaExclusivo: '2026-11-11',
    });
    expect(diasDelFiltroAuditoria('personalizado', '2026-11-14', { desde: '2026-11-10', hasta: '2026-11-01' }, addPlainDays)).toEqual({
      desde: '2026-11-01',
      hastaExclusivo: '2026-11-11',
    });
  });
  test('los atajos siguen igual', () => {
    expect(diasDelFiltroAuditoria('7d', '2026-11-14', null, addPlainDays)).toEqual({ desde: '2026-11-08' });
    expect(diasDelFiltroAuditoria('todo', '2026-11-14', null, addPlainDays)).toEqual({});
    expect(diasDelFiltroAuditoria('personalizado', '2026-11-14', null, addPlainDays)).toEqual({});
  });
});

type Arbol = { [k: string]: string | Arbol };
const hojas = (o: Arbol, pre = ''): [string, string][] =>
  Object.entries(o).flatMap(([k, v]) => (typeof v === 'string' ? [[pre + k, v] as [string, string]] : hojas(v, `${pre}${k}.`)));

describe('chatRecuperado en 4 idiomas', () => {
  const base = hojas((es as unknown as Record<string, Arbol>).chatRecuperado);
  it('existe', () => expect(base.length).toBeGreaterThan(40));
  it.each([
    ['en', en],
    ['fr', fr],
    ['pt', pt],
  ])('%s tiene las mismas claves y ninguna vacía', (_l, m) => {
    const otras = hojas((m as unknown as Record<string, Arbol>).chatRecuperado);
    expect(otras.map(([k]) => k).sort()).toEqual(base.map(([k]) => k).sort());
    expect(otras.filter(([, v]) => !v.trim() || /<\/?[a-z]/i.test(v))).toEqual([]);
  });
});
