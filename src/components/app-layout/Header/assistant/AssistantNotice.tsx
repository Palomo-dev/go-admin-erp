'use client';

/**
 * GO Asistente — aviso aparte de la burbuja (Figma `AsistenteAviso` 664:16499:
 * créditos bajos · sin créditos · error · sin permiso; pantallas 11–14).
 *
 * Mejoras sobre el Figma:
 * - Dos tipos más que sí ocurren: **sesión caducada** (401) y **límite de
 *   velocidad** (429). Antes caían en «error» con un «Reintentar» inútil.
 * - «Reintentar» solo aparece donde reintentar puede servir
 *   (`avisoPermiteReintentar`). Sin créditos o sin permiso, no.
 * - El texto de «alcanzan para unas N respuestas» sale del promedio REAL de la
 *   organización; el Figma traía «unas 4» fijo. Y no se promete una fecha de
 *   renovación del plan: en la base ninguna organización tiene una
 *   `credits_reset_at` futura (2026-09-29), así que sería inventada.
 * - El aviso de créditos bajos se puede descartar: no insiste en cada turno.
 * - `role="alert"` para lo que bloquea (sin créditos, sesión) y `status` para
 *   lo demás: un lector de pantalla no interrumpe por un aviso informativo.
 */

import React from 'react';
import { useTranslations } from 'next-intl';
import { CircleAlert, Coins, Lock, LogIn, RefreshCw, Timer, X } from 'lucide-react';
import { clasesBoton } from '@/components/kit/botonClases';
import { cn } from '@/utils/Utils';
import { avisoPermiteReintentar, type TipoAviso } from '@/lib/ai/assistant/panelUi';

export interface AssistantNoticeProps {
  tipo: TipoAviso;
  /** Texto del servidor (en español) cuando lo hay; si no, el del tipo. */
  mensaje?: string | null;
  saldo?: number | null;
  /** Respuestas que alcanzan con el saldo, o `null` si no hay promedio fiable. */
  respuestas?: number | null;
  onReintentar?(): void;
  onDescartar?(): void;
}

const ESTILO: Record<TipoAviso, { caja: string; icono: string }> = {
  creditos_bajos: { caja: 'border-line-warning bg-warning-subtle', icono: 'text-warning-text' },
  sin_creditos: { caja: 'border-line-danger bg-danger-subtle', icono: 'text-danger-text' },
  error: { caja: 'border-line-danger bg-danger-subtle', icono: 'text-danger-text' },
  sin_permiso: { caja: 'border-line-info bg-info-subtle', icono: 'text-info-text' },
  sesion: { caja: 'border-line-warning bg-warning-subtle', icono: 'text-warning-text' },
  limite: { caja: 'border-line-warning bg-warning-subtle', icono: 'text-warning-text' },
};

function Icono({ tipo }: { tipo: TipoAviso }) {
  const cls = cn('mt-0.5 h-5 w-5 shrink-0', ESTILO[tipo].icono);
  if (tipo === 'creditos_bajos' || tipo === 'sin_creditos') return <Coins className={cls} strokeWidth={1.5} aria-hidden="true" />;
  if (tipo === 'sin_permiso') return <Lock className={cls} strokeWidth={1.5} aria-hidden="true" />;
  if (tipo === 'sesion') return <LogIn className={cls} strokeWidth={1.5} aria-hidden="true" />;
  if (tipo === 'limite') return <Timer className={cls} strokeWidth={1.5} aria-hidden="true" />;
  return <CircleAlert className={cls} strokeWidth={1.5} aria-hidden="true" />;
}

export default function AssistantNotice({ tipo, mensaje, saldo, respuestas, onReintentar, onDescartar }: AssistantNoticeProps) {
  const t = useTranslations('asistente.aviso');

  const titulo =
    tipo === 'creditos_bajos'
      ? t('creditosBajosTitulo', { n: saldo ?? 0 })
      : tipo === 'sin_creditos'
        ? t('sinCreditosTitulo')
        : tipo === 'sin_permiso'
          ? t('sinPermisoTitulo')
          : tipo === 'sesion'
            ? t('sesionTitulo')
            : tipo === 'limite'
              ? t('limiteTitulo')
              : t('errorTitulo');

  const descripcion =
    tipo === 'creditos_bajos'
      ? respuestas !== null && respuestas !== undefined
        ? t('creditosBajosRespuestas', { n: respuestas })
        : t('creditosBajosSinPromedio')
      : tipo === 'sin_creditos'
        ? t('sinCreditosTexto')
        : mensaje || (tipo === 'sin_permiso' ? t('sinPermisoTexto') : tipo === 'sesion' ? t('sesionTexto') : tipo === 'limite' ? t('limiteTexto') : t('errorTexto'));

  const bloquea = tipo === 'sin_creditos' || tipo === 'sesion';

  return (
    <section
      role={bloquea ? 'alert' : 'status'}
      aria-label={titulo}
      className={cn('relative flex gap-3 rounded-xl border p-4', ESTILO[tipo].caja)}
    >
      <Icono tipo={tipo} />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="pr-6 text-sm font-medium text-fg">{titulo}</p>
        <p className="break-words text-[13px] leading-[18px] text-fg-secondary">{descripcion}</p>
        {tipo === 'error' && (
          <p className="text-[13px] leading-[18px] text-fg-secondary">{t('errorConservado')}</p>
        )}
        <div className="flex flex-wrap gap-2 pt-2">
          {(tipo === 'creditos_bajos' || tipo === 'sin_creditos') && (
            <a
              href="/app/plan"
              className={clasesBoton({ variante: tipo === 'sin_creditos' ? 'primario' : 'tinte', tamano: 'sm' })}
            >
              {t('comprarCreditos')}
            </a>
          )}
          {tipo === 'sin_permiso' && (
            <a href="/app/configuracion/asistente" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
              {t('verPermisos')}
            </a>
          )}
          {tipo === 'sesion' && (
            <a href="/auth/login" className={clasesBoton({ variante: 'primario', tamano: 'sm' })}>
              {t('iniciarSesion')}
            </a>
          )}
          {avisoPermiteReintentar(tipo) && onReintentar && (
            <button type="button" onClick={onReintentar} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
              <RefreshCw className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
              {t('reintentar')}
            </button>
          )}
        </div>
      </div>
      {onDescartar && (
        <button
          type="button"
          onClick={onDescartar}
          aria-label={t('descartar')}
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-fg-muted outline-none hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-brand"
        >
          <X className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
        </button>
      )}
    </section>
  );
}
