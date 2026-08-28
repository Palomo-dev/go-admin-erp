'use client';

import { useState } from 'react';
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
import { Plus, X, GripVertical } from 'lucide-react';

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
    topbar_contact_position?: string;
    // Menús nombrados (Fase 2 footer/header)
    header_menu_id?: string | null;
    header_mega_menu_id?: string | null;
    // Fase 12: Minimal drawer + iconos + CTA personalizable
    minimal_menu_style?: string;
    cart_icon?: string | null;
    search_icon?: string | null;
    auth_icon?: string | null;
    currency_icon?: string | null;
    actions_order?: string[] | null;
    cta_padding_x?: number;
    cta_padding_y?: number;
    cta_border_radius?: number;
    cta_full_width?: boolean;
    cta_border_width?: number;
    cta_border_color?: string | null;
    cta_shadow?: string;
    cta_bg_color?: string | null;
    cta_text_color?: string | null;
    cta_margin_top?: number;
    cta_margin_bottom?: number;
  };
  onUpdate: (updates: Record<string, string | number | boolean | null | string[]>) => void;
  availableMenus?: { id: string; name: string }[];
}

export default function HeaderOptionsPanel({
  settings,
  onUpdate,
  availableMenus = [],
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

          {/* Posición del contacto (email/teléfono) */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium dark:text-gray-200">
              Posición del correo/teléfono
            </Label>
            <Select
              value={settings.topbar_contact_position ?? 'left'}
              onValueChange={(v) => onUpdate({ topbar_contact_position: v })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="left">Izquierda</SelectItem>
                <SelectItem value="right">Derecha</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Mensajes promocionales (marquee) — lista editable */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium dark:text-gray-200">
                Mensajes promocionales ({parseAnnouncements(settings.topbar_announcement).length})
              </Label>
              <button
                onClick={() => {
                  const list = parseAnnouncements(settings.topbar_announcement);
                  list.push('Nuevo mensaje');
                  onUpdate({ topbar_announcement: serializeAnnouncements(list) });
                }}
                className="flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400 hover:underline"
              >
                <Plus className="h-3 w-3" />
                Agregar
              </button>
            </div>

            <div className="space-y-1.5">
              {parseAnnouncements(settings.topbar_announcement).map((msg, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-white/5 px-1.5 py-1"
                >
                  <GripVertical className="h-3 w-3 text-gray-400 dark:text-gray-500 shrink-0" />
                  <Input
                    className="h-7 text-xs flex-1 border-0 shadow-none focus-visible:ring-0 bg-transparent"
                    placeholder={`Mensaje ${i + 1}`}
                    value={msg}
                    onChange={(e) => {
                      const list = parseAnnouncements(settings.topbar_announcement);
                      list[i] = e.target.value;
                      onUpdate({ topbar_announcement: serializeAnnouncements(list) });
                    }}
                  />
                  <button
                    onClick={() => {
                      const list = parseAnnouncements(settings.topbar_announcement);
                      list.splice(i, 1);
                      onUpdate({ topbar_announcement: list.length > 0 ? serializeAnnouncements(list) : null });
                    }}
                    className="p-0.5 text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 shrink-0"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>

            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Los mensajes rotan automáticamente cada 6 segundos con flechas de navegación.
            </p>
          </div>
        </div>
      )}

      {/* ============================================================
          SELECTORES DE MENÚ NOMBRADO (Fase 2)
          ============================================================ */}
      {availableMenus.length > 0 && (
        <div className="pt-3 border-t border-gray-200 dark:border-gray-700 space-y-3">
          <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
            Menús Nombrados
          </h4>

          {/* Menú del header */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium dark:text-gray-200">
              Menú del Header
            </Label>
            <Select
              value={settings.header_menu_id ?? '__none'}
              onValueChange={(v) => onUpdate({ header_menu_id: v === '__none' ? null : v })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Seleccionar menú..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— Sin menú nombrado —</SelectItem>
                {availableMenus.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Menú del mega menu */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium dark:text-gray-200">
              Menú del Mega Menu
            </Label>
            <Select
              value={settings.header_mega_menu_id ?? '__none'}
              onValueChange={(v) => onUpdate({ header_mega_menu_id: v === '__none' ? null : v })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Seleccionar menú..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— Sin mega menú —</SelectItem>
                {availableMenus.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              placeholder="Vacío = blanco con opacidad (auto)"
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
              value={settings.topbar_bg_color ?? '#111827'}
              onChange={(e) => onUpdate({ topbar_bg_color: e.target.value })}
              className="h-8 w-10 rounded border border-gray-300 dark:border-gray-600 cursor-pointer bg-transparent"
            />
            <Input
              type="text"
              className="h-8 text-xs flex-1"
              placeholder="Vacío = oscuro por defecto (hereda header si hay)"
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
              value={settings.nav_bg_color ?? (settings.header_bg_color ?? '#ffffff')}
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

      {/* ============================================================
          FASE 12: HEADER MINIMAL DRAWER + ICONOS + CTA
          ============================================================ */}
      <div className="pt-3 border-t border-gray-200 dark:border-gray-700 space-y-3">
        <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
          Personalización Avanzada
        </h4>

        {/* Sub-Fase 12A: Minimal menu style */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium dark:text-gray-200">
            Apertura del menú (Header Minimal)
          </Label>
          <Select
            value={settings.minimal_menu_style ?? 'drawer'}
            onValueChange={(v) => onUpdate({ minimal_menu_style: v })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="drawer">Drawer lateral (default)</SelectItem>
              <SelectItem value="dropdown">Dropdown compacto</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            Solo aplica cuando el estilo del header es "Minimal".
          </p>
        </div>

        {/* Sub-Fase 12B: Iconos y orden de acciones */}
        <div className="space-y-2 pl-3 border-l-2 border-gray-200 dark:border-gray-700">
          <h5 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
            Iconos y Orden de Acciones
          </h5>

          {/* Icono del carrito */}
          <div className="space-y-1">
            <Label className="text-xs font-medium dark:text-gray-200">Icono del carrito</Label>
            <Select
              value={settings.cart_icon ?? 'shopping-bag'}
              onValueChange={(v) => onUpdate({ cart_icon: v })}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="shopping-bag">Shopping Bag</SelectItem>
                <SelectItem value="shopping-cart">Shopping Cart</SelectItem>
                <SelectItem value="package">Package</SelectItem>
                <SelectItem value="gift">Gift</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Icono del buscador */}
          <div className="space-y-1">
            <Label className="text-xs font-medium dark:text-gray-200">Icono del buscador</Label>
            <Select
              value={settings.search_icon ?? 'search'}
              onValueChange={(v) => onUpdate({ search_icon: v })}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="search">Search</SelectItem>
                <SelectItem value="search-lg">Search Large</SelectItem>
                <SelectItem value="scan-search">Scan Search</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Icono del avatar/auth */}
          <div className="space-y-1">
            <Label className="text-xs font-medium dark:text-gray-200">Icono de usuario/auth</Label>
            <Select
              value={settings.auth_icon ?? 'user'}
              onValueChange={(v) => onUpdate({ auth_icon: v })}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="user-circle">User Circle</SelectItem>
                <SelectItem value="user-round">User Round</SelectItem>
                <SelectItem value="circle-user">Circle User</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Icono de monedas */}
          <div className="space-y-1">
            <Label className="text-xs font-medium dark:text-gray-200">Icono de moneda</Label>
            <Select
              value={settings.currency_icon ?? 'globe'}
              onValueChange={(v) => onUpdate({ currency_icon: v })}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="globe">Globe</SelectItem>
                <SelectItem value="coins">Coins</SelectItem>
                <SelectItem value="wallet">Wallet</SelectItem>
                <SelectItem value="banknote">Banknote</SelectItem>
                <SelectItem value="dollar-sign">Dollar Sign</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Orden de acciones */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium dark:text-gray-200">
              Orden de las acciones
            </Label>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Arrastra para reordenar. El orden afecta todos los headers.
            </p>
            <ActionsOrderEditor
              order={settings.actions_order ?? ['search', 'currency', 'cart', 'auth']}
              onChange={(order) => onUpdate({ actions_order: order })}
            />
          </div>
        </div>

        {/* Sub-Fase 12C: Personalización del botón CTA */}
        <div className="space-y-2 pl-3 border-l-2 border-gray-200 dark:border-gray-700">
          <h5 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
            Personalización del Botón CTA
          </h5>

          {/* Full width */}
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium dark:text-gray-200">
              Ancho completo del header
            </Label>
            <Switch
              checked={settings.cta_full_width ?? false}
              onCheckedChange={(v) => onUpdate({ cta_full_width: v })}
            />
          </div>

          {/* Padding X */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium dark:text-gray-200">
              Padding horizontal: {settings.cta_padding_x ?? 16}px
            </Label>
            <Slider
              min={0} max={48} step={1}
              value={[settings.cta_padding_x ?? 16]}
              onValueChange={(v) => onUpdate({ cta_padding_x: v[0] })}
            />
          </div>

          {/* Padding Y */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium dark:text-gray-200">
              Padding vertical: {settings.cta_padding_y ?? 8}px
            </Label>
            <Slider
              min={0} max={32} step={1}
              value={[settings.cta_padding_y ?? 8]}
              onValueChange={(v) => onUpdate({ cta_padding_y: v[0] })}
            />
          </div>

          {/* Border radius */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium dark:text-gray-200">
              Radio del borde: {settings.cta_border_radius ?? 8}px
            </Label>
            <Slider
              min={0} max={32} step={1}
              value={[settings.cta_border_radius ?? 8]}
              onValueChange={(v) => onUpdate({ cta_border_radius: v[0] })}
            />
          </div>

          {/* Border width */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium dark:text-gray-200">
              Ancho del borde: {settings.cta_border_width ?? 0}px
            </Label>
            <Slider
              min={0} max={8} step={1}
              value={[settings.cta_border_width ?? 0]}
              onValueChange={(v) => onUpdate({ cta_border_width: v[0] })}
            />
          </div>

          {/* Margin top */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium dark:text-gray-200">
              Margen superior: {settings.cta_margin_top ?? 0}px
            </Label>
            <Slider
              min={0} max={24} step={1}
              value={[settings.cta_margin_top ?? 0]}
              onValueChange={(v) => onUpdate({ cta_margin_top: v[0] })}
            />
          </div>

          {/* Margin bottom */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium dark:text-gray-200">
              Margen inferior: {settings.cta_margin_bottom ?? 0}px
            </Label>
            <Slider
              min={0} max={24} step={1}
              value={[settings.cta_margin_bottom ?? 0]}
              onValueChange={(v) => onUpdate({ cta_margin_bottom: v[0] })}
            />
          </div>

          {/* Sombra */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium dark:text-gray-200">Sombra</Label>
            <Select
              value={settings.cta_shadow ?? 'none'}
              onValueChange={(v) => onUpdate({ cta_shadow: v })}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin sombra</SelectItem>
                <SelectItem value="sm">Sutil</SelectItem>
                <SelectItem value="md">Media</SelectItem>
                <SelectItem value="lg">Fuerte</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Color de fondo del CTA */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium dark:text-gray-200">
              Color de fondo (vacío = color primario)
            </Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={settings.cta_bg_color ?? '#3b82f6'}
                onChange={(e) => onUpdate({ cta_bg_color: e.target.value })}
                className="h-8 w-10 rounded border border-gray-300 dark:border-gray-600 cursor-pointer bg-transparent"
              />
              <Input
                type="text"
                className="h-8 text-xs flex-1"
                placeholder="Vacío = color primario"
                value={settings.cta_bg_color ?? ''}
                onChange={(e) => onUpdate({ cta_bg_color: e.target.value || null })}
              />
              {settings.cta_bg_color && (
                <button
                  onClick={() => onUpdate({ cta_bg_color: null })}
                  className="text-xs text-gray-500 hover:text-red-500 px-2"
                  title="Quitar color (usa primario)"
                >✕</button>
              )}
            </div>
          </div>

          {/* Color de texto del CTA */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium dark:text-gray-200">
              Color de texto (vacío = auto)
            </Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={settings.cta_text_color ?? '#ffffff'}
                onChange={(e) => onUpdate({ cta_text_color: e.target.value })}
                className="h-8 w-10 rounded border border-gray-300 dark:border-gray-600 cursor-pointer bg-transparent"
              />
              <Input
                type="text"
                className="h-8 text-xs flex-1"
                placeholder="Vacío = auto (blanco/negro)"
                value={settings.cta_text_color ?? ''}
                onChange={(e) => onUpdate({ cta_text_color: e.target.value || null })}
              />
              {settings.cta_text_color && (
                <button
                  onClick={() => onUpdate({ cta_text_color: null })}
                  className="text-xs text-gray-500 hover:text-red-500 px-2"
                  title="Quitar color (auto)"
                >✕</button>
              )}
            </div>
          </div>

          {/* Color de borde del CTA */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium dark:text-gray-200">
              Color del borde (vacío = sin color)
            </Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={settings.cta_border_color ?? '#cccccc'}
                onChange={(e) => onUpdate({ cta_border_color: e.target.value })}
                className="h-8 w-10 rounded border border-gray-300 dark:border-gray-600 cursor-pointer bg-transparent"
              />
              <Input
                type="text"
                className="h-8 text-xs flex-1"
                placeholder="Vacío = sin color de borde"
                value={settings.cta_border_color ?? ''}
                onChange={(e) => onUpdate({ cta_border_color: e.target.value || null })}
              />
              {settings.cta_border_color && (
                <button
                  onClick={() => onUpdate({ cta_border_color: null })}
                  className="text-xs text-gray-500 hover:text-red-500 px-2"
                  title="Quitar color"
                >✕</button>
              )}
            </div>
          </div>

          {/* Preview en vivo del botón CTA */}
          {settings.header_cta_text && (
            <div className="pt-2">
              <Label className="text-xs font-medium dark:text-gray-200 mb-1.5 block">Preview</Label>
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-800/50">
                <button
                  className="font-semibold text-sm transition-opacity hover:opacity-90"
                  style={{
                    padding: `${settings.cta_padding_y ?? 8}px ${settings.cta_padding_x ?? 16}px`,
                    borderRadius: `${settings.cta_border_radius ?? 8}px`,
                    borderWidth: `${settings.cta_border_width ?? 0}px`,
                    borderColor: settings.cta_border_color ?? 'transparent',
                    borderStyle: 'solid',
                    backgroundColor: settings.cta_bg_color ?? '#3b82f6',
                    color: settings.cta_text_color ?? '#ffffff',
                    marginTop: `${settings.cta_margin_top ?? 0}px`,
                    marginBottom: `${settings.cta_margin_bottom ?? 0}px`,
                    boxShadow: settings.cta_shadow === 'sm' ? '0 1px 2px rgba(0,0,0,0.1)' :
                               settings.cta_shadow === 'md' ? '0 4px 6px rgba(0,0,0,0.15)' :
                               settings.cta_shadow === 'lg' ? '0 10px 15px rgba(0,0,0,0.2)' : 'none',
                    width: settings.cta_full_width ? '100%' : 'auto',
                  }}
                >
                  {settings.header_cta_text}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// HELPERS: serialización de mensajes promocionales
// Almacena como JSON array en topbar_announcement (TEXT)
// Ej: '["🚚 Envíos gratis","🔥 Ofertas del día"]'
// ============================================================

function parseAnnouncements(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) {
      return parsed;
    }
  } catch {
    // Si no es JSON válido, tratar como string único (compatibilidad retroactiva)
    return [raw];
  }
  return [];
}

function serializeAnnouncements(list: string[]): string {
  return JSON.stringify(list.filter((s) => s.trim() !== ''));
}

// ============================================================
// ActionsOrderEditor: reordenar las acciones del header
// ============================================================

const ACTION_LABELS: Record<string, string> = {
  search: 'Buscador',
  currency: 'Moneda',
  cart: 'Carrito',
  auth: 'Usuario',
};

function ActionsOrderEditor({
  order,
  onChange,
}: {
  order: string[];
  onChange: (order: string[]) => void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const moveUp = (index: number) => {
    if (index === 0) return;
    const next = [...order];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    onChange(next);
  };
  const moveDown = (index: number) => {
    if (index === order.length - 1) return;
    const next = [...order];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    onChange(next);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDragIndex(index);
    e.dataTransfer.setData('text/plain', String(index));
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragIndex !== null && dragIndex !== index) setOverIndex(index);
  };
  const handleDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    const from = dragIndex;
    if (from === null || from === index) {
      setDragIndex(null);
      setOverIndex(null);
      return;
    }
    const next = [...order];
    const [moved] = next.splice(from, 1);
    next.splice(index, 0, moved);
    onChange(next);
    setDragIndex(null);
    setOverIndex(null);
  };
  const handleDragEnd = () => {
    setDragIndex(null);
    setOverIndex(null);
  };

  return (
    <div className="space-y-1">
      {order.map((action, i) => (
        <div
          key={action}
          draggable
          onDragStart={(e) => handleDragStart(e, i)}
          onDragOver={(e) => handleDragOver(e, i)}
          onDrop={(e) => handleDrop(e, i)}
          onDragEnd={handleDragEnd}
          className={`flex items-center gap-2 rounded border px-2 py-1.5 cursor-grab active:cursor-grabbing transition-colors ${
            dragIndex === i
              ? 'opacity-40 border-blue-400 bg-blue-50 dark:bg-blue-950/30'
              : overIndex === i
                ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/20'
                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-white/5'
          }`}
        >
          <GripVertical className="h-3 w-3 text-gray-400 dark:text-gray-500 shrink-0" />
          <span className="text-xs flex-1 dark:text-gray-200">{ACTION_LABELS[action] ?? action}</span>
          <button
            onClick={() => moveUp(i)}
            disabled={i === 0}
            className="text-[10px] text-gray-500 hover:text-blue-600 disabled:opacity-30 px-1"
            title="Subir"
          >▲</button>
          <button
            onClick={() => moveDown(i)}
            disabled={i === order.length - 1}
            className="text-[10px] text-gray-500 hover:text-blue-600 disabled:opacity-30 px-1"
            title="Bajar"
          >▼</button>
        </div>
      ))}
    </div>
  );
}
