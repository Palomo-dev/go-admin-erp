'use client';

/**
 * Ausencias › Vacaciones (Figma 20.13, `96-hrm-f2-13-*`).
 *
 * - Calendario del equipo con los cruces (13.1) y Solicitudes (13.3), con mes y vista en la URL.
 * - Solicitar para alguien (RR. HH., 13.2), aprobar con el cruce a la vista (13.4) y el
 *   menú de la fila (13.5): ver, ver en el calendario, interrumpir y anular.
 * - Estados: cargando, vacío, sin resultados, error y sin permiso (13.7–13.11).
 * Lo que cada quien ve lo decide la base (jefe: su equipo; RR. HH.: todos).
 */
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Ban, CalendarDays, ChevronLeft, ChevronRight, Eye, Pause, Plus, TreePalm } from 'lucide-react';
import {
  AvisoTonal,
  DataTable,
  EmptyState,
  FilterChips,
  FilterPanel,
  ListCard,
  ListToolbar,
  PageHeader,
  SearchInput,
  SegmentedControl,
  Skeleton,
  StatusBadge,
  clasesBoton,
  useParametrosUrl,
  type AccionFila,
  type ChipFiltro,
  type ColumnaTabla,
} from '@/components/kit';
import { Checkbox } from '@/components/ui/checkbox';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { NavPestanasHrm } from '../navegacion/NavPestanasHrm';
import {
  FILTROS_VACIOS,
  ausentesPorDia,
  conteoFiltros,
  cruceDeFila,
  esMes,
  estadoVisible,
  filtrarAusencias,
  mesDeDia,
  primerDia,
  sumarMes,
  tramosDeCruce,
  ultimoDia,
  type EstadoVisible,
  type FilaAusencia,
  type FiltrosAusencias,
  type Seccion,
} from './ausenciasLogica';
import { CalendarioVacaciones } from './CalendarioVacaciones';
import { DialogoAprobarAusencia } from './DialogoAprobarAusencia';
import { DialogoSolicitarVacaciones } from './DialogoSolicitarVacaciones';
import { DialogoAnular, DialogoInterrumpir } from './DialogosAusencia';
import { BarraSecciones, CeldaPersona, EstadoAusencia, RUTA_MIS_VACACIONES, useFechas, useListaAusencias } from './piezasAusencias';

const ESTADOS_FILTRO: readonly EstadoVisible[] = ['por_aprobar', 'por_aprobar_rrhh', 'aprobada', 'en_curso', 'disfrutada', 'rechazada', 'cancelada'];
type Vista = 'calendario' | 'solicitudes';

export function VacacionesVista({ seccion, onSeccion }: { seccion: Seccion; onSeccion: (s: Seccion) => void }) {
  const t = useTranslations('hrmAusencias.vacaciones');
  const ta = useTranslations('hrmAusencias');
  const tc = useTranslations('hrmPersonas.comun');
  const f = useFechas();
  const { getToday } = useFormatDate();
  const hoyLocal = getToday();
  const { leer, fijar } = useParametrosUrl();
  const mesUrl = leer('mes');
  const mes = esMes(mesUrl) ? mesUrl : mesDeDia(hoyLocal);
  const vista: Vista = leer('vista') === 'solicitudes' ? 'solicitudes' : 'calendario';
  const desde = primerDia(mes);
  const hasta = vista === 'calendario' ? ultimoDia(mes) : ultimoDia(sumarMes(mes, 1));
  const { carga, recargar } = useListaAusencias('vacaciones', desde, hasta);
  const [filtros, setFiltros] = useState<FiltrosAusencias>(FILTROS_VACIOS);
  const [abierta, setAbierta] = useState<FilaAusencia | null>(null);
  const [solicitar, setSolicitar] = useState(false);
  const [anular, setAnular] = useState<FilaAusencia | null>(null);
  const [interrumpir, setInterrumpir] = useState<FilaAusencia | null>(null);
  const [orden, setOrden] = useState<'asc' | 'desc' | null>(null);

  const datos = carga.estado === 'listo' ? carga.datos : null;
  const hoy = datos?.hoy ?? hoyLocal;
  const todas = useMemo(() => datos?.filas ?? [], [datos]);
  const filas = useMemo(() => {
    const r = filtrarAusencias(todas, filtros, hoy, () => ta('secciones.vacaciones'));
    return orden ? [...r].sort((a, b) => (orden === 'asc' ? 1 : -1) * (a.nombre ?? '').localeCompare(b.nombre ?? '', f.locale)) : r;
  }, [todas, filtros, hoy, ta, orden, f.locale]);
  const areas = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of todas) if (x.area_id) m.set(x.area_id, x.area ?? '—');
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1], f.locale));
  }, [todas, f.locale]);
  const tramos = useMemo(() => tramosDeCruce(ausentesPorDia(filas, desde, ultimoDia(mes))), [filas, desde, mes]);
  const personasQueSalen = new Set(filas.filter((x) => x.estado !== 'rejected' && x.estado !== 'cancelled').map((x) => x.vinculo_id)).size;
  const porAprobar = todas.filter((x) => x.estado === 'requested').length;
  const permisos = datos?.permisos;
  const sinPermiso = carga.estado === 'sinPermiso';

  const irVista = (v: Vista) => fijar({ vista: v === 'calendario' ? null : v }, 'replace');
  const irMes = (n: number) => fijar({ mes: sumarMes(mes, n) }, 'replace');
  const cambiar = (p: Partial<FiltrosAusencias>) => setFiltros((x) => ({ ...x, ...p }));
  const limpiar = () => setFiltros((x) => ({ ...FILTROS_VACIOS, texto: x.texto }));

  const chips: ChipFiltro[] = [
    ...(filtros.areas.length ? [{ clave: 'areas', etiqueta: t('chipEquipo', { lista: filtros.areas.map((id) => areas.find(([a]) => a === id)?.[1] ?? '—').join(` ${t('y')} `) }) }] : []),
    ...(filtros.estados.length ? [{ clave: 'estados', etiqueta: filtros.estados.map((e) => ta(`estados.${e}`)).join(', ') }] : []),
  ];

  const accionesDe = (x: FilaAusencia): AccionFila[] => {
    const e = estadoVisible(x, hoy);
    return [
      { id: 'ver', etiqueta: t('menu.ver'), icono: Eye, onSelect: () => setAbierta(x) },
      {
        id: 'calendario',
        etiqueta: t('menu.calendario'),
        icono: CalendarDays,
        onSelect: () => fijar({ vista: null, mes: mesDeDia(x.desde) }, 'replace'),
        oculta: vista === 'calendario',
      },
      {
        id: 'interrumpir',
        etiqueta: t('menu.interrumpir'),
        descripcion: t('menu.interrumpirDescripcion'),
        icono: Pause,
        onSelect: () => setInterrumpir(x),
        oculta: !permisos?.aprobar || !(e === 'en_curso' || e === 'aprobada') || x.desde === x.hasta,
      },
      {
        id: 'anular',
        etiqueta: t('menu.anular'),
        icono: Ban,
        destructiva: true,
        separadorAntes: true,
        onSelect: () => setAnular(x),
        oculta: !(permisos?.aprobar || (x.propio && x.estado === 'requested')) || !(e === 'por_aprobar' || e === 'por_aprobar_rrhh' || e === 'aprobada' || e === 'en_curso'),
      },
    ];
  };

  const subtitulo =
    vista === 'calendario'
      ? [
          f.mesAnio(mes),
          datos ? t('salen', { n: personasQueSalen }) : null,
          tramos.length ? t('nCruces', { n: tramos.length, area: tramos[0].area ?? '—' }) : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : [t('solicitudesDe', { mes1: f.mes(mes), mes2: f.mes(sumarMes(mes, 1)) }), porAprobar ? t('nPorAprobar', { n: porAprobar }) : null].filter(Boolean).join(' · ');

  const accionPrincipal = permisos?.registrar ? (
    <button type="button" className={clasesBoton({ variante: 'primario', tamano: 'md' })} onClick={() => setSolicitar(true)}>
      <Plus aria-hidden className="size-4" strokeWidth={1.5} />
      {t('solicitarParaAlguien')}
    </button>
  ) : datos?.mio ? (
    <Link href={RUTA_MIS_VACACIONES} className={clasesBoton({ variante: 'secundario', tamano: 'md' })}>
      <TreePalm aria-hidden className="size-4" strokeWidth={1.5} />
      {t('irMisVacaciones')}
    </Link>
  ) : null;

  const columnas: ColumnaTabla<FilaAusencia>[] = [
    { id: 'persona', encabezado: t('columnas.persona'), ordenable: true, campoOrden: 'nombre', celda: (x) => <CeldaPersona fila={x} /> },
    {
      id: 'fechas',
      encabezado: t('columnas.fechas'),
      celda: (x) => (
        <div className="min-w-0">
          <p className="text-fg">{f.rango(x.desde, x.hasta)}</p>
          <p className="text-xs text-fg-secondary">{x.regresa <= hoy ? t('regreso', { dia: f.diaSemana(x.regresa) }) : t('regresa', { dia: f.diaSemana(x.regresa) })}</p>
        </div>
      ),
    },
    { id: 'habiles', encabezado: t('columnas.habiles'), alinear: 'derecha', ocultarDebajo: 'md', celda: (x) => <span className="tabular-nums">{t('nDias', { n: f.dias(x.dias_habiles ?? x.dias_calendario) })}</span> },
    { id: 'saldo', encabezado: t('columnas.saldo'), alinear: 'derecha', ocultarDebajo: 'lg', celda: (x) => <span className="tabular-nums">{x.saldo_despues === null ? '—' : t('nDias', { n: f.dias(x.saldo_despues) })}</span> },
    {
      id: 'cruces',
      encabezado: t('columnas.cruces'),
      ocultarDebajo: 'md',
      celda: (x) => {
        const c = cruceDeFila(x);
        return c ? (
          <StatusBadge estado="cruce" tono={c.aprobado ? 'peligro' : 'advertencia'} etiqueta={t('cruceCelda', { area: x.area ?? '—', rango: f.rangoCorto(c.desde, c.hasta) })} />
        ) : (
          <span className="text-fg-muted">—</span>
        );
      },
    },
    { id: 'estado', encabezado: t('columnas.estado'), celda: (x) => <EstadoAusencia fila={x} hoy={hoy} /> },
  ];

  const estadoTabla = carga.estado === 'cargando' ? 'cargando' : sinPermiso ? 'sinPermiso' : carga.estado !== 'listo' ? 'error' : filas.length === 0 ? (todas.length === 0 ? 'vacio' : 'sinResultados') : 'listo';

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={sinPermiso ? t('solicitudesDe', { mes1: f.mes(mes), mes2: f.mes(sumarMes(mes, 1)) }) : subtitulo}
        icono={TreePalm}
        migas={[{ etiqueta: tc('migas.rrhh'), href: '/app/hrm/empleados' }, { etiqueta: ta('titulo') }]}
        cargando={carga.estado === 'cargando'}
        acciones={sinPermiso ? undefined : accionPrincipal}
        debajo={sinPermiso ? undefined : <NavPestanasHrm incrustada />}
        movil={{
          subtitulo,
          accion: permisos?.registrar ? (
            <button type="button" aria-label={t('solicitarParaAlguien')} onClick={() => setSolicitar(true)}>
              <Plus aria-hidden className="size-5" strokeWidth={1.5} />
            </button>
          ) : undefined,
        }}
      />

      {sinPermiso ? (
        <EmptyState
          variante="forbidden"
          titulo={t('sinPermiso.titulo')}
          descripcion={t('sinPermiso.descripcion')}
          accion={{ etiqueta: t('irMisVacaciones'), href: RUTA_MIS_VACACIONES, icono: TreePalm }}
        />
      ) : (
        <>
          <BarraSecciones
            valor={seccion}
            onValor={onSeccion}
            derecha={
              <>
                <SegmentedControl
                  etiqueta={t('vistaEtiqueta')}
                  valor={vista}
                  onValorChange={irVista}
                  opciones={[
                    { valor: 'calendario', etiqueta: t('calendario') },
                    { valor: 'solicitudes', etiqueta: t('solicitudes') },
                  ]}
                />
                {vista === 'calendario' ? (
                  <div className="flex items-center gap-1">
                    <button type="button" aria-label={t('mesAnterior')} onClick={() => irMes(-1)} className={clasesBoton({ variante: 'secundario', tamano: 'md', className: 'w-10 px-0' })}>
                      <ChevronLeft aria-hidden className="size-4" strokeWidth={1.5} />
                    </button>
                    <span className="min-w-36 px-2 text-center text-sm font-medium text-fg" aria-live="polite">
                      {f.mesAnio(mes).replace(/ de /, ' ')}
                    </span>
                    <button type="button" aria-label={t('mesSiguiente')} onClick={() => irMes(1)} className={clasesBoton({ variante: 'secundario', tamano: 'md', className: 'w-10 px-0' })}>
                      <ChevronRight aria-hidden className="size-4" strokeWidth={1.5} />
                    </button>
                  </div>
                ) : null}
              </>
            }
          />

          {(todas.length > 0 || carga.estado === 'cargando' || conteoFiltros(filtros) > 0 || filtros.texto) && carga.estado !== 'error' ? (
            <ListToolbar
              busqueda={<SearchInput value={filtros.texto} onChange={(v) => cambiar({ texto: v })} placeholder={t('buscar')} etiqueta={t('buscar')} />}
              filtros={
                <FilterPanel conteo={conteoFiltros(filtros)} onLimpiar={limpiar} textoVerResultados={t('verN', { n: filas.length })}>
                  {areas.length > 0 ? (
                    <fieldset className="flex flex-col gap-2">
                      <legend className="mb-1 text-sm font-medium text-fg">{t('filtros.equipo')}</legend>
                      {areas.map(([id, nombre]) => (
                        <label key={id} className="flex min-h-9 cursor-pointer items-center gap-3 text-sm text-fg">
                          <Checkbox
                            checked={filtros.areas.includes(id)}
                            onCheckedChange={(v) => cambiar({ areas: v === true ? [...filtros.areas, id] : filtros.areas.filter((a) => a !== id) })}
                          />
                          {nombre}
                        </label>
                      ))}
                    </fieldset>
                  ) : null}
                  <fieldset className="flex flex-col gap-2">
                    <legend className="mb-1 text-sm font-medium text-fg">{t('filtros.estado')}</legend>
                    {ESTADOS_FILTRO.map((e) => (
                      <label key={e} className="flex min-h-9 cursor-pointer items-center gap-3 text-sm text-fg">
                        <Checkbox
                          checked={filtros.estados.includes(e)}
                          onCheckedChange={(v) => cambiar({ estados: v === true ? [...filtros.estados, e] : filtros.estados.filter((x) => x !== e) })}
                        />
                        {ta(`estados.${e}`)}
                      </label>
                    ))}
                  </fieldset>
                </FilterPanel>
              }
              chips={
                chips.length ? (
                  <FilterChips chips={chips} onQuitar={(c) => cambiar(c === 'areas' ? { areas: [] } : { estados: [] })} onLimpiarTodo={limpiar} />
                ) : undefined
              }
            />
          ) : null}

          {vista === 'calendario' && carga.estado === 'listo' && todas.length > 0 ? (
            <>
              {tramos.length > 0 ? (
                <AvisoTonal
                  tono="advertencia"
                  titulo={t('avisoCruce', {
                    n: tramos.length,
                    nombres: tramos[0].personas.join(` ${t('y')} `),
                    area: tramos[0].area ?? '—',
                    rango: f.rangoCorto(tramos[0].desde, tramos[0].hasta),
                  })}
                  descripcion={t('avisoCruceDetalle', { area: tramos[0].area ?? '—', quedan: tramos[0].quedan, total: tramos[0].total })}
                  accion={{ etiqueta: t('verSolicitudes'), onClick: () => irVista('solicitudes') }}
                />
              ) : null}
              {filas.length === 0 ? (
                <EmptyState variante="search" termino={filtros.texto} onLimpiarFiltros={() => setFiltros(FILTROS_VACIOS)} />
              ) : (
                <CalendarioVacaciones mes={mes} filas={filas} festivos={datos?.festivos ?? []} hoy={hoy} onAbrir={setAbierta} accionesDe={accionesDe} />
              )}
              {(datos?.festivos ?? []).filter((x) => x.fecha.startsWith(mes)).length > 0 ? (
                <p className="text-sm text-fg-secondary">
                  {t('notaFestivos', {
                    mes: f.mes(mes),
                    lista: (datos?.festivos ?? [])
                      .filter((x) => x.fecha.startsWith(mes))
                      .map((x) => `${f.diaSemana(x.fecha)} (${x.nombre})`)
                      .join(', '),
                  })}
                </p>
              ) : null}
            </>
          ) : vista === 'calendario' && carga.estado === 'cargando' ? (
            <Skeleton className="h-[480px] w-full rounded-xl" />
          ) : (
            <DataTable
              etiqueta={t('titulo')}
              columnas={columnas}
              filas={filas}
              obtenerId={(x) => x.id}
              estado={estadoTabla}
              orden={orden ? { campo: 'nombre', direccion: orden } : undefined}
              onOrdenar={() => setOrden((o) => (o === 'asc' ? 'desc' : 'asc'))}
              onFilaClick={setAbierta}
              etiquetaFila={(x) => x.nombre ?? '—'}
              acciones={accionesDe}
              tarjetaMovil={(x) => (
                <ListCard
                  avatar={{ nombre: x.nombre ?? '?' }}
                  titulo={x.nombre ?? '—'}
                  subtitulo={`${f.rangoCorto(x.desde, x.hasta)} · ${t('nHabiles', { n: f.dias(x.dias_habiles ?? x.dias_calendario) })}`}
                  meta={x.area ?? undefined}
                  estado={<EstadoAusencia fila={x} hoy={hoy} />}
                  onClick={() => setAbierta(x)}
                  acciones={accionesDe(x)}
                />
              )}
              vacio={{
                titulo: t('vacio.titulo'),
                descripcion: t('vacio.descripcion'),
                icono: TreePalm,
                accion: permisos?.registrar ? { etiqueta: t('solicitarParaAlguien'), onClick: () => setSolicitar(true), icono: Plus } : undefined,
              }}
              sinResultados={{ descripcion: t('sinResultados') }}
              onLimpiarFiltros={() => setFiltros(FILTROS_VACIOS)}
              termino={filtros.texto}
              error={{ titulo: t('error') }}
              sinPermiso={{ titulo: t('sinPermiso.titulo'), descripcion: t('sinPermiso.descripcion') }}
              onReintentar={() => void recargar()}
            />
          )}
        </>
      )}

      <DialogoAprobarAusencia fila={abierta} festivos={datos?.festivos ?? []} onCerrar={() => setAbierta(null)} onResuelta={() => void recargar()} />
      <DialogoSolicitarVacaciones abierto={solicitar} onAbiertoChange={setSolicitar} hoy={hoy} paraAlguien onHecho={() => void recargar()} />
      <DialogoAnular fila={anular} onCerrar={() => setAnular(null)} onHecho={() => void recargar()} />
      <DialogoInterrumpir fila={interrumpir} hoy={hoy} onCerrar={() => setInterrumpir(null)} onHecho={() => void recargar()} />
    </div>
  );
}
