'use client';

/**
 * Detalle de factura de compra (plan F5; Figma «Detalle factura de compra —
 * listo · por recibir y sin pagos · cargando · no encontrada» y móvil).
 *
 * - Acciones según `accionesPermitidas` (§3.4) y los permisos del servidor
 *   (`usePermisosFinanzas`); la base vuelve a exigirlos.
 * - Confirmar (CxP por el neto, asiento por el disparador, recepción por kardex
 *   y documento soporte si se piden), recepcionar, anular y eliminar borrador
 *   por los route handlers de compras; pagar por el pago único; PDF de la
 *   factura y del comprobante de egreso por el motor de documentos.
 * - Ya no existe el «Registrar pago» de pruebas en borrador, ni recepcionar una
 *   factura `partial` dos veces (lo decide la base con `stock_received_at`).
 */
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Ban,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  FileBadge,
  FileText,
  HandCoins,
  ClipboardList,
  PackageCheck,
  Pencil,
  Printer,
  ReceiptText,
  Trash2,
  Wallet,
} from 'lucide-react';
import {
  AccionRapida,
  DataTable,
  Dialogo,
  DialogoMotivo,
  EmptyState,
  FilaDato,
  ListaDatos,
  RowActionsMenu,
  StatusBadge,
  Tarjeta,
  clasesBoton,
  type AccionFila,
  type ColumnaTabla,
} from '@/components/kit';
import {
  CadenaDocumento,
  ChipDocumento,
  DocumentoCabecera,
  DocumentoLineas,
  DocumentoTotales,
  type EslabonDocumento,
  type LineaDocumento,
} from '@/components/kit/documento';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { usePermisosFinanzas } from '@/lib/finanzas/usePermisosFinanzas';
import { crearFormateadorMoneda } from '@/lib/utils/moneda';
import { abrirDocumento, imprimirDocumento } from '@/lib/documents/cliente';
import { accionesPermitidas, calcularTotalesCompra, estadoRecepcion } from '@/lib/services/compras/logica';
import { clienteCompras, ErrorPeticionCompra } from '@/lib/services/compras/clienteCompras';
import { leerDetalleFacturaCompra, type DetalleFacturaCompra, type PagoCompraLeido } from '@/lib/services/compras/lecturasCompras';
import { RegistrarPagoProveedor } from '@/components/finanzas/cuentas-por-pagar/RegistrarPagoProveedor';
import { ProgramarPagoDialog } from '@/components/finanzas/cuentas-por-pagar/ProgramarPagoDialog';
import { CertificadoRetencionesDialog, rangoMesDe } from '@/components/finanzas/cuentas-por-pagar/CertificadoRetencionesDialog';
import { RUTA_CXP, RUTA_PROVEEDORES, useBaseCompras } from '../rutasCompras';
import { DialogoConfirmarCompra, DialogoRecepcionar, type RecepcionConLotes } from './DialogosCompra';
import { useProductosConLote, useTextoErrorRecepcion } from '@/components/inventario/recepcion/LotesRecepcion';

type DialogoAbierto = 'confirmar' | 'recepcionar' | 'anular' | 'pagar' | 'programar' | 'eliminar' | 'certificado' | null;

export default function DetalleFacturaCompraV2({ id }: { id: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const base = useBaseCompras();
  const t = useTranslations('facturasCompra');
  const td = useTranslations('facturasCompra.detalle');
  const permisos = usePermisosFinanzas();
  const moneda = useMonedaOrganizacion();

  const [f, setF] = useState<DetalleFacturaCompra | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [recarga, setRecarga] = useState(0);
  const [dialogo, setDialogo] = useState<DialogoAbierto>(null);
  const idMotivoAcciones = useId();
  const [ocupado, setOcupado] = useState(false);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const recargar = useCallback(() => setRecarga((n) => n + 1), []);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(false);
    leerDetalleFacturaCompra(getOrganizationId(), id)
      .then((d) => !cancelado && setF(d))
      .catch((e: unknown) => {
        if (cancelado) return;
        console.error('Error cargando la factura de compra:', e);
        setError(true);
      })
      .finally(() => !cancelado && setCargando(false));
    return () => {
      cancelado = true;
    };
  }, [id, recarga]);

  // `?accion=recepcionar` (desde el listado) abre el diálogo una vez.
  useEffect(() => {
    if (params?.get('accion') === 'recepcionar' && f && f.status !== 'draft' && !f.stock_received_at) setDialogo('recepcionar');
  }, [params, f]);

  const { formatDate, formatDateTime, getToday, toDate } = useFormatDate(f?.branch_id ?? null);
  const ctxMoneda = moneda.paraDocumento(f?.currency);
  const formatear = useMemo(() => crearFormateadorMoneda(ctxMoneda), [ctxMoneda]);

  // Inventario B8: lote y vencimiento de los productos con lotes al recibir.
  const conLote = useProductosConLote(f?.lineas.map((l) => l.product_id) ?? [], dialogo === 'confirmar' || dialogo === 'recepcionar');
  const recepcionLotes: RecepcionConLotes | undefined = f
    ? {
        organizacionId: getOrganizationId(),
        sucursalId: f.branch_id,
        hoy: getToday(),
        lineas: f.lineas
          .filter((l) => l.product_id !== null && conLote.has(l.product_id) && l.qty > 0)
          .map((l) => ({ clave: l.id, invoice_item_id: l.id, product_id: l.product_id as number, nombre: l.description, qty: l.qty })),
      }
    : undefined;
  const textoErrorRecepcion = useTextoErrorRecepcion();

  const mensajeError = (e: unknown) => {
    const codigo = e instanceof ErrorPeticionCompra ? e.codigo : 'error_desconocido';
    return t.has(`errores.${codigo}`) ? t(`errores.${codigo}` as never) : textoErrorRecepcion(codigo) ?? t('errores.error_desconocido');
  };

  const ejecutar = async (accion: () => Promise<unknown>, exito: string) => {
    setOcupado(true);
    setErrorAccion(null);
    try {
      await accion();
      toastSuccess(exito);
      setDialogo(null);
      recargar();
    } catch (e) {
      setErrorAccion(mensajeError(e));
    } finally {
      setOcupado(false);
    }
  };

  if (cargando && !f) {
    // Misma rejilla que el detalle listo: cabecera, líneas y totales en esqueleto (plan §3.2).
    return (
      <div className="flex flex-col gap-4 lg:gap-5">
        <DocumentoCabecera tipo="facturaCompra" titulo={td('cargando')} cargando migas={[{ etiqueta: t('titulo'), href: base }]} />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-5">
          <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
            <Tarjeta titulo={td('lineas')} sinRelleno>
              <DocumentoLineas lineas={[]} modo="lectura" moneda={ctxMoneda} etiqueta={td('lineas')} estado="cargando" />
            </Tarjeta>
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            <DocumentoTotales variante="compra" moneda={ctxMoneda} subtotal={0} total={0} cargando />
          </div>
        </div>
      </div>
    );
  }
  if (error || !f) {
    return (
      <EmptyState
        titulo={error ? td('errorCarga') : td('noEncontrada')}
        descripcion={error ? td('errorCargaDescripcion') : td('noEncontradaDescripcion')}
        icono={ReceiptText}
        accion={{ etiqueta: td('volver'), href: base }}
      />
    );
  }

  const recepcion = estadoRecepcion({ stock_received_at: f.stock_received_at, lineasConProducto: f.lineas.filter((l) => l.product_id !== null).length });
  const pagosCompletados = f.pagos.filter((p) => p.status === 'completed');
  const tienePagos = pagosCompletados.length > 0;
  const acciones = accionesPermitidas({ estado: f.status, recepcion, saldo: f.balance, tienePagos });
  const neto = Math.max(0, f.total - f.retenciones.reduce((s, r) => s + r.amount, 0));
  const pagado = pagosCompletados.reduce((s, p) => s + p.amount + p.discount_amount, 0);
  const programadoPendiente = f.programaciones.filter((p) => p.status === 'pending').reduce((s, p) => s + p.amount, 0);
  const estadoDoc =
    f.status === 'void'
      ? 'anulada'
      : f.status === 'draft'
        ? 'borrador'
        : f.balance <= 0
          ? 'pagada'
          : f.balance < neto
            ? 'parcial'
            : 'pendiente';

  // Bases por tarifa para la tarjeta de totales (los importes de cabecera los pone la base).
  const desglose = calcularTotalesCompra(f.lineas, f.tax_included);
  const impuestos = desglose.porTarifa
    .filter((x) => x.tarifa > 0)
    .map((x) => ({ nombre: td('iva'), tarifa: x.tarifa, base: x.base, importe: x.impuesto }));

  const lineas: LineaDocumento[] = f.lineas.map((l) => ({
    id: l.id,
    descripcion: l.description,
    sku: l.sku,
    nota: l.note,
    seriales: l.serial_numbers,
    cantidad: l.qty,
    unidad: l.unidad,
    decimalesCantidad: l.decimalesCantidad,
    precioUnitario: l.unit_price,
    descuento: l.discount_amount || null,
    impuestos: l.tax_rate > 0 ? [{ nombre: td('iva'), tarifa: l.tax_rate, incluido: f.tax_included }] : [],
    total: l.total_line,
  }));

  const eslabones: EslabonDocumento[] = [
    { id: f.id, tipo: 'facturaCompra', numero: f.number_ext, estado: estadoDoc, fecha: formatDate(f.issue_date), importe: formatear(f.total), actual: true },
  ];
  if (f.orden) eslabones.push({ id: `oc-${f.orden.id}`, tipo: 'ordenCompra', numero: `OC-${f.orden.id}`, href: `/app/inventario/ordenes-compra/${f.orden.uuid}` });
  if (f.cuenta)
    eslabones.push({
      id: f.cuenta.id,
      tipo: 'cuentaPorPagar',
      numero: td('enlaces.cuenta'),
      estado: f.cuenta.status,
      importe: formatear(f.cuenta.balance),
      href: `${RUTA_CXP}/${f.cuenta.id}`,
    });
  if (f.documentoSoporte)
    eslabones.push({
      id: f.documentoSoporte.id,
      tipo: 'documentoSoporte',
      numero: f.documentoSoporte.referencia,
      estado: f.documentoSoporte.estado,
      href: `/app/finanzas/documentos-soporte/${f.documentoSoporte.id}`,
    });
  for (const a of f.asientos) eslabones.push({ id: `je-${a.id}`, tipo: 'asiento', numero: a.memo ?? `#${a.id}`, fecha: formatDate(a.entry_date), href: `/app/finanzas/contabilidad/asientos/${a.id}` });
  for (const p of pagosCompletados.slice(0, 6)) eslabones.push({ id: p.id, tipo: 'pago', numero: p.reference ?? td('pago'), fecha: formatDate(p.payment_date), importe: formatear(p.amount) });

  const menu: AccionFila[] = [
    { id: 'pdf', etiqueta: td('acciones.pdf'), icono: FileText, onSelect: () => abrirDocumento('factura-compra', f.id) },
    {
      id: 'certificado',
      etiqueta: td('acciones.certificado'),
      icono: FileBadge,
      onSelect: () => setDialogo('certificado'),
      oculta: !f.proveedor || f.retenciones.length === 0 || f.status === 'draft' || f.status === 'void',
    },
    {
      id: 'programar',
      etiqueta: td('acciones.programar'),
      icono: CalendarClock,
      onSelect: () => setDialogo('programar'),
      oculta: !f.cuenta || !acciones.registrarPago,
      deshabilitada: !permisos.crear,
      motivo: td('motivos.sinPermiso'),
    },
    {
      id: 'editar',
      etiqueta: td('acciones.editar'),
      icono: Pencil,
      onSelect: () => router.push(`${base}/${f.id}/editar`),
      oculta: !acciones.editar,
      deshabilitada: !permisos.crear,
      motivo: td('motivos.sinPermiso'),
    },
    {
      id: 'anular',
      etiqueta: td('acciones.anular'),
      icono: Ban,
      onSelect: () => setDialogo('anular'),
      oculta: f.status === 'void' || f.status === 'draft',
      deshabilitada: !acciones.anular || !permisos.anular,
      motivo: !permisos.anular ? td('motivos.sinPermisoAnular') : td('motivos.tienePagos'),
      destructiva: true,
      separadorAntes: true,
    },
    {
      id: 'eliminar',
      etiqueta: td('acciones.eliminar'),
      icono: Trash2,
      oculta: f.status !== 'draft',
      deshabilitada: !acciones.eliminar || !permisos.crear,
      motivo: td('motivos.sinPermiso'),
      destructiva: true,
      separadorAntes: true,
      // Se confirma con el diálogo del manual (PATRONES §8), no con el confirm del navegador.
      onSelect: () => setDialogo('eliminar'),
    },
  ];

  const eliminarBorrador = () => {
    setOcupado(true);
    void clienteCompras
      .eliminarBorrador(f.id)
      .then(() => {
        toastSuccess(td('eliminada', { numero: f.number_ext }));
        setDialogo(null);
        router.push(base);
      })
      .catch((e) => toastError(mensajeError(e)))
      .finally(() => setOcupado(false));
  };

  // Botones deshabilitados con su motivo (title + aria-describedby), no ocultos.
  const sinPermisoCrear = !permisos.crear;
  const motivoCrear = sinPermisoCrear ? td('motivos.sinPermiso') : undefined;
  const describeMotivo = sinPermisoCrear ? idMotivoAcciones : undefined;

  const columnasPagos: ColumnaTabla<PagoCompraLeido>[] = [
    {
      id: 'fecha',
      encabezado: td('pagos.columnas.fecha'),
      celda: (p) => <span className="whitespace-nowrap tabular-nums">{formatDateTime(p.payment_date ?? p.created_at)}</span>,
    },
    { id: 'metodo', encabezado: td('pagos.columnas.metodo'), ocultarDebajo: 'sm', celda: (p) => p.method ?? '—' },
    {
      id: 'referencia',
      encabezado: td('pagos.columnas.referencia'),
      ocultarDebajo: 'md',
      celda: (p) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate">{p.reference ?? '—'}</span>
          {p.installment_id && <span className="text-xs text-fg-secondary">{td('pagos.aCuota')}</span>}
        </div>
      ),
    },
    { id: 'importe', encabezado: td('pagos.columnas.importe'), variante: 'importe', celda: (p) => formatear(p.amount) },
    {
      id: 'estado',
      encabezado: td('pagos.columnas.estado'),
      celda: (p) => (p.status !== 'completed' ? <StatusBadge estado={p.status ?? 'pendiente'} /> : null),
    },
  ];

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <DocumentoCabecera
        tipo="facturaCompra"
        titulo={td('titulo', { numero: f.number_ext })}
        subtitulo={`${f.proveedor?.name ?? '—'} · ${formatDate(f.issue_date)}`}
        migas={[{ etiqueta: t('migas.finanzas'), href: '/app/finanzas' }, { etiqueta: t('titulo'), href: base }, { etiqueta: f.number_ext }]}
        estado={estadoDoc}
        insignias={
          <>
            {f.status !== 'draft' && f.status !== 'void' && <StatusBadge estado={recepcion} etiqueta={t(`recepcion.${recepcion}`)} />}
            {f.documentoSoporte && (
              <ChipDocumento
                tipo="documentoSoporte"
                numero={f.documentoSoporte.referencia}
                href={`/app/finanzas/documentos-soporte/${f.documentoSoporte.id}`}
                tamano="md"
              />
            )}
          </>
        }
        acciones={
          <>
            <button type="button" onClick={() => imprimirDocumento('factura-compra', f.id)} className={clasesBoton({ variante: 'secundario' })}>
              <Printer aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {td('acciones.imprimir')}
            </button>
            {acciones.confirmar && (
              <button
                type="button"
                disabled={sinPermisoCrear}
                title={motivoCrear}
                aria-describedby={describeMotivo}
                onClick={() => setDialogo('confirmar')}
                className={clasesBoton({ variante: 'primario' })}
              >
                <CheckCircle2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {td('acciones.confirmar')}
              </button>
            )}
            {acciones.recepcionar && (
              <button
                type="button"
                disabled={sinPermisoCrear}
                title={motivoCrear}
                aria-describedby={describeMotivo}
                onClick={() => setDialogo('recepcionar')}
                className={clasesBoton({ variante: 'secundario' })}
              >
                <PackageCheck aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {td('acciones.recepcionar')}
              </button>
            )}
            {acciones.registrarPago && (
              <button
                type="button"
                disabled={sinPermisoCrear}
                title={motivoCrear}
                aria-describedby={describeMotivo}
                onClick={() => setDialogo('pagar')}
                className={clasesBoton({ variante: 'primario' })}
              >
                <Wallet aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {td('acciones.pagar')}
              </button>
            )}
            {motivoCrear && (
              <span id={idMotivoAcciones} className="sr-only">
                {motivoCrear}
              </span>
            )}
            <RowActionsMenu orientacion="horizontal" tamano="md" titulo={td('titulo', { numero: f.number_ext })} acciones={menu} />
          </>
        }
        debajo={<CadenaDocumento eslabones={eslabones} etiqueta={td('enlaces.titulo')} />}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-5">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <Tarjeta titulo={td('lineas')} sinRelleno>
            <DocumentoLineas lineas={lineas} modo="lectura" moneda={ctxMoneda} etiqueta={td('lineas')} vacio={{ titulo: td('sinLineas') }} />
          </Tarjeta>

          <Tarjeta
            titulo={td('pagos.titulo')}
            icono={HandCoins}
            accion={
              acciones.registrarPago && permisos.crear ? (
                <button type="button" onClick={() => setDialogo('pagar')} className={clasesBoton({ variante: 'fantasma', tamano: 'sm', className: 'text-link hover:text-link' })}>
                  {td('acciones.pagar')}
                </button>
              ) : undefined
            }
          >
            {f.pagos.length === 0 ? (
              <p className="pb-4 text-sm text-fg-secondary">{td('pagos.vacio')}</p>
            ) : (
              <DataTable
                densidad="compacta"
                etiqueta={td('pagos.titulo')}
                columnas={columnasPagos}
                filas={f.pagos}
                obtenerId={(p) => p.id}
                virtualizar={false}
                accionesRapidas={(p) =>
                  p.status === 'completed' ? (
                    <AccionRapida
                      soloIcono
                      icono={FileText}
                      etiqueta={td('pagos.comprobanteDe', { monto: formatear(p.amount) })}
                      onClick={() => abrirDocumento('comprobante-egreso', p.id)}
                    />
                  ) : null
                }
              />
            )}
            {f.programaciones.some((p) => p.status === 'pending') && (
              <p className="border-t border-line py-3 text-sm text-warning-text">
                {td('pagos.programado', { monto: formatear(programadoPendiente) })}
              </p>
            )}
          </Tarjeta>

          {f.notes && (
            <Tarjeta titulo={td('notas')}>
              <p className="whitespace-pre-line pb-4 text-sm text-fg-secondary">{f.notes}</p>
            </Tarjeta>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <DocumentoTotales
            variante="compra"
            moneda={ctxMoneda}
            subtotal={f.subtotal}
            impuestos={impuestos}
            impuestosIncluidos={f.tax_included}
            retenciones={f.retenciones.map((r) => ({ nombre: r.concept, tarifa: r.rate, base: r.base, importe: r.amount }))}
            total={f.total}
            neto={f.retenciones.length > 0 ? neto : null}
            pagado={f.status !== 'draft' ? pagado : null}
            saldo={f.status !== 'draft' && f.status !== 'void' ? f.balance : null}
          />

          <Tarjeta titulo={td('datos.titulo')}>
            <ListaDatos className="pb-3">
              <FilaDato
                etiqueta={td('datos.proveedor')}
                valor={f.proveedor?.name ?? '—'}
                href={f.proveedor?.uuid ? `${RUTA_PROVEEDORES}/${f.proveedor.uuid}` : undefined}
                descripcion={f.proveedor?.nit ? `NIT ${f.proveedor.nit}${f.proveedor.dv ? `-${f.proveedor.dv}` : ''}` : undefined}
              />
              <FilaDato etiqueta={td('datos.emision')} valor={formatDate(f.issue_date)} />
              <FilaDato etiqueta={td('datos.vencimiento')} valor={formatDate(f.due_date)} />
              <FilaDato etiqueta={td('datos.sucursal')} valor={f.sucursal?.name ?? '—'} />
              <FilaDato etiqueta={td('datos.moneda')} valor={ctxMoneda.code} />
              {f.payment_terms !== null && <FilaDato etiqueta={td('datos.plazo')} valor={td('datos.dias', { n: f.payment_terms })} />}
              {f.orden && <FilaDato etiqueta={td('datos.orden')} valor={`OC-${f.orden.id}`} href={`/app/inventario/ordenes-compra/${f.orden.uuid}`} />}
              <FilaDato
                etiqueta={td('datos.recepcion')}
                valor={f.stock_received_at ? formatDateTime(f.stock_received_at) : t(`recepcion.${recepcion}`)}
              />
            </ListaDatos>
          </Tarjeta>

          {f.cuenta && (
            <Tarjeta titulo={td('cuenta.titulo')} icono={ClipboardList}>
              <ListaDatos className="pb-3">
                <FilaDato etiqueta={td('cuenta.monto')} valor={formatear(f.cuenta.amount)} />
                <FilaDato etiqueta={td('cuenta.saldo')} valor={formatear(f.cuenta.balance)} tono={f.cuenta.balance > 0 ? 'peligro' : 'exito'} />
                <FilaDato etiqueta={td('cuenta.ver')} valor={td('cuenta.abrir')} href={`${RUTA_CXP}/${f.cuenta.id}`} />
              </ListaDatos>
            </Tarjeta>
          )}

          {f.asientos.length > 0 && (
            <Tarjeta titulo={td('asientos')} icono={BookOpen}>
              <ul aria-label={td('asientos')} className="flex flex-wrap gap-2">
                {f.asientos.map((a) => (
                  <li key={a.id} className="min-w-0 max-w-full">
                    <ChipDocumento tipo="asiento" numero={a.memo ?? `#${a.id}`} href={`/app/finanzas/contabilidad/asientos/${a.id}`} tamano="md" />
                  </li>
                ))}
              </ul>
            </Tarjeta>
          )}
        </div>
      </div>

      <DialogoConfirmarCompra
        abierto={dialogo === 'confirmar'}
        onAbiertoChange={(v) => !v && !ocupado && setDialogo(null)}
        numero={f.number_ext}
        total={f.total}
        retenido={f.total - neto}
        facturaId={f.id}
        moneda={ctxMoneda}
        hayProductos={f.lineas.some((l) => l.product_id !== null)}
        puedeRecepcionar={permisos.crear}
        cargando={ocupado}
        error={errorAccion}
        onConfirmar={(opciones) =>
          void ejecutar(() => clienteCompras.confirmar(f.id, opciones), opciones.recepcionar ? td('confirmada.conRecepcion') : td('confirmada.sinRecepcion'))
        }
        recepcion={recepcionLotes}
      />
      <DialogoRecepcionar
        abierto={dialogo === 'recepcionar'}
        onAbiertoChange={(v) => !v && !ocupado && setDialogo(null)}
        numero={f.number_ext}
        lineas={f.lineas}
        taxIncluded={f.tax_included}
        moneda={ctxMoneda}
        cargando={ocupado}
        error={errorAccion}
        recepcion={recepcionLotes}
        onRecepcionar={(lotes) =>
          void ejecutar(async () => {
            const r = await clienteCompras.recepcionar(f.id, lotes);
            if (r.saltadas.length > 0) toastSuccess(td('recepcionar.saltadas', { n: r.saltadas.length }));
          }, td('recepcionar.listo'))
        }
      />
      {f.proveedor && f.retenciones.length > 0 && (
        <CertificadoRetencionesDialog
          abierto={dialogo === 'certificado'}
          onAbiertoChange={(v) => !v && setDialogo(null)}
          proveedorId={f.proveedor.id}
          proveedorNombre={f.proveedor.name}
          rangoInicial={f.issue_date ? rangoMesDe(toDate(new Date(f.issue_date)), getToday()) : undefined}
        />
      )}
      <DialogoMotivo
        abierto={dialogo === 'anular'}
        onAbiertoChange={(v) => !v && !ocupado && setDialogo(null)}
        titulo={td('anular.titulo', { numero: f.number_ext })}
        descripcion={td('anular.descripcion')}
        textoConfirmar={td('anular.boton')}
        consecuencias={[td('anular.consecuencias.cuenta'), td('anular.consecuencias.inventario'), td('anular.consecuencias.asiento')]}
        motivosRapidos={[td('anular.motivos.error'), td('anular.motivos.devolucion'), td('anular.motivos.duplicada')]}
        bloqueo={tienePagos ? td('motivos.tienePagos') : null}
        cargando={ocupado}
        error={errorAccion}
        onConfirmar={(motivo) => void ejecutar(() => clienteCompras.anular(f.id, motivo), td('anular.listo'))}
      />
      <Dialogo
        abierto={dialogo === 'eliminar'}
        onAbiertoChange={(v) => !v && !ocupado && setDialogo(null)}
        titulo={td('eliminarTitulo', { numero: f.number_ext })}
        descripcion={td('eliminarDescripcion')}
        ancho={440}
        primario={{ etiqueta: td('acciones.eliminar'), onClick: eliminarBorrador, destructiva: true, cargando: ocupado }}
      />
      {dialogo === 'pagar' && (
        <RegistrarPagoProveedor
          abierto
          onAbiertoChange={(v) => !v && setDialogo(null)}
          documento="invoice_purchase"
          id={f.id}
          origen="factura_compra"
          onRegistrado={recargar}
        />
      )}
      {f.cuenta && (
        <ProgramarPagoDialog
          abierto={dialogo === 'programar'}
          onAbiertoChange={(v) => !v && setDialogo(null)}
          cuentaId={f.cuenta.id}
          saldo={f.cuenta.balance}
          programado={programadoPendiente}
          moneda={ctxMoneda}
          hoy={getToday()}
          onProgramado={recargar}
        />
      )}
    </div>
  );
}
