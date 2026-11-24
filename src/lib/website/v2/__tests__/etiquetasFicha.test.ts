/**
 * Etiquetas de la ficha (`product_info`, Figma 3036:78040): sin `labels_show: true` la ficha queda
 * como hoy; la lista guarda el orden y completa los tipos que falten; esquinas y colores inválidos
 * vuelven a lo de por defecto; `itemsEtiquetasParaGuardar` es la ida y vuelta de
 * `leerItemsEtiquetasFicha`.
 */
import {
  CLAVES_NUEVAS_ETIQUETAS,
  ESQUINA_ETIQUETA_POR_DEFECTO,
  TIPOS_ETIQUETA_FICHA,
  etiquetasEn,
  itemsEtiquetasParaGuardar,
  leerItemsEtiquetasFicha,
  leerOpcionesEtiquetasFicha,
  sinClaves,
} from '../seccionesFicha';

describe('leerOpcionesEtiquetasFicha', () => {
  test('sin claves: apagado y lo de hoy', () => {
    for (const contenido of [undefined, null, {}, { blocks: [{ id: 'title' }] }]) {
      const o = leerOpcionesEtiquetasFicha(contenido as Record<string, unknown> | null | undefined);
      expect(o.mostrar).toBe(false);
      expect(o.ubicacion).toBe('titulo');
      expect(o.forma).toBe('tarjeta');
      expect(o.relleno).toBe('tarjeta');
      expect(o.tamano).toBe('md');
      expect(o.propias).toBeNull();
      expect(o.items.map((i) => i.id)).toEqual([...TIPOS_ETIQUETA_FICHA]);
      expect(o.items.every((i) => i.visible && i.bg === null && i.text === null && i.esquina === ESQUINA_ETIQUETA_POR_DEFECTO[i.id])).toBe(true);
    }
  });

  test('solo `true` enciende; valores fuera de lista vuelven a los de por defecto', () => {
    expect(leerOpcionesEtiquetasFicha({ labels_show: 'true' }).mostrar).toBe(false);
    expect(leerOpcionesEtiquetasFicha({ labels_show: 1 }).mostrar).toBe(false);
    const o = leerOpcionesEtiquetasFicha({ labels_show: true, labels_placement: 'abajo', labels_shape: 'circle', labels_style: 'gradient', labels_size: 'lg' });
    expect(o).toMatchObject({ mostrar: true, ubicacion: 'titulo', forma: 'tarjeta', relleno: 'tarjeta', tamano: 'md' });
  });

  test('lee lo guardado', () => {
    const o = leerOpcionesEtiquetasFicha({ labels_show: true, labels_placement: 'ambas', labels_shape: 'square', labels_style: 'outline', labels_size: 'sm', labels_custom: [] });
    expect(o).toMatchObject({ mostrar: true, ubicacion: 'ambas', forma: 'square', relleno: 'outline', tamano: 'sm', propias: [] });
  });

  test('etiquetasEn: A, B o ambas', () => {
    expect(etiquetasEn('foto', 'foto')).toBe(true);
    expect(etiquetasEn('foto', 'titulo')).toBe(false);
    expect(etiquetasEn('titulo', 'titulo')).toBe(true);
    expect(etiquetasEn('ambas', 'foto') && etiquetasEn('ambas', 'titulo')).toBe(true);
  });

  test('«Volver al aspecto de hoy» quita todas las claves y conserva las demás', () => {
    const contenido = { blocks: [{ id: 'sku' }], labels_show: true, labels_placement: 'foto', labels_items: [], labels_shape: 'pill', labels_style: 'soft', labels_size: 'sm', labels_custom: [] };
    expect(sinClaves(contenido, CLAVES_NUEVAS_ETIQUETAS)).toEqual({ blocks: [{ id: 'sku' }] });
    expect(leerOpcionesEtiquetasFicha(sinClaves(contenido, CLAVES_NUEVAS_ETIQUETAS)).mostrar).toBe(false);
  });
});

describe('leerItemsEtiquetasFicha', () => {
  test('orden guardado y, al final, los que falten en el orden por defecto', () => {
    const items = leerItemsEtiquetasFicha([{ id: 'sold_out' }, { id: 'promotion', visible: false }]);
    expect(items.map((i) => i.id)).toEqual(['sold_out', 'promotion', 'free_shipping', 'discount', 'volume', 'sales_count', 'new', 'custom']);
    expect(items[1].visible).toBe(false);
    expect(items.slice(2).every((i) => i.visible)).toBe(true);
  });

  test('descarta ids desconocidos, repetidos y basura', () => {
    const items = leerItemsEtiquetasFicha([null, 'discount', { id: 'otra' }, { id: 'new', visible: false }, { id: 'new' }, 3]);
    expect(items).toHaveLength(TIPOS_ETIQUETA_FICHA.length);
    expect(items[0]).toMatchObject({ id: 'new', visible: false });
    expect(items.filter((i) => i.id === 'new')).toHaveLength(1);
    expect(leerItemsEtiquetasFicha('no es lista').map((i) => i.id)).toEqual([...TIPOS_ETIQUETA_FICHA]);
  });

  test('esquinas: la guardada si es válida; si no, la de cada tipo', () => {
    const items = leerItemsEtiquetasFicha([
      { id: 'discount', corner: 'bottom_right' },
      { id: 'promotion', corner: 'centro' },
      { id: 'sales_count' },
    ]);
    expect(items[0].esquina).toBe('bottom_right');
    expect(items[1].esquina).toBe(ESQUINA_ETIQUETA_POR_DEFECTO.promotion);
    expect(items[1].esquina).toBe('top_right');
    expect(items[2].esquina).toBe('bottom_left');
  });

  test('colores: solo hexadecimales válidos', () => {
    const items = leerItemsEtiquetasFicha([
      { id: 'discount', bg: '#DC2626', text: '#fff' },
      { id: 'new', bg: 'red', text: 'url(x)' },
      { id: 'volume', bg: '#12345', text: 7 },
      { id: 'free_shipping', bg: ' #2563EB ' },
    ]);
    expect(items[0]).toMatchObject({ bg: '#DC2626', text: '#fff' });
    expect(items[1]).toMatchObject({ bg: null, text: null });
    expect(items[2]).toMatchObject({ bg: null, text: null });
    expect(items[3].bg).toBe('#2563EB');
  });
});

describe('itemsEtiquetasParaGuardar', () => {
  test('solo guarda lo que difiere de lo de por defecto, en el orden de la lista', () => {
    const items = leerItemsEtiquetasFicha(undefined);
    const guardado = itemsEtiquetasParaGuardar(items);
    expect(guardado).toEqual(TIPOS_ETIQUETA_FICHA.map((id) => ({ id })));
  });

  test('ida y vuelta', () => {
    const crudo = [
      { id: 'promotion', corner: 'bottom_right', bg: '#7C3AED' },
      { id: 'discount', visible: false },
      { id: 'volume', text: '#111827' },
      { id: 'sales_count', corner: 'bottom_left' },
    ];
    const items = leerItemsEtiquetasFicha(crudo);
    const guardado = itemsEtiquetasParaGuardar(items);
    expect(guardado.slice(0, 4)).toEqual([
      { id: 'promotion', corner: 'bottom_right', bg: '#7C3AED' },
      { id: 'discount', visible: false },
      { id: 'volume', text: '#111827' },
      // Su esquina es la de por defecto: no se guarda.
      { id: 'sales_count' },
    ]);
    expect(leerItemsEtiquetasFicha(guardado)).toEqual(items);
  });
});
