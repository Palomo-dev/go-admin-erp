'use client';

/**
 * Asignación automática (Figma CRM 1412:837868): interruptor, estrategia (por
 * turnos · por territorio · por carga), equipo por defecto y «Así se habrían
 * repartido los últimos 50 leads». Guarda `organization_settings`
 * (`crm_lead_assignment`) por `PUT /api/crm/assignment/config` — solo admin,
 * resuelto en el servidor — y la simulación es `POST
 * /api/crm/assignment/simulate` con `modo: 'ultimos_leads'` (no escribe).
 * «Por territorio» se deshabilita sin territorios, con el motivo en un tooltip
 * (Figma 1413:725).
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Info, Save, Waypoints } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { EmptyState } from '@/components/kit/EmptyState';
import { BarraProgreso } from '@/components/kit/BarraProgreso';
import { clasesBoton } from '@/components/kit/botonClases';
import { SelectCrm } from '@/components/crm/kit/SelectCrm';
import { claveError, ErrorApiCrm, pedirCrm } from '@/components/crm/acciones/apiCrm';
import { LEAD_ASSIGNMENT_STRATEGIES } from '@/lib/services/crm/leadAssignmentConfig';
import { cn } from '@/utils/Utils';
import { CabeceraEquipo } from '../CabeceraEquipo';
import { useRecursoCrm } from '../useRecursoCrm';
import type { PestanaEquipo } from '../equipoPantallaLogica';
import type { LeadAssignmentConfig, LeadAssignmentStrategy, Previsualizacion } from '../types';

interface DatosConfig {
  config: LeadAssignmentConfig;
  puedeEditar: boolean;
  hayTerritorios: boolean;
}

export function AsignacionTab({ onPestana }: { onPestana: (p: PestanaEquipo) => void }) {
  const t = useTranslations('crm.equipo.pantalla');
  const ta = useTranslations('crm.equipo.pantalla.asignacion');
  const te = useTranslations('crm.accionesRapidas.errores');
  const { estado, datos, recargar } = useRecursoCrm<DatosConfig>('/api/crm/assignment/config');
  const equiposRes = useRecursoCrm<{ id: string; name: string; is_active: boolean }[]>('/api/crm/teams');
  const [borrador, setBorrador] = useState<LeadAssignmentConfig | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [previa, setPrevia] = useState<{ estado: 'cargando' | 'listo' | 'error' | 'sinPermiso'; datos: Previsualizacion | null }>({ estado: 'cargando', datos: null });

  useEffect(() => {
    if (datos) setBorrador(datos.config);
  }, [datos]);

  const equipos = useMemo(() => (equiposRes.datos ?? []).filter((e) => e.is_active), [equiposRes.datos]);
  const editable = datos?.puedeEditar ?? false;
  const cambiado = !!datos && !!borrador && JSON.stringify(datos.config) !== JSON.stringify(borrador);

  // Simulación con la estrategia y el equipo del borrador (sin guardar).
  const estrategia = borrador?.strategy;
  const equipoId = borrador?.team_id ?? null;
  useEffect(() => {
    if (!estrategia) return;
    const ctrl = new AbortController();
    setPrevia((p) => ({ estado: 'cargando', datos: p.datos }));
    pedirCrm<Previsualizacion>('/api/crm/assignment/simulate', {
      method: 'POST',
      cuerpo: { modo: 'ultimos_leads', strategy: estrategia, team_id: equipoId },
      signal: ctrl.signal,
    })
      .then(({ data }) => !ctrl.signal.aborted && setPrevia({ estado: 'listo', datos: data }))
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setPrevia({ estado: e instanceof ErrorApiCrm && e.status === 403 ? 'sinPermiso' : 'error', datos: null });
      });
    return () => ctrl.abort();
  }, [estrategia, equipoId]);

  const guardar = async () => {
    if (!borrador) return;
    setGuardando(true);
    try {
      await pedirCrm('/api/crm/assignment/config', { method: 'PUT', cuerpo: borrador });
      toast({ title: ta('guardado') });
      recargar();
    } catch (e) {
      const sinTerritorios = e instanceof ErrorApiCrm && e.codigo === 'sin_territorios';
      toast({ title: sinTerritorios ? ta('territorioDeshabilitado') : te(claveError(e)), variant: 'destructive' });
    } finally {
      setGuardando(false);
    }
  };

  const cambiar = (c: Partial<LeadAssignmentConfig>) => setBorrador((b) => (b ? { ...b, ...c } : b));

  return (
    <>
      <CabeceraEquipo
        pestana="asignacion"
        onPestana={onPestana}
        icono={Waypoints}
        subtitulo={t('subtitulos.asignacion')}
        cargando={estado === 'cargando' && !!datos}
        acciones={
          editable && (
            <button type="button" className={clasesBoton()} onClick={() => void guardar()} disabled={!cambiado || guardando}>
              <Save aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {guardando ? ta('guardando') : ta('guardar')}
            </button>
          )
        }
        movil={{
          accion: editable ? (
            <button type="button" onClick={() => void guardar()} disabled={!cambiado || guardando} className="h-10 rounded-lg px-3 text-sm font-medium text-brand disabled:opacity-50">
              {ta('guardar')}
            </button>
          ) : undefined,
        }}
      />

      {estado === 'sinPermiso' ? (
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState variante="forbidden" titulo={t('sinPermiso.titulo')} descripcion={t('sinPermiso.descripcion')} accion={{ etiqueta: t('sinPermiso.volver'), href: '/app/crm' }} />
        </div>
      ) : estado === 'error' && !datos ? (
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState variante="error" titulo={t('error.titulo')} descripcion={t('error.descripcion')} onReintentar={recargar} />
        </div>
      ) : !borrador || !datos ? (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start" aria-busy="true">
          <Skeleton className="h-[472px] w-full rounded-xl lg:w-[692px]" />
          <Skeleton className="h-[302px] w-full rounded-xl lg:w-[420px]" />
        </div>
      ) : (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <section aria-labelledby="asignacion-titulo" className="flex w-full min-w-0 flex-col gap-3.5 rounded-xl border border-line bg-surface p-4 lg:max-w-[692px] lg:flex-1">
            <div className="flex items-center gap-2">
              <h2 id="asignacion-titulo" className="min-w-0 flex-1 text-base font-semibold leading-[22px] text-fg">
                {ta('activar')}
              </h2>
              <Switch checked={borrador.enabled} onCheckedChange={(v) => cambiar({ enabled: v })} disabled={!editable} aria-labelledby="asignacion-titulo" />
            </div>
            <p id="asignacion-estrategia" className="text-xs font-semibold leading-4 text-fg-secondary">
              {ta('estrategia')}
            </p>
            <TooltipProvider delayDuration={200}>
              <div role="radiogroup" aria-labelledby="asignacion-estrategia" className="flex flex-col gap-3.5">
                {LEAD_ASSIGNMENT_STRATEGIES.map((s) => {
                  const bloqueada = s === 'territory' && !datos.hayTerritorios;
                  const activa = borrador.strategy === s;
                  const tarjeta = (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={activa}
                      aria-disabled={bloqueada || !editable || undefined}
                      onClick={() => !bloqueada && editable && cambiar({ strategy: s })}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-[10px] border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                        activa ? 'border-2 border-brand bg-brand-tint' : 'border-line bg-surface hover:bg-hover',
                        (bloqueada || !editable) && 'cursor-not-allowed',
                        bloqueada && 'opacity-50',
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn('flex size-[18px] shrink-0 items-center justify-center rounded-full border', activa ? 'border-brand' : 'border-line-strong')}
                      >
                        {activa && <span className="size-2.5 rounded-full bg-brand" />}
                      </span>
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-sm font-medium leading-5 text-fg">{ta(`estrategias.${s}.titulo`)}</span>
                        <span className="text-xs leading-4 text-fg-secondary">{ta(`estrategias.${s}.descripcion`)}</span>
                      </span>
                    </button>
                  );
                  return bloqueada ? (
                    <Tooltip key={s}>
                      <TooltipTrigger asChild>{tarjeta}</TooltipTrigger>
                      <TooltipContent>{ta('territorioDeshabilitado')}</TooltipContent>
                    </Tooltip>
                  ) : (
                    <div key={s}>{tarjeta}</div>
                  );
                })}
              </div>
            </TooltipProvider>
            <div className="flex flex-col gap-1.5">
              <label id="asignacion-equipo" className="text-xs font-semibold leading-4 text-fg-secondary">
                {ta('equipoDefecto')}
              </label>
              <SelectCrm
                aria-labelledby="asignacion-equipo"
                valor={borrador.team_id ?? ''}
                onValorChange={(v) => cambiar({ team_id: v || null })}
                opcionVacia={ta('primerEquipo')}
                opciones={equipos.map((e) => ({ valor: e.id, etiqueta: e.name }))}
                disabled={!editable}
              />
            </div>
            <div className="flex items-start gap-2 rounded-lg bg-subtle px-3 py-3">
              <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
              <p className="text-[13px] leading-[18px] text-fg-secondary">{ta('nota')}</p>
            </div>
            {!editable && <p className="text-xs leading-4 text-fg-muted">{ta('soloAdmin')}</p>}
          </section>

          <Simulacion previa={previa} />
        </div>
      )}
    </>
  );
}

function Simulacion({ previa }: { previa: { estado: 'cargando' | 'listo' | 'error' | 'sinPermiso'; datos: Previsualizacion | null } }) {
  const ta = useTranslations('crm.equipo.pantalla.asignacion');
  const d = previa.datos;
  const filas = d ? [...d.filas.map((f) => ({ clave: f.user_id, nombre: f.nombre, n: f.n })), ...(d.sinTerritorio !== null ? [{ clave: '__sin__', nombre: ta('sinTerritorioTurnos'), n: d.sinTerritorio }] : [])] : [];
  const pct = (n: number) => (d && d.total > 0 ? Math.round((n / d.total) * 100) : 0);
  const estrategiaHoy = (s: LeadAssignmentStrategy) => ta(`estrategias.${s}.corta`);

  return (
    <section aria-labelledby="simulacion-titulo" aria-busy={previa.estado === 'cargando' || undefined} className="flex w-full min-w-0 flex-col gap-2.5 rounded-xl border border-line bg-surface p-4 lg:w-[420px] lg:shrink-0">
      <h2 id="simulacion-titulo" className="text-base font-semibold leading-[22px] text-fg">
        {ta('simulacionTitulo', { n: d?.total || 50 })}
      </h2>
      {previa.estado === 'sinPermiso' ? (
        <p className="text-[13px] leading-[18px] text-fg-secondary">{ta('simulacionSinPermiso')}</p>
      ) : previa.estado === 'error' ? (
        <p className="text-[13px] leading-[18px] text-warning-text">{ta('simulacionError')}</p>
      ) : !d ? (
        [0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-[34px] w-full" />)
      ) : d.filas.length === 0 ? (
        <p className="text-[13px] leading-[18px] text-fg-secondary">{ta('simulacionSinMiembros')}</p>
      ) : d.total === 0 ? (
        <p className="text-[13px] leading-[18px] text-fg-secondary">{ta('simulacionSinLeads')}</p>
      ) : (
        <>
          <ul className={cn('flex flex-col gap-2.5', previa.estado === 'cargando' && 'opacity-60')}>
            {filas.map((f) => (
              <li key={f.clave} className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2 whitespace-nowrap">
                  <span className="truncate text-[13px] leading-[18px] text-fg-secondary">{f.nombre}</span>
                  <span className="text-xs font-medium leading-4 text-fg tabular-nums">{ta('simulacionValor', { n: f.n, pct: pct(f.n) })}</span>
                </div>
                <BarraProgreso valor={pct(f.n)} etiqueta={f.nombre} textoValor={`${pct(f.n)} %`} />
              </li>
            ))}
          </ul>
          <p className="text-xs leading-4 text-fg-secondary">
            {ta('simulacionHoy', { estrategia: estrategiaHoy(d.estrategiaActual), lista: d.reales.map((r) => r.n).join(' / ') })}
          </p>
        </>
      )}
    </section>
  );
}
