import {
  heredadoTarjetaSeccion,
  tarjetaDesdeClavesSeccion,
  vistaEditorTarjeta,
} from '@/lib/website/tarjetaProducto';

describe('claves sueltas de la sección en «Tarjeta de producto»', () => {
  it('sin claves no hereda nada', () => {
    expect(tarjetaDesdeClavesSeccion({ title: 'x' })).toBeNull();
    expect(heredadoTarjetaSeccion({}, undefined)).toBeUndefined();
  });

  it('lee las claves viejas, incluidas las opciones que antes solo tenía la sección', () => {
    const e = tarjetaDesdeClavesSeccion({
      card_radius: 40,
      card_shadow: 'xl',
      image_ratio: '16:9',
      image_fit: 'fill',
      title_lines: '3',
      show_compare_price: false,
      price_color: '#112233',
    });
    expect(e).toEqual({
      card_radius: 40,
      card_shadow: 'xl',
      image_ratio: '16:9',
      image_fit: 'fill',
      title_lines: 3,
      show_compare_price: false,
      price_color: '#112233',
    });
  });

  it('el estilo del sitio gana sobre la clave suelta y lo guardado en la sección gana sobre todo', () => {
    const heredado = heredadoTarjetaSeccion({ card_radius: 4, card_padding: 20 }, { card_radius: 12 });
    expect(heredado).toMatchObject({ card_radius: 12, card_padding: 20 });
    const vista = vistaEditorTarjeta({ card_radius: 30 }, heredado);
    expect(vista.card_radius).toBe(30);
    expect(vista.card_padding).toBe(20);
  });
});
