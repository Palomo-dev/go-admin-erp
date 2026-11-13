'use client';

import * as React from 'react';
import { Copy, Pencil, RefreshCw, Send, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { StatusBadge, clasesBoton } from '@/components/kit';
import { useToast } from '@/components/ui/use-toast';
import type { ConversacionControl } from '../useConversacion';

/**
 * Pestaña «IA» (Figma 91-chat-03): modo de la IA del canal, resumen de la
 * conversación y respuesta sugerida (Usar · Editar · copiar · otra). Las
 * generaciones pasan por las rutas del servidor, que comprueban y cobran
 * créditos; aquí no se cobra nada.
 */
export function PestanaIA({ c, onEditar }: { c: ConversacionControl; onEditar: (texto: string) => void }) {
  const t = useTranslations('chatBandeja.ia');
  const { toast } = useToast();
  const [generando, setGenerando] = React.useState(false);
  const [resumiendo, setResumiendo] = React.useState(false);
  const [usando, setUsando] = React.useState(false);
  const modo = (c.detalle?.channel?.ai_mode ?? 'manual') as 'auto' | 'hybrid' | 'manual';
  const cerrada = c.estadoEscritura !== 'normal';

  const generar = async () => {
    setGenerando(true);
    try {
      await c.sugerirIA();
    } finally {
      setGenerando(false);
    }
  };

  const usar = async () => {
    if (!c.sugerencia?.texto) return;
    setUsando(true);
    try {
      await c.enviar({ texto: c.sugerencia.texto });
      toast({ title: t('enviada') });
    } catch {
      /* aviso en el hook */
    } finally {
      setUsando(false);
    }
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Sparkles aria-hidden="true" className="size-4 text-brand" />
          {t('titulo')}
        </h3>
        <StatusBadge estado={modo} etiqueta={t(`modo.${modo}`)} tono={modo === 'manual' ? 'neutro' : 'informacion'} apariencia="contorno" />
      </div>
      <p className="text-xs text-fg-muted">{t(`ayuda.${modo}`)}</p>

      <section className="rounded-xl border border-line bg-subtle p-3">
        <h4 className="mb-1 text-xs font-semibold text-fg">{t('resumen')}</h4>
        {c.resumen?.summary ? (
          <p className="whitespace-pre-wrap text-sm text-fg-secondary">{c.resumen.summary}</p>
        ) : (
          <p className="text-sm text-fg-muted">{t('sinResumen')}</p>
        )}
        <button
          type="button"
          disabled={resumiendo}
          aria-busy={resumiendo}
          onClick={async () => {
            setResumiendo(true);
            try {
              await c.generarResumen();
            } finally {
              setResumiendo(false);
            }
          }}
          className={clasesBoton({ variante: 'fantasma', tamano: 'sm', className: 'mt-2 -ml-2 text-brand' })}
        >
          <RefreshCw aria-hidden="true" className={resumiendo ? 'size-3.5 animate-spin' : 'size-3.5'} />
          {c.resumen?.summary ? t('actualizarResumen') : t('generarResumen')}
        </button>
      </section>

      {c.sugerencia?.texto ? (
        <section className="rounded-xl border border-line-brand bg-brand-tint p-3">
          <h4 className="mb-1 text-xs font-semibold text-fg">{t('sugerida')}</h4>
          <p className="whitespace-pre-wrap text-sm text-fg">{c.sugerencia.texto}</p>
          <div className="mt-3 flex items-center gap-2">
            <button type="button" onClick={() => void usar()} disabled={usando || cerrada} aria-busy={usando} className={clasesBoton({ tamano: 'sm' })}>
              <Send aria-hidden="true" className="size-3.5" />
              {t('usar')}
            </button>
            <button type="button" onClick={() => onEditar(c.sugerencia!.texto)} disabled={cerrada} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
              <Pencil aria-hidden="true" className="size-3.5" />
              {t('editar')}
            </button>
            <button
              type="button"
              aria-label={t('copiar')}
              title={t('copiar')}
              onClick={() => {
                void navigator.clipboard?.writeText(c.sugerencia!.texto);
                toast({ title: t('copiada') });
              }}
              className={clasesBoton({ variante: 'fantasma', tamano: 'sm', className: 'ml-auto px-2' })}
            >
              <Copy aria-hidden="true" className="size-4" />
            </button>
          </div>
        </section>
      ) : null}

      <button type="button" onClick={() => void generar()} disabled={generando || cerrada} aria-busy={generando} className={clasesBoton({ variante: 'secundario', anchoCompleto: true })}>
        <RefreshCw aria-hidden="true" className={generando ? 'size-4 animate-spin' : 'size-4'} />
        {c.sugerencia?.texto ? t('otra') : t('generar')}
      </button>
      <p className="text-xs text-fg-muted">{t('creditos')}</p>
    </div>
  );
}
