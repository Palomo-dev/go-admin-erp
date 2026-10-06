'use client';

/**
 * Marco del asistente de creación del sitio (Figma A/03a-03h): pantalla
 * completa sin menú lateral, una sola tarea.
 *
 * - Escritorio: barra superior «GO Admin · Configura tu sitio web», el Stepper
 *   de 6 segmentos al centro y «Guardar y salir» siempre visible; contenido a la
 *   izquierda y «Vista previa en vivo · móvil» a la derecha; barra inferior fija
 *   con «Atrás», «Paso N de 6» y el primario.
 * - Móvil (< lg): X (guardar y salir) con el título, el Stepper debajo y la
 *   barra inferior con «Atrás» y el primario a medias.
 *
 * Cubre el shell con una capa fija: el asistente vive en /app (puerta de
 * módulos y sesión) pero no muestra el menú (catálogo: pantalla completa).
 */
import type { ReactNode } from 'react';
import { ArrowLeft, Loader2, X } from 'lucide-react';
import { Stepper, clasesBoton } from '@/components/kit';
import { cn } from '@/utils/Utils';
import { PASOS_ASISTENTE, type PasoAsistente } from '@/lib/website/onboardingSitio';
import { useTextosResumen } from '../textos';
import { CLASE_TAMANO_ICONO, TRAZO_ICONO } from '../../ui/iconosSitio';

export interface MarcoAsistenteProps {
  paso: number;
  onGuardarSalir: () => void;
  onAtras?: () => void;
  /** Primario del pie («Siguiente», «Publicar sitio»). */
  primario: { etiqueta: string; onClick: () => void; cargando?: boolean; deshabilitado?: boolean };
  /** Secundario del pie, junto al primario («Guardar como borrador»). */
  secundario?: { etiqueta: string; onClick: () => void; deshabilitado?: boolean };
  /** Vista previa a la derecha en escritorio; sin ella el contenido ocupa el ancho (paso 2). */
  vistaPrevia?: ReactNode;
  guardando?: boolean;
  children: ReactNode;
}

export function MarcoAsistente({ paso, onGuardarSalir, onAtras, primario, secundario, vistaPrevia, guardando, children }: MarcoAsistenteProps) {
  const t = useTextosResumen();
  const total = PASOS_ASISTENTE.length;
  const pasos = PASOS_ASISTENTE.map((p) => ({ valor: p, etiqueta: t(`asistente.pasos.${p}`) }));
  const actual: PasoAsistente = PASOS_ASISTENTE[Math.min(Math.max(paso, 1), total) - 1];
  const stepper = (
    <Stepper
      variante="segmentos"
      pasos={pasos}
      actual={actual}
      etiqueta={t('asistente.etiquetaStepper')}
      resumenMovil={(n, tot, etiqueta) => t('asistente.resumenPaso', { n, total: tot, etiqueta })}
    />
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas" role="dialog" aria-modal="true" aria-label={t('asistente.titulo')}>
      {/* Barra superior */}
      <header className="flex shrink-0 flex-col gap-3 border-b border-line bg-surface px-4 py-3 lg:grid lg:grid-cols-[1fr_minmax(240px,320px)_1fr] lg:items-center lg:gap-6 lg:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onGuardarSalir}
            aria-label={t('asistente.cerrar')}
            className={cn(clasesBoton({ variante: 'fantasma', tamano: 'sm' }), 'px-2 lg:hidden')}
          >
            <X aria-hidden="true" className={CLASE_TAMANO_ICONO.fila} strokeWidth={TRAZO_ICONO} />
          </button>
          <span className="hidden text-sm font-semibold text-fg lg:inline">{t('asistente.marca')}</span>
          <span aria-hidden="true" className="hidden text-fg-muted lg:inline">·</span>
          <h1 className="truncate text-sm font-medium text-fg lg:font-normal lg:text-fg-secondary">{t('asistente.titulo')}</h1>
        </div>
        <div className="w-full">{stepper}</div>
        <div className="hidden justify-end lg:flex">
          <button type="button" onClick={onGuardarSalir} className={clasesBoton({ variante: 'fantasma', tamano: 'md' })}>
            {t('asistente.guardarSalir')}
          </button>
        </div>
      </header>

      {/* Contenido + vista previa */}
      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1 overflow-y-auto px-4 py-6 lg:px-10 lg:py-8">
          <div className={cn('mx-auto flex w-full flex-col gap-6', vistaPrevia ? 'max-w-[760px]' : 'max-w-[1120px]')}>{children}</div>
        </main>
        {vistaPrevia && (
          <aside className="hidden w-[420px] shrink-0 flex-col items-center gap-3 overflow-y-auto border-l border-line bg-subtle px-6 py-6 lg:flex xl:w-[460px]">
            {vistaPrevia}
          </aside>
        )}
      </div>

      {/* Barra inferior fija */}
      <footer className="flex shrink-0 items-center gap-3 border-t border-line bg-surface px-4 py-3 lg:px-6">
        {onAtras ? (
          <button type="button" onClick={onAtras} className={cn(clasesBoton({ variante: 'secundario', tamano: 'md' }), 'flex-1 lg:flex-none')}>
            <ArrowLeft aria-hidden="true" className={cn(CLASE_TAMANO_ICONO.base, 'hidden lg:block')} strokeWidth={TRAZO_ICONO} />
            {t('asistente.atras')}
          </button>
        ) : (
          <span className="hidden lg:block" />
        )}
        <span className="hidden flex-1 lg:block" />
        {guardando && (
          <span className="hidden items-center gap-1.5 text-xs text-fg-secondary lg:flex" role="status">
            <Loader2 aria-hidden="true" className={cn(CLASE_TAMANO_ICONO.meta, 'animate-spin motion-reduce:animate-none')} strokeWidth={TRAZO_ICONO} />
            {t('asistente.guardando')}
          </span>
        )}
        {secundario && (
          <button
            type="button"
            onClick={secundario.onClick}
            disabled={secundario.deshabilitado}
            className={cn(clasesBoton({ variante: 'secundario', tamano: 'md' }), 'hidden lg:inline-flex')}
          >
            {secundario.etiqueta}
          </button>
        )}
        <span className="hidden text-[13px] tabular-nums text-fg-secondary lg:inline">{t('asistente.pasoDe', { n: paso, total })}</span>
        <button
          type="button"
          onClick={primario.onClick}
          disabled={primario.deshabilitado || primario.cargando}
          aria-busy={primario.cargando || undefined}
          className={cn(clasesBoton({ variante: 'primario', tamano: 'md' }), 'flex-1 lg:flex-none', !onAtras && 'ml-auto')}
        >
          {primario.cargando && <Loader2 aria-hidden="true" className={cn(CLASE_TAMANO_ICONO.base, 'animate-spin motion-reduce:animate-none')} strokeWidth={TRAZO_ICONO} />}
          {primario.etiqueta}
        </button>
      </footer>
    </div>
  );
}
