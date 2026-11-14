'use client';

/**
 * Detalle de un trabajo de IA en hoja lateral (Figma 91-chat-35): qué pasó si
 * falló, información (modelo, canal, tokens, créditos), respuesta y bitácora.
 * Reintentar y Cancelar usan `aiJobsService`; no cobran ni devuelven créditos
 * desde aquí (eso es de `chargeAiCredits` en el servidor).
 */
import Link from 'next/link';
import { HojaDetalle } from '@/components/kit/HojaDetalle';
import { useTranslations } from 'next-intl';
import { RefreshCw, ThumbsDown, ThumbsUp, XCircle } from 'lucide-react';
import { AvisoTonal, FilaDato, ListaDatos, Tarjeta, clasesBoton } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import type { AIJob } from '@/lib/services/aiJobsService';
import { creditosCobrados, estadoTrabajo, puedeCancelar, puedeReintentar, tonoEstadoTrabajo } from './trabajosLogica';
import { esMotivo, votoDeFeedback } from '@/lib/services/chat/valoracionIa';

export interface HojaTrabajoProps {
  trabajo: AIJob | null;
  bitacora: string[];
  /** Nombre de quien votó (👍/👎), a partir de su miembro. */
  nombrePersona?: (memberId: number) => string | null;
  ocupado: boolean;
  onCerrar: () => void;
  onReintentar: (j: AIJob) => void;
  onCancelar: (j: AIJob) => void;
}

export function HojaTrabajo({ trabajo, bitacora, nombrePersona, ocupado, onCerrar, onReintentar, onCancelar }: HojaTrabajoProps) {
  const t = useTranslations('chatModulo.ia.trabajos');
  const tv = useTranslations('chatBandejaPendientes.valoracion');
  const { formatDateTime } = useFormatDate();
  if (!trabajo) return null;
  const tipo = t.has(`tipos.${trabajo.job_type}`) ? t(`tipos.${trabajo.job_type}`) : trabajo.job_type;
  const estado = estadoTrabajo(trabajo.status);
  const etiquetaEstado = t.has(`estados.${estado}`) ? t(`estados.${estado}`) : estado;
  const cliente = trabajo.conversation?.customer?.full_name || t('sinCliente');
  const creditos = creditosCobrados(trabajo);
  const modelo = typeof trabajo.metadata?.model === 'string' ? trabajo.metadata.model : t('detalle.modeloConfig');
  const tokens = (trabajo.prompt_tokens ?? 0) + (trabajo.completion_tokens ?? 0);

  return (
    <HojaDetalle
      abierto={!!trabajo}
      onAbiertoChange={(a) => !a && onCerrar()}
      titulo={`${tipo} · ${etiquetaEstado.toLowerCase()}`}
      subtitulo={`${cliente} · ${formatDateTime(trabajo.created_at)}`}
      insignia={
        <Badge tono={tonoEstadoTrabajo(trabajo.status)} tamano="sm">
          {etiquetaEstado}
        </Badge>
      }
      ocupado={ocupado}
      pie={
        <>
          {puedeCancelar(trabajo) && (
            <button type="button" onClick={() => onCancelar(trabajo)} disabled={ocupado} className={clasesBoton({ variante: 'secundario' })}>
              <XCircle aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('detalle.cancelar')}
            </button>
          )}
          {trabajo.conversation_id && (
            <Link href={`/app/chat/conversaciones/${trabajo.conversation_id}`} className={clasesBoton({ variante: 'secundario' })}>
              {t('detalle.abrirConversacion')}
            </Link>
          )}
          {puedeReintentar(trabajo) && (
            <button type="button" onClick={() => onReintentar(trabajo)} disabled={ocupado} className={clasesBoton()}>
              <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('detalle.reintentar')}
            </button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {(trabajo.error_message || trabajo.error_code) && (
          <AvisoTonal tono="peligro" titulo={t('detalle.quePaso')} descripcion={[trabajo.error_code, trabajo.error_message].filter(Boolean).join(' · ')} />
        )}
        <Tarjeta titulo={t('detalle.informacion')}>
          <ListaDatos>
            <FilaDato etiqueta={t('detalle.modelo')} valor={modelo} />
            <FilaDato etiqueta={t('detalle.canal')} valor={trabajo.conversation?.channel?.name ?? '—'} />
            <FilaDato etiqueta={t('detalle.tokens')} valor={tokens ? tokens.toLocaleString() : '—'} />
            {trabajo.confidence_score !== null && <FilaDato etiqueta={t('detalle.confianza')} valor={trabajo.confidence_score.toFixed(2)} />}
            {trabajo.fragments_used && trabajo.fragments_used.length > 0 && <FilaDato etiqueta={t('detalle.fragmentos')} valor={trabajo.fragments_used.length} />}
            <FilaDato etiqueta={t('detalle.creditos')} valor={creditos === null ? '—' : creditos.toLocaleString()} />
          </ListaDatos>
        </Tarjeta>
        {trabajo.response_text && (
          <Tarjeta titulo={t('detalle.respuesta')}>
            <p className="whitespace-pre-wrap text-sm text-fg">{trabajo.response_text}</p>
          </Tarjeta>
        )}
        {trabajo.valoraciones && trabajo.valoraciones.length > 0 && (
          <Tarjeta titulo={tv('trabajos.detalleTitulo')}>
            <ul className="flex flex-col gap-3">
              {trabajo.valoraciones.map((v, i) => {
                const voto = votoDeFeedback(v.feedback_type);
                const persona = v.feedback_by_member_id != null ? nombrePersona?.(v.feedback_by_member_id) : null;
                return (
                  <li key={`${v.feedback_by_member_id ?? 'x'}-${i}`} className="flex flex-col gap-1 border-b border-line pb-3 last:border-0 last:pb-0">
                    <p className="flex items-center gap-1.5 text-sm font-medium text-fg">
                      {voto === 'util' ? (
                        <ThumbsUp aria-hidden="true" className="size-4 text-success-text" />
                      ) : (
                        <ThumbsDown aria-hidden="true" className="size-4 text-danger-text" />
                      )}
                      {voto === 'util' ? tv('trabajos.util') : tv('trabajos.noUtil')}
                      {esMotivo(v.motivo) ? <span className="font-normal text-fg-secondary">· {tv(`motivos.${v.motivo}`)}</span> : null}
                    </p>
                    {v.notes ? <p className="whitespace-pre-wrap text-sm text-fg-secondary">{v.notes}</p> : null}
                    <p className="text-xs text-fg-muted">{[persona, v.created_at ? formatDateTime(v.created_at) : null].filter(Boolean).join(' · ')}</p>
                  </li>
                );
              })}
            </ul>
          </Tarjeta>
        )}
        {bitacora.length > 0 && (
          <Tarjeta titulo={t('detalle.bitacora')}>
            <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded-lg bg-subtle p-3 font-mono text-xs text-fg-secondary">{bitacora.join('\n')}</pre>
          </Tarjeta>
        )}
      </div>
    </HojaDetalle>
  );
}
