/**
 * Namespace `chatModulo` (pestañas, Canales, Conocimiento, IA, Widget y
 * Auditoría del Chat): mismas claves en los cuatro idiomas y sin textos vacíos.
 */
import es from '../../../../messages/es.json';
import en from '../../../../messages/en.json';
import fr from '../../../../messages/fr.json';
import pt from '../../../../messages/pt.json';

type Arbol = { [k: string]: string | Arbol };
const hojas = (o: Arbol, pre = ''): [string, string][] =>
  Object.entries(o).flatMap(([k, v]) => (typeof v === 'string' ? [[pre + k, v] as [string, string]] : hojas(v, `${pre}${k}.`)));

const base = hojas((es as unknown as { chatModulo: Arbol }).chatModulo);

describe('chatModulo en 4 idiomas', () => {
  it('existe y tiene textos', () => {
    expect(base.length).toBeGreaterThan(300);
  });
  it.each([
    ['en', en],
    ['fr', fr],
    ['pt', pt],
  ])('%s tiene las mismas claves que es y ninguna vacía', (_l, m) => {
    const otras = hojas((m as unknown as { chatModulo: Arbol }).chatModulo);
    expect(otras.map(([k]) => k).sort()).toEqual(base.map(([k]) => k).sort());
    expect(otras.filter(([, v]) => !v.trim())).toEqual([]);
  });
  it('ningún texto parece una etiqueta HTML (next-intl lo tomaría como rich text)', () => {
    expect(base.filter(([, v]) => /<\/?[a-z]/i.test(v))).toEqual([]);
  });
});
