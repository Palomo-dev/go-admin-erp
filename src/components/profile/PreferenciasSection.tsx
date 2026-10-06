'use client';

/**
 * «Mi perfil › Preferencias» (Figma 346:20440): tema, idioma y zona horaria
 * en un solo bloque.
 *
 * - Tema: Claro · Oscuro · Sistema. Misma persistencia que el interruptor del
 *   bloque de sesión (`themeService`: local al instante y remoto para los
 *   demás dispositivos); aquí se suma «Sistema», que el interruptor no ofrece.
 * - Idioma: `guardarIdiomaPreferido`, la misma función del bloque de sesión.
 * - Zona horaria: de solo lectura. No hay zona por persona (decisión del
 *   dueño, 2026-09-30): es la de la sucursal activa del header si tiene una
 *   propia y, si no, la de la organización (`useTimezoneFor`, regla única).
 *   Debajo se dice de dónde viene. Se edita en Organización › Sucursales.
 *
 * Las notificaciones siguen en su propia sección («Notificaciones»): el
 * diseño las pinta aquí, pero duplicar sus interruptores dejaría dos sitios
 * que guardan lo mismo con dos botones «Guardar». Aquí va el acceso directo.
 */
import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { Monitor, Moon, Sun } from 'lucide-react';
import { SegmentedControl } from '@/components/kit/SegmentedControl';
import { FormSection } from '@/components/kit/FormSection';
import { FormField } from '@/components/kit/FormField';
import { clasesBoton } from '@/components/kit/botonClases';
import { CLASE_CAMPO } from './piezasPerfil';
import { themeService } from '@/lib/services/themeService';
import { guardarIdiomaPreferido } from '@/lib/i18n/idiomaPreferido';
import { isValidLocale, localeNames, locales, type Locale } from '@/i18n/config';
import { useTimezoneFor } from '@/lib/context/OrganizationTimezoneContext';
import { useBranchOpcional } from '@/lib/context/BranchContext';

type Tema = 'light' | 'dark' | 'system';

export default function PreferenciasSection({ onIrANotificaciones }: { onIrANotificaciones?: () => void } = {}) {
  const t = useTranslations('perfil.preferencias');
  const locale = useLocale();
  const { theme, setTheme } = useTheme();
  const zona = useTimezoneFor();
  const sucursales = useBranchOpcional()?.branches;
  const nombreSucursal = zona.branchId !== null ? sucursales?.find((b) => Number(b.id) === zona.branchId)?.name : undefined;
  const origenZona =
    zona.source === 'branch'
      ? nombreSucursal
        ? t('zonaOrigenSucursal', { sucursal: nombreSucursal })
        : t('zonaOrigenSucursalSinNombre')
      : zona.source === 'organization'
        ? t('zonaOrigenOrganizacion')
        : t('zonaOrigenSistema');
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
    <FormSection titulo={t('titulo')} descripcion={t('descripcion')} id="perfil-preferencias">
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
        <FormField etiqueta={t('idioma')}>
          <select
            value={locale}
            onChange={(e) => {
              if (isValidLocale(e.target.value) && e.target.value !== locale) void guardarIdiomaPreferido(e.target.value as Locale);
            }}
            className={CLASE_CAMPO}
          >
            {locales.map((l) => (
              <option key={l} value={l} lang={l}>
                {localeNames[l]}
              </option>
            ))}
          </select>
        </FormField>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-fg">{t('zonaHoraria')}</span>
          <p className="flex h-10 items-center justify-between gap-2 rounded-lg border border-line bg-subtle px-3 text-sm text-fg-secondary">
            <span className="truncate">{zona.timezone}</span>
            <span className="shrink-0 text-xs font-medium text-fg" data-testid="zona-origen">{origenZona}</span>
          </p>
          <p className="text-xs text-fg-secondary">{t('zonaHorariaAyuda')}</p>
        </div>
      </div>

      {onIrANotificaciones && (
        <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-fg">{t('notificaciones')}</p>
            <p className="text-xs text-fg-secondary">{t('notificacionesAyuda')}</p>
          </div>
          <button type="button" onClick={onIrANotificaciones} className={clasesBoton({ variante: 'secundario', tamano: 'md', className: 'h-12 w-full sm:h-10 sm:w-auto' })}>
            {t('configurarNotificaciones')}
          </button>
        </div>
      )}
    </FormSection>
  );
}
