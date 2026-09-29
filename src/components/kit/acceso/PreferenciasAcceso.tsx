'use client';

/**
 * Píldora de preferencias del acceso (Figma `EscenaAcceso` › Preferencias):
 * `LanguagePicker` `Layout=trigger` 1126:35468 (globo + idioma + chevron, 32 px)
 * y `ThemeToggle` 45:2067 (luna en claro, sol en oscuro).
 *
 * El idioma se cambia con `changeLanguage` (el mismo del panel de sesión) y el
 * tema con next-themes (el mismo del header). En automático el tema sigue al
 * sistema operativo; al pulsar, se fija el contrario del que se ve.
 */
import * as React from 'react';
import { ChevronDown, Globe, Moon, Sun, Check } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { changeLanguage } from '@/i18n/provider';
import { localeNames, type Locale } from '@/i18n/config';
import { cn } from '@/utils/Utils';

// Orden del diseño (Figma LanguagePicker 78:3173).
const IDIOMAS: Locale[] = ['es', 'en', 'fr', 'pt'];

export function SelectorIdiomaCompacto({ className }: { className?: string }) {
  const t = useTranslations('acceso.escena');
  const locale = useLocale() as Locale;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-fg hover:bg-hover',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
          className,
        )}
        aria-label={t('idiomaActual', { idioma: localeNames[locale] ?? locale })}
      >
        <Globe className="size-4 text-fg-secondary" aria-hidden="true" />
        <span>{localeNames[locale] ?? locale}</span>
        <ChevronDown className="size-3.5 text-fg-muted" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[160px]">
        {IDIOMAS.map((l) => (
          <DropdownMenuItem key={l} onSelect={() => l !== locale && changeLanguage(l)} className="gap-2" lang={l}>
            <span className="flex-1">{localeNames[l]}</span>
            {l === locale && <Check className="size-4 text-brand-deep" aria-hidden="true" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function BotonTemaAcceso({ className }: { className?: string }) {
  const t = useTranslations('acceso.escena');
  const { resolvedTheme, setTheme } = useTheme();
  const [montado, setMontado] = React.useState(false);
  React.useEffect(() => setMontado(true), []);
  const oscuro = montado && resolvedTheme === 'dark';
  return (
    <button
      type="button"
      onClick={() => setTheme(oscuro ? 'light' : 'dark')}
      aria-label={oscuro ? t('temaClaro') : t('temaOscuro')}
      title={oscuro ? t('temaClaro') : t('temaOscuro')}
      className={cn(
        'inline-flex size-8 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover hover:text-fg',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        className,
      )}
    >
      {oscuro ? <Sun className="size-[18px]" aria-hidden="true" /> : <Moon className="size-[18px]" aria-hidden="true" />}
    </button>
  );
}

export function PreferenciasAcceso({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-line bg-surface p-2 pl-3 shadow-sm',
        className,
      )}
    >
      <SelectorIdiomaCompacto />
      <BotonTemaAcceso />
    </div>
  );
}
