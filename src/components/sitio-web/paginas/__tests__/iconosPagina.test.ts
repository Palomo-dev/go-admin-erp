/**
 * Iconos del área Páginas: una sola tabla por concepto (tipo de página, salud SEO, tipo de
 * enlace, zona del menú) y siempre coherente con la de `MenuLinkRow`.
 */
jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));

import { AlignLeft, CircleDashed, Contact, ExternalLink, EyeOff, FileText, ImageOff, ListTree, ListX, MessageCircle, Phone, SearchCheck, Tag, Type, UtensilsCrossed } from 'lucide-react';
import type { ItemMenu, PaginaSitio } from '@/lib/website/contrato/documentoSitio';
import { ICONO_TIPO_ENLACE_MENU, ICONOS_VISIBILIDAD_MENU } from '@/components/sitio-web/ui/MenuLinkRow';
import { ICONO_ESTADO_PUBLICACION, ICONO_TAREA_SITIO } from '@/components/sitio-web/ui/iconosSitio';
import { ICONO_SALUD_SEO, ICONO_TIPO_PAGINA, ICONO_ZONA_MENU, iconoDeItem, iconoDePagina } from '../iconosPagina';

const carta = { id: 'p2', slug: 'carta', tipo: 'builtin', titulo: 'Carta' } as unknown as PaginaSitio;
const paginas = new Map([[carta.id, carta]]);

describe('iconosPagina', () => {
  test('la salud SEO dice qué falta con su icono', () => {
    expect(ICONO_SALUD_SEO).toEqual({
      completo: SearchCheck,
      falta_titulo: Type,
      falta_descripcion: AlignLeft,
      falta_imagen: ImageOff,
      sin_revisar: CircleDashed,
    });
  });

  test('tipo de enlace: categoría es la etiqueta de precio (D/04-09) y los demás no se repiten', () => {
    expect(ICONO_TIPO_ENLACE_MENU).toEqual({ pagina: FileText, categoria: Tag, externo: ExternalLink, whatsapp: MessageCircle, telefono: Phone });
    expect(new Set(Object.values(ICONO_TIPO_ENLACE_MENU)).size).toBe(5);
    expect(ICONO_ZONA_MENU.categorias).toBe(Tag);
  });

  test('iconoDeItem: página → icono de su tipo; resto → icono del tipo de enlace', () => {
    expect(iconoDePagina(carta)).toBe(UtensilsCrossed);
    expect(ICONO_TIPO_PAGINA.carta).toBe(UtensilsCrossed);
    const item = (x: Partial<ItemMenu>) => ({ id: 'i', etiqueta: 'x', ...x }) as ItemMenu;
    expect(iconoDeItem(item({ tipo: 'page', paginaId: 'p2' } as Partial<ItemMenu>), paginas)).toBe(UtensilsCrossed);
    expect(iconoDeItem(item({ tipo: 'entity', entidad: 'category', entidadId: '7' } as Partial<ItemMenu>), paginas)).toBe(Tag);
    expect(iconoDeItem(item({ tipo: 'custom', url: 'https://wa.me/573001234567' } as Partial<ItemMenu>), paginas)).toBe(MessageCircle);
    expect(iconoDeItem(item({ tipo: 'custom', url: 'tel:6011234567' } as Partial<ItemMenu>), paginas)).toBe(Phone);
    expect(iconoDeItem(item({ tipo: 'custom', url: 'https://ejemplo.com' } as Partial<ItemMenu>), paginas)).toBe(ExternalLink);
  });

  test('«Completo» (SEO) no se ve igual que «Publicado» en la misma fila (A/04a)', () => {
    expect(ICONO_SALUD_SEO.completo).not.toBe(ICONO_ESTADO_PUBLICACION.publicado);
    expect(new Set(Object.values(ICONO_SALUD_SEO)).size).toBe(Object.keys(ICONO_SALUD_SEO).length);
  });

  test('en el árbol del menú, un tipo de página nunca se confunde con un tipo de enlace', () => {
    // El árbol pinta el icono del tipo de página para los enlaces a páginas y el del tipo de
    // enlace para el resto (categoría, externo, WhatsApp, teléfono): no pueden coincidir.
    const deEnlace = new Set(
      Object.entries(ICONO_TIPO_ENLACE_MENU)
        .filter(([tipo]) => tipo !== 'pagina')
        .map(([, icono]) => icono),
    );
    for (const [tipo, icono] of Object.entries(ICONO_TIPO_PAGINA)) {
      expect({ tipo, choca: deEnlace.has(icono) }).toEqual({ tipo, choca: false });
    }
    expect(ICONO_TIPO_PAGINA.contacto).toBe(Contact);
    expect(ICONO_TIPO_ENLACE_MENU.telefono).toBe(Phone);
  });

  test('«Oculto en el menú» no usa el ojo tachado de «Sin publicar»', () => {
    expect(ICONOS_VISIBILIDAD_MENU.oculta).toBe(ListX);
    expect(ICONO_ESTADO_PUBLICACION.sin_publicar).toBe(EyeOff);
    expect(ICONOS_VISIBILIDAD_MENU.oculta).not.toBe(ICONO_ESTADO_PUBLICACION.sin_publicar);
    expect(ICONOS_VISIBILIDAD_MENU.visible).not.toBe(ICONO_ESTADO_PUBLICACION.publicado);
  });

  test('Menú y navegación usa el icono de la tabla única del módulo', () => {
    expect(ICONO_TAREA_SITIO.menu).toBe(ListTree);
  });

  test('cada ubicación de un menú con nombre tiene icono propio', () => {
    const { encabezado, megamenu, pie, sin } = ICONO_ZONA_MENU;
    expect(new Set([encabezado, megamenu, pie, sin]).size).toBe(4);
  });
});
