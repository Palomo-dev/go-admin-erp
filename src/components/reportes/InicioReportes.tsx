'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Star } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ListCard, SearchInput, StatCard, Tarjeta, normalizarBusqueda, type TonoStat } from '@/components/kit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { reportePermitido } from '@/lib/services/reportes/alcanceSucursal';
import { compararKpis } from '@/lib/services/reportes/comparativo';
import { filtrosEfectivos } from '@/lib/services/reportes/filtrosUrl';
import { KPIS_INICIO, kpiDe, reportesDeKpis, valorNumerico, type IdKpiInicio } from '@/lib/services/reportes/inicioKpis';
import { listarGuardados, marcarFavorito, type ReporteGuardado } from '@/lib/services/reportes/lecturasReportes';
import { periodoAnterior } from '@/lib/services/reportes/periodosService';
import { getReporteById } from '@/lib/services/reportes/reportesCatalogo';
import { ejecutarReporte } from '@/lib/services/reportes/reportesEngine';
import type { ReportData } from '@/lib/services/reportes/types';
import { aQuery } from '@/lib/services/reportes/filtrosUrl';
import { iconoDeGrupo } from './iconoGrupo';
import { rutaGrupo, rutaReporte } from './rutasReportes';
import { useEtiquetaPeriodo } from './SelectorPeriodo';
import type { ContextoReportes } from './useContextoReportes';
import { useFormatoReporte } from './useFormatoReporte';
import type { FiltrosReportes } from '@/lib/services/reportes/filtrosUrl';

export function InicioReportes({
  ctx,
  filtros,
  query,
  recarga,
  onVerHistorial,
}: {
  ctx: ContextoReportes;
  filtros: FiltrosReportes;
  query: string;
  recarga: number;
  onVerHistorial: () => void;
}) {
  const t = useTranslations('reportes');
  const router = useRouter();
  const [texto, setTexto] = useState('');
  const busqueda = normalizarBusqueda(texto);
  const enPlan = useMemo(() => new Set(ctx.grupos.flatMap((g) => g.reportes.map((r) => r.id))), [ctx.grupos]);
  const total = enPlan.size;

  const grupos = ctx.grupos
    .map((g) => ({
      ...g,
      visibles: busqueda ? g.reportes.filter((r) => normalizarBusqueda(`${r.titulo} ${r.descripcion}`).includes(busqueda)) : g.reportes,
    }))
    .filter((g) => g.visibles.length > 0);

  const fuera = ctx.grupos.filter((g) => g.reportes.length === 0 && g.bloqueados.length > 0 && g.grupo.vertical);

  return (
    <div className="flex flex-col gap-6">
      <SearchInput value={texto} onChange={setTexto} onValueChange={setTexto} debounceMs={0} placeholder={t('inicio.buscar', { n: total })} etiqueta={t('inicio.buscarCorto')} atajo="/" />
      <KpisInicio ctx={ctx} filtros={filtros} enPlan={enPlan} query={query} />
      <Recientes ctx={ctx} query={query} recarga={recarga} onVerHistorial={onVerHistorial} />
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-fg">{t('inicio.porModulo')}</h2>
        <p className="text-sm text-fg-secondary">{t('inicio.hint')}</p>
      </div>
      <div className="hidden gap-4 lg:grid lg:grid-cols-2 xl:grid-cols-3">
        {grupos.map((g) => (
          <Tarjeta
            key={g.grupo.id}
            icono={iconoDeGrupo(g.grupo.icono)}
            titulo={t(`grupos.${g.grupo.id}`)}
            descripcion={
              <span>
                {t('inicio.conteo', { n: g.reportes.length })}
                {g.reportes.some((r) => r.nuevo) && <span className="text-brand"> · {t('inicio.nuevos', { n: g.reportes.filter((r) => r.nuevo).length })}</span>}
              </span>
            }
            pie={
              <Link href={rutaGrupo(g.grupo.id, query)} className="text-sm font-medium text-link">
                {t('inicio.verLos', { n: g.reportes.length })} →
              </Link>
            }
          >
            <ul className="flex flex-col gap-2">
              {g.visibles.slice(0, 3).map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2">
                  <Link href={rutaReporte(g.grupo.id, r.id, query)} className="truncate text-sm text-fg hover:text-link">
                    {r.titulo}
                  </Link>
                  <span className="flex shrink-0 gap-1">
                    {r.nuevo && <Etiqueta>{t('badges.nuevo')}</Etiqueta>}
                    {r.filtros.slice(0, 2).map((f) => (
                      <Etiqueta key={f}>{t(`filtroTipo.${f}`)}</Etiqueta>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </Tarjeta>
        ))}
      </div>
      <ul className="flex flex-col gap-2 lg:hidden">
        {grupos.map((g) => (
          <li key={g.grupo.id}>
            <ListCard icono={iconoDeGrupo(g.grupo.icono)} titulo={t(`grupos.${g.grupo.id}`)} subtitulo={t(`gruposDesc.${g.grupo.id}`)} valor={g.reportes.length} onClick={() => router.push(rutaGrupo(g.grupo.id, query))} />
          </li>
        ))}
      </ul>
      {fuera.length > 0 && !busqueda && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-subtle p-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-fg">{t('inicio.fueraPlan', { n: fuera.length })}</p>
            <p className="text-[13px] text-fg-secondary">
              {t('inicio.fueraDesc', { nombres: fuera.map((g) => t(`grupos.${g.grupo.id}`)).join(', '), reportes: fuera.reduce((s, g) => s + g.bloqueados.length, 0) })}
            </p>
          </div>
          <Link href="/app/organizacion/plan" className="text-sm font-medium text-link">
            {t('inicio.verPlanes')}
          </Link>
        </div>
      )}
    </div>
  );
}

function Etiqueta({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-subtle px-2 py-0.5 text-[11px] font-medium text-fg-secondary">{children}</span>;
}

function KpisInicio({ ctx, filtros, enPlan, query }: { ctx: ContextoReportes; filtros: FiltrosReportes; enPlan: Set<string>; query: string }) {
  const t = useTranslations('reportes');
  const formato = useFormatoReporte();
  const etiqueta = useEtiquetaPeriodo();
  const [datos, setDatos] = useState<Map<string, ReportData | null>>(new Map());
  const [cargando, setCargando] = useState(true);

  const orgId = ctx.orgId;
  const contextoListo = !ctx.cargando;
  const accesoTotal = ctx.accesoTotal;
  const resolverSucursal = ctx.resolverSucursal;

  const fuentes = useMemo(
    () =>
      KPIS_INICIO.filter((f) => {
        const def = getReporteById(f.reportId);
        return !!def && enPlan.has(f.reportId) && reportePermitido(def, accesoTotal);
      }),
    [enPlan, accesoTotal],
  );

  useEffect(() => {
    if (!orgId || !contextoListo) return;
    let vivo = true;
    setCargando(true);
    const ids = reportesDeKpis(fuentes);
    void (async () => {
      const mapa = new Map<string, ReportData | null>();
      await Promise.all(
        ids.map(async (id) => {
          const def = getReporteById(id);
          if (!def || !enPlan.has(id) || !reportePermitido(def, accesoTotal)) return;
          const sucursal = def.alcance === 'organizacion' ? null : resolverSucursal(filtros);
          try {
            mapa.set(id, await ejecutarReporte(id, orgId, filtrosEfectivos(def, filtros, sucursal).periodo, sucursal));
          } catch {
            mapa.set(id, null);
          }
        }),
      );
      const ventas = getReporteById('ventas-periodo');
      if (ventas && mapa.get('ventas-periodo')) {
        const sucursal = resolverSucursal(filtros);
        try {
          mapa.set('ventas-periodo-anterior', await ejecutarReporte('ventas-periodo', orgId, periodoAnterior(filtrosEfectivos(ventas, filtros, sucursal).periodo), sucursal));
        } catch {
          mapa.set('ventas-periodo-anterior', null);
        }
      }
      if (vivo) {
        setDatos(mapa);
        setCargando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [orgId, contextoListo, accesoTotal, resolverSucursal, filtros, enPlan, fuentes]);

  if (fuentes.length === 0) return null;
  return (
    <div className="hidden gap-3 sm:grid sm:grid-cols-2 xl:grid-cols-3">
      {fuentes.map((f) => {
        const kpi = kpiDe(datos.get(f.reportId), f.kpi);
        const valor = formato.valor(kpi?.valor ?? null, kpi?.formato);
        let detalle: string | undefined;
        let tono: TonoStat = 'neutro';
        let tendencia: 'sube' | 'baja' | undefined;
        if (f.id === 'ventas') {
          const variacion = compararKpis(datos.get('ventas-periodo') ?? vacio(), datos.get('ventas-periodo-anterior') ?? null).find((v) => v.titulo === f.kpi);
          if (variacion?.porcentaje != null) {
            tendencia = variacion.porcentaje >= 0 ? 'sube' : 'baja';
            detalle = t('inicio.vs', { signo: '', valor: formato.porcentaje(Math.abs(variacion.porcentaje)), periodo: etiqueta.periodo(periodoAnterior(filtros.periodo)) });
          }
        } else if (f.detalle) {
          const extra = kpiDe(datos.get(f.detalle.reportId), f.detalle.kpi);
          const n = valorNumerico(extra);
          if (f.id === 'utilidad' && extra) detalle = t('inicio.detalleMargen', { valor: formato.valor(extra.valor, extra.formato) });
          if ((f.id === 'cobrar' || f.id === 'pagar') && n) {
            detalle = t('inicio.detalleVencido', { valor: formato.valor(n, 'moneda') });
            tono = 'advertencia';
          }
          if (f.id === 'inventario' && n) {
            detalle = t('inicio.detalleBajo', { n });
            tono = n > 0 ? 'advertencia' : 'neutro';
          }
        }
        return (
          <StatCard
            key={f.id}
            etiqueta={t(`inicio.kpis.${f.id as IdKpiInicio}`)}
            valor={cargando ? undefined : valor}
            cargando={cargando}
            detalle={detalle}
            tono={tono}
            tendencia={tendencia}
            iconoDetalle={tono === 'advertencia' ? AlertTriangle : undefined}
            href={rutaReporte(getReporteById(f.reportId)?.grupo ?? 'ventas', f.reportId, query)}
          />
        );
      })}
    </div>
  );
}

function vacio(): ReportData {
  return { id: '', titulo: '', modulo: '', kpis: [], columnas: [], filas: [], generadoEn: '', periodo: { tipo: 'mensual', fechaInicio: '', fechaFin: '', etiqueta: '' } };
}

function Recientes({ ctx, query, recarga, onVerHistorial }: { ctx: ContextoReportes; query: string; recarga: number; onVerHistorial: () => void }) {
  const t = useTranslations('reportes');
  const { formatDateTime } = useFormatDate();
  const [filas, setFilas] = useState<ReporteGuardado[] | null>(null);

  useEffect(() => {
    if (!ctx.orgId) return;
    let vivo = true;
    void listarGuardados(ctx.orgId).then((lista) => vivo && setFilas(lista)).catch(() => vivo && setFilas([]));
    return () => {
      vivo = false;
    };
  }, [ctx.orgId, recarga]);

  const recientes = (filas ?? []).filter((f) => f.usadoEn && getReporteById(f.reportId)).slice(0, 4);
  if (filas && recientes.length === 0) return null;

  const alternar = (f: ReporteGuardado) => {
    if (!ctx.orgId) return;
    setFilas((prev) => prev?.map((x) => (x.reportId === f.reportId ? { ...x, favorito: !f.favorito } : x)) ?? prev);
    void marcarFavorito(ctx.orgId, f.reportId, !f.favorito).catch(() => setFilas(filas));
  };

  return (
    <section className="hidden flex-col gap-3 lg:flex">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-fg">{t('inicio.recientes')}</h2>
        <button type="button" className="text-sm font-medium text-link" onClick={onVerHistorial}>
          {t('inicio.verHistorial')}
        </button>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {recientes.map((f) => {
          const def = getReporteById(f.reportId)!;
          const q = Object.keys(f.filtros).length > 0 ? aQuery(f.filtros) : query;
          return (
            <li key={f.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3">
              <Link href={rutaReporte(def.grupo, def.id, q)} className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg">{def.titulo}</p>
                <p className="truncate text-xs text-fg-secondary">{f.usadoEn ? formatDateTime(f.usadoEn) : ''}</p>
              </Link>
              <button type="button" aria-pressed={f.favorito} aria-label={t(f.favorito ? 'visor.quitarFavorito' : 'visor.favorito')} onClick={() => alternar(f)}>
                <Star className={f.favorito ? 'size-4 fill-brand text-brand' : 'size-4 text-fg-muted'} strokeWidth={1.5} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
