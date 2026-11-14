/**
 * Reglas compartidas de subida de imágenes (`ImageUploader` y la subida del
 * chat del sitio web): validar en el navegador, nombre seguro para la ruta y
 * de la URL pública a la ruta del objeto (para borrar solo lo propio).
 */
import { nombreSeguro, rutaEnBucket, validarImagen } from '../subidaImagenLogica';

const SUPABASE = 'https://proyecto.supabase.co';

describe('validarImagen', () => {
  const tipos = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];
  it('acepta tipo y tamaño dentro del límite', () => {
    expect(validarImagen({ type: 'image/png', size: 84 * 1024 }, tipos, 2)).toBeNull();
  });
  it('rechaza el formato (un GIF donde no se acepta)', () => {
    expect(validarImagen({ type: 'image/gif', size: 1000 }, tipos, 2)).toEqual({ tipo: 'formato' });
  });
  it('rechaza el tamaño y dice cuánto pesa, con un decimal', () => {
    expect(validarImagen({ type: 'image/png', size: 3.4 * 1024 * 1024 }, tipos, 2)).toEqual({ tipo: 'tamano', mb: 3.4 });
  });
});

describe('nombreSeguro', () => {
  it('solo minúsculas, dígitos y guiones, sin tildes, con la extensión', () => {
    expect(nombreSeguro('Logo Tienda (1).PNG')).toBe('logo-tienda-1.png');
    expect(nombreSeguro('Ícono ñandú.svg')).toBe('icono-nandu.svg');
  });
  it('sin nombre útil queda «imagen»', () => {
    expect(nombreSeguro('###.webp')).toBe('imagen.webp');
  });
});

describe('rutaEnBucket', () => {
  it('saca la ruta de la URL pública del bucket', () => {
    expect(rutaEnBucket(`${SUPABASE}/storage/v1/object/public/logos/120/chat-widget/abc/logo-1-x.png`, 'logos', SUPABASE)).toBe('120/chat-widget/abc/logo-1-x.png');
  });
  it('otro bucket, otro sitio o sin ruta no son del bucket', () => {
    expect(rutaEnBucket(`${SUPABASE}/storage/v1/object/public/categories/a.png`, 'logos', SUPABASE)).toBeNull();
    expect(rutaEnBucket('https://tiendaejemplo.com/storage/v1/object/public/logos/a.png', 'logos', SUPABASE)).toBeNull();
    expect(rutaEnBucket(`${SUPABASE}/storage/v1/object/public/logos/`, 'logos', SUPABASE)).toBeNull();
    expect(rutaEnBucket('no es una url', 'logos', SUPABASE)).toBeNull();
  });
});
