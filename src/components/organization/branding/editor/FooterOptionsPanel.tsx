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
}

export default function FooterOptionsPanel({
  settings,
  onUpdate,
}: FooterOptionsPanelProps) {
  const showColumnsSlider = ['default', 'three_columns', 'split'].includes(settings.footer_style);

  return (
    <div className="space-y-3">
      {/* Número de columnas */}
      {showColumnsSlider && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium dark:text-gray-200">
              Número de columnas
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

      {/* Fondo del footer */}
      <div className="space-y-2">
        <Label className="text-xs font-medium dark:text-gray-200">
          Fondo del footer
        </Label>
        <Select
          value={settings.footer_background}
          onValueChange={(v) => onUpdate({ footer_background: v })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="dark">Oscuro</SelectItem>
            <SelectItem value="light">Claro</SelectItem>
            <SelectItem value="primary">Color primario</SelectItem>
            <SelectItem value="custom">Personalizado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Color personalizado de fondo */}
      {settings.footer_background === 'custom' && (
        <div className="space-y-1.5">
          <Label className="text-xs font-medium dark:text-gray-200">
            Color personalizado
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
                title="Quitar color"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      )}

      {/* Switches de secciones */}
      <div className="space-y-2 pt-2 border-t border-gray-200 dark:border-gray-700">
        <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
          Secciones del footer
        </h4>

        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium dark:text-gray-200">
            Mostrar contacto
          </Label>
          <Switch
            checked={settings.footer_show_contact}
            onCheckedChange={(v) => onUpdate({ footer_show_contact: v })}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium dark:text-gray-200">
            Mostrar horarios
          </Label>
          <Switch
            checked={settings.footer_show_hours}
            onCheckedChange={(v) => onUpdate({ footer_show_hours: v })}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium dark:text-gray-200">
            Mostrar redes sociales
          </Label>
          <Switch
            checked={settings.footer_show_social}
            onCheckedChange={(v) => onUpdate({ footer_show_social: v })}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium dark:text-gray-200">
            Mostrar categorías
          </Label>
          <Switch
            checked={settings.footer_show_categories}
            onCheckedChange={(v) => onUpdate({ footer_show_categories: v })}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium dark:text-gray-200">
            Mostrar newsletter
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
            Newsletter
          </h4>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium dark:text-gray-200">
              Título del newsletter
            </Label>
            <Input
              className="h-8 text-xs"
              placeholder="Suscríbete a nuestro boletín"
              value={settings.footer_newsletter_title ?? ''}
              onChange={(e) => onUpdate({ footer_newsletter_title: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium dark:text-gray-200">
              Placeholder del input
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
              Texto del botón
            </Label>
            <Input
              className="h-8 text-xs"
              placeholder="Suscribirme"
              value={settings.footer_newsletter_button_text ?? ''}
              onChange={(e) => onUpdate({ footer_newsletter_button_text: e.target.value })}
            />
          </div>
        </div>
      )}

      {/* Mostrar "Powered by" */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
        <Label className="text-xs font-medium dark:text-gray-200">
          Mostrar "Powered by GO Admin"
        </Label>
        <Switch
          checked={settings.show_powered_by}
          onCheckedChange={(v) => onUpdate({ show_powered_by: v })}
        />
      </div>

      {/* Texto del footer */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium dark:text-gray-200">
          Texto del footer
        </Label>
        <Textarea
          className="text-xs resize-none"
          rows={2}
          placeholder="© 2024 Tu Empresa. Todos los derechos reservados."
          value={settings.footer_text ?? ''}
          onChange={(e) => onUpdate({ footer_text: e.target.value })}
        />
      </div>
    </div>
  );
}
