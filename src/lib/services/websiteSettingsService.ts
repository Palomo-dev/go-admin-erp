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

// ============================================================
// Template Presets — mirror de goadmin-websites/lib/templates/presets.ts
// 7 tipos de negocio × 4 variantes = 28 presets
// ============================================================

export interface TemplatePresetInfo {
  id: string;
  name: string;
  description: string;
  business_type: string;
  is_default: boolean;
  theme_mode: 'light' | 'dark';
  colors: { primary: string; secondary: string };
  fonts: { heading: string; body: string };
  header_style: string;
  footer_style: string;
}

/** Mapeo type_id (BD) → business_type (presets) */
export const TYPE_ID_TO_BUSINESS: Record<number, string> = {
  1: 'restaurant',
  2: 'hotel',
  3: 'retail',
  4: 'services',
  5: 'gym',
  6: 'transport',
  7: 'parking',
};

export const TEMPLATE_PRESETS: TemplatePresetInfo[] = [
  // --- Retail ---
  { id: 'retail_modern', name: 'Retail Moderno', description: 'Limpio, minimalista, bordes redondeados', business_type: 'retail', is_default: true, theme_mode: 'light', colors: { primary: '#3B82F6', secondary: '#1E293B' }, fonts: { heading: 'Inter', body: 'Inter' }, header_style: 'default', footer_style: 'three_columns' },
  { id: 'retail_classic', name: 'Retail Clásico', description: 'Tradicional, elegante, serif headings', business_type: 'retail', is_default: false, theme_mode: 'light', colors: { primary: '#8B4513', secondary: '#2C1810' }, fonts: { heading: 'Playfair Display', body: 'Lora' }, header_style: 'centered', footer_style: 'default' },
  { id: 'retail_bold', name: 'Retail Bold', description: 'Vibrante, colorido, sombras marcadas', business_type: 'retail', is_default: false, theme_mode: 'light', colors: { primary: '#FF6B35', secondary: '#1A1A2E' }, fonts: { heading: 'Poppins', body: 'Nunito' }, header_style: 'default', footer_style: 'minimal' },
  { id: 'retail_elegant', name: 'Retail Elegante', description: 'Lujo, premium, blanco y negro con gold', business_type: 'retail', is_default: false, theme_mode: 'light', colors: { primary: '#C9A96E', secondary: '#1A1A1A' }, fonts: { heading: 'Cormorant Garamond', body: 'Montserrat' }, header_style: 'transparent', footer_style: 'centered' },
  // --- Restaurant ---
  { id: 'restaurant_modern', name: 'Restaurante Moderno', description: 'Limpio, fotografía prominente, bistró moderno', business_type: 'restaurant', is_default: true, theme_mode: 'light', colors: { primary: '#E63946', secondary: '#1D3557' }, fonts: { heading: 'DM Sans', body: 'DM Sans' }, header_style: 'default', footer_style: 'three_columns' },
  { id: 'restaurant_elegant', name: 'Restaurante Elegante', description: 'Fine dining, oscuro, dorado, fotografía artística', business_type: 'restaurant', is_default: false, theme_mode: 'dark', colors: { primary: '#D4AF37', secondary: '#0D0D0D' }, fonts: { heading: 'Playfair Display', body: 'Lato' }, header_style: 'transparent', footer_style: 'centered' },
  { id: 'restaurant_casual', name: 'Restaurante Casual', description: 'Divertido, colorido, fast casual', business_type: 'restaurant', is_default: false, theme_mode: 'light', colors: { primary: '#FF6B35', secondary: '#004E64' }, fonts: { heading: 'Fredoka', body: 'Nunito' }, header_style: 'default', footer_style: 'minimal' },
  { id: 'restaurant_rustic', name: 'Restaurante Rústico', description: 'Orgánico, rústico, farm-to-table', business_type: 'restaurant', is_default: false, theme_mode: 'light', colors: { primary: '#5C4033', secondary: '#2D5016' }, fonts: { heading: 'Merriweather', body: 'Source Sans Pro' }, header_style: 'centered', footer_style: 'three_columns' },
  // --- Hotel ---
  { id: 'hotel_luxury', name: 'Hotel Lujo', description: 'Elegante, dorado, serif, fotografía editorial', business_type: 'hotel', is_default: true, theme_mode: 'light', colors: { primary: '#B8860B', secondary: '#1A1A2E' }, fonts: { heading: 'Playfair Display', body: 'Lato' }, header_style: 'transparent', footer_style: 'three_columns' },
  { id: 'hotel_boutique', name: 'Hotel Boutique', description: 'Artístico, personalidad única, colores tierra', business_type: 'hotel', is_default: false, theme_mode: 'light', colors: { primary: '#A0522D', secondary: '#2F4F4F' }, fonts: { heading: 'Cormorant', body: 'Karla' }, header_style: 'centered', footer_style: 'centered' },
  { id: 'hotel_minimal', name: 'Hotel Minimal', description: 'Escandinavo, limpio, mucho blanco', business_type: 'hotel', is_default: false, theme_mode: 'light', colors: { primary: '#4A5568', secondary: '#F7FAFC' }, fonts: { heading: 'Outfit', body: 'Inter' }, header_style: 'minimal', footer_style: 'minimal' },
  { id: 'hotel_resort', name: 'Hotel Resort', description: 'Tropical, vibrante, vacacional', business_type: 'hotel', is_default: false, theme_mode: 'light', colors: { primary: '#00897B', secondary: '#FF7043' }, fonts: { heading: 'Montserrat', body: 'Open Sans' }, header_style: 'transparent', footer_style: 'three_columns' },
  // --- Gym ---
  { id: 'gym_power', name: 'Gym Power', description: 'Oscuro, energético, bold, motivacional', business_type: 'gym', is_default: true, theme_mode: 'dark', colors: { primary: '#FF4444', secondary: '#1A1A1A' }, fonts: { heading: 'Oswald', body: 'Roboto' }, header_style: 'default', footer_style: 'default' },
  { id: 'gym_wellness', name: 'Gym Wellness', description: 'Claro, zen, yoga/pilates, tonos suaves', business_type: 'gym', is_default: false, theme_mode: 'light', colors: { primary: '#7C9A92', secondary: '#F5F0EB' }, fonts: { heading: 'Quicksand', body: 'Nunito' }, header_style: 'minimal', footer_style: 'centered' },
  { id: 'gym_urban', name: 'Gym Urban', description: 'Callejero, grafiti, crossfit, raw', business_type: 'gym', is_default: false, theme_mode: 'dark', colors: { primary: '#FFD600', secondary: '#212121' }, fonts: { heading: 'Bebas Neue', body: 'Barlow' }, header_style: 'default', footer_style: 'minimal' },
  { id: 'gym_premium', name: 'Gym Premium', description: 'Boutique fitness, premium, elegante', business_type: 'gym', is_default: false, theme_mode: 'dark', colors: { primary: '#B8860B', secondary: '#1C1C1C' }, fonts: { heading: 'Cormorant Garamond', body: 'Montserrat' }, header_style: 'transparent', footer_style: 'three_columns' },
  // --- Transport ---
  { id: 'transport_corporate', name: 'Transporte Corporativo', description: 'Profesional, confiable, corporativo', business_type: 'transport', is_default: true, theme_mode: 'light', colors: { primary: '#1565C0', secondary: '#263238' }, fonts: { heading: 'Roboto', body: 'Roboto' }, header_style: 'default', footer_style: 'three_columns' },
  { id: 'transport_dynamic', name: 'Transporte Dinámico', description: 'Moderno, tech-forward, animaciones', business_type: 'transport', is_default: false, theme_mode: 'light', colors: { primary: '#00BCD4', secondary: '#1A237E' }, fonts: { heading: 'Poppins', body: 'Inter' }, header_style: 'default', footer_style: 'minimal' },
  { id: 'transport_classic', name: 'Transporte Clásico', description: 'Tradicional, establecido, confiable', business_type: 'transport', is_default: false, theme_mode: 'light', colors: { primary: '#D32F2F', secondary: '#1B5E20' }, fonts: { heading: 'Merriweather', body: 'Open Sans' }, header_style: 'centered', footer_style: 'default' },
  { id: 'transport_eco', name: 'Transporte Eco', description: 'Ecológico, verde, sostenible', business_type: 'transport', is_default: false, theme_mode: 'light', colors: { primary: '#43A047', secondary: '#1B5E20' }, fonts: { heading: 'Nunito', body: 'Nunito' }, header_style: 'default', footer_style: 'three_columns' },
  // --- Parking ---
  { id: 'parking_modern', name: 'Parking Moderno', description: 'Limpio, funcional, orientado a conversión', business_type: 'parking', is_default: true, theme_mode: 'light', colors: { primary: '#2196F3', secondary: '#37474F' }, fonts: { heading: 'Inter', body: 'Inter' }, header_style: 'default', footer_style: 'default' },
  { id: 'parking_tech', name: 'Parking Tech', description: 'Smart parking, futurista, high-tech', business_type: 'parking', is_default: false, theme_mode: 'dark', colors: { primary: '#00E676', secondary: '#121212' }, fonts: { heading: 'Space Grotesk', body: 'Inter' }, header_style: 'default', footer_style: 'minimal' },
  { id: 'parking_urban', name: 'Parking Urbano', description: 'Urbano, integrado a la ciudad', business_type: 'parking', is_default: false, theme_mode: 'light', colors: { primary: '#FF9800', secondary: '#424242' }, fonts: { heading: 'Poppins', body: 'Roboto' }, header_style: 'default', footer_style: 'default' },
  { id: 'parking_premium', name: 'Parking Premium', description: 'VIP, exclusivo, servicios premium', business_type: 'parking', is_default: false, theme_mode: 'dark', colors: { primary: '#9C7C38', secondary: '#1A1A1A' }, fonts: { heading: 'Playfair Display', body: 'Lato' }, header_style: 'transparent', footer_style: 'centered' },
  // --- Services ---
  { id: 'services_modern', name: 'Servicios Moderno', description: 'Clean, profesional, gradientes suaves', business_type: 'services', is_default: true, theme_mode: 'light', colors: { primary: '#6366F1', secondary: '#0F172A' }, fonts: { heading: 'Inter', body: 'Inter' }, header_style: 'default', footer_style: 'three_columns' },
  { id: 'services_corporate', name: 'Servicios Corporativo', description: 'Enterprise, profesional, confiable', business_type: 'services', is_default: false, theme_mode: 'light', colors: { primary: '#1976D2', secondary: '#1A237E' }, fonts: { heading: 'Roboto', body: 'Roboto' }, header_style: 'default', footer_style: 'three_columns' },
  { id: 'services_creative', name: 'Servicios Creativo', description: 'Creativo, playful, gradientes coloridos', business_type: 'services', is_default: false, theme_mode: 'light', colors: { primary: '#FF6B6B', secondary: '#4ECDC4' }, fonts: { heading: 'Poppins', body: 'Nunito' }, header_style: 'default', footer_style: 'minimal' },
  { id: 'services_minimal', name: 'Servicios Minimal', description: 'Ultra minimalista, mucho espacio', business_type: 'services', is_default: false, theme_mode: 'light', colors: { primary: '#000000', secondary: '#FFFFFF' }, fonts: { heading: 'Outfit', body: 'Inter' }, header_style: 'minimal', footer_style: 'centered' },
];

/** Obtener presets filtrados por tipo de negocio */
export function getPresetsForType(typeId: number | null): TemplatePresetInfo[] {
  if (!typeId) return TEMPLATE_PRESETS;
  const businessType = TYPE_ID_TO_BUSINESS[typeId];
  if (!businessType) return TEMPLATE_PRESETS;
  return TEMPLATE_PRESETS.filter(p => p.business_type === businessType);
}

// Templates legacy (retrocompatibilidad)
export const TEMPLATES = TEMPLATE_PRESETS;

// Fuentes disponibles (todas las usadas en presets)
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
  'DM Sans',
  'Oswald',
  'Cormorant Garamond',
  'Cormorant',
  'Outfit',
  'Quicksand',
  'Bebas Neue',
  'Barlow',
  'Karla',
  'Space Grotesk',
  'Fredoka',
  'Lora',
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
    const { data, error } = await supabase
      .from('website_settings')
      .update({ ...theme, updated_at: new Date().toISOString() })
      .eq('organization_id', organizationId)
      .select()
      .maybeSingle();

    if (error) {
      console.error('Supabase updateTheme error:', error.message, error.code);
      throw new Error(error.message || 'No se pudo actualizar el tema.');
    }
    if (!data) {
      throw new Error('No se pudo actualizar el tema. Verifica permisos (rol owner o admin).');
    }
    return data as WebsiteSettings;
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
