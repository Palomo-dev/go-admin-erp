/// <reference types="jest" />
import { existsSync } from 'fs';
import { join } from 'path';
import { IDS_PLANTILLAS_TIENDA } from '@/lib/website/contrato/catalogoPlantillas';
import { PAGINAS_DISENADAS, imagenPaginaDisenada, tienePaginasDisenadas } from '../PaginasDisenadas';

describe('páginas diseñadas de las 7 plantillas de tienda', () => {
  test('cada plantilla tiene su imagen de Inicio (computador y celular), Categoría y Producto en public/', () => {
    for (const id of IDS_PLANTILLAS_TIENDA) {
      expect(tienePaginasDisenadas(id)).toBe(true);
      const rutas = [...PAGINAS_DISENADAS.map((p) => imagenPaginaDisenada(id, p)), imagenPaginaDisenada(id, 'inicio', true)];
      for (const ruta of rutas) {
        expect(ruta).toMatch(/^\/sitio-web\/plantillas\/[a-z]+\/(inicio|movil|categoria|producto)\.webp$/);
        expect({ id, ruta, existe: existsSync(join(process.cwd(), 'public', ruta!)) }).toEqual({ id, ruta, existe: true });
      }
    }
  });

  test('en celular solo Inicio cambia de imagen; categoría y producto son las de computador', () => {
    expect(imagenPaginaDisenada('retail_marea', 'inicio', true)).toBe('/sitio-web/plantillas/marea/movil.webp');
    expect(imagenPaginaDisenada('retail_marea', 'producto', true)).toBe('/sitio-web/plantillas/marea/producto.webp');
  });

  test('las demás plantillas no tienen páginas diseñadas (siguen con el esquema)', () => {
    for (const id of ['retail_moderno', 'restaurant_classic', 'retail_robleX', '', 'roble']) {
      expect(tienePaginasDisenadas(id)).toBe(false);
      expect(imagenPaginaDisenada(id, 'inicio')).toBeNull();
    }
  });
});
