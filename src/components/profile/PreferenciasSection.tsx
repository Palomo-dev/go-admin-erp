'use client';

/**
 * «Mi perfil › Preferencias» (Figma 346:20440): tema, idioma y zona horaria
 * en un solo bloque.
 *
 * - Tema: Claro · Oscuro · Sistema. Misma persistencia que el interruptor del
 *   bloque de sesión (`themeService`: local al instante y remoto para los
 *   demás dispositivos); aquí se suma «Sistema», que el interruptor no ofrece.
 * - Idioma: `guardarIdiomaPreferido`, la misma función del bloque de sesión.
 * - Zona horaria: la persona no tiene una propia (no existe la columna; el
 *   frame la marca «Nuevo»). Se muestra, de solo lectura, la de la
 *   organización, que es con la que se pintan todas las fechas.
 *
 * Las notificaciones siguen en su propia sección («Notificaciones»).
 */
import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { Monitor, Moon, Sun } from 'lucide-react';
import { SegmentedControl } from '@/components/kit/SegmentedControl';
import { themeService } from '@/lib/services/themeService';
import { guardarIdiomaPreferido } from '@/lib/i18n/idiomaPreferido';
import { isValidLocale, localeNames, locales, type Locale } from '@/i18n/config';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';

type Tema = 'light' | 'dark' | 'system';

export default function PreferenciasSection() {
  const t = useTranslations('perfil.preferencias');
  const locale = useLocale();
  const { theme, setTheme } = useTheme();
  const { timezone } = useFormatDate();
  // next-themes no conoce el tema hasta montar: se evita pintar uno equivocado.
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  const tema: Tema = theme === 'dark' || theme === 'system' ? theme : 'light';

  const elegirTema = (nuevo: Tema) => {
    themeService.setLocalTheme(nuevo);
    themeService.markUserOverride();
    setTheme(nuevo);
    void themeService.setRemoteTheme(nuevo);
  };

  return (
    <section aria-labelledby="perfil-preferencias" className="flex flex-col gap-5">
      <header>
        <h2 id="perfil-preferencias" className="text-lg font-semibold leading-6 text-fg">
          {t('titulo')}
        </h2>
        <p className="text-[13px] leading-[18px] text-fg-secondary">{t('descripcion')}</p>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-fg">{t('tema')}</p>
          <p className="text-xs text-fg-secondary">{t('temaAyuda')}</p>
        </div>
        {montado && (
          <SegmentedControl<Tema>
            etiqueta={t('tema')}
            valor={tema}
            onValorChange={elegirTema}
            opciones={[
              { valor: 'light', etiqueta: t('claro'), icono: Sun },
              { valor: 'dark', etiqueta: t('oscuro'), icono: Moon },
              { valor: 'system', etiqueta: t('sistema'), icono: Monitor },
            ]}
          />
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-fg">{t('idioma')}</span>
          <select
            value={locale}
            onChange={(e) => {
              if (isValidLocale(e.target.value) && e.target.value !== locale) void guardarIdiomaPreferido(e.target.value as Locale);
            }}
            className="h-10 rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {locales.map((l) => (
              <option key={l} value={l} lang={l}>
                {localeNames[l]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-fg">{t('zonaHoraria')}</span>
          <p className="flex h-10 items-center rounded-lg border border-line bg-subtle px-3 text-sm text-fg-secondary">{timezone}</p>
          <p className="text-xs text-fg-secondary">{t('zonaHorariaAyuda')}</p>
        </div>
      </div>
    </section>
  );
}
