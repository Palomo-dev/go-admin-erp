'use client';

/**
 * Vista previa en vivo del chat del sitio web (Figma 91-chat-24): ventana
 * abierta con título, bienvenida, botones rápidos y el formulario «Antes de
 * empezar» según los datos que se piden; el botón flotante debajo. Usa el
 * color, la posición y el tamaño guardados. Es solo dibujo: no envía nada.
 */
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { MessageCircle, RotateCcw, X } from 'lucide-react';
import { clasesBoton } from '@/components/kit';
import { cn } from '@/utils/Utils';
import type { BrandConfig, CollectIdentity } from '@/lib/services/chatChannelsService';

export function VistaPreviaWidget({ config, datos }: { config: BrandConfig; datos: CollectIdentity }) {
  const t = useTranslations('chatModulo.canales.widget.vistaPrevia');
  const [abierto, setAbierto] = useState(true);
  const [clave, setClave] = useState(0);
  const color = /^#[0-9a-fA-F]{6}$/.test(config.style.primaryColor) ? config.style.primaryColor : '#4361ee';
  const izquierda = config.position.side === 'left';
  const arriba = config.position.vertical === 'top';
  const tamano = Math.min(64, Math.max(40, config.style.buttonSize || 56));
  const pide = (['name', 'phone', 'email'] as const).filter((c) => datos[c]);
  const botones = config.behavior.showQuickActions ? (config.behavior.quickActions ?? []) : [];

  const ventana = abierto && (
    <div className="flex w-full max-w-[340px] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-lg">
      <div className="flex items-start justify-between gap-2 px-4 py-3 text-white" style={{ backgroundColor: color }}>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{config.behavior.title || t('tituloPorDefecto')}</p>
          <p className="text-xs opacity-90">{t('enLinea')}</p>
        </div>
        <button type="button" aria-label={t('cerrar')} onClick={() => setAbierto(false)} className="rounded p-0.5 hover:bg-white/15">
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>
      <div className="flex flex-col gap-3 bg-canvas p-3">
        {config.behavior.welcomeMessage && (
          <div className="max-w-[85%] rounded-xl border border-line bg-surface px-3 py-2 text-[13px] text-fg">
            {config.behavior.welcomeMessage}
            <span className="mt-1 block text-right text-[11px] text-fg-muted">{t('ahora')}</span>
          </div>
        )}
        {botones.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {botones.map((b) => (
              <span key={b.label} className="rounded-full border bg-surface px-2.5 py-1 text-xs font-medium" style={{ borderColor: color, color }}>
                {b.label}
              </span>
            ))}
          </div>
        )}
        {pide.length > 0 && (
          <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-3">
            <p className="text-xs font-semibold text-fg">{t('antesDeEmpezar')}</p>
            {pide.map((c) => (
              <div key={c} className="rounded-md border border-line px-2.5 py-1.5 text-xs text-fg-muted">
                {t(`campos.${c}`)}
              </div>
            ))}
            <div className="rounded-md py-2 text-center text-xs font-medium text-white" style={{ backgroundColor: color }}>
              {t('empezar')}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const lanzador = (
    <button
      type="button"
      aria-label={abierto ? t('cerrar') : t('abrir')}
      onClick={() => setAbierto((a) => !a)}
      className="flex shrink-0 items-center justify-center rounded-full text-white shadow-lg"
      style={{ backgroundColor: color, width: tamano, height: tamano }}
    >
      <MessageCircle aria-hidden="true" className="size-6" strokeWidth={1.75} />
    </button>
  );

  return (
    <section aria-label={t('titulo')} className="flex flex-col gap-3">
      <p className="text-xs font-medium text-fg-muted">{t('titulo')}</p>
      <div key={clave} className="flex min-h-[480px] flex-col gap-3 rounded-xl border border-line bg-subtle p-4">
        <div aria-hidden="true" className="flex flex-col gap-2">
          <span className="h-2 w-3/5 rounded-full bg-line" />
          <span className="h-2 w-4/5 rounded-full bg-line" />
          <span className="h-2 w-2/5 rounded-full bg-line" />
        </div>
        <div className={cn('mt-auto flex flex-col gap-3', izquierda ? 'items-start' : 'items-end', arriba && 'mb-auto mt-0 flex-col-reverse')}>
          {ventana}
          {lanzador}
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          setAbierto(true);
          setClave((k) => k + 1);
        }}
        className={clasesBoton({ variante: 'fantasma', tamano: 'sm', className: 'self-start' })}
      >
        <RotateCcw aria-hidden="true" className="size-4" strokeWidth={1.5} />
        {t('reiniciar')}
      </button>
    </section>
  );
}
