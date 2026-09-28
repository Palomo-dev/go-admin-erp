'use client';

/**
 * Nueva / editar factura de compra (plan F6; Figma «Nueva factura de compra —
 * listo · vacía · desde orden de compra · editar cargando · no editable»).
 *
 * - Guarda por `POST /api/facturas-compra` → `fn_factura_compra_guardar`: UNA
 *   transacción con cabecera, líneas con `total_line` BRUTO (el IVA ya no se
 *   pierde), retenciones y seriales. El formulario, el GO Assistant y la OC usan
 *   la misma RPC (regla 7).
 * - «Guardar borrador» deja el borrador; «Confirmar factura» guarda y confirma
 *   (CxP por el neto, asiento, recepción por kardex si se pide, D2).
 * - El número pide el del PROVEEDOR; el consecutivo interno solo con el botón
 *   (D11). Un número repetido para el proveedor lo rechaza la base (D10).
 * - `?orden=<uuid>`: precarga lo recibido de la orden de compra y escribe `po_id`.
 * - Salir con cambios pide confirmación.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Hash, ListPlus, Percent, Plus, ReceiptText, Save, CheckCircle2, StickyNote, Trash2, Barcode } from 'lucide-react';
import {
  Dialogo,
  EmptyState,
  FormField,
  FormSection,
  SupplierPicker,
  type AccionFila,
  type ProveedorPicker,
} from '@/components/kit';
// El índice del kit aún no reexporta CampoNumero (pedido al agente del kit).
import { CampoNumero } from '@/components/kit/CampoNumero';
import { DocumentoCabecera, DocumentoLineas, DocumentoTotales, simboloMoneda, type LineaDocumento } from '@/components/kit/documento';
import { ProductSearchDialog, type UnifiedProduct } from '@/components/shared/product-search';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { addPlainDays } from '@/lib/utils/dateDisplay';
import { calcularTotalesCompra, valorRetencion } from '@/lib/services/compras/logica';
import { clienteCompras, ErrorPeticionCompra } from '@/lib/services/compras/clienteCompras';
import { buscarProveedores, leerDetalleFacturaCompra } from '@/lib/services/compras/lecturasCompras';
import type { GuardarFacturaCompra } from '@/lib/services/compras/contrato';
import { useBaseCompras } from '../rutasCompras';
import { DialogoConfirmarCompra } from '../detalle/DialogosCompra';
import { CampoFecha } from '@/components/kit/CampoFecha';

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
}

interface RetencionForm {
  key: string;
  concept: string;
  base: number;
  rate: number;
}

const TARIFAS = [0, 5, 19] as const;

/** Props de accesibilidad de `FormField` para un control (sin `idEtiqueta`, que no es atributo del DOM). */
function aria(c: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean; 'aria-required'?: boolean }) {
  return { id: c.id, 'aria-describedby': c['aria-describedby'], 'aria-invalid': c['aria-invalid'], 'aria-required': c['aria-required'] };
}
let secuencia = 0;
const nuevaClave = () => `l${Date.now().toString(36)}${(secuencia++).toString(36)}`;

export default function FormularioFacturaCompra({ id }: { id?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const base = useBaseCompras();
  const t = useTranslations('facturasCompra');
  const tf = useTranslations('facturasCompra.formulario');
  const moneda = useMonedaOrganizacion();
  const { branches, selectedBranchId } = useBranch();
  const ordenUuid = !id ? params?.get('orden') ?? null : null;

  const [cargando, setCargando] = useState(!!id || !!ordenUuid);
  const [noEditable, setNoEditable] = useState<string | null>(null);
  const [proveedor, setProveedor] = useState<ProveedorPicker | null>(null);
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
  const [comision, setComision] = useState<{ salesperson_id: string | null; rate: number; type: string; method: string; amount: number }>({
    salesperson_id: null,
    rate: 0,
    type: 'none',
    method: 'percentage',
    amount: 0,
  });
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState<'borrador' | 'confirmar' | null>(null);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [confirmarId, setConfirmarId] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [errorConfirmar, setErrorConfirmar] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [lineaSeriales, setLineaSeriales] = useState<LineaForm | null>(null);
  const [lineaNota, setLineaNota] = useState<LineaForm | null>(null);
  const sucio = useRef(false);
  const marcar = () => {
    sucio.current = true;
  };

  const ctxMoneda = moneda.paraDocumento(codigoMoneda || null);

  // ── Monedas de la organización ────────────────────────────────────────────
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
          setNoEditable(tf('noEditable', { numero: f.number_ext }));
          return;
        }
        setProveedor(f.proveedor ? { id: String(f.proveedor.id), nombre: f.proveedor.name, nit: f.proveedor.nit, telefono: f.proveedor.phone } : null);
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
          })),
        );
        setRetenciones(f.retenciones.map((r) => ({ key: r.id, concept: r.concept, base: r.base, rate: r.rate })));
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
        .select('id, branch_id, supplier:suppliers(id, name, nit, phone, credit_days), items:purchase_order_items(product_id, received_quantity, unit_cost, product:products(name, sku, track_serial), serials_received)')
        .eq('uuid', ordenUuid)
        .eq('organization_id', getOrganizationId())
        .maybeSingle();
      if (cancelado || !oc) return;
      const o = oc as unknown as {
        id: number;
        branch_id: number;
        supplier: { id: number; name: string; nit: string | null; phone: string | null; credit_days: number | null } | null;
        items: Array<{ product_id: number; received_quantity: number; unit_cost: number; serials_received: string[] | null; product: { name: string; sku: string | null; track_serial: boolean | null } | null }>;
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

  // Salir con cambios: el navegador pregunta.
  useEffect(() => {
    const aviso = (e: BeforeUnloadEvent) => {
      if (!sucio.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, []);

  const totales = useMemo(
    () =>
      calcularTotalesCompra(
        lineas,
        ivaIncluido,
        retenciones.map((r) => ({ concepto: r.concept, base: r.base, tarifa: r.rate })),
      ),
    [lineas, ivaIncluido, retenciones],
  );

  const buscar = useCallback(
    async (texto: string, senal: AbortSignal) =>
      (await buscarProveedores(getOrganizationId(), texto, senal)).map((p) => ({
        id: String(p.id),
        nombre: p.name,
        nit: p.nit ? `${p.nit}${p.dv ? `-${p.dv}` : ''}` : null,
        contacto: p.contact,
        telefono: p.phone,
        creditDays: p.credit_days,
      })),
    [],
  );

  const agregarProducto = (p: UnifiedProduct) => {
    marcar();
    setLineas((prev) => [
      ...prev,
      {
        key: nuevaClave(),
        product_id: p.id,
        description: p.name,
        sku: p.sku ?? null,
        qty: 1,
        unit_price: Number(p.cost) || 0,
        discount_amount: 0,
        tax_rate: Number(p.tax_rate) || 0,
        tax_code: p.tax_code ?? null,
        serial_numbers: [],
        note: null,
        track_serial: p.track_serial === true,
      },
    ]);
  };

  const cambiarLinea = (key: string, cambio: Partial<LineaForm>) => {
    marcar();
    setLineas((prev) => prev.map((l) => (l.key === key ? { ...l, ...cambio } : l)));
  };

  const lineasKit: LineaDocumento[] = lineas.map((l) => ({
    id: l.key,
    descripcion: l.description,
    sku: l.sku,
    nota: l.note,
    seriales: l.serial_numbers,
    cantidad: l.qty,
    precioUnitario: l.unit_price,
    descuento: l.discount_amount || null,
    impuestos: l.tax_rate > 0 ? [{ nombre: tf('iva'), tarifa: l.tax_rate, incluido: ivaIncluido }] : [],
    total: Math.round((ivaIncluido ? l.qty * l.unit_price - l.discount_amount : (l.qty * l.unit_price - l.discount_amount) * (1 + l.tax_rate / 100)) * 100) / 100,
    error: errores[`linea.${l.key}`] ?? null,
  }));

  const accionesLinea = (linea: LineaDocumento): AccionFila[] => {
    const l = lineas.find((x) => x.key === linea.id);
    if (!l) return [];
    return [
      ...TARIFAS.map((tarifa, i) => ({
        id: `iva-${tarifa}`,
        etiqueta: tarifa === 0 ? tf('lineas.sinIva') : tf('lineas.iva', { tarifa }),
        icono: Percent,
        onSelect: () => cambiarLinea(l.key, { tax_rate: tarifa, tax_code: null }),
        separadorAntes: i === 0,
        deshabilitada: l.tax_rate === tarifa,
        motivo: tf('lineas.actual'),
      })),
      { id: 'nota', etiqueta: tf('lineas.nota'), icono: StickyNote, onSelect: () => setLineaNota(l), separadorAntes: true },
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
    withholdings: retenciones.map((r) => ({ concept: r.concept.trim(), base: r.base, rate: r.rate })),
  });

  const mensajeError = (e: unknown): string => {
    const codigo = e instanceof ErrorPeticionCompra ? e.codigo : 'error_desconocido';
    return t.has(`errores.${codigo}`) ? t(`errores.${codigo}` as never) : t('errores.error_desconocido');
  };

  const guardar = async (modo: 'borrador' | 'confirmar') => {
    if (!validar()) {
      setErrorGeneral(tf('errores.revisar'));
      return;
    }
    setGuardando(modo);
    setErrorGeneral(null);
    try {
      const r = await clienteCompras.guardar(payload());
      sucio.current = false;
      if (r.seriales_omitidos.length > 0) toastError(tf('serialesOmitidos', { n: r.seriales_omitidos.length }));
      if (modo === 'confirmar') {
        setConfirmarId(r.id);
      } else {
        toastSuccess(tf('guardado', { numero: r.number_ext }));
        router.replace(`${base}/${r.id}`);
      }
    } catch (e) {
      const texto = mensajeError(e);
      if (e instanceof ErrorPeticionCompra && e.codigo === 'numero_duplicado') setErrores((prev) => ({ ...prev, numero: texto }));
      setErrorGeneral(texto);
    } finally {
      setGuardando(null);
    }
  };

  const cancelar = () => {
    if (sucio.current && !window.confirm(tf('salirSinGuardar'))) return;
    sucio.current = false;
    router.push(id ? `${base}/${id}` : base);
  };

  if (noEditable) {
    return (
      <EmptyState
        titulo={noEditable}
        descripcion={tf('noEditableDescripcion')}
        icono={ReceiptText}
        accion={{ etiqueta: tf('volver'), href: id ? `${base}/${id}` : base }}
      />
    );
  }

  const campoClases = 'h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';
  const botonClase =
    'inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <div className="flex flex-col gap-4 pb-24 lg:gap-5">
      <DocumentoCabecera
        variante="formulario"
        tipo="facturaCompra"
        titulo={id ? tf('tituloEditar', { numero }) : tf('tituloNueva')}
        subtitulo={poId ? tf('desdeOrden', { orden: `OC-${poId}` }) : tf('subtitulo')}
        volverA={id ? `${base}/${id}` : base}
        cargando={cargando}
        migas={[{ etiqueta: t('titulo'), href: base }, { etiqueta: id ? numero : tf('tituloNueva') }]}
        acciones={
          <>
            <button type="button" onClick={cancelar} className={`${botonClase} border border-line-strong bg-surface text-fg hover:bg-hover`}>
              {tf('cancelar')}
            </button>
            <button type="button" disabled={!!guardando || cargando} onClick={() => void guardar('borrador')} className={`${botonClase} border border-line-strong bg-surface text-fg hover:bg-hover`}>
              <Save aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {guardando === 'borrador' ? tf('guardando') : tf('guardarBorrador')}
            </button>
            <button type="button" disabled={!!guardando || cargando} onClick={() => void guardar('confirmar')} className={`${botonClase} bg-brand-action text-fg-on-brand hover:bg-brand-action-hover`}>
              <CheckCircle2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {tf('confirmar')}
            </button>
          </>
        }
      />

      {errorGeneral && (
        <p role="alert" className="rounded-lg border border-line-danger bg-danger-subtle px-4 py-3 text-sm text-danger-text">
          {errorGeneral}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-5">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <FormSection titulo={tf('secciones.documento')} icono={ReceiptText} columnas={2}>
            <div className="md:col-span-2">
              <SupplierPicker
                proveedor={proveedor}
                buscar={buscar}
                onCambiar={(p) => {
                  marcar();
                  setProveedor(p);
                  const dias = (p as ProveedorPicker & { creditDays?: number | null }).creditDays;
                  if (dias && dias > 0) setPlazo(dias);
                }}
                onQuitar={() => {
                  marcar();
                  setProveedor(null);
                }}
                aria-invalid={!!errores.proveedor}
              />
              {errores.proveedor && <p className="mt-1 text-sm text-danger-text">{errores.proveedor}</p>}
            </div>
            <FormField etiqueta={tf('campos.numero')} ayuda={tf('campos.numeroAyuda')} error={errores.numero} obligatorio>
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
                    onClick={() =>
                      void clienteCompras
                        .siguienteNumero()
                        .then((n) => {
                          marcar();
                          setNumero(n);
                        })
                        .catch((e) => toastError(mensajeError(e)))
                    }
                    title={tf('campos.consecutivo')}
                    aria-label={tf('campos.consecutivo')}
                    className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-line-strong bg-surface text-fg-secondary hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <Hash aria-hidden="true" className="size-4" strokeWidth={1.5} />
                  </button>
                </div>
              )}
            </FormField>
            <FormField etiqueta={tf('campos.sucursal')} error={errores.sucursal} obligatorio>
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
            <FormField etiqueta={tf('campos.emision')} error={errores.emision} obligatorio>
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
            <FormField etiqueta={tf('campos.vence')} error={errores.vence}>
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
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-fg">
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
          </FormSection>

          <FormSection
            titulo={tf('secciones.lineas')}
            icono={ListPlus}
            descripcion={errores.lineas ? <span className="text-danger-text">{errores.lineas}</span> : undefined}
          >
            <DocumentoLineas
              lineas={lineasKit}
              modo="edicion"
              moneda={ctxMoneda}
              etiqueta={tf('secciones.lineas')}
              onCambiar={(key, cambio) =>
                cambiarLinea(key, {
                  ...(cambio.cantidad !== undefined ? { qty: cambio.cantidad } : {}),
                  ...(cambio.precioUnitario !== undefined ? { unit_price: cambio.precioUnitario } : {}),
                  ...(cambio.descuento !== undefined ? { discount_amount: cambio.descuento ?? 0 } : {}),
                })
              }
              onQuitar={(key) => {
                marcar();
                setLineas((prev) => prev.filter((l) => l.key !== key));
              }}
              accionesLinea={accionesLinea}
              vacio={{ titulo: tf('lineas.vacio'), descripcion: tf('lineas.vacioDescripcion') }}
              pie={
                <div className="flex flex-wrap items-center gap-2 p-3">
                  <ProductSearchDialog
                    mode="purchase"
                    currency={ctxMoneda.code}
                    onProductSelect={agregarProducto}
                    selectedProductIds={lineas.map((l) => l.product_id).filter((x): x is number => x !== null)}
                    branchId={sucursal ?? undefined}
                    supplierId={proveedor ? Number(proveedor.id) : null}
                  />
                  <button
                    type="button"
                    onClick={() => setManual(true)}
                    className="inline-flex h-9 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
                    {tf('lineas.manual')}
                  </button>
                </div>
              }
            />
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
                  setRetenciones((prev) => [...prev, { key: nuevaClave(), concept: tf('retenciones.retefuente'), base: totales.subtotal, rate: 2.5 }]);
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
              <div className="flex flex-col gap-3">
                {retenciones.map((r) => (
                  <div key={r.key} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px_100px_120px_40px] sm:items-end">
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
                    <div className="flex h-10 items-center justify-end text-sm tabular-nums text-fg">
                      {simboloMoneda(ctxMoneda)} {valorRetencion({ concepto: r.concept, base: r.base, tarifa: r.rate }).toLocaleString()}
                    </div>
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
        </div>

        <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
          <DocumentoTotales
            variante="compra"
            moneda={ctxMoneda}
            subtotal={totales.subtotal}
            impuestos={totales.porTarifa.filter((x) => x.tarifa > 0).map((x) => ({ nombre: tf('iva'), tarifa: x.tarifa, base: x.base, importe: x.impuesto }))}
            impuestosIncluidos={ivaIncluido}
            retenciones={retenciones.map((r) => ({ nombre: r.concept, tarifa: r.rate, base: r.base, importe: valorRetencion({ concepto: r.concept, base: r.base, tarifa: r.rate }) }))}
            total={totales.total}
            neto={retenciones.length > 0 ? totales.netoAPagar : null}
          />
          {proveedor && vence && (
            <p className="text-sm text-fg-secondary">{tf('resumenPago', { proveedor: proveedor.nombre, fecha: formatPlain(vence) })}</p>
          )}
        </div>
      </div>

      <DialogoItemManual
        abierto={manual}
        onAbiertoChange={setManual}
        onAgregar={(item) => {
          marcar();
          setLineas((prev) => [...prev, { key: nuevaClave(), product_id: null, sku: null, serial_numbers: [], note: null, track_serial: false, tax_code: null, discount_amount: 0, ...item }]);
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
    </div>
  );
}

function DialogoItemManual({
  abierto,
  onAbiertoChange,
  onAgregar,
}: {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  onAgregar: (item: { description: string; qty: number; unit_price: number; tax_rate: number }) => void;
}) {
  const tf = useTranslations('facturasCompra.formulario');
  const [descripcion, setDescripcion] = useState('');
  const [cantidad, setCantidad] = useState<number | null>(1);
  const [precio, setPrecio] = useState<number | null>(0);
  const [tarifa, setTarifa] = useState(0);
  useEffect(() => {
    if (abierto) {
      setDescripcion('');
      setCantidad(1);
      setPrecio(0);
      setTarifa(0);
    }
  }, [abierto]);
  const valido = descripcion.trim().length > 0 && (cantidad ?? 0) > 0 && (precio ?? -1) >= 0;
  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={tf('manual.titulo')}
      descripcion={tf('manual.descripcion')}
      icono={Plus}
      primario={{
        etiqueta: tf('manual.agregar'),
        deshabilitada: !valido,
        motivo: tf('manual.invalido'),
        onClick: () => {
          onAgregar({ description: descripcion.trim(), qty: cantidad ?? 1, unit_price: precio ?? 0, tax_rate: tarifa });
          onAbiertoChange(false);
        },
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <FormField etiqueta={tf('manual.concepto')} obligatorio>
            {(c) => <Input {...aria(c)} value={descripcion} maxLength={500} onChange={(e) => setDescripcion(e.target.value)} className="h-10" />}
          </FormField>
        </div>
        <FormField etiqueta={tf('manual.cantidad')}>
          {(c) => <CampoNumero {...aria(c)} valor={cantidad} decimales={3} minimo={0} onValorChange={setCantidad} />}
        </FormField>
        <FormField etiqueta={tf('manual.precio')}>
          {(c) => <CampoNumero {...aria(c)} valor={precio} minimo={0} onValorChange={setPrecio} />}
        </FormField>
        <FormField etiqueta={tf('manual.iva')}>
          {(c) => (
            <select
              {...aria(c)}
              value={tarifa}
              onChange={(e) => setTarifa(Number(e.target.value))}
              className="h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {TARIFAS.map((x) => (
                <option key={x} value={x}>
                  {x} %
                </option>
              ))}
            </select>
          )}
        </FormField>
      </div>
    </Dialogo>
  );
}

function DialogoTextoLinea({
  titulo,
  ayuda,
  abierto,
  valorInicial,
  onAbiertoChange,
  onGuardar,
}: {
  titulo: string;
  ayuda?: string;
  abierto: boolean;
  valorInicial: string;
  onAbiertoChange: (v: boolean) => void;
  onGuardar: (texto: string) => void;
}) {
  const tf = useTranslations('facturasCompra.formulario');
  const [texto, setTexto] = useState(valorInicial);
  useEffect(() => {
    if (abierto) setTexto(valorInicial);
  }, [abierto, valorInicial]);
  return (
    <Dialogo abierto={abierto} onAbiertoChange={onAbiertoChange} titulo={titulo} primario={{ etiqueta: tf('aplicar'), onClick: () => onGuardar(texto) }}>
      <FormField etiqueta={titulo} etiquetaOculta ayuda={ayuda}>
        {(c) => <Textarea {...aria(c)} value={texto} rows={5} onChange={(e) => setTexto(e.target.value)} />}
      </FormField>
    </Dialogo>
  );
}
