'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  ArrowRightLeft,
  Barcode,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Package,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  ShoppingCart,
  Truck,
  User,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/utils/Utils';
import { EmptyState } from '@/components/kit/EmptyState';
import { useEsEscritorio } from '@/components/kit/useEsEscritorio';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { supabase } from '@/lib/supabase/config';
import { formatDateTimeInTz, formatDateInTz } from '@/lib/utils/dateDisplay';
import { serialTrackingService, type SerialTrackingEvent, type SerialWithDetails } from '@/lib/services/serialTrackingService';
import { useProductoDetalle } from '../../ContextoProducto';
import { EstadoSerialBadge, GarantiaSerial, useEtiquetaEstadoSerial } from './piezas';

/**
 * Trazabilidad de un serial (Sheet a la derecha en escritorio, inferior en
 * móvil): datos del serial y línea de tiempo compra → recepción → reservas y
 * transferencias → venta → garantía, con enlaces a cada documento.
 *
 * Datos: `serialTrackingService.getSerialById` (serial + eventos) y los
 * reclamos de `warranty_claims` del serial. Fechas en la zona de la
 * organización; `warranty_*` son columnas `date` (sin conversión).
 */

const EVENTOS_CONOCIDOS = [
  'received',
  'stock_in',
  'reserved',
  'sold',
  'returned',
  'transferred',
  'damaged',
  'rma_created',
  'warranty_claim',
  'warranty_resolved',
  'status_change',
] as const;
type EventoConocido = (typeof EVENTOS_CONOCIDOS)[number];

const ICONO_EVENTO: Record<EventoConocido | 'reclamo' | 'compra' | 'otro', { icono: LucideIcon; caja: string }> = {
  compra: { icono: FileText, caja: 'bg-info-subtle text-info-text' },
  received: { icono: Package, caja: 'bg-success-subtle text-success-text' },
  stock_in: { icono: CheckCircle2, caja: 'bg-success-subtle text-success-text' },
  reserved: { icono: Clock, caja: 'bg-info-subtle text-info-text' },
  sold: { icono: ShoppingCart, caja: 'bg-brand-tint text-brand-deep' },
  returned: { icono: RotateCcw, caja: 'bg-warning-subtle text-warning-text' },
  transferred: { icono: Truck, caja: 'bg-info-subtle text-info-text' },
  damaged: { icono: AlertTriangle, caja: 'bg-danger-subtle text-danger-text' },
  rma_created: { icono: Wrench, caja: 'bg-warning-subtle text-warning-text' },
  warranty_claim: { icono: ShieldCheck, caja: 'bg-danger-subtle text-danger-text' },
  warranty_resolved: { icono: ShieldCheck, caja: 'bg-success-subtle text-success-text' },
  status_change: { icono: RefreshCw, caja: 'bg-subtle text-fg-secondary' },
  reclamo: { icono: ShieldCheck, caja: 'bg-warning-subtle text-warning-text' },
  otro: { icono: RefreshCw, caja: 'bg-subtle text-fg-secondary' },
};

const ESTADOS_RECLAMO = ['pending', 'approved', 'rejected', 'in_process', 'resolved', 'cancelled'] as const;
const RESOLUCIONES = ['repair', 'replacement', 'refund', 'store_credit', 'rejected'] as const;
const CANALES = ['in_stock', 'pos', 'web', 'invoice', 'table'] as const;

function esDe<T extends string>(lista: readonly T[], v: string | null | undefined): v is T {
  return !!v && (lista as readonly string[]).includes(v);
}

interface ReclamoSerial {
  id: string;
  claim_date: string;
  status: string;
  claim_reason: string;
  resolution_type: string | null;
}

interface Enlace {
  clave: string;
  etiqueta: string;
  href: string | null;
}

interface Hito {
  clave: string;
  fecha: string | null;
  tipo: EventoConocido | 'reclamo' | 'compra' | 'otro';
  titulo: string;
  lineas: ReactNode[];
  enlaces: Enlace[];
  notas: string | null;
  usuario: string | null;
}

export interface TrazabilidadSerialSheetProps {
  serialId: number | null;
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  /** Nombre de la variante (o del producto base) del serial. */
  nombreProducto: (productId: number) => string;
  /** Acciones del pie (las decide el listado según permisos y estado). */
  acciones?: ReactNode;
}

export function TrazabilidadSerialSheet({ serialId, abierto, onAbiertoChange, nombreProducto, acciones }: TrazabilidadSerialSheetProps) {
  const t = useTranslations('productoDetalle.seriales');
  const tc = useTranslations('productoDetalle.comun');
  const { organizacionId, moneda, fechas, resumen } = useProductoDetalle();
  const escritorio = useEsEscritorio();
  const localeIntl = useLocaleIntl();
  const etiquetaEstado = useEtiquetaEstadoSerial();

  const [serial, setSerial] = useState<SerialWithDetails | null>(null);
  const [reclamos, setReclamos] = useState<ReclamoSerial[]>([]);
  const [usuarios, setUsuarios] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(false);

  const cargar = useCallback(async () => {
    if (serialId === null) return;
    setCargando(true);
    setError(false);
    setSerial((previo) => (previo?.id === serialId ? previo : null));
    try {
      const [{ data, error: e1 }, reclamosRes] = await Promise.all([
        serialTrackingService.getSerialById(serialId),
        supabase
          .from('warranty_claims')
          .select('id, claim_date, status, claim_reason, resolution_type')
          .eq('organization_id', organizacionId)
          .eq('serial_number_id', serialId)
          .order('claim_date', { ascending: true }),
      ]);
      if (e1 || !data || data.organization_id !== organizacionId) throw e1 ?? new Error('serial_no_encontrado');
      setSerial(data);
      setReclamos(reclamosRes.error ? [] : ((reclamosRes.data ?? []) as ReclamoSerial[]));
      // Quién hizo cada movimiento (si el perfil es visible; si no, se omite).
      const ids = [...new Set((data.events ?? []).map((ev) => ev.performed_by).filter((x): x is string => !!x))];
      if (ids.length > 0) {
        const { data: perfiles } = await supabase.from('profiles').select('id, first_name, last_name, email').in('id', ids);
        const mapa: Record<string, string> = {};
        for (const p of (perfiles ?? []) as { id: string; first_name: string | null; last_name: string | null; email: string | null }[]) {
          mapa[p.id] = [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email || '';
        }
        setUsuarios(mapa);
      } else {
        setUsuarios({});
      }
    } catch (e) {
      console.error('Error cargando la trazabilidad del serial:', e);
      setError(true);
    } finally {
      setCargando(false);
    }
  }, [serialId, organizacionId]);

  useEffect(() => {
    if (abierto && serialId !== null) void cargar();
    if (!abierto) {
      setSerial(null);
      setReclamos([]);
    }
  }, [abierto, serialId, cargar]);

  const nombreSucursal = useCallback(
    (id: number | null | undefined): string | null => {
      if (id === null || id === undefined) return null;
      if (serial?.current_branch?.id === id) return serial.current_branch.name;
      if (serial?.branches?.id === id) return serial.branches.name;
      return resumen?.sucursales.find((s) => s.branch_id === id)?.nombre ?? t('traza.sucursalN', { id });
    },
    [serial, resumen, t],
  );

  const fechaHora = useCallback(
    (v: string | null | undefined) => (v ? formatDateTimeInTz(v, fechas.timezone, { locale: localeIntl }) : '—'),
    [fechas.timezone, localeIntl],
  );

  const enlacesDocumento = useCallback(
    (d: {
      purchase_order_id?: number | null;
      purchase_invoice_id?: string | null;
      invoice_sale_id?: string | null;
      sale_id?: string | null;
      web_order_id?: string | null;
      customer_id?: string | null;
    }): Enlace[] => {
      const e: Enlace[] = [];
      if (d.purchase_order_id) e.push({ clave: 'oc', etiqueta: t('traza.docs.ordenCompra'), href: `/app/inventario/ordenes-compra/${d.purchase_order_id}` });
      if (d.purchase_invoice_id) e.push({ clave: 'fc', etiqueta: t('traza.docs.facturaCompra'), href: `/app/inventario/facturas-compra/${d.purchase_invoice_id}` });
      if (d.sale_id) e.push({ clave: 'venta', etiqueta: t('traza.docs.venta'), href: `/app/pos/ventas/${d.sale_id}` });
      if (d.web_order_id) e.push({ clave: 'web', etiqueta: t('traza.docs.pedidoWeb'), href: `/app/pos/pedidos-online/${d.web_order_id}` });
      if (d.invoice_sale_id) e.push({ clave: 'fv', etiqueta: t('traza.docs.facturaVenta'), href: `/app/finanzas/facturas-venta/${d.invoice_sale_id}` });
      if (d.customer_id) e.push({ clave: 'cli', etiqueta: t('traza.docs.cliente'), href: `/app/clientes/${d.customer_id}` });
      return e;
    },
    [t],
  );

  const hitos = useMemo<Hito[]>(() => {
    if (!serial) return [];
    const eventos: SerialTrackingEvent[] = serial.events ?? [];
    const lista: Hito[] = [];

    // Compra (documento de origen), si la hay y ningún evento la trae.
    if ((serial.purchase_order_id || serial.purchase_invoice_id) && !eventos.some((ev) => ev.purchase_order_id || ev.purchase_invoice_id)) {
      lista.push({
        clave: 'compra',
        fecha: serial.received_date ?? serial.created_at,
        tipo: 'compra',
        titulo: t('traza.hitos.compra'),
        lineas: serial.suppliers?.name ? [t('traza.proveedor', { proveedor: serial.suppliers.name })] : [],
        enlaces: enlacesDocumento({ purchase_order_id: serial.purchase_order_id, purchase_invoice_id: serial.purchase_invoice_id }),
        notas: null,
        usuario: null,
      });
    }
    // Recepción sin evento (seriales anteriores a la trazabilidad).
    if (!eventos.some((ev) => ev.event_type === 'received' || ev.event_type === 'stock_in')) {
      lista.push({
        clave: 'recepcion',
        fecha: serial.received_date ?? serial.created_at,
        tipo: 'received',
        titulo: t('traza.eventos.received'),
        lineas: serial.branches?.name ? [t('traza.enSucursal', { sucursal: serial.branches.name })] : [],
        enlaces: [],
        notas: null,
        usuario: null,
      });
    }

    for (const ev of eventos) {
      const tipo: Hito['tipo'] = esDe(EVENTOS_CONOCIDOS, ev.event_type) ? ev.event_type : 'otro';
      const lineas: ReactNode[] = [];
      if (ev.from_status && ev.to_status && ev.from_status !== ev.to_status) {
        lineas.push(t('traza.deA', { desde: etiquetaEstado(ev.from_status), hasta: etiquetaEstado(ev.to_status) }));
      } else if (ev.to_status) {
        lineas.push(t('traza.estado', { estado: etiquetaEstado(ev.to_status) }));
      }
      const desde = nombreSucursal(ev.from_branch_id);
      const hasta = nombreSucursal(ev.to_branch_id);
      if (desde && hasta && ev.from_branch_id !== ev.to_branch_id) lineas.push(t('traza.movimiento', { desde, hasta }));
      else if (hasta || desde) lineas.push(t('traza.enSucursal', { sucursal: (hasta ?? desde) as string }));
      lista.push({
        clave: ev.id,
        fecha: ev.event_date,
        tipo,
        titulo: tipo === 'otro' ? t('traza.eventos.otro', { tipo: ev.event_type }) : t(`traza.eventos.${tipo}`),
        lineas,
        enlaces: enlacesDocumento(ev),
        notas: ev.notes,
        usuario: ev.performed_by ? usuarios[ev.performed_by] || null : null,
      });
    }

    // Venta sin evento (ventas anteriores a la trazabilidad).
    if (serial.sale_date && !eventos.some((ev) => ev.event_type === 'sold')) {
      lista.push({
        clave: 'venta',
        fecha: serial.sale_date,
        tipo: 'sold',
        titulo: t('traza.eventos.sold'),
        lineas: serial.customers?.full_name ? [t('traza.aCliente', { cliente: serial.customers.full_name })] : [],
        enlaces: enlacesDocumento({
          sale_id: serial.sale_id,
          web_order_id: serial.web_order_id,
          invoice_sale_id: serial.invoice_sale_id,
          customer_id: serial.sold_to_customer_id,
        }),
        notas: null,
        usuario: null,
      });
    }

    for (const r of reclamos) {
      const lineas: ReactNode[] = [t('traza.motivoReclamo', { motivo: r.claim_reason })];
      if (esDe(RESOLUCIONES, r.resolution_type)) lineas.push(t('traza.resolucion', { resolucion: t(`traza.resoluciones.${r.resolution_type}`) }));
      lista.push({
        clave: `reclamo-${r.id}`,
        fecha: r.claim_date,
        tipo: 'reclamo',
        titulo: esDe(ESTADOS_RECLAMO, r.status)
          ? t('traza.reclamoEstado', { estado: t(`traza.estadosReclamo.${r.status}`) })
          : t('traza.reclamo'),
        lineas,
        enlaces: [{ clave: 'reclamo', etiqueta: t('traza.docs.reclamo'), href: `/app/inventario/garantias/${r.id}` }],
        notas: null,
        usuario: null,
      });
    }

    const instante = (h: Hito) => (h.fecha ? new Date(h.fecha).getTime() || 0 : 0);
    return lista.sort((a, b) => instante(a) - instante(b));
  }, [serial, reclamos, usuarios, t, etiquetaEstado, nombreSucursal, enlacesDocumento]);

  const canal = serial?.sale_channel && serial.sale_channel !== 'in_stock' && esDe(CANALES, serial.sale_channel) ? t(`traza.canales.${serial.sale_channel}`) : null;

  const datos: { clave: string; etiqueta: string; valor: ReactNode }[] = serial
    ? [
        { clave: 'producto', etiqueta: t('traza.datos.producto'), valor: nombreProducto(serial.product_id) },
        { clave: 'sucursal', etiqueta: t('traza.datos.sucursalActual'), valor: serial.current_branch?.name ?? '—' },
        { clave: 'origen', etiqueta: t('traza.datos.sucursalOrigen'), valor: serial.branches?.name ?? '—' },
        { clave: 'proveedor', etiqueta: t('traza.datos.proveedor'), valor: serial.suppliers?.name ?? '—' },
        { clave: 'recepcion', etiqueta: t('traza.datos.recepcion'), valor: serial.received_date ? formatDateInTz(serial.received_date, fechas.timezone, { locale: localeIntl }) : '—' },
        { clave: 'costo', etiqueta: t('traza.datos.costo'), valor: serial.cost_at_purchase ? moneda.formatear(serial.cost_at_purchase) : '—' },
        {
          clave: 'cliente',
          etiqueta: t('traza.datos.cliente'),
          valor: serial.sold_to_customer_id ? (
            <Link href={`/app/clientes/${serial.sold_to_customer_id}`} className="text-link hover:underline">
              {serial.customers?.full_name || t('tabla.sinCliente')}
            </Link>
          ) : (
            t('tabla.sinCliente')
          ),
        },
        { clave: 'venta', etiqueta: t('traza.datos.venta'), valor: serial.sale_date ? fechaHora(serial.sale_date) : '—' },
        { clave: 'precio', etiqueta: t('traza.datos.precio'), valor: serial.price_at_sale ? moneda.formatear(serial.price_at_sale) : '—' },
        { clave: 'canal', etiqueta: t('traza.datos.canal'), valor: canal ?? '—' },
        {
          clave: 'garantia',
          etiqueta: t('traza.datos.garantia'),
          valor: <GarantiaSerial inicio={serial.warranty_start} fin={serial.warranty_end} hoy={fechas.getToday()} />,
        },
        {
          clave: 'meses',
          etiqueta: t('traza.datos.meses'),
          valor: serial.warranty_months ? t('badges.garantia', { count: serial.warranty_months }) : '—',
        },
      ]
    : [];

  const documentos = serial
    ? enlacesDocumento({
        purchase_order_id: serial.purchase_order_id,
        purchase_invoice_id: serial.purchase_invoice_id,
        sale_id: serial.sale_id,
        web_order_id: serial.web_order_id,
        invoice_sale_id: serial.invoice_sale_id,
      })
    : [];

  return (
    <Sheet open={abierto} onOpenChange={onAbiertoChange}>
      <SheetContent
        side={escritorio ? 'right' : 'bottom'}
        hideCloseButton
        className={cn(
          'flex flex-col gap-0 bg-surface p-0',
          escritorio ? 'w-full sm:max-w-[520px]' : 'max-h-[90dvh] rounded-t-2xl',
        )}
      >
        <div className="flex items-start gap-3 border-b border-line px-5 pb-3 pt-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand" aria-hidden="true">
            <Barcode className="size-5" strokeWidth={1.75} />
          </span>
          <div className="min-w-0 flex-1">
            <SheetTitle className="truncate font-mono text-lg font-semibold leading-6 text-fg">
              {serial?.serial ?? t('traza.titulo')}
            </SheetTitle>
            <SheetDescription className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-fg-secondary">
              {t('traza.descripcion')}
              {serial && <EstadoSerialBadge estado={serial.status} tamano="sm" />}
            </SheetDescription>
          </div>
          <Button variant="ghost" size="icon" className="size-8 shrink-0" aria-label={tc('cerrar')} onClick={() => onAbiertoChange(false)}>
            <X aria-hidden="true" className="size-5" strokeWidth={1.5} />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {cargando && !serial ? (
            <div className="space-y-3" aria-busy="true" aria-label={tc('cargando')}>
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : error ? (
            <EmptyState variante="error" compacto titulo={t('traza.error')} onReintentar={() => void cargar()} />
          ) : serial ? (
            <div className="space-y-6">
              <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                {datos.map((d) => (
                  <div key={d.clave} className={cn('min-w-0', d.clave === 'garantia' && 'sm:col-span-2')}>
                    <dt className="text-xs text-fg-secondary">{d.etiqueta}</dt>
                    <dd className="mt-0.5 break-words text-sm text-fg">{d.valor}</dd>
                  </div>
                ))}
              </dl>

              {serial.notes && (
                <div>
                  <h3 className="mb-1 text-xs font-medium text-fg-secondary">{t('traza.notas')}</h3>
                  <p className="whitespace-pre-line rounded-lg bg-subtle px-3 py-2 text-sm text-fg">{serial.notes}</p>
                </div>
              )}

              {documentos.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-medium text-fg-secondary">{t('traza.documentos')}</h3>
                  <div className="flex flex-wrap gap-2">
                    {documentos.map((d) => (
                      <EnlaceDocumento key={d.clave} enlace={d} />
                    ))}
                  </div>
                </div>
              )}

              <section aria-labelledby="traza-linea">
                <h3 id="traza-linea" className="mb-3 text-sm font-semibold text-fg">
                  {t('traza.lineaTiempo')}
                </h3>
                {hitos.length === 0 ? (
                  <p className="text-sm text-fg-secondary">{t('traza.sinEventos')}</p>
                ) : (
                  <ol className="relative space-y-4 border-l border-line pl-6">
                    {hitos.map((h) => {
                      const { icono: Icono, caja } = ICONO_EVENTO[h.tipo];
                      return (
                        <li key={h.clave} className="relative">
                          <span
                            aria-hidden="true"
                            className={cn('absolute -left-[37px] top-0 flex size-6 items-center justify-center rounded-full ring-4 ring-surface', caja)}
                          >
                            <Icono className="size-3.5" strokeWidth={2} />
                          </span>
                          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                            <p className="text-sm font-medium text-fg">{h.titulo}</p>
                            <time className="text-xs tabular-nums text-fg-muted" dateTime={h.fecha ?? undefined}>
                              {fechaHora(h.fecha)}
                            </time>
                          </div>
                          {h.lineas.map((l, i) => (
                            <p key={i} className="text-xs text-fg-secondary">
                              {l}
                            </p>
                          ))}
                          {h.usuario && <p className="text-xs text-fg-muted">{t('traza.por', { usuario: h.usuario })}</p>}
                          {h.notas && <p className="mt-1 whitespace-pre-line rounded bg-subtle px-2 py-1 text-xs text-fg-secondary">{h.notas}</p>}
                          {h.enlaces.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {h.enlaces.map((e) => (
                                <EnlaceDocumento key={e.clave} enlace={e} pequeno />
                              ))}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>
            </div>
          ) : null}
        </div>

        {serial && (
          <div className="flex flex-col-reverse gap-2 border-t border-line px-5 py-3 sm:flex-row sm:justify-end">
            {acciones}
            <Button asChild variant="outline">
              <Link href={`/app/inventario/seriales/${serial.id}`}>
                <ExternalLink aria-hidden="true" className="mr-2 size-4" />
                {t('acciones.abrirFicha')}
              </Link>
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function EnlaceDocumento({ enlace, pequeno = false }: { enlace: Enlace; pequeno?: boolean }) {
  const Icono = enlace.clave === 'cli' ? User : enlace.clave === 'reclamo' ? ShieldCheck : enlace.clave === 'venta' || enlace.clave === 'web' ? ShoppingCart : enlace.clave === 'oc' ? ArrowRightLeft : FileText;
  const contenido = (
    <>
      <Icono aria-hidden="true" className="size-3.5" />
      {enlace.etiqueta}
    </>
  );
  if (!enlace.href) {
    return (
      <Badge tono="neutro" tamano={pequeno ? 'sm' : 'md'} icono={Icono}>
        {enlace.etiqueta}
      </Badge>
    );
  }
  return (
    <Link
      href={enlace.href}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border border-line bg-surface text-link hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        pequeno ? 'h-6 px-1.5 text-[11px]' : 'h-7 px-2 text-xs',
      )}
    >
      {contenido}
    </Link>
  );
}
