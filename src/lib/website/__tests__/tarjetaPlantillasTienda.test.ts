/**
 * Claves nuevas de la tarjeta de producto para las plantillas de tienda (PLANO §2 ítems 1-9):
 * ausentes, el resultado es idéntico al de hoy; con valores inválidos se ignoran.
 */
import {
  ESTILOS_BOTON,
  ESTILOS_BOTON_TARJETA,
  MAX_TEXTO_ELEGIR,
  POSICIONES_PRECIO,
  POSICIONES_PRECIO_TARJETA,
  aplicarEstiloTarjeta,
  etiquetasDeEstilo,
  fusionarEstilos,
  normalizarTarjeta,
  resolverTarjetaProducto,
  vistaEditorTarjeta,
} from '@/lib/website/tarjetaProducto';

/** Estilos como los que hoy guardan los sitios publicados (sin claves nuevas). */
const HOY: Record<string, unknown>[] = [
  { card_preset: 'boxed', card_radius: 8 },
  { card_preset: 'actual' },
  { add: { button_style: 'icon_only', button_shape: 'circle', quantity_stepper: true }, price_position: 'beside_button' },
  { card_preset: 'minimal', label_style: 'soft', hover_image: 'second', image_bg: '#F3F0EB' },
  { show_sales_count: true, labels_custom: [{ label: 'Originales' }] },
];

describe('tarjeta · claves nuevas ausentes = resultado de hoy', () => {
  test.each(HOY.map((h, i) => [i, h]))('estilo %i: normalizar, aplicar, resolver y vista no cambian', (_i, estilo) => {
    const normal = normalizarTarjeta(estilo);
    for (const k of ['card_subtitle', 'price_prefix', 'title_font', 'card_grid_lines', 'wishlist_style', 'wishlist_position', 'hover_image_transition', 'choose_label']) {
      expect(normal ?? {}).not.toHaveProperty(k);
    }
    const conIndefinidas = {
      ...estilo,
      card_subtitle: undefined,
      price_prefix: null,
      title_font: undefined,
      card_grid_lines: undefined,
      wishlist_style: null,
      wishlist_position: undefined,
      hover_image_transition: undefined,
      choose_label: undefined,
    };
    expect(normalizarTarjeta(conIndefinidas)).toEqual(normal);
    expect(aplicarEstiloTarjeta(conIndefinidas)).toEqual(aplicarEstiloTarjeta(estilo));
    expect(resolverTarjetaProducto(conIndefinidas, null)).toEqual(resolverTarjetaProducto(estilo, null));
    expect(vistaEditorTarjeta(conIndefinidas, null)).toEqual(vistaEditorTarjeta(estilo, null));
  });

  test('sin estilo sigue siendo la tarjeta de hoy (null)', () => {
    expect(normalizarTarjeta(null)).toBeNull();
    expect(resolverTarjetaProducto(undefined, undefined)).toBeNull();
    expect(aplicarEstiloTarjeta({ card_preset: 'actual' })).toBeNull();
  });

  test('las listas que ofrece hoy el inspector no cambian', () => {
    expect(ESTILOS_BOTON).toEqual(['solid', 'outline', 'ghost', 'gradient', 'icon_only']);
    expect(POSICIONES_PRECIO).toEqual(['below_title', 'above_title', 'beside_button', 'over_image']);
    expect(ESTILOS_BOTON_TARJETA).toEqual([...ESTILOS_BOTON, 'soft']);
    expect(POSICIONES_PRECIO_TARJETA).toEqual([...POSICIONES_PRECIO, 'beside_title']);
  });

  test('las claves nuevas no tocan las etiquetas de hoy', () => {
    expect(etiquetasDeEstilo(normalizarTarjeta({ card_subtitle: 'brand', wishlist_style: 'circle' }))).toBeNull();
  });
});

describe('tarjeta · claves nuevas con valor', () => {
  test('valores válidos se conservan', () => {
    expect(
      normalizarTarjeta({
        price_position: 'beside_title',
        card_subtitle: 'dimensions',
        price_prefix: 'desde',
        title_font: 'heading',
        card_grid_lines: true,
        wishlist_style: 'circle',
        wishlist_position: 'top_left',
        hover_image_transition: 'slide',
        choose_label: '  Elige   un acabado ',
        add: { button_style: 'soft' },
        buy: { button_style: 'soft' },
        choose: { button_style: 'soft' },
      }),
    ).toEqual({
      price_position: 'beside_title',
      card_subtitle: 'dimensions',
      price_prefix: 'desde',
      title_font: 'heading',
      card_grid_lines: true,
      wishlist_style: 'circle',
      wishlist_position: 'top_left',
      hover_image_transition: 'slide',
      choose_label: 'Elige un acabado',
      add: { button_style: 'soft' },
      buy: { button_style: 'soft' },
      choose: { button_style: 'soft' },
    });
  });

  test('cada subtítulo, prefijo, fuente, favorito y transición del contrato', () => {
    for (const v of ['none', 'brand', 'dimensions', 'reference', 'description']) expect(normalizarTarjeta({ card_subtitle: v })?.card_subtitle).toBe(v);
    for (const v of ['none', 'desde']) expect(normalizarTarjeta({ price_prefix: v })?.price_prefix).toBe(v);
    for (const v of ['body', 'heading']) expect(normalizarTarjeta({ title_font: v })?.title_font).toBe(v);
    for (const v of ['none', 'circle', 'ghost']) expect(normalizarTarjeta({ wishlist_style: v })?.wishlist_style).toBe(v);
    for (const v of ['top_right', 'top_left']) expect(normalizarTarjeta({ wishlist_position: v })?.wishlist_position).toBe(v);
    for (const v of ['fade', 'slide']) expect(normalizarTarjeta({ hover_image_transition: v })?.hover_image_transition).toBe(v);
  });

  test('valores inválidos se ignoran (como si no estuvieran)', () => {
    const invalido = {
      price_position: 'inline_title',
      card_subtitle: 'material',
      price_prefix: 'desde ',
      title_font: 'display',
      card_grid_lines: 'true',
      wishlist_style: 'heart',
      wishlist_position: 'bottom_left',
      hover_image_transition: 'zoom',
      choose_label: '   ',
      add: { button_style: 'suave' },
    };
    expect(normalizarTarjeta(invalido)).toBeNull();
    expect(normalizarTarjeta({ ...invalido, card_radius: 4 })).toEqual({ card_radius: 4 });
    expect(normalizarTarjeta({ card_grid_lines: false })).toBeNull();
    expect(normalizarTarjeta({ choose_label: 42 })).toBeNull();
  });

  test('choose_label se recorta al máximo', () => {
    const largo = 'Elige el acabado que más te guste';
    const r = normalizarTarjeta({ choose_label: largo })?.choose_label ?? '';
    expect(r.length).toBeLessThanOrEqual(MAX_TEXTO_ELEGIR);
    expect(largo.startsWith(r)).toBe(true);
  });

  test('la sección gana sobre el sitio clave a clave, también en las nuevas', () => {
    const r = resolverTarjetaProducto({ card_subtitle: 'brand', title_font: 'heading', add: { button_style: 'soft' } }, { card_subtitle: 'reference' });
    expect(r).toMatchObject({ card_subtitle: 'reference', title_font: 'heading', add: { button_style: 'soft' } });
    expect(fusionarEstilos({ wishlist_style: 'circle' }, { wishlist_position: 'top_left' })).toEqual({ wishlist_style: 'circle', wishlist_position: 'top_left' });
  });
});
