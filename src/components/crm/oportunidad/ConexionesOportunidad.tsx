'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Calendar, ClipboardList, Coins, FileText, MessageSquare, Receipt, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { pedirCrm } from '@/components/crm/acciones/apiCrm';
import { formatDateTimeInTz } from '@/lib/utils/dateDisplay';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { formatMoneda } from '@/lib/utils/moneda';
import type { OportunidadDetalleApi } from './apiOportunidades';
import { UUID_RE } from '@/lib/services/crm/crmErrors';

/**
 * «Conexiones» del detalle (Figma 775:473076; plan §4.6): cotización y
 * factura (`GET …/[id]/finance`, el `crmFinanceService` único), tareas
 * abiertas, próxima reunión (`GET …/[id]/meetings`, M3), renovación y
 * comisión (la devengada o, si no hay, la estimada con la tasa de la
 * oportunidad). Solo lectura; cada fila lleva a su módulo.
 */
interface Finanzas {
  quotations: { id?: string; number: string; status: string }[];
  invoices: { id?: string; number: string; status: string }[];
  commissions: { commission_amount: number; status: string }[];
}
interface Reunion {
  start_at: string;
  status?: string | null;
}

export interface VistaConexiones {
  cotizacion: { id?: string; numero: string; estado: string } | null;
  factura: { id?: string; numero: string; estado: string } | null;
  comision: { monto: number; estimada: boolean } | null;
  proximaReunion: string | null;
}

/** Pura (se prueba): lo más reciente de cada cosa y la comisión estimada si no hay devengada. */
export function vistaConexiones(f: Finanzas | null, reuniones: readonly Reunion[], op: Pick<OportunidadDetalleApi, 'amount' | 'commission_rate' | 'commission_type'>, ahora: Date): VistaConexiones {
  const q = f?.quotations?.[0];
  const i = f?.invoices?.[0];
  const devengada = (f?.commissions ?? []).filter((c) => c.status !== 'cancelled' && c.status !== 'rejected').reduce((s, c) => s + (Number(c.commission_amount) || 0), 0);
  const tasa = Number(op.commission_rate) || 0;
  const estimada = op.commission_type && op.commission_type !== 'none' && tasa > 0 ? ((Number(op.amount) || 0) * tasa) / 100 : 0;
  const futuras = reuniones.filter((r) => Date.parse(r.start_at) >= ahora.getTime()).sort((a, b) => a.start_at.localeCompare(b.start_at));
  return {
    cotizacion: q ? { ...(q.id ? { id: q.id } : {}), numero: q.number, estado: q.status } : null,
    factura: i ? { ...(i.id ? { id: i.id } : {}), numero: i.number, estado: i.status } : null,
    comision: devengada > 0 ? { monto: devengada, estimada: false } : estimada > 0 ? { monto: estimada, estimada: true } : null,
    proximaReunion: futuras[0]?.start_at ?? null,
  };
}

/** La referencia persistida dirige a la conversación propia; la pantalla vuelve a exigir acceso. */
export function enlaceConversacionOrigen(metadata: Record<string, unknown> | null | undefined): string | null {
  if (metadata?.origen !== 'conversacion') return null;
  const ref = metadata.origen_ref;
  if (!ref || typeof ref !== 'object' || !('tipo' in ref) || ref.tipo !== 'conversacion' || !('id' in ref) || typeof ref.id !== 'string' || !UUID_RE.test(ref.id)) return null;
  return `/app/chat/conversations/${ref.id}`;
}

export function ConexionesOportunidad({ op, tareasAbiertas, ahora = new Date() }: { op: OportunidadDetalleApi; tareasAbiertas: number | null; ahora?: Date }) {
  const t = useTranslations('crm.oportunidad.conexiones');
  const to = useTranslations('crm.origenOportunidad');
  const te = useTranslations('crm.accionesRapidas.errores');
  const { timezone } = useFormatDate();
  const moneda = useMonedaOrganizacion();
  const [finanzas, setFinanzas] = useState<Finanzas | null>(null);
  const [reuniones, setReuniones] = useState<Reunion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorLectura, setErrorLectura] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setErrorLectura(false);
    void Promise.all([
      pedirCrm<Finanzas>(`/api/crm/opportunities/${op.id}/finance`),
      pedirCrm<Reunion[]>(`/api/crm/opportunities/${op.id}/meetings`),
    ]).then(([f, r]) => {
      if (vivo) { setFinanzas(f.data); setReuniones(r.data ?? []); }
    }, () => { if (vivo) setErrorLectura(true); }).finally(() => { if (vivo) setCargando(false); });
    return () => {
      vivo = false;
    };
  }, [op.id, op.updated_at, revision]);
  const v = vistaConexiones(finanzas, reuniones, op, ahora);
  const renovacion = (op.billing_cycle_months ?? 0) > 0;
  const fila = (Icono: typeof FileText, etiqueta: React.ReactNode, valor: React.ReactNode) => (
    <li className="flex items-center gap-2 text-[13px]">
      <Icono aria-hidden="true" className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
      <span className="flex-1 text-fg">{etiqueta}</span>
      {valor}
    </li>
  );
  const etiquetaVinculada = (id: string | undefined, modulo: string, texto: string) => id && UUID_RE.test(id)
    ? <Link href={`/app/finanzas/${modulo}/${id}`} className="text-brand-deep hover:underline">{texto}</Link>
    : texto;
  const conversacion = enlaceConversacionOrigen(op.metadata);
  return (
    <section aria-labelledby="conexiones" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
      <h3 id="conexiones" className="text-sm font-semibold text-fg">{t('titulo')}</h3>
      {cargando ? <p role="status" className="text-[13px] text-fg-secondary">{to('cargando')}</p> : errorLectura ? (
        <><p role="alert" className="text-[13px] text-danger-text">{te('generico')}</p><button type="button" onClick={() => setRevision(x => x + 1)} className="text-left text-[13px] text-brand-deep hover:underline">{to('reintentar')}</button></>
      ) : <ul className="flex flex-col gap-2.5">
        {fila(FileText, v.cotizacion ? etiquetaVinculada(v.cotizacion.id, 'cotizaciones', t('cotizacion', { numero: v.cotizacion.numero })) : t('cotizacionSola'), <Badge tono={v.cotizacion ? 'informacion' : 'neutro'} tamano="sm">{v.cotizacion ? v.cotizacion.estado : t('sinCotizacion')}</Badge>)}
        {fila(Receipt, v.factura ? etiquetaVinculada(v.factura.id, 'facturas-venta', t('factura', { numero: v.factura.numero })) : t('facturaSola'), <Badge tono={v.factura ? 'exito' : 'neutro'} tamano="sm">{v.factura ? v.factura.estado : t('seCreaAlGanar')}</Badge>)}
        {conversacion && fila(MessageSquare, to('conversacion'), <Link href={conversacion} className="text-brand-deep hover:underline">{to('verOrigen')}</Link>)}
        {fila(ClipboardList, t('tareas'), <Badge tono={tareasAbiertas ? 'advertencia' : 'neutro'} tamano="sm">{tareasAbiertas === null ? '—' : t('abiertas', { n: tareasAbiertas })}</Badge>)}
        {fila(Calendar, t('reunion'), <Badge tono="neutro" tamano="sm">{v.proximaReunion ? formatDateTimeInTz(v.proximaReunion, timezone, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</Badge>)}
        {fila(RefreshCw, t('renovacion'), <Badge tono="neutro" tamano="sm">{renovacion ? t('cadaMeses', { n: op.billing_cycle_months ?? 0 }) : '—'}</Badge>)}
        {fila(Coins, t('comision'), <Badge tono="neutro" tamano="sm">{v.comision ? (v.comision.estimada ? t('estimada', { monto: formatMoneda(v.comision.monto, moneda.paraDocumento(op.currency)) }) : formatMoneda(v.comision.monto, moneda.paraDocumento(op.currency))) : '—'}</Badge>)}
      </ul>}
    </section>
  );
}
