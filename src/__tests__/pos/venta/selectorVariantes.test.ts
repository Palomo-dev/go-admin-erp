/**
 * Selector de variantes v2 (Figma `VariantModifierDialog` 155:7980): reglas
 * puras. Estado de los botones de atributo, salto a una combinación que no
 * existía con lo elegido (ninguna queda inalcanzable), variante con la que
 * abre, por qué no se puede agregar, la regla única de agotado y los textos
 * del kit (frase de atributos, resumen, total).
 */
import {
  bloqueoVariante,
  estadoAtributos,
  varianteAlElegirValor,
  varianteInicial,
} from '@/lib/pos/venta/modificadores';
import { agotadoPorStock } from '@/lib/pos/stockDisponible';
import { resolverCodigo, type PosGridProduct } from '@/lib/pos/venta/catalogo';
import {
  acotarCantidad,
  atributosEnFrase,
  CANTIDAD_MAXIMA_SELECTOR,
  etiquetaResumenVariante,
  nombreEnFrase,
  totalSelector,
} from '@/components/kit/selectorVariantesLogica';
import type { Product } from '@/components/pos/types';

const v = (id: number, talla: string, color: string, extra: Partial<{ price: number | null; is_out_of_stock: boolean }> = {}) => ({
  id,
  price: 189900,
  variant_data: { Talla: talla, Color: color },
  is_out_of_stock: false,
  ...extra,
});

// 40-Negro, 40-Blanco, 41-Negro, 42-Negro (agotada), 43-Azul.
const variantes = [v(1, '40', 'Negro'), v(2, '40', 'Blanco'), v(3, '41', 'Negro'), v(4, '42', 'Negro', { is_out_of_stock: true }), v(5, '43', 'Azul')];

describe('estadoAtributos', () => {
  test('marca elegido, si la combinación existe con lo elegido y si está agotada', () => {
    const [talla, color] = estadoAtributos(variantes, { Talla: '40', Color: 'Negro' });
    expect(talla.nombre).toBe('Talla');
    expect(talla.valores.map((x) => [x.valor, x.elegido, x.existe, x.agotado])).toEqual([
      ['40', true, true, false],
      ['41', false, true, false],
      ['42', false, true, true],
      ['43', false, false, false],
    ]);
    expect(color.valores.find((x) => x.valor === 'Azul')).toMatchObject({ existe: false, elegido: false });
    expect(color.valores.find((x) => x.valor === 'Blanco')).toMatchObject({ existe: true });
  });

  test('sin combinación exacta, agotado solo si TODAS las variantes con el valor lo están', () => {
    const [talla] = estadoAtributos([v(1, '40', 'Negro'), v(2, '42', 'Azul', { is_out_of_stock: true })], { Talla: '40', Color: 'Negro' });
    expect(talla.valores.find((x) => x.valor === '42')).toMatchObject({ existe: false, agotado: true });
  });
});

describe('varianteAlElegirValor', () => {
  test('combinación exacta', () => {
    expect(varianteAlElegirValor(variantes, { Talla: '40', Color: 'Negro' }, 'Color', 'Blanco')?.id).toBe(2);
  });

  test('una combinación que no existe salta a la variante con ese valor: 43 solo existe en Azul', () => {
    expect(varianteAlElegirValor(variantes, { Talla: '40', Color: 'Negro' }, 'Talla', '43')?.id).toBe(5);
  });

  test('entre varias candidatas conserva lo más posible de lo elegido y prefiere la disponible', () => {
    const lista = [v(1, 'M', 'Rojo'), v(2, 'L', 'Verde', { is_out_of_stock: true }), v(3, 'L', 'Azul')];
    // Con M-Rojo elegido, «L» no existe en Rojo: ninguna conserva el color; gana la disponible.
    expect(varianteAlElegirValor(lista, { Talla: 'M', Color: 'Rojo' }, 'Talla', 'L')?.id).toBe(3);
  });

  test('valor que no tiene ninguna variante: undefined', () => {
    expect(varianteAlElegirValor(variantes, {}, 'Talla', '50')).toBeUndefined();
  });
});

describe('varianteInicial', () => {
  test('la que pidió el escáner, si existe', () => {
    expect(varianteInicial(variantes, 4)?.id).toBe(4);
    expect(varianteInicial(variantes, 999)?.id).toBe(1);
  });

  test('si no, la primera disponible con precio', () => {
    const lista = [v(1, '40', 'Negro', { is_out_of_stock: true }), v(2, '41', 'Negro', { price: null }), v(3, '42', 'Negro')];
    expect(varianteInicial(lista)?.id).toBe(3);
  });

  test('todas agotadas: la primera; sin variantes: undefined', () => {
    expect(varianteInicial([v(7, '40', 'Negro', { is_out_of_stock: true })])?.id).toBe(7);
    expect(varianteInicial([])).toBeUndefined();
  });
});

describe('bloqueoVariante', () => {
  test('sin variante, agotada, sin precio o lista', () => {
    expect(bloqueoVariante(null)).toBe('sinVariante');
    expect(bloqueoVariante({ price: 1000, is_out_of_stock: true })).toBe('agotado');
    expect(bloqueoVariante({ price: null })).toBe('sinPrecio');
    expect(bloqueoVariante({ price: 0 })).toBe('sinPrecio');
    expect(bloqueoVariante({ price: 1000 })).toBeNull();
  });
});

describe('agotadoPorStock (regla única de la tarjeta y del selector)', () => {
  test('solo con control de stock y sin unidades', () => {
    expect(agotadoPorStock(true, 0)).toBe(true);
    expect(agotadoPorStock(true, -2)).toBe(true);
    expect(agotadoPorStock(true, 1)).toBe(false);
    expect(agotadoPorStock(false, 0)).toBe(false);
    expect(agotadoPorStock(null, 0)).toBe(false);
  });
});

describe('resolverCodigo: variante con modificadores', () => {
  test('el diálogo del padre recibe la variante leída (ya no se pierde, B-06)', () => {
    const padre = { id: 10, name: 'Zapatilla', has_variants: true, variant_count: 2, has_modifiers: true } as PosGridProduct;
    const leida = { id: 11, name: 'Zapatilla 40', parent_product_id: 10 } as unknown as Product;
    expect(resolverCodigo(leida, [padre])).toEqual({ tipo: 'dialogo_padre', padre, varianteId: 11 });
  });
});

describe('selectorVariantesLogica (kit)', () => {
  test('nombres en frase: minúscula inicial salvo siglas', () => {
    expect(nombreEnFrase('Talla')).toBe('talla');
    expect(nombreEnFrase('RAM')).toBe('RAM');
    expect(atributosEnFrase(['Talla', 'Color'])).toBe('talla y color');
    expect(atributosEnFrase(['Talla', 'Color', 'Material'])).toBe('talla, color y material');
    expect(atributosEnFrase(['Size', 'Color'], 'en-US')).toBe('size and color');
    expect(atributosEnFrase([])).toBe('');
  });

  test('etiqueta del resumen', () => {
    expect(etiquetaResumenVariante(['40', 'Negro'], 'ZAP-0042-40-NEG')).toBe('40 · Negro · ZAP-0042-40-NEG');
    expect(etiquetaResumenVariante(['', null, 'M'], undefined)).toBe('M');
  });

  test('cantidad acotada y total', () => {
    expect(acotarCantidad(0)).toBe(1);
    expect(acotarCantidad(2.7)).toBe(2);
    expect(acotarCantidad(Number.NaN)).toBe(1);
    expect(acotarCantidad(10 ** 9)).toBe(CANTIDAD_MAXIMA_SELECTOR);
    expect(totalSelector(197900, 2)).toBe(395800);
    expect(totalSelector(null, 2)).toBeNull();
  });
});

// HANDOFF 2026-09-29 §8.4: el selector del POS ordenaba alfabético («L, M, S, XL, XS»).
describe('estadoAtributos con el orden del catálogo', () => {
  const tallas = ['L', 'M', 'S', 'XL', 'XS'].map((t, i) => ({ id: i + 1, price: 1000, variant_data: { Talla: t, Color: i % 2 ? 'Rojo' : 'Negro' } }));
  const catalogo = {
    tipos: [
      { nombre: 'Color', orden: 2, estilo: 'color' as const },
      { nombre: 'Talla', orden: 1, estilo: 'texto' as const },
    ],
    valores: [
      { tipo: 'Talla', valor: 'XS', orden: 1, hex: null },
      { tipo: 'Talla', valor: 'S', orden: 2, hex: null },
      { tipo: 'Talla', valor: 'M', orden: 3, hex: null },
      { tipo: 'Talla', valor: 'L', orden: 4, hex: null },
      { tipo: 'Talla', valor: 'XL', orden: 5, hex: null },
      { tipo: 'Color', valor: 'Rojo', orden: 1, hex: '#f00' },
      { tipo: 'Color', valor: 'Negro', orden: 2, hex: '#000' },
    ],
  };

  it('tipos y valores en el orden del catálogo', () => {
    const r = estadoAtributos(tallas, {}, catalogo);
    expect(r.map((a) => a.nombre)).toEqual(['Talla', 'Color']);
    expect(r[0].valores.map((v) => v.valor)).toEqual(['XS', 'S', 'M', 'L', 'XL']);
    expect(r[1].valores.map((v) => v.valor)).toEqual(['Rojo', 'Negro']);
  });

  it('sin catálogo se conserva el orden de antes', () => {
    const r = estadoAtributos(tallas, {});
    expect(r.find((a) => a.nombre === 'Talla')!.valores.map((v) => v.valor)).toEqual(['L', 'M', 'S', 'XL', 'XS']);
  });
});
