'use client';

/**
 * Detalle de un envío a la DIAN en panel lateral (hoja en móvil), sin ruta
 * propia: `?envio=<id>` en la bandeja. Figma `1019:89805` (retenido) y
 * `1019:89915` (rechazado); capturas `73-documentos-envio-*`.
 *
 * «Qué pasó» (línea de tiempo), la respuesta de la DIAN en lenguaje humano,
 * «Qué hacer» y UNA acción según el estado. Los detalles técnicos (código y
 * mensaje, nunca el JSON) solo llegan del servidor con `finance.approve`.
 * Sustituye `JobDetailDialog`, que pintaba `request_payload` y
 * `response_payload` crudos.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Ban, Check, CircleAlert, CircleX, Clock, Copy, Download, FileDown, RefreshCw, Send, Undo2, UserPen, Wrench } from 'lucide-react';
import { EmptyState, FilaDato, ListaDatos, PanelAdaptable, SeccionPlegable, StatusBadge, Tarjeta, clasesBoton } from '@/components/kit';
import { AvisoTonal } from '@/components/kit/AvisoTonal';
import { ICONO_DOCUMENTO } from '@/components/kit/documento/documentos';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { Skeleton } from '@/components/ui/skeleton';
import { toastSuccess } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { crearFormateadorMoneda } from '@/lib/utils/moneda';
import { TONO_ESTADO, accionesEnvio, estadoEnvio, respuestaVisible, type FilaEnvio, type PasoLinea, type PermisosBandeja, type TipoPaso } from '@/lib/finanzas/facturacionElectronica/bandejaLogica';
import { TIPO_CHIP, pedirDetalle, rutaDocumento, rutaTercero, type RespuestaDetalle } from './bandejaCliente';

const ICONO_PASO: Record<TipoPaso, typeof Check> = {
  creado: Check,
  retenido: Clock,
  enviado: Send,
  aceptado: Check,
  rechazado: CircleX,
  error: CircleAlert,
  reintento: RefreshCw,
  liberado: Undo2,
  cancelado: Ban,
  pendiente: Send,
};

const TONO_PASO: Record<TipoPaso, string> = {
  creado: 'bg-success-subtle text-success-text',
  retenido: 'bg-warning-subtle text-warning-text',
  enviado: 'bg-subtle text-fg-secondary',
  aceptado: 'bg-success-subtle text-success-text',
  rechazado: 'bg-danger-subtle text-danger-text',
  error: 'bg-danger-subtle text-danger-text',
  reintento: 'bg-subtle text-fg-secondary',
  liberado: 'bg-subtle text-fg-secondary',
  cancelado: 'bg-subtle text-fg-secondary',
  pendiente: 'bg-subtle text-fg-muted',
};

export interface DetalleEnvioPanelProps {
  id: string;
  onCerrar: () => void;
  servicioActivo: boolean;
  permisos: PermisosBandeja;
  onEnviarHoy: (f: FilaEnvio) => void;
  onCancelarEnvio: (f: FilaEnvio) => void;
  onReintentar: (f: FilaEnvio) => void;
  onDescargar: (f: FilaEnvio, tipo: 'pdf' | 'xml') => void;
  ocupado: string | null;
}

export function DetalleEnvioPanel({ id, onCerrar, servicioActivo, permisos, onEnviarHoy, onCancelarEnvio, onReintentar, onDescargar, ocupado }: DetalleEnvioPanelProps) {
  const t = useTranslations('finanzasDocumentosR3.bandeja');
  const entero = useFormatoEntero();
  const moneda = useMonedaOrganizacion();
  const { formatDate, formatDateTime, formatTime, getToday } = useFormatDate();
  const [datos, setDatos] = useState<RespuestaDetalle | null>(null);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'noEncontrado' | 'error'>('cargando');
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let cancelado = false;
    setEstado('cargando');
    pedirDetalle(id)
      .then((r) => {
        if (cancelado) return;
        setDatos(r);
        setEstado('listo');
      })
      .catch((e: { status?: number }) => !cancelado && setEstado(e?.status === 404 ? 'noEncontrado' : 'error'));
    return () => {
      cancelado = true;
    };
  }, [id, intento]);

  const f = datos?.fila ?? null;
  const e = f ? estadoEnvio(f) : null;
  const a = f ? accionesEnvio(f, permisos, servicioActivo) : null;
  const total = f?.total != null ? crearFormateadorMoneda(moneda.paraDocumento(f.moneda))(f.tipo === 'credit_note' ? -Math.abs(f.total) : f.total) : null;
  const hoy = formatDate(getToday());
  const docHref = f ? rutaDocumento(f) : null;
  const terceroHref = f ? rutaTercero(f) : null;

  const titulo = f ? `${f.numero ?? t('sinNumero')} · ${t(`tipos.${f.tipo}`)}` : t('detalle.cargando');
  const descripcion = f ? (
    <span className="flex flex-wrap items-center gap-2">
      <StatusBadge estado={e} tono={TONO_ESTADO[e!]} etiqueta={t(`estados.${e}`)} />
      <span>
        {[f.tercero, f.terceroDoc, total, f.fechaDocumento ? t('detalle.documentoDel', { fecha: formatDate(f.fechaDocumento) }) : null].filter(Boolean).join(' · ')}
      </span>
    </span>
  ) : undefined;

  const textoPaso = (p: PasoLinea): { titulo: string; detalle: string | null } => {
    switch (p.tipo) {
      case 'creado':
        return { titulo: t('linea.creado'), detalle: null };
      case 'retenido':
        return { titulo: t('linea.retenido'), detalle: t('linea.retenidoDetalle') };
      case 'enviado':
        return { titulo: t('linea.enviado'), detalle: f && f.intentos > 0 ? t('intentos.de', { n: entero(f.intentos), max: entero(f.maxIntentos), count: f.intentos }) : null };
      case 'aceptado':
        return { titulo: t('linea.aceptado'), detalle: f?.numeroDian ? t('linea.aceptadoDetalle', { numero: f.numeroDian }) : null };
      case 'rechazado':
        return { titulo: t('linea.rechazado'), detalle: p.detalle ?? (f ? respuestaVisible(f).texto : null) ?? t('respuesta.rechazo') };
      case 'error':
        return { titulo: t('linea.error'), detalle: f ? respuestaVisible(f).texto ?? t(`respuesta.${respuestaVisible(f).clave}`) : null };
      case 'reintento':
        return { titulo: t('linea.reintentoManual'), detalle: null };
      case 'liberado':
        return { titulo: t('linea.liberado'), detalle: t('linea.liberadoDetalle') };
      case 'cancelado':
        return { titulo: t('linea.cancelado'), detalle: null };
      case 'pendiente':
        if (e === 'retenido') return { titulo: t('linea.envioDian'), detalle: t('linea.esperaConfirmacion') };
        if (e === 'reintento') return { titulo: t('linea.proximoIntento'), detalle: p.fecha ? t('paso.reintentoA', { hora: formatTime(p.fecha) }) : t('paso.reintentoPronto') };
        if (e === 'en_cola') return { titulo: t('linea.envioDian'), detalle: t('paso.envio_pronto') };
        return { titulo: t('linea.respuestaDian'), detalle: t('paso.esperando') };
    }
  };

  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      toastSuccess(t('detalle.copiado'));
    } catch {
      /* el navegador no dejó copiar: el código sigue visible */
    }
  };

  let pie: React.ReactNode = null;
  if (f && a && e === 'retenido') {
    pie = (
      <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {a.cancelar && (
          <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => onCancelarEnvio(f)} disabled={ocupado !== null}>
            <Ban aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('detalle.cancelarEnvio')}
          </button>
        )}
        <button
          type="button"
          className={clasesBoton({ variante: 'primario' })}
          onClick={() => onEnviarHoy(f)}
          disabled={!a.enviarHoy || ocupado !== null}
          title={a.motivoEnviarHoy ? t(`motivos.${a.motivoEnviarHoy}`) : undefined}
        >
          <Send aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('detalle.enviarHoy')}
        </button>
      </div>
    );
  } else if (f && a && (e === 'rechazado' || e === 'error' || e === 'cancelado')) {
    pie = (
      <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {e === 'rechazado' && (terceroHref ?? docHref) && (
          <Link href={(terceroHref ?? docHref)!} className={clasesBoton({ variante: 'secundario' })}>
            <UserPen aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {f.tipo === 'support_document' ? t('detalle.corregirProveedor') : t('detalle.corregirCliente')}
          </Link>
        )}
        {a.reintentar && (
          <button type="button" className={clasesBoton({ variante: 'primario' })} onClick={() => onReintentar(f)} disabled={ocupado !== null}>
            <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {e === 'rechazado' ? t('detalle.reenviar') : t('detalle.reintentar')}
          </button>
        )}
      </div>
    );
  } else if (f && docHref) {
    pie = (
      <div className="flex w-full justify-end">
        <Link href={docHref} className={clasesBoton({ variante: 'secundario' })}>
          {t('acciones.verDocumento')}
        </Link>
      </div>
    );
  }

  return (
    <PanelAdaptable
      abierto
      onAbiertoChange={(v) => !v && onCerrar()}
      titulo={titulo}
      descripcion={descripcion}
      icono={f ? ICONO_DOCUMENTO[TIPO_CHIP[f.tipo]] : undefined}
      ancho={672}
      pie={pie}
    >
      {estado === 'cargando' && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}
      {estado === 'noEncontrado' && <EmptyState variante="empty" titulo={t('detalle.noEncontrado')} compacto />}
      {estado === 'error' && <EmptyState variante="error" titulo={t('detalle.error')} onReintentar={() => setIntento((n) => n + 1)} compacto />}

      {estado === 'listo' && f && datos && (
        <div className="flex flex-col gap-4">
          <Tarjeta titulo={t('detalle.quePaso')}>
            <ol className="flex flex-col gap-4">
              {datos.pasos.map((p, i) => {
                const Icono = ICONO_PASO[p.tipo];
                const tx = textoPaso(p);
                return (
                  <li key={`${p.tipo}-${i}`} className="flex gap-3">
                    <span className={`flex size-6 shrink-0 items-center justify-center rounded-full ${TONO_PASO[p.tipo]}`} aria-hidden="true">
                      <Icono className="size-3.5" strokeWidth={2} />
                    </span>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className={p.pendiente ? 'text-sm font-medium text-fg-secondary' : 'text-sm font-medium text-fg'}>{tx.titulo}</span>
                      {tx.detalle && <span className="text-sm text-fg-secondary">{tx.detalle}</span>}
                      {!p.pendiente && p.fecha && <span className="text-xs text-fg-muted">{formatDateTime(p.fecha)}</span>}
                    </div>
                  </li>
                );
              })}
            </ol>
          </Tarjeta>

          {e === 'retenido' && (
            <AvisoTonal
              tono="advertencia"
              titulo={t('detalle.retenidoAvisoTitulo', { fecha: hoy })}
              descripcion={servicioActivo ? t('detalle.retenidoAvisoDescripcion') : t('detalle.retenidoAvisoPendiente')}
            />
          )}

          {e === 'rechazado' && (
            <Tarjeta titulo={t('detalle.queHacer')}>
              <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-fg">
                <li>{f.tipo === 'support_document' ? t('detalle.queHacerProveedor') : t('detalle.queHacerCliente')}</li>
                <li>{t('detalle.queHacerReenviar')}</li>
              </ol>
            </Tarjeta>
          )}

          {e === 'error' && (
            <Tarjeta titulo={t('detalle.queHacer')}>
              <p className="text-sm text-fg">{t('detalle.queHacerError')}</p>
            </Tarjeta>
          )}

          {e === 'aceptado' && (
            <Tarjeta
              titulo={t('detalle.documentoAceptado')}
              accion={
                a?.descargar ? (
                  <div className="flex gap-2">
                    <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => onDescargar(f, 'pdf')}>
                      <FileDown aria-hidden="true" className="size-4" strokeWidth={1.5} />
                      {t('detalle.pdfOficial')}
                    </button>
                    <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => onDescargar(f, 'xml')}>
                      <Download aria-hidden="true" className="size-4" strokeWidth={1.5} />
                      {t('detalle.xml')}
                    </button>
                  </div>
                ) : undefined
              }
            >
              <ListaDatos>
                <FilaDato etiqueta={t('detalle.numeroDian')} valor={f.numeroDian ?? f.numero ?? '—'} />
                {f.codigoUnico && (
                  <FilaDato
                    etiqueta={t('detalle.codigoUnico')}
                    valor={<span className="break-all font-mono text-xs">{f.codigoUnico}</span>}
                    accesorio={
                      <button type="button" aria-label={t('detalle.copiar')} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })} onClick={() => void copiar(f.codigoUnico!)}>
                        <Copy aria-hidden="true" className="size-4" strokeWidth={1.5} />
                      </button>
                    }
                  />
                )}
                {f.procesado && <FilaDato etiqueta={t('detalle.validado')} valor={formatDateTime(f.procesado)} />}
              </ListaDatos>
              {f.mensajesDian.length > 0 && (
                <div className="mt-3 flex flex-col gap-1">
                  <span className="text-xs font-medium text-fg-secondary">{t('detalle.notificaciones')}</span>
                  <ul className="list-disc pl-5 text-xs text-fg-secondary">
                    {f.mensajesDian.map((m, i) => (
                      <li key={i}>{m}</li>
                    ))}
                  </ul>
                </div>
              )}
            </Tarjeta>
          )}

          {datos.tecnico && (datos.tecnico.codigo || datos.tecnico.mensaje) && (
            <SeccionPlegable titulo={t('detalle.tecnicos')} icono={Wrench} resumen={datos.tecnico.codigo ? t('detalle.codigo', { codigo: datos.tecnico.codigo }) : undefined}>
              <ListaDatos>
                {datos.tecnico.codigo && <FilaDato etiqueta={t('detalle.codigoTecnico')} valor={<span className="font-mono text-xs">{datos.tecnico.codigo}</span>} />}
                {datos.tecnico.mensaje && <FilaDato etiqueta={t('detalle.mensajeTecnico')} valor={<span className="break-words text-xs">{datos.tecnico.mensaje}</span>} />}
                <FilaDato etiqueta={t('detalle.intentos')} valor={t('intentos.de', { n: entero(f.intentos), max: entero(f.maxIntentos), count: f.intentos })} />
              </ListaDatos>
            </SeccionPlegable>
          )}
        </div>
      )}
    </PanelAdaptable>
  );
}
