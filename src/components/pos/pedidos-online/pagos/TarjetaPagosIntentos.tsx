'use client';

/**
 * Tarjeta «Pagos» del detalle con el método elegido y los intentos (diseño aprobado 2026-11-24,
 * capturas `docs/disenos-pagos-intentos-2026-11-24/01` a `05`):
 * - `InsigniaPagos`: «Esperando pago», «Pago en proceso», «Pago rechazado», «Pagado», «Venció sin
 *   pagar», «Contraentrega» o «Esperando comprobante», arriba a la derecha.
 * - `CuerpoPagosIntentos`: filas, bloque «INTENTOS DE PAGO», nota, «MENSAJE QUE SE ARMA» y botones
 *   de los estados A, B, C, C2, E, F y G. El estado D (pagado) es la tarjeta de hoy más el
 *   `HistorialIntentos`, y lo arma `OrderPaymentsCard`.
 * - `BotonReenviarEnlace`: «Reenviar enlace por WhatsApp» (también en la barra fija del celular).
 * Todas las horas van en la zona de la organización.
 */
import { useLocale } from 'next-intl';
import { Copy, MessageSquare } from 'lucide-react';
import { FilaDato, ListaDatos, StatusBadge, clasesBoton, type TonoBadge } from '@/components/kit';
import { cn } from '@/utils/Utils';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { formatTimeInTz } from '@/lib/utils/dateDisplay';
import { estadoAnticipo } from '@/lib/pos/pedidosWeb/contraentregaPedido';
import {
  conceptoDeEstado,
  historialIntentos,
  metodoElegido,
  motivoDelIntento,
  ultimoIntento,
  ultimoRechazo,
  vencimiento,
  type EstadoTarjetaPagos,
} from '@/lib/pos/pedidosWeb/intentosPago';
import type { WebOrder } from '@/lib/services/webOrdersService';
import { useAhora } from '@/components/pos/pedidos-online/contraentrega/TarjetaContraentrega';
import { ChipPasarela } from './ChipPasarela';
import { HistorialIntentos } from './HistorialIntentos';
import type { DatosIntentosPago } from './useIntentosPago';
import { useAccionesPago } from './useAccionesPago';
import { useTextosPago } from './useTextosPago';

export type PedidoConStock = WebOrder & { stock_released_at?: string | null };

const TONO_INSIGNIA: Record<EstadoTarjetaPagos, TonoBadge> = {
  A: 'advertencia',
  B: 'informacion',
  C: 'peligro',
  C2: 'peligro',
  D: 'exito',
  E: 'peligro',
  F: 'informacion',
  G: 'advertencia',
};

export function InsigniaPagos({ estado }: { estado: EstadoTarjetaPagos }) {
  const { t } = useTextosPago();
  return <StatusBadge estado={`pagos_${estado}`} etiqueta={t(`insignias.${estado}`)} tono={TONO_INSIGNIA[estado]} tamano="sm" />;
}

/** «Reenviar enlace por WhatsApp» con el mensaje del estado. */
export function BotonReenviarEnlace({
  order,
  estado,
  datos,
  timezone,
  variante = 'primario',
  tamano = 'md',
  className,
}: {
  order: WebOrder;
  estado: EstadoTarjetaPagos;
  datos: DatosIntentosPago;
  timezone: string;
  variante?: 'primario' | 'secundario';
  tamano?: 'md' | 'lg';
  className?: string;
}) {
  const { t } = useTextosPago();
  const acciones = useAccionesPago(order, estado, datos, timezone);
  return (
    <button
      type="button"
      className={clasesBoton({ variante, tamano, anchoCompleto: true, className })}
      onClick={acciones.enviar}
      disabled={acciones.ocupado}
    >
      <MessageSquare aria-hidden="true" className={tamano === 'lg' ? 'size-5' : 'size-4'} strokeWidth={1.5} />
      {t('acciones.reenviar')}
    </button>
  );
}

export function CuerpoPagosIntentos({
  order,
  estado,
  datos,
  timezone,
  movil = false,
  onVerContraentrega,
}: {
  order: PedidoConStock;
  /** Cualquier estado salvo D (pagado), que es la tarjeta de hoy con el historial. */
  estado: Exclude<EstadoTarjetaPagos, 'D'>;
  datos: DatosIntentosPago;
  timezone: string;
  /** Copia de arriba en el celular (pago rechazado): «Reenviar» va en la barra fija bajo `sm`. */
  movil?: boolean;
  /** «Ver «Pago contra entrega»» (estado F): lleva a esa tarjeta. */
  onVerContraentrega?: () => void;
}) {
  const textos = useTextosPago();
  const { t } = textos;
  const locale = useLocale();
  const { formatear } = useMonedaOrganizacion();
  const ahora = useAhora();
  const acciones = useAccionesPago(order, estado, datos, timezone);

  const concepto = conceptoDeEstado(estado);
  const elegido = metodoElegido(order, datos.intentos, concepto);
  const historial = historialIntentos(estado, order, datos.intentos, datos.venceAt);
  const ultimo = ultimoIntento(datos.intentos, 'order');
  const rechazo = ultimoRechazo(datos.intentos, 'order');
  const motivo = rechazo ? motivoDelIntento(rechazo) : null;
  const v = vencimiento(datos.venceAt, ahora, timezone);

  const hora = (iso: string) => formatTimeInTz(iso, timezone);
  const fechaCorta = (iso: string) => new Intl.DateTimeFormat(locale, { timeZone: timezone, day: 'numeric', month: 'short' }).format(new Date(iso));
  const fechaHora = (iso: string) => t('valores.fechaHora', { fecha: fechaCorta(iso), hora: hora(iso) });
  const importe = <FilaDato etiqueta={t('filas.importe')} valor={formatear(Number(order.total) || 0)} tono="fuerte" />;
  const filaPedido = order.created_at ? <FilaDato etiqueta={t('filas.pedido')} valor={fechaHora(order.created_at)} /> : null;

  const filaMetodo = (nota?: string) => (
    <>
      <FilaDato
        etiqueta={t('filas.metodoElegido')}
        valor={
          estado === 'G' ? (
            t('valores.transferencia')
          ) : (
            <span className="inline-flex min-w-0 items-center justify-end gap-1.5">
              {elegido.pasarela && <ChipPasarela pasarela={elegido.pasarela} />}
              <span className="truncate">{textos.metodo(elegido, order)}</span>
            </span>
          )
        }
      />
      {nota && <p className="-mt-1 pb-1 text-right text-xs text-fg-muted">{nota}</p>}
    </>
  );

  const filaVence = () => {
    if (!datos.venceAt || !v) return null;
    const h = hora(datos.venceAt);
    let texto: string;
    if (estado === 'G' && datos.plazoMinutos) texto = t('valores.venceConPlazo', { fecha: fechaCorta(datos.venceAt), hora: h, plazo: textos.tiempo(datos.plazoMinutos) });
    else if (v.vencido) texto = t('valores.venceYa', { hora: h });
    else if (v.otroDia) texto = t('valores.venceFechaFaltan', { fecha: fechaCorta(datos.venceAt), hora: h, tiempo: textos.tiempo(v.minutos) });
    else texto = t('valores.venceFaltan', { hora: h, tiempo: textos.tiempo(v.minutos) });
    return <FilaDato etiqueta={t('filas.vence')} valor={<span className="text-warning-text">{texto}</span>} />;
  };

  const historialBloque = (
    <HistorialIntentos intentos={historial} concepto={concepto} plazoMinutos={datos.plazoMinutos} timezone={timezone} formatear={formatear} />
  );
  const nota = (texto: string) => <p className="text-[13px] text-fg-muted">{texto}</p>;
  const botonCopiar = (
    <button type="button" className={clasesBoton({ variante: 'fantasma', tamano: 'md', anchoCompleto: true })} onClick={acciones.copiar}>
      <Copy aria-hidden="true" className="size-4" strokeWidth={1.5} />
      {t('acciones.copiar')}
    </button>
  );

  if (estado === 'F') {
    const vencidoAnticipo = estadoAnticipo(order) === 'vencido';
    return (
      <div className="space-y-3">
        <ListaDatos>
          <FilaDato
            etiqueta={t('filas.estado')}
            valor={vencidoAnticipo ? t('valores.expiradoSinCobro') : t('valores.porCobrarContraentrega')}
            tono={vencidoAnticipo ? 'peligro' : 'advertencia'}
          />
        </ListaDatos>
        {nota(t('notas.contraentrega'))}
        {onVerContraentrega && (
          <button
            type="button"
            className="text-left text-[13px] font-medium text-link underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            onClick={onVerContraentrega}
          >
            {t('notas.verContraentrega')}
          </button>
        )}
        {historialBloque}
      </div>
    );
  }

  if (estado === 'E') {
    const vencio = order.cancelled_at ?? datos.venceAt;
    return (
      <div className="space-y-3">
        <ListaDatos>
          <FilaDato etiqueta={t('filas.estadoPedido')} valor={t('valores.expiradoSinCobro')} tono="peligro" />
          {filaMetodo()}
          {filaPedido}
          {datos.plazoMinutos && vencio ? (
            <FilaDato etiqueta={t('filas.plazo')} valor={t('valores.plazoVencio', { plazo: textos.tiempo(datos.plazoMinutos), hora: hora(vencio) })} />
          ) : null}
          {order.stock_released_at && <FilaDato etiqueta={t('filas.stock')} valor={t('valores.stockLiberado', { hora: hora(order.stock_released_at) })} />}
        </ListaDatos>
        {historialBloque}
        {nota(t('notas.vencido'))}
        <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'md', anchoCompleto: true })} onClick={acciones.enviar} disabled={acciones.ocupado}>
          <MessageSquare aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('acciones.escribir')}
        </button>
      </div>
    );
  }

  if (estado === 'G') {
    return (
      <div className="space-y-3">
        <ListaDatos>
          <FilaDato etiqueta={t('filas.estado')} valor={t('valores.porCobrar')} tono="advertencia" />
          {filaMetodo(t('valores.sinPagoEnLinea'))}
          {filaPedido}
          {filaVence()}
          {importe}
        </ListaDatos>
        {nota(t('notas.transferencia'))}
      </div>
    );
  }

  const rechazado = estado === 'C' || estado === 'C2';
  return (
    <div className="space-y-3">
      <ListaDatos>
        {rechazado ? (
          <FilaDato etiqueta={t('filas.estado')} valor={t('valores.rechazadoReintentar')} tono="peligro" />
        ) : (
          <FilaDato etiqueta={t('filas.estado')} valor={t('valores.porCobrar')} tono="advertencia" />
        )}
        {filaMetodo(estado === 'A' ? t('valores.aunNoPaga') : undefined)}
        {estado === 'B' && ultimo?.bank && <FilaDato etiqueta={t('filas.banco')} valor={ultimo.bank} />}
        {rechazado && (
          <FilaDato
            etiqueta={t('filas.motivo')}
            valor={
              motivo ? (
                <span className={motivo.tipo === 'noInforma' ? 'text-fg-muted' : 'text-danger-text'}>{textos.motivo(motivo)}</span>
              ) : (
                <span className="text-fg-muted">{t('motivos.noInformaGenerico')}</span>
              )
            }
          />
        )}
        {rechazado && rechazo?.reference && <FilaDato etiqueta={t('filas.referencia')} valor={<span className="[overflow-wrap:anywhere]">{rechazo.reference}</span>} />}
        {estado === 'A' && filaPedido}
        {filaVence()}
        {importe}
      </ListaDatos>
      {historialBloque}
      {estado === 'A' && nota(elegido.pasarela === 'bold' ? t('notas.esperandoBold') : t('notas.esperando'))}
      {estado === 'B' && nota(t('notas.enProceso'))}
      {rechazado && (
        <div className="rounded-lg border border-dashed border-line-strong px-3 py-2.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-fg-secondary">{t('mensaje.titulo')}</p>
          <p className="mt-1 text-[13px] text-fg-secondary [overflow-wrap:anywhere]">
            «{acciones.vistaPrevia}»{acciones.cargandoEnlace && <span className="sr-only">{t('mensaje.cargando')}</span>}
          </p>
        </div>
      )}
      {(estado === 'A' || rechazado) && (
        <div className="flex flex-col gap-2">
          <BotonReenviarEnlace
            order={order}
            estado={estado}
            datos={datos}
            timezone={timezone}
            variante={rechazado ? 'primario' : 'secundario'}
            // En el celular, «Reenviar» del pago rechazado va en la barra fija de abajo.
            className={cn(movil && rechazado && 'hidden sm:inline-flex')}
          />
          {botonCopiar}
        </div>
      )}
    </div>
  );
}
