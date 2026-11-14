'use client';

import * as React from 'react';
import { Check, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ChipsOpcion, clasesBoton } from '@/components/kit';
import { useToast } from '@/components/ui/use-toast';
import { chatApi } from '@/lib/services/chat/chatApi';
import { COMENTARIO_MAXIMO, MOTIVOS_VALORACION, type MotivoValoracion } from '@/lib/services/chat/valoracionIa';
import { cn } from '@/utils/Utils';

/**
 * «¿Te sirvió? 👍 Sí · 👎 No» bajo la respuesta sugerida (Figma
 * 93-chat-pendientes-03). 👍 guarda el voto y muestra «Gracias»; 👎 abre
 * «¿Qué falló?» con chips, comentario opcional y Cancelar · Enviar. Queda
 * ligado al trabajo de IA (`jobId`) y se ve en IA › Trabajos. El cliente no
 * lo ve. Montar con `key={jobId}` para empezar de cero con cada respuesta.
 */
export function ValoracionRespuestaIa({ jobId }: { jobId: string }) {
  const t = useTranslations('chatBandejaPendientes.valoracion');
  const { toast } = useToast();
  const [fase, setFase] = React.useState<'pregunta' | 'motivo' | 'gracias'>('pregunta');
  const [motivo, setMotivo] = React.useState<MotivoValoracion | null>(null);
  const [comentario, setComentario] = React.useState('');
  const [enviando, setEnviando] = React.useState(false);
  const idTitulo = React.useId();
  const idComentario = React.useId();

  const enviar = async (voto: 'util' | 'no_util') => {
    setEnviando(true);
    try {
      await chatApi.valorarRespuesta(jobId, voto === 'util' ? { voto } : { voto, motivo, comentario: comentario.trim() || null });
      setFase('gracias');
    } catch (e) {
      toast({ title: t('error'), description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setEnviando(false);
    }
  };

  if (fase === 'gracias') {
    return (
      <p role="status" className="flex items-center gap-1.5 text-xs text-fg-secondary">
        <Check aria-hidden="true" className="size-3.5 text-success-text" />
        {t('gracias')}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1">
        <span className="mr-1 text-xs text-fg-muted">{t('teSirvio')}</span>
        <button
          type="button"
          disabled={enviando}
          onClick={() => void enviar('util')}
          className={clasesBoton({ variante: 'fantasma', tamano: 'sm', className: 'px-2' })}
        >
          <ThumbsUp aria-hidden="true" className="size-3.5" />
          {t('si')}
        </button>
        <button
          type="button"
          disabled={enviando}
          aria-expanded={fase === 'motivo'}
          onClick={() => setFase('motivo')}
          className={clasesBoton({ variante: 'fantasma', tamano: 'sm', className: cn('px-2', fase === 'motivo' && 'bg-warning-subtle text-warning-text') })}
        >
          <ThumbsDown aria-hidden="true" className="size-3.5" />
          {t('no')}
        </button>
      </div>

      {fase === 'motivo' ? (
        <section aria-labelledby={idTitulo} className="space-y-3 rounded-xl border border-line bg-subtle p-3">
          <h4 id={idTitulo} className="text-sm font-semibold text-fg">
            {t('queFallo')}
          </h4>
          <ChipsOpcion<MotivoValoracion>
            aria-labelledby={idTitulo}
            opciones={MOTIVOS_VALORACION.map((m) => ({ valor: m, etiqueta: t(`motivos.${m}`) }))}
            valor={motivo}
            onValorChange={setMotivo}
          />
          <label htmlFor={idComentario} className="sr-only">
            {t('comentario')}
          </label>
          <textarea
            id={idComentario}
            value={comentario}
            maxLength={COMENTARIO_MAXIMO}
            onChange={(e) => setComentario(e.target.value)}
            placeholder={t('comentario')}
            rows={3}
            className="w-full resize-none rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={enviando}
              onClick={() => {
                setFase('pregunta');
                setMotivo(null);
                setComentario('');
              }}
              className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}
            >
              {t('cancelar')}
            </button>
            <button
              type="button"
              disabled={enviando || !motivo}
              aria-busy={enviando || undefined}
              title={!motivo ? t('eligeMotivo') : undefined}
              onClick={() => void enviar('no_util')}
              className={clasesBoton({ tamano: 'sm' })}
            >
              {t('enviar')}
            </button>
          </div>
          <p className="text-xs text-fg-muted">{t('ayuda')}</p>
        </section>
      ) : null}
    </div>
  );
}
