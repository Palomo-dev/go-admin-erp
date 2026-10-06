'use client';

/**
 * Tabla del listado de Pedidos online (Figma 447:195914): pedido con hora y
 * origen, cliente, estado, entrega, «A tiempo» contra lo prometido, pago,
 * total y las acciones rápidas del paso siguiente. En móvil, tarjetas.
 */
import { useTranslations } from 'next-intl';
import { Check, ChefHat, CircleCheck, Eye, Package, Printer, Truck, XCircle, type LucideIcon } from 'lucide-react';
import { DataTable, ListCard, StatusBadge, type AccionFila, type ColumnaTabla, type ContextoTarjeta, type EstadoTabla, type TonoBadge } from '@/components/kit';
import { cn } from '@/utils/Utils';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { formatTimeInTz } from '@/lib/utils/dateDisplay';
import { esDomicilio, mesaCortaDelPedido, tipoEntregaEfectivo, zonaDelPedido } from '@/lib/pos/pedidosWeb/tipoEntrega';
import { origenDelPedido, promesaDelPedido, type TonoPromesa } from '@/lib/pos/pedidosWeb/listadoPedidos';
import type { WebOrder, WebOrderStatus } from '@/lib/services/webOrdersService';

export const TONO_ESTADO_PEDIDO: Record<WebOrderStatus, TonoBadge> = {
  pending: 'advertencia',
  confirmed: 'informacion',
  preparing: 'advertencia',
  ready: 'exito',
  in_delivery: 'informacion',
  delivered: 'exito',
  cancelled: 'peligro',
  rejected: 'neutro',
  expired: 'neutro',
};

const TONO_PAGO: Record<string, TonoBadge> = {
  pending: 'advertencia',
  paid: 'exito',
  partial: 'advertencia',
  refunded: 'neutro',
  failed: 'peligro',
};

const COLOR_PROMESA: Record<TonoPromesa, string> = {
  exito: 'text-success-text',
  peligro: 'text-danger-text',
  advertencia: 'text-warning-text',
  neutro: 'text-fg-secondary',
};

const METODOS: Record<string, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  bank_transfer: 'Transferencia',
  wompi: 'Wompi',
  wompi_co: 'Wompi',
  nequi: 'Nequi',
  daviplata: 'Daviplata',
  pse: 'PSE',
  card: 'Tarjeta',
  cash_on_delivery: 'Contra entrega',
  mp_checkout: 'MercadoPago',
  stripe_payments: 'Stripe',
  payu_co: 'PayU',
  paypal_checkout: 'PayPal',
  bancolombia_transfer: 'Bancolombia',
  bancolombia_collect: 'Bancolombia Collect',
};

/** «Wompi · Nequi»: método y, si lo hay, el medio dentro de la pasarela. */
export function metodoDePago(o: Pick<WebOrder, 'payment_method' | 'payment_method_detail'>): string {
  const m = o.payment_method ? METODOS[o.payment_method] ?? o.payment_method : null;
  const d = o.payment_method_detail ? METODOS[o.payment_method_detail] ?? o.payment_method_detail : null;
  return [m, d && d !== m ? d : null].filter(Boolean).join(' · ') || '—';
}

/** Paso siguiente del pedido como acción rápida (icono) de la fila. */
export interface PasoSiguiente {
  id: 'confirmar' | 'preparar' | 'listo' | 'enviar' | 'entregado';
  icono: LucideIcon;
  estado?: WebOrderStatus;
}

export function pasoSiguiente(o: WebOrder): PasoSiguiente | null {
  switch (o.status) {
    case 'pending':
      return { id: 'confirmar', icono: CircleCheck };
    case 'confirmed':
      return { id: 'preparar', icono: ChefHat, estado: 'preparing' };
    case 'preparing':
      return { id: 'listo', icono: Package, estado: 'ready' };
    case 'ready':
      return esDomicilio(o.delivery_type)
        ? { id: 'enviar', icono: Truck, estado: 'in_delivery' }
        : { id: 'entregado', icono: Check, estado: 'delivered' };
    case 'in_delivery':
      return { id: 'entregado', icono: Check, estado: 'delivered' };
    default:
      return null;
  }
}

export interface TablaPedidosOnlineProps {
  pedidos: readonly WebOrder[];
  estado: EstadoTabla;
  timezone: string;
  ahora: Date;
  seleccion: ReadonlySet<string>;
  onSeleccionChange: (s: Set<string>) => void;
  onAbrir: (o: WebOrder) => void;
  onConfirmar: (o: WebOrder) => void;
  onRechazar: (o: WebOrder) => void;
  onCambiarEstado: (o: WebOrder, estado: WebOrderStatus) => void;
  onImprimir: (o: WebOrder) => void;
  onReintentar: () => void;
  onLimpiarFiltros: () => void;
  termino?: string;
  pie?: React.ReactNode;
}

export function TablaPedidosOnline(props: TablaPedidosOnlineProps) {
  const { pedidos, estado, timezone, ahora, seleccion, onSeleccionChange, onAbrir, onConfirmar, onRechazar, onCambiarEstado, onImprimir } = props;
  const t = useTranslations('pedidosOnlineListado');
  const { formatear } = useMonedaOrganizacion();
  const hora = (iso?: string | null) => (iso ? formatTimeInTz(iso, timezone) : '');

  const origen = (o: WebOrder) => {
    const r = origenDelPedido(o);
    const nombre = t(`origenes.${r.clave}`);
    return r.qrMesa ? t('origenes.qrMesa', { origen: nombre }) : nombre;
  };

  const entrega = (o: WebOrder): { titulo: string; detalle: string | null } => {
    const tipo = tipoEntregaEfectivo(o);
    const sede = o.branch?.name ?? null;
    if (tipo === 'dine_in') {
      const mesa = mesaCortaDelPedido(o);
      return {
        titulo: mesa ? t('entregas.dineInMesa', { mesa }) : t('entregas.dine_in'),
        detalle: [zonaDelPedido(o), sede].filter(Boolean).join(' · ') || null,
      };
    }
    if (tipo === 'pickup') return { titulo: t('entregas.pickup'), detalle: sede };
    const dir = o.delivery_address;
    const direccion = [dir?.address, dir?.neighborhood].filter(Boolean).join(' · ');
    if (tipo === 'delivery_third_party') return { titulo: t('entregas.delivery_third_party'), detalle: o.delivery_partner || direccion || null };
    return { titulo: t('entregas.delivery_own'), detalle: direccion || null };
  };

  const promesa = (o: WebOrder) => {
    const p = promesaDelPedido(o, ahora);
    const titulo =
      p.clave === 'sinConfirmar'
        ? t('promesa.sinConfirmar')
        : p.hora
          ? t(`promesa.${p.clave}`, { hora: hora(p.hora) })
          : t(`promesa.${p.clave}SinHora`);
    const detalle = p.detalle ? t(`promesa.${p.detalle.clave}`, { n: p.detalle.minutos }) : null;
    return { titulo, detalle, tono: p.tono };
  };

  const etiquetaPaso = (o: WebOrder, paso: PasoSiguiente) => t(`filaAcciones.${paso.id}`) + ' · ' + o.order_number;

  const ejecutarPaso = (o: WebOrder, paso: PasoSiguiente) => {
    if (paso.id === 'confirmar') onConfirmar(o);
    else if (paso.estado) onCambiarEstado(o, paso.estado);
  };

  const accionesDe = (o: WebOrder): AccionFila[] => {
    const paso = pasoSiguiente(o);
    return [
      { id: 'ver', etiqueta: t('filaAcciones.ver'), icono: Eye, onSelect: () => onAbrir(o) },
      ...(paso ? [{ id: paso.id, etiqueta: t(`filaAcciones.${paso.id}`), icono: paso.icono, onSelect: () => ejecutarPaso(o, paso) }] : []),
      { id: 'imprimir', etiqueta: t('filaAcciones.imprimir'), icono: Printer, onSelect: () => onImprimir(o) },
      {
        id: 'rechazar',
        etiqueta: t('filaAcciones.rechazar'),
        icono: XCircle,
        destructiva: true,
        oculta: o.status !== 'pending',
        onSelect: () => onRechazar(o),
      },
    ];
  };

  const boton = 'flex size-8 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';

  const columnas: ColumnaTabla<WebOrder>[] = [
    {
      id: 'pedido',
      encabezado: t('columnas.pedido'),
      ordenable: false,
      celda: (o) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-fg">{o.order_number}</span>
          <span className="text-xs text-fg-secondary">
            {hora(o.created_at)} · {origen(o)}
          </span>
        </div>
      ),
    },
    {
      id: 'cliente',
      encabezado: t('columnas.cliente'),
      celda: (o) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-fg">{o.customer_name || o.customer?.full_name || '—'}</span>
          <span className="truncate text-xs text-fg-secondary tabular-nums">{o.customer_phone || o.customer?.phone || ''}</span>
        </div>
      ),
    },
    {
      id: 'estado',
      encabezado: t('columnas.estado'),
      celda: (o) => <StatusBadge estado={o.status} etiqueta={t(`estados.${o.status}`)} tono={TONO_ESTADO_PEDIDO[o.status]} tamano="sm" />,
    },
    {
      id: 'entrega',
      encabezado: t('columnas.entrega'),
      celda: (o) => {
        const e = entrega(o);
        return (
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-fg">{e.titulo}</span>
            {e.detalle && <span className="line-clamp-2 text-xs text-fg-secondary">{e.detalle}</span>}
          </div>
        );
      },
    },
    {
      id: 'aTiempo',
      encabezado: t('columnas.aTiempo'),
      ocultarDebajo: 'lg',
      celda: (o) => {
        const p = promesa(o);
        return (
          <div className="flex min-w-0 flex-col">
            <span className="text-fg tabular-nums">{p.titulo}</span>
            {p.detalle && <span className={cn('text-xs tabular-nums', COLOR_PROMESA[p.tono])}>{p.detalle}</span>}
          </div>
        );
      },
    },
    {
      id: 'pago',
      encabezado: t('columnas.pago'),
      celda: (o) => (
        <div className="flex min-w-0 flex-col items-start gap-0.5">
          <StatusBadge estado={o.payment_status} etiqueta={t(`pagos.${o.payment_status}`)} tono={TONO_PAGO[o.payment_status] ?? 'neutro'} tamano="sm" />
          <span className="truncate text-xs text-fg-secondary">{metodoDePago(o)}</span>
        </div>
      ),
    },
    {
      id: 'total',
      encabezado: t('columnas.total'),
      variante: 'importe',
      celda: (o) => <span className="font-medium text-fg">{formatear(Number(o.total) || 0)}</span>,
    },
  ];

  const tarjeta = (o: WebOrder, ctx: ContextoTarjeta) => {
    const e = entrega(o);
    const p = promesa(o);
    return (
      <ListCard
        titulo={o.order_number}
        subtitulo={`${o.customer_name || o.customer?.full_name || '—'} · ${e.titulo}`}
        meta={
          <span>
            {hora(o.created_at)} · {p.titulo}
            {p.detalle && <span className={COLOR_PROMESA[p.tono]}> · {p.detalle}</span>}
          </span>
        }
        valor={formatear(Number(o.total) || 0)}
        estado={<StatusBadge estado={o.status} etiqueta={t(`estados.${o.status}`)} tono={TONO_ESTADO_PEDIDO[o.status]} tamano="sm" />}
        onClick={() => onAbrir(o)}
        acciones={accionesDe(o)}
        seleccionable={ctx.modoSeleccion}
        seleccionado={ctx.seleccionado}
        onSeleccionChange={ctx.alternar}
        onMantenerPulsado={() => ctx.alternar(true)}
      />
    );
  };

  return (
    <DataTable
      etiqueta={t('columnas.etiqueta')}
      columnas={columnas}
      filas={pedidos}
      obtenerId={(o) => o.id}
      estado={estado}
      densidad="compacta"
      seleccion={seleccion}
      onSeleccionChange={onSeleccionChange}
      onFilaClick={onAbrir}
      etiquetaFila={(o) => o.order_number}
      acciones={accionesDe}
      accionesRapidas={(o) => {
        const paso = pasoSiguiente(o);
        const Icono = paso?.icono;
        return (
          <>
            {paso && Icono && (
              <button
                type="button"
                className={boton}
                aria-label={etiquetaPaso(o, paso)}
                title={t(`filaAcciones.${paso.id}`)}
                onClick={(ev) => {
                  ev.stopPropagation();
                  ejecutarPaso(o, paso);
                }}
              >
                <Icono aria-hidden="true" className="size-4" strokeWidth={1.5} />
              </button>
            )}
            <button
              type="button"
              className={boton}
              aria-label={`${t('filaAcciones.imprimir')} · ${o.order_number}`}
              title={t('filaAcciones.imprimir')}
              onClick={(ev) => {
                ev.stopPropagation();
                onImprimir(o);
              }}
            >
              <Printer aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </button>
          </>
        );
      }}
      tarjetaMovil={tarjeta}
      vacio={{ titulo: t('vacio.titulo'), descripcion: t('vacio.descripcion') }}
      sinResultados={{ descripcion: t('sinResultados.descripcion') }}
      error={{ titulo: t('error.titulo') }}
      onReintentar={props.onReintentar}
      onLimpiarFiltros={props.onLimpiarFiltros}
      termino={props.termino}
      pie={props.pie}
      filasEsqueleto={6}
    />
  );
}
