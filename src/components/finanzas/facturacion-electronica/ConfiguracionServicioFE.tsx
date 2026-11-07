'use client';

/**
 * Facturación electrónica como servicio de GO Admin, lado del cliente.
 * Configuración › Facturación electrónica › Servicio (la ruta vieja
 * `/app/finanzas/facturacion-electronica/configuracion` redirige aquí).
 * Figma `07 Finanzas` › Documentos v2: pendiente de activación `1018:89805`,
 * activo `1018:90636`, móvil `1019:90757`; capturas `73-documentos-fe-servicio-*`.
 *
 * GO Admin presta el servicio: las credenciales del proveedor las carga el
 * equipo de la plataforma (go-admin-super) y viven cifradas; el cliente NUNCA
 * las ve, ni el ambiente. Aquí ve el estado, los pasos para activar con quién
 * hace cada uno, sus resoluciones, la cola y los documentos retenidos, y elige
 * «Facturar siempre como electrónica» (antes repetido en el resumen de
 * Configuración, que ahora solo enlaza aquí).
 *
 * Acciones que se conservan (mismas rutas): verificar la cuenta, sincronizar
 * rangos por sucursal y enviar un retenido con la fecha de hoy
 * (`POST /api/factus/config`). Nuevo: cancelar un retenido
 * (`DELETE /api/factus/jobs`, `finance.void`). «Solicitar activación» no tiene
 * servidor todavía (migración propuesta `einvoicing_activation_requests`): el
 * botón se ve deshabilitado con su motivo.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Ban, Check, Clock, FileText, Inbox, Loader2, RefreshCw, Send, Zap } from 'lucide-react';
import { EmptyState, FilaDato, ListaDatos, PageHeader, StatusBadge, Tarjeta, clasesBoton } from '@/components/kit';
import { AvisoTonal } from '@/components/kit/AvisoTonal';
import { BarraProgreso } from '@/components/kit/BarraProgreso';
import { ConfirmDialog } from '@/components/kit/ConfirmDialog';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { rutaSeccion } from '@/components/configuracion/config/configSectionsRegistry';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { useElectronicInvoicePreference } from '@/lib/hooks/useElectronicInvoicePreference';
import { usePermisosFinanzas } from '@/lib/finanzas/usePermisosFinanzas';
import { crearFormateadorMoneda } from '@/lib/utils/moneda';
import { consumoRango, leerRango, ordenarRangos, TONO_RANGO, type RangoNumeracion } from '@/lib/finanzas/facturacionElectronica/resolucionesLogica';
import { pasosActivacion, pasosListos, puedeSolicitarActivacion, type CampoEmisor, type EstadoServicio } from '@/lib/finanzas/facturacionElectronica/servicioLogica';
import { cancelarEnvio, ErrorPeticion, pedirJson } from './bandeja/bandejaCliente';

const RUTA_BANDEJA = '/app/finanzas/facturacion-electronica';
const RUTA_ORGANIZACION = '/app/organizacion/informacion';
const RETENIDOS_VISIBLES = 5;

type Uno<T> = T | T[] | null;
function uno<T>(v: Uno<T> | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

interface RespuestaConfig {
  service: {
    status: EstadoServicio;
    hasCredentials: boolean;
    activatedAt: string | null;
    companyNit: string | null;
    lastCheck: { at: string; ok: boolean | null; message: string | null } | null;
  };
  ranges: Array<RangoNumeracion & { branch: Uno<{ name: string }> }>;
  queue: Record<string, number>;
  held: Array<{
    id: string;
    document_type: string;
    created_at: string;
    invoice: Uno<{ number: string | null; total: number | null; currency: string | null; issue_date: string | null; customer: Uno<{ full_name: string | null; company_name: string | null }> }>;
    support_document: Uno<{ number: string | null; reference_code: string | null; total: number | null; currency: string | null; issue_date: string | null }>;
  }>;
  emisor?: { faltan: CampoEmisor[]; nit: string | null; dv: number | string | null; razonSocial: string | null; correo: string | null };
}
type Retenido = RespuestaConfig['held'][number];

interface Props {
  /** Dentro de Configuración (donde vive): la cabecera la pone Configuración. */
  incrustado?: boolean;
}

export default function ConfiguracionServicioFE({ incrustado = false }: Props = {}) {
  const t = useTranslations('finanzasDocumentosR3.servicio');
  const permisos = usePermisosFinanzas();
  const moneda = useMonedaOrganizacion();
  const entero = useFormatoEntero();
  const { branches } = useBranch();
  const { formatDate, formatDateTime, getToday } = useFormatDate();
  const hoy = getToday();
  const preferencia = useElectronicInvoicePreference();

  const [datos, setDatos] = useState<RespuestaConfig | null>(null);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error' | 'sinPermiso'>('cargando');
  const [accion, setAccion] = useState<string | null>(null);
  const [sucursal, setSucursal] = useState<string>('');
  const [aLiberar, setALiberar] = useState<Retenido | null>(null);
  const [aCancelar, setACancelar] = useState<Retenido | null>(null);
  const [guardandoPreferencia, setGuardandoPreferencia] = useState(false);

  const cargar = useCallback(async () => {
    setEstado((e) => (e === 'listo' ? e : 'cargando'));
    try {
      setDatos(await pedirJson<RespuestaConfig>('/api/factus/config'));
      setEstado('listo');
    } catch (e) {
      setEstado(e instanceof ErrorPeticion && (e.status === 401 || e.status === 403) ? 'sinPermiso' : 'error');
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const enviar = useCallback(
    async (cuerpo: Record<string, unknown>, clave: string): Promise<Record<string, unknown> | null> => {
      setAccion(clave);
      try {
        return await pedirJson<Record<string, unknown>>('/api/factus/config', { method: 'POST', body: JSON.stringify(cuerpo) });
      } catch (e) {
        toastError(e instanceof ErrorPeticion && e.status === 403 ? t('errores.sinPermiso') : t('errores.accion'), e instanceof ErrorPeticion && e.status !== 403 ? e.message : undefined);
        return null;
      } finally {
        setAccion(null);
      }
    },
    [t],
  );

  const verificar = async () => {
    const r = await enviar({ action: 'verificar' }, 'verificar');
    if (r) toastSuccess(r.activado ? t('verificacion.activado') : t('verificacion.ok'), typeof r.mensaje === 'string' ? r.mensaje : undefined);
    await cargar();
  };

  const sincronizar = async () => {
    if (!sucursal) return;
    const r = await enviar({ action: 'sincronizar_rangos', branchId: Number(sucursal) }, 'sincronizar');
    if (r) toastSuccess(t('resoluciones.sincronizadas'), t('resoluciones.resumenSincronizacion', { importados: Number(r.importados ?? 0), desactivados: Number(r.desactivados ?? 0) }));
    await cargar();
  };

  const liberar = async () => {
    if (!aLiberar) return;
    const r = await enviar({ action: 'liberar', jobId: aLiberar.id }, `liberar:${aLiberar.id}`);
    setALiberar(null);
    if (r) toastSuccess(t('retenidos.enviado'));
    await cargar();
  };

  const cancelar = async () => {
    if (!aCancelar) return;
    setAccion(`cancelar:${aCancelar.id}`);
    try {
      await cancelarEnvio(aCancelar.id);
      toastSuccess(t('retenidos.cancelado'));
    } catch {
      toastError(t('errores.accion'));
    } finally {
      setAccion(null);
      setACancelar(null);
      await cargar();
    }
  };

  const cambiarPreferencia = async (activo: boolean) => {
    setGuardandoPreferencia(true);
    const r = await preferencia.savePreference(activo);
    setGuardandoPreferencia(false);
    if (r.success) toastSuccess(activo ? t('comportamiento.siempreActivada') : t('comportamiento.siempreDesactivada'));
    else toastError(t('errores.accion'));
  };

  const servicio = datos?.service;
  const activo = servicio?.status === 'active';
  const rangos = useMemo(() => ordenarRangos(datos?.ranges ?? []), [datos]);
  const pasos = useMemo(
    () =>
      pasosActivacion({
        faltanEmisor: datos?.emisor?.faltan ?? [],
        tieneResolucionFactura: (datos?.ranges ?? []).some((r) => r.document_type === 'invoice' && r.is_active && !!r.resolution_number),
        cuentaHabilitada: !!servicio?.hasCredentials,
        aceptados: datos?.queue.accepted ?? 0,
      }),
    [datos, servicio],
  );
  const cola = datos?.queue ?? {};
  const retenidos = datos?.held ?? [];

  const acciones = (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={RUTA_BANDEJA} className={clasesBoton({ variante: 'secundario' })}>
        <Inbox aria-hidden="true" className="size-4" strokeWidth={1.5} />
        {t('acciones.verBandeja')}
      </Link>
      {activo ? (
        servicio?.hasCredentials && (
          <button type="button" className={clasesBoton({ variante: 'primario' })} onClick={() => void verificar()} disabled={accion !== null || !permisos.aprobar} title={!permisos.aprobar ? t('motivos.sinPermiso') : undefined}>
            {accion === 'verificar' ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.5} />}
            {t('acciones.verificar')}
          </button>
        )
      ) : (
        <>
          {servicio?.hasCredentials && (
            <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => void verificar()} disabled={accion !== null || !permisos.aprobar} title={!permisos.aprobar ? t('motivos.sinPermiso') : undefined}>
              {accion === 'verificar' ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.5} />}
              {t('acciones.verificar')}
            </button>
          )}
          <button type="button" className={clasesBoton({ variante: 'primario' })} disabled title={t('motivos.solicitudPendiente')} aria-describedby="fe-solicitud-motivo">
            <Send aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('acciones.solicitarActivacion')}
          </button>
          <span id="fe-solicitud-motivo" className="sr-only">
            {t('motivos.solicitudPendiente')}
          </span>
        </>
      )}
    </div>
  );

  if (estado === 'sinPermiso') return <EmptyState variante="forbidden" titulo={t('errores.sinPermiso')} descripcion={t('errores.sinPermisoDescripcion')} />;
  if (estado === 'error' && !datos) return <EmptyState variante="error" titulo={t('errores.carga')} onReintentar={() => void cargar()} />;

  const tonoServicio = activo ? 'exito' : servicio?.status === 'suspended' ? 'peligro' : 'advertencia';
  const subtitulo = activo
    ? t('subtitulo.activo', { fecha: servicio?.activatedAt ? formatDate(servicio.activatedAt) : '—' })
    : t('subtitulo.pendiente');

  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      {incrustado ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-fg-secondary">{estado === 'cargando' ? <Skeleton className="h-4 w-64" /> : subtitulo}</div>
          {acciones}
        </div>
      ) : (
        <PageHeader
          titulo={t('titulo')}
          subtitulo={subtitulo}
          icono={Zap}
          variante="form"
          volverA={RUTA_BANDEJA}
          migas={[
            { etiqueta: t('migas.finanzas'), href: '/app/finanzas' },
            { etiqueta: t('migas.facturacion'), href: RUTA_BANDEJA },
            { etiqueta: t('migas.servicio') },
          ]}
          acciones={acciones}
          cargando={estado === 'cargando'}
        />
      )}

      {servicio && !activo && (
        <AvisoTonal
          tono={servicio.status === 'suspended' ? 'peligro' : 'advertencia'}
          titulo={servicio.status === 'suspended' ? t('avisos.suspendidoTitulo') : t('avisos.pendienteTitulo')}
          descripcion={servicio.status === 'suspended' ? t('avisos.suspendidoDescripcion') : t('avisos.pendienteDescripcion')}
        />
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2 lg:gap-6">
          {estado === 'cargando' && !datos && <Skeleton className="h-64 w-full" />}

          {servicio && !activo && (
            <Tarjeta titulo={t('pasos.titulo')} accion={<StatusBadge estado="pasos" tono="advertencia" etiqueta={t('pasos.listos', { n: entero(pasosListos(pasos)), total: entero(pasos.length) })} />}>
              <ol className="flex flex-col divide-y divide-line">
                {pasos.map((p, i) => (
                  <li key={p.id} className="flex flex-col gap-2 py-3 first:pt-0 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex gap-3">
                      <span
                        aria-hidden="true"
                        className={
                          p.estado === 'listo'
                            ? 'flex size-6 shrink-0 items-center justify-center rounded-full bg-success-subtle text-success-text'
                            : p.estado === 'actual'
                              ? 'flex size-6 shrink-0 items-center justify-center rounded-full bg-warning-subtle text-warning-text'
                              : 'flex size-6 shrink-0 items-center justify-center rounded-full bg-subtle text-xs text-fg-muted'
                        }
                      >
                        {p.estado === 'listo' ? <Check className="size-3.5" strokeWidth={2} /> : p.estado === 'actual' ? <Clock className="size-3.5" strokeWidth={2} /> : i + 1}
                      </span>
                      <div className="flex min-w-0 flex-col gap-1">
                        <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-fg">
                          {t(`pasos.${p.id}.titulo`)}
                          <StatusBadge estado={p.quien} tono={p.quien === 'tu' ? 'informacion' : 'neutro'} etiqueta={t(`pasos.quien.${p.quien}`)} />
                          <span className="sr-only">{t(`pasos.estado.${p.estado}`)}</span>
                        </span>
                        <span className="text-sm text-fg-secondary">
                          {p.id === 'emisor' && p.estado !== 'listo' && (datos?.emisor?.faltan.length ?? 0) > 0
                            ? t('pasos.emisor.faltan', { campos: (datos?.emisor?.faltan ?? []).map((c) => t(`pasos.campos.${c}`)).join(', ') })
                            : p.id === 'emisor' && datos?.emisor
                              ? [datos.emisor.nit ? `NIT ${datos.emisor.nit}${datos.emisor.dv !== null && datos.emisor.dv !== '' ? `-${datos.emisor.dv}` : ''}` : null, datos.emisor.razonSocial, datos.emisor.correo].filter(Boolean).join(' · ')
                              : t(`pasos.${p.id}.descripcion`)}
                        </span>
                      </div>
                    </div>
                    {p.id === 'emisor' && (
                      <Link href={RUTA_ORGANIZACION} className={clasesBoton({ variante: 'fantasma', tamano: 'sm', className: 'shrink-0 self-start' })}>
                        {t('pasos.emisor.accion')}
                      </Link>
                    )}
                    {p.id === 'resolucion' && (
                      <Link href={rutaSeccion('facturacion.resumen')} className={clasesBoton({ variante: 'fantasma', tamano: 'sm', className: 'shrink-0 self-start' })}>
                        {t('pasos.resolucion.accion')}
                      </Link>
                    )}
                  </li>
                ))}
              </ol>
              <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3 sm:flex-row sm:items-center">
                <button type="button" className={clasesBoton({ variante: 'primario' })} disabled title={t('motivos.solicitudPendiente')}>
                  <Send aria-hidden="true" className="size-4" strokeWidth={1.5} />
                  {t('acciones.solicitarActivacion')}
                </button>
                <p className="text-xs text-fg-muted">
                  {puedeSolicitarActivacion(pasos) ? t('pasos.solicitudListos') : t('pasos.solicitudAyuda')} {t('motivos.solicitudPendiente')}
                </p>
              </div>
            </Tarjeta>
          )}

          {servicio && activo && (
            <Tarjeta
              titulo={t('resoluciones.titulo')}
              descripcion={t('resoluciones.descripcion')}
              accion={
                permisos.aprobar ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={sucursal} onValueChange={setSucursal}>
                      <SelectTrigger className="h-8 w-44" aria-label={t('resoluciones.sucursal')}>
                        <SelectValue placeholder={t('resoluciones.sucursal')} />
                      </SelectTrigger>
                      <SelectContent>
                        {branches.map((b) => (
                          <SelectItem key={b.id} value={String(b.id)}>
                            {b.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => void sincronizar()} disabled={!sucursal || accion !== null} title={!sucursal ? t('motivos.eligeSucursal') : undefined}>
                      {accion === 'sincronizar' ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.5} />}
                      {t('resoluciones.sincronizar')}
                    </button>
                  </div>
                ) : undefined
              }
              pie={
                <Link href={rutaSeccion('facturacion.resumen')} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
                  <FileText aria-hidden="true" className="size-4" strokeWidth={1.5} />
                  {t('resoluciones.verTodas')}
                </Link>
              }
            >
              {rangos.filter((r) => r.is_active).length === 0 ? (
                <p className="text-sm text-fg-secondary">{t('resoluciones.vacio')}</p>
              ) : (
                <ul className="flex flex-col divide-y divide-line">
                  {rangos
                    .filter((r) => r.is_active)
                    .map((r) => {
                      const lectura = leerRango(r, hoy);
                      const consumo = consumoRango(r);
                      const tono = TONO_RANGO[lectura.estado];
                      return (
                        <li key={r.id} className="grid grid-cols-1 gap-2 py-3 first:pt-0 sm:grid-cols-[1.4fr_0.5fr_1.2fr_1.4fr] sm:items-center sm:gap-4">
                          <div className="flex min-w-0 flex-col">
                            <span className="truncate text-sm font-medium text-fg">{t(`tipos.${r.document_type}`)}</span>
                            <span className="truncate text-xs text-fg-muted">{uno(r.branch)?.name ?? t('resoluciones.todasSucursales')}</span>
                          </div>
                          <span className="font-mono text-sm text-fg">{r.prefix}</span>
                          <div className="flex min-w-0 flex-col">
                            <span className="truncate text-sm text-fg">{r.resolution_number || t('resoluciones.numeracionPropia')}</span>
                            {r.resolution_date && <span className="text-xs text-fg-muted">{t('resoluciones.del', { fecha: formatDate(r.resolution_date) })}</span>}
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="flex justify-between text-xs text-fg-secondary">
                              <span>{t('resoluciones.consumo')}</span>
                              <span className="tabular-nums">{t('resoluciones.usadosDe', { usados: entero(consumo.usados), total: entero(consumo.total) })}</span>
                            </span>
                            <BarraProgreso
                              valor={consumo.usados}
                              max={Math.max(1, consumo.total)}
                              etiqueta={t('resoluciones.consumoDe', { prefijo: r.prefix ?? '' })}
                              textoValor={t('resoluciones.usadosDe', { usados: entero(consumo.usados), total: entero(consumo.total) })}
                              tono={tono === 'peligro' ? 'peligro' : tono === 'advertencia' ? 'advertencia' : 'marca'}
                              tamano="sm"
                            />
                          </div>
                        </li>
                      );
                    })}
                </ul>
              )}
            </Tarjeta>
          )}

          {servicio && activo && (
            <Tarjeta
              titulo={t('cola.titulo')}
              pie={
                <Link href={RUTA_BANDEJA} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
                  <Inbox aria-hidden="true" className="size-4" strokeWidth={1.5} />
                  {t('cola.abrirBandeja')}
                </Link>
              }
            >
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                  { k: 'enCola', v: (cola.pending ?? 0) + (cola.processing ?? 0) + (cola.sent ?? 0), tono: 'text-fg' },
                  { k: 'retenidos', v: cola.held ?? 0, tono: (cola.held ?? 0) > 0 ? 'text-warning-text' : 'text-fg' },
                  { k: 'aceptados', v: cola.accepted ?? 0, tono: 'text-success-text' },
                  { k: 'rechazados', v: (cola.rejected ?? 0) + (cola.failed ?? 0), tono: (cola.rejected ?? 0) + (cola.failed ?? 0) > 0 ? 'text-danger-text' : 'text-fg' },
                ].map((x) => (
                  <div key={x.k} className="flex flex-col gap-1">
                    <dt className="text-xs text-fg-secondary">{t(`cola.${x.k}`)}</dt>
                    <dd className={`text-lg font-semibold tabular-nums ${x.tono}`}>{entero(Math.max(0, x.v))}</dd>
                  </div>
                ))}
              </dl>
            </Tarjeta>
          )}

          {retenidos.length > 0 && (
            <Tarjeta
              titulo={t('retenidos.titulo', { n: entero(cola.held ?? retenidos.length) })}
              descripcion={activo ? t('retenidos.descripcionActivo') : t('retenidos.descripcionPendiente')}
              sinRelleno
              pie={
                <Link href={`${RUTA_BANDEJA}?vista=atender&estado=retenido`} className="text-sm font-medium text-brand hover:underline">
                  {retenidos.length > RETENIDOS_VISIBLES
                    ? t('retenidos.yMas', { n: entero((cola.held ?? retenidos.length) - RETENIDOS_VISIBLES) })
                    : t('retenidos.verEnBandeja')}
                </Link>
              }
            >
              <ul className="flex flex-col divide-y divide-line">
                {retenidos.slice(0, RETENIDOS_VISIBLES).map((r) => {
                  const factura = uno(r.invoice);
                  const soporte = uno(r.support_document);
                  const cliente = uno(factura?.customer);
                  const numero = factura?.number ?? soporte?.number ?? soporte?.reference_code ?? t('retenidos.sinNumero');
                  const fecha = factura?.issue_date ?? soporte?.issue_date ?? r.created_at;
                  const totalDoc = factura?.total ?? soporte?.total;
                  const fmt = crearFormateadorMoneda(moneda.paraDocumento(factura?.currency ?? soporte?.currency));
                  return (
                    <li key={r.id} className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 sm:grid-cols-[1.2fr_1.4fr_1fr_auto]">
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium text-fg">{numero}</span>
                        <span className="text-xs text-fg-muted">{t('retenidos.ventaDel', { fecha: formatDate(fecha) })}</span>
                      </div>
                      <span className="hidden truncate text-sm text-fg sm:block">{cliente?.company_name || cliente?.full_name || '—'}</span>
                      <span className="hidden text-right text-sm tabular-nums text-fg sm:block">{totalDoc != null ? fmt(totalDoc) : '—'}</span>
                      <div className="flex items-center justify-end gap-1">
                        {activo ? (
                          <button
                            type="button"
                            className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}
                            onClick={() => setALiberar(r)}
                            disabled={accion !== null || !permisos.aprobar}
                            title={!permisos.aprobar ? t('motivos.sinPermiso') : undefined}
                          >
                            <Send aria-hidden="true" className="size-4" strokeWidth={1.5} />
                            {t('retenidos.enviar')}
                          </button>
                        ) : (
                          <StatusBadge estado="pendiente" tono="advertencia" etiqueta={t('retenidos.esperaConfirmacion')} />
                        )}
                        {permisos.anular && (
                          <button
                            type="button"
                            aria-label={t('retenidos.cancelarDe', { numero })}
                            title={t('retenidos.cancelar')}
                            className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}
                            onClick={() => setACancelar(r)}
                            disabled={accion !== null}
                          >
                            <Ban aria-hidden="true" className="size-4" strokeWidth={1.5} />
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Tarjeta>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-4 lg:gap-6">
          <Tarjeta titulo={t('estado.titulo')}>
            {!servicio ? (
              <Skeleton className="h-28 w-full" />
            ) : (
              <>
                <ListaDatos>
                  <FilaDato etiqueta={t('estado.estado')} valor={<StatusBadge estado={servicio.status} tono={tonoServicio} etiqueta={t(`estado.estados.${servicio.status}`)} />} />
                  <FilaDato etiqueta={t('estado.prestadoPor')} valor={t('estado.goAdmin')} />
                  <FilaDato etiqueta={t('estado.nit')} valor={servicio.companyNit ?? datos?.emisor?.nit ?? '—'} />
                  {activo ? (
                    <FilaDato etiqueta={t('estado.activoDesde')} valor={servicio.activatedAt ? formatDate(servicio.activatedAt) : '—'} />
                  ) : (
                    <FilaDato etiqueta={t('estado.solicitud')} valor={t('estado.sinEnviar')} />
                  )}
                  <FilaDato
                    etiqueta={t('estado.ultimaVerificacion')}
                    valor={
                      servicio.lastCheck
                        ? `${formatDateTime(servicio.lastCheck.at)} · ${servicio.lastCheck.ok ? t('estado.correcta') : t('estado.fallida')}`
                        : '—'
                    }
                    tono={servicio.lastCheck && servicio.lastCheck.ok === false ? 'peligro' : undefined}
                  />
                </ListaDatos>
                <p className="mt-3 text-xs text-fg-muted">{t('estado.ayuda')}</p>
              </>
            )}
          </Tarjeta>

          <Tarjeta titulo={t('comportamiento.titulo')}>
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                  <label htmlFor="fe-siempre" className="text-sm font-medium text-fg">
                    {t('comportamiento.siempre')}
                  </label>
                  <span className="text-xs text-fg-muted">{t('comportamiento.siempreAyuda')}</span>
                </div>
                <Switch
                  id="fe-siempre"
                  checked={preferencia.alwaysEnabled}
                  disabled={guardandoPreferencia || preferencia.loading}
                  onCheckedChange={(v) => void cambiarPreferencia(v)}
                />
              </div>
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-fg">{t('comportamiento.correo')}</span>
                  <span className="text-xs text-fg-muted">{t('comportamiento.correoAyuda')}</span>
                </div>
                <StatusBadge estado="activo" tono="exito" etiqueta={t('comportamiento.siempreActivo')} />
              </div>
            </div>
          </Tarjeta>
        </div>
      </div>

      <ConfirmDialog
        abierto={aLiberar !== null}
        onAbiertoChange={(v) => !v && setALiberar(null)}
        titulo={t('retenidos.confirmarTitulo')}
        descripcion={t('retenidos.confirmarDescripcion', { fecha: formatDate(hoy) })}
        textoConfirmar={t('retenidos.enviar')}
        textoCancelar={t('retenidos.volver')}
        tono="advertencia"
        icono={Send}
        cargando={accion?.startsWith('liberar:') ?? false}
        onConfirmar={liberar}
      />
      <ConfirmDialog
        abierto={aCancelar !== null}
        onAbiertoChange={(v) => !v && setACancelar(null)}
        titulo={t('retenidos.cancelarTitulo')}
        descripcion={t('retenidos.cancelarDescripcion')}
        textoConfirmar={t('retenidos.cancelar')}
        textoCancelar={t('retenidos.volver')}
        tono="peligro"
        icono={Ban}
        cargando={accion?.startsWith('cancelar:') ?? false}
        onConfirmar={cancelar}
      />
    </div>
  );
}
