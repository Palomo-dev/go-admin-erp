/**
 * Aviso del asistente: dos promociones se pisan solo si comparten producto
 * o categoría, sucursal, canal y vigencia, y ninguna es combinable.
 */
import { conflictosSolapados, franjasSeCruzan, semanasSeCruzan, seSolapan, type PromoSolape } from '../solapamiento';

function promo(parcial: Partial<PromoSolape> & Pick<PromoSolape, 'id'>): PromoSolape {
  return {
    name: parcial.id,
    is_combinable: false,
    is_active: true,
    applies_to: 'products',
    applies_to_web: true,
    applies_to_pos: true,
    applies_to_finances: false,
    rules: [{ rule_type: 'include_product', product_id: 1, category_id: null }],
    ...parcial,
  };
}

const catalogo = [
  { id: 10, parent_product_id: null, category_id: 3 },
  { id: 11, parent_product_id: 10, category_id: null },
];

describe('seSolapan', () => {
  it('dos no combinables del mismo producto se pisan', () => {
    const a = promo({ id: 'a' });
    const b = promo({ id: 'b' });
    expect(seSolapan(a, b)).toBe(true);
    expect(conflictosSolapados(a, [a, b])).toEqual([b]);
  });

  it('no avisa si alguna es combinable o si no hay producto en común', () => {
    const a = promo({ id: 'a', is_combinable: true });
    const b = promo({ id: 'b' });
    expect(seSolapan(a, b)).toBe(false);
    expect(conflictosSolapados(a, [b])).toEqual([]);
    const otro = promo({ id: 'c', rules: [{ rule_type: 'include_product', product_id: 2 }] });
    expect(seSolapan(b, otro)).toBe(false);
    expect(conflictosSolapados(b, [otro])).toEqual([]);
  });

  it('el padre de una variante y «todos los productos» se pisan', () => {
    const padre = promo({ id: 'padre', rules: [{ rule_type: 'include_product', product_id: 10 }] });
    const variante = promo({ id: 'variante', rules: [{ rule_type: 'include_product', product_id: 11 }] });
    expect(seSolapan(padre, variante, catalogo)).toBe(true);
    const todos = promo({ id: 'todos', applies_to: 'all', rules: [] });
    expect(seSolapan(todos, variante, catalogo)).toBe(true);
  });

  it('sucursal vacía es todas; canales o vigencias que no se cruzan no avisan', () => {
    const a = promo({ id: 'a', branches: [] });
    const b = promo({ id: 'b', branches: [4] });
    expect(seSolapan(a, b)).toBe(true);
    expect(seSolapan(promo({ id: 'a', branches: [1] }), promo({ id: 'b', branches: [2] }))).toBe(false);
    expect(seSolapan(
      promo({ id: 'a', applies_to_web: false, applies_to_pos: true, applies_to_finances: false }),
      promo({ id: 'b', applies_to_web: true, applies_to_pos: false, applies_to_finances: false }),
    )).toBe(false);
    expect(seSolapan(
      promo({ id: 'a', start_date: '2026-01-01', end_date: '2026-01-31' }),
      promo({ id: 'b', start_date: '2026-03-01', end_date: '2026-03-31' }),
    )).toBe(false);
  });

  it('las franjas que cruzan la medianoche se pisan con la madrugada', () => {
    const noche = promo({ id: 'noche', start_time: '22:00', end_time: '02:00' });
    const madrugada = promo({ id: 'madrugada', start_time: '01:00', end_time: '03:00' });
    const tarde = promo({ id: 'tarde', start_time: '14:00', end_time: '16:00' });
    expect(franjasSeCruzan(noche, madrugada)).toBe(true);
    expect(franjasSeCruzan(noche, tarde)).toBe(false);
    expect(seSolapan(noche, tarde)).toBe(false);
  });
});

describe('franjas que cruzan la medianoche se asignan al día de inicio', () => {
  it('«lunes a miércoles 18:00–02:00» se pisa con «jueves 00:00–03:00» (madrugada del jueves)', () => {
    const lunMie = promo({ id: 'a', applicable_days: ['monday', 'tuesday', 'wednesday'], start_time: '18:00', end_time: '02:00' });
    const juevesMadrugada = promo({ id: 'b', applicable_days: ['thursday'], start_time: '00:00', end_time: '03:00' });
    expect(semanasSeCruzan(lunMie, juevesMadrugada)).toBe(true);
    expect(seSolapan(lunMie, juevesMadrugada)).toBe(true);
  });
  it('no se pisa con «jueves 10:00–16:00» ni con «lunes 03:00–10:00»', () => {
    const lunMie = promo({ id: 'a', applicable_days: ['monday', 'tuesday', 'wednesday'], start_time: '18:00', end_time: '02:00' });
    expect(seSolapan(lunMie, promo({ id: 'b', applicable_days: ['thursday'], start_time: '10:00', end_time: '16:00' }))).toBe(false);
    expect(seSolapan(lunMie, promo({ id: 'c', applicable_days: ['monday'], start_time: '03:00', end_time: '10:00' }))).toBe(false);
  });
  it('domingo 22:00–02:00 llega al lunes de la semana siguiente', () => {
    const dom = promo({ id: 'a', applicable_days: ['sunday'], start_time: '22:00', end_time: '02:00' });
    expect(seSolapan(dom, promo({ id: 'b', applicable_days: ['monday'], start_time: '01:00', end_time: '05:00' }))).toBe(true);
    expect(seSolapan(dom, promo({ id: 'c', applicable_days: ['saturday'], start_time: '01:00', end_time: '05:00' }))).toBe(false);
  });
});
