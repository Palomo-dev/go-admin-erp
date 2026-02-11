'use client';

import { supabase } from '@/lib/supabase/config';

// Interfaces
export interface WebsiteSettings {
  id: string;
  organization_id: number;
  template_id: string;
  theme_mode: 'light' | 'dark';
  // Colores
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  background_color: string | null;
  text_color: string | null;
  // Fuentes
  font_heading: string | null;
  font_body: string | null;
  // Hero
  hero_title: string | null;
  hero_subtitle: string | null;
  hero_image_url: string | null;
  hero_video_url: string | null;
  hero_cta_text: string | null;
  hero_cta_url: string | null;
  // Secciones visibles
  show_products: boolean;
  show_services: boolean;
  show_gallery: boolean;
  show_testimonials: boolean;
  show_team: boolean;
  show_blog: boolean;
  show_faq: boolean;
  show_contact: boolean;
  show_map: boolean;
  show_social_links: boolean;
  // Funcionalidades
  enable_reservations: boolean;
  enable_online_ordering: boolean;
  enable_appointments: boolean;
  enable_memberships: boolean;
  enable_tickets: boolean;
  enable_parking_booking: boolean;
  // SEO
  meta_title: string | null;
  meta_description: string | null;
  meta_keywords: string[] | null;
  og_image_url: string | null;
  favicon_url: string | null;
  canonical_url: string | null;
  google_site_verification: string | null;
  bing_site_verification: string | null;
  // Contenido
  social_links: Record<string, string>;
  business_hours: Record<string, any>;
  gallery_images: GalleryImage[];
  testimonials: Testimonial[];
  faq_items: FAQItem[];
  footer_text: string | null;
  footer_links: FooterLink[];
  // Avanzado
  custom_css: string | null;
  custom_scripts: string | null;
  analytics_id: string | null;
  // Estado
  is_published: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GalleryImage {
  id: string;
  url: string;
  alt: string;
  caption?: string;
}

export interface Testimonial {
  id: string;
  name: string;
  role?: string;
  company?: string;
  content: string;
  rating?: number;
  avatar_url?: string;
}

export interface FAQItem {
  id: string;
  question: string;
  answer: string;
  order?: number;
}

export interface FooterLink {
  id: string;
  label: string;
  url: string;
  order?: number;
}

export interface SocialLinks {
  facebook?: string;
  instagram?: string;
  twitter?: string;
  linkedin?: string;
  youtube?: string;
  tiktok?: string;
  whatsapp?: string;
}

export interface BusinessHours {
  monday?: { open: string; close: string; closed?: boolean };
  tuesday?: { open: string; close: string; closed?: boolean };
  wednesday?: { open: string; close: string; closed?: boolean };
  thursday?: { open: string; close: string; closed?: boolean };
  friday?: { open: string; close: string; closed?: boolean };
  saturday?: { open: string; close: string; closed?: boolean };
  sunday?: { open: string; close: string; closed?: boolean };
}

// Templates disponibles
export const TEMPLATES = [
  { id: 'modern', name: 'Moderno', description: 'Diseño limpio y minimalista' },
  { id: 'classic', name: 'Clásico', description: 'Estilo tradicional y elegante' },
  { id: 'bold', name: 'Audaz', description: 'Colores vibrantes y llamativos' },
  { id: 'minimal', name: 'Minimal', description: 'Ultra minimalista' },
];

// Fuentes disponibles
export const FONTS = [
  'Inter',
  'Roboto',
  'Open Sans',
  'Lato',
  'Montserrat',
  'Poppins',
  'Playfair Display',
  'Merriweather',
  'Source Sans Pro',
  'Nunito',
];

// Colores predeterminados
export const DEFAULT_COLORS = {
  primary: '#3B82F6',
  secondary: '#6366F1',
  accent: '#F59E0B',
  background: '#FFFFFF',
  text: '#1F2937',
};

class WebsiteSettingsService {
  // Obtener configuración de website
  async getSettings(organizationId: number): Promise<WebsiteSettings | null> {
    try {
      const { data, error } = await supabase
        .from('website_settings')
        .select('*')
        .eq('organization_id', organizationId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No existe, retornamos null para crear uno nuevo
          return null;
        }
        throw error;
      }

      return data as WebsiteSettings;
    } catch (error) {
      console.error('Error fetching website settings:', error);
      throw error;
    }
  }

  // Crear configuración inicial
  async createSettings(organizationId: number): Promise<WebsiteSettings> {
    try {
      const { data, error } = await supabase
        .from('website_settings')
        .insert({
          organization_id: organizationId,
          template_id: 'modern',
          theme_mode: 'light',
          primary_color: DEFAULT_COLORS.primary,
          secondary_color: DEFAULT_COLORS.secondary,
          accent_color: DEFAULT_COLORS.accent,
          background_color: DEFAULT_COLORS.background,
          text_color: DEFAULT_COLORS.text,
          font_heading: 'Inter',
          font_body: 'Inter',
          hero_cta_text: 'Contáctanos',
          show_products: true,
          show_services: true,
          show_gallery: true,
          show_testimonials: true,
          show_team: false,
          show_blog: false,
          show_faq: true,
          show_contact: true,
          show_map: true,
          show_social_links: true,
          enable_reservations: false,
          enable_online_ordering: false,
          enable_appointments: false,
          enable_memberships: false,
          enable_tickets: false,
          enable_parking_booking: false,
          social_links: {},
          business_hours: {},
          gallery_images: [],
          testimonials: [],
          faq_items: [],
          footer_links: [],
          is_published: false,
        })
        .select()
        .single();

      if (error) throw error;
      return data as WebsiteSettings;
    } catch (error) {
      console.error('Error creating website settings:', error);
      throw error;
    }
  }

  // Actualizar sección de tema
  async updateTheme(
    organizationId: number,
    theme: {
      template_id?: string;
      theme_mode?: 'light' | 'dark';
      primary_color?: string;
      secondary_color?: string;
      accent_color?: string;
      background_color?: string;
      text_color?: string;
      font_heading?: string;
      font_body?: string;
    }
  ): Promise<WebsiteSettings> {
    try {
      const { data, error } = await supabase
        .from('website_settings')
        .update({ ...theme, updated_at: new Date().toISOString() })
        .eq('organization_id', organizationId)
        .select()
        .single();

      if (error) throw error;
      return data as WebsiteSettings;
    } catch (error) {
      console.error('Error updating theme:', error);
      throw error;
    }
  }

  // Actualizar sección Hero
  async updateHero(
    organizationId: number,
    hero: {
      hero_title?: string;
      hero_subtitle?: string;
      hero_image_url?: string;
      hero_video_url?: string;
      hero_cta_text?: string;
      hero_cta_url?: string;
    }
  ): Promise<WebsiteSettings> {
    try {
      const { data, error } = await supabase
        .from('website_settings')
        .update({ ...hero, updated_at: new Date().toISOString() })
        .eq('organization_id', organizationId)
        .select()
        .single();

      if (error) throw error;
      return data as WebsiteSettings;
    } catch (error) {
      console.error('Error updating hero:', error);
      throw error;
    }
  }

  // Actualizar secciones visibles
  async updateSections(
    organizationId: number,
    sections: {
      show_products?: boolean;
      show_services?: boolean;
      show_gallery?: boolean;
      show_testimonials?: boolean;
      show_team?: boolean;
      show_blog?: boolean;
      show_faq?: boolean;
      show_contact?: boolean;
      show_map?: boolean;
      show_social_links?: boolean;
    }
  ): Promise<WebsiteSettings> {
    try {
      const { data, error } = await supabase
        .from('website_settings')
        .update({ ...sections, updated_at: new Date().toISOString() })
        .eq('organization_id', organizationId)
        .select()
        .single();

      if (error) throw error;
      return data as WebsiteSettings;
    } catch (error) {
      console.error('Error updating sections:', error);
      throw error;
    }
  }

  // Actualizar funcionalidades
  async updateFeatures(
    organizationId: number,
    features: {
      enable_reservations?: boolean;
      enable_online_ordering?: boolean;
      enable_appointments?: boolean;
      enable_memberships?: boolean;
      enable_tickets?: boolean;
      enable_parking_booking?: boolean;
    }
  ): Promise<WebsiteSettings> {
    try {
      const { data, error } = await supabase
        .from('website_settings')
        .update({ ...features, updated_at: new Date().toISOString() })
        .eq('organization_id', organizationId)
        .select()
        .single();

      if (error) throw error;
      return data as WebsiteSettings;
    } catch (error) {
      console.error('Error updating features:', error);
      throw error;
    }
  }

  // Actualizar SEO
  async updateSEO(
    organizationId: number,
    seo: {
      meta_title?: string;
      meta_description?: string;
      meta_keywords?: string[];
      og_image_url?: string;
      favicon_url?: string;
      canonical_url?: string;
      google_site_verification?: string;
      bing_site_verification?: string;
    }
  ): Promise<WebsiteSettings> {
    try {
      const { data, error } = await supabase
        .from('website_settings')
        .update({ ...seo, updated_at: new Date().toISOString() })
        .eq('organization_id', organizationId)
        .select()
        .single();

      if (error) throw error;
      return data as WebsiteSettings;
    } catch (error) {
      console.error('Error updating SEO:', error);
      throw error;
    }
  }

  // Actualizar contenido
  async updateContent(
    organizationId: number,
    content: {
      social_links?: Record<string, string>;
      business_hours?: Record<string, any>;
      gallery_images?: GalleryImage[];
      testimonials?: Testimonial[];
      faq_items?: FAQItem[];
      footer_text?: string;
      footer_links?: FooterLink[];
    }
  ): Promise<WebsiteSettings> {
    try {
      const { data, error } = await supabase
        .from('website_settings')
        .update({ ...content, updated_at: new Date().toISOString() })
        .eq('organization_id', organizationId)
        .select()
        .single();

      if (error) throw error;
      return data as WebsiteSettings;
    } catch (error) {
      console.error('Error updating content:', error);
      throw error;
    }
  }

  // Actualizar configuración avanzada
  async updateAdvanced(
    organizationId: number,
    advanced: {
      custom_css?: string;
      custom_scripts?: string;
      analytics_id?: string;
    }
  ): Promise<WebsiteSettings> {
    try {
      const { data, error } = await supabase
        .from('website_settings')
        .update({ ...advanced, updated_at: new Date().toISOString() })
        .eq('organization_id', organizationId)
        .select()
        .single();

      if (error) throw error;
      return data as WebsiteSettings;
    } catch (error) {
      console.error('Error updating advanced settings:', error);
      throw error;
    }
  }

  // Publicar/Despublicar sitio
  async togglePublish(organizationId: number, publish: boolean): Promise<WebsiteSettings> {
    try {
      const { data, error } = await supabase
        .from('website_settings')
        .update({
          is_published: publish,
          published_at: publish ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('organization_id', organizationId)
        .select()
        .single();

      if (error) throw error;
      return data as WebsiteSettings;
    } catch (error) {
      console.error('Error toggling publish:', error);
      throw error;
    }
  }

  // Restablecer a plantilla predeterminada
  async resetToTemplate(organizationId: number, templateId: string): Promise<WebsiteSettings> {
    try {
      const { data, error } = await supabase
        .from('website_settings')
        .update({
          template_id: templateId,
          primary_color: DEFAULT_COLORS.primary,
          secondary_color: DEFAULT_COLORS.secondary,
          accent_color: DEFAULT_COLORS.accent,
          background_color: DEFAULT_COLORS.background,
          text_color: DEFAULT_COLORS.text,
          font_heading: 'Inter',
          font_body: 'Inter',
          updated_at: new Date().toISOString(),
        })
        .eq('organization_id', organizationId)
        .select()
        .single();

      if (error) throw error;
      return data as WebsiteSettings;
    } catch (error) {
      console.error('Error resetting to template:', error);
      throw error;
    }
  }

  // Subir imagen (favicon, og_image, hero, gallery)
  async uploadImage(
    organizationId: number,
    file: File,
    type: 'favicon' | 'og_image' | 'hero' | 'gallery'
  ): Promise<string> {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${organizationId}/${type}_${Date.now()}.${fileExt}`;
      const bucketName = 'organization-assets';

      const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: publicUrl } = supabase.storage
        .from(bucketName)
        .getPublicUrl(fileName);

      return publicUrl.publicUrl;
    } catch (error) {
      console.error('Error uploading image:', error);
      throw error;
    }
  }

  // Importar FAQ desde JSON
  async importFAQ(organizationId: number, faqItems: Omit<FAQItem, 'id'>[]): Promise<WebsiteSettings> {
    try {
      const itemsWithIds = faqItems.map((item, index) => ({
        ...item,
        id: crypto.randomUUID(),
        order: index,
      }));

      const { data, error } = await supabase
        .from('website_settings')
        .update({
          faq_items: itemsWithIds,
          updated_at: new Date().toISOString(),
        })
        .eq('organization_id', organizationId)
        .select()
        .single();

      if (error) throw error;
      return data as WebsiteSettings;
    } catch (error) {
      console.error('Error importing FAQ:', error);
      throw error;
    }
  }

  // Importar testimonios desde JSON
  async importTestimonials(
    organizationId: number,
    testimonials: Omit<Testimonial, 'id'>[]
  ): Promise<WebsiteSettings> {
    try {
      const itemsWithIds = testimonials.map((item) => ({
        ...item,
        id: crypto.randomUUID(),
      }));

      const { data, error } = await supabase
        .from('website_settings')
        .update({
          testimonials: itemsWithIds,
          updated_at: new Date().toISOString(),
        })
        .eq('organization_id', organizationId)
        .select()
        .single();

      if (error) throw error;
      return data as WebsiteSettings;
    } catch (error) {
      console.error('Error importing testimonials:', error);
      throw error;
    }
  }
}

export const websiteSettingsService = new WebsiteSettingsService();
