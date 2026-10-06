'use client';

import { Button } from '@/components/ui/button';
import type { WebsiteSettings } from '@/lib/services/websiteSettingsService';
import type { DispositivoInspector as DevicePreview } from '@/components/sitio-web/ui/dispositivos';
import FooterLayoutSelector from '../FooterLayoutSelector';
import FooterPreviewMockup from '../FooterPreviewMockup';
import FooterOptionsPanel from '../FooterOptionsPanel';
import MobileFooterPanel from '../MobileFooterPanel';
import { InspectorZonaGlobal } from './InspectorZonaGlobal';
import { pestanaInicialZona } from './zonaGlobal';

/**
 * Inspector del pie: los paneles de siempre (antes en el acordeón «Footer» del
 * sidebar) en las cuatro pestañas. Guardado sin cambios: `onUpdate` es el
 * `handleUpdateGlobalSettings` del editor (footerKeys al guardar). Los menús
 * nombrados del pie se editan en la hoja lateral («Editar menús del pie»).
 */
export interface FooterInspectorProps {
  settings: WebsiteSettings;
  onUpdate: (updates: Partial<WebsiteSettings>) => void;
  devicePreview: DevicePreview;
  onEditarMenus: () => void;
  onCerrar: () => void;
}

/** Ajustes del pie con sus valores por defecto (los usan el inspector y el editor en el celular). */
export function opcionesPie(settings: WebsiteSettings) {
  const opciones = {
    footer_style: settings.footer_style || 'default',
    footer_columns: settings.footer_columns ?? 4,
    footer_background: settings.footer_background ?? 'dark',
    footer_custom_bg_color: settings.footer_custom_bg_color ?? null,
    footer_show_contact: settings.footer_show_contact ?? true,
    footer_show_hours: settings.footer_show_hours ?? false,
    footer_show_social: settings.footer_show_social ?? true,
    footer_show_categories: settings.footer_show_categories ?? false,
    footer_show_newsletter: settings.footer_show_newsletter ?? false,
    footer_newsletter_title: settings.footer_newsletter_title ?? null,
    footer_newsletter_placeholder: settings.footer_newsletter_placeholder ?? null,
    footer_newsletter_button_text: settings.footer_newsletter_button_text ?? null,
    footer_text: settings.footer_text ?? null,
    show_powered_by: settings.show_powered_by ?? true,
  };
  const movil = {
    mobile_footer_style: settings.mobile_footer_style ?? 'accordion',
    mobile_footer_show_social: settings.mobile_footer_show_social ?? true,
    mobile_footer_show_hours: settings.mobile_footer_show_hours ?? false,
  };

  return { opciones, movil };
}

/** Boceto del pie con los ajustes sin guardar (inspector y editor en el celular). */
export function BocetoPie({ settings, isMobile }: { settings: WebsiteSettings; isMobile: boolean }) {
  const { opciones, movil } = opcionesPie(settings);
  return (
    <FooterPreviewMockup
      layout={opciones.footer_style}
      columns={opciones.footer_columns}
      background={opciones.footer_background}
      customBgColor={opciones.footer_custom_bg_color}
      showContact={opciones.footer_show_contact}
      showHours={opciones.footer_show_hours}
      showSocial={opciones.footer_show_social}
      showNewsletter={opciones.footer_show_newsletter}
      showCategories={opciones.footer_show_categories}
      showPoweredBy={opciones.show_powered_by}
      footerText={opciones.footer_text}
      newsletterTitle={opciones.footer_newsletter_title}
      newsletterPlaceholder={opciones.footer_newsletter_placeholder}
      newsletterButtonText={opciones.footer_newsletter_button_text}
      isMobile={isMobile}
      mobileStyle={movil.mobile_footer_style}
      mobileShowSocial={movil.mobile_footer_show_social}
      mobileShowHours={movil.mobile_footer_show_hours}
    />
  );
}

export function FooterInspector({ settings, onUpdate, devicePreview, onEditarMenus, onCerrar }: FooterInspectorProps) {
  const { opciones, movil } = opcionesPie(settings);
  const mockup = (isMobile: boolean) => <BocetoPie settings={settings} isMobile={isMobile} />;

  return (
    <InspectorZonaGlobal
      zona="footer"
      pestanaInicial={pestanaInicialZona(devicePreview)}
      onCerrar={onCerrar}
      paneles={{
        diseno: (
          <>
            <FooterLayoutSelector currentLayout={opciones.footer_style} onSelect={(layout) => onUpdate({ footer_style: layout })} />
            {/* El lienzo pinta lo guardado; el boceto refleja lo que aún no se guarda. */}
            {mockup(devicePreview === 'mobile')}
            <FooterOptionsPanel grupo="diseno" settings={opciones} onUpdate={onUpdate} />
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-fg">Menús del pie</p>
              <p className="text-[11px] text-fg-muted">Crea, renombra y ordena los menús nombrados que se muestran en el pie.</p>
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={onEditarMenus}>
                Editar menús del pie
              </Button>
            </div>
          </>
        ),
        contenido: <FooterOptionsPanel grupo="contenido" settings={opciones} onUpdate={onUpdate} />,
        estilo: <FooterOptionsPanel grupo="estilo" settings={opciones} onUpdate={onUpdate} />,
        celular: (
          <>
            {mockup(true)}
            <MobileFooterPanel settings={movil} onUpdate={onUpdate} />
          </>
        ),
      }}
    />
  );
}
