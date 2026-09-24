'use client';

/**
 * Configuración de facturación electrónica que ve el cliente (Figma `07
 * Finanzas` › Sección 13 «Facturación electrónica: configuración»).
 *
 * GO Admin presta el servicio: las credenciales del proveedor las carga el
 * equipo de la plataforma y el cliente NUNCA las ve ni las escribe. Aquí ve el
 * estado del servicio (activo / pendiente de activación / suspendido), su
 * resolución y rangos, la cola y los documentos retenidos. Todo pasa por
 * `GET|POST /api/factus/config`, con la organización de la sesión.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, Clock, FileCheck2, Loader2, RefreshCw, Send, ShieldAlert, ShieldCheck } from 'lucide-react';
import { PageHeader, FormSection, KpiStrip, StatCard, DataTable, EmptyState, type ColumnaTabla } from '@/components/kit';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { formatPlainDate } from '@/lib/utils/dateDisplay';

type EstadoServicio = 'active' | 'pending_activation' | 'suspended';

interface RespuestaConfig {
  service: {
    status: EstadoServicio;
    hasCredentials: boolean;
    environment: 'sandbox' | 'production' | null;
    activatedAt: string | null;
    companyNit: string | null;
    lastCheck: { at: string; ok: boolean | null; message: string | null } | null;
  };
  ranges: Array<{
    id: number;
    branch_id: number;
    document_type: string;
    prefix: string;
    resolution_number: string | null;
    range_start: number;
    range_end: number;
    current_number: number;
    valid_from: string | null;
    valid_until: string | null;
    is_active: boolean;
    factus_numbering_range_id: number | null;
    branch: { name: string } | { name: string }[] | null;
  }>;
  queue: Record<string, number>;
  held: Array<{
    id: string;
    document_type: string;
    created_at: string;
    invoice: { number: string | null; issue_date: string | null } | { number: string | null; issue_date: string | null }[] | null;
    support_document: { reference_code: string | null; issue_date: string | null } | { reference_code: string | null; issue_date: string | null }[] | null;
  }>;
}

type Rango = RespuestaConfig['ranges'][number];
type Retenido = RespuestaConfig['held'][number];

function uno<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default function ConfiguracionServicioFE() {
  const t = useTranslations('facturacionElectronica.configuracion');
  const { toast } = useToast();
  const { formatDate, formatDateTime } = useFormatDate();
  const entero = useFormatoEntero();

  const [datos, setDatos] = useState<RespuestaConfig | null>(null);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error' | 'sinPermiso'>('cargando');
  const [accion, setAccion] = useState<string | null>(null);
  const [sucursal, setSucursal] = useState<string>('');
  const [aLiberar, setALiberar] = useState<Retenido | null>(null);

  const cargar = useCallback(async () => {
    setEstado('cargando');
    try {
      const res = await fetch('/api/factus/config', { cache: 'no-store' });
      if (res.status === 401 || res.status === 403) {
        setEstado('sinPermiso');
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      setDatos((await res.json()) as RespuestaConfig);
      setEstado('listo');
    } catch {
      setEstado('error');
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const enviar = useCallback(
    async (cuerpo: Record<string, unknown>, clave: string): Promise<Record<string, unknown> | null> => {
      setAccion(clave);
      try {
        const res = await fetch('/api/factus/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cuerpo),
        });
        const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (res.status === 403) {
          toast({ title: t('errores.sinPermiso'), variant: 'destructive' });
          return null;
        }
        if (!res.ok) {
          toast({ title: t('errores.titulo'), description: String(json.error ?? json.mensaje ?? ''), variant: 'destructive' });
          return null;
        }
        return json;
      } catch {
        toast({ title: t('errores.titulo'), description: t('errores.red'), variant: 'destructive' });
        return null;
      } finally {
        setAccion(null);
      }
    },
    [t, toast],
  );

  const verificar = async () => {
    const r = await enviar({ action: 'verificar' }, 'verificar');
    if (r) toast({ title: r.activado ? t('verificacion.activado') : t('verificacion.ok'), description: String(r.mensaje ?? '') });
    await cargar();
  };

  const sincronizar = async () => {
    if (!sucursal) return;
    const r = await enviar({ action: 'sincronizar_rangos', branchId: Number(sucursal) }, 'sincronizar');
    if (r) {
      toast({
        title: t('rangos.sincronizados'),
        description: t('rangos.resumen', { importados: Number(r.importados ?? 0), desactivados: Number(r.desactivados ?? 0) }),
      });
    }
    await cargar();
  };

  const liberar = async () => {
    if (!aLiberar) return;
    const r = await enviar({ action: 'liberar', jobId: aLiberar.id }, `liberar:${aLiberar.id}`);
    setALiberar(null);
    if (r) toast({ title: t('retenidos.enviado') });
    await cargar();
  };

  const sucursales = useMemo(() => {
    const mapa = new Map<number, string>();
    for (const r of datos?.ranges ?? []) mapa.set(r.branch_id, uno(r.branch)?.name ?? `#${r.branch_id}`);
    return Array.from(mapa.entries()).map(([id, nombre]) => ({ id, nombre }));
  }, [datos]);

  const columnas: ColumnaTabla<Rango>[] = useMemo(
    () => [
      { id: 'tipo', encabezado: t('rangos.columnas.tipo'), celda: (r) => t(`tipos.${r.document_type}` as never) },
      { id: 'sucursal', encabezado: t('rangos.columnas.sucursal'), celda: (r) => uno(r.branch)?.name ?? '—', ocultarDebajo: 'md' },
      { id: 'prefijo', encabezado: t('rangos.columnas.prefijo'), celda: (r) => r.prefix, variante: 'mono' },
      { id: 'resolucion', encabezado: t('rangos.columnas.resolucion'), celda: (r) => r.resolution_number || t('rangos.sinResolucion'), ocultarDebajo: 'md' },
      {
        id: 'rango',
        encabezado: t('rangos.columnas.rango'),
        celda: (r) => (r.range_end > 0 ? `${entero(r.range_start)} – ${entero(r.range_end)}` : '—'),
        ocultarDebajo: 'lg',
      },
      { id: 'actual', encabezado: t('rangos.columnas.actual'), celda: (r) => entero(r.current_number), variante: 'mono' },
      {
        id: 'vigencia',
        encabezado: t('rangos.columnas.vigencia'),
        celda: (r) => (r.valid_until ? t('rangos.hasta', { fecha: formatPlainDate(r.valid_until) }) : t('rangos.sinVencimiento')),
        ocultarDebajo: 'md',
      },
      {
        id: 'estado',
        encabezado: t('rangos.columnas.estado'),
        celda: (r) => (
          <Badge tono={r.is_active ? 'exito' : 'neutro'} apariencia="suave" tamano="sm">
            {r.is_active ? t('rangos.activo') : t('rangos.inactivo')}
          </Badge>
        ),
      },
    ],
    [t, entero],
  );

  if (estado === 'sinPermiso') {
    return <EmptyState variante="forbidden" titulo={t('errores.sinPermiso')} />;
  }

  const servicio = datos?.service;
  const tonoServicio = servicio?.status === 'active' ? 'exito' : servicio?.status === 'suspended' ? 'peligro' : 'advertencia';
  const activo = servicio?.status === 'active';
  const cola = datos?.queue ?? {};

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={t('subtitulo')}
        icono={FileCheck2}
        variante="form"
        volverA="/app/finanzas/facturacion-electronica"
        migas={[
          { etiqueta: t('migas.finanzas'), href: '/app/finanzas' },
          { etiqueta: t('migas.facturacion'), href: '/app/finanzas/facturacion-electronica' },
          { etiqueta: t('migas.configuracion') },
        ]}
        cargando={estado === 'cargando'}
      />

      {estado === 'error' && <EmptyState variante="error" titulo={t('errores.carga')} onReintentar={() => void cargar()} />}

      <FormSection
        titulo={t('servicio.titulo')}
        descripcion={t('servicio.descripcion')}
        icono={activo ? ShieldCheck : ShieldAlert}
        accion={
          servicio?.hasCredentials ? (
            <Button variant="outline" size="sm" onClick={() => void verificar()} disabled={accion !== null}>
              {accion === 'verificar' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="mr-2 h-4 w-4" aria-hidden />}
              {t('servicio.verificar')}
            </Button>
          ) : undefined
        }
      >
        {estado === 'cargando' || !servicio ? (
          <Skeleton className="h-20 w-full" />
        ) : (
          <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <dt className="text-fg-secondary">{t('servicio.estado')}</dt>
              <dd>
                <Badge tono={tonoServicio} apariencia="suave" punto>
                  {t(`servicio.estados.${servicio.status}` as never)}
                </Badge>
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-fg-secondary">{t('servicio.ambiente')}</dt>
              <dd>{servicio.environment ? t(`servicio.ambientes.${servicio.environment}` as never) : '—'}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-fg-secondary">{t('servicio.nit')}</dt>
              <dd className="font-mono">{servicio.companyNit ?? '—'}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-fg-secondary">{t('servicio.activoDesde')}</dt>
              <dd>{servicio.activatedAt ? formatDate(servicio.activatedAt) : '—'}</dd>
            </div>
            <div className="flex flex-col gap-1 sm:col-span-2">
              <dt className="text-fg-secondary">{t('servicio.ultimaVerificacion')}</dt>
              <dd className="flex items-start gap-2">
                {servicio.lastCheck ? (
                  <>
                    {servicio.lastCheck.ok ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 text-success-text" aria-hidden />
                    ) : (
                      <ShieldAlert className="mt-0.5 h-4 w-4 text-danger-text" aria-hidden />
                    )}
                    <span>
                      {formatDateTime(servicio.lastCheck.at)} · {servicio.lastCheck.message ?? ''}
                    </span>
                  </>
                ) : (
                  <span className="text-fg-secondary">
                    {servicio.hasCredentials ? t('servicio.verificacionEnCurso') : t('servicio.sinCredenciales')}
                  </span>
                )}
              </dd>
            </div>
            {!activo && (
              <p className="text-fg-secondary sm:col-span-2" role="note">
                {servicio.status === 'suspended' ? t('servicio.ayudaSuspendido') : t('servicio.ayudaPendiente')}
              </p>
            )}
          </dl>
        )}
      </FormSection>

      <KpiStrip etiqueta={t('cola.etiqueta')}>
        <StatCard etiqueta={t('cola.enCola')} valor={entero((cola.pending ?? 0) + (cola.processing ?? 0))} icono={Clock} cargando={estado === 'cargando'} />
        <StatCard etiqueta={t('cola.retenidos')} valor={entero(cola.held ?? 0)} tono={(cola.held ?? 0) > 0 ? 'advertencia' : 'neutro'} cargando={estado === 'cargando'} />
        <StatCard etiqueta={t('cola.aceptados')} valor={entero((cola.accepted ?? 0) + (cola.sent ?? 0))} tono="exito" cargando={estado === 'cargando'} />
        <StatCard
          etiqueta={t('cola.conError')}
          valor={entero((cola.rejected ?? 0) + (cola.failed ?? 0))}
          tono={(cola.rejected ?? 0) + (cola.failed ?? 0) > 0 ? 'peligro' : 'neutro'}
          cargando={estado === 'cargando'}
        />
      </KpiStrip>

      {(datos?.held.length ?? 0) > 0 && (
        <FormSection titulo={t('retenidos.titulo')} descripcion={t('retenidos.descripcion')}>
          <ul className="flex flex-col divide-y divide-line">
            {datos!.held.map((r) => {
              const factura = uno(r.invoice);
              const soporte = uno(r.support_document);
              const numero = factura?.number ?? soporte?.reference_code ?? r.id.slice(0, 8);
              const fecha = factura?.issue_date ?? soporte?.issue_date ?? r.created_at;
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="flex flex-col">
                    <span className="font-medium">
                      {t(`tipos.${r.document_type}` as never)} {numero}
                    </span>
                    <span className="text-sm text-fg-secondary">{t('retenidos.fechaVenta', { fecha: formatDate(fecha) })}</span>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setALiberar(r)} disabled={!activo || accion !== null}>
                    <Send className="mr-2 h-4 w-4" aria-hidden />
                    {t('retenidos.enviar')}
                  </Button>
                </li>
              );
            })}
          </ul>
          {!activo && <p className="text-sm text-fg-secondary">{t('retenidos.requiereActivo')}</p>}
        </FormSection>
      )}

      <FormSection
        titulo={t('rangos.titulo')}
        descripcion={t('rangos.descripcion')}
        accion={
          activo ? (
            <div className="flex flex-wrap items-center gap-2">
              <Select value={sucursal} onValueChange={setSucursal}>
                <SelectTrigger className="h-8 w-48" aria-label={t('rangos.sucursal')}>
                  <SelectValue placeholder={t('rangos.sucursal')} />
                </SelectTrigger>
                <SelectContent>
                  {sucursales.length === 0 && <SelectItem value="__sin" disabled>{t('rangos.sinSucursales')}</SelectItem>}
                  {sucursales.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={() => void sincronizar()} disabled={!sucursal || accion !== null}>
                {accion === 'sincronizar' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="mr-2 h-4 w-4" aria-hidden />}
                {t('rangos.sincronizar')}
              </Button>
            </div>
          ) : undefined
        }
      >
        <DataTable
          etiqueta={t('rangos.titulo')}
          columnas={columnas}
          filas={datos?.ranges ?? []}
          obtenerId={(r) => String(r.id)}
          estado={estado === 'cargando' ? 'cargando' : estado === 'error' ? 'error' : 'listo'}
          densidad="compacta"
          vacio={{ titulo: t('rangos.vacioTitulo'), descripcion: t('rangos.vacioDescripcion') }}
          onReintentar={() => void cargar()}
        />
      </FormSection>

      <ConfirmDialog
        open={aLiberar !== null}
        onOpenChange={(abierto) => !abierto && setALiberar(null)}
        title={t('retenidos.confirmarTitulo')}
        description={t('retenidos.confirmarDescripcion')}
        confirmLabel={t('retenidos.enviar')}
        cancelLabel={t('retenidos.cancelar')}
        loading={accion?.startsWith('liberar:') ?? false}
        onConfirm={liberar}
      />
    </div>
  );
}
