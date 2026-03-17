'use client';

import { supabase } from '@/lib/supabase/config';

// ============================================================
// INTERFACES
// ============================================================

export interface WebsitePage {
  id: string;
  organization_id: number;
  slug: string;
  title: string;
  description: string | null;
  page_type: string;
  show_in_header: boolean;
  show_in_footer: boolean;
  header_order: number;
  footer_order: number;
  is_published: boolean;
  meta_title: string | null;
  meta_description: string | null;
  og_image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface WebsitePageSection {
  id: string;
  page_id: string;
  organization_id: number;
  section_type: string;
  section_variant: string;
  content: Record<string, any>;
  settings: Record<string, any>;
  sort_order: number;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
}

export interface WebsitePageWithSections extends WebsitePage {
  sections: WebsitePageSection[];
}

// ============================================================
// CATÁLOGO DE SECCIÓN TYPES + VARIANTS
// ============================================================

export interface SectionTypeDefinition {
  type: string;
  label: string;
  icon: string;
  description: string;
  variants: { id: string; label: string }[];
  contentFields: ContentFieldDef[];
}

export interface ContentFieldDef {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'url' | 'image' | 'color' | 'number' | 'boolean' | 'select';
  placeholder?: string;
  options?: { value: string; label: string }[];
}

export const SECTION_CATALOG: SectionTypeDefinition[] = [
  {
    type: 'hero',
    label: 'Hero / Banner',
    icon: 'Image',
    description: 'Sección principal con imagen o video de fondo',
    variants: [
      { id: 'fullscreen', label: 'Pantalla completa' },
      { id: 'minimal', label: 'Minimal' },
      { id: 'slider', label: 'Slider' },
      { id: 'split', label: 'Dividido' },
      { id: 'video', label: 'Video' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Título principal' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea', placeholder: 'Descripción breve' },
      { key: 'image_url', label: 'Imagen de fondo', type: 'image' },
      { key: 'video_url', label: 'URL de video', type: 'url', placeholder: 'https://...' },
      { key: 'cta_text', label: 'Texto del botón', type: 'text', placeholder: 'Reservar Ahora' },
      { key: 'cta_url', label: 'URL del botón', type: 'url', placeholder: '/reservas' },
    ],
  },
  {
    type: 'room_types',
    label: 'Habitaciones / Espacios',
    icon: 'BedDouble',
    description: 'Muestra los tipos de espacios disponibles',
    variants: [
      { id: 'cards', label: 'Tarjetas' },
      { id: 'detailed', label: 'Detallado' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Nuestras Habitaciones' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
    ],
  },
  {
    type: 'amenities',
    label: 'Amenidades / Servicios',
    icon: 'Sparkles',
    description: 'Lista de amenidades o servicios',
    variants: [
      { id: 'icons', label: 'Iconos' },
      { id: 'grid', label: 'Grid' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Nuestros Servicios' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
    ],
  },
  {
    type: 'gallery',
    label: 'Galería',
    icon: 'Images',
    description: 'Galería de imágenes',
    variants: [
      { id: 'masonry', label: 'Masonry' },
      { id: 'grid', label: 'Grid' },
      { id: 'carousel', label: 'Carrusel' },
      { id: 'fullscreen', label: 'Pantalla completa' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Galería' },
    ],
  },
  {
    type: 'testimonials',
    label: 'Testimonios',
    icon: 'MessageSquareQuote',
    description: 'Opiniones de clientes',
    variants: [
      { id: 'carousel', label: 'Carrusel' },
      { id: 'grid', label: 'Grid' },
      { id: 'quotes', label: 'Citas' },
      { id: 'minimal', label: 'Minimal' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Lo que dicen nuestros clientes' },
    ],
  },
  {
    type: 'cta',
    label: 'Llamada a la Acción',
    icon: 'MousePointerClick',
    description: 'Sección de llamada a la acción',
    variants: [
      { id: 'centered', label: 'Centrado' },
      { id: 'banner', label: 'Banner' },
      { id: 'with_image', label: 'Con imagen' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: '¿Listo para reservar?' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
      { key: 'cta_text', label: 'Texto del botón', type: 'text', placeholder: 'Reservar Ahora' },
      { key: 'cta_url', label: 'URL del botón', type: 'url', placeholder: '/reservas' },
      { key: 'image_url', label: 'Imagen', type: 'image' },
    ],
  },
  {
    type: 'contact_form',
    label: 'Formulario de Contacto',
    icon: 'Mail',
    description: 'Formulario para que los clientes te contacten',
    variants: [
      { id: 'default', label: 'Por defecto' },
      { id: 'split', label: 'Dividido' },
      { id: 'with_map', label: 'Con mapa' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Contáctanos' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
    ],
  },
  {
    type: 'map',
    label: 'Mapa',
    icon: 'MapPin',
    description: 'Mapa de ubicación',
    variants: [
      { id: 'embedded', label: 'Embebido' },
      { id: 'full_width', label: 'Ancho completo' },
      { id: 'with_directions', label: 'Con direcciones' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Encuéntranos' },
    ],
  },
  {
    type: 'stats',
    label: 'Estadísticas',
    icon: 'BarChart3',
    description: 'Contadores y estadísticas',
    variants: [
      { id: 'counters', label: 'Contadores' },
      { id: 'cards', label: 'Tarjetas' },
      { id: 'inline', label: 'En línea' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text' },
    ],
  },
  {
    type: 'text_block',
    label: 'Bloque de Texto',
    icon: 'Type',
    description: 'Sección de texto libre',
    variants: [
      { id: 'centered', label: 'Centrado' },
      { id: 'left', label: 'Izquierda' },
      { id: 'two_columns', label: 'Dos columnas' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text' },
      { key: 'body', label: 'Contenido', type: 'textarea' },
    ],
  },
  {
    type: 'team',
    label: 'Equipo',
    icon: 'Users',
    description: 'Sección de miembros del equipo',
    variants: [
      { id: 'grid', label: 'Grid' },
      { id: 'carousel', label: 'Carrusel' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Nuestro Equipo' },
    ],
  },
  {
    type: 'faq',
    label: 'Preguntas Frecuentes',
    icon: 'HelpCircle',
    description: 'Sección de FAQ',
    variants: [
      { id: 'accordion', label: 'Acordeón' },
      { id: 'simple', label: 'Simple' },
      { id: 'two_columns', label: 'Dos columnas' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Preguntas Frecuentes' },
    ],
  },
  {
    type: 'newsletter',
    label: 'Newsletter',
    icon: 'Newspaper',
    description: 'Sección de suscripción al newsletter',
    variants: [
      { id: 'simple', label: 'Simple' },
      { id: 'banner', label: 'Banner' },
      { id: 'with_image', label: 'Con imagen' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Suscríbete' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
    ],
  },
  {
    type: 'products_grid',
    label: 'Productos',
    icon: 'ShoppingBag',
    description: 'Grid de productos',
    variants: [
      { id: 'grid', label: 'Grid' },
      { id: 'carousel', label: 'Carrusel' },
      { id: 'list', label: 'Lista' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Nuestros Productos' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
    ],
  },
  {
    type: 'featured_products',
    label: 'Productos Destacados',
    icon: 'Star',
    description: 'Productos destacados o en oferta',
    variants: [
      { id: 'grid', label: 'Grid' },
      { id: 'carousel', label: 'Carrusel' },
      { id: 'hero_product', label: 'Producto Hero' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Productos Destacados' },
    ],
  },
  {
    type: 'booking_cta',
    label: 'Reservar (CTA)',
    icon: 'CalendarCheck',
    description: 'Sección para reservar',
    variants: [
      { id: 'inline_form', label: 'Formulario inline' },
      { id: 'banner', label: 'Banner' },
      { id: 'simple', label: 'Simple' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Reserva tu estancia' },
      { key: 'cta_text', label: 'Texto del botón', type: 'text', placeholder: 'Reservar Ahora' },
    ],
  },
  {
    type: 'image_text',
    label: 'Imagen + Texto',
    icon: 'LayoutPanelLeft',
    description: 'Imagen con texto al lado',
    variants: [
      { id: 'image_left', label: 'Imagen izquierda' },
      { id: 'image_right', label: 'Imagen derecha' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text' },
      { key: 'body', label: 'Contenido', type: 'textarea' },
      { key: 'image_url', label: 'Imagen', type: 'image' },
      { key: 'cta_text', label: 'Texto del botón', type: 'text' },
      { key: 'cta_url', label: 'URL del botón', type: 'url' },
    ],
  },
  {
    type: 'menu_preview',
    label: 'Vista Previa del Menú',
    icon: 'UtensilsCrossed',
    description: 'Preview del menú del restaurante',
    variants: [
      { id: 'tabs', label: 'Tabs por categoría' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Nuestro Menú' },
    ],
  },
  {
    type: 'membership_plans',
    label: 'Planes / Membresías',
    icon: 'CreditCard',
    description: 'Tabla de precios o membresías',
    variants: [
      { id: 'pricing_table', label: 'Tabla de precios' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Nuestros Planes' },
    ],
  },
];

export function getSectionDefinition(sectionType: string): SectionTypeDefinition | undefined {
  return SECTION_CATALOG.find((s) => s.type === sectionType);
}

// ============================================================
// SERVICIO
// ============================================================

class WebsitePageBuilderService {
  // ---- PAGES ----

  async getPages(organizationId: number): Promise<WebsitePage[]> {
    const { data, error } = await supabase
      .from('website_pages')
      .select('*')
      .eq('organization_id', organizationId)
      .order('header_order', { ascending: true });

    if (error) throw error;
    return (data || []) as WebsitePage[];
  }

  async getPageWithSections(pageId: string): Promise<WebsitePageWithSections | null> {
    const { data: page, error: pageError } = await supabase
      .from('website_pages')
      .select('*')
      .eq('id', pageId)
      .single();

    if (pageError) {
      if (pageError.code === 'PGRST116') return null;
      throw pageError;
    }

    const { data: sections, error: sectionsError } = await supabase
      .from('website_page_sections')
      .select('*')
      .eq('page_id', pageId)
      .order('sort_order', { ascending: true });

    if (sectionsError) throw sectionsError;

    return {
      ...(page as WebsitePage),
      sections: (sections || []) as WebsitePageSection[],
    };
  }

  async createPage(page: {
    organization_id: number;
    slug: string;
    title: string;
    show_in_header?: boolean;
    show_in_footer?: boolean;
    header_order?: number;
    footer_order?: number;
  }): Promise<WebsitePage> {
    const { data, error } = await supabase
      .from('website_pages')
      .insert({
        ...page,
        page_type: 'builtin',
        is_published: true,
      })
      .select()
      .single();

    if (error) throw error;
    return data as WebsitePage;
  }

  async updatePage(
    pageId: string,
    updates: Partial<Pick<WebsitePage, 'title' | 'slug' | 'show_in_header' | 'show_in_footer' | 'header_order' | 'footer_order' | 'is_published' | 'meta_title' | 'meta_description' | 'og_image_url'>>
  ): Promise<WebsitePage> {
    const { data, error } = await supabase
      .from('website_pages')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', pageId)
      .select()
      .maybeSingle();

    if (error) {
      console.error('Supabase updatePage error:', error.message, error.code, error.details);
      throw new Error(error.message || 'No se pudo actualizar la página. Verifica que tengas permisos de admin/owner.');
    }
    if (!data) {
      throw new Error('No se pudo actualizar la página. Verifica permisos (se requiere rol owner o admin).');
    }
    return data as WebsitePage;
  }

  async deletePage(pageId: string): Promise<void> {
    const { error } = await supabase
      .from('website_pages')
      .delete()
      .eq('id', pageId);

    if (error) throw error;
  }

  // ---- SECTIONS ----

  async addSection(section: {
    page_id: string;
    organization_id: number;
    section_type: string;
    section_variant: string;
    content?: Record<string, any>;
    settings?: Record<string, any>;
    sort_order: number;
  }): Promise<WebsitePageSection> {
    const { data, error } = await supabase
      .from('website_page_sections')
      .insert({
        ...section,
        content: section.content || {},
        settings: section.settings || {},
        is_visible: true,
      })
      .select()
      .single();

    if (error) throw error;
    return data as WebsitePageSection;
  }

  async updateSection(
    sectionId: string,
    updates: Partial<Pick<WebsitePageSection, 'section_variant' | 'content' | 'settings' | 'sort_order' | 'is_visible'>>
  ): Promise<WebsitePageSection> {
    const { data, error } = await supabase
      .from('website_page_sections')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', sectionId)
      .select()
      .maybeSingle();

    if (error) {
      console.error('Supabase updateSection error:', error.message, error.code);
      throw new Error(error.message || 'No se pudo actualizar la sección.');
    }
    if (!data) {
      throw new Error('No se pudo actualizar la sección. Verifica permisos (rol owner o admin).');
    }
    return data as WebsitePageSection;
  }

  async deleteSection(sectionId: string): Promise<void> {
    const { error } = await supabase
      .from('website_page_sections')
      .delete()
      .eq('id', sectionId);

    if (error) throw error;
  }

  async reorderSections(pageId: string, sectionIds: string[]): Promise<void> {
    if (!sectionIds.length) return;

    const timestamp = new Date().toISOString();
    const promises = sectionIds.map((id, index) =>
      supabase
        .from('website_page_sections')
        .update({ sort_order: index, updated_at: timestamp })
        .eq('id', id)
        .eq('page_id', pageId)
    );

    const results = await Promise.all(promises);
    const firstError = results.find((r) => r.error);
    if (firstError?.error) {
      console.error('Supabase reorderSections error:', firstError.error.message);
      throw new Error(firstError.error.message || 'No se pudo reordenar las secciones.');
    }
  }

  async toggleSectionVisibility(sectionId: string, isVisible: boolean): Promise<void> {
    const { error } = await supabase
      .from('website_page_sections')
      .update({ is_visible: isVisible, updated_at: new Date().toISOString() })
      .eq('id', sectionId);

    if (error) throw error;
  }

  // ---- PREVIEW URL ----

  async getPreviewUrl(organizationId: number, slug?: string): Promise<string | null> {
    const { data, error } = await supabase
      .from('organization_domains')
      .select('host, domain_type, is_primary')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('is_primary', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      // Fallback: check subdomain on organizations table
      const { data: org } = await supabase
        .from('organizations')
        .select('subdomain')
        .eq('id', organizationId)
        .single();

      if (org?.subdomain) {
        const base = `https://${org.subdomain}.goadmin.io`;
        return slug && slug !== 'home' ? `${base}/${slug}` : base;
      }
      return null;
    }

    const base = `https://${data.host}`;
    return slug && slug !== 'home' ? `${base}/${slug}` : base;
  }
}

export const websitePageBuilderService = new WebsitePageBuilderService();
