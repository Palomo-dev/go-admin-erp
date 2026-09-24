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
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Ban,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  FileCheck,
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
  DialogoMotivo,
  EmptyState,
  FilaDato,
  RowActionsMenu,
  StatusBadge,
  Tarjeta,
  type AccionFila,
} from '@/components/kit';
import {
  CadenaDocumento,
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
import { leerDetalleFacturaCompra, type DetalleFacturaCompra } from '@/lib/services/compras/lecturasCompras';
import { RegistrarPagoProveedor } from '@/components/finanzas/cuentas-por-pagar/RegistrarPagoProveedor';
import { ProgramarPagoDialog } from '@/components/finanzas/cuentas-por-pagar/ProgramarPagoDialog';
import { RUTA_CXP, RUTA_PROVEEDORES, useBaseCompras } from '../rutasCompras';
import { DialogoConfirmarCompra, DialogoRecepcionar } from './DialogosCompra';

type Dialogo = 'confirmar' | 'recepcionar' | 'anular' | 'pagar' | 'programar' | null;

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
  const [dialogo, setDialogo] = useState<Dialogo>(null);
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

  const { formatDate, formatDateTime, getToday } = useFormatDate(f?.branch_id ?? null);
  const ctxMoneda = moneda.paraDocumento(f?.currency);
  const formatear = useMemo(() => crearFormateadorMoneda(ctxMoneda), [ctxMoneda]);

  const mensajeError = (e: unknown) => {
    const codigo = e instanceof ErrorPeticionCompra ? e.codigo : 'error_desconocido';
    return t.has(`errores.${codigo}`) ? t(`errores.${codigo}` as never) : t('errores.error_desconocido');
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
    return <DocumentoCabecera tipo="facturaCompra" titulo={td('cargando')} cargando migas={[{ etiqueta: t('titulo'), href: base }]} />;
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
      onSelect: () => {
        if (!window.confirm(td('eliminarConfirmar', { numero: f.number_ext }))) return;
        void clienteCompras
          .eliminarBorrador(f.id)
          .then(() => {
            toastSuccess(td('eliminada', { numero: f.number_ext }));
            router.push(base);
          })
          .catch((e) => toastError(mensajeError(e)));
      },
    },
  ];

  const botonClase =
    'inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

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
              <Link
                href={`/app/finanzas/documentos-soporte/${f.documentoSoporte.id}`}
                className="inline-flex h-6 items-center gap-1 rounded-full border border-line bg-surface px-2 text-xs text-fg-secondary hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <FileCheck aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
                {f.documentoSoporte.referencia}
              </Link>
            )}
          </>
        }
        acciones={
          <>
            <button type="button" onClick={() => imprimirDocumento('factura-compra', f.id)} className={`${botonClase} border border-line-strong bg-surface text-fg hover:bg-hover`}>
              <Printer aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {td('acciones.imprimir')}
            </button>
            {acciones.confirmar && (
              <button type="button" disabled={!permisos.crear} title={!permisos.crear ? td('motivos.sinPermiso') : undefined} onClick={() => setDialogo('confirmar')} className={`${botonClase} bg-brand-action text-fg-on-brand hover:bg-brand-action-hover`}>
                <CheckCircle2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {td('acciones.confirmar')}
              </button>
            )}
            {acciones.recepcionar && (
              <button type="button" disabled={!permisos.crear} title={!permisos.crear ? td('motivos.sinPermiso') : undefined} onClick={() => setDialogo('recepcionar')} className={`${botonClase} border border-line-strong bg-surface text-fg hover:bg-hover`}>
                <PackageCheck aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {td('acciones.recepcionar')}
              </button>
            )}
            {acciones.registrarPago && (
              <button type="button" disabled={!permisos.crear} title={!permisos.crear ? td('motivos.sinPermiso') : undefined} onClick={() => setDialogo('pagar')} className={`${botonClase} bg-brand-action text-fg-on-brand hover:bg-brand-action-hover`}>
                <Wallet aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {td('acciones.pagar')}
              </button>
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
                <button type="button" onClick={() => setDialogo('pagar')} className="text-sm font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                  {td('acciones.pagar')}
                </button>
              ) : undefined
            }
          >
            {f.pagos.length === 0 ? (
              <p className="pb-4 text-sm text-fg-secondary">{td('pagos.vacio')}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line pb-2">
                {f.pagos.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <div className="flex min-w-0 flex-col">
                      <span className="font-medium text-fg">{formatear(p.amount)}</span>
                      <span className="truncate text-xs text-fg-secondary">
                        {[formatDateTime(p.payment_date ?? p.created_at), p.method, p.reference, p.installment_id ? td('pagos.aCuota') : null].filter(Boolean).join(' · ')}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {p.status !== 'completed' && <StatusBadge estado={p.status ?? 'pendiente'} />}
                      {p.status === 'completed' && (
                        <button
                          type="button"
                          onClick={() => abrirDocumento('comprobante-egreso', p.id)}
                          aria-label={td('pagos.comprobanteDe', { monto: formatear(p.amount) })}
                          className="flex size-8 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        >
                          <FileText aria-hidden="true" className="size-4" strokeWidth={1.5} />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
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
            <div className="flex flex-col pb-3">
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
            </div>
          </Tarjeta>

          {f.cuenta && (
            <Tarjeta titulo={td('cuenta.titulo')} icono={ClipboardList}>
              <div className="flex flex-col pb-3">
                <FilaDato etiqueta={td('cuenta.monto')} valor={formatear(f.cuenta.amount)} />
                <FilaDato etiqueta={td('cuenta.saldo')} valor={formatear(f.cuenta.balance)} tono={f.cuenta.balance > 0 ? 'peligro' : 'exito'} />
                <FilaDato etiqueta={td('cuenta.ver')} valor={td('cuenta.abrir')} href={`${RUTA_CXP}/${f.cuenta.id}`} />
              </div>
            </Tarjeta>
          )}

          {f.asientos.length > 0 && (
            <Tarjeta titulo={td('asientos')} icono={BookOpen}>
              <ul className="flex flex-col gap-1 pb-3 text-sm">
                {f.asientos.map((a) => (
                  <li key={a.id}>
                    <Link href={`/app/finanzas/contabilidad/asientos/${a.id}`} className="text-link underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                      {a.memo ?? `#${a.id}`}
                    </Link>
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
        moneda={ctxMoneda}
        hayProductos={f.lineas.some((l) => l.product_id !== null)}
        puedeRecepcionar={permisos.crear}
        cargando={ocupado}
        error={errorAccion}
        onConfirmar={(opciones) =>
          void ejecutar(() => clienteCompras.confirmar(f.id, opciones), opciones.recepcionar ? td('confirmada.conRecepcion') : td('confirmada.sinRecepcion'))
        }
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
        onRecepcionar={() =>
          void ejecutar(async () => {
            const r = await clienteCompras.recepcionar(f.id);
            if (r.saltadas.length > 0) toastSuccess(td('recepcionar.saltadas', { n: r.saltadas.length }));
          }, td('recepcionar.listo'))
        }
      />
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
