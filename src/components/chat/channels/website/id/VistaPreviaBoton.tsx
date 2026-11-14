'use client';

/**
 * «Vista previa del botón» (Figma «VistaPreviaBoton», 94-chat-recuperado-canales
 * 15, 17, 20, 24): siempre a la vista junto a los controles de «Más opciones
 * de estilo» y en vivo, antes de guardar (como hacía la pantalla anterior).
 *
 * - `tarjeta` (escritorio): columna derecha, fija (sticky, 16 px) mientras se baja.
 * - `barra` (móvil): barra fija bajo el encabezado mientras se baja.
 */
import { useTranslations } from 'next-intl';
import { cn } from '@/utils/Utils';
import type { WidgetStyle } from '@/lib/services/chatChannelsService';
import { BotonWidgetMuestra } from './BotonWidgetMuestra';
import { resumenBoton, type ParteResumenBoton } from './widgetLogica';

export function useResumenBoton() {
  const t = useTranslations('chatModulo.canales.widget.botonVista.resumen');
  return (style: WidgetStyle) =>
    resumenBoton(style)
      .map((p: ParteResumenBoton) => {
        switch (p.clave) {
          case 'tamano':
            return t('tamano', { px: p.px });
          case 'imagenPropia':
            return t('imagenPropia');
          case 'relleno':
            return t('relleno');
          case 'redondeo':
            return t('redondeo', { px: p.px });
          case 'sinBorde':
            return t('sinBorde');
          case 'borde':
            return t('borde', { px: p.px, color: p.color ?? t('blanco') });
          case 'sinSombra':
            return t('sinSombra');
          case 'sombra':
            return t(`sombra.${p.fuerza}`);
        }
      })
      .join(' · ');
}

export function VistaPreviaBoton({ style, variante, className }: { style: WidgetStyle; variante: 'tarjeta' | 'barra'; className?: string }) {
  const t = useTranslations('chatModulo.canales.widget.botonVista');
  const resumen = useResumenBoton()(style);

  if (variante === 'barra') {
    return (
      <div role="status" aria-live="polite" className={cn('flex items-center gap-3 border-b border-line bg-surface px-4 py-3 shadow-sm', className)}>
        <span className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-subtle">
          <BotonWidgetMuestra style={style} />
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[13px] font-semibold leading-[18px] text-fg">{t('titulo')}</span>
          <span className="text-xs leading-4 text-fg-muted">{resumen}</span>
          <span className="text-xs leading-4 text-fg-muted">{t('arriba')}</span>
        </span>
      </div>
    );
  }

  return (
    <section aria-label={t('titulo')} className={cn('flex flex-col gap-3 rounded-xl bg-subtle p-4', className)}>
      <p className="text-[13px] font-medium leading-[18px] text-fg">{t('titulo')}</p>
      <div className="flex h-[136px] items-center justify-center rounded-lg border border-line bg-surface">
        <BotonWidgetMuestra style={style} />
      </div>
      <p className="text-center text-xs leading-4 text-fg-muted">{t('tamanoReal')}</p>
      <p role="status" aria-live="polite" className="text-center text-xs leading-4 text-fg-secondary">
        {resumen}
      </p>
    </section>
  );
}
