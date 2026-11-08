'use client';

/**
 * Detalle de una nota crédito o débito de venta (Figma `1021:92512` nota
 * crédito, `1021:93962` nota débito con cuenta por cobrar, `1021:93702` y
 * `1021:93766` anular; `73-documentos-nota-*.png`). Molde de
 * `DetalleFacturaVenta`: `DocumentoCabecera` + `CadenaDocumento`,
 * `DocumentoLineas`, `DocumentoTotales`, `Tarjeta`/`FilaDato`.
 *
 * Lee `GET /api/notas-credito/[id]` o `/api/notas-debito/[id]` (servidor,
 * organización de la sesión). Acciones del detalle anterior que se conservan:
 * imprimir y PDF por el motor, enviar a la DIAN (`/api/factus/credit-note`),
 * reintentar (`/api/factus/jobs`), anular con motivo
 * (`/api/notas-credito/[id]/anular`), ver la factura. Nuevas: ver el saldo a
 * favor, la cadena, el bloqueo con salida «Emitir nota débito» y, en la nota
 * débito, «Registrar pago» sobre su cuenta por cobrar.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Ban, CircleDollarSign, Download, Eye, FileCheck, FileText, PiggyBank, Printer, Receipt, RefreshCw, Send } from 'lucide-react';
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
import { impuestosDeLineas } from '@/lib/finanzas/ventas/detalleLogica';
import {
  ErrorPeticionNota,
  anularNota,
  enviarNotaCreditoDian,
  pedirDetalleNota,
  reintentarEnvioDian,
  type DetalleNotaCliente,
} from '@/lib/finanzas/notas/clienteNotas';
import { RUTA_NOTAS, consecuenciasAnular, estadoBadgeDian, type TipoNota } from '@/lib/finanzas/notas/contratoNotas';
import { RegistrarPagoConectado } from '@/components/finanzas/pagos/RegistrarPagoConectado';
import { NotaDebitoDialog } from './NotaDebitoDialog';
import { accionesDetalleNota, anulabilidadDetalle, lineasEnPositivo, pagadoNota } from './notasVistaLogica';

const RUTA_FACTURAS = '/app/finanzas/facturas-venta';
const RUTA_SALDOS = '/app/finanzas/saldos-a-favor';

export function DetalleNota({ id, tipo }: { id: string; tipo: TipoNota }) {
  const t = useTranslations('finanzasDocumentosR3.notas');
  const router = useRouter();
  const permisos = usePermisosFinanzas();
  const moneda = useMonedaOrganizacion();

  const [datos, setDatos] = useState<DetalleNotaCliente | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [anularAbierto, setAnularAbierto] = useState(false);
  const [anulando, setAnulando] = useState(false);
  const [errorAnular, setErrorAnular] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [pagoAbierto, setPagoAbierto] = useState(false);
  const [notaDebitoAbierta, setNotaDebitoAbierta] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);
    try {
      setDatos(await pedirDetalleNota(tipo, id));
    } catch (e) {
      setErrorCarga(e instanceof ErrorPeticionNota ? e.codigo : 'error_desconocido');
    } finally {
      setCargando(false);
    }
  }, [id, tipo]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const nota = datos?.base.factura;
  const extra = datos?.extra;
  const { formatDate, formatDateTime } = useFormatDate(nota?.branchId ?? null);
  const ctxMoneda = moneda.paraDocumento(nota?.moneda);
  const fmt = useMemo(() => crearFormateadorMoneda(ctxMoneda), [ctxMoneda]);

  if (errorCarga === 'nota_no_encontrada' || errorCarga === 'factura_no_encontrada') {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState variante="empty" titulo={t('detalle.noEncontrada')} descripcion={t('detalle.noEncontradaDescripcion')} accion={{ etiqueta: t('detalle.volver'), href: rutaListado(tipo) }} />
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

  const numero = nota?.numero ?? t('listado.sinNumero');
  const anulada = !!nota && ['void', 'voided', 'cancelled'].includes(nota.estado);
  const factura = extra?.factura ?? null;
  const numeroFactura = factura?.numero ?? t('listado.sinNumero');
  const lineasBase = lineasEnPositivo(datos?.base.lineas ?? []);
  const lineas: LineaDocumento[] = lineasBase.map((l) => ({
    id: l.id,
    descripcion: l.descripcion,
    sku: l.sku,
    nota: l.nota,
    seriales: l.seriales,
    cantidad: l.cantidad,
    unidad: l.unidad ?? null,
    decimalesCantidad: l.decimalesCantidad ?? null,
    precioUnitario: l.precioUnitario,
    descuento: l.descuento || null,
    impuestos: l.tarifa > 0 ? [{ nombre: l.nombreImpuesto ?? t('detalle.impuesto'), tarifa: l.tarifa, incluido: nota?.impuestosIncluidos ?? l.incluido }] : [],
    total: l.total,
  }));
  const impuestos = nota ? impuestosDeLineas(lineasBase, nota.impuestosIncluidos, t('detalle.impuesto')) : [];
  const pagado = pagadoNota(datos?.base.pagos ?? []);
  const total = Math.abs(nota?.total ?? 0);
  const saldo = tipo === 'debito' ? Math.max(0, nota?.saldo ?? 0) : 0;
  const job = datos?.base.job ?? null;

  const acciones = extra
    ? accionesDetalleNota({
        tipo,
        anulada,
        dian: extra.dian,
        saldo,
        tieneFactura: !!factura,
        tieneSaldoAFavor: !!extra.saldoAFavor,
        jobId: job?.id ?? null,
        permisos: { ver: permisos.ver, crear: permisos.crear, anular: permisos.anular },
      })
    : new Set<string>();
  const anulable = extra ? anulabilidadDetalle(extra, { anulada, pagado, permisoAnular: permisos.anular }) : { ok: false as const, motivo: 'ya_anulada' as const };

  // ── Cadena: Factura → Nota → (Saldo a favor | Devolución | Cartera → Pagos) → Asiento ──
  const eslabones: EslabonDocumento[] = nota
    ? [
        ...(factura
          ? [{ id: factura.id, tipo: 'factura' as const, numero: numeroFactura, estado: factura.estado, fecha: formatDate(factura.emision), importe: fmt(factura.total), href: `${RUTA_FACTURAS}/${factura.id}` }]
          : []),
        { id: nota.id, tipo: tipo === 'debito' ? ('notaDebito' as const) : ('notaCredito' as const), numero, estado: nota.estado, fecha: formatDate(nota.emision), importe: fmt(total), actual: true },
        ...(extra?.saldoAFavor
          ? [{ id: extra.saldoAFavor.id, tipo: 'recibo' as const, etiquetaTipo: t('detalle.saldoAFavor'), numero: fmt(extra.saldoAFavor.monto), estado: extra.saldoAFavor.estado, href: RUTA_SALDOS }]
          : []),
        ...(extra?.devolucion
          ? [{ id: extra.devolucion.id, tipo: 'devolucion' as const, numero: t('detalle.devolucion'), estado: extra.devolucion.estado, importe: fmt(extra.devolucion.monto) }]
          : []),
        ...(tipo === 'debito' && datos?.base.cartera
          ? [{ id: datos.base.cartera.id, tipo: 'cuentaPorCobrar' as const, numero: t('detalle.cartera'), estado: datos.base.cartera.estado, importe: fmt(datos.base.cartera.saldo), href: `/app/finanzas/cuentas-por-cobrar/${datos.base.cartera.id}` }]
          : []),
        ...(tipo === 'debito'
          ? (datos?.base.pagos ?? [])
              .filter((p) => p.estado === 'completed')
              .map((p) => ({ id: p.id, tipo: 'pago' as const, numero: p.recibo ?? t('detalle.pago'), fecha: formatDate(p.fecha), importe: fmt(p.monto) }))
          : []),
        ...(tipo === 'debito' && !anulada && saldo > 0 && acciones.has('registrar_pago') && (datos?.base.pagos ?? []).length === 0
          ? [{ id: 'pago-pendiente', tipo: 'pago' as const, numero: '—', pendiente: true, accion: { etiqueta: t('detalle.registrarPago'), onClick: () => setPagoAbierto(true) } }]
          : []),
        ...(datos?.base.asientos ?? [])
          .filter((a) => !a.revertido)
          .slice(0, 1)
          .map((a) => ({ id: `asiento-${a.id}`, tipo: 'asiento' as const, numero: a.clave ?? String(a.id), fecha: formatDate(a.fecha) })),
      ]
    : [];

  // ── Acciones ───────────────────────────────────────────────────────────────
  const descargarPdf = async () => {
    try {
      await descargarDocumento('nota-credito', id);
    } catch {
      toastError(t('detalle.pdfError'));
    }
  };

  const enviarDian = async () => {
    if (!nota) return;
    setEnviando(true);
    try {
      if (acciones.has('reintentar_dian') && job) await reintentarEnvioDian(job.id);
      else await enviarNotaCreditoDian(id, extra?.motivo ?? nota.descripcion ?? nota.notas ?? numero);
      toastSuccess(t('dianDetalle.enviada'));
      await cargar();
    } catch (e) {
      toastError(t('dianDetalle.errorEnvio'), e instanceof ErrorPeticionNota && e.mensaje ? e.mensaje : undefined);
    } finally {
      setEnviando(false);
    }
  };

  const anular = async (motivo: string) => {
    setAnulando(true);
    setErrorAnular(null);
    try {
      await anularNota(tipo, id, motivo);
      toastSuccess(t('anular.hecho'), t('anular.hechoDescripcion', { numero }));
      setAnularAbierto(false);
      await cargar();
    } catch (e) {
      const codigo = e instanceof ErrorPeticionNota ? e.codigo : 'error_desconocido';
      setErrorAnular(
        e instanceof ErrorPeticionNota && e.mensaje && tipo === 'credito'
          ? e.mensaje
          : t.has(`anular.errores.${codigo}`)
            ? t(`anular.errores.${codigo}` as never)
            : t('anular.errores.error_desconocido'),
      );
    } finally {
      setAnulando(false);
    }
  };

  const menu: AccionFila[] = nota
    ? [
        { id: 'imprimir', etiqueta: t('detalle.imprimir'), icono: Printer, onSelect: () => imprimirDocumento('nota-credito', id), oculta: !acciones.has('imprimir') },
        { id: 'ver-pdf', etiqueta: t('detalle.verPdf'), icono: FileText, onSelect: () => abrirDocumento('nota-credito', id), oculta: !acciones.has('descargar_pdf') },
        { id: 'factura', etiqueta: t('detalle.verFactura'), icono: Receipt, onSelect: () => factura && router.push(`${RUTA_FACTURAS}/${factura.id}`), oculta: !acciones.has('ver_factura') },
        { id: 'saldo', etiqueta: t('detalle.verSaldoAFavor'), icono: PiggyBank, onSelect: () => router.push(RUTA_SALDOS), oculta: !acciones.has('ver_saldo_a_favor') },
        {
          id: 'anular',
          etiqueta: tipo === 'debito' ? t('detalle.anularBotonDebito') : t('detalle.anularBotonCredito'),
          icono: Ban,
          destructiva: true,
          separadorAntes: true,
          onSelect: () => {
            setErrorAnular(null);
            setAnularAbierto(true);
          },
          oculta: !acciones.has('anular'),
        },
      ]
    : [];

  const botones = nota ? (
    <div className="flex flex-wrap items-center gap-2">
      {acciones.has('descargar_pdf') && (
        <button type="button" onClick={() => void descargarPdf()} className={clasesBoton({ variante: 'secundario' })}>
          <Download aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('detalle.descargarPdf')}
        </button>
      )}
      {(acciones.has('enviar_dian') || acciones.has('reintentar_dian')) && (
        <button type="button" disabled={enviando} onClick={() => void enviarDian()} className={clasesBoton({ variante: tipo === 'credito' ? 'primario' : 'secundario' })}>
          {acciones.has('reintentar_dian') ? <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.5} /> : <Send aria-hidden="true" className="size-4" strokeWidth={1.5} />}
          {enviando ? t('dianDetalle.enviando') : acciones.has('reintentar_dian') ? t('dianDetalle.reintentar') : t('dianDetalle.enviar')}
        </button>
      )}
      {acciones.has('registrar_pago') && (
        <button type="button" onClick={() => setPagoAbierto(true)} className={clasesBoton({ variante: 'primario' })}>
          <CircleDollarSign aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('detalle.registrarPago')}
        </button>
      )}
      <RowActionsMenu acciones={menu} titulo={numero} orientacion="horizontal" tamano="md" />
    </div>
  ) : null;

  const textoConcepto =
    extra?.concepto && t.has(`conceptos.${tipo}.${extra.concepto}`) ? t(`conceptos.${tipo}.${extra.concepto}` as never) : '—';
  const textoDian = extra ? t(`dianDetalle.${extra.dian}`, { factura: numeroFactura }) : '';
  const estadoClave = anulada ? 'void' : nota && t.has(`estados.${nota.estado}`) ? nota.estado : 'issued';

  const motivosBloqueo =
    !anulable.ok && anulable.motivo === 'aceptada_dian'
      ? [t('anular.bloqueos.aceptada_dian'), tipo === 'credito' ? t('anular.bloqueos.aceptada_dian_salida_credito', { factura: numeroFactura }) : t('anular.bloqueos.aceptada_dian_salida_debito'), t('anular.bloqueos.en_envio_dian')]
      : !anulable.ok
        ? [t(`anular.bloqueos.${anulable.motivo}` as never)]
        : null;

  return (
    <div className="flex flex-col gap-4 p-4 sm:gap-6 sm:p-6">
      <DocumentoCabecera
        tipo={tipo === 'debito' ? 'notaDebito' : 'notaCredito'}
        titulo={nota ? (tipo === 'debito' ? t('detalle.tituloDebito', { numero }) : t('detalle.tituloCredito', { numero })) : t('detalle.cargando')}
        subtitulo={
          nota
            ? [datos?.base.cliente?.nombre ?? t('detalle.sinCliente'), formatDate(nota.emision), factura ? t('detalle.sobre', { factura: numeroFactura }) : null].filter(Boolean).join(' · ')
            : undefined
        }
        migas={[
          { etiqueta: t('migas.finanzas'), href: '/app/finanzas' },
          { etiqueta: t('migas.notas'), href: rutaListado(tipo) },
          { etiqueta: numero },
        ]}
        volverA={rutaListado(tipo)}
        estado={nota ? estadoClave : undefined}
        insignias={
          nota && extra ? (
            <StatusBadge estado={estadoBadgeDian(extra.dian)} etiqueta={`DIAN: ${t(`dian.${extra.dian}`)}`} tamano="md" />
          ) : null
        }
        movil={{ accionesEnFila: true }}
        acciones={botones}
        cargando={cargando && !datos}
        debajo={eslabones.length > 1 ? <CadenaDocumento eslabones={eslabones} etiqueta={t('detalle.cadena')} /> : undefined}
      />

      {nota && extra && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
          <div className="flex min-w-0 flex-col gap-4 lg:col-span-2 lg:gap-6">
            <Tarjeta titulo={tipo === 'debito' ? t('detalle.origenDebito') : t('detalle.origenCredito')}>
              <ListaDatos>
                <FilaDato
                  etiqueta={t('detalle.factura')}
                  tono={factura ? 'enlace' : undefined}
                  href={factura ? `${RUTA_FACTURAS}/${factura.id}` : undefined}
                  valor={
                    factura
                      ? factura.fe === 'accepted'
                        ? t('detalle.facturaAceptada', { numero: numeroFactura, fecha: formatDate(factura.emision) })
                        : t('detalle.facturaValor', { numero: numeroFactura, fecha: formatDate(factura.emision), total: fmt(factura.total) })
                      : '—'
                  }
                />
                <FilaDato etiqueta={t('detalle.conceptoDian')} valor={textoConcepto} />
                <FilaDato etiqueta={t('detalle.motivo')} valor={extra.motivo ?? '—'} />
                {tipo === 'credito' && factura && <FilaDato etiqueta={t('detalle.saldoFactura')} valor={fmt(factura.saldo)} />}
                {tipo === 'credito' && extra.saldoAFavor && (
                  <FilaDato etiqueta={t('detalle.excedente')} tono="exito" href={RUTA_SALDOS} valor={t('detalle.excedenteValor', { monto: fmt(extra.saldoAFavor.monto) })} />
                )}
                {tipo === 'credito' && extra.devolucion && (
                  <FilaDato etiqueta={t('detalle.excedente')} valor={t('detalle.devolucionValor', { monto: fmt(extra.devolucion.monto) })} />
                )}
                {tipo === 'credito' && (
                  <FilaDato
                    etiqueta={t('detalle.inventario')}
                    valor={extra.productosReingresados > 0 ? t('detalle.inventarioValor', { count: extra.productosReingresados }) : t('detalle.sinInventario')}
                  />
                )}
                {tipo === 'debito' && <FilaDato etiqueta={t('detalle.vence')} valor={formatDate(nota.vencimiento)} />}
              </ListaDatos>
            </Tarjeta>

            <DocumentoLineas lineas={lineas} modo="lectura" moneda={ctxMoneda} etiqueta={t('detalle.lineas')} estado={cargando ? 'cargando' : 'listo'} />

            <DocumentoTotales
              titulo={tipo === 'debito' ? t('detalle.totalesDebito') : t('detalle.totalesCredito')}
              moneda={ctxMoneda}
              subtotal={Math.abs(nota.subtotal)}
              impuestos={impuestos.map((i) => ({ nombre: i.nombre, tarifa: i.tarifa, base: i.base, importe: Math.abs(i.importe) }))}
              total={total}
              impuestosIncluidos={nota.impuestosIncluidos}
              pagado={tipo === 'debito' ? pagado : undefined}
              saldo={tipo === 'debito' ? saldo : undefined}
            />

            {tipo === 'debito' && (
              <Tarjeta titulo={t('detalle.pagos')}>
                {(datos?.base.pagos ?? []).length === 0 ? (
                  <p className="text-sm text-fg-muted">{t('detalle.sinPagos')}</p>
                ) : (
                  <ListaDatos>
                    {(datos?.base.pagos ?? []).map((p) => (
                      <FilaDato
                        key={p.id}
                        etiqueta={[p.recibo ?? t('detalle.pago'), formatDate(p.fecha)].join(' · ')}
                        descripcion={p.metodoNombre ?? p.metodo ?? undefined}
                        valor={<span className={p.estado === 'completed' ? undefined : 'text-fg-muted line-through'}>{fmt(p.monto)}</span>}
                      />
                    ))}
                  </ListaDatos>
                )}
              </Tarjeta>
            )}

            {(datos?.base.historial ?? []).length > 0 && (
              <Tarjeta titulo={t('detalle.historial')}>
                <ListaDatos>
                  {(datos?.base.historial ?? []).map((h, i) => (
                    <FilaDato key={`${h.accion}-${i}`} etiqueta={h.accion} descripcion={h.motivo ?? undefined} valor={formatDateTime(h.fecha)} />
                  ))}
                </ListaDatos>
              </Tarjeta>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-4 lg:gap-6">
            <Tarjeta
              titulo={t('dianDetalle.titulo')}
              icono={FileCheck}
              accion={<StatusBadge estado={estadoBadgeDian(extra.dian)} etiqueta={t(`dian.${extra.dian}`)} />}
            >
              <div className="flex flex-col gap-3">
                <p className="text-sm text-fg-secondary">{textoDian}</p>
                {tipo === 'debito' && factura?.fe === 'accepted' && !nota.fe.estado && <p className="text-xs text-fg-muted">{t('dianDetalle.debitoPendiente')}</p>}
                {(nota.fe.numero || job?.cufe || job?.error) && (
                  <ListaDatos>
                    {nota.fe.numero && <FilaDato etiqueta={t('dianDetalle.numero')} valor={nota.fe.numero} />}
                    {job?.cufe && <FilaDato etiqueta={t('dianDetalle.cude')} valor={<span className="break-all font-mono text-xs">{job.cufe}</span>} />}
                    {job?.error && extra.dian !== 'aceptada' && <FilaDato etiqueta={t('dianDetalle.motivo')} valor={job.error} />}
                    {job?.actualizado && <FilaDato etiqueta={t('dianDetalle.actualizado')} valor={formatDateTime(job.actualizado)} />}
                  </ListaDatos>
                )}
                {(acciones.has('enviar_dian') || acciones.has('reintentar_dian')) && (
                  <button type="button" disabled={enviando} onClick={() => void enviarDian()} className={clasesBoton({ variante: 'secundario', tamano: 'sm', className: 'w-fit' })}>
                    {enviando ? t('dianDetalle.enviando') : acciones.has('reintentar_dian') ? t('dianDetalle.reintentar') : t('dianDetalle.enviar')}
                  </button>
                )}
              </div>
            </Tarjeta>

            <Tarjeta titulo={t('detalle.cliente')}>
              {datos?.base.cliente ? (
                <ListaDatos>
                  <FilaDato etiqueta={datos.base.cliente.nombre ?? t('detalle.sinCliente')} valor={datos.base.cliente.documento ?? undefined} />
                  {datos.base.cliente.email && <FilaDato etiqueta={datos.base.cliente.email} />}
                </ListaDatos>
              ) : (
                <p className="text-sm text-fg-muted">{t('detalle.sinCliente')}</p>
              )}
              {factura && (
                <Link href={`${RUTA_FACTURAS}/${factura.id}`} className="mt-3 inline-flex items-center gap-1 text-sm text-link underline-offset-2 hover:underline">
                  <Eye aria-hidden="true" className="size-4" strokeWidth={1.5} />
                  {t('detalle.verFactura')}
                </Link>
              )}
            </Tarjeta>

            {acciones.has('anular') && (
              <Tarjeta titulo={t('detalle.anularTitulo')}>
                <p className="text-sm text-fg-secondary">{tipo === 'debito' ? t('detalle.anularTextoDebito') : t('detalle.anularTextoCredito')}</p>
                <button
                  type="button"
                  onClick={() => {
                    setErrorAnular(null);
                    setAnularAbierto(true);
                  }}
                  className={clasesBoton({ variante: 'secundario', tamano: 'sm', className: 'mt-3 w-fit' })}
                >
                  <Ban aria-hidden="true" className="size-4" strokeWidth={1.5} />
                  {tipo === 'debito' ? t('detalle.anularBotonDebito') : t('detalle.anularBotonCredito')}
                </button>
              </Tarjeta>
            )}
          </div>
        </div>
      )}

      {nota && extra && (
        <>
          <DialogoMotivo
            abierto={anularAbierto}
            onAbiertoChange={(v) => {
              if (!anulando) {
                setErrorAnular(null);
                setAnularAbierto(v);
              }
            }}
            titulo={anulable.ok ? (tipo === 'debito' ? t('anular.tituloDebito', { numero }) : t('anular.tituloCredito', { numero })) : t('anular.bloqueadoTitulo')}
            descripcion={anulable.ok ? t('anular.descripcion') : extra.dian === 'aceptada' ? t('anular.bloqueadoSubtitulo', { numero }) : undefined}
            textoConfirmar={t('anular.confirmar')}
            onConfirmar={anular}
            tituloConsecuencias={anulable.ok ? t('anular.consecuenciasTitulo') : t('anular.porQue')}
            consecuencias={
              motivosBloqueo
                ? motivosBloqueo.slice(1)
                : consecuenciasAnular({
                    tipo,
                    saldoAFavor: !!extra.saldoAFavor && extra.saldoAFavor.estado !== 'cancelled',
                    devolucion: !!extra.devolucion && extra.devolucion.estado === 'completed',
                    productosReingresados: extra.productosReingresados,
                  }).map((k) => t(`anular.consecuencias.${k}` as 'anular.consecuencias.factura_vuelve', { factura: numeroFactura, monto: fmt(extra.saldoAFavor?.monto ?? 0) }))
            }
            motivosRapidos={[t('anular.rapidos.error'), t('anular.rapidos.duplicada'), t('anular.rapidos.cliente')]}
            cargando={anulando}
            error={errorAnular}
            bloqueo={anulable.ok ? null : motivosBloqueo?.[0] ?? null}
          >
            {!anulable.ok && anulable.motivo === 'aceptada_dian' && tipo === 'credito' && factura && permisos.crear && (
              <button
                type="button"
                onClick={() => {
                  setAnularAbierto(false);
                  setNotaDebitoAbierta(true);
                }}
                className={clasesBoton({ variante: 'primario', className: 'w-full sm:w-auto' })}
              >
                {t('anular.emitirNotaDebito')}
              </button>
            )}
          </DialogoMotivo>
          {tipo === 'debito' && (
            <RegistrarPagoConectado
              abierto={pagoAbierto}
              onAbiertoChange={setPagoAbierto}
              destino={{ tipo: 'factura', id }}
              origen="factura_venta"
              onRegistrado={() => void cargar()}
            />
          )}
          {tipo === 'credito' && factura && (
            <NotaDebitoDialog abierto={notaDebitoAbierta} onAbiertoChange={setNotaDebitoAbierta} facturaId={factura.id} numero={numeroFactura} />
          )}
        </>
      )}
    </div>
  );
}

function rutaListado(tipo: TipoNota): string {
  return tipo === 'debito' ? `${RUTA_NOTAS}?tipo=debito` : RUTA_NOTAS;
}
