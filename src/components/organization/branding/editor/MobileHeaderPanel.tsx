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
import { Slider } from '@/components/ui/slider';

interface MobileHeaderPanelProps {
  settings: {
    mobile_menu_style: string;
    mobile_search_style: string;
    mobile_show_topbar: boolean;
    mobile_sticky_header: boolean;
    mobile_breakpoint: number;
  };
  onUpdate: (updates: Record<string, string | number | boolean>) => void;
}

export default function MobileHeaderPanel({ settings, onUpdate }: MobileHeaderPanelProps) {
  const menuIcon =
    settings.mobile_menu_style === 'drawer'
      ? '☰'
      : settings.mobile_menu_style === 'bottom_sheet'
        ? '⋮'
        : settings.mobile_menu_style === 'fullscreen'
          ? '✕'
          : null;

  return (
    <div className="space-y-4">
      {/* Estilo del menú móvil */}
      <div className="space-y-1.5">
        <Label className="text-xs">Estilo del menú móvil</Label>
        <Select
          value={settings.mobile_menu_style}
          onValueChange={(v) => onUpdate({ mobile_menu_style: v })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="drawer">Hamburguesa lateral</SelectItem>
            <SelectItem value="bottom_sheet">Hoja inferior</SelectItem>
            <SelectItem value="fullscreen">Pantalla completa</SelectItem>
            <SelectItem value="tabs">Barra inferior tipo app</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Buscador móvil */}
      <div className="space-y-1.5">
        <Label className="text-xs">Buscador móvil</Label>
        <Select
          value={settings.mobile_search_style}
          onValueChange={(v) => onUpdate({ mobile_search_style: v })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="icon">Icono que abre modal</SelectItem>
            <SelectItem value="bar">Barra visible bajo logo</SelectItem>
            <SelectItem value="hidden">Oculto</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Mostrar topbar en móvil */}
      <div className="flex items-center justify-between">
        <Label className="text-xs">Mostrar topbar en móvil</Label>
        <Switch
          checked={settings.mobile_show_topbar}
          onCheckedChange={(v) => onUpdate({ mobile_show_topbar: v })}
        />
      </div>

      {/* Header fijo al scroll */}
      <div className="flex items-center justify-between">
        <Label className="text-xs">Header fijo al scroll</Label>
        <Switch
          checked={settings.mobile_sticky_header}
          onCheckedChange={(v) => onUpdate({ mobile_sticky_header: v })}
        />
      </div>

      {/* Breakpoint desktop/móvil */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Breakpoint desktop/móvil</Label>
          <span className="text-xs text-muted-foreground">
            {settings.mobile_breakpoint}px
          </span>
        </div>
        <Slider
          min={640}
          max={1024}
          step={64}
          value={[settings.mobile_breakpoint]}
          onValueChange={(v) => onUpdate({ mobile_breakpoint: v[0] })}
        />
      </div>

      {/* Mockup móvil visual */}
      <div className="pt-2">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Vista previa</p>
        <div className="w-[200px] mx-auto bg-gray-100 dark:bg-gray-800 rounded-[20px] border-4 border-gray-300 dark:border-gray-600 p-2">
          {settings.mobile_show_topbar && (
            <div className="h-4 bg-gray-200 dark:bg-gray-700 text-[8px] flex items-center px-1 rounded text-gray-500">
              topbar
            </div>
          )}
          <div className="h-10 bg-white dark:bg-gray-900 rounded flex items-center justify-between px-2 mt-1">
            <span className="text-[9px] font-bold">LOGO</span>
            {menuIcon && <span className="text-sm">{menuIcon}</span>}
          </div>
          {settings.mobile_search_style === 'bar' && (
            <div className="h-8 bg-gray-50 dark:bg-gray-800 rounded mx-2 mt-1 flex items-center px-2 text-[8px] text-gray-400">
              🔍 Buscar...
            </div>
          )}
          {settings.mobile_menu_style === 'tabs' && (
            <div className="h-8 bg-white dark:bg-gray-900 rounded mt-1 flex items-center justify-around text-xs">
              <span>🏠</span>
              <span>📋</span>
              <span>🔍</span>
              <span>🛒</span>
              <span>👤</span>
            </div>
          )}
          {settings.mobile_sticky_header && (
            <p className="mt-1 text-center text-[8px] text-muted-foreground">Sticky</p>
          )}
        </div>
      </div>
    </div>
  );
}
