'use client';

/**
 * Documento soporte — detalle (Figma S9 aceptado `736:41752`, S10 rechazado
 * `736:43092`, S11 enviar `736:43949`, S12 eliminar borrador `736:44016`;
 * captura `52-documentos-doc-soporte-detalle.png`).
 *
 * Lee `GET /api/documentos-soporte/[id]` (servidor, organización de la sesión)
 * y compone el kit como el detalle de la factura de venta. Reemplaza
 * `SupportDocumentDetail.tsx` (2026-11-07). Acciones conservadas: enviar a la
 * DIAN (misma ruta `POST /api/factus/support-document`, misma cola), descargar
 * e imprimir el PDF del motor, XML del proveedor si fue aceptado, ver la vista
 * previa del asiento, eliminar (con el borrado en el proveedor de un rechazado,
 * como antes) y actualizar. Nuevas: editar el borrador o el rechazado, ver el
 * envío (intentos, retención, motivo del rechazo) sin JSON crudo.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { BookOpen, Copy, Download, FileCode, FileText, Pencil, Printer, RefreshCw, Send, Trash2 } from 'lucide-react';
import {
  AvisoTonal,
  CadenaDocumento,
  ConfirmDialog,
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
import { toastError, toastSuccess, toastWarning } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { crearFormateadorMoneda } from '@/lib/utils/moneda';
import { abrirDocumento, descargarDocumento, imprimirDocumento } from '@/lib/documents/cliente';
import { usePermisosFinanzas } from '@/lib/finanzas/usePermisosFinanzas';
import { TablaVistaPrevia, vistaPreviaAsientoDocumento, type VistaPreviaAsiento } from '@/components/finanzas/contabilidad/VistaPreviaAsiento';
import type { DetalleSoporte } from '@/lib/finanzas/soporte/contratoSoporte';
import { BADGE_DIAN, BADGE_DOCUMENTO, accionesSoporte, eliminarEnProveedorPrimero, estadoDian, estadoDocumento } from '@/lib/finanzas/soporte/soporteLogica';
import { impuestosDeLineasSoporte, nombreMedioPago } from '@/lib/finanzas/soporte/detalleSoporteLogica';
import { DatosFiscalesLineas } from '@/components/finanzas/tributario/iva/DatosFiscalesLineas';
import {
  ErrorPeticionSoporte,
  descargarXmlSoporte,
  eliminarEnProveedor,
  eliminarSoporte,
  enviarSoporteDian,
  pedirDetalleSoporte,
} from '@/lib/finanzas/soporte/clienteSoporte';

const RUTA = '/app/finanzas/documentos-soporte';
/** Eventos cuyo mensaje dice algo al usuario (los demás se explican con su rótulo). */
const EVENTOS_CON_MENSAJE = new Set(['accepted', 'rejected', 'error', 'notification']);

export function DetalleDocumentoSoporte({ id }: { id: string }) {
  const t = useTranslations('finanzasDocumentosR3.soporte');
  const router = useRouter();
  const permisos = usePermisosFinanzas();
  const moneda = useMonedaOrganizacion();

  const [datos, setDatos] = useState<DetalleSoporte | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [eliminarAbierto, setEliminarAbierto] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [descargando, setDescargando] = useState<'pdf' | 'xml' | null>(null);
  const [previa, setPrevia] = useState<VistaPreviaAsiento | null>(null);
  const [viendoAsiento, setViendoAsiento] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);
    try {
      setDatos(await pedirDetalleSoporte(id));
    } catch (e) {
      setErrorCarga(e instanceof ErrorPeticionSoporte ? String(e.codigo) : 'error_desconocido');
    } finally {
      setCargando(false);
    }
  }, [id]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const d = datos?.documento ?? null;
  const { formatDate, formatDateTime, formatPlain } = useFormatDate(d?.sucursalId ?? null);
  const ctxMoneda = moneda.paraDocumento(d?.moneda ?? null);
  const fmt = useMemo(() => crearFormateadorMoneda(ctxMoneda), [ctxMoneda]);
  const textoError = (codigo: string) => (t.has(`errores.${codigo}`) ? t(`errores.${codigo}` as never) : t('errores.error_desconocido'));

  if (errorCarga === 'documento_no_encontrado') {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState variante="empty" titulo={t('detalle.noEncontrado')} descripcion={t('detalle.noEncontradoDescripcion')} accion={{ etiqueta: t('detalle.volverListado'), href: RUTA }} />
      </div>
    );
  }
  if (errorCarga === 'sin_permiso') {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState variante="forbidden" titulo={t('sinPermiso.titulo')} descripcion={t('sinPermiso.descripcion')} />
      </div>
    );
  }
  if (errorCarga) {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState variante="error" titulo={t('detalle.errorCarga')} descripcion={textoError(errorCarga)} onReintentar={() => void cargar()} />
      </div>
    );
  }

  const envio = datos?.envio ?? null;
  const acciones = d ? accionesSoporte({ status: d.estado, numero: d.numero, estadoJob: envio?.estado ?? null, deCompra: d.deCompra }) : new Set<string>();
  const eDoc = estadoDocumento(d?.estado);
  const eDian = estadoDian(d?.estado, !!envio?.retenido && envio.estado === 'pending');
  const titulo = d ? t('detalle.titulo', { referencia: d.referencia }) : t('detalle.cargando');

  // ── Acciones ──────────────────────────────────────────────────────────────
  const enviar = async () => {
    if (!d) return;
    setEnviando(true);
    try {
      const r = await enviarSoporteDian(d.id);
      if (r.tipo === 'aceptado' || r.tipo === 'enviado') toastSuccess(t(`envio.${r.tipo}`, { referencia: d.referencia }));
      else if (r.tipo === 'rechazado') toastError(t('envio.rechazado', { referencia: d.referencia }), r.mensaje ?? undefined);
      else toastWarning(t(`envio.${r.tipo}`, { referencia: d.referencia }));
    } catch (e) {
      toastError(t('envio.error'), e instanceof ErrorPeticionSoporte ? textoError(String(e.codigo)) : undefined);
    } finally {
      setEnviando(false);
      void cargar();
    }
  };

  const eliminar = async () => {
    if (!d) return;
    setEliminando(true);
    try {
      if (eliminarEnProveedorPrimero(d.estado)) await eliminarEnProveedor(d.referencia);
      await eliminarSoporte(d.id);
      toastSuccess(t('eliminar.hecho', { referencia: d.referencia }));
      router.push(RUTA);
    } catch (e) {
      toastError(t('eliminar.error'), e instanceof ErrorPeticionSoporte ? textoError(String(e.codigo)) : undefined);
      setEliminando(false);
    }
  };

  const descargarPdf = async () => {
    if (!d) return;
    setDescargando('pdf');
    try {
      await descargarDocumento('documento-soporte', d.id);
    } catch {
      toastError(t('detalle.errorDescarga'));
    } finally {
      setDescargando(null);
    }
  };

  const descargarXml = async () => {
    if (!d?.numero) return;
    setDescargando('xml');
    try {
      await descargarXmlSoporte(d.numero);
    } catch {
      toastError(t('detalle.errorDescarga'));
    } finally {
      setDescargando(null);
    }
  };

  const verAsiento = () => {
    setViendoAsiento(true);
    vistaPreviaAsientoDocumento('documento_soporte', id)
      .then(setPrevia)
      .catch((e: unknown) => setPrevia({ ok: false, fallo: e instanceof Error ? e.message : t('detalle.errorAsiento'), lineas: [] }))
      .finally(() => setViendoAsiento(false));
  };

  const copiarCuds = async () => {
    if (!d?.cuds) return;
    try {
      await navigator.clipboard.writeText(d.cuds);
      toastSuccess(t('detalle.dian.cudsCopiado'));
    } catch {
      toastError(t('detalle.dian.cudsNoCopiado'));
    }
  };

  const menu: AccionFila[] = d
    ? [
        { id: 'pdf', etiqueta: t('acciones.verPdf'), icono: FileText, onSelect: () => abrirDocumento('documento-soporte', d.id) },
        { id: 'imprimir', etiqueta: t('acciones.imprimir'), icono: Printer, onSelect: () => imprimirDocumento('documento-soporte', d.id) },
        { id: 'xml', etiqueta: t('acciones.xml'), icono: FileCode, onSelect: () => void descargarXml(), oculta: !acciones.has('xml'), deshabilitada: descargando !== null, motivo: t('detalle.descargando') },
        { id: 'asiento', etiqueta: t('acciones.verAsiento'), icono: BookOpen, onSelect: verAsiento, deshabilitada: viendoAsiento, motivo: t('detalle.cargandoAsiento') },
        { id: 'actualizar', etiqueta: t('acciones.actualizar'), icono: RefreshCw, onSelect: () => void cargar() },
        { id: 'eliminar', etiqueta: t('acciones.eliminar'), icono: Trash2, destructiva: true, separadorAntes: true, onSelect: () => setEliminarAbierto(true), oculta: !permisos.anular || !acciones.has('eliminar') },
      ]
    : [];

  const puedeEnviar = permisos.crear && acciones.has('enviar');
  const puedeEditar = permisos.crear && acciones.has('editar');
  const botones = d ? (
    <div className="flex flex-wrap items-center gap-2">
      {puedeEditar && (
        <button type="button" onClick={() => router.push(`${RUTA}/${d.id}/editar`)} className={clasesBoton({ variante: eDian === 'rechazado' || eDian === 'error' ? 'primario' : 'secundario' })}>
          <Pencil aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {eDian === 'rechazado' || eDian === 'error' ? t('acciones.corregir') : t('acciones.editar')}
        </button>
      )}
      <button type="button" onClick={() => void descargarPdf()} disabled={descargando !== null} className={clasesBoton({ variante: 'secundario' })}>
        <Download aria-hidden="true" className="size-4" strokeWidth={1.5} />
        {t('acciones.descargarPdf')}
      </button>
      {puedeEnviar && (
        <button
          type="button"
          onClick={() => void enviar()}
          disabled={enviando}
          className={clasesBoton({ variante: eDian === 'rechazado' || eDian === 'error' ? 'secundario' : 'primario' })}
        >
          <Send aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {enviando ? t('envio.enviando') : eDian === 'sin_enviar' ? t('acciones.enviarDian') : t('acciones.reenviar')}
        </button>
      )}
      <RowActionsMenu acciones={menu} titulo={d.referencia} orientacion="horizontal" tamano="md" />
    </div>
  ) : null;

  const eslabones: EslabonDocumento[] = d
    ? [
        ...(datos?.compra
          ? [
              {
                id: `compra-${datos.compra.id}`,
                tipo: 'facturaCompra' as const,
                numero: datos.compra.numero || t('listado.compraSinNumero'),
                fecha: datos.compra.fecha ? formatPlain(datos.compra.fecha) : null,
                href: `/app/finanzas/facturas-compra/${datos.compra.id}`,
              },
            ]
          : []),
        { id: `ds-${d.id}`, tipo: 'documentoSoporte' as const, numero: d.numero ?? d.referencia, estado: BADGE_DIAN[eDian], fecha: d.fecha ? formatDate(d.fecha) : null, importe: fmt(d.total), actual: true },
      ]
    : [];

  const lineas: LineaDocumento[] = (datos?.lineas ?? []).map((l) => ({
    id: l.id,
    descripcion: l.descripcion,
    sku: l.codigo,
    nota: l.nota,
    cantidad: l.cantidad,
    precioUnitario: l.precioUnitario,
    descuento: l.descuento || null,
    impuestos: l.tarifa > 0 ? [{ nombre: t('detalle.impuesto'), tarifa: l.tarifa, incluido: d?.impuestosIncluidos ?? false }] : [],
    total: l.total,
  }));
  const impuestos = d ? impuestosDeLineasSoporte(datos?.lineas ?? [], d.impuestosIncluidos) : [];
  const prov = datos?.proveedor;

  return (
    <div className="flex flex-col gap-4 p-4 sm:gap-6 sm:p-6">
      <DocumentoCabecera
        tipo="documentoSoporte"
        titulo={titulo}
        subtitulo={d ? [prov?.nombre ?? t('listado.sinVendedor'), d.fecha ? formatDate(d.fecha) : null].filter(Boolean).join(' · ') : undefined}
        migas={[{ etiqueta: t('migas.finanzas'), href: '/app/finanzas' }, { etiqueta: t('migas.facturacion') }, { etiqueta: t('listado.titulo'), href: RUTA }, { etiqueta: d?.referencia ?? '…' }]}
        estado={d ? BADGE_DOCUMENTO[eDoc] : null}
        insignias={d ? <StatusBadge estado={BADGE_DIAN[eDian]} etiqueta={t(`estadoDian.${eDian}`)} tamano="md" /> : null}
        movil={{ accionesEnFila: true }}
        acciones={botones}
        cargando={cargando && !datos}
        debajo={eslabones.length > 1 ? <CadenaDocumento eslabones={eslabones} etiqueta={t('detalle.cadena')} /> : undefined}
      />

      {d && (eDian === 'rechazado' || eDian === 'error') && (d.error || envio?.error) && (
        <AvisoTonal
          tono="peligro"
          titulo={t(eDian === 'rechazado' ? 'detalle.avisoRechazo' : 'detalle.avisoError')}
          descripcion={envio?.error ?? d.error}
          accion={puedeEditar ? { etiqueta: t('acciones.corregir'), onClick: () => router.push(`${RUTA}/${d.id}/editar`) } : undefined}
        />
      )}
      {d && eDian === 'retenido' && envio?.retenido && <AvisoTonal tono="advertencia" titulo={t('detalle.avisoRetenido')} descripcion={envio.retenido} />}
      {d && d.deCompra && datos?.compra && (eDoc === 'borrador' || eDian === 'rechazado' || eDian === 'error') && (
        <AvisoTonal
          tono="informacion"
          titulo={t('detalle.avisoDeCompra', { compra: datos.compra.numero || t('listado.compraSinNumero') })}
          accion={{ etiqueta: t('detalle.verCompra'), href: `/app/finanzas/facturas-compra/${datos.compra.id}` }}
        />
      )}

      {d && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
          <div className="flex min-w-0 flex-col gap-4 lg:col-span-2 lg:gap-6">
            <Tarjeta titulo={t('detalle.vendedor')}>
              <ListaDatos>
                <FilaDato etiqueta={t('detalle.nombre')} valor={prov?.nombre ?? '—'} href={prov?.id ? `/app/inventario/proveedores/${prov.id}` : undefined} />
                <FilaDato etiqueta={t('detalle.documento')} valor={[t.has(`tiposDocumento.${prov?.tipoDocumento}`) ? t(`tiposDocumento.${prov?.tipoDocumento}` as never) : prov?.tipoDocumento, prov?.identificacion, prov?.dv ? `- ${prov.dv}` : null].filter(Boolean).join(' ') || '—'} />
                {prov?.direccion && <FilaDato etiqueta={t('detalle.direccion')} valor={prov.direccion} />}
                {prov?.correo && <FilaDato etiqueta={t('detalle.correo')} valor={prov.correo} />}
                {prov?.telefono && <FilaDato etiqueta={t('detalle.telefono')} valor={prov.telefono} />}
              </ListaDatos>
            </Tarjeta>

            <DocumentoLineas lineas={lineas} modo="lectura" moneda={ctxMoneda} etiqueta={t('detalle.lineas')} estado={cargando ? 'cargando' : 'listo'} />
            <DatosFiscalesLineas tipo="documento_soporte" id={id} />

            {d.observacion && (
              <Tarjeta titulo={t('detalle.observaciones')}>
                <p className="whitespace-pre-wrap text-sm text-fg-secondary">{d.observacion}</p>
              </Tarjeta>
            )}

            {previa && (
              <Tarjeta titulo={t('acciones.verAsiento')} icono={BookOpen}>
                <p className="mb-2 text-sm text-fg-secondary">{t('detalle.asientoAviso')}</p>
                <TablaVistaPrevia previa={previa} />
              </Tarjeta>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-4 lg:gap-6">
            <DocumentoTotales
              variante="compra"
              moneda={ctxMoneda}
              subtotal={d.subtotal}
              impuestos={impuestos.map((i) => ({ nombre: t('detalle.impuesto'), tarifa: i.tarifa, base: i.base, importe: i.importe }))}
              total={d.total}
              impuestosIncluidos={d.impuestosIncluidos}
              mostrarBases
              titulo={t('detalle.resumen')}
            />

            <Tarjeta titulo={t('detalle.dian.titulo')} accion={<StatusBadge estado={BADGE_DIAN[eDian]} etiqueta={t(`estadoDian.${eDian}`)} />}>
              <ListaDatos>
                {d.numero && <FilaDato etiqueta={t('detalle.dian.numero')} valor={d.numero} />}
                {d.validadoEn && <FilaDato etiqueta={t('detalle.dian.validado')} valor={formatDateTime(d.validadoEn)} />}
                {envio && <FilaDato etiqueta={t('detalle.dian.intentos')} valor={t('detalle.dian.intentosValor', { n: envio.intentos, max: envio.maxIntentos })} />}
                {envio?.proximoIntento && envio.estado === 'pending' && !envio.retenido && (
                  <FilaDato etiqueta={t('detalle.dian.proximo')} valor={formatDateTime(envio.proximoIntento)} />
                )}
              </ListaDatos>
              {d.cuds && (
                <div className="mt-3 rounded-md border border-line bg-subtle p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-fg-secondary">{t('detalle.dian.cuds')}</span>
                    <button
                      type="button"
                      onClick={() => void copiarCuds()}
                      aria-label={t('detalle.dian.copiarCuds')}
                      className="flex size-8 items-center justify-center rounded-md text-fg-secondary hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      <Copy aria-hidden="true" className="size-4" strokeWidth={1.5} />
                    </button>
                  </div>
                  <p className="mt-1 break-all font-mono text-xs text-fg-secondary">{d.cuds}</p>
                </div>
              )}
              {!envio && eDian === 'sin_enviar' && <p className="mt-3 text-sm text-fg-secondary">{t('detalle.dian.sinEnviar')}</p>}
              {envio && envio.eventos.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-xs font-medium text-fg-secondary">{t('detalle.dian.historial')}</p>
                  <ol className="flex flex-col gap-3 border-l border-line pl-4">
                    {envio.eventos.map((ev, i) => (
                      <li key={`${ev.fecha}-${i}`} className="relative">
                        <span aria-hidden="true" className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-fg-muted" />
                        <p className="text-sm font-medium text-fg">{t.has(`eventos.${ev.tipo}`) ? t(`eventos.${ev.tipo}` as never) : t('eventos.otro')}</p>
                        {ev.mensaje && EVENTOS_CON_MENSAJE.has(ev.tipo) && <p className="text-xs text-fg-secondary">{ev.mensaje}</p>}
                        <p className="text-xs text-fg-muted">{formatDateTime(ev.fecha)}</p>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              {acciones.has('xml') && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => void descargarXml()} disabled={descargando !== null} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
                    <FileCode aria-hidden="true" className="size-4" strokeWidth={1.5} />
                    {t('acciones.xml')}
                  </button>
                </div>
              )}
            </Tarjeta>

            <Tarjeta titulo={t('detalle.datos')}>
              <ListaDatos>
                {d.sucursal && <FilaDato etiqueta={t('detalle.sucursal')} valor={d.sucursal} />}
                <FilaDato etiqueta={t('detalle.formaPago')} valor={t(d.formaPago === '2' ? 'formasPago.credito' : 'formasPago.contado')} />
                {d.medioPago && <FilaDato etiqueta={t('detalle.medioPago')} valor={nombreMedioPago(d.medioPago, (k) => (t.has(`medios.${k}`) ? t(`medios.${k}` as never) : null))} />}
                {d.vence && <FilaDato etiqueta={t('detalle.vence')} valor={formatPlain(d.vence)} />}
                <FilaDato etiqueta={t('detalle.moneda')} valor={ctxMoneda.code} />
                <FilaDato etiqueta={t('detalle.creado')} valor={formatDateTime(d.creadoEn)} />
              </ListaDatos>
            </Tarjeta>
          </div>
        </div>
      )}

      <ConfirmDialog
        abierto={eliminarAbierto}
        onAbiertoChange={(v) => !eliminando && setEliminarAbierto(v)}
        titulo={t('eliminar.titulo', { referencia: d?.referencia ?? '' })}
        descripcion={d && eliminarEnProveedorPrimero(d.estado) ? t('eliminar.descripcionProveedor') : t('eliminar.descripcion')}
        textoConfirmar={t('eliminar.confirmar')}
        textoCancelar={t('acciones.cancelar')}
        tono="peligro"
        icono={Trash2}
        cargando={eliminando}
        onConfirmar={eliminar}
      />
    </div>
  );
}
