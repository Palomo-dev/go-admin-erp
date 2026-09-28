'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
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
import { useFormatoEntero, useLocaleIntl } from '@/components/kit/useIdiomaKit';
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
import { formatDateInTz, formatPlainDate } from '@/lib/utils/dateDisplay';
import { DialogoEliminarProveedor } from '../DialogoEliminarProveedor';
import {
  condicionPago,
  cuentaEnmascarada,
  documentoProveedor,
  etiquetaDocumentoDian,
  etiquetaRegimen,
  etiquetaTipoCuenta,
  formatoMoneda,
  tipoProveedor,
  TIPOS_CUENTA,
  type Traductor,
} from '../formato';
import { RUTA_PROVEEDORES, rutaNuevaOrdenCompra, useAccionesProveedor } from '../useAccionesProveedor';

interface ProveedorDetalleProps {
  supplierUuid: string;
}

type Pestana = 'resumen' | 'productos' | 'ordenes' | 'facturas' | 'cuentas' | 'pagos';

const ID_TABS = 'proveedor';

/** Estados de OC y de factura con etiqueta propia (`proveedores.detalle.estadosOc|estadosFactura`). */
const ESTADOS_OC = new Set(['draft', 'pending', 'approved', 'sent', 'partial', 'received', 'completed', 'cancelled']);
const ESTADOS_FACTURA = new Set(['draft', 'received', 'partial', 'paid', 'cancelled', 'void']);
const ESTADOS_CXP = new Set(['pending', 'partial', 'paid', 'overdue']);

const etiquetaOc = (s: string, t: Traductor) => (ESTADOS_OC.has(s) ? t(`estadosOc.${s}`) : undefined);
const etiquetaFactura = (s: string, t: Traductor) => (ESTADOS_FACTURA.has(s) ? t(`estadosFactura.${s}`) : undefined);

/** Método de pago guardado → clave de `proveedores.detalle.metodos`. */
const METODO_PAGO: Record<string, string> = {
  cash: 'efectivo',
  efectivo: 'efectivo',
  transfer: 'transferencia',
  bank_transfer: 'transferencia',
  transferencia: 'transferencia',
  card: 'tarjeta',
  credit_card: 'tarjeta',
  debit_card: 'tarjeta',
  check: 'cheque',
  cheque: 'cheque',
};

const etiquetaMetodo = (m: string | null | undefined, t: Traductor) => {
  if (!m) return '—';
  const clave = METODO_PAGO[m.toLowerCase()];
  return clave ? t(`metodos.${clave}`) : m.charAt(0).toUpperCase() + m.slice(1);
};

const DIA_MS = 86_400_000;

/** Estado de una cuenta por pagar: «Vencida 12 d» si ya pasó y tiene saldo. */
function estadoCxp(c: AccountPayableSummary, t: Traductor): { estado: string; etiqueta: string } {
  if (c.status !== 'paid' && c.balance > 0 && c.due_date) {
    const dias = Math.floor((Date.now() - new Date(c.due_date).getTime()) / DIA_MS);
    if (dias > 0) return { estado: 'vencida', etiqueta: t('estadosCxp.vencidaDias', { dias }) };
  }
  return { estado: c.status, etiqueta: ESTADOS_CXP.has(c.status) ? t(`estadosCxp.${c.status}`) : c.status };
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
  const t = useTranslations('proveedores.detalle');
  const tc = useTranslations('proveedores.comun');
  const tf = useTranslations('proveedores.formato');
  const entero = useFormatoEntero();
  const localeIntl = useLocaleIntl();
  const { timezone } = useFormatDate();
  // timestamptz en la zona de la organización y con el formato del idioma activo.
  const formatDate = useCallback(
    (v: string | null | undefined) => formatDateInTz(v, timezone, { locale: localeIntl, day: '2-digit', month: '2-digit', year: 'numeric' }),
    [localeIntl, timezone],
  );
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
          toast({ variant: 'destructive', title: tc('error'), description: tc('noEncontrado') });
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
          title: tc('error'),
          description: error instanceof Error ? error.message : t('errorCarga'),
        });
        router.push(RUTA_PROVEEDORES);
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [supplierUuid, router, toast, recarga, t, tc]);

  const cuentasAbiertas = useMemo(() => cuentas.filter((c) => c.status !== 'paid' && c.balance > 0), [cuentas]);

  const registrarPago = () => {
    if (cuentasAbiertas.length === 1) {
      router.push(`/app/finanzas/cuentas-por-pagar/${cuentasAbiertas[0].id}`);
      return;
    }
    setPestana('cuentas');
    toast({ title: t('pago.elegirCuenta'), description: t('pago.elegirCuentaDescripcion') });
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
        tipo: t('tiposDocumento.orden'),
        fecha: o.created_at,
        estado: <StatusBadge estado={o.status} etiqueta={etiquetaOc(o.status, t)} />,
        total: o.total,
        href: `/app/inventario/ordenes-compra/${o.id}`,
      })),
      ...facturas.map((f) => ({
        id: `fc-${f.id}`,
        titulo: f.number_ext ? `FC ${f.number_ext}` : `FC-${f.id.slice(0, 8)}`,
        tipo: t('tiposDocumento.factura'),
        fecha: f.issue_date || f.created_at,
        estado: <StatusBadge estado={f.status} etiqueta={etiquetaFactura(f.status, t)} />,
        total: f.total,
        href: `/app/finanzas/facturas-compra/${f.id}`,
      })),
      ...cuentas.map((c) => {
        const e = estadoCxp(c, t);
        return {
          id: `cxp-${c.id}`,
          titulo: `CxP ${c.invoice_number || c.id.slice(0, 8)}`,
          tipo: t('tiposDocumento.cuenta'),
          fecha: c.created_at,
          estado: <StatusBadge estado={e.estado} etiqueta={e.etiqueta} />,
          total: c.balance,
          href: `/app/finanzas/cuentas-por-pagar/${c.id}`,
        };
      }),
      ...pagos.map((p) => ({
        id: `pago-${p.id}`,
        titulo: t('pagoRef', { referencia: p.reference || p.id.slice(0, 8) }),
        tipo: etiquetaMetodo(p.method, t),
        fecha: p.payment_date || p.created_at,
        estado: <StatusBadge estado="aplicado" />,
        total: p.amount,
      })),
    ];
    return docs.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0)).slice(0, 5);
  }, [ordenes, facturas, cuentas, pagos, t]);

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
  const documento = documentoProveedor({ ...supplier, supplier_type: supplier.supplier_type }, tf);
  const condicion = condicionPago(supplier.payment_terms, supplier.credit_days, tf);
  const direccion = [supplier.address, supplier.city, supplier.state, supplier.country, supplier.postal_code]
    .filter(Boolean)
    .join(', ');
  const codigoDian = etiquetaDocumentoDian(supplier.identification_document_code, tf);
  const tipoCuenta = TIPOS_CUENTA.some((x) => x.valor === supplier.account_type)
    ? t(`cuentaDe.${supplier.account_type}`)
    : supplier.account_type
      ? t('cuentaDeOtro', { tipo: etiquetaTipoCuenta(supplier.account_type, tf).toLowerCase() })
      : '';
  const entregas =
    resumen && resumen.entregas_total > 0 ? Math.round((resumen.entregas_a_tiempo * 100) / resumen.entregas_total) : null;

  const accionesMovil: AccionFila[] = [
    { id: 'orden-movil', etiqueta: t('nuevaOrden'), icono: ClipboardList, onSelect: () => router.push(rutaNuevaOrdenCompra(supplier.id)) },
    {
      id: 'pagar-movil',
      etiqueta: t('registrarPago'),
      icono: HandCoins,
      onSelect: registrarPago,
      deshabilitada: cuentasAbiertas.length === 0,
      motivo: t('sinSaldo'),
    },
    ...accionesDe({ id: supplier.id, uuid: supplier.uuid, name: supplier.name, is_active: activo }).filter((a) => a.id !== 'orden'),
  ];

  // ── Columnas de las pestañas ────────────────────────────────────────────
  const colProductos: ColumnaTabla<SupplierProductLink>[] = [
    {
      id: 'producto',
      encabezado: t('columnas.producto'),
      celda: (p) => (
        <span className="inline-flex items-center gap-1.5">
          {p.is_preferred && <Star aria-label={t('preferido')} className="size-3.5 fill-warning-text text-warning-text" />}
          <span className="font-medium">{p.product?.name ?? t('productoN', { id: p.product_id })}</span>
        </span>
      ),
    },
    { id: 'sku', encabezado: t('columnas.sku'), variante: 'mono', ocultarDebajo: 'md', celda: (p) => p.product?.sku || '—' },
    { id: 'sku-prov', encabezado: t('columnas.skuProveedor'), variante: 'mono', ocultarDebajo: 'lg', celda: (p) => p.supplier_sku || '—' },
    { id: 'costo', encabezado: t('columnas.costo'), variante: 'importe', celda: (p) => dinero(p.cost) },
    {
      id: 'entrega',
      encabezado: t('columnas.entrega'),
      ocultarDebajo: 'lg',
      celda: (p) => (p.lead_time_days ? t('diasCorto', { dias: p.lead_time_days }) : '—'),
    },
    {
      id: 'minimo',
      encabezado: t('columnas.pedidoMinimo'),
      alinear: 'derecha',
      ocultarDebajo: 'xl',
      celda: (p) => (p.min_order_qty !== null ? entero(p.min_order_qty) : '—'),
    },
    {
      id: 'stock',
      encabezado: t('columnas.stock'),
      alinear: 'derecha',
      celda: (p) => {
        const s = stockPorProducto.get(p.product_id);
        if (!s) return '—';
        return s.track_stock ? entero(s.stock_total) : t('noAplica');
      },
    },
    {
      id: 'valor',
      encabezado: t('columnas.valorStock'),
      variante: 'importe',
      ocultarDebajo: 'md',
      celda: (p) => dinero(stockPorProducto.get(p.product_id)?.stock_value ?? 0),
    },
  ];

  const colOrdenes: ColumnaTabla<PurchaseOrderSummary>[] = [
    { id: 'numero', encabezado: t('columnas.orden'), celda: (o) => <span className="font-medium text-link">OC-{o.id}</span> },
    { id: 'fecha', encabezado: t('columnas.creada'), celda: (o) => formatDate(o.created_at) },
    {
      id: 'esperada',
      encabezado: t('columnas.fechaEsperada'),
      ocultarDebajo: 'md',
      celda: (o) => (o.expected_date ? formatPlainDate(o.expected_date) : '—'),
    },
    { id: 'estado', encabezado: t('columnas.estado'), celda: (o) => <StatusBadge estado={o.status} etiqueta={etiquetaOc(o.status, t)} /> },
    { id: 'total', encabezado: t('columnas.total'), variante: 'importe', celda: (o) => dinero(o.total) },
  ];

  const colFacturas: ColumnaTabla<PurchaseInvoiceSummary>[] = [
    {
      id: 'numero',
      encabezado: t('columnas.factura'),
      celda: (f) => <span className="font-medium text-link">{f.number_ext || `FC-${f.id.slice(0, 8)}`}</span>,
    },
    // Antes se consultaba `issue_date` y se pintaba `created_at`.
    { id: 'fecha', encabezado: t('columnas.fecha'), celda: (f) => formatDate(f.issue_date || f.created_at) },
    { id: 'estado', encabezado: t('columnas.estado'), celda: (f) => <StatusBadge estado={f.status} etiqueta={etiquetaFactura(f.status, t)} /> },
    { id: 'total', encabezado: t('columnas.total'), variante: 'importe', celda: (f) => dinero(f.total) },
  ];

  const colCuentas: ColumnaTabla<AccountPayableSummary>[] = [
    {
      id: 'factura',
      encabezado: t('columnas.factura'),
      celda: (c) => <span className="font-medium text-link">{c.invoice_number || `CxP-${c.id.slice(0, 8)}`}</span>,
    },
    { id: 'vence', encabezado: t('columnas.vencimiento'), celda: (c) => (c.due_date ? formatDate(c.due_date) : '—') },
    {
      id: 'estado',
      encabezado: t('columnas.estado'),
      celda: (c) => {
        const e = estadoCxp(c, t);
        return <StatusBadge estado={e.estado} etiqueta={e.etiqueta} />;
      },
    },
    { id: 'monto', encabezado: t('columnas.monto'), variante: 'importe', ocultarDebajo: 'md', celda: (c) => dinero(c.amount) },
    {
      id: 'descuento',
      encabezado: t('columnas.descuento'),
      variante: 'importe',
      ocultarDebajo: 'xl',
      celda: (c) => (c.discount_amount > 0 ? dinero(c.discount_amount) : '—'),
    },
    { id: 'saldo', encabezado: t('columnas.saldo'), variante: 'importe', celda: (c) => <span className="font-medium">{dinero(c.balance)}</span> },
  ];

  const colPagos: ColumnaTabla<SupplierPaymentSummary>[] = [
    { id: 'fecha', encabezado: t('columnas.fecha'), celda: (p) => formatDate(p.payment_date || p.created_at) },
    { id: 'metodo', encabezado: t('columnas.metodo'), celda: (p) => etiquetaMetodo(p.method, t) },
    { id: 'referencia', encabezado: t('columnas.referencia'), ocultarDebajo: 'md', celda: (p) => p.reference || '—' },
    {
      id: 'origen',
      encabezado: t('columnas.origen'),
      ocultarDebajo: 'lg',
      celda: (p) => (p.source === 'account_payable' ? t('tiposDocumento.cuenta') : t('origenFactura')),
    },
    { id: 'monto', encabezado: t('columnas.monto'), variante: 'importe', celda: (p) => <span className="font-medium text-success-text">{dinero(p.amount)}</span> },
  ];

  const pestanas = [
    { valor: 'resumen' as const, etiqueta: t('pestanas.resumen') },
    { valor: 'productos' as const, etiqueta: t('pestanas.productos'), contador: resumen?.productos ?? productos.length },
    { valor: 'ordenes' as const, etiqueta: t('pestanas.ordenes'), contador: resumen?.ordenes ?? ordenes.length },
    { valor: 'facturas' as const, etiqueta: t('pestanas.facturas'), contador: resumen?.facturas ?? facturas.length },
    { valor: 'cuentas' as const, etiqueta: t('pestanas.cuentas'), contador: resumen?.cuentas_por_pagar ?? cuentas.length },
    { valor: 'pagos' as const, etiqueta: t('pestanas.pagos'), contador: resumen?.pagos ?? pagos.length },
  ];

  const recientes = (total: number | undefined, mostradas: number, href: string, tipo: 'ordenes' | 'facturas') =>
    total !== undefined && total > mostradas ? (
      <p className="text-[13px] text-fg-secondary">
        {tipo === 'ordenes'
          ? t('recientes.ordenes', { mostradas, total: entero(total) })
          : t('recientes.facturas', { mostradas, total: entero(total) })}{' '}
        <Link href={href} className="font-medium text-link hover:underline">
          {t('recientes.verTodas')}
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
        subtitulo={`${documento} · ${tipoProveedor(supplier.supplier_type, tf)} · ${condicion}`}
        icono={Truck}
        miniatura={
          supplier.logo_url ? (
            <Image src={supplier.logo_url} alt="" width={48} height={48} className="size-12 object-cover" />
          ) : undefined
        }
        cargando={cargando}
        migas={[
          { etiqueta: tc('inventario'), href: '/app/inventario' },
          { etiqueta: tc('titulo'), href: RUTA_PROVEEDORES },
          { etiqueta: supplier.name },
        ]}
        acciones={
          <>
            <button type="button" onClick={registrarPago} disabled={cuentasAbiertas.length === 0} className={CLASE_BOTON_SECUNDARIO}>
              <HandCoins aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('registrarPago')}
            </button>
            <Link href={rutaNuevaOrdenCompra(supplier.id)} className={CLASE_BOTON_PRIMARIO}>
              <ClipboardList aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('nuevaOrden')}
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
            etiqueta={t('pestanas.etiqueta')}
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
          <KpiStrip etiqueta={t('kpis.etiqueta')}>
            <StatCard
              etiqueta={t('kpis.saldo')}
              icono={WalletCards}
              cargando={!resumen}
              valor={dinero(resumen?.saldo ?? 0)}
              detalle={
                resumen ? t('kpis.facturasAbiertas', { count: resumen.facturas_abiertas, n: entero(resumen.facturas_abiertas) }) : undefined
              }
              onClick={() => setPestana('cuentas')}
            />
            <StatCard
              etiqueta={t('kpis.vencido')}
              icono={AlertTriangle}
              cargando={!resumen}
              valor={dinero(resumen?.vencido ?? 0)}
              tono={resumen && resumen.vencido > 0 ? 'peligro' : 'neutro'}
              tendencia={resumen && resumen.vencido > 0 ? 'baja' : undefined}
              detalle={
                resumen
                  ? resumen.facturas_vencidas > 0
                    ? t('kpis.vencidoDetalle', {
                        count: resumen.facturas_vencidas,
                        n: entero(resumen.facturas_vencidas),
                        dias: resumen.max_dias_mora,
                      })
                    : t('kpis.sinVencidas')
                  : undefined
              }
              onClick={() => setPestana('cuentas')}
            />
            <StatCard
              etiqueta={t('kpis.compras12m')}
              icono={TrendingUp}
              cargando={!resumen}
              valor={dinero(resumen?.compras_12m ?? 0)}
              detalle={resumen ? t('kpis.compras12mDetalle', { ordenes: resumen.ordenes_12m, facturas: resumen.facturas_12m }) : undefined}
            />
            <StatCard
              etiqueta={t('kpis.entregas')}
              icono={Truck}
              cargando={!resumen}
              valor={entregas === null ? '—' : t('porcentaje', { valor: entregas })}
              tono={entregas === null ? 'neutro' : entregas >= 80 ? 'exito' : entregas >= 60 ? 'advertencia' : 'peligro'}
              tendencia={entregas !== null && entregas >= 80 ? 'sube' : undefined}
              detalle={
                resumen
                  ? resumen.entregas_total > 0
                    ? t('kpis.entregasDetalle', { a: resumen.entregas_a_tiempo, total: resumen.entregas_total })
                    : t('kpis.sinFechaEsperada')
                  : undefined
              }
            />
          </KpiStrip>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-5">
            <div className="flex min-w-0 flex-col gap-4 lg:col-span-2 lg:gap-5">
              <Tarjeta
                titulo={t('datos.titulo')}
                accion={
                  <Link href={`${RUTA_PROVEEDORES}/${supplier.uuid}/editar`} className="text-sm font-medium text-link hover:underline">
                    {tc('editar')}
                  </Link>
                }
              >
                <dl>
                  <Fila etiqueta={t('datos.tipo')}>{tipoProveedor(supplier.supplier_type, tf)}</Fila>
                  <Fila etiqueta={t('datos.documento')}>{documento}</Fila>
                  {supplier.trade_name && <Fila etiqueta={t('datos.nombreComercial')}>{supplier.trade_name}</Fila>}
                  {padre && (
                    <Fila etiqueta={t('datos.empresaAsociada')}>
                      <Link href={`${RUTA_PROVEEDORES}/${padre.uuid}`} className="text-link hover:underline">
                        {padre.name}
                      </Link>
                    </Fila>
                  )}
                  <Fila etiqueta={t('datos.contacto')}>{supplier.contact || '—'}</Fila>
                  <Fila etiqueta={t('datos.telefono')}>
                    {supplier.phone ? (
                      <a href={`tel:${supplier.phone.replace(/\s+/g, '')}`} className="text-link hover:underline">
                        {supplier.phone}
                      </a>
                    ) : (
                      '—'
                    )}
                  </Fila>
                  <Fila etiqueta={t('datos.correo')}>
                    {supplier.email ? (
                      <a href={`mailto:${supplier.email}`} className="text-link hover:underline">
                        {supplier.email}
                      </a>
                    ) : (
                      '—'
                    )}
                  </Fila>
                  {supplier.website && (
                    <Fila etiqueta={t('datos.sitioWeb')}>
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
                  <Fila etiqueta={t('datos.direccion')}>{direccion || '—'}</Fila>
                  <Fila etiqueta={t('datos.registrado')}>{formatDate(supplier.created_at)}</Fila>
                </dl>
              </Tarjeta>

              <Tarjeta titulo={t('fiscal.titulo')}>
                <dl>
                  <Fila etiqueta={t('fiscal.regimen')}>{etiquetaRegimen(supplier.tax_regime, tf)}</Fila>
                  <Fila etiqueta={t('fiscal.responsabilidades')}>
                    {supplier.fiscal_responsibilities && supplier.fiscal_responsibilities.length > 0
                      ? supplier.fiscal_responsibilities.join(' · ')
                      : '—'}
                  </Fila>
                  <Fila etiqueta={t('fiscal.tipoDocumentoDian')}>{codigoDian ?? (supplier.identification_document_code || '—')}</Fila>
                  {supplier.legal_organization_code && (
                    <Fila etiqueta={t('fiscal.tipoOrganizacion')}>
                      {supplier.legal_organization_code === '1' ? tf('tipo.company') : t('fiscal.personaNatural')}
                    </Fila>
                  )}
                  <Fila etiqueta={t('fiscal.municipio')}>{supplier.municipality_code || '—'}</Fila>
                  {supplier.country_code && <Fila etiqueta={t('fiscal.codigoPais')}>{supplier.country_code}</Fila>}
                  {supplier.tax_id && <Fila etiqueta={t('fiscal.identificacionTributaria')}>{supplier.tax_id}</Fila>}
                  <Fila etiqueta={t('fiscal.condicionPago')}>{condicion}</Fila>
                  <Fila etiqueta={t('fiscal.banco')}>
                    {[supplier.bank_name, tipoCuenta].filter(Boolean).join(' · ') || '—'}
                  </Fila>
                  <Fila etiqueta={t('fiscal.numeroCuenta')}>
                    {supplier.bank_account ? (
                      <span className="inline-flex flex-wrap items-center gap-2">
                        <span className="font-mono tabular-nums">{verCuenta ? supplier.bank_account : cuentaEnmascarada(supplier.bank_account)}</span>
                        <button
                          type="button"
                          onClick={() => setVerCuenta((v) => !v)}
                          aria-label={verCuenta ? t('fiscal.ocultarCuenta') : t('fiscal.mostrarCuenta')}
                          className="inline-flex size-7 items-center justify-center rounded-md text-fg-secondary hover:bg-hover"
                        >
                          {verCuenta ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(supplier.bank_account ?? '');
                              toast({ title: t('fiscal.cuentaCopiada') });
                            } catch {
                              toast({ variant: 'destructive', title: t('fiscal.errorCopiar') });
                            }
                          }}
                          className="inline-flex items-center gap-1 text-sm font-medium text-link hover:underline"
                        >
                          <Copy aria-hidden="true" className="size-3.5" /> {t('fiscal.copiar')}
                        </button>
                      </span>
                    ) : (
                      '—'
                    )}
                  </Fila>
                </dl>
              </Tarjeta>

              {(supplier.description || supplier.notes) && (
                <Tarjeta titulo={t('notas.titulo')}>
                  <div className="flex flex-col gap-4 text-sm text-fg-secondary">
                    {supplier.description && <HtmlContentRenderer html={supplier.description} />}
                    {supplier.notes && (
                      <div className="rounded-lg bg-subtle p-3">
                        <p className="mb-1 text-xs font-medium text-fg-secondary">{t('notas.internas')}</p>
                        <HtmlContentRenderer html={supplier.notes} />
                      </div>
                    )}
                  </div>
                </Tarjeta>
              )}

              <Tarjeta titulo={t('ultimos.titulo')}>
                <DataTable
                  etiqueta={t('ultimos.titulo')}
                  densidad="compacta"
                  columnas={[
                    {
                      id: 'doc',
                      encabezado: t('columnas.documento'),
                      celda: (d) => (
                        <div className="flex flex-col">
                          <span className="font-medium text-link">{d.titulo}</span>
                          <span className="text-xs text-fg-secondary">{d.tipo}</span>
                        </div>
                      ),
                    },
                    { id: 'fecha', encabezado: t('columnas.fecha'), celda: (d) => formatDate(d.fecha) },
                    { id: 'estado', encabezado: t('columnas.estado'), ocultarDebajo: 'sm', celda: (d) => d.estado },
                    { id: 'total', encabezado: t('columnas.total'), variante: 'importe', celda: (d) => dinero(d.total) },
                  ]}
                  filas={ultimos}
                  obtenerId={(d) => d.id}
                  onFilaClick={(d) => d.href && router.push(d.href)}
                  vacio={{
                    titulo: t('ultimos.vacioTitulo'),
                    descripcion: t('ultimos.vacioDescripcion'),
                    icono: FileText,
                    accion: { etiqueta: t('nuevaOrden'), href: rutaNuevaOrdenCompra(supplier.id), icono: Plus },
                    compacto: true,
                  }}
                />
              </Tarjeta>
            </div>

            <section aria-label={t('conexiones.titulo')} className="flex h-fit flex-col gap-3 rounded-xl border border-line bg-surface p-4 sm:p-6">
              <h2 className="text-base font-semibold text-fg">{t('conexiones.titulo')}</h2>
              <RelatedLinkCard
                icono={ClipboardList}
                etiqueta={
                  resumen
                    ? t('conexiones.ordenesAbiertas', { count: resumen.ordenes_abiertas, n: entero(resumen.ordenes_abiertas) })
                    : t('pestanas.ordenes')
                }
                valor={resumen?.ordenes ?? ordenes.length}
                cargando={!resumen}
                onAccion={() => setPestana('ordenes')}
              />
              <RelatedLinkCard
                icono={FileText}
                etiqueta={t('pestanas.facturas')}
                valor={resumen?.facturas ?? facturas.length}
                cargando={!resumen}
                onAccion={() => setPestana('facturas')}
              />
              <RelatedLinkCard
                icono={HandCoins}
                etiqueta={t('conexiones.cuentasAbiertas')}
                valor={resumen?.facturas_abiertas ?? cuentasAbiertas.length}
                cargando={!resumen}
                tono={(resumen?.facturas_abiertas ?? 0) > 0 ? 'warning' : 'neutral'}
                onAccion={() => setPestana('cuentas')}
              />
              {resumen && resumen.vencido > 0 && (
                <RelatedLinkCard
                  icono={AlertTriangle}
                  etiqueta={t('kpis.vencido')}
                  valor={dinero(resumen.vencido)}
                  tono="danger"
                  textoAccion={t('conexiones.pagar')}
                  onAccion={registrarPago}
                />
              )}
              <RelatedLinkCard
                icono={Package}
                etiqueta={t('pestanas.productos')}
                valor={resumen?.productos ?? productos.length}
                cargando={!resumen}
                onAccion={() => setPestana('productos')}
              />
              <RelatedLinkCard icono={Boxes} etiqueta={t('conexiones.lotes')} valor={resumen?.lotes ?? 0} cargando={!resumen} />
              <RelatedLinkCard
                icono={Banknote}
                etiqueta={t('conexiones.pagos')}
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
              {t('valorStock')} <span className="font-medium text-fg">{dinero(valorStock)}</span>
            </p>
          )}
          <DataTable
            etiqueta={t('pestanas.productos')}
            columnas={colProductos}
            filas={productos}
            obtenerId={(p) => String(p.id)}
            onFilaClick={(p) => p.product?.uuid && router.push(`/app/inventario/productos/${p.product.uuid}`)}
            etiquetaFila={(p) => p.product?.name ?? t('productoN', { id: p.product_id })}
            vacio={{
              titulo: t('vacios.productos'),
              descripcion: t('vacios.productosDescripcion'),
              icono: Package,
            }}
          />
        </>,
      )}

      {panel(
        'ordenes',
        <>
          {recientes(resumen?.ordenes, ordenes.length, '/app/inventario/ordenes-compra', 'ordenes')}
          <DataTable
            etiqueta={t('pestanas.ordenes')}
            columnas={colOrdenes}
            filas={ordenes}
            obtenerId={(o) => String(o.id)}
            onFilaClick={(o) => router.push(`/app/inventario/ordenes-compra/${o.id}`)}
            etiquetaFila={(o) => `OC-${o.id}`}
            vacio={{
              titulo: t('vacios.ordenes'),
              icono: ClipboardList,
              accion: { etiqueta: t('nuevaOrden'), href: rutaNuevaOrdenCompra(supplier.id), icono: Plus },
            }}
          />
        </>,
      )}

      {panel(
        'facturas',
        <>
          {recientes(resumen?.facturas, facturas.length, '/app/finanzas/facturas-compra', 'facturas')}
          <DataTable
            etiqueta={t('pestanas.facturas')}
            columnas={colFacturas}
            filas={facturas}
            obtenerId={(f) => f.id}
            onFilaClick={(f) => router.push(`/app/finanzas/facturas-compra/${f.id}`)}
            etiquetaFila={(f) => f.number_ext || `FC-${f.id.slice(0, 8)}`}
            vacio={{ titulo: t('vacios.facturas'), icono: FileText }}
          />
        </>,
      )}

      {panel(
        'cuentas',
        <DataTable
          etiqueta={t('pestanas.cuentas')}
          columnas={colCuentas}
          filas={cuentas}
          obtenerId={(c) => c.id}
          onFilaClick={(c) => router.push(`/app/finanzas/cuentas-por-pagar/${c.id}`)}
          etiquetaFila={(c) => c.invoice_number || `CxP-${c.id.slice(0, 8)}`}
          tonoFila={(c) => (estadoCxp(c, t).estado === 'vencida' ? 'peligro' : undefined)}
          vacio={{ titulo: t('vacios.cuentas'), icono: WalletCards }}
        />,
      )}

      {panel(
        'pagos',
        <>
          {pagos.length > 0 && (
            <p className="text-sm text-fg-secondary">
              {t('totalPagado')} <span className="font-medium text-success-text">{dinero(totalPagado)}</span>
            </p>
          )}
          <DataTable
            etiqueta={t('pestanas.pagos')}
            columnas={colPagos}
            filas={pagos}
            obtenerId={(p) => p.id}
            vacio={{ titulo: t('vacios.pagos'), icono: Banknote }}
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
