'use client';

import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTranslations } from 'next-intl';

/**
 * Grupo de ajustes que pinta el panel. Sin grupo pinta todo, como siempre; el
 * inspector del pie lo parte en pestañas (Figma «05 Editor»):
 * - `diseno`: número de columnas.
 * - `contenido`: qué se muestra, boletín, «Powered by» y texto legal.
 * - `estilo`: fondo del pie.
 */
export type GrupoFooterOptions = 'diseno' | 'contenido' | 'estilo';

interface FooterOptionsPanelProps {
  settings: {
    footer_style: string;
    footer_columns: number;
    footer_background: string;
    footer_custom_bg_color: string | null;
    footer_show_contact: boolean;
    footer_show_hours: boolean;
    footer_show_social: boolean;
    footer_show_categories: boolean;
    footer_show_newsletter: boolean;
    footer_newsletter_title: string | null;
    footer_newsletter_placeholder: string | null;
    footer_newsletter_button_text: string | null;
    footer_text: string | null;
    show_powered_by: boolean;
  };
  onUpdate: (updates: Record<string, string | number | boolean | null>) => void;
  /** Solo un grupo de ajustes (pestañas del inspector). Sin él, todos. */
  grupo?: GrupoFooterOptions;
}

export default function FooterOptionsPanel({
  settings,
  onUpdate,
  grupo,
}: FooterOptionsPanelProps) {
  const t = useTranslations('branding.editor');
  const showColumnsSlider = ['default', 'three_columns', 'split'].includes(settings.footer_style);
  const ver = (g: GrupoFooterOptions) => grupo === undefined || grupo === g;

  return (
    <div className="space-y-3">
      {/* Número de columnas */}
      {ver('diseno') && showColumnsSlider && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium dark:text-gray-200">
              {t('footerOptionsPanel.numeroColumnas')}
            </Label>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {settings.footer_columns} columnas
            </span>
          </div>
          <Slider
            min={2}
            max={6}
            step={1}
            value={[settings.footer_columns]}
            onValueChange={(v) => onUpdate({ footer_columns: v[0] })}
          />
        </div>
      )}

      {ver('estilo') && (<>
      {/* Fondo del footer */}
      <div className="space-y-2">
        <Label className="text-xs font-medium dark:text-gray-200">
          {t('footerOptionsPanel.fondoFooter')}
        </Label>
        <Select
          value={settings.footer_background}
          onValueChange={(v) => onUpdate({ footer_background: v })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="dark">{t('globalSettings.dark')}</SelectItem>
            <SelectItem value="light">{t('globalSettings.light')}</SelectItem>
            <SelectItem value="primary">{t('footerOptionsPanel.colorPrimario')}</SelectItem>
            <SelectItem value="custom">{t('footerOptionsPanel.personalizado')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Color personalizado de fondo */}
      {settings.footer_background === 'custom' && (
        <div className="space-y-1.5">
          <Label className="text-xs font-medium dark:text-gray-200">
            {t('footerOptionsPanel.colorPersonalizado')}
          </Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={settings.footer_custom_bg_color ?? '#1a1a1a'}
              onChange={(e) => onUpdate({ footer_custom_bg_color: e.target.value })}
              className="h-8 w-10 rounded border border-gray-300 dark:border-gray-600 cursor-pointer bg-transparent"
            />
            <Input
              type="text"
              className="h-8 text-xs flex-1"
              placeholder="#1a1a1a"
              value={settings.footer_custom_bg_color ?? ''}
              onChange={(e) => onUpdate({ footer_custom_bg_color: e.target.value || null })}
            />
            {settings.footer_custom_bg_color && (
              <button
                onClick={() => onUpdate({ footer_custom_bg_color: null })}
                className="text-xs text-gray-500 hover:text-red-500 px-2"
                title={t('footerOptionsPanel.quitarColor')}
              >
                ✕
              </button>
            )}
          </div>
        </div>
      )}

      </>)}

      {ver('contenido') && (<>
      {/* Switches de secciones */}
      <div className={grupo === undefined ? 'space-y-2 pt-2 border-t border-gray-200 dark:border-gray-700' : 'space-y-2'}>
        <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
          {t('footerOptionsPanel.seccionesFooter')}
        </h4>

        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium dark:text-gray-200">
            {t('footerOptionsPanel.mostrarContacto')}
          </Label>
          <Switch
            checked={settings.footer_show_contact}
            onCheckedChange={(v) => onUpdate({ footer_show_contact: v })}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium dark:text-gray-200">
            {t('footerOptionsPanel.mostrarHorarios')}
          </Label>
          <Switch
            checked={settings.footer_show_hours}
            onCheckedChange={(v) => onUpdate({ footer_show_hours: v })}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium dark:text-gray-200">
            {t('footerOptionsPanel.mostrarRedesSociales')}
          </Label>
          <Switch
            checked={settings.footer_show_social}
            onCheckedChange={(v) => onUpdate({ footer_show_social: v })}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium dark:text-gray-200">
            {t('footerOptionsPanel.mostrarCategorias')}
          </Label>
          <Switch
            checked={settings.footer_show_categories}
            onCheckedChange={(v) => onUpdate({ footer_show_categories: v })}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium dark:text-gray-200">
            {t('footerOptionsPanel.mostrarNewsletter')}
          </Label>
          <Switch
            checked={settings.footer_show_newsletter}
            onCheckedChange={(v) => onUpdate({ footer_show_newsletter: v })}
          />
        </div>
      </div>

      {/* Configuración del newsletter */}
      {settings.footer_show_newsletter && (
        <div className="space-y-2 pl-3 border-l-2 border-gray-200 dark:border-gray-700">
          <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
            {t('footerOptionsPanel.newsletter')}
          </h4>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium dark:text-gray-200">
              {t('footerOptionsPanel.tituloNewsletter')}
            </Label>
            <Input
              className="h-8 text-xs"
              placeholder={t('footerOptionsPanel.suscribeteNuestroBoletin')}
              value={settings.footer_newsletter_title ?? ''}
              onChange={(e) => onUpdate({ footer_newsletter_title: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium dark:text-gray-200">
              {t('footerOptionsPanel.placeholderInput')}
            </Label>
            <Input
              className="h-8 text-xs"
              placeholder="tu@email.com"
              value={settings.footer_newsletter_placeholder ?? ''}
              onChange={(e) => onUpdate({ footer_newsletter_placeholder: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium dark:text-gray-200">
              {t('globalSettings.buttonText')}
            </Label>
            <Input
              className="h-8 text-xs"
              placeholder={t('footerOptionsPanel.suscribirme')}
              value={settings.footer_newsletter_button_text ?? ''}
              onChange={(e) => onUpdate({ footer_newsletter_button_text: e.target.value })}
            />
          </div>
        </div>
      )}

      {/* Mostrar "Powered by" */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
        <Label className="text-xs font-medium dark:text-gray-200">
          {t('footerOptionsPanel.mostrarPoweredByGo')}
        </Label>
        <Switch
          checked={settings.show_powered_by}
          onCheckedChange={(v) => onUpdate({ show_powered_by: v })}
        />
      </div>

      {/* Texto del footer */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium dark:text-gray-200">
          {t('footerOptionsPanel.textoFooter')}
        </Label>
        <Textarea
          className="text-xs resize-none"
          rows={2}
          placeholder={t('footerOptionsPanel.n2024EmpresaTodosDerechos')}
          value={settings.footer_text ?? ''}
          onChange={(e) => onUpdate({ footer_text: e.target.value })}
        />
      </div>
      </>)}
    </div>
  );
}
