/**
 * L20 (docs/implementacion/POS-PLAN.md §2.2): modificadores y variantes del
 * diálogo «Seleccionar variante / Personalizar producto». Las funciones son
 * la extracción literal de `src/components/pos/VariantSelectorDialog.tsx`.
 */
import {
  agruparAtributos,
  alternarModificador,
  buscarVariante,
  extraDeModificadores,
  modificadoresElegidos,
  puedeConfirmarVariante,
  reglaDeSeleccion,
  validarModificadores,
  type SeleccionModificadores,
} from '@/lib/pos/venta/modificadores';
import type { ProductModifierGroup } from '@/lib/services/productModifiersService';

const opcion = (id: number, name: string, extra_price = 0) => ({ id, group_id: 0, name, extra_price, is_active: true, display_order: id });
const grupo = (extra: Partial<ProductModifierGroup>): ProductModifierGroup => ({
  id: 1, organization_id: 120, product_id: 1001, name: 'Salsas', selection_mode: 'multiple',
  min_selections: 0, max_selections: null, required: false, display_order: 0, product_modifiers: [], ...extra,
});

const salsa = grupo({ id: 1, name: 'Salsa', selection_mode: 'single', required: true, product_modifiers: [opcion(1, 'BBQ'), opcion(2, 'Ajo')] });
const extras = grupo({ id: 2, name: 'Extras', max_selections: 2, product_modifiers: [opcion(3, 'Queso', 2500), opcion(4, 'Tocineta', 3000), opcion(5, 'Huevo', 1500)] });

describe('modificadores (L20)', () => {
  it('«Elige 1»: marcar otra reemplaza; la marcada no se desmarca si el grupo es obligatorio', () => {
    let sel: SeleccionModificadores = {};
    sel = alternarModificador(sel, salsa, 1);
    sel = alternarModificador(sel, salsa, 2);
    expect([...sel[1]]).toEqual([2]);
    sel = alternarModificador(sel, salsa, 2);
    expect([...sel[1]]).toEqual([2]);
    const opcional = { ...salsa, required: false };
    expect([...alternarModificador(sel, opcional, 2)[1]]).toEqual([]);
  });

  it('«Hasta N»: no deja pasar del máximo (devuelve la misma selección) y desmarcar libera cupo', () => {
    let sel: SeleccionModificadores = {};
    sel = alternarModificador(sel, extras, 3);
    sel = alternarModificador(sel, extras, 4);
    const lleno = alternarModificador(sel, extras, 5);
    expect(lleno).toBe(sel);
    sel = alternarModificador(sel, extras, 3);
    sel = alternarModificador(sel, extras, 5);
    expect([...sel[2]].sort()).toEqual([4, 5]);
  });

  it('lo elegido sale en el orden de grupos y opciones, y los extras se suman al precio', () => {
    const sel: SeleccionModificadores = { 1: new Set([2]), 2: new Set([5, 3]) };
    const elegidos = modificadoresElegidos([salsa, extras], sel);
    expect(elegidos.map((m) => `${m.groupName}:${m.name}`)).toEqual(['Salsa:Ajo', 'Extras:Queso', 'Extras:Huevo']);
    expect(extraDeModificadores(elegidos)).toBe(4000);
  });

  it('obligatorio sin elegir, o por debajo del mínimo, no deja confirmar y dice qué grupo falta', () => {
    expect(validarModificadores([salsa, extras], {})).toBe('Selecciona una opción en "Salsa"');
    const minimo2 = grupo({ id: 3, name: 'Toppings', min_selections: 2 });
    expect(validarModificadores([minimo2], { 3: new Set([1]) })).toBe('Selecciona al menos 2 opciones en "Toppings"');
    expect(validarModificadores([salsa, extras], { 1: new Set([1]) })).toBeNull();
  });

  it('la cabecera del grupo: «Elige 1», «Hasta N» o «Elige varias»', () => {
    expect(reglaDeSeleccion(salsa)).toEqual({ tipo: 'uno' });
    expect(reglaDeSeleccion(extras)).toEqual({ tipo: 'hasta', maximo: 2 });
    expect(reglaDeSeleccion(grupo({}))).toEqual({ tipo: 'varias' });
  });

  it('combinaciones de atributos: solo existe la variante que coincide con todos; «Sin precio» no se puede agregar', () => {
    const variantes = [
      { id: 1, price: 10, variant_data: { Talla: 'M', Color: 'Azul' } },
      { id: 2, price: null, variant_data: { Talla: 'L', Color: 'Azul' } },
      { id: 3, price: 12, variant_data: { Talla: 'M', Color: 'Rojo' } },
    ];
    expect(agruparAtributos(variantes)).toEqual({ Talla: ['L', 'M'], Color: ['Azul', 'Rojo'] });
    expect(buscarVariante(variantes, { Talla: 'L', Color: 'Rojo' })).toBeUndefined();
    const l = buscarVariante(variantes, { Talla: 'L', Color: 'Azul' });
    expect(l?.id).toBe(2);
    expect(puedeConfirmarVariante(l ?? null)).toBe(false);
    expect(puedeConfirmarVariante(variantes[0])).toBe(true);
    expect(puedeConfirmarVariante(null)).toBe(false);
  });
});
