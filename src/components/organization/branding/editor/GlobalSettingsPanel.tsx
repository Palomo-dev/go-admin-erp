'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sun, Moon } from 'lucide-react';
import type { WebsiteSettings } from '@/lib/services/websiteSettingsService';
import { FONTS } from '@/lib/services/websiteSettingsService';

interface GlobalSettingsPanelProps {
  settings: WebsiteSettings;
  onUpdate: (updates: Partial<WebsiteSettings>) => void;
}

export default function GlobalSettingsPanel({
  settings,
  onUpdate,
}: GlobalSettingsPanelProps) {
  return (
    <div className="space-y-4">
      {/* Colores */}
      <div>
        <Label className="text-xs text-gray-500 dark:text-gray-400 mb-2 block">Colores</Label>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <span className="text-[10px] text-gray-500 dark:text-gray-500">Principal</span>
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
            <span className="text-[10px] text-gray-500 dark:text-gray-500">Secundario</span>
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
            <span className="text-[10px] text-gray-500 dark:text-gray-500">Acento</span>
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
            <span className="text-[10px] text-gray-500 dark:text-gray-500">Fondo</span>
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
        <Label className="text-xs text-gray-500 dark:text-gray-400 mb-2 block">Tipografía</Label>
        <div className="space-y-2">
          <div className="space-y-1">
            <span className="text-[10px] text-gray-500 dark:text-gray-500">Títulos</span>
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
            <span className="text-[10px] text-gray-500 dark:text-gray-500">Cuerpo</span>
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
        <Label className="text-xs text-gray-500 dark:text-gray-400 mb-2 block">Modo del tema</Label>
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
            Claro
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
            Oscuro
          </button>
        </div>
      </div>

      {/* Header Style */}
      <div>
        <Label className="text-xs text-gray-500 dark:text-gray-400 mb-2 block">Estilo Header</Label>
        <Select
          value={(settings as any).header_style || 'default'}
          onValueChange={(val) => onUpdate({ ...settings, header_style: val } as any)}
        >
          <SelectTrigger className="h-7 text-xs bg-white dark:bg-white/5 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">Por defecto</SelectItem>
            <SelectItem value="transparent">Transparente</SelectItem>
            <SelectItem value="minimal">Minimal</SelectItem>
            <SelectItem value="centered">Centrado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Header CTA */}
      <div>
        <Label className="text-xs text-gray-500 dark:text-gray-400 mb-2 block">Botón del Header</Label>
        <div className="space-y-2">
          <Input
            value={settings.hero_cta_text || ''}
            onChange={(e) => onUpdate({ hero_cta_text: e.target.value })}
            placeholder="Texto del botón"
            className="h-7 text-xs bg-white dark:bg-white/5 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
          />
          <Input
            value={settings.hero_cta_url || ''}
            onChange={(e) => onUpdate({ hero_cta_url: e.target.value })}
            placeholder="URL del botón"
            className="h-7 text-xs bg-white dark:bg-white/5 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500"
          />
        </div>
      </div>

    </div>
  );
}
