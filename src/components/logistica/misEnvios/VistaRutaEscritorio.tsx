'use client';

/**
 * «Mis envíos» en el computador (desde 1024 px; Figma «21 Logística» a 3212-109460 y c 3216-110925):
 * cinco cifras del día (StatCards en la lista: sin tablero propio), filtros Todos / Pendientes /
 * Entregados / Novedades con búsqueda, la tabla de paradas en el orden de la ruta y el panel con el
 * mapa, el vehículo y el dinero de hoy.
 *
 * La misma vista para el domiciliario y para el supervisor: lo que cambia (acciones de cada fila,
 * botones de la cabecera, el selector «Ver la ruta de») llega por props. Los datos son los mismos
 * de la app del celular (`useMiRuta` o la ruta que lee el supervisor).
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, ArrowUp, Route } from 'lucide-react';
import { ChipsOpcion, EmptyState, PageHeader, SearchInput, Skeleton, StatCard } from '@/components/kit';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import {
  agruparMisEnvios,
  coincideParada,
  estadoPromesa,
  kpisMisEnvios,
  numeroParada,
  paradasDelFiltro,
  type FiltroParadas,
} from '@/lib/logistica/misEnvios';
import type { CuadreJornada, EnvioApp } from '@/lib/services/logistica/misEnviosService';
import { TablaParadas } from './TablaParadas';
import { PanelDinero, PanelRutaDeHoy, PanelVehiculo } from './PanelesRuta';
import type { MiVehiculo } from './useMiVehiculo';

export interface VistaRutaEscritorioProps {
  envios: readonly EnvioApp[];
  cargando: boolean;
  hoy: string;
  zonaDe: (e: EnvioApp) => string;
  subtitulo: string;
  /** Botones de la cabecera (actualizar, terminar jornada / ir a Por despachar). */
  acciones: ReactNode;
  /** Bajo la cabecera: el selector del supervisor o la franja sin conexión. */
  encima?: ReactNode;
  accionesFila: (e: EnvioApp) => ReactNode;
  onAbrir: (e: EnvioApp) => void;
  vehiculo: MiVehiculo;
  textos: { vehiculo: string; dinero: string; notaDinero: string; notaTabla: string };
  enlaceVehiculo?: { href: string; texto: string } | null;
  ultimoCuadre: CuadreJornada | null;
  origen?: { lat: number; lng: number; nombre: string } | null;
}

export function VistaRutaEscritorio(p: VistaRutaEscritorioProps) {
  const t = useTranslations('logistica.misEnvios');
  const moneda = useMonedaOrganizacion();
  const [filtro, setFiltro] = useState<FiltroParadas>('todos');
  const [busqueda, setBusqueda] = useState('');
  const [ahora, setAhora] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setAhora(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const grupos = useMemo(() => agruparMisEnvios(p.envios, p.hoy, p.zonaDe), [p.envios, p.hoy, p.zonaDe]);
  const k = useMemo(() => kpisMisEnvios(grupos, p.envios), [grupos, p.envios]);
  const filas = useMemo(() => paradasDelFiltro(grupos, filtro).filter((e) => coincideParada(e, busqueda)), [grupos, filtro, busqueda]);
  const indice = useMemo(() => new Map(grupos.pendientes.map((e, i) => [e.id, numeroParada(i, grupos.entregados.length)])), [grupos]);
  const enCaminoPromesa = k.enCamino ? estadoPromesa(k.enCamino.promesa, ahora) : null;
  const totalTodos = grupos.pendientes.length + grupos.entregados.length + grupos.novedades.length;

  return (
    <div className="flex w-full flex-col gap-4 px-6 pt-6 pb-10">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={p.subtitulo}
        icono={Route}
        migas={[{ etiqueta: t('escritorio.migaLogistica') }, { etiqueta: t('titulo') }]}
        cargando={p.cargando}
        acciones={p.acciones}
      />

      {p.encima}

      {p.cargando ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      ) : (
        <>
          <section aria-label={t('ruta.etiqueta')} className="grid grid-cols-5 gap-3">
            <StatCard tamano="sm" etiqueta={t('escritorio.kpis.asignados')} valor={k.asignados} detalle={k.asignados > 0 ? t('escritorio.paradaDe', { n: k.parada, total: k.asignados }) : t('ruta.vacia')} />
            <StatCard
              tamano="sm"
              etiqueta={t('escritorio.kpis.enCamino')}
              valor={k.enCaminoTotal}
              detalle={
                k.enCamino
                  ? [
                      k.enCamino.shipment_number,
                      enCaminoPromesa
                        ? enCaminoPromesa.tipo === 'tarde'
                          ? t('promesa.tarde', { minutos: enCaminoPromesa.minutos })
                          : t('promesa.faltan', { minutos: enCaminoPromesa.minutos })
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  : t('escritorio.kpis.nadieEnCamino')
              }
            />
            <StatCard
              tamano="sm"
              etiqueta={t('escritorio.kpis.entregados')}
              valor={k.entregados}
              detalle={k.aTiempo != null ? t('escritorio.kpis.aTiempo', { n: k.aTiempo, total: k.entregados }) : undefined}
              tono={k.aTiempo != null && k.aTiempo === k.entregados ? 'exito' : undefined}
              tendencia={k.aTiempo != null && k.aTiempo === k.entregados && k.entregados > 0 ? 'sube' : undefined}
              iconoDetalle={k.aTiempo != null && k.aTiempo === k.entregados && k.entregados > 0 ? ArrowUp : undefined}
            />
            <StatCard
              tamano="sm"
              etiqueta={t('escritorio.kpis.porCobrar')}
              valor={moneda.formatear(k.porCobrar)}
              detalle={k.porCobrarEnvios > 0 ? t('escritorio.kpis.enviosHoy', { n: k.porCobrarEnvios }) : t('escritorio.kpis.nadaPorCobrar')}
              tono={k.porCobrarEnvios > 0 ? 'advertencia' : undefined}
              iconoDetalle={k.porCobrarEnvios > 0 ? AlertTriangle : undefined}
            />
            <StatCard tamano="sm" etiqueta={t('escritorio.kpis.cuadre')} valor={moneda.formatear(k.enMano)} detalle={t('escritorio.kpis.enManoDetalle')} />
          </section>

          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="flex min-w-0 flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <ChipsOpcion<FiltroParadas>
                  etiqueta={t('pestanas.etiqueta')}
                  valor={filtro}
                  onValorChange={setFiltro}
                  opciones={[
                    { valor: 'todos', etiqueta: t('escritorio.filtros.todos', { n: totalTodos }) },
                    ...(['pendientes', 'entregados', 'novedades'] as const).map((f) => ({ valor: f, etiqueta: t(`escritorio.filtros.${f}`, { n: grupos[f].length }) })),
                  ]}
                />
                <div className="w-full max-w-xs">
                  <SearchInput value={busqueda} onChange={setBusqueda} onValueChange={setBusqueda} placeholder={t('escritorio.buscar')} etiqueta={t('escritorio.buscar')} atajo={false} />
                </div>
              </div>
              <TablaParadas
                filas={filas}
                numeroDe={(e) => indice.get(e.id) ?? null}
                zonaDe={p.zonaDe}
                ahora={ahora}
                hoy={p.hoy}
                acciones={p.accionesFila}
                onAbrir={p.onAbrir}
                vacio={<EmptyState variante="empty" compacto titulo={busqueda ? t('escritorio.sinResultados') : t(`vacio.${filtro === 'todos' ? 'pendientes' : filtro}.titulo`)} />}
              />
              <p className="text-xs text-fg-muted">{p.textos.notaTabla}</p>
            </div>

            <aside className="flex flex-col gap-4">
              <PanelRutaDeHoy grupos={grupos} envios={p.envios} zonaDe={p.zonaDe} origen={p.origen} onElegir={(id) => {
                  const e = p.envios.find((x) => x.id === id);
                  if (e) p.onAbrir(e);
                }}
              />
              <PanelVehiculo v={p.vehiculo} titulo={p.textos.vehiculo} enlace={p.enlaceVehiculo} />
              <PanelDinero
                titulo={p.textos.dinero}
                grupos={grupos}
                envios={p.envios}
                hoy={p.hoy}
                zonaDe={p.zonaDe}
                ultimoCuadre={p.ultimoCuadre}
                nota={p.textos.notaDinero}
              />
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
