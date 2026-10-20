/**
 * Los slugs reservados del ERP deben contener los del sitio público.
 *
 * El sitio (goadmin-websites/lib/outlet/rutaSitio.ts, `SLUGS_RESERVADOS`) nunca resuelve
 * como sede un primer segmento reservado: una sede con ese slug sería inalcanzable por ruta.
 * El ERP valida el slug al guardar con `RESERVED_SLUGS`, así que esa lista tiene que incluir
 * la del sitio. El otro repo no está aquí: la lista va copiada como fixture. Si el sitio
 * reserva una ruta nueva, se añade aquí y en RESERVED_SLUGS (el sitio comprueba lo mismo en
 * scripts/verify-sedes.mjs leyendo este repo).
 */
import { RESERVED_SLUGS, validateSlug } from '@/lib/utils/webIdentityValidation';

// Copia de SLUGS_RESERVADOS de goadmin-websites/lib/outlet/rutaSitio.ts (2026-10-06).
const SLUGS_RESERVADOS_SITIO = [
  'home', 'menu', 'productos', 'categorias', 'espacios', 'servicios',
  'ofertas', 'reserva', 'reservas', 'agendar', 'cotizar', 'pedido',
  'ticket', 'tracking', 'viajes', 'pases', 'membresias', 'checkout',
  'carrito', 'mi-cuenta', 'consultar-pedido', 'auth', 'api',
  'contacto', 'nosotros', 'vista-previa',
];

describe('slugs reservados de sede', () => {
  test.each(SLUGS_RESERVADOS_SITIO)('«%s» del sitio está reservado en el ERP', (slug) => {
    expect(RESERVED_SLUGS).toContain(slug);
  });

  test('validateSlug rechaza los reservados (también en mayúsculas)', () => {
    expect(validateSlug('contacto')).toMatch(/reservado/);
    expect(validateSlug('vista-previa')).toMatch(/reservado/);
    expect(validateSlug('sede-norte')).toBeNull();
  });
});
