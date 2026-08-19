'use client';

import { Search, ShoppingBag, User, Menu, Phone, ChevronDown } from 'lucide-react';
import { cn } from '@/utils/Utils';

// ============================================================
// PROPS
// ============================================================

interface HeaderPreviewMockupProps {
  layout: string;          // default | centered | split | minimal | mega
  logoPosition: string;    // left | center | right
  menuPosition: string;    // inline | below
  searchStyle: string;     // icon | bar | hidden
  showTopbar: boolean;
  showCart: boolean;
  showAuth: boolean;
  ctaText?: string | null;
  menuItems?: string[];    // títulos de items del menú (placeholder)
  isMobile?: boolean;      // mockup móvil vs desktop
  mobileMenuStyle?: string; // drawer | bottom_sheet | fullscreen | tabs
  headerOpacity?: number;   // 50-100, opacidad del fondo del header
}

// ============================================================
// MOCKUP ITEM (placeholder de item de menú)
// ============================================================

function MockNavItem({ label, hasDropdown }: { label: string; hasDropdown?: boolean }) {
  return (
    <div className="flex items-center gap-0.5 text-[9px] font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">
      <span className="truncate max-w-[60px]">{label}</span>
      {hasDropdown && <ChevronDown className="h-2.5 w-2.5 flex-shrink-0" />}
    </div>
  );
}

function MockLogo({ label = 'LOGO' }: { label?: string }) {
  return (
    <div className="flex items-center gap-1 flex-shrink-0">
      <div className="w-5 h-5 rounded bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
        <span className="text-[7px] font-bold text-white">L</span>
      </div>
      <span className="text-[10px] font-bold text-gray-800 dark:text-gray-100">{label}</span>
    </div>
  );
}

function MockSearchBar() {
  return (
    <div className="flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded-full flex-1 max-w-[120px]">
      <Search className="h-2.5 w-2.5 text-gray-400 flex-shrink-0" />
      <div className="h-1.5 flex-1 bg-gray-300 dark:bg-gray-600 rounded-full" />
    </div>
  );
}

function MockActions({ showCart, showAuth, searchStyle }: { showCart: boolean; showAuth: boolean; searchStyle: string }) {
  return (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      {searchStyle === 'icon' && (
        <Search className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
      )}
      {showAuth && <User className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />}
      {showCart && <ShoppingBag className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />}
    </div>
  );
}

function MockCTA({ text }: { text: string }) {
  return (
    <div className="px-2 py-1 bg-blue-600 rounded text-[8px] font-semibold text-white whitespace-nowrap">
      {text}
    </div>
  );
}

function MockTopbar() {
  return (
    <div className="flex items-center justify-between px-3 py-0.5 bg-gray-800 dark:bg-gray-900 text-white text-[7px]">
      <div className="flex items-center gap-1">
        <Phone className="h-2 w-2" />
        <span>+57 300 123 4567</span>
      </div>
      <span>Envío gratis sobre $100k</span>
    </div>
  );
}

// ============================================================
// LAYOUTS DESKTOP
// ============================================================

function LayoutClassic({ logoPosition, searchStyle, showCart, showAuth, ctaText, menuItems }: HeaderPreviewMockupProps) {
  const items = menuItems?.slice(0, 5) || ['Inicio', 'Productos', 'Categorías', 'Nosotros', 'Contacto'];
  return (
    <div className="flex items-center justify-between px-3 py-2 gap-2">
      {logoPosition === 'left' && <MockLogo />}
      {logoPosition === 'center' && <div className="w-20" />}
      <div className="flex items-center gap-3 flex-1 justify-center">
        {items.map((item, i) => (
          <MockNavItem key={i} label={item} hasDropdown={i === 1 || i === 2} />
        ))}
      </div>
      {searchStyle === 'bar' && <MockSearchBar />}
      <div className="flex items-center gap-1.5">
        <MockActions showCart={showCart} showAuth={showAuth} searchStyle={searchStyle === 'bar' ? 'hidden' : searchStyle} />
        {ctaText && <MockCTA text={ctaText} />}
        {logoPosition === 'right' && <MockLogo />}
        {logoPosition === 'center' && <MockLogo />}
      </div>
    </div>
  );
}

function LayoutCentered({ searchStyle, showCart, showAuth, menuItems }: HeaderPreviewMockupProps) {
  const items = menuItems?.slice(0, 5) || ['Inicio', 'Productos', 'Categorías', 'Nosotros', 'Contacto'];
  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="w-20" />
        <MockLogo />
        <div className="flex items-center gap-1.5 w-20 justify-end">
          <MockActions showCart={showCart} showAuth={showAuth} searchStyle={searchStyle} />
        </div>
      </div>
      <div className="flex items-center justify-center gap-3 px-3 py-1.5 border-t border-gray-200 dark:border-gray-700">
        {items.map((item, i) => (
          <MockNavItem key={i} label={item} hasDropdown={i === 1 || i === 2} />
        ))}
      </div>
    </div>
  );
}

function LayoutSplit({ searchStyle, showCart, showAuth, ctaText, menuItems }: HeaderPreviewMockupProps) {
  const items = menuItems || ['Inicio', 'Productos', 'Categorías', 'Nosotros', 'Contacto'];
  const leftItems = items.slice(0, Math.ceil(items.length / 2)).slice(0, 3);
  const rightItems = items.slice(Math.ceil(items.length / 2)).slice(0, 3);
  return (
    <div className="flex items-center justify-between px-3 py-2 gap-2">
      <MockLogo />
      <div className="flex items-center gap-3">
        {leftItems.map((item, i) => (
          <MockNavItem key={`l-${i}`} label={item} />
        ))}
      </div>
      {searchStyle === 'bar' && <MockSearchBar />}
      <div className="flex items-center gap-3">
        {rightItems.map((item, i) => (
          <MockNavItem key={`r-${i}`} label={item} />
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <MockActions showCart={showCart} showAuth={showAuth} searchStyle={searchStyle === 'bar' ? 'hidden' : searchStyle} />
        {ctaText && <MockCTA text={ctaText} />}
      </div>
    </div>
  );
}

function LayoutMinimal({ searchStyle, showCart, showAuth, ctaText }: HeaderPreviewMockupProps) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <MockLogo />
      <div className="flex items-center gap-1.5">
        {searchStyle === 'bar' && <MockSearchBar />}
        <MockActions showCart={showCart} showAuth={showAuth} searchStyle={searchStyle === 'bar' ? 'hidden' : searchStyle} />
        {ctaText && <MockCTA text={ctaText} />}
        <Menu className="h-4 w-4 text-gray-600 dark:text-gray-300" />
      </div>
    </div>
  );
}

function LayoutMega({ searchStyle, showCart, showAuth, menuItems }: HeaderPreviewMockupProps) {
  const items = menuItems?.slice(0, 6) || ['Inicio', 'Categorías', 'Productos', 'Ofertas', 'Nosotros', 'Contacto'];
  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <MockLogo />
        {searchStyle === 'bar' && <MockSearchBar />}
        <div className="flex items-center gap-1.5">
          <MockActions showCart={showCart} showAuth={showAuth} searchStyle={searchStyle === 'bar' ? 'hidden' : searchStyle} />
        </div>
      </div>
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-gray-200 dark:border-gray-700 gap-2">
        {items.map((item, i) => (
          <MockNavItem key={i} label={item} hasDropdown={i === 1} />
        ))}
      </div>
    </div>
  );
}

// ============================================================
// LAYOUTS MÓVIL
// ============================================================

function LayoutMobileDrawer({ showCart, showAuth, searchStyle, menuItems }: HeaderPreviewMockupProps) {
  const items = menuItems?.slice(0, 4) || ['Inicio', 'Productos', 'Categorías', 'Contacto'];
  return (
    <div className="relative">
      <div className="flex items-center justify-between px-3 py-2">
        <MockLogo />
        <div className="flex items-center gap-1.5">
          {searchStyle === 'icon' && <Search className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />}
          {showCart && <ShoppingBag className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />}
          <Menu className="h-4 w-4 text-gray-600 dark:text-gray-300" />
        </div>
      </div>
      {searchStyle === 'bar' && (
        <div className="px-3 pb-2">
          <MockSearchBar />
        </div>
      )}
      {/* Drawer simulado */}
      <div className="absolute right-0 top-0 bottom-0 w-32 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 shadow-lg flex flex-col gap-2 p-2 z-20">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[8px] font-bold text-gray-700 dark:text-gray-200">Menú</span>
          <div className="w-3 h-3 rounded-full bg-gray-200 dark:bg-gray-600" />
        </div>
        {items.map((item, i) => (
          <div key={i} className="text-[8px] text-gray-600 dark:text-gray-300 py-0.5 border-b border-gray-100 dark:border-gray-700">
            {item}
          </div>
        ))}
        {showAuth && (
          <div className="text-[8px] text-blue-600 font-medium mt-1">Iniciar sesión</div>
        )}
      </div>
    </div>
  );
}

function LayoutMobileBottomSheet({ showCart, searchStyle, menuItems }: HeaderPreviewMockupProps) {
  const items = menuItems?.slice(0, 4) || ['Inicio', 'Productos', 'Categorías', 'Contacto'];
  return (
    <div className="relative">
      <div className="flex items-center justify-between px-3 py-2">
        <MockLogo />
        <div className="flex items-center gap-1.5">
          {searchStyle === 'icon' && <Search className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />}
          {showCart && <ShoppingBag className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />}
          <Menu className="h-4 w-4 text-gray-600 dark:text-gray-300" />
        </div>
      </div>
      {/* Bottom sheet simulado */}
      <div className="absolute bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 shadow-lg rounded-t-lg p-2 z-20">
        <div className="w-8 h-1 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto mb-2" />
        <div className="grid grid-cols-2 gap-1.5">
          {items.map((item, i) => (
            <div key={i} className="text-[8px] text-gray-600 dark:text-gray-300 py-1 px-2 bg-gray-100 dark:bg-gray-700 rounded text-center">
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function LayoutMobileFullscreen({ showCart, searchStyle, menuItems }: HeaderPreviewMockupProps) {
  const items = menuItems?.slice(0, 5) || ['Inicio', 'Productos', 'Categorías', 'Nosotros', 'Contacto'];
  return (
    <div className="relative">
      <div className="flex items-center justify-between px-3 py-2">
        <MockLogo />
        <div className="flex items-center gap-1.5">
          {searchStyle === 'icon' && <Search className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />}
          {showCart && <ShoppingBag className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />}
        </div>
      </div>
      {/* Fullscreen overlay simulado */}
      <div className="absolute inset-0 bg-white dark:bg-gray-800 z-20 flex flex-col p-3 gap-2">
        <div className="flex items-center justify-between mb-2">
          <MockLogo />
          <div className="w-4 h-4 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center">
            <span className="text-[7px] text-gray-500">✕</span>
          </div>
        </div>
        {items.map((item, i) => (
          <div key={i} className="text-[10px] text-gray-700 dark:text-gray-200 py-1.5 border-b border-gray-100 dark:border-gray-700 font-medium">
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function LayoutMobileTabs({ showCart, searchStyle }: HeaderPreviewMockupProps) {
  const tabs = [
    { icon: '🏠', label: 'Inicio' },
    { icon: '📋', label: 'Categorías' },
    { icon: '🔍', label: 'Buscar' },
    { icon: '🛒', label: 'Carrito' },
    { icon: '👤', label: 'Cuenta' },
  ];
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 flex-1">
        <MockLogo />
        <div className="flex items-center gap-1.5">
          {searchStyle === 'icon' && <Search className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />}
          {showCart && <ShoppingBag className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />}
        </div>
      </div>
      {/* Tab bar inferior */}
      <div className="flex items-center justify-around py-1.5 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        {tabs.map((tab, i) => (
          <div key={i} className="flex flex-col items-center gap-0.5">
            <span className="text-[10px]">{tab.icon}</span>
            <span className="text-[6px] text-gray-500 dark:text-gray-400">{tab.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================

export default function HeaderPreviewMockup({
  layout,
  logoPosition = 'left',
  menuPosition = 'inline',
  searchStyle = 'icon',
  showTopbar = false,
  showCart = true,
  showAuth = true,
  ctaText,
  menuItems,
  isMobile = false,
  mobileMenuStyle = 'drawer',
  headerOpacity = 95,
}: HeaderPreviewMockupProps) {
  // Opacidad del fondo del header (50-100). Se aplica como rgba inline
  // porque Tailwind no soporta clases de opacidad generadas dinámicamente.
  const headerBgStyle = {
    backgroundColor: `rgba(255, 255, 255, ${headerOpacity / 100})`,
  };
  const commonProps = {
    layout,
    logoPosition,
    menuPosition,
    searchStyle,
    showTopbar,
    showCart,
    showAuth,
    ctaText,
    menuItems,
    isMobile,
    mobileMenuStyle,
  };

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800 shadow-sm">
      {/* Label */}
      <div className="px-2 py-1 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
        <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          {isMobile ? `Vista Móvil — ${mobileMenuStyle}` : `Vista Desktop — ${layout}`}
        </span>
      </div>

      {/* Mockup frame */}
      <div
        className={cn(
          'relative dark:bg-gray-800 overflow-hidden',
          isMobile ? 'mx-auto' : 'w-full'
        )}
        style={{
          ...(isMobile ? { width: '200px', height: '120px' } : { height: '80px' }),
          ...headerBgStyle,
        }}
      >
        {showTopbar && <MockTopbar />}

        {isMobile ? (
          <div className="h-full">
            {mobileMenuStyle === 'drawer' && <LayoutMobileDrawer {...commonProps} />}
            {mobileMenuStyle === 'bottom_sheet' && <LayoutMobileBottomSheet {...commonProps} />}
            {mobileMenuStyle === 'fullscreen' && <LayoutMobileFullscreen {...commonProps} />}
            {mobileMenuStyle === 'tabs' && <LayoutMobileTabs {...commonProps} />}
          </div>
        ) : (
          <div className="h-full">
            {layout === 'default' && <LayoutClassic {...commonProps} />}
            {layout === 'centered' && <LayoutCentered {...commonProps} />}
            {layout === 'split' && <LayoutSplit {...commonProps} />}
            {layout === 'minimal' && <LayoutMinimal {...commonProps} />}
            {layout === 'mega' && <LayoutMega {...commonProps} />}
          </div>
        )}
      </div>
    </div>
  );
}
