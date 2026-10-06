/**
 * Tema de cada plantilla del sitio (`TEMPLATE_PRESETS`) y el giro de cada `type_id`.
 *
 * Copia del tema de cada plantilla de goadmin-websites (`lib/templates/presets.ts`). Vivía en
 * `websiteSettingsService.ts`, que importa el cliente de navegador; se movió aquí (código puro)
 * para que el servidor arme el catálogo y la «Plantilla completa» sin ese cliente. El servicio la
 * reexporta: quien la importaba de allí no cambia.
 */
// 7 tipos de negocio × 4 variantes = 28 presets (mirror de goadmin-websites/lib/templates/presets.ts).

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
