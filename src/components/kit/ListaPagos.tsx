'use client';

import { useMemo, type ReactNode } from 'react';
import { CircleAlert, CircleCheck, Loader2, QrCode, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { crearFormateadorMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import { FilaDato, ListaDatos, type FilaDatoProps } from './FilaDato';
import { iconoMetodoPago } from './metodosPago';
import { useKitT } from './useIdiomaKit';

/**
 * Pagos agregados a un cobro (cobro del POS con pago mixto, diálogo de pago
 * con varios métodos): método, referencia, importe y «×». Un pago por QR
 * muestra su estado (generando · esperando · cubierto · error) y, si aún no
 * tiene QR, «Generar QR».
 *
 * `resumen` pinta debajo Pagado · Falta · Cambio, **calculados por la
 * pantalla** (`useCobro`); la lista no suma nada.
 */
export type EstadoPagoLista = 'listo' | 'qrPendiente' | 'qrProcesando' | 'qrCubierto' | 'error';

export interface PagoLista {
  id: string;
  /** Nombre del método de la organización. */
  metodo: string;
  codigo?: string;
  monto: number;
  referencia?: string | null;
  estado?: EstadoPagoLista;
  /** Mensaje del estado (error del proveedor, «Esperando pago»). */
  detalle?: string | null;
  icono?: LucideIcon;
}

export interface ListaPagosProps {
  pagos: readonly PagoLista[];
  moneda: ContextoMoneda | string;
  onQuitar?: (id: string) => void;
  /** «Generar QR» en los pagos `qrPendiente`. */
  onGenerarQr?: (id: string) => void;
  /** Ranura a la derecha de cada pago (reimprimir voucher, ver comprobante). */
  accesorio?: (pago: PagoLista) => ReactNode;
  /** Filas bajo la lista: Pagado · Falta · Cambio. */
  resumen?: readonly FilaDatoProps[];
  textoVacio?: string;
  etiqueta?: string;
  /** Bloquea «×» mientras se procesa el cobro. */
  bloqueado?: boolean;
  className?: string;
}

function EstadoQr({ estado, detalle }: { estado: EstadoPagoLista; detalle?: string | null }) {
  const t = useKitT();
  if (estado === 'listo') return null;
  const mapa = {
    qrPendiente: { Icono: QrCode, clase: 'text-fg-secondary', texto: t('pagos.estado.qrPendiente'), gira: false },
    qrProcesando: { Icono: Loader2, clase: 'text-info-text', texto: t('pagos.estado.qrProcesando'), gira: true },
    qrCubierto: { Icono: CircleCheck, clase: 'text-success-text', texto: t('pagos.estado.qrCubierto'), gira: false },
    error: { Icono: CircleAlert, clase: 'text-danger-text', texto: t('pagos.estado.error'), gira: false },
  } as const;
  const { Icono, clase, texto, gira } = mapa[estado];
  return (
    <span role={estado === 'error' ? 'alert' : 'status'} className={cn('flex items-center gap-1 text-xs', clase)}>
      <Icono aria-hidden="true" className={cn('size-3.5 shrink-0', gira && 'animate-spin')} strokeWidth={1.5} />
      {detalle || texto}
    </span>
  );
}

export function ListaPagos({
  pagos,
  moneda,
  onQuitar,
  onGenerarQr,
  accesorio,
  resumen,
  textoVacio,
  etiqueta,
  bloqueado,
  className,
}: ListaPagosProps) {
  const t = useKitT();
  const formatear = useMemo(() => crearFormateadorMoneda(moneda), [moneda]);
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {pagos.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line-strong px-3 py-4 text-center text-sm text-fg-secondary">
          {textoVacio ?? t('pagos.vacio')}
        </p>
      ) : (
        <ul aria-label={etiqueta ?? t('pagos.lista')} className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
          {pagos.map((p) => {
            const Icono = p.icono ?? iconoMetodoPago(p.codigo ?? p.metodo);
            return (
              <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-subtle text-fg-secondary">
                  <Icono className="size-4" strokeWidth={1.5} />
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium text-fg">{p.metodo}</span>
                  {p.referencia && <span className="truncate text-xs text-fg-muted">{p.referencia}</span>}
                  {p.estado && <EstadoQr estado={p.estado} detalle={p.detalle} />}
                  {p.estado === 'qrPendiente' && onGenerarQr && (
                    <button
                      type="button"
                      onClick={() => onGenerarQr(p.id)}
                      className="mt-1 inline-flex w-fit items-center gap-1 rounded text-xs font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      <QrCode aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
                      {t('pagos.generarQr')}
                    </button>
                  )}
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-fg">{formatear(p.monto)}</span>
                {accesorio?.(p)}
                {onQuitar && (
                  <button
                    type="button"
                    disabled={bloqueado || p.estado === 'qrCubierto'}
                    aria-label={t('pagos.quitar', { metodo: p.metodo, monto: formatear(p.monto) })}
                    onClick={() => onQuitar(p.id)}
                    className="flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover hover:text-danger-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <X aria-hidden="true" className="size-4" strokeWidth={1.5} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {resumen && resumen.length > 0 && (
        <ListaDatos etiqueta={t('pagos.resumen')}>
          {resumen.map((f, i) => (
            <FilaDato key={i} {...f} />
          ))}
        </ListaDatos>
      )}
    </div>
  );
}
