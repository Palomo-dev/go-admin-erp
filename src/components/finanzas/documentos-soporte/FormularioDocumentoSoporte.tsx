'use client';

/**
 * Documento soporte — nuevo y editar borrador (Figma S7 `736:40117`, S8
 * `736:40942`; captura `52-documentos-doc-soporte-nuevo.png`).
 *
 * Misma estructura que la factura de compra (`FormularioDocumentoLayout`):
 * datos del documento y vendedor arriba, líneas a todo el ancho, resumen y
 * «Resolución que se usará» a la derecha. Guarda por
 * `POST/PUT /api/documentos-soporte` → `fn_documento_soporte_guardar` (una
 * transacción; referencia DS-#### y totales en la base; vendedor armado en el
 * servidor desde `suppliers`). «Guardar y enviar a la DIAN» guarda y luego usa
 * la ruta de envío de siempre (`POST /api/factus/support-document`).
 *
 * Reemplaza `SupportDocumentForm.tsx` (2026-11-07), que insertaba desde el
 * navegador: cabecera y líneas en dos llamadas, referencia leyendo la última,
 * fecha a medianoche UTC y líneas que la base rechazaba (CHECK de
 * `invoice_items`). Se conservan todos sus campos: fecha, forma de pago (contado
 * o crédito con vencimiento), medio de pago de la organización, moneda,
 * observaciones (500), factura de compra relacionada, vendedor desde
 * proveedores, líneas con producto o ítem manual, impuesto por línea, impuesto
 * incluido y cuenta contable por línea (la conserva al editar). La hora de
 * creación la pone la base (antes la escribía el navegador).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle, FileCheck, Hash, ListPlus, Plus, ReceiptText, Save, Search, Send, Truck } from 'lucide-react';
import { AvisoTonal, BarraProgreso, EmptyState, FormField, FormSection, KbdButton, StatusBadge, Tarjeta, useAtajos } from '@/components/kit';
import { CampoFecha } from '@/components/kit/CampoFecha';
import {
  DialogoItemManual,
  DocumentoCabecera,
  DocumentoLineas,
  DocumentoTotales,
  idsDesdeCodigo,
  type LineaDocumento,
  type OpcionImpuesto,
} from '@/components/kit/documento';
import { DialogoSalirConCambios, FormularioDocumentoLayout, ResumenErrores, useAvisoSalida, type ErrorFormulario } from '@/components/kit/documento/FormularioDocumento';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { toastError, toastSuccess, toastWarning } from '@/components/ui/use-toast';
import { ElegirProveedor, type ProveedorDocumento } from '@/components/finanzas/documento/terceros';
import { AgregarProductosDocumento } from '@/components/finanzas/documento/productos';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { mapearTipoDocADian } from '@/lib/utils/nitDv';
import { crearFormateadorMoneda } from '@/lib/utils/moneda';
import { calcularLineaCompra, calcularTotalesCompra } from '@/lib/services/compras/logica';
import { impuestosOrganizacion, type ImpuestoDocumento, type ProductoParaDocumento } from '@/lib/services/documentos/edicionDocumento';
import { cantidadInicialLinea } from '@/lib/services/documentos/cantidadLinea';
import type { ContextoSoporte, DatosSoporte, DetalleSoporte } from '@/lib/finanzas/soporte/contratoSoporte';
import {
  COLUMNAS_PROVEEDOR_SOPORTE,
  accionesSoporte,
  estadoRango,
  faltantesProveedor,
  proveedorDesdeFila,
  validarFormularioSoporte,
  type FaltaProveedor,
  type FilaProveedorSoporte,
} from '@/lib/finanzas/soporte/soporteLogica';
import { metodoOrganizacionDe } from '@/lib/finanzas/soporte/detalleSoporteLogica';
import { ErrorPeticionSoporte, enviarSoporteDian, guardarSoporte, pedirContextoSoporte, pedirDetalleSoporte } from '@/lib/finanzas/soporte/clienteSoporte';

const RUTA = '/app/finanzas/documentos-soporte';

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
  cuenta_contable: string | null;
  note: string | null;
  manual: boolean;
}

let secuencia = 0;
const nuevaClave = () => `l${Date.now().toString(36)}${(secuencia++).toString(36)}`;
const campoClases =
  'h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-60';

function aria(c: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean; 'aria-required'?: boolean }) {
  return { id: c.id, 'aria-describedby': c['aria-describedby'], 'aria-invalid': c['aria-invalid'], 'aria-required': c['aria-required'] };
}

export function FormularioDocumentoSoporte({ id }: { id?: string }) {
  const t = useTranslations('finanzasDocumentosR3.soporte');
  const tk = useTranslations('kit.documentoEdicion');
  const router = useRouter();
  const moneda = useMonedaOrganizacion();
  const { branches, branchFilter } = useBranch();
  const { getToday, toDate, formatPlain } = useFormatDate();
  const hoy = getToday();

  const [cargando, setCargando] = useState(!!id);
  const [noEditable, setNoEditable] = useState<string | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [referencia, setReferencia] = useState<string | null>(null);
  const [contexto, setContexto] = useState<ContextoSoporte | null>(null);
  const [impuestos, setImpuestos] = useState<ImpuestoDocumento[]>([]);

  const [sucursal, setSucursal] = useState<number | null>(branchFilter ?? null);
  const [emision, setEmision] = useState(hoy);
  const [formaPago, setFormaPago] = useState<'1' | '2'>('1');
  const [medioPago, setMedioPago] = useState('');
  const [medioGuardado, setMedioGuardado] = useState<string | null>(null);
  const [vence, setVence] = useState('');
  const [codigoMoneda, setCodigoMoneda] = useState('');
  const [compraId, setCompraId] = useState('');
  const [observacion, setObservacion] = useState('');
  const [ivaIncluido, setIvaIncluido] = useState(false);
  const [proveedor, setProveedor] = useState<ProveedorDocumento | null>(null);
  const [faltan, setFaltan] = useState<FaltaProveedor[]>([]);
  const [lineas, setLineas] = useState<LineaForm[]>([]);

  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<'borrador' | 'enviar' | null>(null);
  const [dlgProductos, setDlgProductos] = useState(false);
  const [manual, setManual] = useState(false);
  const [dlgProveedor, setDlgProveedor] = useState(false);
  const [salir, setSalir] = useState(false);
  const [sucio, setSucio] = useState(false);
  const marcar = () => setSucio(true);
  useAvisoSalida(sucio);

  const ctxMoneda = moneda.paraDocumento(codigoMoneda || null);
  const formatear = useMemo(() => crearFormateadorMoneda(ctxMoneda), [ctxMoneda]);
  const nombreSucursal = branches.find((b) => b.id === sucursal)?.name ?? null;
  const textoError = (codigo: string) => (t.has(`errores.${codigo}`) ? t(`errores.${codigo}` as never) : t('errores.error_desconocido'));

  const opcionesImpuesto: OpcionImpuesto[] = useMemo(() => {
    const lista: OpcionImpuesto[] = impuestos.map((i) => ({ id: i.id, codigo: i.codigo, nombre: i.nombre, tarifa: i.tarifa, predeterminado: i.predeterminado }));
    for (const l of lineas) {
      if (l.tax_rate > 0 && idsDesdeCodigo(lista, l.tax_code, l.tax_rate).length === 0) {
        lista.push({ id: `tx:${l.tax_code ?? l.tax_rate}`, codigo: l.tax_code, nombre: l.tax_code ?? t('formulario.impuestoTarifa', { tarifa: l.tax_rate }), tarifa: l.tax_rate });
      }
    }
    return lista;
  }, [impuestos, lineas, t]);

  // ── Impuestos de la organización ─────────────────────────────────────────
  useEffect(() => {
    let cancelado = false;
    impuestosOrganizacion(getOrganizationId())
      .then((r) => !cancelado && setImpuestos(r.impuestos))
      .catch(() => undefined);
    return () => {
      cancelado = true;
    };
  }, []);

  // ── Contexto (métodos, monedas, compras, resolución de la sucursal) ───────
  useEffect(() => {
    let cancelado = false;
    pedirContextoSoporte(sucursal)
      .then((c) => {
        if (cancelado) return;
        setContexto(c);
        setMedioPago((actual) => actual || metodoOrganizacionDe(medioGuardado, c.metodos) || c.metodos[0]?.codigo || '');
      })
      .catch(() => undefined);
    return () => {
      cancelado = true;
    };
  }, [sucursal, medioGuardado]);

  // ── Vendedor: datos fiscales para avisar lo que falta (la DIAN lo exige) ──
  const revisarProveedor = useCallback(async (idProveedor: string) => {
    const { data } = await supabase
      .from('suppliers')
      .select(COLUMNAS_PROVEEDOR_SOPORTE)
      .eq('organization_id', getOrganizationId())
      .eq('id', Number(idProveedor))
      .maybeSingle();
    setFaltan(data ? faltantesProveedor(proveedorDesdeFila(data as unknown as FilaProveedorSoporte, mapearTipoDocADian)) : []);
  }, []);

  // ── Editar: cargar el documento ──────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    let cancelado = false;
    pedirDetalleSoporte(id)
      .then((d: DetalleSoporte) => {
        if (cancelado) return;
        const acc = accionesSoporte({ status: d.documento.estado, numero: d.documento.numero, estadoJob: d.envio?.estado ?? null, deCompra: d.documento.deCompra });
        if (!acc.has('editar')) {
          setNoEditable(d.documento.referencia);
          return;
        }
        setReferencia(d.documento.referencia);
        setSucursal(d.documento.sucursalId);
        if (d.documento.fecha) setEmision(toDate(new Date(d.documento.fecha)));
        setFormaPago(d.documento.formaPago);
        setVence(d.documento.vence ?? '');
        setMedioGuardado(d.documento.medioPago);
        setCodigoMoneda(d.documento.moneda ?? '');
        setCompraId(d.compra?.id ?? '');
        setObservacion(d.documento.observacion ?? '');
        setIvaIncluido(d.documento.impuestosIncluidos);
        if (d.proveedor.id) {
          setProveedor({ id: String(d.proveedor.id), nombre: d.proveedor.nombre ?? '' });
          void revisarProveedor(String(d.proveedor.id));
        }
        setLineas(
          d.lineas.map((l) => ({
            key: nuevaClave(),
            product_id: l.productoId,
            description: l.descripcion,
            sku: l.codigo,
            qty: l.cantidad,
            unit_price: l.precioUnitario,
            discount_amount: l.descuento,
            tax_rate: l.tarifa,
            tax_code: l.codigoImpuesto,
            cuenta_contable: l.cuentaContable,
            note: l.nota,
            manual: l.productoId === null,
          })),
        );
      })
      .catch((e: unknown) => !cancelado && setErrorCarga(e instanceof ErrorPeticionSoporte ? String(e.codigo) : 'error_desconocido'))
      .finally(() => !cancelado && setCargando(false));
    return () => {
      cancelado = true;
    };
  }, [id, toDate, revisarProveedor]);

  const totales = useMemo(() => calcularTotalesCompra(lineas, ivaIncluido), [lineas, ivaIncluido]);

  const cambiarLinea = (key: string, cambio: Partial<LineaForm>) => {
    marcar();
    setLineas((prev) => prev.map((l) => (l.key === key ? { ...l, ...cambio } : l)));
  };

  const agregarProducto = (p: ProductoParaDocumento) => {
    marcar();
    const imp = p.impuestos[0] ?? null;
    setLineas((prev) => [
      ...prev,
      {
        key: nuevaClave(),
        product_id: p.id,
        description: p.nombre,
        sku: p.sku ?? null,
        qty: cantidadInicialLinea(p),
        unit_price: Number(p.precio) || 0,
        discount_amount: 0,
        tax_rate: imp ? Number(imp.tarifa) || 0 : 0,
        tax_code: imp?.codigo ?? null,
        cuenta_contable: null,
        note: null,
        manual: false,
      },
    ]);
    setErrores((e) => ({ ...e, lineas: '' }));
  };

  const lineasKit: LineaDocumento[] = lineas.map((l) => {
    const k = calcularLineaCompra(l, ivaIncluido);
    return {
      id: l.key,
      descripcion: l.description,
      sku: l.sku,
      nota: l.note,
      cantidad: l.qty,
      precioUnitario: l.unit_price,
      descuento: l.discount_amount || null,
      total: k.total_line,
      impuestosSeleccion: { ids: idsDesdeCodigo(opcionesImpuesto, l.tax_code, l.tax_rate), incluido: ivaIncluido },
      descripcionEditable: l.manual,
      error: errores[`linea.${l.key}`] ? t(`formulario.errores.${errores[`linea.${l.key}`]}` as never) : null,
      insignias: [...(l.manual ? [{ texto: tk('lineas.itemManual') }] : []), ...(l.cuenta_contable ? [{ texto: l.cuenta_contable, tono: 'informacion' as const }] : [])],
      detalleTotal: k.impuesto > 0 ? t('formulario.detalleImpuesto', { importe: formatear(k.impuesto) }) : null,
    };
  });

  // ── Validar, guardar y enviar ────────────────────────────────────────────
  const validar = (): boolean => {
    const e = validarFormularioSoporte({
      sucursal,
      proveedorId: proveedor?.id ?? null,
      faltantesProveedor: faltan,
      emision,
      formaPago,
      medioPago,
      vence,
      lineas: lineas.map((l) => ({ key: l.key, description: l.description, qty: l.qty, unit_price: l.unit_price, discount_amount: l.discount_amount, tax_rate: l.tax_rate })),
    });
    setErrores(e);
    return Object.keys(e).length === 0;
  };

  const payload = (): DatosSoporte => ({
    branch_id: sucursal as number,
    supplier_id: Number(proveedor?.id),
    invoice_purchase_id: compraId || null,
    issue_date: emision,
    payment_form: formaPago,
    payment_method: medioPago,
    due_date: formaPago === '2' ? vence || null : null,
    currency: codigoMoneda || null,
    observation: observacion.trim() || null,
    tax_included: ivaIncluido,
    items: lineas.map((l) => ({
      product_id: l.product_id,
      description: l.description.trim(),
      qty: l.qty,
      unit_price: l.unit_price,
      discount_amount: l.discount_amount,
      tax_rate: l.tax_rate,
      tax_code: l.tax_code,
      cuenta_contable: l.cuenta_contable,
      note: l.note,
    })),
  });

  const guardar = async (modo: 'borrador' | 'enviar') => {
    setErrorGeneral(null);
    if (!validar()) return;
    setGuardando(modo);
    try {
      const r = await guardarSoporte(id ?? null, payload());
      setSucio(false);
      if (modo === 'enviar') {
        try {
          const envio = await enviarSoporteDian(r.id);
          if (envio.tipo === 'aceptado' || envio.tipo === 'enviado') toastSuccess(t(`envio.${envio.tipo}`, { referencia: r.referencia }));
          else if (envio.tipo === 'rechazado') toastError(t('envio.rechazado', { referencia: r.referencia }), envio.mensaje ?? undefined);
          else toastWarning(t(`envio.${envio.tipo}`, { referencia: r.referencia }));
        } catch (e) {
          // Guardado sí; el envío se reintenta desde el detalle.
          toastError(t('envio.error'), e instanceof ErrorPeticionSoporte ? textoError(String(e.codigo)) : undefined);
        }
      } else {
        toastSuccess(t('formulario.guardado', { referencia: r.referencia }));
      }
      router.push(`${RUTA}/${r.id}`);
    } catch (e) {
      setErrorGeneral(e instanceof ErrorPeticionSoporte ? textoError(String(e.codigo)) : t('errores.error_desconocido'));
      setGuardando(null);
    }
  };

  const volver = id ? `${RUTA}/${id}` : RUTA;
  const cancelar = () => (sucio ? setSalir(true) : router.push(volver));

  useAtajos(
    [
      { tecla: 'F2', descripcion: t('formulario.atajos.vendedor'), accion: () => setDlgProveedor(true), permitirEnCampo: true },
      { tecla: 'F3', descripcion: t('formulario.atajos.productos'), accion: () => setDlgProductos(true), permitirEnCampo: true },
      { tecla: 'Alt+M', descripcion: t('formulario.atajos.manual'), accion: () => setManual(true), permitirEnCampo: true },
      { tecla: 'Ctrl+S', descripcion: t('formulario.atajos.guardar'), accion: () => void guardar('borrador'), permitirEnCampo: true, cuando: () => !guardando },
    ],
    { activo: !guardando && !cargando && !noEditable && !dlgProductos && !manual && !salir },
  );

  if (noEditable) {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState
          variante="empty"
          titulo={t('formulario.noEditable', { referencia: noEditable })}
          descripcion={t('formulario.noEditableDescripcion')}
          accion={{ etiqueta: t('formulario.verDocumento'), href: `${RUTA}/${id}` }}
        />
      </div>
    );
  }
  if (errorCarga) {
    return (
      <div className="p-4 sm:p-6">
        {errorCarga === 'sin_permiso' ? (
          <EmptyState variante="forbidden" titulo={t('sinPermiso.titulo')} descripcion={t('sinPermiso.descripcion')} />
        ) : (
          <EmptyState variante="error" titulo={t('detalle.errorCarga')} descripcion={textoError(errorCarga)} accion={{ etiqueta: t('detalle.volverListado'), href: RUTA }} />
        )}
      </div>
    );
  }

  const listaErrores: ErrorFormulario[] = Object.entries(errores)
    .filter(([, v]) => v)
    .map(([campo, v]) => ({
      campo,
      idControl: campo.startsWith('linea.') ? 'lineas-soporte' : `ds-${campo}`,
      mensaje: t(`formulario.errores.${v}` as never),
    }));
  const rango = contexto?.rango ? estadoRango(contexto.rango, hoy) : null;
  const tonoRango = rango ? (rango.tono === 'ok' ? null : rango.tono === 'por_agotar' || rango.tono === 'por_vencer' ? 'advertencia' : 'peligro') : null;
  const titulo = id ? t('formulario.tituloEditar', { referencia: referencia ?? '' }) : t('formulario.tituloNuevo');

  return (
    <FormularioDocumentoLayout
      className="p-4 sm:p-6"
      cabecera={
        <DocumentoCabecera
          variante="formulario"
          tipo="documentoSoporte"
          titulo={titulo}
          subtitulo={t('formulario.subtitulo')}
          volverA={volver}
          onVolver={cancelar}
          cargando={cargando}
          migas={[{ etiqueta: t('migas.finanzas'), href: '/app/finanzas' }, { etiqueta: t('migas.facturacion') }, { etiqueta: t('listado.titulo'), href: RUTA }, { etiqueta: id ? referencia ?? '…' : t('formulario.tituloNuevo') }]}
          movil={{ titulo }}
          acciones={
            <>
              <button
                type="button"
                onClick={cancelar}
                className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                {t('acciones.cancelar')}
              </button>
              <KbdButton variante="secundario" atajo="Ctrl+S" icono={Save} cargando={guardando === 'borrador'} disabled={!!guardando || cargando} onClick={() => void guardar('borrador')}>
                {t('formulario.guardarBorrador')}
              </KbdButton>
              <KbdButton icono={Send} cargando={guardando === 'enviar'} disabled={!!guardando || cargando} onClick={() => void guardar('enviar')}>
                {t('formulario.guardarEnviar')}
              </KbdButton>
            </>
          }
        />
      }
      avisos={
        <>
          <ResumenErrores errores={listaErrores} />
          {errorGeneral && (
            <p role="alert" className="rounded-lg border border-line-danger bg-danger-subtle px-4 py-3 text-sm text-danger-text">
              {errorGeneral}
            </p>
          )}
        </>
      }
      datos={
        <FormSection titulo={t('formulario.secciones.datos')} icono={ReceiptText} columnas={2}>
          <FormField id="ds-sucursal" etiqueta={t('formulario.campos.sucursal')} error={errores.sucursal ? t(`formulario.errores.${errores.sucursal}` as never) : undefined} obligatorio>
            {(c) => (
              <select
                {...aria(c)}
                value={sucursal ?? ''}
                onChange={(e) => {
                  marcar();
                  setSucursal(e.target.value ? Number(e.target.value) : null);
                }}
                className={campoClases}
              >
                <option value="">{t('formulario.campos.elegir')}</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          <FormField id="ds-emision" etiqueta={t('formulario.campos.emision')} error={errores.emision ? t(`formulario.errores.${errores.emision}` as never) : undefined} obligatorio>
            {(c) => (
              <CampoFecha
                id={c.id}
                valor={emision}
                hoy={hoy}
                max={hoy}
                onValorChange={(v) => {
                  marcar();
                  setEmision(v);
                }}
              />
            )}
          </FormField>
          <FormField id="ds-formaPago" etiqueta={t('formulario.campos.formaPago')} obligatorio>
            {(c) => (
              <select
                {...aria(c)}
                value={formaPago}
                onChange={(e) => {
                  marcar();
                  setFormaPago(e.target.value === '2' ? '2' : '1');
                }}
                className={campoClases}
              >
                <option value="1">{t('formasPago.contado')}</option>
                <option value="2">{t('formasPago.credito')}</option>
              </select>
            )}
          </FormField>
          <FormField id="ds-medioPago" etiqueta={t('formulario.campos.medioPago')} error={errores.medioPago ? t(`formulario.errores.${errores.medioPago}` as never) : undefined} obligatorio>
            {(c) => (
              <select
                {...aria(c)}
                value={medioPago}
                disabled={!contexto}
                onChange={(e) => {
                  marcar();
                  setMedioPago(e.target.value);
                }}
                className={campoClases}
              >
                <option value="">{contexto && contexto.metodos.length === 0 ? t('formulario.campos.sinMetodos') : t('formulario.campos.elegir')}</option>
                {(contexto?.metodos ?? []).map((m) => (
                  <option key={m.codigo} value={m.codigo}>
                    {m.nombre}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          {formaPago === '2' && (
            <FormField id="ds-vence" etiqueta={t('formulario.campos.vence')} error={errores.vence ? t(`formulario.errores.${errores.vence}` as never) : undefined} obligatorio>
              {(c) => (
                <CampoFecha
                  id={c.id}
                  valor={vence}
                  hoy={hoy}
                  min={emision}
                  onValorChange={(v) => {
                    marcar();
                    setVence(v);
                  }}
                />
              )}
            </FormField>
          )}
          <FormField id="ds-moneda" etiqueta={t('formulario.campos.moneda')}>
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
                <option value="">{t('formulario.campos.monedaBase', { base: moneda.code })}</option>
                {(contexto?.monedas ?? [])
                  .filter((m) => m !== moneda.code)
                  .map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
              </select>
            )}
          </FormField>
          <FormField id="ds-compra" etiqueta={t('formulario.campos.compra')} ayuda={t('formulario.campos.compraAyuda')}>
            {(c) => (
              <select
                {...aria(c)}
                value={compraId}
                onChange={(e) => {
                  marcar();
                  setCompraId(e.target.value);
                }}
                className={campoClases}
              >
                <option value="">{t('formulario.campos.sinCompra')}</option>
                {(contexto?.compras ?? []).map((co) => (
                  <option key={co.id} value={co.id}>
                    {[co.numero || t('listado.compraSinNumero'), co.proveedor, co.fecha ? formatPlain(co.fecha) : null].filter(Boolean).join(' · ')}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          <FormField id="ds-observacion" etiqueta={t('formulario.campos.observaciones')} ayuda={t('formulario.campos.observacionesAyuda')} className="md:col-span-2">
            {(c) => (
              <Textarea
                {...aria(c)}
                value={observacion}
                maxLength={500}
                rows={2}
                onChange={(e) => {
                  marcar();
                  setObservacion(e.target.value);
                }}
              />
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
            {t('formulario.campos.impuestoIncluido')}
          </label>
        </FormSection>
      }
      tercero={
        <FormSection titulo={t('formulario.secciones.vendedor')} descripcion={t('formulario.secciones.vendedorDescripcion')} icono={Truck}>
          <ElegirProveedor
            proveedor={proveedor}
            abierto={dlgProveedor}
            onAbiertoChange={setDlgProveedor}
            onCambiar={(p) => {
              marcar();
              setProveedor(p);
              setErrores((e) => ({ ...e, proveedor: '' }));
              void revisarProveedor(String(p.id));
            }}
            onQuitar={() => {
              marcar();
              setProveedor(null);
              setFaltan([]);
            }}
            id="ds-proveedor"
            aria-invalid={!!errores.proveedor}
          />
          {proveedor && faltan.length > 0 && (
            <AvisoTonal
              tono="advertencia"
              icono={AlertTriangle}
              titulo={faltan.length === 1 && faltan[0] === 'direccion' ? t('formulario.faltaDireccion') : t('formulario.faltanDatos')}
              descripcion={t('formulario.faltanDatosDescripcion', { datos: faltan.map((f) => t(`formulario.faltante.${f}`)).join(', ') })}
              accion={{ etiqueta: t('formulario.completar'), href: `/app/inventario/proveedores/${proveedor.id}`, externo: true }}
            />
          )}
          {errores.proveedor && <p className="text-sm text-danger-text">{t(`formulario.errores.${errores.proveedor}` as never)}</p>}
        </FormSection>
      }
      lineas={
        <FormSection titulo={t('formulario.secciones.lineas', { n: lineas.length })} icono={ListPlus}>
          <div id="lineas-soporte" tabIndex={-1} className="outline-none">
            <DocumentoLineas
              lineas={lineasKit}
              modo="edicion"
              moneda={ctxMoneda}
              etiqueta={t('formulario.secciones.lineasEtiqueta')}
              estado={cargando ? 'cargando' : 'listo'}
              impuestosDisponibles={opcionesImpuesto}
              impuestosMultiples={false}
              sinIncluidoPorLinea
              avisoSinImpuesto={t('formulario.sinImpuesto')}
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
              vacio={{ titulo: t('formulario.lineasVacio'), descripcion: t('formulario.lineasVacioDescripcion') }}
              pie={
                <div className="flex flex-wrap items-center gap-2 p-3">
                  <KbdButton variante="secundario" tamano="sm" atajo="F3" icono={Search} onClick={() => setDlgProductos(true)} disabled={cargando}>
                    {t('formulario.buscarProducto')}
                  </KbdButton>
                  <KbdButton variante="secundario" tamano="sm" atajo="Alt+M" icono={Plus} onClick={() => setManual(true)} disabled={cargando}>
                    {t('formulario.itemManual')}
                  </KbdButton>
                </div>
              }
            />
          </div>
          {errores.lineas && <p className="text-sm text-danger-text">{t(`formulario.errores.${errores.lineas}` as never)}</p>}
        </FormSection>
      }
      resumen={
        <>
          <DocumentoTotales
            variante="compra"
            moneda={ctxMoneda}
            subtotal={totales.subtotal}
            impuestos={totales.porTarifa.filter((x) => x.tarifa > 0).map((x) => ({ nombre: t('detalle.impuesto'), tarifa: x.tarifa, base: x.base, importe: x.impuesto }))}
            impuestosIncluidos={ivaIncluido}
            total={totales.total}
            cargando={cargando}
            titulo={t('detalle.resumen')}
          />
          <Tarjeta titulo={t('formulario.resolucion.titulo')} icono={Hash}>
            {!sucursal ? (
              <p className="text-sm text-fg-secondary">{t('formulario.resolucion.eligeSucursal')}</p>
            ) : !contexto ? (
              <p className="text-sm text-fg-muted">{t('formulario.resolucion.cargando')}</p>
            ) : !contexto.rango || !rango ? (
              <p className="text-sm text-fg-secondary">{t('formulario.resolucion.sinRango')}</p>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-fg">{t('formulario.resolucion.rango', { prefijo: contexto.rango.prefix ?? '' })}</p>
                    <p className="text-xs text-fg-muted">{nombreSucursal}</p>
                  </div>
                  {tonoRango && <StatusBadge estado={tonoRango === 'peligro' ? 'overdue' : 'pending'} etiqueta={t(`formulario.resolucion.tono.${rango.tono}`)} />}
                </div>
                <BarraProgreso
                  valor={rango.usados}
                  max={Math.max(rango.total, 1)}
                  etiqueta={t('formulario.resolucion.consumo')}
                  textoValor={t('formulario.resolucion.consumoValor', { usados: rango.usados, total: rango.total, quedan: rango.quedan })}
                  tono={tonoRango === 'peligro' ? 'peligro' : tonoRango === 'advertencia' ? 'advertencia' : 'marca'}
                  tamano="sm"
                />
                <p className="text-xs text-fg-muted">
                  {[
                    contexto.rango.resolucion ? t('formulario.resolucion.numero', { numero: contexto.rango.resolucion }) : null,
                    contexto.rango.valid_until ? t('formulario.resolucion.hasta', { fecha: formatPlain(contexto.rango.valid_until) }) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
            )}
          </Tarjeta>
        </>
      }
      pieMovil={
        <>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-xs text-fg-secondary">{t('formulario.total')}</span>
            <span className="truncate text-base font-semibold tabular-nums text-fg">{formatear(totales.total)}</span>
          </span>
          <KbdButton icono={FileCheck} cargando={guardando === 'borrador'} disabled={!!guardando || cargando} onClick={() => void guardar('borrador')}>
            {t('formulario.guardarBorrador')}
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
                  cuenta_contable: null,
                  note: i.nota,
                  manual: true,
                },
              ]);
              setErrores((e) => ({ ...e, lineas: '' }));
            }}
          />
          <DialogoSalirConCambios
            abierto={salir}
            onAbiertoChange={setSalir}
            onSalir={() => {
              setSucio(false);
              router.push(volver);
            }}
          />
        </>
      }
    />
  );
}
