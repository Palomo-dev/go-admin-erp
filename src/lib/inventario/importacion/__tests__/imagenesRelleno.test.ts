import { esImagenRelleno, sinImagenesRelleno } from '../imagenesRelleno';

describe('imágenes de relleno', () => {
  it.each([
    'https://tienda.com/img/NoImage/producto.jpg',
    'https://tienda.com/files/no-image.png',
    'https://tienda.com/sin_imagen.jpg',
    'https://tienda.com/img/p/es-default-large_default.jpg',
    'https://tienda.com/themes/x/espanol_default.jpg',
    'https://tienda.com/wp-content/uploads/woocommerce-placeholder.png',
    '',
  ])('rechaza %s', (u) => expect(esImagenRelleno(u)).toBe(true));

  it.each([
    'https://tienda.com/123-large_default/camisa-azul.jpg',
    'https://cdn.shopify.com/s/files/1/0/products/camisa.jpg?v=1',
    'https://tienda.com/wp-content/uploads/2026/10/zapato.webp',
  ])('acepta %s', (u) => expect(esImagenRelleno(u)).toBe(false));

  it('filtra la lista conservando el orden', () => {
    expect(sinImagenesRelleno(['a/1.jpg', 'x/NoImage/y.jpg', undefined, 'b/2.jpg'])).toEqual(['a/1.jpg', 'b/2.jpg']);
  });
});
