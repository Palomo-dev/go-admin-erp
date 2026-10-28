import {
  clavesPropiasTarjeta,
  restablecerClaveTarjeta,
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

describe('restablecer un valor de la tarjeta', () => {
  it('borra el valor del estilo y la clave suelta; lo demás queda igual', () => {
    const c = { card_radius: 20, card_shadow: 'lg', product_card_style: { card_radius: 8, show_brand: true } }
    expect(clavesPropiasTarjeta(c)).toEqual(['card_radius', 'show_brand', 'card_shadow'])
    const r = restablecerClaveTarjeta(c, 'card_radius')
    expect(r).toEqual({ card_shadow: 'lg', product_card_style: { show_brand: true } })
    expect(clavesPropiasTarjeta(r)).toEqual(['show_brand', 'card_shadow'])
  })
  it('no borra claves de la raíz que no son de la tarjeta', () => {
    expect(restablecerClaveTarjeta({ title_size: 'lg', product_card_style: { title_size: 'sm' } }, 'title_size')).toEqual({ title_size: 'lg' })
  })
  it('sin valores restantes borra product_card_style', () => {
    expect(restablecerClaveTarjeta({ product_card_style: { card_radius: 8 } }, 'card_radius')).toEqual({})
  })
  it('el fondo se restablece con su degradado y ángulo', () => {
    const r = restablecerClaveTarjeta({ card_bg: '#fff', product_card_style: { card_bg: '#000', card_bg_2: '#111', card_bg_angle: 90, card_radius: 4 } }, 'card_bg_2')
    expect(r).toEqual({ product_card_style: { card_radius: 4 } })
  })
})
