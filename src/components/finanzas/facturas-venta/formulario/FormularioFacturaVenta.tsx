'use client';

/**
 * Factura de venta — un solo formulario para nueva y editar (Figma «Facturas de
 * venta — Nueva y editar v2» `1034:97025`; docs/design/FACTURA-VENTA-FORMULARIO-V2.md).
 *
 * Modos: nueva vacía · nueva con datos (duplicar, ?cliente=, oportunidad) ·
 * editar borrador · cargando · no editable (emitida o anulada: solo lectura con
 * motivo y acciones) · errores en línea con resumen arriba · guardando/emitiendo.
 *
 * - Guardar y emitir son del servidor (regla 7): `guardarFacturaVenta` →
 *   `fn_factura_venta_guardar` (una transacción) y `emitirFacturaVenta` →
 *   `fn_factura_venta_emitir` (número de la resolución, inventario, cartera).
 * - «Emitir factura» guarda y emite en un paso (decisión 4). Con faltantes, el
 *   diálogo muestra el ajuste ANTES de aplicarlo («Ajustar y emitir», decisión 6).
 * - La factura electrónica se envía al EMITIR, nunca el borrador (H1).
 * - El borrador no lleva número: lo asigna la emisión (decisión 2); «Número
 *   manual» queda como opción avanzada.
 * - Autoguardado cada 30 s solo si el borrador ya existe, sin toast (decisión 3).
 * - Atajos: F2 cliente · F3 productos · Alt+M ítem manual · Ctrl+S guardar ·
 *   Ctrl+Enter emitir.
 */
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Barcode, Copy, FileMinus, FileText, ListPlus, Plus, ReceiptText, Save, Search, Send, StickyNote, User } from 'lucide-react';
import {
  EmptyState,
  FormField,
  FormSection,
  KbdButton,
  SegmentedControl,
  Tarjeta,
  useAtajos,
  type AccionFila,
} from '@/components/kit';
import { CampoFecha } from '@/components/kit/CampoFecha';
import { CampoNumero } from '@/components/kit/CampoNumero';
import {
  DialogoItemManual,
  DialogoTextoLinea,
  DocumentoCabecera,
  DocumentoLineas,
  DocumentoTotales,
  simboloMoneda,
  type InsigniaLinea,
  type LineaDocumento,
  type OpcionImpuesto,
} from '@/components/kit/documento';
import { useEtiquetaEstado } from '@/components/kit/useIdiomaKit';
import {
  DialogoSalirConCambios,
  FormularioDocumentoLayout,
  ResumenErrores,
  TarjetaAtajos,
  useAutoguardado,
  useAvisoSalida,
  type ErrorFormulario,
} from '@/components/kit/documento/FormularioDocumento';
import { Dialogo } from '@/components/kit/Dialogo';
import { Input } from '@/components/ui/input';
import { SearchSelect } from '@/components/ui/search-select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { SerialSelectorDialog } from '@/components/pos/SerialSelectorDialog';
import type { CartItem } from '@/components/pos/types';
import { ElegirCliente, type ClienteDocumento } from '@/components/finanzas/documento/terceros';
import { AgregarProductosDocumento } from '@/components/finanzas/documento/productos';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useCommissionRate } from '@/lib/hooks/useCommissionRate';
import { useElectronicInvoicePreference } from '@/lib/hooks/useElectronicInvoicePreference';
import { useOrgMembers } from '@/lib/hooks/useOrgMembers';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { listarClientes } from '@/lib/services/clientesListadoService';
import { electronicInvoicingService } from '@/lib/services/electronicInvoicingService';
import {
  impuestosOrganizacion,
  metodosPagoOrganizacion,
  productosPorId,
  type ImpuestoDocumento,
  type ProductoParaDocumento,
} from '@/lib/services/documentos/edicionDocumento';
import { cantidadInicialLinea } from '@/lib/services/documentos/cantidadLinea';
import { ErrorPeticionFactura, emitirFacturaVenta, guardarFacturaVenta } from '@/lib/finanzas/ventas/clienteFacturas';
import type { DatosFactura, FaltanteStock } from '@/lib/finanzas/ventas/contratoFacturas';
import {
  ajustarAFaltantes,
  calcularLineaVenta,
  comisionEstimada,
  errorComision,
  faltanteLinea,
  impuestosAplicados,
  impuestosDeLineaGuardada,
  lineaAItem,
  pedidoPorProducto,
  totalesFacturaVenta,
  vencimientoPorTerminos,
  type AjusteFaltante,
  type ImpuestoLineaVenta,
  type LineaVenta,
} from '@/lib/finanzas/ventas/lineasFacturaVenta';
import { crearFormateadorMoneda } from '@/lib/utils/moneda';
import { validarFacturaVenta, type ErroresFacturaVenta } from './validacionFacturaVenta';

export const RUTA_FACTURAS_VENTA = '/app/finanzas/facturas-venta';
const TERMINOS = [0, 15, 30, 45, 60, 90] as const;

let secuencia = 0;
const nuevaClave = () => `l${Date.now().toString(36)}${(secuencia++).toString(36)}`;

const claseCampo =
  'h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-60';

/** Props de accesibilidad de `FormField` para un control nativo. */
function aria(c: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean; 'aria-required'?: boolean }) {
  return { id: c.id, 'aria-describedby': c['aria-describedby'], 'aria-invalid': c['aria-invalid'], 'aria-required': c['aria-required'] };
}

function deProducto(p: ProductoParaDocumento, impuestos: readonly ImpuestoDocumento[]): LineaVenta {
  // Sin impuesto propio: el predeterminado de la organización (mismo orden que el resolver, F-42).
  const propios = p.impuestos.length > 0 ? p.impuestos : impuestos.filter((i) => i.predeterminado);
  return {
    clave: nuevaClave(),
    product_id: p.id,
    descripcion: p.nombre,
    sku: p.sku,
    // Por peso o medida nace vacía (0) para escribir el peso: ver `cantidadInicialLinea`.
    cantidad: cantidadInicialLinea(p),
    precio: p.precio,
    descuento: 0,
    impuestos: propios.map((i) => ({ id: i.id, codigo: i.codigo, nombre: i.nombre, tarifa: i.tarifa })),
    nota: null,
    manual: false,
    serial: p.serial,
    controlaStock: p.controlaStock,
    stock: p.stock,
    unidad: p.unidadVenta,
    decimalesCantidad: p.decimalesCantidad,
  };
}

interface FacturaCargada {
  id: string;
  number: string | null;
  status: string;
  customer_id: string | null;
  branch_id: number | null;
  currency: string | null;
  payment_terms: number | null;
  payment_method: string | null;
  notes: string | null;
  terms_conditions?: string | null;
  tax_included: boolean | null;
  salesperson_id: string | null;
  commission_rate: number | string | null;
  commission_method: 'percentage' | 'fixed_amount' | null;
  opportunity_id: string | null;
  issue_date: string | null;
  due_date: string | null;
  total: number | string | null;
  einvoice_status?: string | null;
  updated_at?: string | null;
}

type ItemGuardado = {
  id?: string;
  product_id: number | null;
  description: string | null;
  qty: number | string | null;
  unit_price: number | string | null;
  discount_amount: number | string | null;
  tax_code: string | null;
  tax_rate: number | string | null;
  note?: string | null;
  impuestos_linea?: unknown;
  serial_ids?: number[] | null;
};

type Modo = { tipo: 'cargando' } | { tipo: 'editable' } | { tipo: 'noEditable'; factura: FacturaCargada; lineas: LineaVenta[]; cliente: string | null } | { tipo: 'error'; mensaje: string };

export default function FormularioFacturaVenta({ id: idInicial }: { id?: string }) {
  const router = useRouter();
  const params = useSearchParams() ?? new URLSearchParams();
  const t = useTranslations('facturasVenta.v2');
  const tv = useTranslations('facturasVenta');
  const tk = useTranslations('kit.documentoEdicion');
  const moneda = useMonedaOrganizacion();
  const { branches, selectedBranchId } = useBranch();
  const { alwaysEnabled: feGlobal } = useElectronicInvoicePreference();
  const { resolveRate } = useCommissionRate();

  const duplicarId = !idInicial ? params.get('duplicar') : null;
  const clienteParam = !idInicial ? params.get('cliente') : null;

  // ── Estado ────────────────────────────────────────────────────────────
  const [id, setId] = useState<string | null>(idInicial ?? null);
  const [modo, setModo] = useState<Modo>(idInicial || duplicarId || clienteParam ? { tipo: 'cargando' } : { tipo: 'editable' });
  const [impuestos, setImpuestos] = useState<ImpuestoDocumento[]>([]);
  const [metodos, setMetodos] = useState<{ codigo: string; nombre: string }[]>([]);
  const [monedas, setMonedas] = useState<string[]>([]);
  const { members: miembros } = useOrgMembers();
  const [oportunidades, setOportunidades] = useState<{ id: string; name: string; customer_id: string | null }[]>([]);

  const [cliente, setCliente] = useState<ClienteDocumento | null>(null);
  const [numeroManual, setNumeroManual] = useState('');
  const [verNumeroManual, setVerNumeroManual] = useState(false);
  const [sucursal, setSucursal] = useState<number | null>(selectedBranchId ?? null);
  const { getToday, toDate, toInstant, formatPlain } = useFormatDate(sucursal);
  const [emision, setEmision] = useState<string>(getToday());
  const [terminos, setTerminos] = useState<number>(30);
  const [terminosPropios, setTerminosPropios] = useState(false);
  const [vence, setVence] = useState<string>(vencimientoPorTerminos(getToday(), 30));
  const [codigoMoneda, setCodigoMoneda] = useState('');
  const [formaPago, setFormaPago] = useState('');
  const [oportunidad, setOportunidad] = useState('');
  const [fe, setFe] = useState(false);
  const [incluirArqueo, setIncluirArqueo] = useState(true);
  const [incluido, setIncluido] = useState(false);
  const [lineas, setLineas] = useState<LineaVenta[]>([]);
  const [seriales, setSeriales] = useState<Record<number, number[]>>({});
  const [notas, setNotas] = useState('');
  const [terminosCondiciones, setTerminosCondiciones] = useState('');
  const [vendedor, setVendedor] = useState('');
  const [tasaComision, setTasaComision] = useState<number | null>(0);
  const [metodoComision, setMetodoComision] = useState<'percentage' | 'fixed_amount'>('percentage');
  const [tasaSugerida, setTasaSugerida] = useState(false);
  /** Descuento de promoción por línea (clave de la línea), para la insignia. */
  const [promociones, setPromociones] = useState<Record<string, number>>({});
  const [duplicadoDe, setDuplicadoDe] = useState<string | null>(null);

  const [errores, setErrores] = useState<ErroresFacturaVenta>({});
  const [errorServidor, setErrorServidor] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<null | 'borrador' | 'emitir' | 'auto' | 'salir'>(null);
  const [dlgProductos, setDlgProductos] = useState(false);
  const [dlgManual, setDlgManual] = useState(false);
  const [dlgCliente, setDlgCliente] = useState(false);
  const [dlgSeriales, setDlgSeriales] = useState(false);
  const [notaLinea, setNotaLinea] = useState<LineaVenta | null>(null);
  const [faltantes, setFaltantes] = useState<{ lista: FaltanteStock[]; cambios: AjusteFaltante[] } | null>(null);
  const [salir, setSalir] = useState<string | null>(null);
  const [sucio, setSucio] = useState(false);
  const marcar = () => setSucio(true);
  useAvisoSalida(sucio);

  const ctxMoneda = moneda.paraDocumento(codigoMoneda || null);
  const formatear = useMemo(() => crearFormateadorMoneda(ctxMoneda), [ctxMoneda]);
  const nombreSucursal = branches.find((b) => b.id === sucursal)?.name ?? null;
  const opcionesImpuesto: OpcionImpuesto[] = useMemo(() => {
    const base: OpcionImpuesto[] = impuestos.map((i) => ({ id: i.id, codigo: i.codigo, nombre: i.nombre, tarifa: i.tarifa, predeterminado: i.predeterminado }));
    // Impuestos de líneas guardadas que ya no están en la organización: se conservan (nada se pierde al editar).
    for (const l of lineas) for (const i of l.impuestos) if (!base.some((o) => o.id === i.id)) base.push({ id: i.id, codigo: i.codigo, nombre: i.nombre, tarifa: i.tarifa });
    return base;
  }, [impuestos, lineas]);
  const totales = useMemo(() => totalesFacturaVenta(lineas, incluido), [lineas, incluido]);
  const pedido = useMemo(() => pedidoPorProducto(lineas), [lineas]);

  // ── Carga: catálogos de la organización y el documento ──────────────────
  useEffect(() => {
    let cancelado = false;
    const org = getOrganizationId();
    (async () => {
      const [imp, met, mon, opo] = await Promise.all([
        impuestosOrganizacion(org).catch(() => ({ impuestos: [] as ImpuestoDocumento[], retenciones: [] })),
        metodosPagoOrganizacion(org).catch(() => []),
        supabase.from('organization_currencies').select('currency_code, is_base').eq('organization_id', org).order('is_base', { ascending: false }),
        supabase.from('opportunities').select('id, name, customer_id').eq('organization_id', org).eq('status', 'open').order('name'),
      ]);
      if (cancelado) return;
      setImpuestos(imp.impuestos);
      setMetodos(met);
      setFormaPago((f) => f || met[0]?.codigo || '');
      setMonedas(((mon.data ?? []) as { currency_code: string }[]).map((m) => m.currency_code.trim().toUpperCase()));
      setOportunidades(((opo.data ?? []) as { id: string; name: string; customer_id: string | null }[]) ?? []);
      if (idInicial) await cargarFactura(idInicial, imp.impuestos, () => cancelado);
      else if (duplicarId) await cargarDuplicado(duplicarId, imp.impuestos, () => cancelado);
      else if (clienteParam) {
        await cargarCliente(clienteParam, () => cancelado);
        if (!cancelado) setModo({ tipo: 'editable' });
      }
    })().catch(() => !cancelado && setModo({ tipo: 'error', mensaje: t('errorCarga') }));
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carga única por documento
  }, [idInicial, duplicarId, clienteParam]);

  // L20: la preferencia global fuerza la factura electrónica.
  useEffect(() => {
    if (feGlobal) setFe(true);
  }, [feGlobal]);
  // L4: la sucursal del selector global (solo en un documento nuevo).
  useEffect(() => {
    if (!idInicial && selectedBranchId && !sucio) setSucursal(selectedBranchId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranchId]);
  // L3: la moneda base de la organización si el documento no trae otra.
  useEffect(() => {
    if (!codigoMoneda && moneda.resuelta) setCodigoMoneda(moneda.code);
  }, [moneda.resuelta, moneda.code, codigoMoneda]);

  async function cargarCliente(clienteId: string, cancelado: () => boolean) {
    const { filas } = await listarClientes({ organizationId: getOrganizationId(), branchId: null, criterios: { estado: 'todos' }, orden: null, desde: 0, tamano: 1, ids: [clienteId] });
    const f = filas[0];
    if (!f || cancelado()) return;
    setCliente({
      id: f.id,
      nombre: (f.full_name || f.company_name || '').trim(),
      documento: f.identification_number ? `${(f.identification_type ?? '').toUpperCase()} ${f.identification_number}`.trim() : null,
      correo: f.email,
      telefono: f.phone,
      saldoPorCobrar: Number(f.saldo) > 0 ? tk('terceros.porCobrar', { saldo: crearFormateadorMoneda(moneda.code)(Number(f.saldo)) }) : null,
      plazoDias: f.plazo_dias,
    });
  }

  async function lineasDesdeItems(items: ItemGuardado[], imp: ImpuestoDocumento[], suc: number | null): Promise<LineaVenta[]> {
    const opciones = imp.map((i) => ({ id: i.id, codigo: i.codigo, nombre: i.nombre, tarifa: i.tarifa }));
    const productos = await productosPorId(
      getOrganizationId(),
      items.map((i) => Number(i.product_id)).filter(Boolean),
      { variante: 'venta', sucursal: suc },
    ).catch(() => new Map<number, ProductoParaDocumento>());
    return items.map((i) => {
      const p = i.product_id ? productos.get(Number(i.product_id)) : undefined;
      let imps = impuestosDeLineaGuardada(i, opciones);
      // H9: una línea que llegó sin impuesto (oportunidad, factura vieja) toma el del producto al cargar.
      if (imps.length === 0 && p) imps = (p.impuestos.length > 0 ? p.impuestos : imp.filter((x) => x.predeterminado)).map((x) => ({ id: x.id, codigo: x.codigo, nombre: x.nombre, tarifa: x.tarifa }));
      return {
        clave: nuevaClave(),
        product_id: i.product_id ? Number(i.product_id) : null,
        descripcion: i.description ?? '',
        sku: p?.sku ?? null,
        cantidad: Number(i.qty) || 0,
        precio: Number(i.unit_price) || 0,
        descuento: Number(i.discount_amount) || 0,
        impuestos: imps,
        nota: i.note ?? null,
        manual: !i.product_id,
        serial: p?.serial ?? false,
        controlaStock: p?.controlaStock ?? false,
        stock: p?.stock ?? null,
        unidad: p?.unidadVenta ?? null,
        decimalesCantidad: p?.decimalesCantidad ?? null,
      };
    });
  }

  async function cargarFactura(facturaId: string, imp: ImpuestoDocumento[], cancelado: () => boolean) {
    const org = getOrganizationId();
    const { data, error } = await supabase.from('invoice_sales').select('*').eq('id', facturaId).eq('organization_id', org).maybeSingle();
    if (error) throw error;
    if (cancelado()) return;
    if (!data) {
      setModo({ tipo: 'error', mensaje: tv('errores.factura_no_encontrada') });
      return;
    }
    const f = data as FacturaCargada;
    const { data: items } = await supabase.from('invoice_items').select('*').eq('invoice_sales_id', facturaId).order('created_at');
    const ls = await lineasDesdeItems((items ?? []) as ItemGuardado[], imp, f.branch_id);
    if (cancelado()) return;
    if (f.status !== 'draft') {
      let nombreCliente: string | null = null;
      if (f.customer_id) {
        const { data: c } = await supabase.from('customers').select('full_name').eq('id', f.customer_id).maybeSingle();
        nombreCliente = (c as { full_name: string | null } | null)?.full_name ?? null;
      }
      setIncluido(!!f.tax_included);
      setCodigoMoneda(f.currency?.trim() ?? '');
      setModo({ tipo: 'noEditable', factura: f, lineas: ls, cliente: nombreCliente });
      return;
    }
    if (f.customer_id) await cargarCliente(f.customer_id, cancelado);
    if (cancelado()) return;
    setNumeroManual(f.number ?? '');
    setVerNumeroManual(!!f.number);
    setSucursal(f.branch_id);
    if (f.issue_date) setEmision(toDate(new Date(f.issue_date)));
    if (f.due_date) setVence(toDate(new Date(f.due_date)));
    setTerminos(Number(f.payment_terms) || 0);
    setTerminosPropios(!TERMINOS.includes((Number(f.payment_terms) || 0) as (typeof TERMINOS)[number]));
    setCodigoMoneda(f.currency?.trim() ?? '');
    setFormaPago(f.payment_method ?? '');
    setNotas(f.notes ?? '');
    setTerminosCondiciones(f.terms_conditions ?? '');
    setIncluido(!!f.tax_included);
    setVendedor(f.salesperson_id ?? '');
    setTasaComision(Number(f.commission_rate) || 0);
    setMetodoComision(f.commission_method ?? 'percentage');
    setOportunidad(f.opportunity_id ?? '');
    // H2: se conserva «incluir en el arqueo» de la venta ligada.
    const { data: venta } = await supabase.from('sales').select('include_in_cash_register').eq('id', (data as { sale_id?: string }).sale_id ?? '').maybeSingle();
    if (venta) setIncluirArqueo((venta as { include_in_cash_register: boolean | null }).include_in_cash_register !== false);
    const sel: Record<number, number[]> = {};
    for (const it of (items ?? []) as ItemGuardado[]) if (it.product_id && it.serial_ids?.length) sel[Number(it.product_id)] = [...(sel[Number(it.product_id)] ?? []), ...it.serial_ids];
    setSeriales(sel);
    setLineas(ls);
    setModo({ tipo: 'editable' });
  }

  async function cargarDuplicado(origenId: string, imp: ImpuestoDocumento[], cancelado: () => boolean) {
    const org = getOrganizationId();
    const [{ data: origen }, { data: items }] = await Promise.all([
      supabase.from('invoice_sales').select('number, branch_id').eq('id', origenId).eq('organization_id', org).maybeSingle(),
      supabase.from('invoice_items').select('*').eq('invoice_sales_id', origenId),
    ]);
    if (cancelado()) return;
    const ls = await lineasDesdeItems((items ?? []) as ItemGuardado[], imp, sucursal);
    if (cancelado()) return;
    setLineas(ls);
    setDuplicadoDe((origen as { number: string | null } | null)?.number ?? '—');
    const c = params.get('cliente');
    if (c) await cargarCliente(c, cancelado);
    const m = params.get('moneda');
    if (m) setCodigoMoneda(m);
    const dias = params.get('terminos');
    if (dias) {
      const n = parseInt(dias, 10) || 0;
      setTerminos(n);
      setTerminosPropios(!TERMINOS.includes(n as (typeof TERMINOS)[number]));
      setVence(vencimientoPorTerminos(emision, n));
    }
    const mp = params.get('metodo_pago');
    if (mp) setFormaPago(mp);
    const n = params.get('notas');
    if (n) setNotas(n);
    setModo({ tipo: 'editable' });
  }

  // ── Promociones visibles antes de guardar (M10; se aplican al guardar, L10) ──
  useEffect(() => {
    if (modo.tipo !== 'editable' || lineas.length === 0 || !sucursal) {
      setPromociones({});
      return;
    }
    let cancelado = false;
    const tmr = window.setTimeout(async () => {
      try {
        const { promotionEngine } = await import('@/lib/services/promotionEngine');
        // Categoría y producto padre: los completa el motor desde `products`
        // (la línea de la factura no los guarda) para las promociones por
        // categoría y por variante.
        const r = await promotionEngine.evaluate({
          channel: 'finances',
          items: lineas.map((l) => ({ product_id: l.product_id || 0, quantity: Number(l.cantidad) || 0, unit_price: Number(l.precio) || 0 })),
          organization_id: getOrganizationId(),
          branch_id: sucursal,
        });
        // Por LÍNEA: con el mismo producto en dos líneas, la suma por producto contaba doble.
        const porLinea: Record<string, number> = {};
        lineas.forEach((l, idx) => {
          if ((r.lineDiscounts[idx] ?? 0) > 0) porLinea[l.clave] = r.lineDiscounts[idx];
        });
        if (!cancelado) setPromociones(porLinea);
      } catch {
        if (!cancelado) setPromociones({});
      }
    }, 700);
    return () => {
      cancelado = true;
      window.clearTimeout(tmr);
    };
  }, [lineas, sucursal, modo.tipo]);

  // ── Cambios ────────────────────────────────────────────────────────────
  const cambiarEmision = (dia: string) => {
    marcar();
    setEmision(dia);
    setVence(vencimientoPorTerminos(dia, terminos));
  };
  const cambiarTerminos = (dias: number) => {
    marcar();
    setTerminos(dias);
    setVence(vencimientoPorTerminos(emision, dias));
  };
  const elegirCliente = (c: ClienteDocumento) => {
    marcar();
    setCliente(c);
    setErrores((e) => ({ ...e, cliente: undefined }));
    // M5: el plazo del cliente sugiere los términos (como compras con el proveedor).
    if (c.plazoDias && c.plazoDias > 0) {
      setTerminos(c.plazoDias);
      setTerminosPropios(!TERMINOS.includes(c.plazoDias as (typeof TERMINOS)[number]));
      setVence(vencimientoPorTerminos(emision, c.plazoDias));
    }
  };
  const agregarProducto = (p: ProductoParaDocumento) => {
    marcar();
    setLineas((prev) => [...prev, deProducto(p, impuestos)]);
    setErrores((e) => ({ ...e, lineas: undefined }));
    if (p.serial) setDlgSeriales(true);
  };
  const cambiarLinea = (clave: string, cambio: Partial<LineaVenta>) => {
    marcar();
    setLineas((prev) => prev.map((l) => (l.clave === clave ? { ...l, ...cambio } : l)));
    setErrores((e) => ({ ...e, [`linea.${clave}`]: undefined }));
  };
  const elegirOportunidad = async (valor: string) => {
    marcar();
    setOportunidad(valor);
    if (!valor) return;
    const { data } = await supabase.from('opportunity_products').select('product_id, quantity, unit_price, total_price').eq('opportunity_id', valor);
    const productos = (data ?? []) as { product_id: number; quantity: number | string | null; unit_price: number | string | null }[];
    if (productos.length > 0) {
      const { data: nombres } = await supabase.from('products').select('id, name').in('id', productos.map((p) => p.product_id));
      const mapa = new Map(((nombres ?? []) as { id: number; name: string }[]).map((p) => [p.id, p.name]));
      const ls = await lineasDesdeItems(
        productos.map((p) => ({ product_id: p.product_id, description: mapa.get(p.product_id) ?? '', qty: p.quantity, unit_price: p.unit_price, discount_amount: 0, tax_code: null, tax_rate: 0 })),
        impuestos,
        sucursal,
      );
      setLineas(ls);
    }
    const o = oportunidades.find((x) => x.id === valor);
    if (o?.customer_id) await cargarCliente(o.customer_id, () => false);
  };
  const elegirVendedor = async (valor: string) => {
    marcar();
    const v = valor === '__none__' ? '' : valor;
    setVendedor(v);
    setTasaSugerida(false);
    if (!v) {
      setTasaComision(0);
      return;
    }
    const tasa = await resolveRate(v);
    if (tasa > 0) {
      setTasaComision(tasa);
      setMetodoComision('percentage');
      setTasaSugerida(true);
    }
  };

  // ── Validación, payload y guardado ─────────────────────────────────────
  const payload = useCallback(
    (ls: LineaVenta[]): DatosFactura => {
      const tasa = Number(tasaComision) || 0;
      const conComision = !!vendedor && tasa > 0;
      return {
        number: numeroManual.trim() || null,
        customer_id: cliente?.id ?? null,
        branch_id: sucursal as number,
        issue_date: emision ? toInstant(emision) : null,
        due_date: vence ? toInstant(vence) : null,
        currency: codigoMoneda || null,
        payment_terms: terminos,
        payment_method: formaPago || null,
        notes: notas.trim() || null,
        terms_conditions: terminosCondiciones.trim() || null,
        tax_included: incluido,
        salesperson_id: vendedor || null,
        opportunity_id: oportunidad || null,
        commission_rate: tasa,
        commission_type: conComision ? 'salesperson' : 'none',
        commission_method: conComision ? metodoComision : 'percentage',
        include_in_cash_register: incluirArqueo,
        applied_taxes: impuestosAplicados(ls),
        items: ls.map((l) => lineaAItem(l, incluido, l.product_id ? seriales[l.product_id] : undefined)),
      };
    },
    [numeroManual, cliente, sucursal, emision, vence, codigoMoneda, terminos, formaPago, notas, terminosCondiciones, incluido, vendedor, oportunidad, tasaComision, metodoComision, incluirArqueo, seriales, toInstant],
  );

  const mensajeServidor = (e: unknown): string => {
    const codigo = e instanceof ErrorPeticionFactura ? e.codigo : 'error_desconocido';
    return tv.has(`errores.${codigo}`) ? tv(`errores.${codigo}` as never) : tv('errores.error_desconocido');
  };

  /** Promociones del canal finanzas a las líneas sin descuento manual (L10). */
  const conPromociones = async (ls: LineaVenta[]): Promise<LineaVenta[]> => {
    try {
      const { promotionEngine } = await import('@/lib/services/promotionEngine');
      const r = await promotionEngine.evaluate({
        channel: 'finances',
        items: ls.map((l) => ({ product_id: l.product_id || 0, quantity: Number(l.cantidad) || 0, unit_price: Number(l.precio) || 0 })),
        organization_id: getOrganizationId(),
        branch_id: sucursal as number,
      });
      if (!(r.discountTotal > 0)) return ls;
      // El descuento de ESA línea (`lineDiscounts`), no la suma del producto.
      return ls.map((l, idx) => (!l.descuento && l.product_id && (r.lineDiscounts[idx] ?? 0) > 0 ? { ...l, descuento: r.lineDiscounts[idx] } : l));
    } catch {
      return ls;
    }
  };

  /** Guarda el borrador (crea o edita). Devuelve el id o null si no pasó la validación o falló. */
  const guardar = async (para: 'borrador' | 'emitir' | 'auto' | 'salir', ls: LineaVenta[] = lineas): Promise<{ id: string; faltantes: FaltanteStock[] } | null> => {
    const e = validarFacturaVenta({ cliente: cliente?.id ?? null, sucursal, emision, vence, lineas: ls, seriales, tasaComision: Number(tasaComision) || 0, metodoComision, subtotal: totales.subtotal, total: totales.total, paraEmitir: para === 'emitir' }, (k) => t(`errores.${k}`));
    if (para !== 'auto') setErrores(e);
    if (Object.keys(e).length > 0) return null;
    if (para !== 'auto') setGuardando(para);
    setErrorServidor(null);
    try {
      const conPromo = para === 'auto' ? ls : await conPromociones(ls);
      if (conPromo !== ls) setLineas(conPromo);
      const r = await guardarFacturaVenta(id, payload(conPromo));
      setSucio(false);
      if (!id) {
        setId(r.id);
        // La URL pasa a la del borrador: recargar o volver atrás lo edita, no crea otro.
        window.history.replaceState(null, '', `${RUTA_FACTURAS_VENTA}/${r.id}/editar`);
      }
      return { id: r.id, faltantes: r.faltantes };
    } catch (err) {
      if (para === 'auto') return null;
      const texto = mensajeServidor(err);
      if (err instanceof ErrorPeticionFactura && err.codigo === 'numero_duplicado') setErrores((x) => ({ ...x, numero: texto }));
      setErrorServidor(texto);
      return null;
    } finally {
      if (para !== 'auto') setGuardando(null);
    }
  };

  const guardarBorrador = async (luego?: string) => {
    const r = await guardar(luego ? 'salir' : 'borrador');
    if (!r) return;
    toastSuccess(t('guardado'));
    if (r.faltantes.length > 0) toastError(t('faltantesAviso', { n: r.faltantes.length }));
    router.push(luego ?? `${RUTA_FACTURAS_VENTA}/${r.id}`);
  };

  const emitir = async (ls: LineaVenta[] = lineas) => {
    const r = await guardar('emitir', ls);
    if (!r) return;
    setGuardando('emitir');
    try {
      const emitida = await emitirFacturaVenta(r.id);
      // H1: la DIAN recibe la factura ya EMITIDA (con número), nunca el borrador.
      if (fe) {
        try {
          const envio = await electronicInvoicingService.sendToFactus(r.id, getOrganizationId());
          if (!envio.success) toastError(t('feError', { error: String(envio.error ?? '') }));
        } catch {
          toastError(t('feNoEnviada'));
        }
      }
      toastSuccess(t('emitida', { numero: emitida.numero }));
      router.push(`${RUTA_FACTURAS_VENTA}/${r.id}`);
    } catch (err) {
      if (err instanceof ErrorPeticionFactura && err.codigo === 'stock_insuficiente') {
        setFaltantes({ lista: err.faltantes, cambios: ajustarAFaltantes(ls, err.faltantes).cambios });
      } else {
        setErrorServidor(mensajeServidor(err));
      }
    } finally {
      setGuardando(null);
    }
  };

  const ajustarYEmitir = async () => {
    if (!faltantes) return;
    const { lineas: ajustadas } = ajustarAFaltantes(lineas, faltantes.lista);
    setFaltantes(null);
    setLineas(ajustadas);
    if (ajustadas.length === 0) {
      setErrores({ lineas: t('errores.lineas') });
      return;
    }
    await emitir(ajustadas);
  };

  // Autoguardado del borrador existente (decisión 3).
  useAutoguardado({ activo: modo.tipo === 'editable' && !!id, sucio: sucio && !guardando, guardar: () => guardar('auto') });

  const volver = id ? `${RUTA_FACTURAS_VENTA}/${id}` : RUTA_FACTURAS_VENTA;
  const intentarSalir = (destino: string = volver) => {
    if (sucio) setSalir(destino);
    else router.push(destino);
  };

  // ── Atajos ─────────────────────────────────────────────────────────────
  const editable = modo.tipo === 'editable';
  useAtajos(
    [
      { tecla: 'F2', descripcion: t('atajos.cliente'), accion: () => setDlgCliente(true), permitirEnCampo: true },
      { tecla: 'F3', descripcion: t('atajos.productos'), accion: () => setDlgProductos(true), permitirEnCampo: true },
      { tecla: 'Alt+M', descripcion: t('atajos.manual'), accion: () => setDlgManual(true), permitirEnCampo: true },
      { tecla: 'Ctrl+S', descripcion: t('atajos.guardar'), accion: () => void guardarBorrador(), permitirEnCampo: true, cuando: () => !guardando },
      { tecla: 'Ctrl+Enter', descripcion: t('atajos.emitir'), accion: () => void emitir(), permitirEnCampo: true, cuando: () => !guardando },
    ],
    { activo: editable && !dlgProductos && !dlgManual && !notaLinea && !faltantes && !salir },
  );

  // ── Vista: no editable (emitida o anulada) ──────────────────────────────
  if (modo.tipo === 'noEditable') {
    return <VistaNoEditable factura={modo.factura} lineas={modo.lineas} cliente={modo.cliente} incluido={incluido} moneda={ctxMoneda} />;
  }
  if (modo.tipo === 'error') {
    return <EmptyState variante="error" titulo={modo.mensaje} icono={ReceiptText} accion={{ etiqueta: t('volverListado'), href: RUTA_FACTURAS_VENTA }} />;
  }
  const cargando = modo.tipo === 'cargando';

  // ── Líneas para la tabla del kit ────────────────────────────────────────
  const lineasKit: LineaDocumento[] = lineas.map((l) => {
    const k = calcularLineaVenta(l, incluido);
    const falta = faltanteLinea(l, l.product_id ? pedido.get(l.product_id) : undefined);
    const insignias: InsigniaLinea[] = [];
    if (l.manual) insignias.push({ texto: tk('lineas.itemManual') });
    if (l.product_id && l.controlaStock && l.stock !== null) {
      insignias.push(falta > 0 ? { texto: t('lineas.faltan', { n: falta }), tono: 'advertencia' } : { texto: t('lineas.stock', { n: l.stock }), tono: 'exito' });
    }
    if (l.serial && l.product_id) {
      const n = seriales[l.product_id]?.length ?? 0;
      insignias.push({ texto: t('lineas.seriales', { n, total: l.cantidad }), tono: n === l.cantidad ? 'exito' : 'advertencia' });
    }
    const promo = l.product_id && !l.descuento ? promociones[l.clave] : 0;
    if (promo && promo > 0) insignias.push({ texto: t('lineas.promocion', { importe: formatear(promo) }), tono: 'informacion' });
    return {
      id: l.clave,
      descripcion: l.descripcion,
      sku: l.sku,
      nota: l.nota,
      cantidad: l.cantidad,
      unidad: l.unidad ?? null,
      decimalesCantidad: l.decimalesCantidad ?? null,
      precioUnitario: l.precio,
      descuento: l.descuento || null,
      total: k.total_line,
      impuestosSeleccion: { ids: l.impuestos.map((i) => i.id), incluido },
      descripcionEditable: l.manual,
      error: errores[`linea.${l.clave}`] ?? null,
      aviso: falta > 0 ? t('lineas.avisoStock', { stock: l.stock ?? 0, sucursal: nombreSucursal ?? '—', faltan: falta }) : null,
      insignias,
      detalleTotal: k.impuesto > 0 ? (incluido ? t('lineas.impuestoIncluido', { importe: formatear(k.impuesto) }) : t('lineas.impuesto', { importe: formatear(k.impuesto) })) : null,
    };
  });

  const accionesLinea = (linea: LineaDocumento): AccionFila[] => {
    const l = lineas.find((x) => x.clave === linea.id);
    if (!l) return [];
    return [
      { id: 'nota', etiqueta: t('lineas.nota'), icono: StickyNote, onSelect: () => setNotaLinea(l) },
      { id: 'seriales', etiqueta: t('lineas.elegirSeriales'), icono: Barcode, onSelect: () => setDlgSeriales(true), oculta: !l.serial },
      {
        id: 'duplicar',
        etiqueta: t('lineas.duplicar'),
        icono: Copy,
        onSelect: () => {
          marcar();
          setLineas((prev) => {
            const i = prev.findIndex((x) => x.clave === l.clave);
            const copia = { ...l, clave: nuevaClave() };
            return [...prev.slice(0, i + 1), copia, ...prev.slice(i + 1)];
          });
        },
      },
    ];
  };

  const listaErrores: ErrorFormulario[] = Object.entries(errores)
    .filter(([, v]) => !!v)
    .map(([campo, mensaje]) => ({ campo, mensaje: mensaje as string, idControl: campo.startsWith('linea') ? 'lineas-factura' : `fv-${campo}` }));

  const errComision = errorComision(metodoComision, Number(tasaComision) || 0, totales.subtotal, totales.total);
  const motivoEmitir = !cliente || lineas.length === 0 ? t('motivoEmitir') : undefined;
  const subtitulo = [id ? t('borrador') : t('borradorSinGuardar'), nombreSucursal, ctxMoneda.code].filter(Boolean).join(' · ');
  const serialItems: CartItem[] = lineas
    .filter((l) => l.serial && l.product_id)
    .map((l, i) => ({
      id: `serial-${l.product_id}-${i}`,
      cart_id: 'invoice',
      product_id: l.product_id as number,
      product: { id: l.product_id, name: l.descripcion, sku: l.sku ?? '', track_serial: true } as unknown as CartItem['product'],
      quantity: l.cantidad,
      unit_price: l.precio,
      total: 0,
      created_at: '',
      updated_at: '',
    }));

  const botonSecundario =
    'inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <FormularioDocumentoLayout
      cabecera={
        <DocumentoCabecera
          variante="formulario"
          tipo="factura"
          titulo={id ? t('tituloEditar') : t('tituloNueva')}
          subtitulo={subtitulo}
          estado={id ? 'draft' : undefined}
          volverA={volver}
          onVolver={() => intentarSalir()}
          cargando={cargando}
          migas={[{ etiqueta: t('migaFinanzas'), href: '/app/finanzas' }, { etiqueta: t('migaListado'), href: RUTA_FACTURAS_VENTA }, { etiqueta: id ? t('tituloEditar') : t('tituloNueva') }]}
          movil={{ titulo: id ? t('tituloEditar') : t('tituloNueva') }}
          acciones={
            <>
              <button type="button" onClick={() => intentarSalir()} className={botonSecundario}>
                {tk('salir.cancelar')}
              </button>
              <KbdButton variante="secundario" atajo="Ctrl+S" icono={Save} cargando={guardando === 'borrador'} disabled={!!guardando || cargando} onClick={() => void guardarBorrador()}>
                {id ? t('guardarCambios') : t('guardarBorrador')}
              </KbdButton>
              <KbdButton
                atajo="Ctrl+Enter"
                icono={Send}
                cargando={guardando === 'emitir'}
                disabled={!!guardando || cargando || !!motivoEmitir}
                title={motivoEmitir}
                aria-describedby={motivoEmitir ? 'fv-motivo-emitir' : undefined}
                onClick={() => void emitir()}
              >
                {t('emitir')}
              </KbdButton>
              {motivoEmitir && (
                <span id="fv-motivo-emitir" className="sr-only">
                  {motivoEmitir}
                </span>
              )}
            </>
          }
        />
      }
      avisos={
        <>
          {duplicadoDe && (
            <p role="status" className="rounded-lg border border-line-brand bg-brand-tint px-4 py-3 text-sm text-brand-deep">
              {t('copiaDe', { numero: duplicadoDe })}
            </p>
          )}
          <ResumenErrores errores={listaErrores} />
          {errorServidor && (
            <p role="alert" className="rounded-lg border border-line-danger bg-danger-subtle px-4 py-3 text-sm text-danger-text">
              {errorServidor}
            </p>
          )}
        </>
      }
      datos={
        <FormSection titulo={t('secciones.documento')} icono={ReceiptText} columnas={2}>
          <div className="md:col-span-2">
            <FormField id="fv-numero" etiqueta={t('campos.numeracion')} ayuda={verNumeroManual ? t('campos.numeroManualAyuda') : undefined} error={errores.numero}>
              {(c) =>
                verNumeroManual ? (
                  <div className="flex gap-2">
                    <Input
                      {...aria(c)}
                      value={numeroManual}
                      maxLength={60}
                      placeholder={t('campos.numeroEjemplo')}
                      onChange={(e) => {
                        marcar();
                        setNumeroManual(e.target.value);
                        setErrores((x) => ({ ...x, numero: undefined }));
                      }}
                      className="h-10"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        marcar();
                        setNumeroManual('');
                        setVerNumeroManual(false);
                      }}
                      className={botonSecundario}
                    >
                      {t('campos.numeroAutomatico')}
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-subtle px-3 py-2 text-sm text-fg-secondary">
                    <span>{t('campos.numeroAlEmitir')}</span>
                    <button type="button" onClick={() => setVerNumeroManual(true)} className="rounded-md text-sm font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                      {t('campos.numeroManual')}
                    </button>
                  </div>
                )
              }
            </FormField>
          </div>
          <FormField id="fv-emision" etiqueta={t('campos.emision')} obligatorio error={errores.emision}>
            {(c) => <CampoFecha {...aria(c)} valor={emision} hoy={getToday()} onValorChange={cambiarEmision} />}
          </FormField>
          <FormField etiqueta={t('campos.terminos')} ayuda={vence ? t('campos.venceEl', { dias: terminos, fecha: formatPlain(vence) }) : undefined}>
            {(c) => (
              <div className="flex gap-2">
                <select
                  {...aria(c)}
                  value={terminosPropios ? 'custom' : String(terminos)}
                  onChange={(e) => {
                    if (e.target.value === 'custom') {
                      setTerminosPropios(true);
                      return;
                    }
                    setTerminosPropios(false);
                    cambiarTerminos(Number(e.target.value));
                  }}
                  className={claseCampo}
                >
                  {TERMINOS.map((d) => (
                    <option key={d} value={d}>
                      {d === 0 ? t('campos.contado') : t('campos.dias', { n: d })}
                    </option>
                  ))}
                  <option value="custom">{t('campos.personalizado')}</option>
                </select>
                {terminosPropios && (
                  <CampoNumero
                    aria-label={t('campos.diasPersonalizados')}
                    valor={terminos}
                    decimales={0}
                    minimo={0}
                    maximo={3650}
                    sufijo={t('campos.diasUnidad')}
                    onValorChange={(v) => cambiarTerminos(v ?? 0)}
                    className="w-32 shrink-0"
                  />
                )}
              </div>
            )}
          </FormField>
          <FormField id="fv-vence" etiqueta={t('campos.vence')} error={errores.vence}>
            {(c) => (
              <CampoFecha
                {...aria(c)}
                valor={vence}
                min={emision}
                hoy={getToday()}
                onValorChange={(d) => {
                  marcar();
                  setVence(d);
                }}
              />
            )}
          </FormField>
          <FormField id="fv-sucursal" etiqueta={t('campos.sucursal')} obligatorio error={errores.sucursal}>
            {(c) => (
              <select
                {...aria(c)}
                value={sucursal ?? ''}
                onChange={(e) => {
                  marcar();
                  setSucursal(e.target.value ? Number(e.target.value) : null);
                }}
                className={claseCampo}
              >
                <option value="">{t('campos.elegir')}</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          <FormField etiqueta={t('campos.moneda')}>
            {(c) => (
              <select
                {...aria(c)}
                value={codigoMoneda}
                onChange={(e) => {
                  marcar();
                  setCodigoMoneda(e.target.value);
                }}
                className={claseCampo}
              >
                {[...new Set([moneda.code, ...monedas, codigoMoneda].filter(Boolean))].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          <FormField etiqueta={t('campos.formaPago')}>
            {(c) => (
              <select
                {...aria(c)}
                value={formaPago}
                onChange={(e) => {
                  marcar();
                  setFormaPago(e.target.value);
                }}
                className={claseCampo}
              >
                {metodos.length === 0 && <option value="">{t('campos.sinMetodos')}</option>}
                {metodos.map((m) => (
                  <option key={m.codigo} value={m.codigo}>
                    {m.nombre}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          {oportunidades.length > 0 && (
            <FormField etiqueta={t('campos.oportunidad')} ayuda={oportunidad ? t('campos.oportunidadAyuda') : undefined}>
              {(c) => (
                <select {...aria(c)} value={oportunidad} onChange={(e) => void elegirOportunidad(e.target.value)} className={claseCampo}>
                  <option value="">{t('campos.sinOportunidad')}</option>
                  {oportunidades.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
          )}
          <div className="flex flex-col gap-3 md:col-span-2">
            <label className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5 text-sm text-fg">
              <span className="flex flex-col">
                <span className="flex items-center gap-2 font-medium">
                  {t('campos.fe')}
                  {feGlobal && (
                    <span className="inline-flex h-5 items-center rounded-full border border-line-brand bg-brand-tint px-2 text-[11px] font-medium text-brand-deep">{t('campos.feGlobal')}</span>
                  )}
                </span>
                <span className="text-xs text-fg-secondary">{t('campos.feAyuda')}</span>
              </span>
              <Switch
                checked={fe}
                disabled={feGlobal}
                onCheckedChange={(v) => {
                  marcar();
                  setFe(v === true);
                }}
              />
            </label>
            <label className="flex items-start gap-2 text-sm text-fg">
              <Checkbox
                checked={incluirArqueo}
                onCheckedChange={(v) => {
                  marcar();
                  setIncluirArqueo(v === true);
                }}
                className="mt-0.5 size-[18px] rounded"
              />
              <span className="flex flex-col">
                {t('campos.arqueo')}
                <span className="text-xs text-fg-secondary">{t('campos.arqueoAyuda')}</span>
              </span>
            </label>
          </div>
        </FormSection>
      }
      tercero={
        <FormSection titulo={t('secciones.cliente')} icono={User}>
          <ElegirCliente
            cliente={cliente}
            sucursal={sucursal}
            abierto={dlgCliente}
            onAbiertoChange={setDlgCliente}
            onCambiar={elegirCliente}
            onQuitar={() => {
              marcar();
              setCliente(null);
            }}
            onVer={cliente ? () => window.open(`/app/clientes/${cliente.id}`, '_blank', 'noopener') : undefined}
            id="fv-cliente"
            aria-invalid={!!errores.cliente}
          />
          {errores.cliente && <p className="text-sm text-danger-text">{errores.cliente}</p>}
          {cliente && (
            <dl className="grid grid-cols-2 gap-2 text-[13px]">
              <div className="flex flex-col">
                <dt className="text-fg-muted">{t('cliente.cartera')}</dt>
                <dd className={cliente.saldoPorCobrar ? 'font-medium text-warning-text' : 'text-success-text'}>{cliente.saldoPorCobrar ?? tk('terceros.alDia')}</dd>
              </div>
              <div className="flex flex-col">
                <dt className="text-fg-muted">{t('cliente.plazo')}</dt>
                <dd className="text-fg">{cliente.plazoDias ? t('campos.dias', { n: cliente.plazoDias }) : t('campos.contado')}</dd>
              </div>
            </dl>
          )}
        </FormSection>
      }
      lineas={
        <FormSection titulo={t('secciones.lineas', { n: lineas.length })} icono={ListPlus}>
          <div id="lineas-factura" tabIndex={-1} className="outline-none">
            <DocumentoLineas
              lineas={lineasKit}
              modo="edicion"
              moneda={ctxMoneda}
              etiqueta={t('secciones.lineasEtiqueta')}
              estado={cargando ? 'cargando' : 'listo'}
              impuestosDisponibles={opcionesImpuesto}
              impuestosMultiples
              sinIncluidoPorLinea
              avisoSinImpuesto={tk('impuestos.seFacturaCero')}
              onCambiar={(clave, cambio) => {
                const l = lineas.find((x) => x.clave === clave);
                cambiarLinea(clave, {
                  ...(cambio.cantidad !== undefined ? { cantidad: cambio.cantidad } : {}),
                  ...(cambio.precioUnitario !== undefined ? { precio: cambio.precioUnitario } : {}),
                  ...(cambio.descuento !== undefined ? { descuento: cambio.descuento ?? 0 } : {}),
                  ...(cambio.descripcion !== undefined ? { descripcion: cambio.descripcion } : {}),
                  ...(cambio.impuestos
                    ? {
                        impuestos: cambio.impuestos.ids
                          .map((idImp) => opcionesImpuesto.find((o) => o.id === idImp) ?? l?.impuestos.find((i) => i.id === idImp))
                          .filter((x): x is ImpuestoLineaVenta => !!x)
                          .map((o) => ({ id: o.id, codigo: o.codigo, nombre: o.nombre, tarifa: o.tarifa })),
                        sinImpuestoElegido: cambio.impuestos.ids.length === 0,
                      }
                    : {}),
                });
              }}
              onQuitar={(clave) => {
                marcar();
                setLineas((prev) => prev.filter((l) => l.clave !== clave));
              }}
              accionesLinea={accionesLinea}
              vacio={{ titulo: t('lineas.vacio'), descripcion: t('lineas.vacioDescripcion') }}
              pie={
                <div className="flex flex-wrap items-center gap-2 p-3">
                  <KbdButton variante="secundario" tamano="sm" atajo="F3" icono={Search} onClick={() => setDlgProductos(true)} disabled={cargando}>
                    {t('buscarProducto')}
                  </KbdButton>
                  <KbdButton variante="secundario" tamano="sm" atajo="Alt+M" icono={Plus} onClick={() => setDlgManual(true)} disabled={cargando}>
                    {t('itemManual')}
                  </KbdButton>
                </div>
              }
            />
          </div>
          {errores.lineas && <p className="text-sm text-danger-text">{errores.lineas}</p>}
        </FormSection>
      }
      complementos={
        <>
          <FormSection titulo={t('secciones.notas')} icono={StickyNote}>
            <FormField etiqueta={t('campos.notasCliente')} ayuda={t('campos.notasClienteAyuda')}>
              <Textarea
                value={notas}
                rows={3}
                maxLength={5000}
                onChange={(e) => {
                  marcar();
                  setNotas(e.target.value);
                }}
              />
            </FormField>
            <FormField etiqueta={t('campos.terminosCondiciones')} ayuda={t('campos.terminosCondicionesAyuda')}>
              <Textarea
                value={terminosCondiciones}
                rows={3}
                maxLength={20000}
                onChange={(e) => {
                  marcar();
                  setTerminosCondiciones(e.target.value);
                }}
              />
            </FormField>
          </FormSection>
          <FormSection titulo={t('secciones.comision')} icono={User} columnas={2}>
            <FormField etiqueta={t('comision.vendedor')}>
              {() => (
                <SearchSelect
                  options={miembros.map((m) => ({ value: m.user_id, label: m.name }))}
                  value={vendedor}
                  onValueChange={(v) => void elegirVendedor(v)}
                  placeholder={t('comision.elegirVendedor')}
                  searchPlaceholder={t('comision.buscarVendedor')}
                  noneLabel={t('comision.sinAsignar')}
                  noneValue="__none__"
                />
              )}
            </FormField>
            <FormField
              id="fv-comision"
              etiqueta={t('comision.comision')}
              ayuda={tasaSugerida ? t('comision.sugerida') : undefined}
              error={errComision ? t(`comision.${errComision}`) : errores.comision}
            >
              {(c) => (
                <div className="flex flex-col gap-2">
                  <CampoNumero
                    {...aria(c)}
                    valor={tasaComision}
                    decimales={metodoComision === 'percentage' ? 2 : ctxMoneda.decimals}
                    minimo={0}
                    prefijo={metodoComision === 'fixed_amount' ? simboloMoneda(ctxMoneda) : undefined}
                    sufijo={metodoComision === 'percentage' ? '%' : undefined}
                    disabled={!vendedor}
                    onValorChange={(v) => {
                      marcar();
                      setTasaComision(v);
                      setTasaSugerida(false);
                    }}
                  />
                  <SegmentedControl<'percentage' | 'fixed_amount'>
                    etiqueta={t('comision.metodo')}
                    tamano="sm"
                    valor={metodoComision}
                    deshabilitado={!vendedor}
                    onValorChange={(v) => {
                      marcar();
                      setMetodoComision(v);
                    }}
                    opciones={[
                      { valor: 'percentage', etiqueta: t('comision.porcentaje') },
                      { valor: 'fixed_amount', etiqueta: t('comision.montoFijo') },
                    ]}
                  />
                </div>
              )}
            </FormField>
            {vendedor && (Number(tasaComision) || 0) > 0 && !errComision && (
              <p className="text-sm text-fg-secondary md:col-span-2">
                {t('comision.estimada', { importe: formatear(comisionEstimada(metodoComision, Number(tasaComision) || 0, totales.subtotal, totales.total)) })}
              </p>
            )}
          </FormSection>
        </>
      }
      resumen={
        <>
          <DocumentoTotales
            variante="venta"
            moneda={ctxMoneda}
            subtotal={totales.subtotal}
            impuestos={totales.impuestos.map((i) => ({ nombre: i.nombre.replace(/\s*\d+([.,]\d+)?\s*%$/, ''), tarifa: i.tarifa, base: i.base, importe: i.importe }))}
            impuestosIncluidos={incluido}
            total={totales.total}
            cargando={cargando}
          />
          {totales.lineasSinImpuesto > 0 && lineas.length > 0 && (
            <p className="rounded-lg border border-line-warning bg-warning-subtle px-3 py-2 text-[13px] text-warning-text">{t('sinImpuestoAviso', { n: totales.lineasSinImpuesto })}</p>
          )}
          <Tarjeta titulo={t('secciones.impuestos')}>
            <label className="flex items-center justify-between gap-3 text-sm text-fg">
              {t('campos.preciosIncluidos')}
              <Switch
                checked={incluido}
                onCheckedChange={(v) => {
                  marcar();
                  setIncluido(v === true);
                }}
              />
            </label>
            <p className="text-xs text-fg-secondary">{t('campos.preciosIncluidosAyuda')}</p>
            {impuestos.length === 0 ? (
              <p className="text-xs text-fg-secondary">
                {tk('impuestos.sinConfigurar')}{' '}
                <Link href="/app/finanzas/impuestos" className="text-link hover:underline">
                  {t('configurarImpuestos')}
                </Link>
              </p>
            ) : (
              <ul className="flex flex-col gap-1 text-[13px] text-fg-secondary">
                {impuestos.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">{i.nombre}</span>
                    {i.predeterminado && (
                      <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-brand-tint px-2 text-[11px] font-medium text-brand-deep">{tk('impuestos.predeterminado')}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
          <TarjetaAtajos
            atajos={[
              { tecla: 'F2', descripcion: t('atajos.cliente') },
              { tecla: 'F3', descripcion: t('atajos.productos') },
              { tecla: 'Alt+M', descripcion: t('atajos.manual') },
              { tecla: 'Ctrl+S', descripcion: t('atajos.guardar') },
              { tecla: 'Ctrl+Enter', descripcion: t('atajos.emitir') },
            ]}
          />
        </>
      }
      pieMovil={
        <>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-xs text-fg-secondary">{t('total')}</span>
            <span className="truncate text-base font-semibold tabular-nums text-fg">{formatear(totales.total)}</span>
          </span>
          <KbdButton icono={Send} cargando={guardando === 'emitir'} disabled={!!guardando || cargando || !!motivoEmitir} onClick={() => void emitir()}>
            {t('emitir')}
          </KbdButton>
        </>
      }
      dialogos={
        <>
          <AgregarProductosDocumento
            abierto={dlgProductos}
            onAbiertoChange={setDlgProductos}
            variante="venta"
            sucursal={sucursal}
            nombreSucursal={nombreSucursal}
            moneda={ctxMoneda}
            impuestos={opcionesImpuesto}
            onAgregar={agregarProducto}
          />
          <DialogoItemManual
            abierto={dlgManual}
            onAbiertoChange={setDlgManual}
            variante="venta"
            moneda={ctxMoneda}
            impuestos={opcionesImpuesto}
            sinIncluido
            incluidoInicial={incluido}
            calcularTotal={(i) => calcularLineaVenta({ cantidad: i.cantidad, precio: i.precio, descuento: 0, impuestos: opcionesImpuesto.filter((o) => i.impuestos.includes(o.id)) }, incluido).total_line}
            onAgregar={(i) => {
              marcar();
              setLineas((prev) => [
                ...prev,
                {
                  clave: nuevaClave(),
                  product_id: null,
                  descripcion: i.descripcion,
                  sku: null,
                  cantidad: i.cantidad,
                  precio: i.precio,
                  descuento: 0,
                  impuestos: opcionesImpuesto.filter((o) => i.impuestos.includes(o.id)).map((o) => ({ id: o.id, codigo: o.codigo, nombre: o.nombre, tarifa: o.tarifa })),
                  nota: i.nota,
                  manual: true,
                  serial: false,
                  controlaStock: false,
                  stock: null,
                  sinImpuestoElegido: i.impuestos.length === 0,
                },
              ]);
              setErrores((e) => ({ ...e, lineas: undefined }));
            }}
          />
          <DialogoTextoLinea
            titulo={t('lineas.nota')}
            ayuda={t('lineas.notaAyuda')}
            abierto={!!notaLinea}
            valorInicial={notaLinea?.nota ?? ''}
            maximo={500}
            onAbiertoChange={(v) => !v && setNotaLinea(null)}
            onGuardar={(texto) => {
              if (notaLinea) cambiarLinea(notaLinea.clave, { nota: texto.trim() || null });
              setNotaLinea(null);
            }}
          />
          {serialItems.length > 0 && sucursal && (
            <SerialSelectorDialog
              open={dlgSeriales}
              onOpenChange={setDlgSeriales}
              items={serialItems}
              organizationId={getOrganizationId()}
              branchId={sucursal}
              onConfirm={(sel) => {
                marcar();
                setSeriales(sel);
                setDlgSeriales(false);
              }}
            />
          )}
          {faltantes && (
            <Dialogo
              abierto
              onAbiertoChange={(v) => !v && setFaltantes(null)}
              titulo={t('faltantes.titulo')}
              descripcion={t('faltantes.descripcion')}
              ancho={560}
              icono={FileText}
              textoCancelar={t('faltantes.seguirBorrador')}
              primario={{ etiqueta: t('faltantes.ajustarYEmitir'), onClick: () => void ajustarYEmitir(), cargando: guardando === 'emitir' }}
              secundarios={[{ etiqueta: t('faltantes.verExistencias'), onClick: () => window.open('/app/inventario/stock', '_blank', 'noopener') }]}
            >
              <ul className="flex flex-col gap-2 text-sm">
                {faltantes.lista.map((f) => (
                  <li key={f.product_id} className="flex items-center justify-between gap-3 rounded-lg border border-line-warning bg-warning-subtle px-3 py-2">
                    <span className="min-w-0 truncate font-medium text-fg">{f.producto}</span>
                    <span className="shrink-0 text-warning-text">{t('faltantes.linea', { requerido: f.requerido, disponible: f.disponible })}</span>
                  </li>
                ))}
              </ul>
              {faltantes.cambios.length > 0 && (
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium text-fg">{t('faltantes.cambios')}</p>
                  <ul className="flex flex-col gap-1 text-[13px] text-fg-secondary">
                    {faltantes.cambios.map((c) => (
                      <li key={c.clave}>{c.despues > 0 ? t('faltantes.cambio', { producto: c.descripcion, antes: c.antes, despues: c.despues }) : t('faltantes.quita', { producto: c.descripcion })}</li>
                    ))}
                  </ul>
                </div>
              )}
            </Dialogo>
          )}
          <DialogoSalirConCambios
            abierto={!!salir}
            onAbiertoChange={(v) => !v && setSalir(null)}
            guardando={guardando === 'salir'}
            onSalir={() => {
              const destino = salir ?? volver;
              setSucio(false);
              setSalir(null);
              router.push(destino);
            }}
            onGuardarYSalir={() => void guardarBorrador(salir ?? undefined)}
          />
        </>
      }
    />
  );
}

// ─── Solo lectura: emitida o anulada (M12) ──────────────────────────────

function VistaNoEditable({
  factura,
  lineas,
  cliente,
  incluido,
  moneda,
}: {
  factura: FacturaCargada;
  lineas: LineaVenta[];
  cliente: string | null;
  incluido: boolean;
  moneda: ReturnType<ReturnType<typeof useMonedaOrganizacion>['paraDocumento']>;
}) {
  const t = useTranslations('facturasVenta.v2');
  const tv = useTranslations('facturasVenta');
  const { formatDate } = useFormatDate(factura.branch_id);
  const etiquetaEstado = useEtiquetaEstado();
  const totales = totalesFacturaVenta(lineas, incluido);
  const anulada = factura.status === 'void' || factura.status === 'cancelled';
  const detalle = `${RUTA_FACTURAS_VENTA}/${factura.id}`;
  const enlace =
    'inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';
  const numero = factura.number ?? tv('detalle.sinNumero');
  return (
    <div className="flex flex-col gap-4 pb-8 lg:gap-5">
      <DocumentoCabecera
        variante="formulario"
        tipo="factura"
        titulo={t('tituloFactura', { numero })}
        subtitulo={[factura.issue_date ? t('emitidaEl', { fecha: formatDate(factura.issue_date) }) : null, cliente].filter(Boolean).join(' · ')}
        estado={factura.status}
        volverA={detalle}
        migas={[{ etiqueta: t('migaListado'), href: RUTA_FACTURAS_VENTA }, { etiqueta: numero }]}
        acciones={
          <>
            <Link href={detalle} className={enlace}>
              <FileText aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('noEditable.ver')}
            </Link>
            <Link href={`${RUTA_FACTURAS_VENTA}/nuevo?duplicar=${factura.id}`} className={enlace}>
              <Copy aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('noEditable.duplicar')}
            </Link>
            {!anulada && (
              <Link
                href={`${detalle}?accion=nota-credito`}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-action px-4 text-sm font-medium text-fg-on-brand hover:bg-brand-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
              >
                <FileMinus aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('noEditable.notaCredito')}
              </Link>
            )}
          </>
        }
      />
      <p role="status" className="rounded-lg border border-line-warning bg-warning-subtle px-4 py-3 text-sm text-warning-text">
        {anulada ? t('noEditable.motivoAnulada') : t('noEditable.motivoEmitida', { estado: etiquetaEstado(factura.status) })}
      </p>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-5">
        <DocumentoLineas
          lineas={lineas.map((l) => {
            const k = calcularLineaVenta(l, incluido);
            return {
              id: l.clave,
              descripcion: l.descripcion,
              sku: l.sku,
              nota: l.nota,
              cantidad: l.cantidad,
              unidad: l.unidad ?? null,
              decimalesCantidad: l.decimalesCantidad ?? null,
              precioUnitario: l.precio,
              descuento: l.descuento || null,
              impuestos: l.impuestos.map((i) => ({ nombre: i.nombre, tarifa: /\d/.test(i.nombre) ? null : i.tarifa, incluido })),
              total: k.total_line,
            };
          })}
          modo="lectura"
          moneda={moneda}
        />
        <DocumentoTotales
          variante="venta"
          moneda={moneda}
          subtotal={totales.subtotal}
          impuestos={totales.impuestos.map((i) => ({ nombre: i.nombre.replace(/\s*\d+([.,]\d+)?\s*%$/, ''), tarifa: i.tarifa, base: i.base, importe: i.importe }))}
          impuestosIncluidos={incluido}
          total={totales.total}
        />
      </div>
    </div>
  );
}

