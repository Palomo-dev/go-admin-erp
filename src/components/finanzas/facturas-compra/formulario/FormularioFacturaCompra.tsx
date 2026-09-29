'use client';

/**
 * Nueva / editar factura de compra — MISMA ESTRUCTURA que la factura de venta
 * v2 (docs/design/FACTURA-VENTA-FORMULARIO-V2.md §7; Figma `1066:105465`):
 * cabecera, datos del documento y tercero arriba, líneas a todo el ancho,
 * notas y retenciones abajo, resumen fijo a la derecha. Compone las mismas
 * piezas del kit (`FormularioDocumentoLayout`, `DocumentoLineas` con estados e
 * impuestos por línea, `DocumentoTotales`, «Elegir proveedor», «Agregar
 * productos», ítem manual, salir con cambios) con SUS campos y botones.
 *
 * Por qué dos formularios y no uno parametrizado: venta y compra comparten la
 * estructura y las piezas, no el flujo ni el contrato (emitir con resolución,
 * FE, comisión y arqueo frente a número del proveedor, plazo, recepción,
 * retenciones y documento soporte; `fn_factura_venta_*` frente a
 * `fn_factura_compra_*`). Un solo componente con variante llenaría la pantalla
 * de condiciones por tipo; dos formularios delgados sobre las mismas piezas
 * mantienen la estructura igual sin mezclar reglas.
 *
 * - Guarda por `POST /api/facturas-compra` → `fn_factura_compra_guardar`: UNA
 *   transacción con cabecera, líneas con `total_line` BRUTO, retenciones y
 *   seriales. «Confirmar factura» guarda y abre la confirmación (recepción y
 *   documento soporte, D2).
 * - El número es el del PROVEEDOR; «#» pone el consecutivo interno solo si la
 *   factura del proveedor no trae número (D11). Un repetido lo rechaza la base.
 * - `?orden=<uuid>`: precarga lo recibido de la orden, fija la sucursal y
 *   avisa las diferencias con lo pedido.
 * - Retenciones: se eligen de las configuradas (clase `withholding`) o se
 *   escriben a mano; viajan con su `tax_code`.
 * - Atajos F2, F3, Alt+M, Ctrl+S y Ctrl+Enter (confirmar), como en venta: la
 *   captura es la misma. Sin autoguardado: una compra se registra de una vez
 *   contra la factura física del proveedor.
 */
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Barcode, CheckCircle2, FileText, Hash, ListPlus, Percent, Plus, ReceiptText, Save, Search, StickyNote, Trash2, Truck, Wallet } from 'lucide-react';
import { FormField, FormSection, KbdButton, Tarjeta, useAtajos, type AccionFila } from '@/components/kit';
import { CampoFecha } from '@/components/kit/CampoFecha';
import { CampoNumero } from '@/components/kit/CampoNumero';
import {
  DialogoItemManual,
  DialogoTextoLinea,
  DocumentoCabecera,
  DocumentoLineas,
  DocumentoTotales,
  idsDesdeCodigo,
  simboloMoneda,
  type InsigniaLinea,
  type LineaDocumento,
  type OpcionImpuesto,
} from '@/components/kit/documento';
import { DialogoSalirConCambios, FormularioDocumentoLayout, ResumenErrores, TarjetaAtajos, useAvisoSalida, type ErrorFormulario } from '@/components/kit/documento/FormularioDocumento';
import { useEtiquetaEstado } from '@/components/kit/useIdiomaKit';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { ElegirProveedor, documentoTexto, type ProveedorDocumento } from '@/components/finanzas/documento/terceros';
import { AgregarProductosDocumento } from '@/components/finanzas/documento/productos';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { addPlainDays } from '@/lib/utils/dateDisplay';
import { calcularLineaCompra, calcularTotalesCompra, valorRetencion } from '@/lib/services/compras/logica';
import { clienteCompras, ErrorPeticionCompra } from '@/lib/services/compras/clienteCompras';
import { leerDetalleFacturaCompra, type DetalleFacturaCompra } from '@/lib/services/compras/lecturasCompras';
import type { GuardarFacturaCompra } from '@/lib/services/compras/contrato';
import { impuestosOrganizacion, type ImpuestoDocumento, type ProductoParaDocumento } from '@/lib/services/documentos/edicionDocumento';
import { crearFormateadorMoneda } from '@/lib/utils/moneda';
import { useBaseCompras } from '../rutasCompras';
import { DialogoConfirmarCompra } from '../detalle/DialogosCompra';

interface LineaForm {
  key: string;
  product_id: number | null;
  description: string;
  sku: string | null;
  qty: number;
  unit_price: number;
  discount_amount: number;
  tax_rate: number;
  tax_code: string | null;
  serial_numbers: string[];
  note: string | null;
  track_serial: boolean;
  /** Ítem manual: la descripción se escribe en la línea. */
  manual?: boolean;
  /** Desde una orden: lo pedido, para avisar la diferencia con lo recibido. */
  pedido?: number | null;
}

interface RetencionForm {
  key: string;
  concept: string;
  base: number;
  rate: number;
  /** Retención configurada (`organization_taxes`, clase `withholding`); null = escrita a mano. */
  tax_code: string | null;
}

/** Props de accesibilidad de `FormField` para un control (sin `idEtiqueta`, que no es atributo del DOM). */
function aria(c: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean; 'aria-required'?: boolean }) {
  return { id: c.id, 'aria-describedby': c['aria-describedby'], 'aria-invalid': c['aria-invalid'], 'aria-required': c['aria-required'] };
}
let secuencia = 0;
const nuevaClave = () => `l${Date.now().toString(36)}${(secuencia++).toString(36)}`;
const OTRA = '__otra__';

const campoClases =
  'h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-60';
const botonSecundario =
  'inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50';

export default function FormularioFacturaCompra({ id }: { id?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const base = useBaseCompras();
  const t = useTranslations('facturasCompra');
  const tf = useTranslations('facturasCompra.formulario');
  const tk = useTranslations('kit.documentoEdicion');
  const moneda = useMonedaOrganizacion();
  const { branches, selectedBranchId } = useBranch();
  const ordenUuid = !id ? params?.get('orden') ?? null : null;

  const [cargando, setCargando] = useState(!!id || !!ordenUuid);
  const [noEditable, setNoEditable] = useState<string | null>(null);
  const [soloLectura, setSoloLectura] = useState<DetalleFacturaCompra | null>(null);
  const [proveedor, setProveedor] = useState<ProveedorDocumento | null>(null);
  const [numero, setNumero] = useState('');
  const [sucursal, setSucursal] = useState<number | null>(selectedBranchId ?? null);
  const { getToday, toDate, formatPlain } = useFormatDate(sucursal);
  const [emision, setEmision] = useState<string>(getToday());
  const [plazo, setPlazo] = useState<number | null>(30);
  const [vence, setVence] = useState<string>(addPlainDays(getToday(), 30));
  const [codigoMoneda, setCodigoMoneda] = useState<string>('');
  const [monedas, setMonedas] = useState<string[]>([]);
  const [ivaIncluido, setIvaIncluido] = useState(false);
  const [notas, setNotas] = useState('');
  const [poId, setPoId] = useState<number | null>(null);
  const [lineas, setLineas] = useState<LineaForm[]>([]);
  const [retenciones, setRetenciones] = useState<RetencionForm[]>([]);
  const [impuestos, setImpuestos] = useState<ImpuestoDocumento[]>([]);
  const [configuradas, setConfiguradas] = useState<ImpuestoDocumento[]>([]);
  const [comision, setComision] = useState<{ salesperson_id: string | null; rate: number; type: string; method: string; amount: number }>({
    salesperson_id: null,
    rate: 0,
    type: 'none',
    method: 'percentage',
    amount: 0,
  });
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState<'borrador' | 'confirmar' | 'salir' | null>(null);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [confirmarId, setConfirmarId] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [errorConfirmar, setErrorConfirmar] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [dlgProductos, setDlgProductos] = useState(false);
  const [dlgProveedor, setDlgProveedor] = useState(false);
  const [lineaSeriales, setLineaSeriales] = useState<LineaForm | null>(null);
  const [lineaNota, setLineaNota] = useState<LineaForm | null>(null);
  const [salir, setSalir] = useState<string | null>(null);
  const [sucio, setSucio] = useState(false);
  const marcar = () => setSucio(true);
  useAvisoSalida(sucio);

  const ctxMoneda = moneda.paraDocumento(codigoMoneda || null);
  const formatear = useMemo(() => crearFormateadorMoneda(ctxMoneda), [ctxMoneda]);
  const nombreSucursal = branches.find((b) => b.id === sucursal)?.name ?? null;
  const opcionesImpuesto: OpcionImpuesto[] = useMemo(() => {
    const lista: OpcionImpuesto[] = impuestos.map((i) => ({ id: i.id, codigo: i.codigo, nombre: i.nombre, tarifa: i.tarifa, predeterminado: i.predeterminado }));
    // Tarifas de líneas guardadas o de la orden que no están en la lista: se conservan (nada se pierde al editar).
    for (const l of lineas) {
      if (l.tax_rate > 0 && idsDesdeCodigo(lista, l.tax_code, l.tax_rate).length === 0) {
        lista.push({ id: `tx:${l.tax_code ?? l.tax_rate}`, codigo: l.tax_code, nombre: l.tax_code ?? `${tf('iva')} ${l.tax_rate} %`, tarifa: l.tax_rate });
      }
    }
    return lista;
  }, [impuestos, lineas, tf]);

  // ── Monedas e impuestos de la organización ────────────────────────────
  useEffect(() => {
    let cancelado = false;
    supabase
      .from('organization_currencies')
      .select('currency_code, is_base')
      .eq('organization_id', getOrganizationId())
      .order('is_base', { ascending: false })
      .then(({ data }) => {
        if (!cancelado) setMonedas(((data ?? []) as Array<{ currency_code: string }>).map((m) => m.currency_code.trim().toUpperCase()));
      });
    impuestosOrganizacion(getOrganizationId())
      .then((r) => {
        if (cancelado) return;
        setImpuestos(r.impuestos);
        setConfiguradas(r.retenciones);
      })
      .catch(() => undefined);
    return () => {
      cancelado = true;
    };
  }, []);

  // ── Edición: cargar el borrador ──────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    let cancelado = false;
    leerDetalleFacturaCompra(getOrganizationId(), id)
      .then((f) => {
        if (cancelado) return;
        if (!f) {
          setNoEditable(tf('noEncontrada'));
          return;
        }
        if (f.status !== 'draft') {
          setSoloLectura(f);
          return;
        }
        setProveedor(f.proveedor ? { id: String(f.proveedor.id), nombre: f.proveedor.name, nit: documentoTexto('nit', f.proveedor.nit, f.proveedor.dv), telefono: f.proveedor.phone } : null);
        setNumero(f.number_ext);
        setSucursal(f.branch_id);
        if (f.issue_date) setEmision(toDate(new Date(f.issue_date)));
        if (f.due_date) setVence(toDate(new Date(f.due_date)));
        setPlazo(f.payment_terms);
        setCodigoMoneda(f.currency ?? '');
        setIvaIncluido(f.tax_included);
        setNotas(f.notes ?? '');
        setPoId(f.po_id);
        setLineas(
          f.lineas.map((l) => ({
            key: l.id,
            product_id: l.product_id,
            description: l.description,
            sku: l.sku,
            qty: l.qty,
            unit_price: l.unit_price,
            discount_amount: l.discount_amount,
            tax_rate: l.tax_rate,
            tax_code: l.tax_code,
            serial_numbers: l.serial_numbers,
            note: l.note,
            track_serial: l.serial_numbers.length > 0,
            manual: !l.product_id,
          })),
        );
        setRetenciones(f.retenciones.map((r) => ({ key: r.id, concept: r.concept, base: r.base, rate: r.rate, tax_code: r.tax_code })));
        setComision({
          salesperson_id: f.salesperson_id,
          rate: f.commission_rate,
          type: f.commission_type ?? 'none',
          method: f.commission_method ?? 'percentage',
          amount: f.commission_amount,
        });
      })
      .catch(() => !cancelado && setNoEditable(tf('errorCarga')))
      .finally(() => !cancelado && setCargando(false));
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carga única por id
  }, [id]);

  // ── Desde una orden de compra: lo recibido ───────────────────────────────
  useEffect(() => {
    if (!ordenUuid) return;
    let cancelado = false;
    (async () => {
      const { data: oc } = await supabase
        .from('purchase_orders')
        .select('id, branch_id, supplier:suppliers(id, name, nit, phone, credit_days), items:purchase_order_items(product_id, quantity, received_quantity, unit_cost, product:products(name, sku, track_serial), serials_received)')
        .eq('uuid', ordenUuid)
        .eq('organization_id', getOrganizationId())
        .maybeSingle();
      if (cancelado || !oc) return;
      const o = oc as unknown as {
        id: number;
        branch_id: number;
        supplier: { id: number; name: string; nit: string | null; phone: string | null; credit_days: number | null } | null;
        items: Array<{ product_id: number; quantity: number | null; received_quantity: number; unit_cost: number; serials_received: string[] | null; product: { name: string; sku: string | null; track_serial: boolean | null } | null }>;
      };
      setPoId(o.id);
      setSucursal(o.branch_id);
      if (o.supplier) {
        setProveedor({ id: String(o.supplier.id), nombre: o.supplier.name, nit: o.supplier.nit, telefono: o.supplier.phone });
        if (o.supplier.credit_days) setPlazo(o.supplier.credit_days);
      }
      setNotas(tf('notaOrden', { orden: `OC-${o.id}` }));
      setLineas(
        o.items
          .filter((i) => Number(i.received_quantity) > 0)
          .map((i) => ({
            key: nuevaClave(),
            product_id: i.product_id,
            description: i.product?.name ?? tf('producto'),
            sku: i.product?.sku ?? null,
            qty: Number(i.received_quantity),
            unit_price: Number(i.unit_cost),
            discount_amount: 0,
            tax_rate: 0,
            tax_code: null,
            serial_numbers: [],
            note: null,
            track_serial: false,
            pedido: i.quantity === null || i.quantity === undefined ? null : Number(i.quantity),
          })),
      );
    })()
      .catch(() => undefined)
      .finally(() => !cancelado && setCargando(false));
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carga única por orden
  }, [ordenUuid]);

  // Plazo → vencimiento.
  useEffect(() => {
    if (plazo !== null && emision) setVence(addPlainDays(emision, plazo));
  }, [plazo, emision]);

  const totales = useMemo(
    () =>
      calcularTotalesCompra(
        lineas,
        ivaIncluido,
        retenciones.map((r) => ({ concepto: r.concept, base: r.base, tarifa: r.rate })),
      ),
    [lineas, ivaIncluido, retenciones],
  );

  const agregarProducto = (p: ProductoParaDocumento) => {
    marcar();
    // Una tarifa por línea en compra (la RPC guarda una): la del producto, como antes.
    const imp = p.impuestos[0] ?? null;
    setLineas((prev) => [
      ...prev,
      {
        key: nuevaClave(),
        product_id: p.id,
        description: p.nombre,
        sku: p.sku ?? null,
        qty: 1,
        unit_price: Number(p.precio) || 0,
        discount_amount: 0,
        tax_rate: imp ? Number(imp.tarifa) || 0 : 0,
        tax_code: imp?.codigo ?? null,
        serial_numbers: [],
        note: null,
        track_serial: p.serial === true,
      },
    ]);
    setErrores((e) => ({ ...e, lineas: '' }));
  };

  const cambiarLinea = (key: string, cambio: Partial<LineaForm>) => {
    marcar();
    setLineas((prev) => prev.map((l) => (l.key === key ? { ...l, ...cambio } : l)));
  };

  const lineasKit: LineaDocumento[] = lineas.map((l) => {
    const insignias: InsigniaLinea[] = [];
    if (l.manual) insignias.push({ texto: tk('lineas.itemManual') });
    if (l.serial_numbers.length > 0) insignias.push({ texto: tf('v2.seriales', { n: l.serial_numbers.length, total: l.qty }), tono: l.serial_numbers.length === l.qty ? 'exito' : 'advertencia' });
    const diferencia = l.pedido !== null && l.pedido !== undefined && l.pedido !== l.qty;
    if (diferencia) insignias.push({ texto: tf('v2.diferenciaOrden'), tono: 'advertencia' });
    const k = calcularLineaCompra(l, ivaIncluido);
    return {
      id: l.key,
      descripcion: l.description,
      sku: l.sku,
      nota: l.note,
      seriales: l.serial_numbers,
      cantidad: l.qty,
      precioUnitario: l.unit_price,
      descuento: l.discount_amount || null,
      total: k.total_line,
      impuestosSeleccion: { ids: idsDesdeCodigo(opcionesImpuesto, l.tax_code, l.tax_rate), incluido: ivaIncluido },
      descripcionEditable: l.manual,
      error: errores[`linea.${l.key}`] || null,
      aviso: diferencia ? tf('v2.avisoOrden', { pedido: l.pedido as number, recibido: l.qty }) : null,
      insignias,
      detalleTotal: k.impuesto > 0 ? tf('v2.detalleIva', { importe: formatear(k.impuesto) }) : null,
    };
  });

  const accionesLinea = (linea: LineaDocumento): AccionFila[] => {
    const l = lineas.find((x) => x.key === linea.id);
    if (!l) return [];
    return [
      { id: 'nota', etiqueta: tf('lineas.nota'), icono: StickyNote, onSelect: () => setLineaNota(l) },
      { id: 'seriales', etiqueta: tf('lineas.seriales'), icono: Barcode, onSelect: () => setLineaSeriales(l), oculta: !l.product_id },
    ];
  };

  // ── Validación y payload ─────────────────────────────────────────────────
  const validar = (): boolean => {
    const e: Record<string, string> = {};
    if (!proveedor) e.proveedor = tf('errores.proveedor');
    if (!numero.trim()) e.numero = tf('errores.numero');
    if (!sucursal) e.sucursal = tf('errores.sucursal');
    if (!emision) e.emision = tf('errores.emision');
    if (vence && emision && vence < emision) e.vence = tf('errores.vence');
    if (lineas.length === 0) e.lineas = tf('errores.lineas');
    for (const l of lineas) {
      if (!(l.qty > 0) || l.unit_price < 0 || l.discount_amount < 0 || l.discount_amount > l.qty * l.unit_price) e[`linea.${l.key}`] = tf('errores.linea');
      if (!l.description.trim()) e[`linea.${l.key}`] = tf('errores.descripcion');
    }
    for (const r of retenciones) if (!r.concept.trim() || r.base < 0 || r.rate < 0 || r.rate > 100) e.retenciones = tf('errores.retencion');
    setErrores(e);
    return Object.keys(e).length === 0;
  };

  const payload = (): GuardarFacturaCompra => ({
    ...(id ? { id } : {}),
    branch_id: sucursal as number,
    supplier_id: Number(proveedor?.id),
    number_ext: numero.trim(),
    issue_date: emision,
    due_date: vence || null,
    currency: codigoMoneda || null,
    notes: notas.trim() || null,
    payment_terms: plazo,
    tax_included: ivaIncluido,
    po_id: poId,
    salesperson_id: comision.salesperson_id,
    commission_rate: comision.rate,
    commission_type: comision.salesperson_id && comision.rate > 0 ? (comision.type === 'none' ? 'salesperson' : (comision.type as 'salesperson' | 'intermediation_purchase')) : 'none',
    commission_method: comision.method,
    commission_amount: comision.amount,
    lines: lineas.map((l) => ({
      product_id: l.product_id,
      description: l.description.trim(),
      qty: l.qty,
      unit_price: l.unit_price,
      discount_amount: l.discount_amount,
      tax_rate: l.tax_rate,
      tax_code: l.tax_code,
      serial_numbers: l.serial_numbers,
      note: l.note,
    })),
    withholdings: retenciones.map((r) => ({ concept: r.concept.trim(), base: r.base, rate: r.rate, ...(r.tax_code ? { tax_code: r.tax_code } : {}) })),
  });

  const mensajeError = (e: unknown): string => {
    const codigo = e instanceof ErrorPeticionCompra ? e.codigo : 'error_desconocido';
    return t.has(`errores.${codigo}`) ? t(`errores.${codigo}` as never) : t('errores.error_desconocido');
  };

  const guardar = async (modo: 'borrador' | 'confirmar' | 'salir', destino?: string) => {
    if (!validar()) {
      setErrorGeneral(null);
      return;
    }
    setGuardando(modo);
    setErrorGeneral(null);
    try {
      const r = await clienteCompras.guardar(payload());
      setSucio(false);
      if (r.seriales_omitidos.length > 0) toastError(tf('serialesOmitidos', { n: r.seriales_omitidos.length }));
      if (modo === 'confirmar') {
        setConfirmarId(r.id);
      } else {
        toastSuccess(tf('guardado', { numero: r.number_ext }));
        if (modo === 'salir' && destino) router.push(destino);
        else router.replace(`${base}/${r.id}`);
      }
    } catch (e) {
      const texto = mensajeError(e);
      if (e instanceof ErrorPeticionCompra && e.codigo === 'numero_duplicado') setErrores((prev) => ({ ...prev, numero: texto }));
      setErrorGeneral(texto);
    } finally {
      setGuardando(null);
    }
  };

  const volver = id ? `${base}/${id}` : base;
  const cancelar = (destino: string = volver) => {
    if (sucio) setSalir(destino);
    else router.push(destino);
  };

  const listaErrores: ErrorFormulario[] = Object.entries(errores)
    .filter(([, v]) => !!v)
    .map(([campo, mensaje]) => ({ campo, mensaje, idControl: campo.startsWith('linea') ? 'lineas-compra' : `fc-${campo}` }));

  useAtajos(
    [
      { tecla: 'F2', descripcion: tf('v2.atajos.proveedor'), accion: () => setDlgProveedor(true), permitirEnCampo: true },
      { tecla: 'F3', descripcion: tf('v2.atajos.productos'), accion: () => setDlgProductos(true), permitirEnCampo: true },
      { tecla: 'Alt+M', descripcion: tf('v2.atajos.manual'), accion: () => setManual(true), permitirEnCampo: true },
      { tecla: 'Ctrl+S', descripcion: tf('v2.atajos.guardar'), accion: () => void guardar('borrador'), permitirEnCampo: true, cuando: () => !guardando },
      { tecla: 'Ctrl+Enter', descripcion: tf('v2.atajos.confirmar'), accion: () => void guardar('confirmar'), permitirEnCampo: true, cuando: () => !guardando },
    ],
    { activo: !cargando && !noEditable && !soloLectura && !dlgProductos && !manual && !lineaNota && !lineaSeriales && !confirmarId && !salir },
  );

  const siguienteNumero = useCallback(() => {
    void clienteCompras
      .siguienteNumero()
      .then((n) => {
        marcar();
        setNumero(n);
      })
      .catch((e) => toastError(mensajeError(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (noEditable) {
    return (
      <div className="flex flex-col gap-4">
        <DocumentoCabecera variante="formulario" tipo="facturaCompra" titulo={tf('tituloNueva')} volverA={base} migas={[{ etiqueta: t('titulo'), href: base }]} />
        <p role="alert" className="rounded-lg border border-line-danger bg-danger-subtle px-4 py-3 text-sm text-danger-text">
          {noEditable}
        </p>
        <Link href={base} className={`${botonSecundario} self-start`}>
          {tf('volver')}
        </Link>
      </div>
    );
  }
  if (soloLectura) return <VistaCompraNoEditable factura={soloLectura} base={base} />;

  const retencionConfigurada = (r: RetencionForm) => (r.tax_code && configuradas.some((c) => c.codigo === r.tax_code) ? r.tax_code : OTRA);

  return (
    <FormularioDocumentoLayout
      cabecera={
        <DocumentoCabecera
          variante="formulario"
          tipo="facturaCompra"
          titulo={id ? tf('tituloEditar', { numero }) : tf('tituloNueva')}
          subtitulo={[poId ? tf('desdeOrden', { orden: `OC-${poId}` }) : tf('subtitulo'), nombreSucursal, ctxMoneda.code].filter(Boolean).join(' · ')}
          volverA={volver}
          onVolver={() => cancelar()}
          cargando={cargando}
          migas={[{ etiqueta: t('titulo'), href: base }, { etiqueta: id ? numero : tf('tituloNueva') }]}
          movil={{ titulo: id ? tf('tituloEditar', { numero }) : tf('tituloNueva') }}
          acciones={
            <>
              <button type="button" onClick={() => cancelar()} className={botonSecundario}>
                {tf('cancelar')}
              </button>
              <KbdButton variante="secundario" atajo="Ctrl+S" icono={Save} cargando={guardando === 'borrador'} disabled={!!guardando || cargando} onClick={() => void guardar('borrador')}>
                {tf('guardarBorrador')}
              </KbdButton>
              <KbdButton atajo="Ctrl+Enter" icono={CheckCircle2} cargando={guardando === 'confirmar'} disabled={!!guardando || cargando} onClick={() => void guardar('confirmar')}>
                {tf('confirmar')}
              </KbdButton>
            </>
          }
        />
      }
      avisos={
        <>
          {poId && (
            <p role="status" className="rounded-lg border border-line-brand bg-brand-tint px-4 py-3 text-sm text-brand-deep">
              {tf('v2.bandaOrden', { orden: `OC-${poId}` })}
            </p>
          )}
          <ResumenErrores errores={listaErrores} />
          {errorGeneral && (
            <p role="alert" className="rounded-lg border border-line-danger bg-danger-subtle px-4 py-3 text-sm text-danger-text">
              {errorGeneral}
            </p>
          )}
        </>
      }
      datos={
        <FormSection titulo={tf('v2.secciones.documento')} icono={ReceiptText} columnas={2}>
          <FormField id="fc-numero" etiqueta={tf('campos.numero')} ayuda={tf('v2.numeroAyuda')} error={errores.numero} obligatorio>
            {(c) => (
              <div className="flex gap-2">
                <Input
                  {...aria(c)}
                  value={numero}
                  maxLength={60}
                  onChange={(e) => {
                    marcar();
                    setNumero(e.target.value);
                  }}
                  className="h-10"
                />
                <button
                  type="button"
                  onClick={siguienteNumero}
                  title={tf('v2.consecutivoInterno')}
                  aria-label={tf('v2.consecutivoInterno')}
                  className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-line-strong bg-surface text-fg-secondary hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <Hash aria-hidden="true" className="size-4" strokeWidth={1.5} />
                </button>
              </div>
            )}
          </FormField>
          <FormField id="fc-sucursal" etiqueta={tf('v2.sucursalRecibe')} ayuda={poId ? tf('v2.sucursalFija') : undefined} error={errores.sucursal} obligatorio>
            {(c) => (
              <select
                {...aria(c)}
                value={sucursal ?? ''}
                disabled={!!poId}
                onChange={(e) => {
                  marcar();
                  setSucursal(e.target.value ? Number(e.target.value) : null);
                }}
                className={campoClases}
              >
                <option value="">{tf('campos.elegir')}</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          <FormField id="fc-emision" etiqueta={tf('campos.emision')} error={errores.emision} obligatorio>
            {(c) => (
              <CampoFecha
                {...aria(c)}
                valor={emision}
                max={getToday()}
                hoy={getToday()}
                onValorChange={(dia) => {
                  marcar();
                  setEmision(dia);
                }}
              />
            )}
          </FormField>
          <FormField etiqueta={tf('campos.plazo')} ayuda={vence ? tf('campos.venceEl', { fecha: formatPlain(vence) }) : undefined}>
            {(c) => (
              <CampoNumero
                {...aria(c)}
                valor={plazo}
                decimales={0}
                minimo={0}
                sufijo={tf('campos.dias')}
                onValorChange={(v) => {
                  marcar();
                  setPlazo(v);
                }}
              />
            )}
          </FormField>
          <FormField id="fc-vence" etiqueta={tf('campos.vence')} ayuda={tf('v2.venceAyuda')} error={errores.vence}>
            {(c) => (
              <CampoFecha
                {...aria(c)}
                valor={vence}
                min={emision}
                hoy={getToday()}
                onValorChange={(dia) => {
                  marcar();
                  setPlazo(null);
                  setVence(dia);
                }}
              />
            )}
          </FormField>
          <FormField etiqueta={tf('campos.moneda')} ayuda={tf('campos.monedaAyuda', { base: moneda.code })}>
            {(c) => (
              <select
                {...aria(c)}
                value={codigoMoneda}
                onChange={(e) => {
                  marcar();
                  setCodigoMoneda(e.target.value);
                }}
                className={campoClases}
              >
                <option value="">{tf('campos.monedaBase', { base: moneda.code })}</option>
                {monedas
                  .filter((m) => m !== moneda.code)
                  .map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
              </select>
            )}
          </FormField>
          <label className="flex items-center gap-2 text-sm text-fg md:col-span-2">
            <Checkbox
              checked={ivaIncluido}
              onCheckedChange={(v) => {
                marcar();
                setIvaIncluido(v === true);
              }}
              className="size-[18px] rounded"
            />
            {tf('campos.ivaIncluido')}
          </label>
          <p className="rounded-md border border-line bg-subtle px-3 py-2 text-[13px] text-fg-secondary md:col-span-2">{tf('v2.recepcionAlConfirmar')}</p>
        </FormSection>
      }
      tercero={
        <FormSection titulo={tf('v2.secciones.proveedor')} icono={Truck}>
          <ElegirProveedor
            proveedor={proveedor}
            abierto={dlgProveedor}
            onAbiertoChange={setDlgProveedor}
            deshabilitado={!!poId}
            onCambiar={(p) => {
              marcar();
              setProveedor(p);
              setErrores((e) => ({ ...e, proveedor: '' }));
              if (p.creditDays && p.creditDays > 0) setPlazo(p.creditDays);
            }}
            onQuitar={
              poId
                ? undefined
                : () => {
                    marcar();
                    setProveedor(null);
                  }
            }
            id="fc-proveedor"
            aria-invalid={!!errores.proveedor}
          />
          {errores.proveedor && <p className="text-sm text-danger-text">{errores.proveedor}</p>}
        </FormSection>
      }
      lineas={
        <FormSection titulo={tf('v2.secciones.lineas', { n: lineas.length })} icono={ListPlus}>
          <div id="lineas-compra" tabIndex={-1} className="outline-none">
            <DocumentoLineas
              lineas={lineasKit}
              modo="edicion"
              moneda={ctxMoneda}
              etiqueta={tf('secciones.lineas')}
              estado={cargando ? 'cargando' : 'listo'}
              impuestosDisponibles={opcionesImpuesto}
              impuestosMultiples={false}
              sinIncluidoPorLinea
              avisoSinImpuesto={tk('impuestos.seCompraCero')}
              onCambiar={(key, cambio) => {
                const imp = cambio.impuestos ? opcionesImpuesto.find((o) => o.id === cambio.impuestos?.ids[0]) : undefined;
                cambiarLinea(key, {
                  ...(cambio.cantidad !== undefined ? { qty: cambio.cantidad } : {}),
                  ...(cambio.precioUnitario !== undefined ? { unit_price: cambio.precioUnitario } : {}),
                  ...(cambio.descuento !== undefined ? { discount_amount: cambio.descuento ?? 0 } : {}),
                  ...(cambio.descripcion !== undefined ? { description: cambio.descripcion } : {}),
                  ...(cambio.impuestos ? { tax_rate: imp ? Number(imp.tarifa) || 0 : 0, tax_code: imp?.codigo ?? null } : {}),
                });
              }}
              onQuitar={(key) => {
                marcar();
                setLineas((prev) => prev.filter((l) => l.key !== key));
              }}
              accionesLinea={accionesLinea}
              vacio={{ titulo: tf('lineas.vacio'), descripcion: tf('v2.vacioDescripcion') }}
              pie={
                <div className="flex flex-wrap items-center gap-2 p-3">
                  <KbdButton variante="secundario" tamano="sm" atajo="F3" icono={Search} onClick={() => setDlgProductos(true)} disabled={cargando}>
                    {tf('v2.buscarProducto')}
                  </KbdButton>
                  <KbdButton variante="secundario" tamano="sm" atajo="Alt+M" icono={Plus} onClick={() => setManual(true)} disabled={cargando}>
                    {tf('v2.itemManual')}
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
          <FormSection titulo={tf('secciones.notas')} icono={StickyNote}>
            <FormField etiqueta={tf('campos.notas')} etiquetaOculta>
              {(c) => (
                <Textarea
                  {...aria(c)}
                  value={notas}
                  maxLength={2000}
                  rows={3}
                  onChange={(e) => {
                    marcar();
                    setNotas(e.target.value);
                  }}
                />
              )}
            </FormField>
          </FormSection>
          <FormSection
            titulo={tf('secciones.retenciones')}
            icono={Percent}
            descripcion={tf('retenciones.descripcion')}
            accion={
              <button
                type="button"
                onClick={() => {
                  marcar();
                  const c = configuradas[0];
                  setRetenciones((prev) => [
                    ...prev,
                    c
                      ? { key: nuevaClave(), concept: c.nombre, base: totales.subtotal, rate: c.tarifa, tax_code: c.codigo }
                      : { key: nuevaClave(), concept: tf('retenciones.retefuente'), base: totales.subtotal, rate: 2.5, tax_code: null },
                  ]);
                }}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {tf('retenciones.agregar')}
              </button>
            }
          >
            {retenciones.length === 0 ? (
              <p className="text-sm text-fg-secondary">{tf('retenciones.vacio')}</p>
            ) : (
              <div className="flex flex-col gap-3" id="fc-retenciones">
                {retenciones.map((r) => (
                  <div key={r.key} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px_100px_120px_40px] sm:items-end">
                    <div className="flex flex-col gap-2">
                      {configuradas.length > 0 && (
                        <FormField etiqueta={tf('v2.retencionConfigurada')}>
                          {(c) => (
                            <select
                              {...aria(c)}
                              value={retencionConfigurada(r)}
                              onChange={(e) => {
                                marcar();
                                const elegida = configuradas.find((x) => x.codigo === e.target.value);
                                setRetenciones((prev) =>
                                  prev.map((x) =>
                                    x.key === r.key ? (elegida ? { ...x, concept: elegida.nombre, rate: elegida.tarifa, tax_code: elegida.codigo } : { ...x, tax_code: null }) : x,
                                  ),
                                );
                              }}
                              className={campoClases}
                            >
                              {configuradas.map((c2) => (
                                <option key={c2.id} value={c2.codigo ?? c2.id}>
                                  {c2.nombre}
                                </option>
                              ))}
                              <option value={OTRA}>{tf('v2.retencionOtra')}</option>
                            </select>
                          )}
                        </FormField>
                      )}
                      {retencionConfigurada(r) === OTRA && (
                        <FormField etiqueta={tf('retenciones.concepto')}>
                          {(c) => (
                            <Input
                              {...aria(c)}
                              value={r.concept}
                              maxLength={200}
                              onChange={(e) => {
                                marcar();
                                setRetenciones((prev) => prev.map((x) => (x.key === r.key ? { ...x, concept: e.target.value } : x)));
                              }}
                              className="h-10"
                            />
                          )}
                        </FormField>
                      )}
                    </div>
                    <FormField etiqueta={tf('retenciones.base')}>
                      {(c) => (
                        <CampoNumero
                          {...aria(c)}
                          valor={r.base}
                          prefijo={simboloMoneda(ctxMoneda)}
                          decimales={ctxMoneda.decimals}
                          onValorChange={(v) => {
                            marcar();
                            setRetenciones((prev) => prev.map((x) => (x.key === r.key ? { ...x, base: v ?? 0 } : x)));
                          }}
                        />
                      )}
                    </FormField>
                    <FormField etiqueta={tf('retenciones.tarifa')}>
                      {(c) => (
                        <CampoNumero
                          {...aria(c)}
                          valor={r.rate}
                          decimales={3}
                          sufijo="%"
                          minimo={0}
                          maximo={100}
                          onValorChange={(v) => {
                            marcar();
                            setRetenciones((prev) => prev.map((x) => (x.key === r.key ? { ...x, rate: v ?? 0 } : x)));
                          }}
                        />
                      )}
                    </FormField>
                    <div className="flex h-10 items-center justify-end text-sm tabular-nums text-fg">{formatear(valorRetencion({ concepto: r.concept, base: r.base, tarifa: r.rate }))}</div>
                    <button
                      type="button"
                      onClick={() => {
                        marcar();
                        setRetenciones((prev) => prev.filter((x) => x.key !== r.key));
                      }}
                      aria-label={tf('retenciones.quitar', { concepto: r.concept })}
                      className="flex size-10 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover hover:text-danger-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
                    </button>
                  </div>
                ))}
                {errores.retenciones && <p className="text-sm text-danger-text">{errores.retenciones}</p>}
              </div>
            )}
          </FormSection>
        </>
      }
      resumen={
        <>
          <DocumentoTotales
            variante="compra"
            moneda={ctxMoneda}
            subtotal={totales.subtotal}
            impuestos={totales.porTarifa.filter((x) => x.tarifa > 0).map((x) => ({ nombre: tf('iva'), tarifa: x.tarifa, base: x.base, importe: x.impuesto }))}
            impuestosIncluidos={ivaIncluido}
            retenciones={retenciones.map((r) => ({ nombre: r.concept, tarifa: r.rate, base: r.base, importe: valorRetencion({ concepto: r.concept, base: r.base, tarifa: r.rate }) }))}
            total={totales.total}
            neto={retenciones.length > 0 ? totales.netoAPagar : null}
            cargando={cargando}
          />
          <Tarjeta titulo={tf('v2.pagoProveedor')} icono={Wallet}>
            <p className="text-sm text-fg-secondary">
              {proveedor && vence ? tf('resumenPago', { proveedor: proveedor.nombre, fecha: formatPlain(vence) }) : tf('v2.pagoSinProveedor')}
            </p>
            <p className="text-xs text-fg-muted">{tf('v2.pagoCxp')}</p>
          </Tarjeta>
          <TarjetaAtajos
            atajos={[
              { tecla: 'F2', descripcion: tf('v2.atajos.proveedor') },
              { tecla: 'F3', descripcion: tf('v2.atajos.productos') },
              { tecla: 'Alt+M', descripcion: tf('v2.atajos.manual') },
              { tecla: 'Ctrl+S', descripcion: tf('v2.atajos.guardar') },
              { tecla: 'Ctrl+Enter', descripcion: tf('v2.atajos.confirmar') },
            ]}
          />
        </>
      }
      pieMovil={
        <>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-xs text-fg-secondary">{retenciones.length > 0 ? tf('v2.netoPagar') : tf('v2.total')}</span>
            <span className="truncate text-base font-semibold tabular-nums text-fg">{formatear(retenciones.length > 0 ? totales.netoAPagar : totales.total)}</span>
          </span>
          <KbdButton icono={CheckCircle2} cargando={guardando === 'confirmar'} disabled={!!guardando || cargando} onClick={() => void guardar('confirmar')}>
            {tf('confirmar')}
          </KbdButton>
        </>
      }
      dialogos={
        <>
          <AgregarProductosDocumento
            abierto={dlgProductos}
            onAbiertoChange={setDlgProductos}
            variante="compra"
            sucursal={sucursal}
            nombreSucursal={nombreSucursal}
            proveedor={proveedor ? { id: Number(proveedor.id), nombre: proveedor.nombre } : null}
            moneda={ctxMoneda}
            impuestos={opcionesImpuesto}
            onAgregar={agregarProducto}
          />
          <DialogoItemManual
            abierto={manual}
            onAbiertoChange={setManual}
            variante="compra"
            moneda={ctxMoneda}
            impuestos={opcionesImpuesto}
            impuestosMultiples={false}
            sinIncluido
            incluidoInicial={ivaIncluido}
            calcularTotal={(i) => {
              const imp = opcionesImpuesto.find((o) => o.id === i.impuestos[0]);
              return calcularLineaCompra({ qty: i.cantidad, unit_price: i.precio, tax_rate: imp ? imp.tarifa : 0 }, ivaIncluido).total_line;
            }}
            onAgregar={(i) => {
              marcar();
              const imp = opcionesImpuesto.find((o) => o.id === i.impuestos[0]);
              setLineas((prev) => [
                ...prev,
                {
                  key: nuevaClave(),
                  product_id: null,
                  description: i.descripcion,
                  sku: null,
                  qty: i.cantidad,
                  unit_price: i.precio,
                  discount_amount: 0,
                  tax_rate: imp ? Number(imp.tarifa) || 0 : 0,
                  tax_code: imp?.codigo ?? null,
                  serial_numbers: [],
                  note: i.nota,
                  track_serial: false,
                  manual: true,
                },
              ]);
              setErrores((e) => ({ ...e, lineas: '' }));
            }}
          />
          <DialogoTextoLinea
            titulo={tf('lineas.seriales')}
            ayuda={tf('lineas.serialesAyuda')}
            abierto={!!lineaSeriales}
            valorInicial={lineaSeriales?.serial_numbers.join('\n') ?? ''}
            onAbiertoChange={(v) => !v && setLineaSeriales(null)}
            onGuardar={(texto) => {
              if (!lineaSeriales) return;
              const seriales = Array.from(new Set(texto.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean)));
              cambiarLinea(lineaSeriales.key, { serial_numbers: seriales, qty: seriales.length > 0 ? Math.max(lineaSeriales.qty, seriales.length) : lineaSeriales.qty });
              setLineaSeriales(null);
            }}
          />
          <DialogoTextoLinea
            titulo={tf('lineas.nota')}
            abierto={!!lineaNota}
            valorInicial={lineaNota?.note ?? ''}
            onAbiertoChange={(v) => !v && setLineaNota(null)}
            onGuardar={(texto) => {
              if (!lineaNota) return;
              cambiarLinea(lineaNota.key, { note: texto.trim() || null });
              setLineaNota(null);
            }}
          />
          {confirmarId && (
            <DialogoConfirmarCompra
              abierto
              onAbiertoChange={(v) => {
                if (v || confirmando) return;
                // Cerrar sin confirmar deja el borrador guardado.
                router.replace(`${base}/${confirmarId}`);
              }}
              numero={numero}
              total={totales.total}
              moneda={ctxMoneda}
              hayProductos={lineas.some((l) => l.product_id !== null)}
              puedeRecepcionar
              cargando={confirmando}
              error={errorConfirmar}
              onConfirmar={async (opciones) => {
                setConfirmando(true);
                setErrorConfirmar(null);
                try {
                  await clienteCompras.confirmar(confirmarId, opciones);
                  toastSuccess(tf('confirmada', { numero }));
                  router.replace(`${base}/${confirmarId}`);
                } catch (e) {
                  setErrorConfirmar(mensajeError(e));
                } finally {
                  setConfirmando(false);
                }
              }}
            />
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
            onGuardarYSalir={() => {
              const destino = salir ?? volver;
              setSalir(null);
              void guardar('salir', destino);
            }}
          />
        </>
      }
    />
  );
}

// ─── Solo lectura: confirmada, pagada o anulada ─────────────────────────

function VistaCompraNoEditable({ factura, base }: { factura: DetalleFacturaCompra; base: string }) {
  const tf = useTranslations('facturasCompra.formulario');
  const t = useTranslations('facturasCompra');
  const moneda = useMonedaOrganizacion();
  const etiquetaEstado = useEtiquetaEstado();
  const ctx = moneda.paraDocumento(factura.currency);
  const anulada = factura.status === 'void';
  const detalle = `${base}/${factura.id}`;
  const retenciones = factura.retenciones.reduce((s, r) => s + r.amount, 0);
  const totales = calcularTotalesCompra(factura.lineas, factura.tax_included, factura.retenciones.map((r) => ({ concepto: r.concept, base: r.base, tarifa: r.rate, valor: r.amount })));
  return (
    <div className="flex flex-col gap-4 pb-8 lg:gap-5">
      <DocumentoCabecera
        variante="formulario"
        tipo="facturaCompra"
        titulo={tf('v2.tituloFactura', { numero: factura.number_ext })}
        subtitulo={factura.proveedor?.name}
        estado={factura.status}
        volverA={detalle}
        migas={[{ etiqueta: t('titulo'), href: base }, { etiqueta: factura.number_ext }]}
        acciones={
          <Link
            href={detalle}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-action px-4 text-sm font-medium text-fg-on-brand hover:bg-brand-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            <FileText aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {anulada ? tf('v2.verFactura') : tf('v2.verYPagar')}
          </Link>
        }
      />
      <p role="status" className="rounded-lg border border-line-warning bg-warning-subtle px-4 py-3 text-sm text-warning-text">
        {anulada ? tf('v2.motivoAnulada') : tf('v2.motivoConfirmada', { estado: etiquetaEstado(factura.status) })}
      </p>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-5">
        <DocumentoLineas
          modo="lectura"
          moneda={ctx}
          lineas={factura.lineas.map((l) => ({
            id: l.id,
            descripcion: l.description,
            sku: l.sku,
            nota: l.note,
            seriales: l.serial_numbers,
            cantidad: l.qty,
            precioUnitario: l.unit_price,
            descuento: l.discount_amount || null,
            impuestos: l.tax_rate > 0 ? [{ nombre: tf('iva'), tarifa: l.tax_rate, incluido: factura.tax_included }] : [],
            total: l.total_line,
          }))}
        />
        <DocumentoTotales
          variante="compra"
          moneda={ctx}
          subtotal={factura.subtotal}
          impuestos={totales.porTarifa.filter((x) => x.tarifa > 0).map((x) => ({ nombre: tf('iva'), tarifa: x.tarifa, base: x.base, importe: x.impuesto }))}
          impuestosIncluidos={factura.tax_included}
          retenciones={factura.retenciones.map((r) => ({ nombre: r.concept, tarifa: r.rate, base: r.base, importe: r.amount }))}
          total={factura.total}
          neto={retenciones > 0 ? factura.total - retenciones : null}
        />
      </div>
    </div>
  );
}
