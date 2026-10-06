'use client';

import type { WebsiteSettings } from '@/lib/services/websiteSettingsService';
import type { DispositivoInspector as DevicePreview } from '@/components/sitio-web/ui/dispositivos';
import HeaderLayoutSelector from '../HeaderLayoutSelector';
import HeaderPreviewMockup from '../HeaderPreviewMockup';
import HeaderOptionsPanel from '../HeaderOptionsPanel';
import MobileHeaderPanel from '../MobileHeaderPanel';
import { InspectorZonaGlobal } from './InspectorZonaGlobal';
import { pestanaInicialZona } from './zonaGlobal';

/**
 * Inspector del encabezado: los paneles de siempre (antes en el acordeón
 * «Configuración del Menú» del sidebar) repartidos en las cuatro pestañas.
 * No cambia qué se guarda ni cómo: todo pasa por `onUpdate`, que es el
 * `handleUpdateGlobalSettings` del editor (headerConfigKeys al guardar).
 */
export interface HeaderInspectorProps {
  settings: WebsiteSettings;
  onUpdate: (updates: Partial<WebsiteSettings>) => void;
  availableMenus: { id: string; name: string }[];
  devicePreview: DevicePreview;
  onEditarMenu: () => void;
  onCerrar: () => void;
}

/** Ajustes del encabezado con sus valores por defecto (los usan el inspector y el editor en el celular). */
export function opcionesEncabezado(settings: WebsiteSettings) {
  return {
    header_style: settings.header_style || 'default',
    logo_position: settings.logo_position || 'left',
    menu_position: settings.menu_position || 'inline',
    search_style: settings.search_style || 'icon',
    show_categories_in_header: settings.show_categories_in_header ?? false,
    categories_menu_style: settings.categories_menu_style || 'dropdown',
    mega_menu_columns: settings.mega_menu_columns ?? 4,
    header_cta_text: settings.header_cta_text,
    header_cta_url: settings.header_cta_url,
    show_header_cart: settings.show_header_cart ?? false,
    show_header_auth: settings.show_header_auth ?? false,
    show_topbar: settings.show_topbar ?? false,
    header_opacity: settings.header_opacity ?? 95,
    header_bg_color: settings.header_bg_color ?? null,
    topbar_bg_color: settings.topbar_bg_color ?? null,
    nav_bg_color: settings.nav_bg_color ?? null,
    accent_color: settings.accent_color ?? null,
    topbar_show_email: settings.topbar_show_email ?? true,
    topbar_show_phone: settings.topbar_show_phone ?? true,
    topbar_announcement: settings.topbar_announcement ?? null,
    topbar_contact_position: settings.topbar_contact_position ?? 'left',
    header_menu_id: settings.header_menu_id ?? null,
    header_mega_menu_id: settings.header_mega_menu_id ?? null,
    minimal_menu_style: settings.minimal_menu_style ?? 'drawer',
    cart_icon: settings.cart_icon ?? 'shopping-bag',
    search_icon: settings.search_icon ?? 'search',
    auth_icon: settings.auth_icon ?? 'user',
    currency_icon: settings.currency_icon ?? 'globe',
    actions_order: settings.actions_order ?? ['search', 'currency', 'cart', 'auth'],
    cta_padding_x: settings.cta_padding_x ?? 16,
    cta_padding_y: settings.cta_padding_y ?? 8,
    cta_border_radius: settings.cta_border_radius ?? 8,
    cta_full_width: settings.cta_full_width ?? false,
    cta_border_width: settings.cta_border_width ?? 0,
    cta_border_color: settings.cta_border_color ?? null,
    cta_shadow: settings.cta_shadow ?? 'none',
    cta_bg_color: settings.cta_bg_color ?? null,
    cta_text_color: settings.cta_text_color ?? null,
    cta_margin_top: settings.cta_margin_top ?? 0,
    cta_margin_bottom: settings.cta_margin_bottom ?? 0,
  };
}

/** Ajustes del encabezado en el celular con sus valores por defecto. */
export function opcionesEncabezadoMovil(settings: WebsiteSettings) {
  return {
    mobile_menu_style: settings.mobile_menu_style || 'drawer',
    mobile_search_style: settings.mobile_search_style || 'icon',
    mobile_show_topbar: settings.mobile_show_topbar ?? false,
    mobile_sticky_header: settings.mobile_sticky_header ?? true,
    mobile_breakpoint: settings.mobile_breakpoint ?? 768,
  };
}

/** Boceto del encabezado con los ajustes sin guardar (inspector y editor en el celular). */
export function BocetoEncabezado({ settings, isMobile }: { settings: WebsiteSettings; isMobile: boolean }) {
  const opciones = opcionesEncabezado(settings);
  return (
    <HeaderPreviewMockup
      layout={opciones.header_style}
      logoPosition={opciones.logo_position}
      menuPosition={opciones.menu_position}
      searchStyle={opciones.search_style}
      showTopbar={opciones.show_topbar}
      showCart={opciones.show_header_cart}
      showAuth={opciones.show_header_auth}
      ctaText={settings.header_cta_text || null}
      isMobile={isMobile}
      mobileMenuStyle={settings.mobile_menu_style || 'drawer'}
      headerOpacity={opciones.header_opacity}
    />
  );
}

export function HeaderInspector({ settings, onUpdate, availableMenus, devicePreview, onEditarMenu, onCerrar }: HeaderInspectorProps) {
  const opciones = opcionesEncabezado(settings);

  const mockup = (isMobile: boolean) => <BocetoEncabezado settings={settings} isMobile={isMobile} />;

  return (
    <InspectorZonaGlobal
      zona="header"
      pestanaInicial={pestanaInicialZona(devicePreview)}
      onCerrar={onCerrar}
      paneles={{
        diseno: (
          <>
            <HeaderLayoutSelector currentLayout={opciones.header_style} onSelect={(layout) => onUpdate({ header_style: layout })} />
            {/* El lienzo pinta lo guardado; el boceto refleja lo que aún no se guarda. */}
            {mockup(devicePreview === 'mobile')}
            <HeaderOptionsPanel grupo="diseno" settings={opciones} onUpdate={onUpdate} availableMenus={availableMenus} />
          </>
        ),
        contenido: (
          <HeaderOptionsPanel grupo="contenido" settings={opciones} onUpdate={onUpdate} availableMenus={availableMenus} onEditarMenu={onEditarMenu} />
        ),
        estilo: <HeaderOptionsPanel grupo="estilo" settings={opciones} onUpdate={onUpdate} availableMenus={availableMenus} />,
        celular: (
          <>
            {mockup(true)}
            <MobileHeaderPanel
              settings={opcionesEncabezadoMovil(settings)}
              onUpdate={onUpdate}
            />
          </>
        ),
      }}
    />
  );
}
