'use client';

/**
 * Detalle de una factura de venta (Figma Sección B.2, `20-facturas-venta-detalle.png`).
 *
 * Lee `GET /api/facturas-venta/[id]` (servidor, organización de la sesión) y
 * compone el kit: `DocumentoCabecera`, `CadenaDocumento`, `DocumentoLineas`,
 * `DocumentoTotales`, `Tarjeta`/`FilaDato`. Las acciones van al servidor:
 * registrar y anular pago (`/api/pagos`), emitir y anular la factura
 * (`/api/facturas-venta/[id]/…`) y el PDF por el motor (`/api/documentos`).
 * Nunca escribe saldos: los recalculan los disparadores.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  Ban,
  CircleDollarSign,
  Copy,
  Download,
  FilePen,
  FileMinus,
  Mail,
  Pencil,
  Printer,
  Send,
} from 'lucide-react';
import {
  CadenaDocumento,
  DialogoMotivo,
  DocumentoCabecera,
  DocumentoLineas,
  DocumentoTotales,
  EmptyState,
  FilaDato,
  ListaDatos,
  RowActionsMenu,
  StatusBadge,
  Tarjeta,
  clasesBoton,
  type AccionFila,
  type EslabonDocumento,
  type LineaDocumento,
} from '@/components/kit';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { crearFormateadorMoneda } from '@/lib/utils/moneda';
import { abrirDocumento, descargarDocumento, imprimirDocumento } from '@/lib/documents/cliente';
import { usePermisosFinanzas } from '@/lib/finanzas/usePermisosFinanzas';
import { accionesFactura, estadoPagoFactura, puedeAnular } from '@/lib/finanzas/ventas/reglasFactura';
import { asientoDescuadrado, diasVencidos, impuestosDeLineas, pagoAnulable, totalPagado } from '@/lib/finanzas/ventas/detalleLogica';
import type { DetalleFacturaVenta as Detalle, FaltanteStock } from '@/lib/finanzas/ventas/contratoFacturas';
import { ErrorPeticionFactura, anularFacturaVenta, emitirFacturaVenta, pedirDetalleFactura } from '@/lib/finanzas/ventas/clienteFacturas';
import { RegistrarPagoConectado } from '@/components/finanzas/pagos/RegistrarPagoConectado';
import { AnularPagoConectado } from '@/components/finanzas/pagos/AnularPagoConectado';
import { SendToFactusButton } from '@/components/finanzas/facturacion-electronica';
import { NotaCreditoVentaDialog } from './NotaCreditoVentaDialog';
import { EnviarFacturaDialog } from './EnviarFacturaDialog';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

const RUTA_LISTADO = '/app/finanzas/facturas-venta';

export function DetalleFacturaVenta({ id }: { id: string }) {
  const t = useTranslations('facturasVenta');
  const router = useRouter();
  const permisos = usePermisosFinanzas();
  const moneda = useMonedaOrganizacion();

  const [datos, setDatos] = useState<Detalle | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const [pagoAbierto, setPagoAbierto] = useState(false);
  const [pagoAAnular, setPagoAAnular] = useState<{ id: string; monto: string } | null>(null);
  const [anularAbierto, setAnularAbierto] = useState(false);
  const [anulando, setAnulando] = useState(false);
  const [errorAnular, setErrorAnular] = useState<string | null>(null);
  const [emitiendo, setEmitiendo] = useState(false);
  const [faltantes, setFaltantes] = useState<FaltanteStock[] | null>(null);
  const [notaAbierta, setNotaAbierta] = useState(false);
  const [enviarAbierto, setEnviarAbierto] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);
    try {
      setDatos(await pedirDetalleFactura(id));
    } catch (e) {
      setErrorCarga(e instanceof ErrorPeticionFactura ? e.codigo : 'error_desconocido');
    } finally {
      setCargando(false);
    }
  }, [id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const f = datos?.factura;
  // Fechas en la zona de la sucursal de la factura (timestamptz → formatDateInTz).
  const { formatDate, formatDateTime, getToday, toDate } = useFormatDate(f?.branchId ?? null);
  const ctxMoneda = moneda.paraDocumento(f?.moneda);
  const fmt = useMemo(() => crearFormateadorMoneda(ctxMoneda), [ctxMoneda]);

  const diasVencida = useMemo(
    () => (f && f.saldo > 0 ? diasVencidos(f.vencimiento ? toDate(new Date(f.vencimiento)) : null, getToday()) : 0),
    [f, toDate, getToday],
  );

  if (errorCarga === 'factura_no_encontrada') {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState
          variante="empty"
          titulo={t('detalle.noEncontrada')}
          descripcion={t('detalle.noEncontradaDescripcion')}
          accion={{ etiqueta: t('detalle.volverListado'), href: RUTA_LISTADO }}
        />
      </div>
    );
  }
  if (errorCarga === 'sin_permiso') {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState variante="forbidden" titulo={t('detalle.sinPermiso')} descripcion={t('detalle.sinPermisoDescripcion')} />
      </div>
    );
  }
  if (errorCarga) {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState variante="error" titulo={t('detalle.errorCarga')} onReintentar={() => void cargar()} />
      </div>
    );
  }

  const factura = f ?? null;
  const reglaFactura = factura
    ? { status: factura.estado, total: factura.total, balance: factura.saldo, document_type: factura.tipoDocumento, sale_id: factura.saleId, einvoice_status: factura.fe.estado }
    : null;
  const acciones = reglaFactura
    ? accionesFactura(reglaFactura, { ver: permisos.ver, crear: permisos.crear, anular: permisos.anular, aprobar: permisos.aprobar })
    : new Set<string>();
  const estadoPago = reglaFactura ? estadoPagoFactura({ ...reglaFactura, dias_vencida: diasVencida }) : null;
  const anulable = reglaFactura ? puedeAnular(reglaFactura) : { ok: false as const, motivo: 'ya_anulada' as const };

  const lineas: LineaDocumento[] = (datos?.lineas ?? []).map((l) => ({
    id: l.id,
    descripcion: l.descripcion,
    sku: l.sku,
    nota: l.nota,
    seriales: l.seriales,
    cantidad: l.cantidad,
    precioUnitario: l.precioUnitario,
    descuento: l.descuento || null,
    impuestos: l.tarifa > 0 ? [{ nombre: l.nombreImpuesto ?? t('detalle.impuesto'), tarifa: l.tarifa, incluido: factura?.impuestosIncluidos ?? l.incluido }] : [],
    total: l.total,
  }));

  const impuestos = factura ? impuestosDeLineas(datos?.lineas ?? [], factura.impuestosIncluidos, t('detalle.impuesto')) : [];
  const pagado = totalPagado(datos?.pagos ?? []);
  const descuadre = factura ? asientoDescuadrado(datos?.asientos ?? [], factura.total) : { descuadrado: false, diferencia: 0 };
  const esBorrador = factura?.estado === 'draft';
  const numero = factura?.numero ?? t('detalle.sinNumero');

  const eslabones: EslabonDocumento[] = factura
    ? [
        ...(factura.saleId ? [{ id: `venta-${factura.saleId}`, tipo: 'venta' as const, numero: t('detalle.ventaOrigen'), href: `/app/pos/ventas/${factura.saleId}` }] : []),
        { id: factura.id, tipo: 'factura' as const, numero, estado: factura.estado, fecha: formatDate(factura.emision), importe: fmt(factura.total), actual: true },
        ...(datos?.cartera
          ? [{ id: datos.cartera.id, tipo: 'cuentaPorCobrar' as const, numero: t('detalle.cartera'), estado: datos.cartera.estado, importe: fmt(datos.cartera.saldo), href: `/app/finanzas/cuentas-por-cobrar/${datos.cartera.id}` }]
          : []),
        ...(datos?.pagos ?? [])
          .filter((p) => p.estado === 'completed')
          .map((p) => ({ id: p.id, tipo: 'pago' as const, numero: p.recibo ?? t('detalle.pago'), fecha: formatDate(p.fecha), importe: fmt(p.monto) })),
        ...(datos?.notasCredito ?? []).map((n) => ({
          id: n.id,
          tipo: 'notaCredito' as const,
          numero: n.numero ?? t('detalle.sinNumero'),
          estado: n.estado,
          importe: fmt(n.total),
          href: `/app/finanzas/notas-credito/${n.id}`,
        })),
      ]
    : [];

  const emitir = async () => {
    if (!factura) return;
    setEmitiendo(true);
    try {
      const r = await emitirFacturaVenta(factura.id);
      toastSuccess(t('emitir.hecho'), t('emitir.hechoDescripcion', { numero: r.numero }));
      await cargar();
    } catch (e) {
      if (e instanceof ErrorPeticionFactura && e.codigo === 'stock_insuficiente') setFaltantes(e.faltantes);
      else toastError(t('emitir.error'), t(`errores.${e instanceof ErrorPeticionFactura ? e.codigo : 'error_desconocido'}` as never));
    } finally {
      setEmitiendo(false);
    }
  };

  const anular = async (motivo: string) => {
    if (!factura) return;
    setAnulando(true);
    setErrorAnular(null);
    try {
      await anularFacturaVenta(factura.id, motivo);
      toastSuccess(t('anular.hecho'), t('anular.hechoDescripcion', { numero }));
      setAnularAbierto(false);
      await cargar();
    } catch (e) {
      const codigo = e instanceof ErrorPeticionFactura ? e.codigo : 'error_desconocido';
      setErrorAnular(t.has(`errores.${codigo}`) ? t(`errores.${codigo}` as never) : t('errores.error_desconocido'));
    } finally {
      setAnulando(false);
    }
  };

  const descargarPdf = async () => {
    if (!factura) return;
    try {
      await descargarDocumento('factura-venta', factura.id);
    } catch {
      toastError(t('pdf.error'));
    }
  };

  const menu: AccionFila[] = factura
    ? [
        { id: 'editar', etiqueta: t('acciones.editar'), icono: Pencil, onSelect: () => router.push(`${RUTA_LISTADO}/${factura.id}/editar`), oculta: !acciones.has('editar') },
        { id: 'duplicar', etiqueta: t('acciones.duplicar'), icono: Copy, onSelect: () => router.push(`${RUTA_LISTADO}/nuevo?duplicar=${factura.id}`), oculta: !acciones.has('duplicar') },
        { id: 'pdf', etiqueta: t('acciones.descargarPdf'), icono: Download, onSelect: () => void descargarPdf() },
        { id: 'ver-pdf', etiqueta: t('acciones.verPdf'), icono: FilePen, onSelect: () => abrirDocumento('factura-venta', factura.id) },
        {
          id: 'nota',
          etiqueta: t('acciones.notaCredito'),
          icono: FileMinus,
          onSelect: () => setNotaAbierta(true),
          oculta: !acciones.has('nota_credito'),
          separadorAntes: true,
        },
        {
          id: 'anular',
          etiqueta: t('acciones.anular'),
          icono: Ban,
          destructiva: true,
          onSelect: () => setAnularAbierto(true),
          oculta: !permisos.anular || factura.estado === 'void' || factura.tipoDocumento === 'credit_note',
        },
      ]
    : [];

  const botones = factura ? (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => imprimirDocumento('factura-venta', factura.id)} className={clasesBoton({ variante: 'secundario' })}>
        <Printer aria-hidden="true" className="size-4" strokeWidth={1.5} />
        {t('acciones.imprimir')}
      </button>
      {acciones.has('enviar') && !esBorrador && (
        <button type="button" onClick={() => setEnviarAbierto(true)} className={clasesBoton({ variante: 'secundario' })}>
          <Mail aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('acciones.enviar')}
        </button>
      )}
      {esBorrador && acciones.has('emitir') && (
        <button type="button" disabled={emitiendo} onClick={() => void emitir()} className={clasesBoton({ variante: 'primario' })}>
          <Send aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {emitiendo ? t('emitir.emitiendo') : t('acciones.emitir')}
        </button>
      )}
      {acciones.has('registrar_pago') && (
        <button type="button" onClick={() => setPagoAbierto(true)} className={clasesBoton({ variante: 'primario' })}>
          <CircleDollarSign aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('acciones.registrarPago')}
        </button>
      )}
      <RowActionsMenu acciones={menu} titulo={numero} orientacion="horizontal" tamano="md" />
    </div>
  ) : null;

  return (
    <div className="flex flex-col gap-4 p-4 sm:gap-6 sm:p-6">
      <DocumentoCabecera
        tipo="factura"
        titulo={factura ? t('detalle.titulo', { numero }) : t('detalle.cargando')}
        subtitulo={factura ? [datos?.cliente?.nombre ?? t('detalle.sinCliente'), formatDate(factura.emision)].join(' · ') : undefined}
        migas={[
          { etiqueta: t('migas.finanzas'), href: '/app/finanzas' },
          { etiqueta: t('migas.facturacion') },
          { etiqueta: t('migas.facturasVenta'), href: RUTA_LISTADO },
          { etiqueta: numero },
        ]}
        estado={factura?.estado}
        insignias={
          factura ? (
            <>
              {estadoPago === 'vencida' && <StatusBadge estado="overdue" etiqueta={t('estados.vencidaDias', { dias: diasVencida })} tamano="md" />}
              {factura.fe.estado && <StatusBadge estado={factura.fe.estado} etiqueta={t(`dian.estados.${factura.fe.estado}` as never)} tamano="md" />}
            </>
          ) : null
        }
        acciones={botones}
        cargando={cargando && !datos}
        debajo={eslabones.length > 1 ? <CadenaDocumento eslabones={eslabones} etiqueta={t('detalle.cadena')} /> : undefined}
      />

      {factura && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
          <div className="flex min-w-0 flex-col gap-4 lg:col-span-2 lg:gap-6">
            <DocumentoLineas lineas={lineas} modo="lectura" moneda={ctxMoneda} etiqueta={t('detalle.lineas')} estado={cargando ? 'cargando' : 'listo'} />

            <Tarjeta titulo={t('pagos.titulo')} sinRelleno>
              {(datos?.pagos.length ?? 0) === 0 ? (
                <p className="px-4 py-6 text-sm text-fg-muted">{t('pagos.vacio')}</p>
              ) : (
                <ul className="divide-y divide-line">
                  {datos!.pagos.map((p) => {
                    const anulado = p.estado !== 'completed';
                    return (
                      <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className={anulado ? 'text-fg-muted line-through' : 'font-medium text-fg'}>
                            {[p.recibo, p.metodoNombre ?? p.metodo].filter(Boolean).join(' · ')}
                          </span>
                          <span className="text-xs text-fg-muted">
                            {formatDateTime(p.fecha)}
                            {p.referencia && p.referencia !== p.recibo ? ` · ${p.referencia}` : ''}
                            {anulado && p.motivoAnulacion ? ` · ${t('pagos.anuladoPor', { motivo: p.motivoAnulacion })}` : ''}
                          </span>
                        </div>
                        {anulado && <StatusBadge estado="void" />}
                        <span className={anulado ? 'tabular-nums text-fg-muted line-through' : 'font-medium tabular-nums text-fg'}>{fmt(p.monto)}</span>
                        <RowActionsMenu
                          titulo={p.recibo ?? t('detalle.pago')}
                          acciones={[
                            { id: 'recibo', etiqueta: t('pagos.verRecibo'), icono: Printer, onSelect: () => abrirDocumento('recibo-caja', p.id) },
                            {
                              id: 'anular',
                              etiqueta: t('pagos.anular'),
                              icono: Ban,
                              destructiva: true,
                              onSelect: () => setPagoAAnular({ id: p.id, monto: fmt(p.monto) }),
                              oculta: !permisos.anular || !pagoAnulable(p),
                            },
                          ]}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </Tarjeta>

            {(factura.notas || factura.descripcion) && (
              <Tarjeta titulo={t('detalle.notas')}>
                <p className="whitespace-pre-line text-sm text-fg-secondary">{[factura.descripcion, factura.notas].filter(Boolean).join('\n\n')}</p>
              </Tarjeta>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-4 lg:gap-6">
            <DocumentoTotales
              variante="venta"
              moneda={ctxMoneda}
              subtotal={factura.subtotal}
              impuestos={impuestos.map((i) => ({ nombre: i.nombre, tarifa: i.tarifa, base: i.base, importe: i.importe }))}
              total={factura.total}
              impuestosIncluidos={factura.impuestosIncluidos}
              mostrarBases
              pagado={esBorrador ? null : pagado + (datos?.creditoAplicado ?? 0)}
              saldo={esBorrador ? null : factura.saldo}
              titulo={t('detalle.resumen')}
            />

            <Tarjeta titulo={t('detalle.cliente')}>
              {datos?.cliente ? (
                <ListaDatos>
                  <FilaDato
                    etiqueta={t('detalle.nombre')}
                    valor={<Link href={`/app/clientes/${datos.cliente.id}`} className="text-link hover:underline">{datos.cliente.nombre ?? '—'}</Link>}
                  />
                  {datos.cliente.documento && <FilaDato etiqueta={t('detalle.documento')} valor={datos.cliente.documento} />}
                  {datos.cliente.email && <FilaDato etiqueta={t('detalle.correo')} valor={datos.cliente.email} />}
                  {datos.cliente.telefono && <FilaDato etiqueta={t('detalle.telefono')} valor={datos.cliente.telefono} />}
                  {datos.cliente.direccion && <FilaDato etiqueta={t('detalle.direccion')} valor={datos.cliente.direccion} />}
                </ListaDatos>
              ) : (
                <p className="text-sm text-fg-muted">{t('detalle.sinCliente')}</p>
              )}
            </Tarjeta>

            <Tarjeta titulo={t('detalle.datos')}>
              <ListaDatos>
                <FilaDato etiqueta={t('detalle.emision')} valor={formatDate(factura.emision)} />
                <FilaDato
                  etiqueta={t('detalle.vencimiento')}
                  valor={formatDate(factura.vencimiento)}
                  tono={estadoPago === 'vencida' ? 'peligro' : undefined}
                />
                {factura.sucursal && <FilaDato etiqueta={t('detalle.sucursal')} valor={factura.sucursal} />}
                {factura.vendedor && <FilaDato etiqueta={t('detalle.vendedor')} valor={factura.vendedor} />}
                <FilaDato etiqueta={t('detalle.moneda')} valor={ctxMoneda.code} />
              </ListaDatos>
            </Tarjeta>

            <Tarjeta titulo={t('dian.titulo')}>
              <ListaDatos>
                <FilaDato
                  etiqueta={t('dian.estado')}
                  valor={factura.fe.estado ? <StatusBadge estado={factura.fe.estado} etiqueta={t(`dian.estados.${factura.fe.estado}` as never)} /> : t('dian.sinFe')}
                />
                {factura.fe.numero && <FilaDato etiqueta={t('dian.numero')} valor={factura.fe.numero} />}
                {datos?.job?.cufe && <FilaDato etiqueta="CUFE" valor={<span className="break-all text-xs">{datos.job.cufe}</span>} />}
              </ListaDatos>
              {datos?.job?.retenido && (
                <p role="note" className="mt-3 rounded-md border border-line-warning bg-warning-subtle px-3 py-2 text-xs text-warning-text">
                  {t('dian.retenido', { motivo: datos.job.retenido })}
                </p>
              )}
              {datos?.job?.error && <p className="mt-3 text-xs text-danger-text">{datos.job.error}</p>}
              {acciones.has('enviar_dian') && (
                <div className="mt-3">
                  <SendToFactusButton
                    invoiceId={factura.id}
                    invoiceNumber={numero}
                    organizationId={getOrganizationId()}
                    currentStatus={(factura.fe.estado as never) ?? null}
                    variant="outline"
                    onSuccess={() => void cargar()}
                  />
                </div>
              )}
            </Tarjeta>

            {(datos?.asientos.length ?? 0) > 0 && (
              <Tarjeta titulo={t('detalle.asientos')}>
                <ListaDatos>
                  {datos!.asientos.map((a) => (
                    <FilaDato
                      key={a.id}
                      etiqueta={t(`detalle.claveAsiento.${(a.clave ?? '').split(':')[0] || 'otro'}` as never)}
                      descripcion={formatDate(a.fecha)}
                      valor={<span className={a.revertido ? 'text-fg-muted line-through' : undefined}>{fmt(a.debito)}</span>}
                      accesorio={a.revertido ? <StatusBadge estado="Revertido" etiqueta={t('detalle.revertido')} /> : undefined}
                    />
                  ))}
                </ListaDatos>
                {descuadre.descuadrado && (
                  <p role="note" className="mt-3 flex items-start gap-2 rounded-md border border-line-warning bg-warning-subtle px-3 py-2 text-xs text-warning-text">
                    <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
                    {t('detalle.asientoDescuadrado', { diferencia: fmt(descuadre.diferencia) })}
                  </p>
                )}
              </Tarjeta>
            )}

            {(datos?.historial.length ?? 0) > 0 && (
              <Tarjeta titulo={t('detalle.historial')}>
                <ol className="flex flex-col gap-2 text-sm">
                  {datos!.historial.map((h, i) => (
                    <li key={`${h.accion}-${i}`} className="flex flex-col">
                      <span className="text-fg">{t.has(`historial.${h.accion}`) ? t(`historial.${h.accion}` as never) : h.accion}</span>
                      <span className="text-xs text-fg-muted">
                        {formatDateTime(h.fecha)}
                        {h.motivo ? ` · ${h.motivo}` : ''}
                      </span>
                    </li>
                  ))}
                </ol>
              </Tarjeta>
            )}
          </div>
        </div>
      )}

      {factura && (
        <>
          <RegistrarPagoConectado
            abierto={pagoAbierto}
            onAbiertoChange={setPagoAbierto}
            destino={{ tipo: 'factura', id: factura.id }}
            origen="factura_venta"
            onRegistrado={() => void cargar()}
          />
          <AnularPagoConectado
            abierto={pagoAAnular !== null}
            onAbiertoChange={(v) => !v && setPagoAAnular(null)}
            paymentId={pagoAAnular?.id ?? null}
            montoTexto={pagoAAnular?.monto}
            origen="factura_venta"
            onAnulado={() => void cargar()}
          />
          <DialogoMotivo
            abierto={anularAbierto}
            onAbiertoChange={(v) => {
              if (!anulando) {
                setErrorAnular(null);
                setAnularAbierto(v);
              }
            }}
            titulo={t('anular.titulo', { numero })}
            descripcion={t('anular.descripcion')}
            textoConfirmar={t('anular.confirmar')}
            onConfirmar={anular}
            tituloConsecuencias={t('anular.consecuenciasTitulo')}
            consecuencias={[t('anular.consecuencias.cartera'), t('anular.consecuencias.asiento'), t('anular.consecuencias.inventario')]}
            motivosRapidos={[t('anular.rapidos.error'), t('anular.rapidos.cliente'), t('anular.rapidos.duplicada')]}
            cargando={anulando}
            error={errorAnular}
            bloqueo={anulable.ok ? null : t(`anular.bloqueos.${anulable.motivo}` as never)}
          >
            {!anulable.ok && anulable.motivo !== 'ya_anulada' && acciones.has('nota_credito') && (
              <button
                type="button"
                onClick={() => {
                  setAnularAbierto(false);
                  setNotaAbierta(true);
                }}
                className={clasesBoton({ variante: 'secundario', className: 'w-full sm:w-auto' })}
              >
                <FileMinus aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('acciones.notaCredito')}
              </button>
            )}
          </DialogoMotivo>
          <DialogoMotivo
            abierto={faltantes !== null}
            onAbiertoChange={(v) => !v && setFaltantes(null)}
            titulo={t('emitir.faltantesTitulo')}
            descripcion={t('emitir.faltantesDescripcion')}
            textoConfirmar={t('emitir.entendido')}
            onConfirmar={() => setFaltantes(null)}
            destructiva={false}
            icono={AlertTriangle}
            bloqueo={t('emitir.faltantesBloqueo')}
            consecuencias={(faltantes ?? []).map((x) => t('emitir.faltante', { producto: x.producto, requerido: x.requerido, disponible: x.disponible }))}
            tituloConsecuencias={t('emitir.faltantesLista')}
          />
          <EnviarFacturaDialog
            abierto={enviarAbierto}
            onAbiertoChange={setEnviarAbierto}
            facturaId={factura.id}
            numero={numero}
            correo={datos?.cliente?.email}
          />
          <NotaCreditoVentaDialog
            abierto={notaAbierta}
            onAbiertoChange={setNotaAbierta}
            facturaId={factura.id}
            numero={numero}
            onEmitida={() => void cargar()}
          />
        </>
      )}
    </div>
  );
}
