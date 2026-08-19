'use client';

import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';

interface HeaderOptionsPanelProps {
  settings: {
    header_style: string;
    logo_position: string;
    menu_position: string;
    search_style: string;
    show_categories_in_header: boolean;
    categories_menu_style: string;
    mega_menu_columns: number;
    header_cta_text: string | null;
    header_cta_url: string | null;
    show_header_cart: boolean;
    show_header_auth: boolean;
    show_topbar: boolean;
    header_opacity?: number;
    header_bg_color?: string | null;
    topbar_bg_color?: string | null;
    nav_bg_color?: string | null;
    accent_color?: string | null;
    // Topbar contenido (Fase 11.1)
    topbar_show_email?: boolean;
    topbar_show_phone?: boolean;
    topbar_announcement?: string | null;
  };
  onUpdate: (updates: Record<string, string | number | boolean | null>) => void;
}

export default function HeaderOptionsPanel({
  settings,
  onUpdate,
}: HeaderOptionsPanelProps) {
  return (
    <div className="space-y-3">
      {/* Posición del Logo */}
      <div className="space-y-2">
        <Label className="text-xs font-medium dark:text-gray-200">
          Posición del Logo
        </Label>
        <Select
          value={settings.logo_position}
          onValueChange={(v) => onUpdate({ logo_position: v })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="left">Izquierda</SelectItem>
            <SelectItem value="center">Centro</SelectItem>
            <SelectItem value="right">Derecha</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Posición del Menú */}
      <div className="space-y-2">
        <Label className="text-xs font-medium dark:text-gray-200">
          Posición del Menú
        </Label>
        <Select
          value={settings.menu_position}
          onValueChange={(v) => onUpdate({ menu_position: v })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="inline">Inline con logo</SelectItem>
            <SelectItem value="below">Debajo del logo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Estilo del Buscador */}
      <div className="space-y-2">
        <Label className="text-xs font-medium dark:text-gray-200">
          Estilo del Buscador
        </Label>
        <Select
          value={settings.search_style}
          onValueChange={(v) => onUpdate({ search_style: v })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="icon">Icono que abre dropdown</SelectItem>
            <SelectItem value="bar">Barra visible</SelectItem>
            <SelectItem value="hidden">Oculto</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Mostrar categorías en header */}
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium dark:text-gray-200">
          Mostrar categorías en header
        </Label>
        <Switch
          checked={settings.show_categories_in_header}
          onCheckedChange={(v) =>
            onUpdate({ show_categories_in_header: v })
          }
        />
      </div>

      {/* Estilo del menú de categorías */}
      {settings.show_categories_in_header && (
        <div className="space-y-2">
          <Label className="text-xs font-medium dark:text-gray-200">
            Estilo del menú de categorías
          </Label>
          <Select
            value={settings.categories_menu_style}
            onValueChange={(v) => onUpdate({ categories_menu_style: v })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dropdown">Dropdown simple</SelectItem>
              <SelectItem value="mega">Mega menú multi-columna</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Columnas del mega menú */}
      {settings.categories_menu_style === 'mega' &&
        settings.show_categories_in_header && (
          <div className="space-y-2">
            <Label className="text-xs font-medium dark:text-gray-200">
              Columnas del mega menú
            </Label>
            <Slider
              min={2}
              max={6}
              step={1}
              value={[settings.mega_menu_columns]}
              onValueChange={(v) => onUpdate({ mega_menu_columns: v[0] })}
            />
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {settings.mega_menu_columns} columnas
            </span>
          </div>
        )}

      {/* Botón CTA del header */}
      <div className="space-y-2">
        <Label className="text-xs font-medium dark:text-gray-200">
          Botón CTA del header
        </Label>
        <Input
          className="h-8 text-xs"
          placeholder="Texto del botón"
          value={settings.header_cta_text ?? ''}
          onChange={(e) => onUpdate({ header_cta_text: e.target.value })}
        />
        <Input
          className="h-8 text-xs"
          placeholder="URL del botón"
          value={settings.header_cta_url ?? ''}
          onChange={(e) => onUpdate({ header_cta_url: e.target.value })}
        />
      </div>

      {/* Mostrar carrito */}
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium dark:text-gray-200">
          Mostrar carrito
        </Label>
        <Switch
          checked={settings.show_header_cart}
          onCheckedChange={(v) => onUpdate({ show_header_cart: v })}
        />
      </div>

      {/* Mostrar login/registro */}
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium dark:text-gray-200">
          Mostrar login/registro
        </Label>
        <Switch
          checked={settings.show_header_auth}
          onCheckedChange={(v) => onUpdate({ show_header_auth: v })}
        />
      </div>

      {/* Mostrar topbar */}
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium dark:text-gray-200">
          Mostrar topbar
        </Label>
        <Switch
          checked={settings.show_topbar}
          onCheckedChange={(v) => onUpdate({ show_topbar: v })}
        />
      </div>

      {/* ============================================================
          CONTENIDO DEL TOPBAR (Fase 11.1)
          ============================================================ */}
      {settings.show_topbar && (
        <div className="space-y-3 pl-3 border-l-2 border-gray-200 dark:border-gray-700">
          <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
            Contenido del Topbar
          </h4>

          {/* Mostrar email */}
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium dark:text-gray-200">
              Mostrar correo
            </Label>
            <Switch
              checked={settings.topbar_show_email !== false}
              onCheckedChange={(v) => onUpdate({ topbar_show_email: v })}
            />
          </div>

          {/* Mostrar teléfono */}
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium dark:text-gray-200">
              Mostrar celular/teléfono
            </Label>
            <Switch
              checked={settings.topbar_show_phone !== false}
              onCheckedChange={(v) => onUpdate({ topbar_show_phone: v })}
            />
          </div>

          {/* Mensaje promocional (marquee) */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium dark:text-gray-200">
              Mensaje promocional (se mueve)
            </Label>
            <Input
              className="h-8 text-xs"
              placeholder="Ej: 🚚 Envíos gratis sobre $50 — 🔥 Ofertas del día"
              value={settings.topbar_announcement ?? ''}
              onChange={(e) => onUpdate({ topbar_announcement: e.target.value || null })}
            />
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Texto que se desplaza horizontalmente. Separar mensajes con — o |
            </p>
            {settings.topbar_announcement && (
              <button
                onClick={() => onUpdate({ topbar_announcement: null })}
                className="text-xs text-gray-500 hover:text-red-500"
              >
                ✕ Quitar mensaje
              </button>
            )}
          </div>
        </div>
      )}

      {/* ============================================================
          COLORES DEL HEADER (Fase 11)
          El texto se ajusta automáticamente según la luminancia del fondo.
          ============================================================ */}
      <div className="pt-3 border-t border-gray-200 dark:border-gray-700 space-y-3">
        <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
          Colores del Header
        </h4>
        <p className="text-[11px] text-gray-500 dark:text-gray-400">
          El texto se ajusta automáticamente (blanco/negro) según el fondo.
        </p>

        {/* Color de fondo del header */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium dark:text-gray-200">
            Fondo del Header
          </Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={settings.header_bg_color ?? '#ffffff'}
              onChange={(e) => onUpdate({ header_bg_color: e.target.value })}
              className="h-8 w-10 rounded border border-gray-300 dark:border-gray-600 cursor-pointer bg-transparent"
            />
            <Input
              type="text"
              className="h-8 text-xs flex-1"
              placeholder="#ffffff o vacío para auto"
              value={settings.header_bg_color ?? ''}
              onChange={(e) => onUpdate({ header_bg_color: e.target.value || null })}
            />
            {settings.header_bg_color && (
              <button
                onClick={() => onUpdate({ header_bg_color: null })}
                className="text-xs text-gray-500 hover:text-red-500 px-2"
                title="Quitar color (auto)"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Color de fondo del topbar */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium dark:text-gray-200">
            Fondo del Topbar
          </Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={settings.topbar_bg_color ?? '#ffffff'}
              onChange={(e) => onUpdate({ topbar_bg_color: e.target.value })}
              className="h-8 w-10 rounded border border-gray-300 dark:border-gray-600 cursor-pointer bg-transparent"
            />
            <Input
              type="text"
              className="h-8 text-xs flex-1"
              placeholder="Vacío = hereda del header"
              value={settings.topbar_bg_color ?? ''}
              onChange={(e) => onUpdate({ topbar_bg_color: e.target.value || null })}
            />
            {settings.topbar_bg_color && (
              <button
                onClick={() => onUpdate({ topbar_bg_color: null })}
                className="text-xs text-gray-500 hover:text-red-500 px-2"
                title="Quitar color (hereda)"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Color de fondo de la barra de menú */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium dark:text-gray-200">
            Fondo de la barra de menú
          </Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={settings.nav_bg_color ?? '#ffffff'}
              onChange={(e) => onUpdate({ nav_bg_color: e.target.value })}
              className="h-8 w-10 rounded border border-gray-300 dark:border-gray-600 cursor-pointer bg-transparent"
            />
            <Input
              type="text"
              className="h-8 text-xs flex-1"
              placeholder="Vacío = hereda del header"
              value={settings.nav_bg_color ?? ''}
              onChange={(e) => onUpdate({ nav_bg_color: e.target.value || null })}
            />
            {settings.nav_bg_color && (
              <button
                onClick={() => onUpdate({ nav_bg_color: null })}
                className="text-xs text-gray-500 hover:text-red-500 px-2"
                title="Quitar color (hereda)"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Color de acento */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium dark:text-gray-200">
            Color de acento (links, hover, badges)
          </Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={settings.accent_color ?? '#3b82f6'}
              onChange={(e) => onUpdate({ accent_color: e.target.value })}
              className="h-8 w-10 rounded border border-gray-300 dark:border-gray-600 cursor-pointer bg-transparent"
            />
            <Input
              type="text"
              className="h-8 text-xs flex-1"
              placeholder="Vacío = usa color primario"
              value={settings.accent_color ?? ''}
              onChange={(e) => onUpdate({ accent_color: e.target.value || null })}
            />
            {settings.accent_color && (
              <button
                onClick={() => onUpdate({ accent_color: null })}
                className="text-xs text-gray-500 hover:text-red-500 px-2"
                title="Quitar color (usa primario)"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
