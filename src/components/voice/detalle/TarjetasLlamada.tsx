'use client';

/**
 * Tarjetas del detalle de una llamada que no dependen del análisis IA:
 * «Grabación» (Figma 1363:20 / 1365:800947 / 1365:801445), «Notas del
 * vendedor» (1365:801445) y «Vinculada a» (1363:20, con la sugerencia de etapa).
 */

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Briefcase, ChevronRight, Loader2, MicOff, Sparkles, User } from 'lucide-react';
import { Tarjeta } from '@/components/kit/Tarjeta';
import { AvisoTonal } from '@/components/kit/AvisoTonal';
import { clasesBoton } from '@/components/kit/botonClases';
import { Badge } from '@/components/ui/badge';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { formatearEn } from '@/components/crm/kit/monedaCrm';
import { CallPlayer } from '../CallPlayer';
import { CallLinkPanel } from '../CallLinkPanel';
import { nombreCliente, nombrePerfil, notaVendedor, numeroContraparteDetalle, type EstadoGrabacion, type LlamadaDetalle } from './llamadaDetalleLogica';

const CLASE_FILA_ENLACE =
  'flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-3 transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';

// ─── Grabación ───────────────────────────────────────────────────────────────

interface TarjetaGrabacionProps {
  llamada: LlamadaDetalle;
  estado: EstadoGrabacion;
  seekToMs: number | null;
  onTiempo: (ms: number) => void;
  consentMethod: string | null;
  /** Móvil (Figma 1368:17): solo el reproductor, sin título. */
  compacta?: boolean;
}

export function TarjetaGrabacion({ llamada, estado, seekToMs, onTiempo, consentMethod, compacta }: TarjetaGrabacionProps) {
  const t = useTranslations('crm.llamadas.detalle.grabacion');
  const { formatPlain } = useFormatDate();

  const contenido =
    estado.tipo === 'lista' ? (
      <CallPlayer
        callId={llamada.id}
        recordingEnabled
        variant="onda"
        grabacionId={estado.grabacion.id}
        duracionMs={(estado.grabacion.duration_seconds ?? llamada.duration_seconds ?? 0) * 1000}
        consentMethod={consentMethod}
        seekToMs={seekToMs}
        onTimeUpdate={onTiempo}
        barras={compacta ? 28 : 48}
      />
    ) : (
      <div className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-3" role={estado.tipo === 'procesando' ? 'status' : undefined}>
        <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-subtle text-fg-muted">
          {estado.tipo === 'procesando' ? <Loader2 className="size-4 animate-spin" /> : <MicOff className="size-4" />}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-fg">{estado.tipo === 'procesando' ? t('procesando') : t('sinGrabacion')}</p>
          <p className="text-xs text-fg-secondary">
            {estado.tipo === 'procesando'
              ? t('procesandoDetalle', { proveedor: nombreProveedor(llamada.provider) })
              : estado.motivo === 'vencida'
                ? estado.eliminadaEl
                  ? t('vencida', { fecha: formatPlain(estado.eliminadaEl) })
                  : t('vencidaSinFecha')
                : estado.motivo === 'fallida'
                  ? t('fallida')
                  : t('apagada')}
          </p>
        </div>
      </div>
    );

  if (compacta) return contenido;

  return (
    <Tarjeta
      titulo={t('titulo')}
      accion={
        estado.tipo === 'lista' && estado.conservaHasta ? (
          <Badge tono="neutro" apariencia="suave" tamano="sm">
            {t('conservaHasta', { fecha: formatPlain(estado.conservaHasta) })}
          </Badge>
        ) : undefined
      }
    >
      {contenido}
    </Tarjeta>
  );
}

function nombreProveedor(p: string | null | undefined): string {
  if (!p) return '—';
  return p.charAt(0).toUpperCase() + p.slice(1);
}

// ─── Notas del vendedor ──────────────────────────────────────────────────────

export function TarjetaNotas({ llamada, estado }: { llamada: LlamadaDetalle; estado: EstadoGrabacion }) {
  const t = useTranslations('crm.llamadas.detalle.notas');
  const { formatTime } = useFormatDate();
  const nota = notaVendedor(llamada.metadata);
  const autor = nombrePerfil(llamada.disposition_user) ?? nombrePerfil(llamada.user);
  const motivo = estado.tipo === 'sin' ? estado.motivo : null;
  const pie = [autor, nota.en ? formatTime(nota.en) : null].filter(Boolean).join(' · ');
  return (
    <Tarjeta titulo={t('titulo')} accion={pie ? <span className="text-xs text-fg-secondary">{pie}</span> : undefined}>
      <div className="flex flex-col gap-3">
        {motivo && <AvisoTonal tono="informacion" compacto titulo={t(`motivo.${motivo}`)} />}
        {nota.texto ? <p className="whitespace-pre-wrap text-sm text-fg">{nota.texto}</p> : <p className="text-sm text-fg-muted">{t('sinNotas')}</p>}
      </div>
    </Tarjeta>
  );
}

// ─── Vinculada a ─────────────────────────────────────────────────────────────

interface SugerenciaEtapa {
  etapa: string;
  confianza: number;
  aplicando: boolean;
  aplicada: boolean;
  onAplicar: () => void;
}

interface TarjetaVinculadaProps {
  llamada: LlamadaDetalle;
  sugerencia: SugerenciaEtapa | null;
  onVinculada: () => void;
}

export function TarjetaVinculada({ llamada, sugerencia, onVinculada }: TarjetaVinculadaProps) {
  const t = useTranslations('crm.llamadas.detalle.vinculada');
  const { formatDate, toDate, getToday } = useFormatDate();
  const moneda = useMonedaOrganizacion();
  const cliente = nombreCliente(llamada.customer);
  const opp = llamada.opportunity;
  const ultima = llamada.customer_calls?.last_started_at ?? null;
  const ultimaTexto = ultima ? (toDate(new Date(ultima)) === getToday() ? t('hoy') : formatDate(ultima)) : null;
  const faltaAlgo = !llamada.customer_id || !llamada.opportunity_id;

  return (
    <Tarjeta titulo={t('titulo')}>
      <div className="flex flex-col gap-2">
        {opp && (
          <Link href={`/app/crm/oportunidades/${encodeURIComponent(opp.id)}`} className={CLASE_FILA_ENLACE}>
            <Briefcase aria-hidden="true" className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-fg">
                {opp.amount !== null ? `${opp.name} · ${formatearEn(opp.amount, opp.currency ?? moneda.code, moneda)}` : opp.name}
              </span>
              <span className="block truncate text-xs text-fg-secondary">{opp.stage_name ? t('oportunidadEtapa', { etapa: opp.stage_name }) : t('oportunidad')}</span>
            </span>
            <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-fg-muted" />
          </Link>
        )}
        {llamada.customer && (
          <Link href={`/app/crm/clientes/${encodeURIComponent(llamada.customer.id)}`} className={CLASE_FILA_ENLACE}>
            <User aria-hidden="true" className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-fg">{cliente ?? numeroContraparteDetalle(llamada)}</span>
              <span className="block truncate text-xs text-fg-secondary">
                {llamada.customer_calls
                  ? ultimaTexto
                    ? t('clienteLlamadas', { n: llamada.customer_calls.count, ultima: ultimaTexto })
                    : t('clienteLlamadasSinUltima', { n: llamada.customer_calls.count })
                  : t('cliente')}
              </span>
            </span>
            <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-fg-muted" />
          </Link>
        )}
        {faltaAlgo && (
          <CallLinkPanel
            callId={llamada.id}
            customerId={llamada.customer_id}
            opportunityId={llamada.opportunity_id}
            phoneNumber={numeroContraparteDetalle(llamada)}
            customerName={cliente}
            onLinked={onVinculada}
          />
        )}
        {sugerencia && !sugerencia.aplicada && (
          <div className="flex items-center gap-3 rounded-lg bg-brand-tint px-3 py-2.5">
            <Sparkles aria-hidden="true" className="size-4 shrink-0 text-brand" strokeWidth={1.5} />
            <p className="min-w-0 flex-1 text-[13px] leading-[18px] text-fg">{t('sugerencia', { etapa: sugerencia.etapa, confianza: sugerencia.confianza })}</p>
            <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} disabled={sugerencia.aplicando} onClick={sugerencia.onAplicar}>
              {sugerencia.aplicando && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
              {t('aplicar')}
            </button>
          </div>
        )}
        {sugerencia?.aplicada && (
          <p className="flex items-center gap-2 text-xs text-success-text">
            <Sparkles aria-hidden="true" className="size-3.5" /> {t('sugerenciaAplicada', { etapa: sugerencia.etapa })}
          </p>
        )}
      </div>
    </Tarjeta>
  );
}
