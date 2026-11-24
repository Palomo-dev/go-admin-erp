/**
 * Pantalla única de promoción (Promociones V2): alcance ↔ reglas, escalones, validación y
 * «En palabras». Lo que guardaba el asistente de 4 pasos se sigue guardando igual.
 */
import {
  alcanceDesdeReglas,
  cambiarTipo,
  errorEscalones,
  escalonesDesdeFilas,
  filasDesdeEscalones,
  hastaDeEscalones,
  reglasDesdeAlcance,
  validarPromocion,
  SELECCION_VACIA,
} from '../logicaFormulario';
import { diaEnPalabras, textoEnPalabras } from '../textoEnPalabras';
import type { CreatePromotionData } from '../../types';

const base: CreatePromotionData = {
  name: 'Mayoristas de bebidas',
  promotion_type: 'volume_tiers',
  applies_to: 'categories',
  start_date: '2026-12-01',
  end_date: '2026-12-31',
  applies_to_pos: true,
  applies_to_web: true,
  tiers_count_mode: 'promotion_mix',
};

describe('alcance ↔ reglas', () => {
  it('categorías con exclusión de un producto, ida y vuelta', () => {
    const sel = { ...SELECCION_VACIA, alcance: 'categorias' as const, categorias: [3, 4], excluirProductos: [9] };
    const { applies_to, rules } = reglasDesdeAlcance(sel, 'percentage', 'promotion_mix');
    expect(applies_to).toBe('categories');
    expect(rules).toEqual([
      { rule_type: 'include_category', category_id: 3 },
      { rule_type: 'include_category', category_id: 4 },
      { rule_type: 'exclude_product', product_id: 9 },
    ]);
    const vuelta = alcanceDesdeReglas(applies_to, rules);
    expect(vuelta.alcance).toBe('categorias');
    expect(vuelta.categorias).toEqual([3, 4]);
    expect(vuelta.excluirProductos).toEqual([9]);
  });

  it('«Todos» con exclusiones no queda en all (el motor ignoraría las reglas)', () => {
    const sel = { ...SELECCION_VACIA, excluirProductos: [5] };
    expect(reglasDesdeAlcance(sel, 'percentage', 'promotion_mix').applies_to).toBe('products');
    expect(reglasDesdeAlcance(SELECCION_VACIA, 'percentage', 'promotion_mix')).toEqual({ applies_to: 'all', rules: [] });
    // Lo guardado por el asistente anterior («productos · excluir») se abre como «Todos» con exclusiones.
    const viejo = alcanceDesdeReglas('products', [{ rule_type: 'exclude_product', product_id: 5 }]);
    expect(viejo.alcance).toBe('todos');
    expect(viejo.excluirProductos).toEqual([5]);
  });

  it('marcas se guardan con brand; combo con unidades; grupos de volumen con tier_group', () => {
    const marcas = reglasDesdeAlcance({ ...SELECCION_VACIA, alcance: 'marcas', marcas: ['Postobón'] }, 'percentage', 'promotion_mix');
    expect(marcas).toEqual({ applies_to: 'brands', rules: [{ rule_type: 'include_brand', brand: 'Postobón' }] });
    const combo = reglasDesdeAlcance(
      { ...SELECCION_VACIA, alcance: 'productos', productos: [1, 2], cantidadesPaquete: { 2: 3 } },
      'bundle',
      'promotion_mix',
    );
    expect(combo.rules.map((r) => r.quantity)).toEqual([1, 3]);
    const grupos = reglasDesdeAlcance(
      { ...SELECCION_VACIA, alcance: 'productos', productos: [1, 2], gruposVolumen: { 2: 2 } },
      'volume_tiers',
      'product_group',
    );
    expect(grupos.rules.map((r) => r.tier_group)).toEqual([1, 2]);
    expect(alcanceDesdeReglas('products', grupos.rules).gruposVolumen).toEqual({ 1: 1, 2: 2 });
  });
});

describe('escalones', () => {
  it('ida y vuelta con precio fijo y «Hasta» calculado', () => {
    const { modo, escalones } = escalonesDesdeFilas([
      { min_quantity: 12, unit_price: 8800, discount_percent: null },
      { min_quantity: 6, unit_price: 9500, discount_percent: null },
    ]);
    expect(modo).toBe('precio');
    expect(escalones).toEqual([{ desde: '6', valor: '9500' }, { desde: '12', valor: '8800' }]);
    expect(hastaDeEscalones(escalones)).toEqual([11, null]);
    expect(filasDesdeEscalones(modo, escalones)).toEqual([
      { min_quantity: 6, unit_price: 9500, discount_percent: null, sort_order: 0 },
      { min_quantity: 12, unit_price: 8800, discount_percent: null, sort_order: 1 },
    ]);
  });

  it('errores: vacío, desde < 2, desorden, sin valor, porcentaje > 100', () => {
    expect(errorEscalones('precio', [])).toBe('v2.errores.escalonesVacios');
    expect(errorEscalones('precio', [{ desde: '1', valor: '9' }])).toBe('v2.errores.escalonDesde');
    expect(errorEscalones('precio', [{ desde: '6', valor: '9' }, { desde: '6', valor: '8' }])).toBe('v2.errores.escalonesOrden');
    expect(errorEscalones('precio', [{ desde: '6', valor: '' }])).toBe('v2.errores.escalonValor');
    expect(errorEscalones('porcentaje', [{ desde: '6', valor: '120' }])).toBe('v2.errores.escalonPorcentaje');
    expect(errorEscalones('porcentaje', [{ desde: '6', valor: '5' }, { desde: '12', valor: '10' }])).toBeNull();
  });
});

describe('validación y cambio de tipo', () => {
  const sel = { ...SELECCION_VACIA, alcance: 'categorias' as const, categorias: [3] };

  it('volumen válido; grupo de clientes exige elegir el grupo', () => {
    const ok = validarPromocion({ datos: base, seleccion: sel, modoEscalon: 'precio', escalones: [{ desde: '6', valor: '9500' }], soloGrupo: false });
    expect(ok).toEqual({});
    const sinGrupo = validarPromocion({ datos: base, seleccion: sel, modoEscalon: 'precio', escalones: [{ desde: '6', valor: '9500' }], soloGrupo: true });
    expect(sinGrupo.grupoClientes).toBe('v2.errores.grupoClientes');
  });

  it('por grupos exige productos elegidos', () => {
    const e = validarPromocion({
      datos: { ...base, tiers_count_mode: 'product_group' },
      seleccion: sel,
      modoEscalon: 'precio',
      escalones: [{ desde: '6', valor: '9500' }],
      soloGrupo: false,
    });
    expect(e.alcance).toBe('v2.errores.gruposProductos');
  });

  it('el 2x1 sigue validando como antes', () => {
    const e = validarPromocion({
      datos: { ...base, promotion_type: 'buy_x_get_y', buy_quantity: 2, get_quantity: 1 },
      seleccion: SELECCION_VACIA,
      modoEscalon: 'precio',
      escalones: [],
      soloGrupo: false,
    });
    expect(e).toEqual({});
  });

  it('porcentaje 15 → combo → porcentaje conserva el 15; a valor fijo no se arrastra', () => {
    const p = { ...base, promotion_type: 'percentage' as const, discount_value: 15 };
    const combo = cambiarTipo(p, 'bundle');
    expect(combo.discount_value).toBe(15);
    expect(cambiarTipo(combo, 'percentage').discount_value).toBe(15);
    expect(cambiarTipo(p, 'fixed_amount').discount_value).toBe(0);
  });
});

describe('En palabras', () => {
  const t = (k: string, v?: Record<string, string | number>) =>
    `${k}${v ? '(' + Object.entries(v).map(([a, b]) => `${a}=${b}`).join(',') + ')' : ''}`;

  it('cuenta vigencia, alcance, escalones, grupo y que no se suma', () => {
    const texto = textoEnPalabras(
      { ...base, customer_segment_id: 'seg', usage_limit_per_customer: 2 },
      [{ min_quantity: 6, unit_price: 9500, discount_percent: null }, { min_quantity: 12, unit_price: 8800, discount_percent: null }],
      {
        t,
        formatear: (n) => `$${n}`,
        fecha: (d) => d,
        nombresAlcance: ['Bebidas', 'Snacks'],
        sucursales: [],
        segmento: 'Mayoristas',
        unir: (xs) => xs.join(' y '),
      },
    );
    expect(texto).toContain('v2.palabras.escalonRango(desde=6,hasta=11');
    expect(texto).toContain('v2.palabras.escalonDesde(desde=12');
    expect(texto).toContain('v2.palabras.soloGrupo(grupo=Mayoristas)');
    expect(texto).toContain('v2.palabras.usosCliente(n=2)');
    expect(texto).toContain('v2.palabras.noSeSuma');
  });

  it('el día no se corre de zona', () => {
    expect(diaEnPalabras('2026-12-01', 'es-CO')).toBe('1 de diciembre');
  });
});
