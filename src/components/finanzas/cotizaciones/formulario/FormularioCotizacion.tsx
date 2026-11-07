'use client';

/**
 * Cotización — nueva y editar (FINANZAS-DOCUMENTOS-V2 §3.3: «comparte el
 * formulario de la factura»). Se arma con las MISMAS piezas del formulario v2
 * de factura de venta (`FormularioDocumentoLayout`, `ElegirCliente`,
 * `DocumentoLineas` en edición, `AgregarProductosDocumento`,
 * `DialogoItemManual`, `DocumentoTotales variante="cotizacion"`) y la misma
 * lógica de líneas (`lineasFacturaVenta.ts`), sin lo que solo es de la
 * factura (numeración, seriales, arqueo, cuentas, factura electrónica).
 *
 * Guardar es del servidor: `POST/PUT /api/cotizaciones` → `fn_cotizacion_guardar`
 * (una transacción; número y totales en la base). Al crear se aplican las
 * promociones del canal Finanzas como antes (`CotizacionesService.createQuotation`).
 * «Guardar y enviar» guarda y abre el envío por correo con el PDF del motor.
 *
 * Campos del formulario anterior que se conservan: cliente, sucursal, emisión,
 * válida hasta, plazo de pago, forma de pago, moneda, vendedor, oportunidad
 * (trae sus productos), líneas con impuesto, precios con impuesto incluido,
 * notas y términos y condiciones. Solo se editan borradores y enviadas
 * (la base lo exige); una convertida o rechazada muestra «Duplicar».
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Calculator, Copy, FileText, ListPlus, Plus, Save, Search, Send, StickyNote, User } from 'lucide-react';
import { EmptyState, FormField, FormSection, KbdButton, Tarjeta, useAtajos } from '@/components/kit';
import { CampoFecha } from '@/components/kit/CampoFecha';
import {
  DialogoItemManual,
  DocumentoCabecera,
  DocumentoLineas,
  DocumentoTotales,
  type LineaDocumento,
  type OpcionImpuesto,
} from '@/components/kit/documento';
import { DialogoSalirConCambios, FormularioDocumentoLayout, ResumenErrores, useAvisoSalida, type ErrorFormulario } from '@/components/kit/documento/FormularioDocumento';
import { SearchSelect } from '@/components/ui/search-select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toastSuccess } from '@/components/ui/use-toast';
import { ElegirCliente, type ClienteDocumento } from '@/components/finanzas/documento/terceros';
import { AgregarProductosDocumento } from '@/components/finanzas/documento/productos';
import { EnviarDocumentoDialog } from '@/components/finanzas/documento/EnviarDocumentoDialog';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useOrgMembers } from '@/lib/hooks/useOrgMembers';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { listarClientes } from '@/lib/services/clientesListadoService';
import { impuestosOrganizacion, metodosPagoOrganizacion, productosPorId, type ImpuestoDocumento, type ProductoParaDocumento } from '@/lib/services/documentos/edicionDocumento';
import { cantidadInicialLinea } from '@/lib/services/documentos/cantidadLinea';
import { CotizacionesService, ErrorPeticionCotizacion, type QuotationItem } from '@/lib/services/cotizacionesService';
import type { CotizacionDetalle } from '@/lib/finanzas/ventas/contratoCotizaciones';
import { calcularLineaVenta, impuestosDeLineaGuardada, totalesFacturaVenta, type ImpuestoLineaVenta, type LineaVenta } from '@/lib/finanzas/ventas/lineasFacturaVenta';
import { ATAJOS_VIGENCIA, TERMINOS_PAGO, atajoVigencia, datosCotizacion, validarCotizacion, vigenciaPorDias, type ErroresCotizacion } from '@/lib/finanzas/ventas/formularioCotizacion';
import { RUTA_COTIZACIONES } from '@/lib/finanzas/ventas/listadoCotizaciones';
import { crearFormateadorMoneda } from '@/lib/utils/moneda';
import { useMensajeErrorCotizacion } from '../detalle/useMensajeErrorCotizacion';

let secuencia = 0;
const nuevaClave = () => `c${Date.now().toString(36)}${(secuencia++).toString(36)}`;

const claseCampo =
  'h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-60';

function deProducto(p: ProductoParaDocumento, impuestos: readonly ImpuestoDocumento[]): LineaVenta {
  // Un solo impuesto por línea: el del producto o el predeterminado de la organización.
  const propio = (p.impuestos.length > 0 ? p.impuestos : impuestos.filter((i) => i.predeterminado)).slice(0, 1);
  return {
    clave: nuevaClave(),
    product_id: p.id,
    descripcion: p.nombre,
    sku: p.sku,
    cantidad: cantidadInicialLinea(p),
    precio: p.precio,
    descuento: 0,
    impuestos: propio.map((i) => ({ id: i.id, codigo: i.codigo, nombre: i.nombre, tarifa: i.tarifa })),
    nota: null,
    manual: false,
    serial: false,
    controlaStock: false,
    stock: null,
    unidad: p.unidadVenta,
    decimalesCantidad: p.decimalesCantidad,
  };
}

type Modo = { tipo: 'cargando' } | { tipo: 'editable' } | { tipo: 'noEditable'; numero: string } | { tipo: 'error'; mensaje: string };

export function FormularioCotizacion({ id }: { id?: string }) {
  const router = useRouter();
  const params = useSearchParams() ?? new URLSearchParams();
  const t = useTranslations('finanzasDocumentosR3.cotizaciones.formulario');
  const tc = useTranslations('finanzasDocumentosR3.cotizaciones');
  const tk = useTranslations('kit.documentoEdicion');
  const mensajeError = useMensajeErrorCotizacion();
  const moneda = useMonedaOrganizacion();
  const { branches, selectedBranchId } = useBranch();
  const { members: miembros } = useOrgMembers();
  const clienteParam = !id ? params.get('cliente') : null;

  const [modo, setModo] = useState<Modo>(id || clienteParam ? { tipo: 'cargando' } : { tipo: 'editable' });
  const [numero, setNumero] = useState<string | null>(null);
  const [impuestos, setImpuestos] = useState<ImpuestoDocumento[]>([]);
  const [metodos, setMetodos] = useState<{ codigo: string; nombre: string }[]>([]);
  const [monedas, setMonedas] = useState<string[]>([]);
  const [oportunidades, setOportunidades] = useState<{ id: string; name: string; customer_id: string | null }[]>([]);

  const [cliente, setCliente] = useState<ClienteDocumento | null>(null);
  const [sucursal, setSucursal] = useState<number | null>(selectedBranchId ?? null);
  const { getToday } = useFormatDate(sucursal);
  const [emision, setEmision] = useState<string>(getToday());
  const [validaHasta, setValidaHasta] = useState<string | null>(vigenciaPorDias(getToday(), 30));
  const [terminos, setTerminos] = useState<number>(30);
  const [codigoMoneda, setCodigoMoneda] = useState('');
  const [formaPago, setFormaPago] = useState('');
  const [vendedor, setVendedor] = useState('');
  const [oportunidad, setOportunidad] = useState('');
  const [incluido, setIncluido] = useState(false);
  const [lineas, setLineas] = useState<LineaVenta[]>([]);
  const [notas, setNotas] = useState('');
  const [terminosCondiciones, setTerminosCondiciones] = useState('');

  const [errores, setErrores] = useState<ErroresCotizacion>({});
  const [errorServidor, setErrorServidor] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<null | 'borrador' | 'enviar' | 'salir'>(null);
  const [dlgProductos, setDlgProductos] = useState(false);
  const [dlgManual, setDlgManual] = useState(false);
  const [dlgCliente, setDlgCliente] = useState(false);
  const [enviarGuardada, setEnviarGuardada] = useState<{ id: string; numero: string } | null>(null);
  const [salir, setSalir] = useState<string | null>(null);
  const [sucio, setSucio] = useState(false);
  const marcar = () => setSucio(true);
  useAvisoSalida(sucio);

  const ctxMoneda = moneda.paraDocumento(codigoMoneda || null);
  const formatear = useMemo(() => crearFormateadorMoneda(ctxMoneda), [ctxMoneda]);
  const nombreSucursal = branches.find((b) => b.id === sucursal)?.name ?? null;
  const opcionesImpuesto: OpcionImpuesto[] = useMemo(() => {
    const base: OpcionImpuesto[] = impuestos.map((i) => ({ id: i.id, codigo: i.codigo, nombre: i.nombre, tarifa: i.tarifa, predeterminado: i.predeterminado }));
    for (const l of lineas) for (const i of l.impuestos) if (!base.some((o) => o.id === i.id)) base.push({ id: i.id, codigo: i.codigo, nombre: i.nombre, tarifa: i.tarifa });
    return base;
  }, [impuestos, lineas]);
  const totales = useMemo(() => totalesFacturaVenta(lineas, incluido), [lineas, incluido]);
  const volver = id ? `${RUTA_COTIZACIONES}/${id}` : RUTA_COTIZACIONES;

  const cargarCliente = useCallback(
    async (clienteId: string) => {
      const { filas } = await listarClientes({ organizationId: getOrganizationId(), branchId: null, criterios: { estado: 'todos' }, orden: null, desde: 0, tamano: 1, ids: [clienteId] });
      const f = filas[0];
      if (!f) return;
      setCliente({
        id: f.id,
        nombre: (f.full_name || f.company_name || '').trim(),
        documento: f.identification_number ? `${(f.identification_type ?? '').toUpperCase()} ${f.identification_number}`.trim() : null,
        correo: f.email,
        telefono: f.phone,
        plazoDias: f.plazo_dias,
      });
    },
    [],
  );

  const lineasDesdeItems = useCallback(
    async (items: { product_id: number | null; description: string; qty: number; unit_price: number; discount_amount: number | null; tax_code: string | null; tax_rate: number }[], imp: ImpuestoDocumento[], suc: number | null): Promise<LineaVenta[]> => {
      const opciones = imp.map((i) => ({ id: i.id, codigo: i.codigo, nombre: i.nombre, tarifa: i.tarifa }));
      const productos = await productosPorId(getOrganizationId(), items.map((i) => Number(i.product_id)).filter(Boolean), { variante: 'venta', sucursal: suc }).catch(
        () => new Map<number, ProductoParaDocumento>(),
      );
      return items.map((i) => {
        const p = i.product_id ? productos.get(Number(i.product_id)) : undefined;
        return {
          clave: nuevaClave(),
          product_id: i.product_id ? Number(i.product_id) : null,
          descripcion: (i.description ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
          sku: p?.sku ?? null,
          cantidad: Number(i.qty) || 0,
          precio: Number(i.unit_price) || 0,
          descuento: Number(i.discount_amount) || 0,
          impuestos: impuestosDeLineaGuardada(i, opciones).slice(0, 1),
          nota: null,
          manual: !i.product_id,
          serial: false,
          controlaStock: false,
          stock: null,
          unidad: p?.unidadVenta ?? null,
          decimalesCantidad: p?.decimalesCantidad ?? null,
        };
      });
    },
    [],
  );

  // ── Carga: catálogos y la cotización ──────────────────────────────────
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
      setMonedas(((mon.data ?? []) as { currency_code: string }[]).map((m) => m.currency_code.trim().toUpperCase()));
      const abiertas = ((opo.data ?? []) as { id: string; name: string; customer_id: string | null }[]) ?? [];
      if (id) {
        let cot: CotizacionDetalle;
        try {
          cot = await CotizacionesService.detalle(id);
        } catch (e) {
          if (!cancelado) setModo({ tipo: 'error', mensaje: mensajeError(e) });
          return;
        }
        if (cancelado) return;
        setNumero(cot.number);
        if (cot.stored_status !== 'draft' && cot.stored_status !== 'sent') {
          setModo({ tipo: 'noEditable', numero: cot.number });
          return;
        }
        if (cot.customer_id) await cargarCliente(cot.customer_id);
        const ls = await lineasDesdeItems(cot.quotation_items, imp.impuestos, cot.branch_id);
        if (cancelado) return;
        setSucursal(cot.branch_id);
        setEmision(cot.issue_date);
        setValidaHasta(cot.valid_until);
        setTerminos(cot.payment_terms ?? 0);
        setCodigoMoneda(cot.currency?.trim() ?? '');
        setFormaPago(cot.payment_method ?? '');
        setNotas(cot.notes ?? '');
        setTerminosCondiciones(cot.terms_conditions ?? '');
        setVendedor(cot.salesperson_id ?? '');
        setOportunidad(cot.opportunity_id ?? '');
        setIncluido(cot.tax_included);
        setLineas(ls);
        // La oportunidad guardada puede no estar abierta: se conserva en la lista.
        if (cot.opportunity_id && !abiertas.some((o) => o.id === cot.opportunity_id)) {
          abiertas.push({ id: cot.opportunity_id, name: cot.opportunity_name ?? cot.opportunity_id, customer_id: cot.customer_id });
        }
      } else if (clienteParam) {
        await cargarCliente(clienteParam);
      }
      if (cancelado) return;
      setOportunidades(abiertas);
      setFormaPago((f) => f || met[0]?.codigo || '');
      setModo({ tipo: 'editable' });
    })().catch(() => !cancelado && setModo({ tipo: 'error', mensaje: t('errorCarga') }));
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carga única por documento
  }, [id, clienteParam]);

  useEffect(() => {
    if (!codigoMoneda && moneda.resuelta) setCodigoMoneda(moneda.code);
  }, [moneda.resuelta, moneda.code, codigoMoneda]);
  useEffect(() => {
    if (!id && sucursal == null && selectedBranchId != null) setSucursal(selectedBranchId);
  }, [id, sucursal, selectedBranchId]);

  // ── Cambios ───────────────────────────────────────────────────────────
  const elegirCliente = (c: ClienteDocumento) => {
    marcar();
    setCliente(c);
    setErrores((e) => ({ ...e, cliente: undefined }));
    if (c.plazoDias && c.plazoDias > 0) setTerminos(c.plazoDias);
  };
  const agregarProducto = (p: ProductoParaDocumento) => {
    marcar();
    setLineas((prev) => [...prev, deProducto(p, impuestos)]);
    setErrores((e) => ({ ...e, lineas: undefined }));
  };
  const cambiarLinea = (clave: string, cambio: Partial<LineaVenta>) => {
    marcar();
    setLineas((prev) => prev.map((l) => (l.clave === clave ? { ...l, ...cambio } : l)));
    setErrores((e) => ({ ...e, [`linea.${clave}`]: undefined }));
  };
  const elegirOportunidad = async (valor: string) => {
    marcar();
    setOportunidad(valor);
    if (!valor || lineas.length > 0) return;
    // Sin líneas todavía: los productos de la oportunidad pasan a la cotización (como antes).
    const { data } = await supabase.from('opportunity_products').select('product_id, quantity, unit_price').eq('opportunity_id', valor);
    const productos = (data ?? []) as { product_id: number; quantity: number | string | null; unit_price: number | string | null }[];
    if (productos.length === 0) return;
    const { data: nombres } = await supabase.from('products').select('id, name').in('id', productos.map((p) => p.product_id));
    const mapa = new Map(((nombres ?? []) as { id: number; name: string }[]).map((p) => [p.id, p.name]));
    const ls = await lineasDesdeItems(
      productos.map((p) => ({ product_id: p.product_id, description: mapa.get(p.product_id) ?? '', qty: Number(p.quantity) || 1, unit_price: Number(p.unit_price) || 0, discount_amount: 0, tax_code: null, tax_rate: 0 })),
      impuestos,
      sucursal,
    );
    // Sin impuesto guardado, el del producto (H9 de facturas).
    const productosDoc = await productosPorId(getOrganizationId(), productos.map((p) => p.product_id), { variante: 'venta', sucursal }).catch(() => new Map<number, ProductoParaDocumento>());
    setLineas(
      ls.map((l) => {
        if (l.impuestos.length > 0 || !l.product_id) return l;
        const p = productosDoc.get(l.product_id);
        const propio = (p && p.impuestos.length > 0 ? p.impuestos : impuestos.filter((i) => i.predeterminado)).slice(0, 1);
        return { ...l, impuestos: propio.map((i) => ({ id: i.id, codigo: i.codigo, nombre: i.nombre, tarifa: i.tarifa })) };
      }),
    );
    const op = oportunidades.find((o) => o.id === valor);
    if (op?.customer_id && !cliente) await cargarCliente(op.customer_id);
  };

  // ── Guardar ───────────────────────────────────────────────────────────
  const guardar = async (accion: 'borrador' | 'enviar' | 'salir', destino?: string) => {
    const e = validarCotizacion({ clienteId: cliente?.id ?? null, sucursal, emision, validaHasta, lineas });
    setErrores(e);
    setErrorServidor(null);
    if (Object.keys(e).length > 0) return;
    setGuardando(accion);
    try {
      const datos = datosCotizacion(
        {
          clienteId: cliente!.id,
          sucursal: sucursal!,
          emision,
          validaHasta,
          moneda: codigoMoneda || null,
          terminos,
          formaPago: formaPago || null,
          notas,
          terminosCondiciones,
          vendedor: vendedor || null,
          oportunidad: oportunidad || null,
          incluido,
        },
        lineas,
      );
      const { items, applied_taxes, ...cabecera } = datos;
      const quotationItems: QuotationItem[] = items.map((i) => ({ ...i, discount_amount: i.discount_amount ?? 0, tax_rate: i.tax_rate ?? 0, tax_included: incluido, total_line: 0 }));
      const ctxImpuestos = {
        appliedTaxes: Object.fromEntries((applied_taxes ?? []).map((a) => [a.tax_code, true])),
        appliedTaxTotals: Object.fromEntries((applied_taxes ?? []).map((a) => [a.tax_code, { rate: a.tax_rate, base: 0, amount: 0, name: a.tax_code, included: incluido }])),
      };
      const r = id
        ? await CotizacionesService.updateQuotation(id, cabecera, quotationItems, ctxImpuestos)
        : await CotizacionesService.createQuotation(cabecera, quotationItems, ctxImpuestos);
      setSucio(false);
      toastSuccess(id ? t('guardada', { numero: r.numero }) : t('creada', { numero: r.numero }));
      if (accion === 'enviar') setEnviarGuardada({ id: r.id, numero: r.numero });
      else router.push(destino ?? `${RUTA_COTIZACIONES}/${r.id}`);
    } catch (err) {
      setErrorServidor(err instanceof ErrorPeticionCotizacion ? mensajeError(err) : t('errorGuardar'));
    } finally {
      setGuardando(null);
    }
  };

  const intentarSalir = (destino: string = volver) => {
    if (sucio) setSalir(destino);
    else router.push(destino);
  };

  const editable = modo.tipo === 'editable';
  useAtajos(
    [
      { tecla: 'F2', descripcion: t('atajos.cliente'), accion: () => setDlgCliente(true), permitirEnCampo: true },
      { tecla: 'F3', descripcion: t('atajos.productos'), accion: () => setDlgProductos(true), permitirEnCampo: true },
      { tecla: 'Alt+M', descripcion: t('atajos.manual'), accion: () => setDlgManual(true), permitirEnCampo: true },
      { tecla: 'Ctrl+S', descripcion: t('atajos.guardar'), accion: () => void guardar('borrador'), permitirEnCampo: true, cuando: () => !guardando },
    ],
    { activo: editable && !dlgProductos && !dlgManual && !salir && !enviarGuardada },
  );

  if (modo.tipo === 'noEditable') {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState
          variante="empty"
          icono={Calculator}
          titulo={t('noEditable.titulo', { numero: modo.numero })}
          descripcion={t('noEditable.descripcion')}
          accion={{ etiqueta: t('noEditable.verCotizacion'), href: volver }}
        />
      </div>
    );
  }
  if (modo.tipo === 'error') {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState variante="error" titulo={modo.mensaje} icono={Calculator} accion={{ etiqueta: tc('detalle.volverListado'), href: RUTA_COTIZACIONES }} />
      </div>
    );
  }
  const cargando = modo.tipo === 'cargando';

  const lineasKit: LineaDocumento[] = lineas.map((l) => {
    const k = calcularLineaVenta(l, incluido);
    return {
      id: l.clave,
      descripcion: l.descripcion,
      sku: l.sku,
      cantidad: l.cantidad,
      unidad: l.unidad ?? null,
      decimalesCantidad: l.decimalesCantidad ?? null,
      precioUnitario: l.precio,
      descuento: l.descuento || null,
      total: k.total_line,
      impuestosSeleccion: { ids: l.impuestos.map((i) => i.id), incluido },
      descripcionEditable: l.manual,
      error: errores[`linea.${l.clave}`] ? t(`errores.${errores[`linea.${l.clave}`]}` as never) : null,
      insignias: l.manual ? [{ texto: tk('lineas.itemManual') }] : [],
      detalleTotal: k.impuesto > 0 ? (incluido ? t('impuestoIncluido', { importe: formatear(k.impuesto) }) : t('impuestoLinea', { importe: formatear(k.impuesto) })) : null,
    };
  });

  const listaErrores: ErrorFormulario[] = Object.entries(errores)
    .filter(([, v]) => !!v)
    .map(([campo, codigo]) => ({
      campo,
      mensaje: campo.startsWith('linea.') ? t('errores.linea', { detalle: t(`errores.${codigo}` as never) }) : t(`errores.${campo}` as never),
      idControl: campo.startsWith('linea') ? 'lineas-cotizacion' : `cot-${campo}`,
    }));

  const titulo = id ? t('tituloEditar', { numero: numero ?? '' }) : t('tituloNueva');
  const subtitulo = [id ? tc('estados.draft') : t('sinGuardar'), nombreSucursal, ctxMoneda.code].filter(Boolean).join(' · ');
  const atajo = atajoVigencia(emision, validaHasta);
  const botonSecundario =
    'inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <FormularioDocumentoLayout
        cabecera={
          <DocumentoCabecera
            variante="formulario"
            tipo="cotizacion"
            titulo={titulo}
            subtitulo={subtitulo}
            estado={id ? 'draft' : undefined}
            volverA={volver}
            onVolver={() => intentarSalir()}
            cargando={cargando}
            migas={[{ etiqueta: tc('migas.finanzas'), href: '/app/finanzas' }, { etiqueta: tc('titulo'), href: RUTA_COTIZACIONES }, { etiqueta: titulo }]}
            movil={{ titulo }}
            acciones={
              <>
                <button type="button" onClick={() => intentarSalir()} className={botonSecundario}>
                  {tk('salir.cancelar')}
                </button>
                <KbdButton variante="secundario" atajo="Ctrl+S" icono={Save} cargando={guardando === 'borrador'} disabled={!!guardando || cargando} onClick={() => void guardar('borrador')}>
                  {id ? t('guardarCambios') : t('guardarBorrador')}
                </KbdButton>
                <KbdButton icono={Send} cargando={guardando === 'enviar'} disabled={!!guardando || cargando} onClick={() => void guardar('enviar')}>
                  {t('guardarYEnviar')}
                </KbdButton>
              </>
            }
          />
        }
        avisos={
          <>
            <ResumenErrores errores={listaErrores} />
            {errorServidor && (
              <p role="alert" className="rounded-lg border border-line-danger bg-danger-subtle px-4 py-3 text-sm text-danger-text">
                {errorServidor}
              </p>
            )}
          </>
        }
        datos={
          <FormSection titulo={t('secciones.datos')} icono={FileText} columnas={2}>
            <FormField id="cot-sucursal" etiqueta={t('campos.sucursal')} obligatorio error={errores.sucursal ? t('errores.sucursal') : undefined}>
              {(c) => (
                <Select
                  value={sucursal != null ? String(sucursal) : ''}
                  onValueChange={(v) => {
                    marcar();
                    setSucursal(Number(v));
                    setErrores((e) => ({ ...e, sucursal: undefined }));
                  }}
                >
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} aria-invalid={c['aria-invalid']} className="h-10 border-line-strong bg-surface">
                    <SelectValue placeholder={t('campos.elegirSucursal')} />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={String(b.id)}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <FormField etiqueta={t('campos.emision')}>
              {(c) => (
                <CampoFecha
                  id={c.id}
                  valor={emision}
                  hoy={getToday()}
                  onValorChange={(d) => {
                    marcar();
                    // La vigencia conserva su duración al mover la emisión.
                    if (atajo) setValidaHasta(vigenciaPorDias(d, atajo));
                    setEmision(d);
                  }}
                />
              )}
            </FormField>
            <div className="md:col-span-2">
              <FormField id="cot-vigencia" etiqueta={t('campos.validaHasta')} error={errores.vigencia ? t('errores.vigencia') : undefined} ayuda={t('campos.validaHastaAyuda')}>
                {(c) => (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="sm:w-56">
                      <CampoFecha
                        id={c.id}
                        valor={validaHasta}
                        min={emision}
                        hoy={getToday()}
                        limpiable
                        onValorChange={(d) => {
                          marcar();
                          setValidaHasta(d || null);
                          setErrores((e) => ({ ...e, vigencia: undefined }));
                        }}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2" role="group" aria-label={t('campos.atajosVigencia')}>
                      {ATAJOS_VIGENCIA.map((d) => (
                        <button
                          key={d}
                          type="button"
                          aria-pressed={atajo === d}
                          onClick={() => {
                            marcar();
                            setValidaHasta(vigenciaPorDias(emision, d));
                          }}
                          className={`h-8 rounded-full border px-3 text-[13px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${atajo === d ? 'border-line-brand bg-brand-tint text-brand-deep' : 'border-line-strong bg-surface text-fg hover:bg-hover'}`}
                        >
                          {t('campos.dias', { dias: d })}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </FormField>
            </div>
            <FormField etiqueta={t('campos.plazo')}>
              {(c) => (
                <Select
                  value={String(terminos)}
                  onValueChange={(v) => {
                    marcar();
                    setTerminos(Number(v));
                  }}
                >
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[...new Set([...TERMINOS_PAGO, terminos])].sort((a, b) => a - b).map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {d === 0 ? t('campos.contado') : t('campos.dias', { dias: d })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <FormField etiqueta={t('campos.formaPago')}>
              {(c) => (
                <select
                  id={c.id}
                  className={claseCampo}
                  value={formaPago}
                  onChange={(e) => {
                    marcar();
                    setFormaPago(e.target.value);
                  }}
                >
                  <option value="">{t('campos.sinDefinir')}</option>
                  {metodos.map((m) => (
                    <option key={m.codigo} value={m.codigo}>
                      {m.nombre}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
            {monedas.length > 1 && (
              <FormField etiqueta={t('campos.moneda')}>
                {(c) => (
                  <select
                    id={c.id}
                    className={claseCampo}
                    value={codigoMoneda}
                    onChange={(e) => {
                      marcar();
                      setCodigoMoneda(e.target.value);
                    }}
                  >
                    {monedas.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                )}
              </FormField>
            )}
            <FormField etiqueta={t('campos.vendedor')}>
              {() => (
                <SearchSelect
                  options={miembros.map((m) => ({ value: m.user_id, label: m.name }))}
                  value={vendedor}
                  onValueChange={(v) => {
                    marcar();
                    setVendedor(v === '__none__' ? '' : v);
                  }}
                  placeholder={t('campos.elegirVendedor')}
                  searchPlaceholder={t('campos.buscarVendedor')}
                  noneLabel={t('campos.sinVendedor')}
                  noneValue="__none__"
                />
              )}
            </FormField>
            <FormField etiqueta={t('campos.oportunidad')} ayuda={t('campos.oportunidadAyuda')}>
              {() => (
                <SearchSelect
                  options={oportunidades.map((o) => ({ value: o.id, label: o.name }))}
                  value={oportunidad}
                  onValueChange={(v) => void elegirOportunidad(v === '__none__' ? '' : v)}
                  placeholder={t('campos.sinOportunidad')}
                  searchPlaceholder={t('campos.buscarOportunidad')}
                  noneLabel={t('campos.sinOportunidad')}
                  noneValue="__none__"
                />
              )}
            </FormField>
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
              id="cot-cliente"
              aria-invalid={!!errores.cliente}
            />
            {errores.cliente && <p className="text-sm text-danger-text">{t('errores.cliente')}</p>}
          </FormSection>
        }
        lineas={
          <FormSection titulo={t('secciones.lineas', { n: lineas.length })} icono={ListPlus}>
            <div id="lineas-cotizacion" tabIndex={-1} className="outline-none">
              <DocumentoLineas
                lineas={lineasKit}
                modo="edicion"
                moneda={ctxMoneda}
                etiqueta={t('secciones.lineasEtiqueta')}
                estado={cargando ? 'cargando' : 'listo'}
                impuestosDisponibles={opcionesImpuesto}
                impuestosMultiples={false}
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
                            .slice(0, 1)
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
                accionesLinea={(linea) => [
                  {
                    id: 'duplicar',
                    etiqueta: t('duplicarLinea'),
                    icono: Copy,
                    onSelect: () => {
                      marcar();
                      setLineas((prev) => {
                        const i = prev.findIndex((x) => x.clave === linea.id);
                        if (i < 0) return prev;
                        return [...prev.slice(0, i + 1), { ...prev[i], clave: nuevaClave() }, ...prev.slice(i + 1)];
                      });
                    },
                  },
                ]}
                vacio={{ titulo: t('lineasVacio'), descripcion: t('lineasVacioDescripcion') }}
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
            {errores.lineas && <p className="text-sm text-danger-text">{t('errores.lineas')}</p>}
          </FormSection>
        }
        complementos={
          <FormSection titulo={t('secciones.terminos')} icono={StickyNote}>
            <FormField etiqueta={t('campos.terminosCondiciones')} ayuda={t('campos.terminosCondicionesAyuda')}>
              <Textarea
                value={terminosCondiciones}
                rows={4}
                maxLength={20000}
                onChange={(e) => {
                  marcar();
                  setTerminosCondiciones(e.target.value);
                }}
              />
            </FormField>
            <FormField etiqueta={t('campos.notas')} ayuda={t('campos.notasAyuda')}>
              <Textarea
                value={notas}
                rows={3}
                maxLength={20000}
                onChange={(e) => {
                  marcar();
                  setNotas(e.target.value);
                }}
              />
            </FormField>
          </FormSection>
        }
        resumen={
          <>
            <DocumentoTotales
              variante="cotizacion"
              moneda={ctxMoneda}
              subtotal={totales.subtotal}
              impuestos={totales.impuestos.map((i) => ({ nombre: i.nombre.replace(/\s*\d+([.,]\d+)?\s*%$/, ''), tarifa: i.tarifa, base: i.base, importe: i.importe }))}
              impuestosIncluidos={incluido}
              total={totales.total}
              cargando={cargando}
            />
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
            </Tarjeta>
          </>
        }
        pieMovil={
          <>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-xs text-fg-secondary">{t('total')}</span>
              <span className="truncate text-base font-semibold tabular-nums text-fg">{formatear(totales.total)}</span>
            </span>
            <KbdButton icono={Save} cargando={guardando === 'borrador'} disabled={!!guardando || cargando} onClick={() => void guardar('borrador')}>
              {t('guardarBorrador')}
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
              calcularTotal={(i) => calcularLineaVenta({ cantidad: i.cantidad, precio: i.precio, descuento: 0, impuestos: opcionesImpuesto.filter((o) => i.impuestos.includes(o.id)).slice(0, 1) }, incluido).total_line}
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
                    impuestos: opcionesImpuesto
                      .filter((o) => i.impuestos.includes(o.id))
                      .slice(0, 1)
                      .map((o) => ({ id: o.id, codigo: o.codigo, nombre: o.nombre, tarifa: o.tarifa })),
                    nota: i.nota,
                    manual: true,
                    serial: false,
                    controlaStock: false,
                    stock: null,
                  },
                ]);
                setErrores((e) => ({ ...e, lineas: undefined }));
              }}
            />
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
              onGuardarYSalir={() => void guardar('salir', salir ?? undefined)}
            />
            {enviarGuardada && (
              <EnviarDocumentoDialog
                abierto={!!enviarGuardada}
                onAbiertoChange={(v) => {
                  if (!v) {
                    const destino = `${RUTA_COTIZACIONES}/${enviarGuardada.id}`;
                    setEnviarGuardada(null);
                    router.push(destino);
                  }
                }}
                endpoint={`/api/cotizaciones/${encodeURIComponent(enviarGuardada.id)}/enviar`}
                tipoClave="cotizacion"
                correo={cliente?.correo ?? null}
                textos={{
                  titulo: tc('enviar.titulo', { numero: enviarGuardada.numero }),
                  descripcion: tc('enviar.descripcion'),
                  enviado: tc('enviar.enviada'),
                  enviadoA: (destino) => tc('enviar.enviadaA', { destino }),
                  enviadoSinAdjunto: (destino) => tc('enviar.enviadaSinAdjunto', { destino }),
                }}
                mensajeError={(codigo, servidor) => mensajeError(new ErrorPeticionCotizacion(codigo, 0, servidor ?? codigo))}
              />
            )}
          </>
        }
    />
  );
}
