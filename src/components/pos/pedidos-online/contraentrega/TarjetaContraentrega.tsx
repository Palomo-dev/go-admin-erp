'use client';

/**
 * Detalle de un pedido contraentrega (Figma 3014:194407 › 05 y 06):
 * - `AvisoAnticipoPendiente`: aviso arriba del pedido mientras el anticipo está pendiente.
 * - `TarjetaContraentrega`: tarjeta «Pago contra entrega» con sus cuatro estados (sin anticipo,
 *   pendiente, pagado y vencido), «Enviar enlace de pago por WhatsApp» y «Marcar anticipo
 *   recibido…».
 * - `TotalesContraentrega`: bajo el total, el anticipo pagado y lo que se cobra al entregar.
 * - `CobraAlEntregarFila`: la tarjeta Entrega repite lo que cobra el domiciliario.
 * Las horas van en la zona de la organización; los montos, en su moneda. Sin contraentrega no
 * pinta nada: el detalle queda exactamente como antes.
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Banknote, Clock, DollarSign } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AvisoTonal, FilaDato, StatusBadge, clasesBoton, type TonoBadge } from '@/components/kit';
import { useToast } from '@/components/ui/use-toast';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { formatDateTimeInTz, formatTimeInTz } from '@/lib/utils/dateDisplay';
import { supabase } from '@/lib/supabase/config';
import { metodoDePago } from '@/lib/pos/pedidosWeb/metodoDePago';
import {
  cobrarAlEntregar,
  esPedidoContraentrega,
  estadoAnticipo,
  minutosParaVencer,
  type EstadoAnticipo,
} from '@/lib/pos/pedidosWeb/contraentregaPedido';
import { condicionesDeSede, CONDICIONES_POR_DEFECTO, type MedioAlRecibir } from '@/lib/contraentrega/reglaContraentrega';
import { enlacePagoPedido, enlaceWhatsApp } from '@/lib/services/contraentregaPedidoService';
import type { WebOrder } from '@/lib/services/webOrdersService';
import type { PagoPresentable } from '@/lib/pos/pedidosWeb/pagosDelPedido';
import { DialogoMarcarAnticipo } from './DialogoMarcarAnticipo';

type PedidoDetalle = WebOrder & { stock_released_at?: string | null };

const TONO_ESTADO: Record<EstadoAnticipo, TonoBadge> = {
  sin_anticipo: 'neutro',
  pendiente: 'advertencia',
  pagado: 'exito',
  vencido: 'peligro',
};

/** El anticipo es «el envío» si coincide con el domicilio cobrado. */
function anticipoEsElEnvio(o: PedidoDetalle): boolean {
  const a = Number(o.advance_amount) || 0;
  const envio = Number(o.delivery_fee) || 0;
  return a > 0 && Math.abs(a - envio) < 0.5;
}

/** Medios al recibir que la sede configuró (Sitio web › Ventas en línea › Condiciones). */
function useMediosAlRecibir(organizationId: number, branchId: number): MedioAlRecibir[] {
  const [medios, setMedios] = useState<MedioAlRecibir[]>([...CONDICIONES_POR_DEFECTO.medios]);
  useEffect(() => {
    let vivo = true;
    void supabase
      .from('organization_payment_methods')
      .select('settings')
      .eq('organization_id', organizationId)
      .eq('payment_method_code', 'cash')
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        const c = condicionesDeSede((data as { settings?: unknown } | null)?.settings ?? null, branchId);
        if (vivo && c) setMedios(c.medios);
      });
    return () => {
      vivo = false;
    };
  }, [organizationId, branchId]);
  return medios;
}

/** Hora actual que se renueva cada `cadaMs` (el «faltan N min» se actualiza solo). */
export function useAhora(cadaMs = 30_000): Date {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), cadaMs);
    return () => clearInterval(id);
  }, [cadaMs]);
  return ahora;
}

export function AvisoAnticipoPendiente({ order, timezone }: { order: PedidoDetalle; timezone: string }) {
  const t = useTranslations('contraentregaPedidos');
  const { formatear } = useMonedaOrganizacion();
  const ahora = useAhora();
  if (!esPedidoContraentrega(order) || estadoAnticipo(order) !== 'pendiente' || order.status !== 'pending' || !order.advance_due_at) return null;
  return (
    <AvisoTonal
      tono="advertencia"
      icono={Clock}
      titulo={t('detalle.aviso', {
        monto: formatear(Number(order.advance_amount) || 0),
        hora: formatTimeInTz(order.advance_due_at, timezone),
        min: minutosParaVencer(order.advance_due_at, ahora) ?? 0,
      })}
    />
  );
}

/**
 * Pago del anticipo entre los pagos del pedido (`payments` source 'web_order'): el de la referencia
 * del anticipo o, si no la trae, el único completado por ese monto. Puro.
 */
export function pagoDelAnticipo(
  order: Pick<PedidoDetalle, 'advance_amount' | 'advance_reference'>,
  pagos: readonly Pick<PagoPresentable, 'referencia' | 'monto' | 'estado' | 'fecha'>[],
): Pick<PagoPresentable, 'referencia' | 'monto' | 'estado' | 'fecha'> | null {
  const ref = (order.advance_reference ?? '').trim();
  if (ref) {
    const porRef = pagos.find((p) => (p.referencia ?? '').trim() === ref);
    if (porRef) return porRef;
  }
  const monto = Number(order.advance_amount) || 0;
  const porMonto = pagos.filter((p) => p.estado === 'completed' && Math.abs(p.monto - monto) < 0.5);
  return porMonto.length === 1 ? porMonto[0] : null;
}

/** Chip de la cabecera del pedido (Figma 3014:194407 › 05): «Contraentrega · anticipo pagado». */
export function ChipContraentrega({ order, className }: { order: PedidoDetalle; className?: string }) {
  const t = useTranslations('contraentregaPedidos');
  if (!esPedidoContraentrega(order)) return null;
  const estado = estadoAnticipo(order);
  return (
    <Badge tono={estado === 'vencido' ? 'peligro' : 'advertencia'} apariencia="contorno" icono={Banknote} className={className}>
      {estado === 'sin_anticipo' ? t('lista.insignia') : t(`detalle.chip.${estado}`)}
    </Badge>
  );
}

export function TarjetaContraentrega({
  order,
  timezone,
  onCambio,
  pagos = [],
  onVerAnticipo,
  onRegistrarCobro,
}: {
  order: PedidoDetalle;
  timezone: string;
  onCambio: () => void;
  /** Pagos del pedido (tarjeta «Pagos»): de ahí sale la fecha del anticipo pagado. */
  pagos?: readonly PagoPresentable[];
  /** «Ver el anticipo» (estado pagado): lleva al pago en la tarjeta «Pagos». */
  onVerAnticipo?: () => void;
  /** «Registrar cobro» (sin anticipo): el cobro en caja de siempre, si el pedido ya se puede cobrar. */
  onRegistrarCobro?: () => void;
}) {
  const t = useTranslations('contraentregaPedidos');
  const { formatear } = useMonedaOrganizacion();
  const { toast } = useToast();
  const ahora = useAhora();
  const medios = useMediosAlRecibir(order.organization_id, order.branch_id);
  const [marcarAbierto, setMarcarAbierto] = useState(false);
  const [abriendo, setAbriendo] = useState(false);

  if (!esPedidoContraentrega(order)) return null;
  const estado = estadoAnticipo(order);
  const anticipo = Number(order.advance_amount) || 0;
  const alEntregar = cobrarAlEntregar(order);
  const pasarela = order.advance_gateway ? metodoDePago({ payment_method: order.advance_gateway }) : null;
  const etiquetaAnticipo = anticipoEsElEnvio(order) ? t('detalle.anticipoEnvio') : t('detalle.anticipo');
  const textoMedios = medios.map((m) => t(`medios.${m}`)).join(', ');
  const hora = (iso?: string | null) => (iso ? formatTimeInTz(iso, timezone) : '—');
  const fechaAnticipo = estado === 'pagado' ? pagoDelAnticipo(order, pagos)?.fecha ?? null : null;

  const enviarEnlace = async () => {
    setAbriendo(true);
    try {
      const url = await enlacePagoPedido(order.id);
      const texto = t('detalle.mensajeWhatsApp', {
        numero: order.order_number,
        monto: formatear(anticipo),
        hora: hora(order.advance_due_at),
        url: url ?? '',
      });
      const wa = enlaceWhatsApp(order.customer_phone, texto);
      if (!wa) {
        toast({ title: t('detalle.sinTelefono'), variant: 'destructive' });
        return;
      }
      window.open(wa, '_blank', 'noopener,noreferrer');
    } finally {
      setAbriendo(false);
    }
  };

  const escribir = () => {
    const wa = enlaceWhatsApp(order.customer_phone, t('detalle.mensajeVencido', { numero: order.order_number }));
    if (wa) window.open(wa, '_blank', 'noopener,noreferrer');
    else toast({ title: t('detalle.sinTelefono'), variant: 'destructive' });
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand">
            <Banknote className="size-4" strokeWidth={1.5} />
          </span>
          <span className="flex-1">{t('detalle.titulo')}</span>
          <StatusBadge estado={`anticipo_${estado}`} etiqueta={t(`estados.${estado}`)} tono={TONO_ESTADO[estado]} tamano="sm" />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {estado === 'sin_anticipo' && (
          <>
            <FilaDato etiqueta={t('detalle.cobrarAlEntregar')} valor={<span className="font-semibold text-warning-text">{formatear(alEntregar)}</span>} />
            <FilaDato etiqueta={t('detalle.medios')} valor={textoMedios} />
            <p className="pt-1 text-xs text-fg-secondary">{t('detalle.notaSinAnticipo')}</p>
            {onRegistrarCobro && (
              <div className="pt-2">
                <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'md', anchoCompleto: true })} onClick={onRegistrarCobro}>
                  {t('detalle.registrarCobro')}
                </button>
              </div>
            )}
          </>
        )}
        {estado === 'pendiente' && (
          <>
            <FilaDato etiqueta={etiquetaAnticipo} valor={formatear(anticipo)} />
            {pasarela && <FilaDato etiqueta={t('detalle.seCobraCon')} valor={pasarela} />}
            {order.advance_due_at && (
              <FilaDato
                etiqueta={t('detalle.vence')}
                valor={
                  <span className="text-warning-text">
                    {t('detalle.venceValor', { hora: hora(order.advance_due_at), min: minutosParaVencer(order.advance_due_at, ahora) ?? 0 })}
                  </span>
                }
              />
            )}
            <FilaDato etiqueta={t('detalle.alEntregar')} valor={formatear(Math.max(0, alEntregar - anticipo))} />
            <p className="pt-1 text-xs text-fg-secondary">{t('detalle.notaPendiente')}</p>
            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                className={clasesBoton({ variante: 'secundario', tamano: 'md', anchoCompleto: true })}
                onClick={() => void enviarEnlace()}
                disabled={abriendo || order.status !== 'pending'}
              >
                {t('detalle.enviarEnlace')}
              </button>
              <button
                type="button"
                className={clasesBoton({ variante: 'fantasma', tamano: 'md', anchoCompleto: true })}
                onClick={() => setMarcarAbierto(true)}
                disabled={order.status !== 'pending'}
              >
                {t('detalle.marcarRecibido')}
              </button>
            </div>
          </>
        )}
        {estado === 'pagado' && (
          <>
            <FilaDato etiqueta={etiquetaAnticipo} valor={[formatear(anticipo), pasarela].filter(Boolean).join(' · ')} />
            {order.advance_reference && <FilaDato etiqueta={t('detalle.referencia')} valor={order.advance_reference} />}
            {fechaAnticipo && <FilaDato etiqueta={t('detalle.fecha')} valor={formatDateTimeInTz(fechaAnticipo, timezone)} />}
            <FilaDato etiqueta={t('detalle.cobrarAlEntregar')} valor={<span className="font-semibold text-warning-text">{formatear(alEntregar)}</span>} />
            <FilaDato etiqueta={t('detalle.medios')} valor={textoMedios} />
            <p className="pt-1 text-xs text-fg-secondary">{t('detalle.notaPagado', { monto: formatear(alEntregar) })}</p>
            {onVerAnticipo && (
              <div className="pt-2">
                <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'md', anchoCompleto: true })} onClick={onVerAnticipo}>
                  <DollarSign aria-hidden="true" className="size-4" strokeWidth={1.5} />
                  {t('detalle.verAnticipo')}
                </button>
              </div>
            )}
          </>
        )}
        {estado === 'vencido' && (
          <>
            <FilaDato etiqueta={t('detalle.estadoPedido')} valor={<span className="text-danger-text">{t('detalle.canceladoSinCobro')}</span>} />
            <FilaDato etiqueta={t('detalle.vencio')} valor={hora(order.advance_due_at ?? order.cancelled_at)} />
            {order.stock_released_at && <FilaDato etiqueta={t('detalle.stock')} valor={t('detalle.stockLiberado', { hora: hora(order.stock_released_at) })} />}
            <p className="pt-1 text-xs text-fg-secondary">{t('detalle.notaVencido')}</p>
            <div className="pt-2">
              <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'md', anchoCompleto: true })} onClick={escribir}>
                {t('detalle.escribirCliente')}
              </button>
            </div>
          </>
        )}
      </CardContent>
      <DialogoMarcarAnticipo
        abierto={marcarAbierto}
        onAbiertoChange={setMarcarAbierto}
        orderId={order.id}
        monto={formatear(anticipo)}
        onHecho={(ok, mensaje) => {
          toast(ok ? { title: mensaje } : { title: mensaje, variant: 'destructive' });
          if (ok) onCambio();
        }}
      />
    </Card>
  );
}

export function TotalesContraentrega({ order }: { order: PedidoDetalle }) {
  const t = useTranslations('contraentregaPedidos');
  const { formatear } = useMonedaOrganizacion();
  if (!esPedidoContraentrega(order) || order.payment_status === 'paid') return null;
  const estado = estadoAnticipo(order);
  const anticipo = Number(order.advance_amount) || 0;
  if (estado === 'vencido') return null;
  return (
    <div className="mt-1.5 space-y-1.5 text-[13px]">
      {estado === 'pagado' && (
        <div className="flex justify-between">
          <span className="text-fg-secondary">{anticipoEsElEnvio(order) ? t('totales.anticipoPagadoEnvio') : t('totales.anticipoPagado')}</span>
          <span className="tabular-nums text-success-text">−{formatear(anticipo)}</span>
        </div>
      )}
      {estado === 'pendiente' && (
        <div className="flex justify-between">
          <span className="text-warning-text">{t('totales.anticipoPendiente')}</span>
          <span className="tabular-nums text-warning-text">{formatear(anticipo)}</span>
        </div>
      )}
      <div className="flex justify-between font-medium">
        <span className="text-fg">{t('totales.porCobrar')}</span>
        <span className="tabular-nums text-warning-text">{formatear(estado === 'pendiente' ? Math.max(0, cobrarAlEntregar(order) - anticipo) : cobrarAlEntregar(order))}</span>
      </div>
    </div>
  );
}

export function CobraAlEntregarFila({ order }: { order: PedidoDetalle }) {
  const t = useTranslations('contraentregaPedidos');
  const { formatear } = useMonedaOrganizacion();
  if (!esPedidoContraentrega(order) || order.payment_status === 'paid' || estadoAnticipo(order) === 'vencido') return null;
  const valor = estadoAnticipo(order) === 'pendiente'
    ? Math.max(0, cobrarAlEntregar(order) - (Number(order.advance_amount) || 0))
    : cobrarAlEntregar(order);
  return (
    <div className="space-y-1 border-t border-line pt-2">
      <FilaDato etiqueta={t('detalle.cobraAlEntregar')} valor={<span className="font-semibold text-warning-text">{formatear(valor)}</span>} />
      <p className="text-xs text-fg-secondary">{t('detalle.notaEntrega', { monto: formatear(valor) })}</p>
    </div>
  );
}
