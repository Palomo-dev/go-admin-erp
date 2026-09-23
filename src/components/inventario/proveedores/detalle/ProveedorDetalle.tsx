'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Banknote,
  Boxes,
  ClipboardList,
  Copy,
  Eye,
  EyeOff,
  FileText,
  HandCoins,
  Package,
  Plus,
  Star,
  TrendingUp,
  Truck,
  WalletCards,
} from 'lucide-react';
import {
  DataTable,
  KpiStrip,
  PageHeader,
  RowActionsMenu,
  StatCard,
  StatusBadge,
  TabBar,
  idPanel,
  idPestana,
  type AccionFila,
  type ColumnaTabla,
} from '@/components/kit';
import { RelatedLinkCard } from '@/components/kit/RelatedLinkCard';
import { HtmlContentRenderer } from '@/components/shared/HtmlContentRenderer';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useOrgCurrency } from '@/lib/hooks/useOrgCurrency';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import {
  supplierService,
  type AccountPayableSummary,
  type ProveedorResumen,
  type PurchaseInvoiceSummary,
  type PurchaseOrderSummary,
  type Supplier,
  type SupplierPaymentSummary,
  type SupplierProductLink,
  type SupplierStockSummary,
} from '@/lib/services/supplierService';
import { formatPlainDate } from '@/lib/utils/dateDisplay';
import { DialogoEliminarProveedor } from '../DialogoEliminarProveedor';
import {
  condicionPago,
  cuentaEnmascarada,
  documentoProveedor,
  etiquetaRegimen,
  etiquetaTipoCuenta,
  formatoMoneda,
  tipoProveedor,
  TIPOS_DOCUMENTO_DIAN,
} from '../formato';
import { RUTA_PROVEEDORES, rutaNuevaOrdenCompra, useAccionesProveedor } from '../useAccionesProveedor';

interface ProveedorDetalleProps {
  supplierUuid: string;
}

type Pestana = 'resumen' | 'productos' | 'ordenes' | 'facturas' | 'cuentas' | 'pagos';

const ID_TABS = 'proveedor';

const ESTADO_OC: Record<string, string> = {
  draft: 'Borrador',
  pending: 'Pendiente',
  approved: 'Aprobada',
  sent: 'Enviada',
  partial: 'Recibida en parte',
  received: 'Recibida',
  completed: 'Completada',
  cancelled: 'Cancelada',
};

const ESTADO_FACTURA: Record<string, string> = {
  draft: 'Borrador',
  received: 'Recibida',
  partial: 'Pago parcial',
  paid: 'Pagada',
  cancelled: 'Anulada',
  void: 'Anulada',
};

const METODO_PAGO: Record<string, string> = {
  cash: 'Efectivo',
  efectivo: 'Efectivo',
  transfer: 'Transferencia',
  bank_transfer: 'Transferencia',
  transferencia: 'Transferencia',
  card: 'Tarjeta',
  credit_card: 'Tarjeta',
  debit_card: 'Tarjeta',
  check: 'Cheque',
  cheque: 'Cheque',
};

const etiquetaMetodo = (m: string | null | undefined) =>
  m ? (METODO_PAGO[m.toLowerCase()] ?? m.charAt(0).toUpperCase() + m.slice(1)) : '—';

const DIA_MS = 86_400_000;

/** Estado de una cuenta por pagar: «Vencida 12 d» si ya pasó y tiene saldo. */
function estadoCxp(c: AccountPayableSummary): { estado: string; etiqueta: string } {
  if (c.status !== 'paid' && c.balance > 0 && c.due_date) {
    const dias = Math.floor((Date.now() - new Date(c.due_date).getTime()) / DIA_MS);
    if (dias > 0) return { estado: 'vencida', etiqueta: `Vencida ${dias} d` };
  }
  const etiquetas: Record<string, string> = { pending: 'Pendiente', partial: 'Pago parcial', paid: 'Pagada', overdue: 'Vencida' };
  return { estado: c.status, etiqueta: etiquetas[c.status] ?? c.status };
}

function Fila({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-0.5 py-1.5 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm text-fg-secondary">{etiqueta}</dt>
      <dd className="min-w-0 break-words text-sm text-fg">{children}</dd>
    </div>
  );
}

function Tarjeta({ titulo, accion, children }: { titulo: string; accion?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4 sm:p-6" aria-label={titulo}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-fg">{titulo}</h2>
        {accion}
      </div>
      {children}
    </section>
  );
}

const CLASE_BOTON_SECUNDARIO =
  'inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:pointer-events-none disabled:opacity-50';
const CLASE_BOTON_PRIMARIO =
  'inline-flex h-10 items-center gap-2 rounded-lg bg-brand-action px-4 text-sm font-medium text-fg-on-brand hover:bg-brand-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2';

/**
 * Detalle del proveedor (Figma «Proveedores — detalle»): cabecera con estado,
 * KPIs reales (RPC `proveedor_resumen`), pestañas con conteos reales y el
 * panel «Cómo se conecta». Conserva todo lo que mostraba la versión anterior:
 * datos, dirección, fiscales DIAN, bancarios, productos, órdenes, facturas,
 * cuentas por pagar, pagos y stock.
 */
export function ProveedorDetalle({ supplierUuid }: ProveedorDetalleProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { formatDate } = useFormatDate();
  const moneda = useOrgCurrency();
  const dinero = useCallback((v: number | string | null | undefined) => formatoMoneda(v, moneda), [moneda]);

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [padre, setPadre] = useState<Supplier | null>(null);
  const [resumen, setResumen] = useState<ProveedorResumen | null>(null);
  const [ordenes, setOrdenes] = useState<PurchaseOrderSummary[]>([]);
  const [facturas, setFacturas] = useState<PurchaseInvoiceSummary[]>([]);
  const [cuentas, setCuentas] = useState<AccountPayableSummary[]>([]);
  const [pagos, setPagos] = useState<SupplierPaymentSummary[]>([]);
  const [productos, setProductos] = useState<SupplierProductLink[]>([]);
  const [stock, setStock] = useState<SupplierStockSummary[]>([]);
  const [cargando, setCargando] = useState(true);
  const [pestana, setPestana] = useState<Pestana>('resumen');
  const [recarga, setRecarga] = useState(0);
  const [verCuenta, setVerCuenta] = useState(false);

  const recargar = useCallback(() => setRecarga((n) => n + 1), []);
  const { accionesDe, aEliminar, setAEliminar } = useAccionesProveedor({ onCambio: recargar, conVer: false });

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        setCargando(true);
        const org = getOrganizationId();
        const { data, error } = await supplierService.getSupplierByUuid(supplierUuid, org);
        if (error) throw error;
        if (!data) {
          toast({ variant: 'destructive', title: 'Error', description: 'Proveedor no encontrado' });
          router.push(RUTA_PROVEEDORES);
          return;
        }
        if (cancelado) return;
        setSupplier(data);
        const [r, oc, fc, cxp, pay, prods, st, madre] = await Promise.all([
          supplierService.obtenerResumenProveedor(org, data.id).catch(() => null),
          supplierService.getSupplierPurchaseOrders(data.id, org),
          supplierService.getSupplierInvoices(data.id, org),
          supplierService.getSupplierAccountsPayable(data.id, org),
          supplierService.getSupplierPayments(data.id, org),
          supplierService.getSupplierProducts(data.id),
          supplierService.getSupplierStockSummary(data.id, org),
          data.parent_supplier_id
            ? supplierService.getSupplierById(data.parent_supplier_id, org).then((x) => x.data)
            : Promise.resolve(null),
        ]);
        if (cancelado) return;
        setResumen(r);
        setOrdenes(oc);
        setFacturas(fc);
        setCuentas(cxp);
        setPagos(pay);
        setProductos(prods);
        setStock(st);
        setPadre(madre);
      } catch (error: unknown) {
        console.error('Error cargando proveedor:', error);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: error instanceof Error ? error.message : 'No se pudo cargar el proveedor',
        });
        router.push(RUTA_PROVEEDORES);
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [supplierUuid, router, toast, recarga]);

  const cuentasAbiertas = useMemo(() => cuentas.filter((c) => c.status !== 'paid' && c.balance > 0), [cuentas]);

  const registrarPago = () => {
    if (cuentasAbiertas.length === 1) {
      router.push(`/app/finanzas/cuentas-por-pagar/${cuentasAbiertas[0].id}`);
      return;
    }
    setPestana('cuentas');
    toast({ title: 'Elige la cuenta a pagar', description: 'Abre la cuenta por pagar y registra el pago desde allí.' });
  };

  // ── Stock por producto (se une a la lista de productos que surte) ───────
  const stockPorProducto = useMemo(() => new Map(stock.map((s) => [s.product_id, s])), [stock]);
  const valorStock = useMemo(() => stock.reduce((s, x) => s + (x.stock_value || 0), 0), [stock]);
  const totalPagado = useMemo(() => pagos.reduce((s, p) => s + (p.amount || 0), 0), [pagos]);

  // ── Últimos documentos (los cuatro tipos mezclados) ─────────────────────
  const ultimos = useMemo(() => {
    type Doc = { id: string; titulo: string; tipo: string; fecha: string; estado: ReactNode; total: number; href?: string };
    const docs: Doc[] = [
      ...ordenes.map((o) => ({
        id: `oc-${o.id}`,
        titulo: `OC-${o.id}`,
        tipo: 'Orden de compra',
        fecha: o.created_at,
        estado: <StatusBadge estado={o.status} etiqueta={ESTADO_OC[o.status]} />,
        total: o.total,
        href: `/app/inventario/ordenes-compra/${o.id}`,
      })),
      ...facturas.map((f) => ({
        id: `fc-${f.id}`,
        titulo: f.number_ext ? `FC ${f.number_ext}` : `FC-${f.id.slice(0, 8)}`,
        tipo: 'Factura de compra',
        fecha: f.issue_date || f.created_at,
        estado: <StatusBadge estado={f.status} etiqueta={ESTADO_FACTURA[f.status]} />,
        total: f.total,
        href: `/app/finanzas/facturas-compra/${f.id}`,
      })),
      ...cuentas.map((c) => {
        const e = estadoCxp(c);
        return {
          id: `cxp-${c.id}`,
          titulo: `CxP ${c.invoice_number || c.id.slice(0, 8)}`,
          tipo: 'Cuenta por pagar',
          fecha: c.created_at,
          estado: <StatusBadge estado={e.estado} etiqueta={e.etiqueta} />,
          total: c.balance,
          href: `/app/finanzas/cuentas-por-pagar/${c.id}`,
        };
      }),
      ...pagos.map((p) => ({
        id: `pago-${p.id}`,
        titulo: `Pago ${p.reference || p.id.slice(0, 8)}`,
        tipo: etiquetaMetodo(p.method),
        fecha: p.payment_date || p.created_at,
        estado: <StatusBadge estado="aplicado" etiqueta="Aplicado" />,
        total: p.amount,
      })),
    ];
    return docs.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0)).slice(0, 5);
  }, [ordenes, facturas, cuentas, pagos]);

  if (cargando && !supplier) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-10 w-full rounded-lg" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }
  if (!supplier) return null;

  const activo = supplier.is_active !== false;
  const documento = documentoProveedor({ ...supplier, supplier_type: supplier.supplier_type });
  const condicion = condicionPago(supplier.payment_terms, supplier.credit_days);
  const direccion = [supplier.address, supplier.city, supplier.state, supplier.country, supplier.postal_code]
    .filter(Boolean)
    .join(', ');
  const codigoDian = TIPOS_DOCUMENTO_DIAN.find((t) => t.valor === supplier.identification_document_code)?.etiqueta;
  const entregas =
    resumen && resumen.entregas_total > 0 ? Math.round((resumen.entregas_a_tiempo * 100) / resumen.entregas_total) : null;

  const accionesMovil: AccionFila[] = [
    { id: 'orden-movil', etiqueta: 'Nueva orden de compra', icono: ClipboardList, onSelect: () => router.push(rutaNuevaOrdenCompra(supplier.id)) },
    {
      id: 'pagar-movil',
      etiqueta: 'Registrar pago',
      icono: HandCoins,
      onSelect: registrarPago,
      deshabilitada: cuentasAbiertas.length === 0,
      motivo: 'No tiene saldo por pagar',
    },
    ...accionesDe({ id: supplier.id, uuid: supplier.uuid, name: supplier.name, is_active: activo }).filter((a) => a.id !== 'orden'),
  ];

  // ── Columnas de las pestañas ────────────────────────────────────────────
  const colProductos: ColumnaTabla<SupplierProductLink>[] = [
    {
      id: 'producto',
      encabezado: 'Producto',
      celda: (p) => (
        <span className="inline-flex items-center gap-1.5">
          {p.is_preferred && <Star aria-label="Proveedor preferido" className="size-3.5 fill-warning-text text-warning-text" />}
          <span className="font-medium">{p.product?.name ?? `Producto #${p.product_id}`}</span>
        </span>
      ),
    },
    { id: 'sku', encabezado: 'SKU', variante: 'mono', ocultarDebajo: 'md', celda: (p) => p.product?.sku || '—' },
    { id: 'sku-prov', encabezado: 'SKU proveedor', variante: 'mono', ocultarDebajo: 'lg', celda: (p) => p.supplier_sku || '—' },
    { id: 'costo', encabezado: 'Costo', variante: 'importe', celda: (p) => dinero(p.cost) },
    {
      id: 'entrega',
      encabezado: 'Entrega',
      ocultarDebajo: 'lg',
      celda: (p) => (p.lead_time_days ? `${p.lead_time_days} d` : '—'),
    },
    {
      id: 'minimo',
      encabezado: 'Pedido mínimo',
      alinear: 'derecha',
      ocultarDebajo: 'xl',
      celda: (p) => (p.min_order_qty !== null ? p.min_order_qty.toLocaleString('es-CO') : '—'),
    },
    {
      id: 'stock',
      encabezado: 'Stock',
      alinear: 'derecha',
      celda: (p) => {
        const s = stockPorProducto.get(p.product_id);
        if (!s) return '—';
        return s.track_stock ? s.stock_total.toLocaleString('es-CO') : 'N/A';
      },
    },
    {
      id: 'valor',
      encabezado: 'Valor en stock',
      variante: 'importe',
      ocultarDebajo: 'md',
      celda: (p) => dinero(stockPorProducto.get(p.product_id)?.stock_value ?? 0),
    },
  ];

  const colOrdenes: ColumnaTabla<PurchaseOrderSummary>[] = [
    { id: 'numero', encabezado: 'Orden', celda: (o) => <span className="font-medium text-link">OC-{o.id}</span> },
    { id: 'fecha', encabezado: 'Creada', celda: (o) => formatDate(o.created_at) },
    {
      id: 'esperada',
      encabezado: 'Fecha esperada',
      ocultarDebajo: 'md',
      celda: (o) => (o.expected_date ? formatPlainDate(o.expected_date) : '—'),
    },
    { id: 'estado', encabezado: 'Estado', celda: (o) => <StatusBadge estado={o.status} etiqueta={ESTADO_OC[o.status]} /> },
    { id: 'total', encabezado: 'Total', variante: 'importe', celda: (o) => dinero(o.total) },
  ];

  const colFacturas: ColumnaTabla<PurchaseInvoiceSummary>[] = [
    {
      id: 'numero',
      encabezado: 'Factura',
      celda: (f) => <span className="font-medium text-link">{f.number_ext || `FC-${f.id.slice(0, 8)}`}</span>,
    },
    // Antes se consultaba `issue_date` y se pintaba `created_at`.
    { id: 'fecha', encabezado: 'Fecha', celda: (f) => formatDate(f.issue_date || f.created_at) },
    { id: 'estado', encabezado: 'Estado', celda: (f) => <StatusBadge estado={f.status} etiqueta={ESTADO_FACTURA[f.status]} /> },
    { id: 'total', encabezado: 'Total', variante: 'importe', celda: (f) => dinero(f.total) },
  ];

  const colCuentas: ColumnaTabla<AccountPayableSummary>[] = [
    {
      id: 'factura',
      encabezado: 'Factura',
      celda: (c) => <span className="font-medium text-link">{c.invoice_number || `CxP-${c.id.slice(0, 8)}`}</span>,
    },
    { id: 'vence', encabezado: 'Vencimiento', celda: (c) => (c.due_date ? formatDate(c.due_date) : '—') },
    {
      id: 'estado',
      encabezado: 'Estado',
      celda: (c) => {
        const e = estadoCxp(c);
        return <StatusBadge estado={e.estado} etiqueta={e.etiqueta} />;
      },
    },
    { id: 'monto', encabezado: 'Monto', variante: 'importe', ocultarDebajo: 'md', celda: (c) => dinero(c.amount) },
    {
      id: 'descuento',
      encabezado: 'Descuento',
      variante: 'importe',
      ocultarDebajo: 'xl',
      celda: (c) => (c.discount_amount > 0 ? dinero(c.discount_amount) : '—'),
    },
    { id: 'saldo', encabezado: 'Saldo', variante: 'importe', celda: (c) => <span className="font-medium">{dinero(c.balance)}</span> },
  ];

  const colPagos: ColumnaTabla<SupplierPaymentSummary>[] = [
    { id: 'fecha', encabezado: 'Fecha', celda: (p) => formatDate(p.payment_date || p.created_at) },
    { id: 'metodo', encabezado: 'Método', celda: (p) => etiquetaMetodo(p.method) },
    { id: 'referencia', encabezado: 'Referencia', ocultarDebajo: 'md', celda: (p) => p.reference || '—' },
    { id: 'origen', encabezado: 'Origen', ocultarDebajo: 'lg', celda: (p) => (p.source === 'account_payable' ? 'Cuenta por pagar' : 'Factura') },
    { id: 'monto', encabezado: 'Monto', variante: 'importe', celda: (p) => <span className="font-medium text-success-text">{dinero(p.amount)}</span> },
  ];

  const pestanas = [
    { valor: 'resumen' as const, etiqueta: 'Resumen' },
    { valor: 'productos' as const, etiqueta: 'Productos que surte', contador: resumen?.productos ?? productos.length },
    { valor: 'ordenes' as const, etiqueta: 'Órdenes de compra', contador: resumen?.ordenes ?? ordenes.length },
    { valor: 'facturas' as const, etiqueta: 'Facturas de compra', contador: resumen?.facturas ?? facturas.length },
    { valor: 'cuentas' as const, etiqueta: 'Cuentas por pagar', contador: resumen?.cuentas_por_pagar ?? cuentas.length },
    { valor: 'pagos' as const, etiqueta: 'Pagos', contador: resumen?.pagos ?? pagos.length },
  ];

  const recientes = (total: number | undefined, mostradas: number, href: string, sustantivo: string) =>
    total !== undefined && total > mostradas ? (
      <p className="text-[13px] text-fg-secondary">
        Mostrando las {mostradas} más recientes de {total.toLocaleString('es-CO')} {sustantivo}.{' '}
        <Link href={href} className="font-medium text-link hover:underline">
          Ver todas
        </Link>
      </p>
    ) : null;

  const panel = (valor: Pestana, contenido: ReactNode) => (
    <div
      role="tabpanel"
      id={idPanel(ID_TABS, valor)}
      aria-labelledby={idPestana(ID_TABS, valor)}
      hidden={pestana !== valor}
      tabIndex={0}
      className="flex flex-col gap-4 focus-visible:outline-none"
    >
      {pestana === valor && contenido}
    </div>
  );

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <PageHeader
        variante="detail"
        titulo={supplier.name}
        badge={<StatusBadge estado={activo ? 'activo' : 'inactivo'} tamano="md" />}
        subtitulo={`${documento} · ${tipoProveedor(supplier.supplier_type)} · ${condicion}`}
        icono={Truck}
        miniatura={
          supplier.logo_url ? (
            <Image src={supplier.logo_url} alt="" width={48} height={48} className="size-12 object-cover" />
          ) : undefined
        }
        cargando={cargando}
        migas={[
          { etiqueta: 'Inventario', href: '/app/inventario' },
          { etiqueta: 'Proveedores', href: RUTA_PROVEEDORES },
          { etiqueta: supplier.name },
        ]}
        acciones={
          <>
            <button type="button" onClick={registrarPago} disabled={cuentasAbiertas.length === 0} className={CLASE_BOTON_SECUNDARIO}>
              <HandCoins aria-hidden="true" className="size-4" strokeWidth={1.5} />
              Registrar pago
            </button>
            <Link href={rutaNuevaOrdenCompra(supplier.id)} className={CLASE_BOTON_PRIMARIO}>
              <ClipboardList aria-hidden="true" className="size-4" strokeWidth={1.5} />
              Nueva orden de compra
            </Link>
            <RowActionsMenu
              orientacion="horizontal"
              tamano="md"
              titulo={supplier.name}
              acciones={accionesDe({ id: supplier.id, uuid: supplier.uuid, name: supplier.name, is_active: activo }).filter(
                (a) => a.id !== 'orden',
              )}
            />
          </>
        }
        movil={{
          subtitulo: documento,
          accion: <RowActionsMenu orientacion="horizontal" titulo={supplier.name} acciones={accionesMovil} />,
        }}
        debajo={
          <TabBar
            id={ID_TABS}
            etiqueta="Secciones del proveedor"
            valor={pestana}
            onValorChange={setPestana}
            pestanas={pestanas}
            className="w-full"
          />
        }
      />

      {panel(
        'resumen',
        <>
          <KpiStrip etiqueta="Cifras del proveedor">
            <StatCard
              etiqueta="Saldo por pagar"
              icono={WalletCards}
              cargando={!resumen}
              valor={dinero(resumen?.saldo ?? 0)}
              detalle={resumen ? `${resumen.facturas_abiertas} ${resumen.facturas_abiertas === 1 ? 'factura abierta' : 'facturas abiertas'}` : undefined}
              onClick={() => setPestana('cuentas')}
            />
            <StatCard
              etiqueta="Vencido"
              icono={AlertTriangle}
              cargando={!resumen}
              valor={dinero(resumen?.vencido ?? 0)}
              tono={resumen && resumen.vencido > 0 ? 'peligro' : 'neutro'}
              tendencia={resumen && resumen.vencido > 0 ? 'baja' : undefined}
              detalle={
                resumen
                  ? resumen.facturas_vencidas > 0
                    ? `${resumen.facturas_vencidas} ${resumen.facturas_vencidas === 1 ? 'factura' : 'facturas'} · ${resumen.max_dias_mora} días de mora`
                    : 'Sin facturas vencidas'
                  : undefined
              }
              onClick={() => setPestana('cuentas')}
            />
            <StatCard
              etiqueta="Compras últimos 12 meses"
              icono={TrendingUp}
              cargando={!resumen}
              valor={dinero(resumen?.compras_12m ?? 0)}
              detalle={resumen ? `${resumen.ordenes_12m} órdenes · ${resumen.facturas_12m} facturas` : undefined}
            />
            <StatCard
              etiqueta="Entregas a tiempo"
              icono={Truck}
              cargando={!resumen}
              valor={entregas === null ? '—' : `${entregas} %`}
              tono={entregas === null ? 'neutro' : entregas >= 80 ? 'exito' : entregas >= 60 ? 'advertencia' : 'peligro'}
              tendencia={entregas !== null && entregas >= 80 ? 'sube' : undefined}
              detalle={
                resumen
                  ? resumen.entregas_total > 0
                    ? `${resumen.entregas_a_tiempo} de ${resumen.entregas_total} recepciones`
                    : 'Sin órdenes con fecha esperada'
                  : undefined
              }
            />
          </KpiStrip>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-5">
            <div className="flex min-w-0 flex-col gap-4 lg:col-span-2 lg:gap-5">
              <Tarjeta
                titulo="Datos generales"
                accion={
                  <Link href={`${RUTA_PROVEEDORES}/${supplier.uuid}/editar`} className="text-sm font-medium text-link hover:underline">
                    Editar
                  </Link>
                }
              >
                <dl>
                  <Fila etiqueta="Tipo">{tipoProveedor(supplier.supplier_type)}</Fila>
                  <Fila etiqueta="Documento">{documento}</Fila>
                  {supplier.trade_name && <Fila etiqueta="Nombre comercial">{supplier.trade_name}</Fila>}
                  {padre && (
                    <Fila etiqueta="Empresa asociada">
                      <Link href={`${RUTA_PROVEEDORES}/${padre.uuid}`} className="text-link hover:underline">
                        {padre.name}
                      </Link>
                    </Fila>
                  )}
                  <Fila etiqueta="Contacto">{supplier.contact || '—'}</Fila>
                  <Fila etiqueta="Teléfono">
                    {supplier.phone ? (
                      <a href={`tel:${supplier.phone.replace(/\s+/g, '')}`} className="text-link hover:underline">
                        {supplier.phone}
                      </a>
                    ) : (
                      '—'
                    )}
                  </Fila>
                  <Fila etiqueta="Correo">
                    {supplier.email ? (
                      <a href={`mailto:${supplier.email}`} className="text-link hover:underline">
                        {supplier.email}
                      </a>
                    ) : (
                      '—'
                    )}
                  </Fila>
                  {supplier.website && (
                    <Fila etiqueta="Sitio web">
                      <a
                        href={/^https?:\/\//i.test(supplier.website) ? supplier.website : `https://${supplier.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-link hover:underline"
                      >
                        {supplier.website}
                      </a>
                    </Fila>
                  )}
                  <Fila etiqueta="Dirección">{direccion || '—'}</Fila>
                  <Fila etiqueta="Registrado">{formatDate(supplier.created_at)}</Fila>
                </dl>
              </Tarjeta>

              <Tarjeta titulo="Fiscal y bancario">
                <dl>
                  <Fila etiqueta="Régimen">{etiquetaRegimen(supplier.tax_regime)}</Fila>
                  <Fila etiqueta="Responsabilidades">
                    {supplier.fiscal_responsibilities && supplier.fiscal_responsibilities.length > 0
                      ? supplier.fiscal_responsibilities.join(' · ')
                      : '—'}
                  </Fila>
                  <Fila etiqueta="Tipo de documento DIAN">{codigoDian ?? (supplier.identification_document_code || '—')}</Fila>
                  {supplier.legal_organization_code && (
                    <Fila etiqueta="Tipo de organización">
                      {supplier.legal_organization_code === '1' ? 'Empresa' : 'Persona natural'}
                    </Fila>
                  )}
                  <Fila etiqueta="Municipio">{supplier.municipality_code || '—'}</Fila>
                  {supplier.country_code && <Fila etiqueta="Código de país">{supplier.country_code}</Fila>}
                  {supplier.tax_id && <Fila etiqueta="Identificación tributaria">{supplier.tax_id}</Fila>}
                  <Fila etiqueta="Condición de pago">{condicion}</Fila>
                  <Fila etiqueta="Banco">
                    {[supplier.bank_name, etiquetaTipoCuenta(supplier.account_type) && `Cuenta de ${etiquetaTipoCuenta(supplier.account_type).toLowerCase()}`]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </Fila>
                  <Fila etiqueta="Número de cuenta">
                    {supplier.bank_account ? (
                      <span className="inline-flex flex-wrap items-center gap-2">
                        <span className="font-mono tabular-nums">{verCuenta ? supplier.bank_account : cuentaEnmascarada(supplier.bank_account)}</span>
                        <button
                          type="button"
                          onClick={() => setVerCuenta((v) => !v)}
                          aria-label={verCuenta ? 'Ocultar número de cuenta' : 'Mostrar número de cuenta'}
                          className="inline-flex size-7 items-center justify-center rounded-md text-fg-secondary hover:bg-hover"
                        >
                          {verCuenta ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(supplier.bank_account ?? '');
                              toast({ title: 'Número de cuenta copiado' });
                            } catch {
                              toast({ variant: 'destructive', title: 'No se pudo copiar' });
                            }
                          }}
                          className="inline-flex items-center gap-1 text-sm font-medium text-link hover:underline"
                        >
                          <Copy aria-hidden="true" className="size-3.5" /> Copiar
                        </button>
                      </span>
                    ) : (
                      '—'
                    )}
                  </Fila>
                </dl>
              </Tarjeta>

              {(supplier.description || supplier.notes) && (
                <Tarjeta titulo="Descripción y notas">
                  <div className="flex flex-col gap-4 text-sm text-fg-secondary">
                    {supplier.description && <HtmlContentRenderer html={supplier.description} />}
                    {supplier.notes && (
                      <div className="rounded-lg bg-subtle p-3">
                        <p className="mb-1 text-xs font-medium text-fg-secondary">Notas internas</p>
                        <HtmlContentRenderer html={supplier.notes} />
                      </div>
                    )}
                  </div>
                </Tarjeta>
              )}

              <Tarjeta titulo="Últimos documentos">
                <DataTable
                  etiqueta="Últimos documentos"
                  densidad="compacta"
                  columnas={[
                    {
                      id: 'doc',
                      encabezado: 'Documento',
                      celda: (d) => (
                        <div className="flex flex-col">
                          <span className="font-medium text-link">{d.titulo}</span>
                          <span className="text-xs text-fg-secondary">{d.tipo}</span>
                        </div>
                      ),
                    },
                    { id: 'fecha', encabezado: 'Fecha', celda: (d) => formatDate(d.fecha) },
                    { id: 'estado', encabezado: 'Estado', ocultarDebajo: 'sm', celda: (d) => d.estado },
                    { id: 'total', encabezado: 'Total', variante: 'importe', celda: (d) => dinero(d.total) },
                  ]}
                  filas={ultimos}
                  obtenerId={(d) => d.id}
                  onFilaClick={(d) => d.href && router.push(d.href)}
                  vacio={{
                    titulo: 'Sin documentos todavía',
                    descripcion: 'Cuando le hagas una orden de compra aparecerá aquí.',
                    icono: FileText,
                    accion: { etiqueta: 'Nueva orden de compra', href: rutaNuevaOrdenCompra(supplier.id), icono: Plus },
                    compacto: true,
                  }}
                />
              </Tarjeta>
            </div>

            <section aria-label="Cómo se conecta" className="flex h-fit flex-col gap-3 rounded-xl border border-line bg-surface p-4 sm:p-6">
              <h2 className="text-base font-semibold text-fg">Cómo se conecta</h2>
              <RelatedLinkCard
                icono={ClipboardList}
                etiqueta={`Órdenes de compra${resumen ? ` · ${resumen.ordenes_abiertas} abiertas` : ''}`}
                valor={resumen?.ordenes ?? ordenes.length}
                cargando={!resumen}
                onAccion={() => setPestana('ordenes')}
              />
              <RelatedLinkCard
                icono={FileText}
                etiqueta="Facturas de compra"
                valor={resumen?.facturas ?? facturas.length}
                cargando={!resumen}
                onAccion={() => setPestana('facturas')}
              />
              <RelatedLinkCard
                icono={HandCoins}
                etiqueta="Cuentas por pagar abiertas"
                valor={resumen?.facturas_abiertas ?? cuentasAbiertas.length}
                cargando={!resumen}
                tono={(resumen?.facturas_abiertas ?? 0) > 0 ? 'warning' : 'neutral'}
                onAccion={() => setPestana('cuentas')}
              />
              {resumen && resumen.vencido > 0 && (
                <RelatedLinkCard
                  icono={AlertTriangle}
                  etiqueta="Vencido"
                  valor={dinero(resumen.vencido)}
                  tono="danger"
                  textoAccion="Pagar"
                  onAccion={registrarPago}
                />
              )}
              <RelatedLinkCard
                icono={Package}
                etiqueta="Productos que surte"
                valor={resumen?.productos ?? productos.length}
                cargando={!resumen}
                onAccion={() => setPestana('productos')}
              />
              <RelatedLinkCard icono={Boxes} etiqueta="Lotes recibidos de este proveedor" valor={resumen?.lotes ?? 0} cargando={!resumen} />
              <RelatedLinkCard
                icono={Banknote}
                etiqueta="Pagos registrados"
                valor={resumen?.pagos ?? pagos.length}
                cargando={!resumen}
                onAccion={() => setPestana('pagos')}
              />
            </section>
          </div>
        </>,
      )}

      {panel(
        'productos',
        <>
          {stock.length > 0 && (
            <p className="text-sm text-fg-secondary">
              Valor en stock de sus productos (todas las sucursales): <span className="font-medium text-fg">{dinero(valorStock)}</span>
            </p>
          )}
          <DataTable
            etiqueta="Productos que surte"
            columnas={colProductos}
            filas={productos}
            obtenerId={(p) => String(p.id)}
            onFilaClick={(p) => p.product?.uuid && router.push(`/app/inventario/productos/${p.product.uuid}`)}
            etiquetaFila={(p) => p.product?.name ?? `Producto #${p.product_id}`}
            vacio={{
              titulo: 'No hay productos vinculados a este proveedor',
              descripcion: 'El vínculo se crea desde la pestaña Proveedores de cada producto.',
              icono: Package,
            }}
          />
        </>,
      )}

      {panel(
        'ordenes',
        <>
          {recientes(resumen?.ordenes, ordenes.length, '/app/inventario/ordenes-compra', 'órdenes')}
          <DataTable
            etiqueta="Órdenes de compra"
            columnas={colOrdenes}
            filas={ordenes}
            obtenerId={(o) => String(o.id)}
            onFilaClick={(o) => router.push(`/app/inventario/ordenes-compra/${o.id}`)}
            etiquetaFila={(o) => `OC-${o.id}`}
            vacio={{
              titulo: 'No hay órdenes de compra registradas',
              icono: ClipboardList,
              accion: { etiqueta: 'Nueva orden de compra', href: rutaNuevaOrdenCompra(supplier.id), icono: Plus },
            }}
          />
        </>,
      )}

      {panel(
        'facturas',
        <>
          {recientes(resumen?.facturas, facturas.length, '/app/finanzas/facturas-compra', 'facturas')}
          <DataTable
            etiqueta="Facturas de compra"
            columnas={colFacturas}
            filas={facturas}
            obtenerId={(f) => f.id}
            onFilaClick={(f) => router.push(`/app/finanzas/facturas-compra/${f.id}`)}
            etiquetaFila={(f) => f.number_ext || `FC-${f.id.slice(0, 8)}`}
            vacio={{ titulo: 'No hay facturas de compra registradas', icono: FileText }}
          />
        </>,
      )}

      {panel(
        'cuentas',
        <DataTable
          etiqueta="Cuentas por pagar"
          columnas={colCuentas}
          filas={cuentas}
          obtenerId={(c) => c.id}
          onFilaClick={(c) => router.push(`/app/finanzas/cuentas-por-pagar/${c.id}`)}
          etiquetaFila={(c) => c.invoice_number || `CxP-${c.id.slice(0, 8)}`}
          tonoFila={(c) => (estadoCxp(c).estado === 'vencida' ? 'peligro' : undefined)}
          vacio={{ titulo: 'No hay cuentas por pagar registradas', icono: WalletCards }}
        />,
      )}

      {panel(
        'pagos',
        <>
          {pagos.length > 0 && (
            <p className="text-sm text-fg-secondary">
              Total pagado: <span className="font-medium text-success-text">{dinero(totalPagado)}</span>
            </p>
          )}
          <DataTable
            etiqueta="Pagos"
            columnas={colPagos}
            filas={pagos}
            obtenerId={(p) => p.id}
            vacio={{ titulo: 'No hay pagos registrados a este proveedor', icono: Banknote }}
          />
        </>,
      )}

      <DialogoEliminarProveedor
        proveedor={aEliminar}
        onCerrar={() => setAEliminar(null)}
        onEliminado={() => {
          setAEliminar(null);
          router.push(RUTA_PROVEEDORES);
        }}
        onDesactivado={() => {
          setAEliminar(null);
          recargar();
        }}
      />
    </div>
  );
}

export default ProveedorDetalle;
