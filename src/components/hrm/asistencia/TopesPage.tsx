'use client';

/**
 * Horas extra y recargos › alertas de topes del período (Figma 20.11.3–20.11.9).
 * Una fila por persona y semana contra los topes vigentes (horas extra al día y a
 * la semana, jornada máxima), leídos en la fecha de cada semana. Un tope superado
 * no bloquea: exige motivo y aprobación antes de la nómina. Se llega desde
 * Asistencia, por eso esa pestaña queda activa.
 */
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CalendarCheck, CalendarRange, ClockArrowUp, Eye, House, NotebookPen } from 'lucide-react';
import {
  DataTable,
  FilterChips,
  FilterPanel,
  FormField,
  ListCard,
  ListToolbar,
  PageHeader,
  SearchInput,
  type AccionFila,
  type ChipFiltro,
  type ColumnaTabla,
} from '@/components/kit';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCarga } from '../personas/apiPersonas';
import { NavPestanasHrm } from '../navegacion/NavPestanasHrm';
import {
  CeldaPersona,
  InsigniaEstado,
  RUTA_ASISTENCIA,
  RUTA_NOVEDADES,
  RUTA_TURNOS,
  conSede,
  rutaHoras,
  useDias,
  usePeriodo,
  useSedeActiva,
} from './comunAsistencia';
import { areasDe, coincidePersona, textoDuracion, tonoTope, topePrincipal, type FilaTope, type RespuestaTopes } from './asistenciaLogica';

export function TopesPage() {
  const t = useTranslations('hrmAsistencia');
  const tc = useTranslations('hrmPersonas.comun');
  const router = useRouter();
  const dias = useDias();
  const sede = useSedeActiva();
  const { desde, hasta } = usePeriodo();
  const { carga, recargar } = useCarga<RespuestaTopes>(conSede(`/api/hrm/asistencia/topes?desde=${desde}&hasta=${hasta}`, sede));
  const datos = carga.estado === 'listo' ? carga.datos : null;
  const [texto, setTexto] = useState('');
  const [soloSuperados, setSoloSuperados] = useState(true);
  const [area, setArea] = useState<string | null>(null);

  const todas = useMemo(() => datos?.filas ?? [], [datos]);
  const superadas = useMemo(() => todas.filter((f) => topePrincipal(f) !== null), [todas]);
  const areas = useMemo(() => areasDe(todas), [todas]);
  const filas = useMemo(
    () => (soloSuperados ? superadas : todas).filter((f) => coincidePersona(f, texto) && (!area || f.area === area)),
    [todas, superadas, soloSuperados, texto, area]
  );
  const personasConTope = new Set(superadas.map((f) => f.employment_id)).size;
  const limpiar = () => {
    setSoloSuperados(false);
    setArea(null);
  };
  const chips: ChipFiltro[] = [
    ...(soloSuperados ? [{ clave: 'superados', etiqueta: t('topes.soloSuperados') }] : []),
    ...(area ? [{ clave: 'area', etiqueta: t('filtros.chipEquipo', { valor: area }) }] : []),
  ];

  const tope = (f: FilaTope) => {
    const p = topePrincipal(f);
    if (!p) return <span className="text-fg-muted">—</span>;
    const horas = p === 'semanal' ? f.max_semana_horas : p === 'diario' ? f.max_dia_horas : f.jornada_horas;
    return <InsigniaEstado tono={tonoTope(p)}>{t(`topes.tipos.${p}`, { horas })}</InsigniaEstado>;
  };
  const acciones = (f: FilaTope): AccionFila[] => [
    {
      id: 'desglose',
      etiqueta: t('acciones.verDesglose'),
      icono: Eye,
      onSelect: () => router.push(rutaHoras(f.employment_id, f.semana, f.hasta)),
    },
    {
      id: 'novedades',
      etiqueta: t('acciones.verNovedadesExtra'),
      icono: NotebookPen,
      onSelect: () => router.push(`${RUTA_NOVEDADES}?desde=${desde}&hasta=${hasta}&tipo=horas_extra`),
    },
    {
      id: 'turnos',
      etiqueta: t('acciones.verTurnosSemana'),
      icono: CalendarRange,
      onSelect: () => router.push(`${RUTA_TURNOS}?semana=${f.semana}`),
    },
  ];
  const num = (v: string) => <span className="whitespace-nowrap tabular-nums">{v}</span>;
  const columnas: ColumnaTabla<FilaTope>[] = [
    {
      id: 'persona',
      encabezado: t('topes.columnas.persona'),
      celda: (f) => <CeldaPersona p={f} />,
    },
    {
      id: 'semana',
      encabezado: t('topes.columnas.semana'),
      celda: (f) => <span className="whitespace-nowrap">{dias.rangoCorto(f.semana, f.hasta)}</span>,
    },
    {
      id: 'horas',
      encabezado: t('topes.columnas.horas'),
      variante: 'importe',
      ocultarDebajo: 'md',
      celda: (f) => num(textoDuracion(f.trabajadas)),
    },
    {
      id: 'extra',
      encabezado: t('topes.columnas.extra'),
      variante: 'importe',
      celda: (f) => num(textoDuracion(f.extra)),
    },
    {
      id: 'dia',
      encabezado: t('topes.columnas.diaMax'),
      ocultarDebajo: 'lg',
      celda: (f) => (f.dia_max ? <span className="whitespace-nowrap">{`${dias.corto(f.dia_max)} · ${textoDuracion(f.extra_dia_max)}`}</span> : '—'),
    },
    { id: 'tope', encabezado: t('topes.columnas.tope'), celda: tope },
  ];
  const movilSub = (f: FilaTope) => {
    const p = topePrincipal(f);
    if (p === 'jornada')
      return t('topes.movilJornada', {
        horas: textoDuracion(f.trabajadas),
        semana: dias.rangoCorto(f.semana, f.hasta),
      });
    if (p === 'diario' && f.dia_max)
      return t('topes.movilDiario', {
        horas: textoDuracion(f.extra_dia_max),
        dia: dias.corto(f.dia_max),
      });
    return t('topes.movilSemanal', {
      horas: textoDuracion(f.extra),
      semana: dias.rangoCorto(f.semana, f.hasta),
    });
  };

  const sinPermiso = carga.estado === 'sinPermiso';
  const subtitulo = [
    t('periodo.subtitulo', { rango: dias.rango(desde, hasta) }),
    datos && personasConTope > 0 ? t('topes.nPersonas', { n: personasConTope }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        titulo={t('topes.titulo')}
        subtitulo={subtitulo}
        icono={ClockArrowUp}
        migas={[{ etiqueta: tc('migas.rrhh'), href: '/app/hrm/empleados' }, { etiqueta: t('topes.titulo') }]}
        cargando={carga.estado === 'cargando'}
        debajo={sinPermiso ? undefined : <NavPestanasHrm incrustada />}
        movil={{ subtitulo }}
      />

      {!sinPermiso && carga.estado !== 'error' && (carga.estado !== 'listo' || superadas.length > 0 || !soloSuperados) && (
        <ListToolbar
          busqueda={<SearchInput value={texto} onChange={setTexto} placeholder={t('topes.buscar')} etiqueta={t('topes.buscar')} />}
          filtros={
            <FilterPanel
              conteo={chips.length}
              onLimpiar={limpiar}
              textoVerResultados={t('filtros.verPersonas', {
                n: filas.length,
              })}
            >
              <label className="flex min-h-10 cursor-pointer items-center gap-3 text-sm text-fg">
                <Checkbox checked={soloSuperados} onCheckedChange={(v) => setSoloSuperados(v === true)} />
                {t('topes.soloSuperados')}
              </label>
              <FormField etiqueta={t('filtros.equipo')}>
                {(c) => (
                  <Select value={area ?? '__todos'} onValueChange={(v) => setArea(v === '__todos' ? null : v)}>
                    <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__todos">{t('filtros.todos')}</SelectItem>
                      {areas.map((a) => (
                        <SelectItem key={a} value={a}>
                          {a}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
            </FilterPanel>
          }
          chips={
            chips.length > 0 ? (
              <FilterChips chips={chips} onQuitar={(c) => (c === 'superados' ? setSoloSuperados(false) : setArea(null))} onLimpiarTodo={limpiar} />
            ) : undefined
          }
        />
      )}

      <DataTable
        etiqueta={t('topes.titulo')}
        columnas={columnas}
        filas={filas}
        obtenerId={(f) => `${f.employment_id}-${f.semana}`}
        estado={
          carga.estado === 'cargando'
            ? 'cargando'
            : sinPermiso
              ? 'sinPermiso'
              : carga.estado !== 'listo'
                ? 'error'
                : (soloSuperados ? superadas : todas).length === 0 && !texto && !area
                  ? 'vacio'
                  : filas.length === 0
                    ? 'sinResultados'
                    : 'listo'
        }
        onFilaClick={(f) => router.push(rutaHoras(f.employment_id, f.semana, f.hasta))}
        etiquetaFila={(f) => f.nombre}
        acciones={acciones}
        tarjetaMovil={(f) => (
          <ListCard
            avatar={{ nombre: f.nombre }}
            titulo={f.nombre}
            subtitulo={movilSub(f)}
            meta={[f.cargo, f.area].filter(Boolean).join(' · ') || undefined}
            estado={tope(f)}
            onClick={() => router.push(rutaHoras(f.employment_id, f.semana, f.hasta))}
            acciones={acciones(f)}
          />
        )}
        vacio={{
          titulo: t('topes.vacio.titulo'),
          descripcion: datos
            ? t('topes.vacio.descripcion', {
                dia: datos.vigentes.max_dia_horas,
                semana: datos.vigentes.max_semana_horas,
                jornada: datos.vigentes.jornada_horas,
              })
            : undefined,
          icono: ClockArrowUp,
          accion: {
            etiqueta: t('topes.vacio.accion'),
            href: `${RUTA_ASISTENCIA}?vista=hojas&desde=${desde}&hasta=${hasta}`,
            icono: CalendarCheck,
          },
        }}
        sinResultados={{
          titulo: t('topes.sinResultados.titulo'),
          descripcion: t('topes.sinResultados.descripcion'),
          icono: ClockArrowUp,
        }}
        error={{
          titulo: t('topes.error.titulo'),
          descripcion: t('topes.error.descripcion'),
          icono: ClockArrowUp,
        }}
        sinPermiso={{
          titulo: t('topes.sinPermiso.titulo'),
          descripcion: t('topes.sinPermiso.descripcion'),
          accion: {
            etiqueta: t('comun.irAlInicio'),
            href: '/app/inicio',
            icono: House,
          },
        }}
        onLimpiarFiltros={() => {
          limpiar();
          setTexto('');
        }}
        onReintentar={() => void recargar()}
        termino={texto}
      />

      {datos && filas.length > 0 && (
        <p className="text-sm text-fg-secondary">
          {t('topes.nota', {
            dia: datos.vigentes.max_dia_horas,
            semana: datos.vigentes.max_semana_horas,
            jornada: datos.vigentes.jornada_horas,
          })}
        </p>
      )}
    </div>
  );
}
