'use client';

/**
 * Recursos humanos › Plazas (Figma 20.1, `95-hrm-01-05`, `01-15`, `01-16`):
 * presupuesto de plazas aprobadas frente a ocupadas por área y sede, aviso de
 * lo que quedó sobre lo aprobado (no bloquea a nadie: ofrece regularizar) y
 * solicitudes de plaza nueva, que pasan por el motor de aprobaciones.
 * La sede sale del selector del header (PATRONES §9).
 */
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Armchair, ArrowDown, CheckCircle2, Clock, Plus, XCircle } from 'lucide-react';
import {
  AvisoTonal,
  DataTable,
  EmptyState,
  FilterChips,
  FilterPanel,
  FormField,
  KpiStrip,
  ListCard,
  ListToolbar,
  PageHeader,
  SearchInput,
  StatCard,
  StatusBadge,
  Tarjeta,
  clasesBoton,
  type ColumnaTabla,
} from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useBranchOpcional } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { formatPlainDate } from '@/lib/utils/dateDisplay';
import { normalizarBusqueda } from '@/components/kit/arbol';
import { estadoPlaza, ordenarFilasPlaza, resumenPlazas } from '@/lib/hrm/estructura/logica';
import type { FilaPlaza, RespuestaPlazas, SolicitudPlaza } from '@/lib/hrm/estructura/tipos';
import { NavPestanasHrm } from '@/components/hrm/navegacion/NavPestanasHrm';
import { BadgePlaza, RUTA_HRM, useCarga } from '../comun';
import { SolicitarPlaza, type PrefijoSolicitud } from './SolicitarPlaza';

const TODAS = '__todas__';
const FECHA: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };

export function PlazasPage() {
  const t = useTranslations('hrmEstructura.plazas');
  const tc = useTranslations('hrmEstructura.comun');
  const sede = useBranchOpcional()?.branchFilter ?? null;
  const { carga, recargar } = useCarga<RespuestaPlazas>('/api/hrm/estructura/plazas');
  const datos = carga.estado === 'listo' ? carga.datos : null;
  const [texto, setTexto] = useState('');
  const [area, setArea] = useState<string | null>(null);
  const [solicitar, setSolicitar] = useState<PrefijoSolicitud | null>(null);
  const [direccion, setDireccion] = useState<'asc' | 'desc'>('asc');

  const nombreArea = (id: string) => datos?.areas.find((a) => a.id === id)?.nombre ?? '—';
  const nombreSede = (id: number) => datos?.sedes.find((s) => s.id === id)?.nombre ?? '—';
  const filas = useMemo(() => {
    if (!datos) return [];
    const q = normalizarBusqueda(texto);
    const lista = datos.filas.filter(
      (f) => (sede === null || f.sede_id === sede) && (!area || f.area_id === area) && (!q || normalizarBusqueda(nombreArea(f.area_id)).includes(q))
    );
    const ordenadas = ordenarFilasPlaza(lista, nombreArea, nombreSede);
    return direccion === 'asc' ? ordenadas : ordenadas.reverse();
    // nombreArea y nombreSede dependen solo de `datos`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datos, sede, area, texto, direccion]);
  const resumen = useMemo(() => resumenPlazas(filas), [filas]);
  const solicitudes = useMemo(
    () => (datos?.solicitudes ?? []).filter((s) => (sede === null || s.sede_id === sede) && (!area || s.area_id === area)),
    [datos, sede, area]
  );
  const pendientes = solicitudes.filter((s) => s.estado === 'pendiente').length;
  const puedeSolicitar = !!datos?.permisos.solicitar;
  const lugares = (lista: FilaPlaza[]) =>
    Array.from(new Set(lista.map((f) => nombreArea(f.area_id)))).join(', ') + (lista.length ? ` · ${Array.from(new Set(lista.map((f) => nombreSede(f.sede_id)))).join(', ')}` : '');

  const columnas: ColumnaTabla<FilaPlaza>[] = [
    {
      id: 'area',
      encabezado: t('columnas.areaSede'),
      ordenable: true,
      campoOrden: 'area',
      celda: (f) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-fg">{nombreArea(f.area_id)}</p>
          <p className="truncate text-xs text-fg-secondary">{nombreSede(f.sede_id)}</p>
        </div>
      ),
    },
    { id: 'ocupacion', encabezado: t('columnas.ocupacion'), celda: (f) => <Ocupacion fila={f} /> },
    { id: 'estado', encabezado: t('columnas.estado'), alinear: 'derecha', celda: (f) => <BadgePlaza aprobadas={f.aprobadas} ocupadas={f.ocupadas} /> },
  ];

  const estado =
    carga.estado === 'sinPermiso'
      ? 'sinPermiso'
      : carga.estado === 'cargando'
        ? 'cargando'
        : carga.estado === 'error' || carga.estado === 'noExiste'
          ? 'error'
          : filas.length === 0
            ? (datos?.filas.length ?? 0) === 0
              ? 'vacio'
              : 'sinResultados'
            : 'listo';
  const primeraSobre = resumen.filasSobre[0];

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={carga.estado === 'sinPermiso' ? undefined : t('subtitulo')}
        icono={Armchair}
        migas={[{ etiqueta: tc('rrhh'), href: RUTA_HRM }, { etiqueta: t('titulo') }]}
        debajo={<NavPestanasHrm incrustada />}
        cargando={carga.estado === 'cargando'}
        acciones={
          puedeSolicitar ? (
            <button type="button" onClick={() => setSolicitar({ area_id: area ?? undefined, sede_id: sede ?? undefined })} className={clasesBoton({ variante: 'primario' })}>
              <Plus aria-hidden className="size-4" strokeWidth={1.5} />
              {t('solicitar.boton')}
            </button>
          ) : undefined
        }
        movil={{
          accion: puedeSolicitar ? (
            <button
              type="button"
              onClick={() => setSolicitar({ area_id: area ?? undefined, sede_id: sede ?? undefined })}
              aria-label={t('solicitar.boton')}
              className="flex size-10 items-center justify-center rounded-lg text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Plus aria-hidden className="size-5" strokeWidth={1.5} />
            </button>
          ) : undefined,
        }}
      />

      {estado === 'sinPermiso' || estado === 'error' || estado === 'vacio' ? (
        <EmptyState
          variante={estado === 'sinPermiso' ? 'forbidden' : estado === 'error' ? 'error' : 'empty'}
          icono={estado === 'vacio' ? Armchair : undefined}
          titulo={t(`${estado}.titulo`)}
          descripcion={t(`${estado}.descripcion`)}
          accion={
            estado === 'sinPermiso'
              ? { etiqueta: tc('volverInicio'), href: '/app/inicio' }
              : estado === 'vacio' && puedeSolicitar
                ? { etiqueta: t('solicitar.boton'), onClick: () => setSolicitar({}), icono: Plus }
                : undefined
          }
          onReintentar={() => void recargar()}
        />
      ) : (
        <>
          <KpiStrip etiqueta={t('kpi.etiqueta')}>
            <StatCard
              etiqueta={t('kpi.aprobadas')}
              valor={resumen.aprobadas}
              detalle={t('kpi.enSedes', { n: resumen.sedesConPresupuesto })}
              cargando={estado === 'cargando'}
            />
            <StatCard
              etiqueta={t('kpi.ocupadas')}
              valor={resumen.ocupadas}
              detalle={resumen.porcentaje !== null ? t('kpi.porcentaje', { n: resumen.porcentaje }) : t('kpi.sinPresupuesto')}
              cargando={estado === 'cargando'}
            />
            <StatCard
              etiqueta={t('kpi.vacantes')}
              valor={resumen.vacantes}
              detalle={resumen.vacantes ? lugares(resumen.filasVacantes) : t('kpi.ninguna')}
              tono={resumen.vacantes ? 'advertencia' : 'neutro'}
              iconoDetalle={resumen.vacantes ? AlertTriangle : undefined}
              cargando={estado === 'cargando'}
            />
            <StatCard
              etiqueta={t('kpi.sobre')}
              valor={resumen.sobre}
              detalle={resumen.sobre ? lugares(resumen.filasSobre) : t('kpi.ninguna')}
              tono={resumen.sobre ? 'peligro' : 'neutro'}
              iconoDetalle={resumen.sobre ? ArrowDown : undefined}
              cargando={estado === 'cargando'}
            />
          </KpiStrip>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-5">
            <div className="flex min-w-0 flex-col gap-4">
              {primeraSobre && (
                <AvisoTonal
                  tono="neutro"
                  titulo={t('aviso.titulo', {
                    lugar: `${nombreArea(primeraSobre.area_id)} · ${nombreSede(primeraSobre.sede_id)}`,
                    personas: primeraSobre.ocupadas,
                    aprobadas: primeraSobre.aprobadas,
                  })}
                  descripcion={t('aviso.descripcion')}
                  acciones={
                    puedeSolicitar
                      ? [
                          {
                            etiqueta: t('solicitar.boton'),
                            onClick: () =>
                              setSolicitar({
                                area_id: primeraSobre.area_id,
                                sede_id: primeraSobre.sede_id,
                                justificacion: t('aviso.justificacion', { lugar: `${nombreArea(primeraSobre.area_id)} · ${nombreSede(primeraSobre.sede_id)}` }),
                              }),
                          },
                        ]
                      : undefined
                  }
                />
              )}

              <ListToolbar
                busqueda={<SearchInput value={texto} onChange={setTexto} placeholder={t('buscar')} etiqueta={t('buscar')} debounceMs={200} />}
                filtros={
                  <FilterPanel conteo={area ? 1 : 0} onLimpiar={() => setArea(null)} textoVerResultados={t('verN', { n: filas.length })}>
                    <FormField etiqueta={t('columnas.area')}>
                      {(c) => (
                        <Select value={area ?? TODAS} onValueChange={(v) => setArea(v === TODAS ? null : v)}>
                          <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={TODAS}>{t('todas')}</SelectItem>
                            {(datos?.areas ?? []).map((a) => (
                              <SelectItem key={a.id} value={a.id}>
                                {a.nombre}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </FormField>
                  </FilterPanel>
                }
                chips={area ? <FilterChips chips={[{ clave: 'area', etiqueta: nombreArea(area) }]} onQuitar={() => setArea(null)} onLimpiarTodo={() => setArea(null)} /> : undefined}
              />

              <Tarjeta titulo={t('porAreaSede')} accion={<span className="hidden text-xs text-fg-muted md:inline">{t('leyenda')}</span>} sinRelleno>
                <DataTable
                  etiqueta={t('porAreaSede')}
                  columnas={columnas}
                  filas={filas}
                  obtenerId={(f) => `${f.area_id}:${f.sede_id}`}
                  orden={{ campo: 'area', direccion }}
                  onOrdenar={() => setDireccion((d) => (d === 'asc' ? 'desc' : 'asc'))}
                  estado={estado === 'sinResultados' ? 'sinResultados' : estado === 'cargando' ? 'cargando' : 'listo'}
                  tarjetaMovil={(f) => (
                    <ListCard
                      icono={Armchair}
                      titulo={nombreArea(f.area_id)}
                      subtitulo={nombreSede(f.sede_id)}
                      meta={<Ocupacion fila={f} />}
                      estado={<BadgePlaza aprobadas={f.aprobadas} ocupadas={f.ocupadas} />}
                    />
                  )}
                  sinResultados={{ descripcion: t('sinResultados') }}
                  onLimpiarFiltros={() => {
                    setTexto('');
                    setArea(null);
                  }}
                  termino={texto}
                />
              </Tarjeta>
            </div>

            <Tarjeta
              titulo={t('solicitudes.titulo')}
              accion={
                pendientes > 0 ? (
                  <Badge tono="advertencia" tamano="sm">
                    {t('solicitudes.pendientes', { n: pendientes })}
                  </Badge>
                ) : undefined
              }
            >
              {solicitudes.length === 0 ? (
                <p className="text-sm text-fg-secondary">{t('solicitudes.vacio')}</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {solicitudes.map((s) => (
                    <Solicitud key={s.id} s={s} area={nombreArea(s.area_id)} sede={nombreSede(s.sede_id)} />
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-fg-muted">{t('solicitudes.nota')}</p>
            </Tarjeta>
          </div>
        </>
      )}

      {datos && (
        <SolicitarPlaza
          abierto={solicitar !== null}
          onAbiertoChange={(v) => !v && setSolicitar(null)}
          datos={datos}
          inicial={solicitar}
          onEnviada={() => {
            setSolicitar(null);
            void recargar();
          }}
        />
      )}
    </div>
  );
}

function Ocupacion({ fila }: { fila: FilaPlaza }) {
  const t = useTranslations('hrmEstructura.plazas');
  const e = estadoPlaza(fila.aprobadas, fila.ocupadas);
  return (
    <span className="text-sm text-fg">
      {e.tipo === 'sinPresupuesto' ? t('personasSinPresupuesto', { n: fila.ocupadas }) : t('ocupadasDe', { ocupadas: fila.ocupadas, aprobadas: fila.aprobadas })}
    </span>
  );
}

function Solicitud({ s, area, sede }: { s: SolicitudPlaza; area: string; sede: string }) {
  const t = useTranslations('hrmEstructura.plazas.solicitudes');
  const { formatDate } = useFormatDate();
  const Icono = s.estado === 'aprobada' ? CheckCircle2 : s.estado === 'pendiente' ? Clock : XCircle;
  const color = s.estado === 'aprobada' ? 'text-success-text' : s.estado === 'pendiente' ? 'text-warning-text' : 'text-danger-text';
  const vigencia = s.tipo === 'temporal' && s.hasta ? t('hasta', { fecha: formatPlainDate(s.hasta, FECHA) }) : t('permanente');
  const meta =
    s.estado === 'pendiente'
      ? t('metaPendiente', { quien: s.solicitado_por ?? '—', fecha: formatDate(s.creado), aprueba: s.aprobadores.join(', ') || '—' })
      : s.estado === 'aprobada'
        ? t('metaAprobada', { quien: s.decidido_por ?? '—', fecha: formatDate(s.decidido ?? s.creado), desde: formatPlainDate(s.desde, FECHA) })
        : s.estado === 'rechazada'
          ? t('metaRechazada', { quien: s.decidido_por ?? '—', fecha: formatDate(s.decidido ?? s.creado), motivo: s.comentario ?? '—' })
          : t('metaCancelada');
  return (
    <li className="flex flex-col gap-1 rounded-lg bg-subtle p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="flex min-w-0 items-center gap-2 text-sm font-medium text-fg">
          <Icono aria-hidden className={`size-4 shrink-0 ${color}`} strokeWidth={1.5} />
          <span className="truncate">{t('item', { cargo: s.cargo ?? '—', n: s.cantidad, temporal: s.tipo === 'temporal' ? 'si' : 'no' })}</span>
        </p>
        <StatusBadge estado={s.estado} etiqueta={t(`estados.${s.estado}`)} tamano="sm" />
      </div>
      <p className="text-xs text-fg-secondary">{[area, sede, vigencia].join(' · ')}</p>
      <p className="text-xs text-fg-muted">{meta}</p>
    </li>
  );
}
