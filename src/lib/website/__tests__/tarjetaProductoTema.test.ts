import { tarjetaProductoTemaDisponible } from '@/lib/website/tarjetaProducto';

describe('tarjeta de producto en el tema', () => {
  const env = process.env.NEXT_PUBLIC_WEBSITE_TARJETA_PRODUCTO;

  afterEach(() => {
    if (env === undefined) delete process.env.NEXT_PUBLIC_WEBSITE_TARJETA_PRODUCTO;
    else process.env.NEXT_PUBLIC_WEBSITE_TARJETA_PRODUCTO = env;
  });

  it('apagado no escribe la clave que el sitio público aún rechaza', () => {
    delete process.env.NEXT_PUBLIC_WEBSITE_TARJETA_PRODUCTO;
    expect(tarjetaProductoTemaDisponible()).toBe(false);
    process.env.NEXT_PUBLIC_WEBSITE_TARJETA_PRODUCTO = '1';
    expect(tarjetaProductoTemaDisponible()).toBe(true);
  });
});
