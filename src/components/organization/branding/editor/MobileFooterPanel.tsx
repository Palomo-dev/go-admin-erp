'use client';

import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface MobileFooterPanelProps {
  settings: {
    mobile_footer_style: string;
    mobile_footer_show_social: boolean;
    mobile_footer_show_hours: boolean;
  };
  onUpdate: (updates: Record<string, string | number | boolean>) => void;
}

export default function MobileFooterPanel({
  settings,
  onUpdate,
}: MobileFooterPanelProps) {
  return (
    <div className="space-y-4">
      {/* Estilo del footer móvil */}
      <div className="space-y-1.5">
        <Label className="text-xs">Estilo del footer móvil</Label>
        <Select
          value={settings.mobile_footer_style}
          onValueChange={(v) => onUpdate({ mobile_footer_style: v })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="accordion">Acordeón (expandible)</SelectItem>
            <SelectItem value="stacked">Apilado (una columna)</SelectItem>
            <SelectItem value="tabs">Pestañas horizontales</SelectItem>
            <SelectItem value="hidden">Oculto en móvil</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Mostrar redes en móvil */}
      <div className="flex items-center justify-between">
        <Label className="text-xs">Mostrar redes en móvil</Label>
        <Switch
          checked={settings.mobile_footer_show_social}
          onCheckedChange={(v) => onUpdate({ mobile_footer_show_social: v })}
        />
      </div>

      {/* Mostrar horarios en móvil */}
      <div className="flex items-center justify-between">
        <Label className="text-xs">Mostrar horarios en móvil</Label>
        <Switch
          checked={settings.mobile_footer_show_hours}
          onCheckedChange={(v) => onUpdate({ mobile_footer_show_hours: v })}
        />
      </div>

      {/* Mockup móvil visual */}
      <div className="pt-2">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Vista previa móvil</p>
        <div className="w-[200px] mx-auto bg-gray-100 dark:bg-gray-800 rounded-[20px] border-4 border-gray-300 dark:border-gray-600 p-2">
          {settings.mobile_footer_style === 'hidden' ? (
            <div className="h-20 flex items-center justify-center text-[8px] text-gray-400">
              Footer oculto
            </div>
          ) : settings.mobile_footer_style === 'accordion' ? (
            <div className="space-y-1">
              {['Columna 1', 'Columna 2', 'Columna 3'].map((col) => (
                <div key={col} className="bg-white dark:bg-gray-900 rounded p-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[8px] font-medium text-gray-600 dark:text-gray-300">{col}</span>
                    <span className="text-[8px] text-gray-400">▼</span>
                  </div>
                </div>
              ))}
              {settings.mobile_footer_show_social && (
                <div className="flex justify-center gap-1 pt-1">
                  <div className="h-3 w-3 rounded-full bg-gray-300 dark:bg-gray-600" />
                  <div className="h-3 w-3 rounded-full bg-gray-300 dark:bg-gray-600" />
                  <div className="h-3 w-3 rounded-full bg-gray-300 dark:bg-gray-600" />
                </div>
              )}
            </div>
          ) : settings.mobile_footer_style === 'stacked' ? (
            <div className="space-y-2">
              <div className="bg-white dark:bg-gray-900 rounded p-1.5 space-y-1">
                <div className="h-1.5 w-8 rounded-sm bg-blue-500" />
                <div className="h-1 w-6 rounded-full bg-gray-300 dark:bg-gray-600" />
                <div className="h-1 w-5 rounded-full bg-gray-300 dark:bg-gray-600" />
              </div>
              <div className="bg-white dark:bg-gray-900 rounded p-1.5 space-y-1">
                <div className="h-1 w-4 rounded-full bg-gray-400 dark:bg-gray-500" />
                <div className="h-1 w-5 rounded-full bg-gray-300 dark:bg-gray-600" />
              </div>
              {settings.mobile_footer_show_social && (
                <div className="flex justify-center gap-1">
                  <div className="h-3 w-3 rounded-full bg-gray-300 dark:bg-gray-600" />
                  <div className="h-3 w-3 rounded-full bg-gray-300 dark:bg-gray-600" />
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex gap-1">
                <div className="flex-1 bg-white dark:bg-gray-900 rounded p-1 text-center text-[7px] font-medium text-blue-500">Col 1</div>
                <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded p-1 text-center text-[7px] text-gray-400">Col 2</div>
                <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded p-1 text-center text-[7px] text-gray-400">Col 3</div>
              </div>
              <div className="bg-white dark:bg-gray-900 rounded p-1.5 space-y-1">
                <div className="h-1 w-6 rounded-full bg-gray-300 dark:bg-gray-600" />
                <div className="h-1 w-5 rounded-full bg-gray-300 dark:bg-gray-600" />
              </div>
              {settings.mobile_footer_show_social && (
                <div className="flex justify-center gap-1 pt-1">
                  <div className="h-3 w-3 rounded-full bg-gray-300 dark:bg-gray-600" />
                  <div className="h-3 w-3 rounded-full bg-gray-300 dark:bg-gray-600" />
                </div>
              )}
            </div>
          )}
          <div className="mt-1 h-1 mx-auto w-3/4 rounded-full bg-gray-200 dark:bg-gray-700" />
        </div>
      </div>
    </div>
  );
}
