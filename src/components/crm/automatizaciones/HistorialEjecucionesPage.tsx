'use client';

/**
 * /app/crm/automatizaciones/historial — «Historial de ejecuciones» (Figma CRM
 * 1373:1161): qué hizo cada regla, sobre qué registro y por qué se omitió o
 * falló. Filtros: regla, ventana de fechas y chips Todas · Ejecutadas ·
 * Omitidas · Con error · Prueba en seco (en la URL). La fila abre una hoja con
 * el plan de acciones y el evento (sin datos sensibles); los errores ofrecen
 * «Reintentar». Siempre filtrado por la organización de la sesión.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CalendarDays, Download, ExternalLink, Eye, History, RotateCcw } from 'lucide-react';
import { PageHeader } from '@/components/kit/PageHeader';
import { DataTable, type ColumnaTabla, type EstadoTabla } from '@/components/kit/DataTable';
import { ChipsOpcion } from '@/components/kit/ChipsOpcion';
import { StatusBadge } from '@/components/kit/StatusBadge';
import { Pagination } from '@/components/kit/Pagination';
import { HojaDetalle } from '@/components/kit/HojaDetalle';
import { clasesBoton } from '@/components/kit/botonClases';
import type { AccionFila } from '@/components/kit/acciones';
import type { TonoBadge } from '@/components/kit/estadoTono';
import { useOpcionUrl, useParametrosUrl } from '@/components/kit/useParametroUrl';
import { SelectCrm } from '@/components/crm/kit/SelectCrm';
import { toast } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { filasACsv } from '@/lib/utils/csv';
import { describeSkipReason } from '@/lib/services/crm/automation/ruleHumanizer';
import {
  FILTROS_HISTORIAL,
  RANGOS_HISTORIAL,
  desdeRango,
  resultadoDeEjecucion,
  type FiltroHistorial,
  type RangoHistorial,
  type ResultadoEjecucion,
} from '@/lib/services/crm/automation/automationListaLogica';
import {
  browserFetch,
  fetchHistorial,
  fetchRules,
  retryRun,
  type AutomationRunView,
} from '@/lib/services/crm/automation/ruleMutations';
import { useFechaCorta, useTextoCuando } from './celdasRegla';

const BASE = '/app/crm/automatizaciones';
const TAMANO = 50;

const TONO_RESULTADO: Record<ResultadoEjecucion, TonoBadge> = {
  ejecutada: 'exito',
  error: 'peligro',
  omitida: 'neutro',
  seco: 'marca',
  enCurso: 'informacion',
};

/** Claves del evento que nunca se muestran (anotación 1373:1873: «sin datos sensibles»). */
const SENSIBLE = /phone|tel|email|correo|document|identifica|token|password|secret|address|direcc/i;

function sinSensibles(valor: unknown, profundidad = 0): unknown {
  if (profundidad > 4 || valor === null || typeof valor !== 'object') return valor;
  if (Array.isArray(valor)) return valor.slice(0, 20).map((v) => sinSensibles(v, profundidad + 1));
  return Object.fromEntries(
    Object.entries(valor as Record<string, unknown>)
      .filter(([k]) => !SENSIBLE.test(k))
      .map(([k, v]) => [k, sinSensibles(v, profundidad + 1)]),
  );
}

export function HistorialEjecucionesPage() {
  const t = useTranslations('crm.automatizaciones.historial');
  const router = useRouter();
  const fechaCorta = useFechaCorta();
  const textoCuando = useTextoCuando();
  const { formatDateTime } = useFormatDate();
  const { leer, fijar } = useParametrosUrl();
  const [resultado, setResultado] = useOpcionUrl<FiltroHistorial>('resultado', FILTROS_HISTORIAL, 'todas', 'replace');
  const [rango, setRango] = useOpcionUrl<RangoHistorial>('rango', RANGOS_HISTORIAL, '7d', 'replace');
  const regla = leer('regla') ?? '';

  const [reglas, setReglas] = useState<{ id: string; name: string }[]>([]);
  const [filas, setFilas] = useState<AutomationRunView[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [estado, setEstado] = useState<EstadoTabla>('cargando');
  const [revision, setRevision] = useState(0);
  const [detalle, setDetalle] = useState<AutomationRunView | null>(null);
  const [reintentando, setReintentando] = useState<string | null>(null);

  useEffect(() => {
    fetchRules(browserFetch)
      .then((r) => setReglas(r.map((x) => ({ id: x.id, name: x.name }))))
      .catch(() => setReglas([]));
  }, []);

  useEffect(() => {
    let vivo = true;
    setEstado('cargando');
    fetchHistorial(browserFetch, {
      ruleId: regla || null,
      resultado,
      desde: desdeRango(rango, new Date()),
      limit: TAMANO,
      offset: (pagina - 1) * TAMANO,
    })
      .then(({ rows, count }) => {
        if (!vivo) return;
        setFilas(rows);
        setTotal(count);
        setEstado(rows.length ? 'listo' : regla || resultado !== 'todas' ? 'sinResultados' : 'vacio');
      })
      .catch((e: unknown) => {
        if (!vivo) return;
        const status = (e as { status?: number })?.status;
        setEstado(status === 401 || status === 403 ? 'sinPermiso' : 'error');
      });
    return () => {
      vivo = false;
    };
  }, [regla, resultado, rango, pagina, revision]);

  const nombreRegla = useCallback((r: AutomationRunView) => r.rule_name ?? reglas.find((x) => x.id === r.automation_rule_id)?.name ?? t('reglaBorrada'), [reglas, t]);

  const etiquetaResultado = (r: AutomationRunView) => t(`resultados.${resultadoDeEjecucion(r)}`);

  const motivo = useCallback(
    (m: string | null | undefined) => {
      if (!m) return '';
      return t.has(`motivos.${m}`) ? t(`motivos.${m}`) : describeSkipReason(m);
    },
    [t],
  );

  const textoDetalle = useCallback(
    (r: AutomationRunView): string => {
      const res = resultadoDeEjecucion(r);
      if (res === 'error') return r.error_message ?? t('sinDetalle');
      if (res === 'omitida') return motivo(r.skip_reason) || t('sinDetalle');
      const n = Array.isArray(r.result?.results) ? r.result.results.length : Array.isArray(r.actions_plan) ? (r.actions_plan as unknown[]).length : 0;
      return res === 'seco' ? t('detalleSeco', { n }) : t('detalleEjecutada', { n });
    },
    [motivo, t],
  );

  const eventoDe = (r: AutomationRunView) => {
    const ev = typeof r.trigger_payload?.event_type === 'string' ? r.trigger_payload.event_type : null;
    return ev ? textoCuando({ trigger_type: 'event', event: ev }) : textoCuando({ trigger_type: r.trigger_type ?? 'manual' });
  };

  const registro = (r: AutomationRunView) => {
    const principal = r.customer_name ?? r.opportunity_name ?? t('sinRegistro');
    const sub = r.opportunity_name ? t('oportunidad', { nombre: r.opportunity_name }) : eventoDe(r);
    return (
      <div className="min-w-0">
        <p className="truncate text-sm text-fg">{principal}</p>
        <p className="truncate text-xs text-fg-secondary">{sub}</p>
      </div>
    );
  };

  const insignia = (r: AutomationRunView) => {
    const res = resultadoDeEjecucion(r);
    return <StatusBadge estado={res} etiqueta={etiquetaResultado(r)} tono={TONO_RESULTADO[res]} apariencia="contorno" />;
  };

  const reintentar = async (r: AutomationRunView) => {
    setReintentando(r.id);
    try {
      const nuevo = await retryRun(browserFetch, r.automation_rule_id, r.opportunity_id ?? null);
      const res = resultadoDeEjecucion(nuevo);
      toast({ title: res === 'ejecutada' ? t('toast.reintentoOk') : t('toast.reintentoResultado', { resultado: t(`resultados.${res}`) }) });
      setDetalle(null);
      setRevision((n) => n + 1);
    } catch (e) {
      toast({ title: t('toast.reintentoFallo'), description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setReintentando(null);
    }
  };

  const acciones = (r: AutomationRunView): AccionFila[] => [
    { id: 'ver', etiqueta: t('menu.ver'), icono: Eye, onSelect: () => setDetalle(r) },
    {
      id: 'reintentar',
      etiqueta: t('menu.reintentar'),
      icono: RotateCcw,
      oculta: resultadoDeEjecucion(r) !== 'error',
      deshabilitada: reintentando === r.id,
      onSelect: () => void reintentar(r),
    },
    { id: 'regla', etiqueta: t('menu.abrirRegla'), icono: ExternalLink, onSelect: () => router.push(`${BASE}/${r.automation_rule_id}`) },
  ];

  const columnas: ColumnaTabla<AutomationRunView>[] = [
    { id: 'cuando', encabezado: t('columnas.cuando'), celda: (r) => <span className="whitespace-nowrap text-[13px] text-fg">{fechaCorta(r.created_at)}</span>, ancho: 120 },
    {
      id: 'regla',
      encabezado: t('columnas.regla'),
      celda: (r) => (
        <div className="min-w-0">
          <p className="truncate text-sm text-fg">{nombreRegla(r)}</p>
          {r.rule_version ? <p className="text-xs text-fg-secondary">{t('version', { n: r.rule_version })}</p> : null}
        </div>
      ),
    },
    { id: 'registro', encabezado: t('columnas.registro'), celda: registro, ocultarDebajo: 'md' },
    { id: 'resultado', encabezado: t('columnas.resultado'), celda: insignia, ancho: 140 },
    {
      id: 'detalle',
      encabezado: t('columnas.detalle'),
      celda: (r) => <p className="line-clamp-2 text-[13px] text-fg-secondary [overflow-wrap:anywhere]">{textoDetalle(r)}</p>,
      ocultarDebajo: 'lg',
    },
  ];

  const exportar = () => {
    const csv = filasACsv(
      [t('columnas.cuando'), t('columnas.regla'), t('csv.version'), t('columnas.registro'), t('columnas.resultado'), t('columnas.detalle')],
      filas.map((r) => [formatDateTime(r.created_at), nombreRegla(r), r.rule_version ?? '', r.customer_name ?? r.opportunity_name ?? '', etiquetaResultado(r), textoDetalle(r)]),
    );
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = t('csv.archivo');
    a.click();
    URL.revokeObjectURL(url);
  };

  const opcionesRegla = useMemo(() => reglas.map((r) => ({ valor: r.id, etiqueta: t('reglaValor', { nombre: r.name }) })), [reglas, t]);
  const plan = detalle && Array.isArray(detalle.result?.results) ? detalle.result.results : [];
  const evento = detalle ? sinSensibles(detalle.trigger_payload ?? {}) : null;

  return (
    <div className="min-h-screen space-y-4 bg-canvas p-4 sm:p-6">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={t('subtitulo')}
        icono={History}
        migas={[{ etiqueta: t('migas.crm'), href: '/app/crm' }, { etiqueta: t('migas.automatizaciones'), href: BASE }]}
        acciones={
          <button type="button" className={clasesBoton({ variante: 'secundario' })} disabled={estado !== 'listo'} onClick={exportar}>
            <Download aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('exportar')}
          </button>
        }
        movil={{ menu: [{ id: 'exportar', etiqueta: t('exportar'), icono: Download, deshabilitada: estado !== 'listo', onSelect: exportar }] }}
      />

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className="grid gap-3 sm:grid-cols-2 xl:w-[640px] xl:shrink-0">
          <SelectCrm
            aria-label={t('filtros.regla')}
            valor={regla}
            onValorChange={(v) => {
              setPagina(1);
              fijar({ regla: v || null }, 'replace');
            }}
            opcionVacia={t('reglaTodas')}
            opciones={opcionesRegla}
          />
          <SelectCrm
            aria-label={t('filtros.rango')}
            valor={rango}
            onValorChange={(v) => {
              setPagina(1);
              setRango(v as RangoHistorial);
            }}
            opciones={RANGOS_HISTORIAL.map((r) => ({
              valor: r,
              etiqueta: (
                <span className="inline-flex items-center gap-2">
                  <CalendarDays aria-hidden="true" className="size-4 text-fg-secondary" strokeWidth={1.5} />
                  {t(`rangos.${r}`)}
                </span>
              ),
            }))}
          />
        </div>
        <ChipsOpcion<FiltroHistorial>
          etiqueta={t('filtros.resultado')}
          valor={resultado}
          onValorChange={(v) => {
            setPagina(1);
            setResultado(v);
          }}
          opciones={FILTROS_HISTORIAL.map((f) => ({ valor: f, etiqueta: t(`chips.${f}`) }))}
        />
      </div>

      <DataTable
        columnas={columnas}
        filas={estado === 'listo' ? filas : []}
        obtenerId={(r) => r.id}
        etiqueta={t('titulo')}
        estado={estado}
        onFilaClick={setDetalle}
        etiquetaFila={(r) => `${nombreRegla(r)} · ${fechaCorta(r.created_at)}`}
        acciones={acciones}
        tarjetaMovil={(r) => (
          <div className="space-y-1.5 p-4">
            <div className="flex items-start gap-2">
              <p className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{nombreRegla(r)}</p>
              {insignia(r)}
            </div>
            {registro(r)}
            <p className="line-clamp-2 text-xs text-fg-secondary [overflow-wrap:anywhere]">{textoDetalle(r)}</p>
            <p className="text-xs text-fg-muted">{fechaCorta(r.created_at)}</p>
          </div>
        )}
        vacio={{ icono: History, titulo: t('vacio.titulo'), descripcion: t('vacio.descripcion') }}
        sinResultados={{ titulo: t('sinResultados.titulo'), descripcion: t('sinResultados.descripcion') }}
        error={{ titulo: t('error.titulo'), descripcion: t('error.descripcion') }}
        sinPermiso={{ titulo: t('sinPermiso.titulo'), descripcion: t('sinPermiso.descripcion') }}
        onReintentar={() => setRevision((n) => n + 1)}
        onLimpiarFiltros={() => {
          setPagina(1);
          fijar({ regla: null, resultado: null }, 'replace');
        }}
        filasEsqueleto={6}
        pie={
          total > TAMANO ? (
            <Pagination pagina={pagina} tamano={TAMANO} total={total} onPaginaChange={setPagina} sustantivo={{ singular: t('sustantivo.uno'), plural: t('sustantivo.otros') }} cargando={estado === 'cargando'} />
          ) : undefined
        }
      />

      <HojaDetalle
        abierto={detalle !== null}
        onAbiertoChange={(a) => { if (!a) setDetalle(null); }}
        titulo={detalle ? nombreRegla(detalle) : ''}
        subtitulo={detalle ? `${formatDateTime(detalle.created_at)}${detalle.rule_version ? ` · ${t('version', { n: detalle.rule_version })}` : ''}` : undefined}
        insignia={detalle ? insignia(detalle) : undefined}
        ocupado={reintentando !== null}
        pie={
          detalle ? (
            <>
              <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => router.push(`${BASE}/${detalle.automation_rule_id}`)}>
                <ExternalLink aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('menu.abrirRegla')}
              </button>
              {resultadoDeEjecucion(detalle) === 'error' && (
                <button type="button" className={clasesBoton({ variante: 'primario' })} disabled={reintentando !== null} onClick={() => void reintentar(detalle)}>
                  <RotateCcw aria-hidden="true" className="size-4" strokeWidth={1.5} />
                  {reintentando ? t('reintentando') : t('menu.reintentar')}
                </button>
              )}
            </>
          ) : undefined
        }
      >
        {detalle && (
          <div className="space-y-5">
            <section className="space-y-1">
              <h3 className="text-xs font-semibold text-fg-secondary">{t('hoja.registro')}</h3>
              {registro(detalle)}
            </section>
            <section className="space-y-1">
              <h3 className="text-xs font-semibold text-fg-secondary">{t('hoja.detalle')}</h3>
              <p className="text-sm text-fg [overflow-wrap:anywhere]">{textoDetalle(detalle)}</p>
            </section>
            {plan.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-xs font-semibold text-fg-secondary">{t('hoja.plan')}</h3>
                <ol className="divide-y divide-line rounded-lg border border-line">
                  {plan.map((p) => (
                    <li key={p.index} className="flex items-start gap-2 px-3 py-2 text-[13px]">
                      <span className="w-5 shrink-0 tabular-nums text-fg-muted">{p.index + 1}.</span>
                      <span className="min-w-0 flex-1 text-fg [overflow-wrap:anywhere]">
                        {p.type}
                        {p.error && <span className="block text-xs text-danger-text">{p.error}</span>}
                      </span>
                      {p.status === 'failed' && <StatusBadge estado="error" etiqueta={t('resultados.error')} tono="peligro" />}
                    </li>
                  ))}
                </ol>
              </section>
            )}
            <section className="space-y-2">
              <h3 className="text-xs font-semibold text-fg-secondary">{t('hoja.evento')}</h3>
              <pre className="max-h-64 overflow-auto rounded-lg border border-line bg-subtle p-3 font-mono text-xs text-fg">{JSON.stringify(evento, null, 2)}</pre>
              <p className="text-xs text-fg-muted">{t('hoja.sinSensibles')}</p>
            </section>
          </div>
        )}
      </HojaDetalle>
    </div>
  );
}
