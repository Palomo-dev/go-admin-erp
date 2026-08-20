'use client';

import { cn } from '@/utils/Utils';
import { Mail, Phone, Clock, Facebook, Instagram, Twitter, Youtube, Send } from 'lucide-react';
import type { MenuGroupItem } from '@/lib/services/websiteMenuGroupService';

// ============================================================
// PROPS
// ============================================================

interface FooterPreviewMockupProps {
  layout: string;
  columns: number;
  background: string;
  customBgColor?: string | null;
  showContact: boolean;
  showHours: boolean;
  showSocial: boolean;
  showNewsletter: boolean;
  showCategories: boolean;
  showPoweredBy: boolean;
  footerText?: string | null;
  newsletterTitle?: string | null;
  newsletterPlaceholder?: string | null;
  newsletterButtonText?: string | null;
  menus?: MenuGroupItem[];
  isMobile?: boolean;
  mobileStyle?: string;
  mobileShowSocial?: boolean;
  mobileShowHours?: boolean;
}

// ============================================================
// SUB-COMPONENTES DEL MOCKUP
// ============================================================

function MockFooterLogo() {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      <div className="w-6 h-6 rounded bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
        <span className="text-[8px] font-bold text-white">L</span>
      </div>
      <span className="text-[10px] font-bold">LOGO</span>
    </div>
  );
}

function MockFooterLink({ label }: { label: string }) {
  return (
    <div className="h-1.5 w-full max-w-[80px] rounded-full bg-white/20 dark:bg-white/15" title={label} />
  );
}

function MockFooterSocial() {
  const icons = [Facebook, Instagram, Twitter, Youtube];
  return (
    <div className="flex gap-1.5">
      {icons.map((Icon, i) => (
        <div key={i} className="w-4 h-4 rounded-full bg-white/15 flex items-center justify-center">
          <Icon className="h-2 w-2" />
        </div>
      ))}
    </div>
  );
}

function MockFooterContact() {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <Mail className="h-2 w-2 opacity-60" />
        <div className="h-1 w-16 rounded-full bg-white/20" />
      </div>
      <div className="flex items-center gap-1">
        <Phone className="h-2 w-2 opacity-60" />
        <div className="h-1 w-12 rounded-full bg-white/20" />
      </div>
    </div>
  );
}

function MockFooterHours() {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <Clock className="h-2 w-2 opacity-60" />
        <div className="h-1 w-20 rounded-full bg-white/20" />
      </div>
      <div className="h-1 w-16 rounded-full bg-white/15 ml-3" />
    </div>
  );
}

function MockFooterNewsletter({
  title,
  placeholder,
  buttonText,
}: {
  title?: string | null;
  placeholder?: string | null;
  buttonText?: string | null;
}) {
  return (
    <div className="space-y-1.5">
      <span className="text-[9px] font-medium">{title || 'Newsletter'}</span>
      <div className="flex gap-1">
        <div className="flex-1 h-5 rounded bg-white/10 flex items-center px-1.5 text-[8px] opacity-50">
          {placeholder || 'tu@email.com'}
        </div>
        <div className="h-5 px-2 rounded bg-blue-500 flex items-center text-[8px] font-medium text-white gap-0.5">
          <Send className="h-2 w-2" />
          {buttonText || 'Suscribir'}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MOCKUP DESKTOP
// ============================================================

function DesktopMockup({
  layout,
  columns,
  background,
  customBgColor,
  showContact,
  showHours,
  showSocial,
  showNewsletter,
  showCategories,
  showPoweredBy,
  footerText,
  newsletterTitle,
  newsletterPlaceholder,
  newsletterButtonText,
  menus,
}: FooterPreviewMockupProps) {
  const bgClass =
    background === 'dark' ? 'bg-gray-900 text-gray-200'
    : background === 'light' ? 'bg-gray-100 text-gray-800'
    : background === 'primary' ? 'bg-blue-600 text-white'
    : 'text-white';

  const inlineBg = background === 'custom' ? { backgroundColor: customBgColor ?? '#1a1a1a' } : undefined;

  const colClass = `grid-cols-${Math.min(Math.max(columns, 2), 6)}`;

  // Render columnas de menús
  const renderMenuColumns = (count: number) => {
    return Array.from({ length: count }).map((_, i) => (
      <div key={i} className="space-y-1.5">
        <div className="h-2 w-12 rounded-sm bg-white/30" />
        {menus && menus.length > 0 ? (
          menus.slice(i * 3, i * 3 + 3).map((item) => (
            <MockFooterLink key={item.id} label={item.custom_label || item.page_title || item.category_name || ''} />
          ))
        ) : (
          <>
            <MockFooterLink label="Link 1" />
            <MockFooterLink label="Link 2" />
            <MockFooterLink label="Link 3" />
          </>
        )}
      </div>
    ));
  };

  if (layout === 'centered') {
    return (
      <div className={cn('rounded-lg p-4', bgClass)} style={inlineBg}>
        <div className="flex flex-col items-center text-center gap-3">
          <MockFooterLogo />
          <div className="flex gap-3">
            <MockFooterLink label="Inicio" />
            <MockFooterLink label="Nosotros" />
            <MockFooterLink label="Servicios" />
            <MockFooterLink label="Contacto" />
          </div>
          {showSocial && <MockFooterSocial />}
          {showContact && <MockFooterContact />}
          {showNewsletter && (
            <MockFooterNewsletter
              title={newsletterTitle}
              placeholder={newsletterPlaceholder}
              buttonText={newsletterButtonText}
            />
          )}
        </div>
        {footerText && (
          <div className="mt-3 pt-2 border-t border-white/10 text-center text-[8px] opacity-60">{footerText}</div>
        )}
        {showPoweredBy && (
          <div className="mt-1 text-center text-[7px] opacity-40">Powered by GO Admin</div>
        )}
      </div>
    );
  }

  if (layout === 'minimal') {
    return (
      <div className={cn('rounded-lg p-3', bgClass)} style={inlineBg}>
        <div className="flex items-center justify-between gap-4">
          <MockFooterLogo />
          <div className="flex gap-3">
            <MockFooterLink label="Inicio" />
            <MockFooterLink label="Servicios" />
            <MockFooterLink label="Contacto" />
          </div>
          {showSocial && <MockFooterSocial />}
        </div>
        {footerText && (
          <div className="mt-2 pt-1.5 border-t border-white/10 text-[8px] opacity-60">{footerText}</div>
        )}
        {showPoweredBy && (
          <div className="mt-1 text-[7px] opacity-40">Powered by GO Admin</div>
        )}
      </div>
    );
  }

  if (layout === 'split') {
    return (
      <div className={cn('rounded-lg p-4', bgClass)} style={inlineBg}>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <MockFooterLogo />
            <div className="h-1 w-20 rounded-full bg-white/20 mb-1.5" />
            <div className="h-1 w-16 rounded-full bg-white/15 mb-2" />
            {showSocial && <MockFooterSocial />}
            {showContact && <div className="mt-2"><MockFooterContact /></div>}
          </div>
          <div className="space-y-1.5">
            <div className="h-2 w-10 rounded-sm bg-white/30" />
            {menus && menus.length > 0 ? (
              menus.slice(0, 5).map((item) => (
                <MockFooterLink key={item.id} label={item.custom_label || item.page_title || ''} />
              ))
            ) : (
              <>
                <MockFooterLink label="Link 1" />
                <MockFooterLink label="Link 2" />
                <MockFooterLink label="Link 3" />
                <MockFooterLink label="Link 4" />
              </>
            )}
            {showNewsletter && (
              <div className="pt-2">
                <MockFooterNewsletter
                  title={newsletterTitle}
                  placeholder={newsletterPlaceholder}
                  buttonText={newsletterButtonText}
                />
              </div>
            )}
          </div>
        </div>
        {footerText && (
          <div className="mt-3 pt-2 border-t border-white/10 text-[8px] opacity-60">{footerText}</div>
        )}
        {showPoweredBy && (
          <div className="mt-1 text-[7px] opacity-40">Powered by GO Admin</div>
        )}
      </div>
    );
  }

  // default y three_columns
  const colCount = layout === 'three_columns' ? 3 : columns;
  return (
    <div className={cn('rounded-lg p-4', bgClass)} style={inlineBg}>
      <div className={cn('grid gap-4', `grid-cols-${Math.min(Math.max(colCount, 2), 6)}`)}>
        {/* Columna 1: Logo + info */}
        <div>
          <MockFooterLogo />
          {showContact && <div className="mb-2"><MockFooterContact /></div>}
          {showHours && <div className="mb-2"><MockFooterHours /></div>}
          {showSocial && <MockFooterSocial />}
        </div>
        {/* Columnas de menús */}
        {renderMenuColumns(colCount - 1)}
        {/* Columna de categorías */}
        {showCategories && (
          <div className="space-y-1.5">
            <div className="h-2 w-12 rounded-sm bg-white/30" />
            <MockFooterLink label="Cat 1" />
            <MockFooterLink label="Cat 2" />
            <MockFooterLink label="Cat 3" />
          </div>
        )}
        {/* Columna de newsletter */}
        {showNewsletter && (
          <div>
            <MockFooterNewsletter
              title={newsletterTitle}
              placeholder={newsletterPlaceholder}
              buttonText={newsletterButtonText}
            />
          </div>
        )}
      </div>
      {footerText && (
        <div className="mt-3 pt-2 border-t border-white/10 text-[8px] opacity-60">{footerText}</div>
      )}
      {showPoweredBy && (
        <div className="mt-1 text-[7px] opacity-40">Powered by GO Admin</div>
      )}
    </div>
  );
}

// ============================================================
// MOCKUP MÓVIL
// ============================================================

function MobileMockup({
  mobileStyle,
  mobileShowSocial,
  mobileShowHours,
  showContact,
  showNewsletter,
  newsletterTitle,
  newsletterPlaceholder,
  newsletterButtonText,
  footerText,
  showPoweredBy,
  background,
  customBgColor,
}: FooterPreviewMockupProps) {
  const bgClass =
    background === 'dark' ? 'bg-gray-900 text-gray-200'
    : background === 'light' ? 'bg-gray-100 text-gray-800'
    : background === 'primary' ? 'bg-blue-600 text-white'
    : 'text-white';

  const inlineBg = background === 'custom' ? { backgroundColor: customBgColor ?? '#1a1a1a' } : undefined;

  if (mobileStyle === 'hidden') {
    return (
      <div className="w-[200px] mx-auto bg-gray-100 dark:bg-gray-800 rounded-[20px] border-4 border-gray-300 dark:border-gray-600 p-2">
        <div className="h-20 flex items-center justify-center text-[8px] text-gray-400">
          Footer oculto en móvil
        </div>
      </div>
    );
  }

  return (
    <div className="w-[200px] mx-auto bg-gray-100 dark:bg-gray-800 rounded-[20px] border-4 border-gray-300 dark:border-gray-600 p-2">
      {mobileStyle === 'accordion' && (
        <div className="space-y-1">
          {['Columna 1', 'Columna 2', 'Columna 3'].map((col) => (
            <div key={col} className={cn('rounded p-1.5', bgClass)} style={inlineBg}>
              <div className="flex items-center justify-between">
                <span className="text-[8px] font-medium">{col}</span>
                <span className="text-[8px] opacity-60">▼</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {mobileStyle === 'stacked' && (
        <div className="space-y-2">
          <div className={cn('rounded p-2 space-y-1', bgClass)} style={inlineBg}>
            <MockFooterLogo />
            {showContact && <MockFooterContact />}
            {mobileShowHours && <MockFooterHours />}
          </div>
          <div className={cn('rounded p-1.5 space-y-1', bgClass)} style={inlineBg}>
            <div className="h-1.5 w-10 rounded-sm bg-white/30" />
            <MockFooterLink label="Link 1" />
            <MockFooterLink label="Link 2" />
          </div>
          {showNewsletter && (
            <div className={cn('rounded p-1.5', bgClass)} style={inlineBg}>
              <MockFooterNewsletter
                title={newsletterTitle}
                placeholder={newsletterPlaceholder}
                buttonText={newsletterButtonText}
              />
            </div>
          )}
        </div>
      )}

      {mobileStyle === 'tabs' && (
        <div className="space-y-1">
          <div className="flex gap-0.5">
            {['Col 1', 'Col 2', 'Col 3'].map((tab, i) => (
              <div key={tab} className={cn(
                'flex-1 rounded-t p-1 text-center text-[7px] font-medium',
                i === 0 ? cn(bgClass, 'opacity-100') : 'bg-gray-200 dark:bg-gray-700 text-gray-400'
              )} style={i === 0 ? inlineBg : undefined}>
                {tab}
              </div>
            ))}
          </div>
          <div className={cn('rounded-b p-1.5 space-y-1', bgClass)} style={inlineBg}>
            <MockFooterLink label="Link 1" />
            <MockFooterLink label="Link 2" />
            <MockFooterLink label="Link 3" />
          </div>
        </div>
      )}

      {mobileShowSocial && (
        <div className="flex justify-center gap-1 pt-1.5">
          <div className="h-3 w-3 rounded-full bg-gray-300 dark:bg-gray-600" />
          <div className="h-3 w-3 rounded-full bg-gray-300 dark:bg-gray-600" />
          <div className="h-3 w-3 rounded-full bg-gray-300 dark:bg-gray-600" />
        </div>
      )}

      {footerText && (
        <div className="mt-1.5 text-center text-[7px] opacity-50">{footerText}</div>
      )}
      {showPoweredBy && (
        <div className="text-center text-[6px] opacity-30">Powered by GO Admin</div>
      )}
    </div>
  );
}

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================

export default function FooterPreviewMockup(props: FooterPreviewMockupProps) {
  if (props.isMobile) {
    return <MobileMockup {...props} />;
  }
  return <DesktopMockup {...props} />;
}
