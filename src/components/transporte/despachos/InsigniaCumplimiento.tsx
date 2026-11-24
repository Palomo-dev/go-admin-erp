'use client';

/**
 * InsigniaCumplimiento (Figma «23 Transporte» › 23, 2896:12415): Al día · Vence pronto ·
 * Bloqueado · Excepción autorizada · Despachado. Debajo, la causa principal (la primera que
 * bloquea o el documento que vence primero).
 */
import { useTranslations } from 'next-intl';
import { StatusBadge } from '@/components/kit';
import type { Cumplimiento, EstadoDespacho } from '@/lib/transporte/despachos';

const TONO: Record<EstadoDespacho | 'vence', 'exito' | 'advertencia' | 'peligro' | 'marca' | 'neutro'> = {
  listo: 'exito',
  vence: 'advertencia',
  bloqueado: 'peligro',
  excepcion: 'advertencia',
  despachado: 'marca',
  cancelado: 'neutro',
};

export function InsigniaCumplimiento({ estado, cumplimiento, conDetalle = true }: { estado: EstadoDespacho; cumplimiento?: Cumplimiento | null; conDetalle?: boolean }) {
  const t = useTranslations('transporte.despachos');
  const aviso = estado === 'listo' && cumplimiento?.avisos.length ? [...cumplimiento.avisos].sort((a, b) => a.dias - b.dias)[0] : null;
  const clave = aviso ? 'vence' : estado;
  const bloqueo = estado === 'bloqueado' ? cumplimiento?.bloqueos[0] : null;
  const detalle = bloqueo
    ? t(`causas.${bloqueo.causa}`) + (cumplimiento && cumplimiento.bloqueos.length > 1 ? ` +${cumplimiento.bloqueos.length - 1}` : '')
    : aviso
      ? t('venceEn', { documento: t(`causas.${aviso.causa}`), dias: aviso.dias })
      : null;
  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <StatusBadge estado={clave} tono={TONO[clave]} etiqueta={t(`cumplimiento.${clave}`)} />
      {conDetalle && detalle && <span className="max-w-[200px] truncate text-xs text-fg-muted">{detalle}</span>}
    </div>
  );
}
