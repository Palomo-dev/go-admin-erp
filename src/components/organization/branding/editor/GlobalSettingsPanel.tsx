'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sun, Moon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { WebsiteSettings } from '@/lib/services/websiteSettingsService';
import { FONTS } from '@/lib/services/websiteSettingsService';
import type { WebsitePage } from '@/lib/services/websitePageBuilderService';

interface GlobalSettingsPanelProps {
  settings: WebsiteSettings;
  onUpdate: (updates: Partial<WebsiteSettings>) => void;
  pages?: WebsitePage[];
  onTogglePageHeader?: (pageId: string, show: boolean) => void;
}

export default function GlobalSettingsPanel({
  settings,
  onUpdate,
  pages,
  onTogglePageHeader,
}: GlobalSettingsPanelProps) {
  const t = useTranslations('branding.editor.globalSettings');
  return (
    <div className="space-y-4">
      {/* Colores */}
      <div>
        <Label className="text-xs text-gray-500 dark:text-gray-400 mb-2 block">{t('colors')}</Label>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <span className="text-[10px] text-gray-500 dark:text-gray-500">{t('primary')}</span>
            <div className="flex items-center gap-1.5">
              <input
                type="color"
                value={settings.primary_color || '#3B82F6'}
                onChange={(e) => onUpdate({ primary_color: e.target.value })}
                className="h-7 w-7 rounded cursor-pointer border-0 p-0"
              />
              <span className="text-[10px] text-gray-400 dark:text-gray-500 font-mono">
                {settings.primary_color || '#3B82F6'}
              </span>
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] text-gray-500 dark:text-gray-500">{t('secondary')}</span>
            <div className="flex items-center gap-1.5">
              <input
                type="color"
                value={settings.secondary_color || '#6366F1'}
                onChange={(e) => onUpdate({ secondary_color: e.target.value })}
                className="h-7 w-7 rounded cursor-pointer border-0 p-0"
              />
              <span className="text-[10px] text-gray-400 dark:text-gray-500 font-mono">
                {settings.secondary_color || '#6366F1'}
              </span>
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] text-gray-500 dark:text-gray-500">{t('accent')}</span>
            <div className="flex items-center gap-1.5">
              <input
                type="color"
                value={settings.accent_color || '#F59E0B'}
                onChange={(e) => onUpdate({ accent_color: e.target.value })}
                className="h-7 w-7 rounded cursor-pointer border-0 p-0"
              />
              <span className="text-[10px] text-gray-400 dark:text-gray-500 font-mono">
                {settings.accent_color || '#F59E0B'}
              </span>
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] text-gray-500 dark:text-gray-500">{t('background')}</span>
            <div className="flex items-center gap-1.5">
              <input
                type="color"
                value={settings.background_color || '#FFFFFF'}
                onChange={(e) => onUpdate({ background_color: e.target.value })}
                className="h-7 w-7 rounded cursor-pointer border-0 p-0"
              />
              <span className="text-[10px] text-gray-400 dark:text-gray-500 font-mono">
                {settings.background_color || '#FFFFFF'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tipografía */}
      <div>
        <Label className="text-xs text-gray-500 dark:text-gray-400 mb-2 block">{t('typography')}</Label>
        <div className="space-y-2">
          <div className="space-y-1">
            <span className="text-[10px] text-gray-500 dark:text-gray-500">{t('headings')}</span>
            <Select
              value={settings.font_heading || 'Inter'}
              onValueChange={(val) => onUpdate({ font_heading: val })}
            >
              <SelectTrigger className="h-7 text-xs bg-white dark:bg-white/5 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FONTS.map((font) => (
                  <SelectItem key={font} value={font} style={{ fontFamily: font }}>
                    {font}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] text-gray-500 dark:text-gray-500">{t('body')}</span>
            <Select
              value={settings.font_body || 'Inter'}
              onValueChange={(val) => onUpdate({ font_body: val })}
            >
              <SelectTrigger className="h-7 text-xs bg-white dark:bg-white/5 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FONTS.map((font) => (
                  <SelectItem key={font} value={font} style={{ fontFamily: font }}>
                    {font}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Modo tema */}
      <div>
        <Label className="text-xs text-gray-500 dark:text-gray-400 mb-2 block">{t('themeMode')}</Label>
        <div className="flex gap-2">
          <button
            onClick={() => onUpdate({ theme_mode: 'light' })}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-xs transition-colors ${
              settings.theme_mode === 'light'
                ? 'bg-blue-100 text-blue-700 dark:bg-white/20 dark:text-white'
                : 'bg-gray-100 dark:bg-white/5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Sun className="h-3 w-3" />
            {t('light')}
          </button>
          <button
            onClick={() => onUpdate({ theme_mode: 'dark' })}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-xs transition-colors ${
              settings.theme_mode === 'dark'
                ? 'bg-blue-100 text-blue-700 dark:bg-white/20 dark:text-white'
                : 'bg-gray-100 dark:bg-white/5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Moon className="h-3 w-3" />
            {t('dark')}
          </button>
        </div>
      </div>

      {/* Header Style */}
      <div>
        <Label className="text-xs text-gray-500 dark:text-gray-400 mb-2 block">{t('headerStyle')}</Label>
        <Select
          value={(settings as any).header_style || 'default'}
          onValueChange={(val) => onUpdate({ ...settings, header_style: val } as any)}
        >
          <SelectTrigger className="h-7 text-xs bg-white dark:bg-white/5 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">{t('headerStyleDefault')}</SelectItem>
            <SelectItem value="transparent">{t('headerStyleTransparent')}</SelectItem>
            <SelectItem value="minimal">{t('headerStyleMinimal')}</SelectItem>
            <SelectItem value="centered">{t('headerStyleCentered')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Header CTA */}
      <div>
        <Label className="text-xs text-gray-500 dark:text-gray-400 mb-2 block">{t('headerButton')}</Label>
        <div className="space-y-2">
          <Input
            value={settings.hero_cta_text || ''}
            onChange={(e) => onUpdate({ hero_cta_text: e.target.value })}
            placeholder={t('buttonText')}
            className="h-7 text-xs bg-white dark:bg-white/5 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
          />
          <Input
            value={settings.hero_cta_url || ''}
            onChange={(e) => onUpdate({ hero_cta_url: e.target.value })}
            placeholder={t('buttonUrl')}
            className="h-7 text-xs bg-white dark:bg-white/5 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
          />
        </div>
      </div>

      {/* Botón Comprar Ahora */}
      <div>
        <Label className="text-xs text-gray-500 dark:text-gray-400 mb-2 block">🛒 Botón &quot;Comprar ahora&quot;</Label>
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-gray-600 dark:text-gray-400">Mostrar en tarjetas de productos</span>
          <Switch
            checked={(settings as any).show_buy_now_button ?? true}
            onCheckedChange={(checked) => onUpdate({ ...settings, show_buy_now_button: checked } as any)}
          />
        </div>
      </div>

      {/* Countdown Timer */}
      <div>
        <Label className="text-xs text-gray-500 dark:text-gray-400 mb-2 block">⏰ Countdown Timer</Label>
        <div className="space-y-3">
          {/* Activar/Desactivar */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-600 dark:text-gray-400">Activar countdown</span>
            <Switch
              checked={(settings as any).countdown_enabled || false}
              onCheckedChange={(checked) => onUpdate({ ...settings, countdown_enabled: checked } as any)}
            />
          </div>

          {(settings as any).countdown_enabled && (
            <>
              {/* Título */}
              <div className="space-y-1">
                <span className="text-[10px] text-gray-500 dark:text-gray-500">Texto</span>
                <Input
                  value={(settings as any).countdown_title || ''}
                  onChange={(e) => onUpdate({ ...settings, countdown_title: e.target.value } as any)}
                  placeholder="¡Oferta por tiempo limitado!"
                  className="h-7 text-xs bg-white dark:bg-white/5 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-white placeholder:text-gray-400"
                />
              </div>

              {/* Modo */}
              <div className="space-y-1">
                <span className="text-[10px] text-gray-500 dark:text-gray-500">Modo</span>
                <Select
                  value={(settings as any).countdown_mode || 'daily_reset'}
                  onValueChange={(val) => onUpdate({ ...settings, countdown_mode: val } as any)}
                >
                  <SelectTrigger className="h-7 text-xs bg-white dark:bg-white/5 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily_reset">Se reinicia cada 24h</SelectItem>
                    <SelectItem value="custom">Fecha personalizada</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Campos según modo */}
              {(settings as any).countdown_mode === 'custom' ? (
                <div className="space-y-1">
                  <span className="text-[10px] text-gray-500 dark:text-gray-500">Fecha fin</span>
                  <Input
                    type="datetime-local"
                    value={(settings as any).countdown_end_date || ''}
                    onChange={(e) => onUpdate({ ...settings, countdown_end_date: e.target.value } as any)}
                    className="h-7 text-xs bg-white dark:bg-white/5 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-white"
                  />
                </div>
              ) : (
                <>
                  <div className="space-y-1">
                    <span className="text-[10px] text-gray-500 dark:text-gray-500">Zona horaria</span>
                    <Select
                      value={(settings as any).countdown_timezone || 'America/Bogota'}
                      onValueChange={(val) => onUpdate({ ...settings, countdown_timezone: val } as any)}
                    >
                      <SelectTrigger className="h-7 text-xs bg-white dark:bg-white/5 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="America/Bogota">Colombia (GMT-5)</SelectItem>
                        <SelectItem value="America/Mexico_City">México (GMT-6)</SelectItem>
                        <SelectItem value="America/Argentina/Buenos_Aires">Argentina (GMT-3)</SelectItem>
                        <SelectItem value="America/Santiago">Chile (GMT-4)</SelectItem>
                        <SelectItem value="America/Lima">Perú (GMT-5)</SelectItem>
                        <SelectItem value="Europe/Madrid">España (GMT+1)</SelectItem>
                        <SelectItem value="America/New_York">EEUU Este (GMT-5)</SelectItem>
                        <SelectItem value="America/Los_Angeles">EEUU Oeste (GMT-8)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] text-gray-500 dark:text-gray-500">Hora de reinicio (0-23)</span>
                    <Input
                      type="number"
                      min={0}
                      max={23}
                      value={(settings as any).countdown_reset_hour ?? 0}
                      onChange={(e) => onUpdate({ ...settings, countdown_reset_hour: parseInt(e.target.value) || 0 } as any)}
                      className="h-7 text-xs bg-white dark:bg-white/5 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-white"
                    />
                  </div>
                </>
              )}

              {/* Dónde mostrar */}
              <div className="space-y-2">
                <span className="text-[10px] text-gray-500 dark:text-gray-500">Mostrar en</span>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-600 dark:text-gray-400">Header</span>
                    <Switch
                      checked={(settings as any).countdown_show_in_header ?? true}
                      onCheckedChange={(checked) => onUpdate({ ...settings, countdown_show_in_header: checked } as any)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-600 dark:text-gray-400">Carrito</span>
                    <Switch
                      checked={(settings as any).countdown_show_in_cart ?? true}
                      onCheckedChange={(checked) => onUpdate({ ...settings, countdown_show_in_cart: checked } as any)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-600 dark:text-gray-400">Detalle producto</span>
                    <Switch
                      checked={(settings as any).countdown_show_in_product ?? true}
                      onCheckedChange={(checked) => onUpdate({ ...settings, countdown_show_in_product: checked } as any)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-600 dark:text-gray-400">Hero / Inicio</span>
                    <Switch
                      checked={(settings as any).countdown_show_in_hero ?? false}
                      onCheckedChange={(checked) => onUpdate({ ...settings, countdown_show_in_hero: checked } as any)}
                    />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

    </div>
  );
}
