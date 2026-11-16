'use client';

/**
 * Novedades con aprobación (Figma 20.12, `docs/design/figma/96-hrm-f2-12-*`):
 * llegadas tarde, ausencias, horas extra, cambios de turno y ajustes de marca del
 * período de nómina. Nacen solas (marcación, turnos, ajustes) y se aprueban o
 * rechazan antes de la nómina: solo lo aprobado pasa. Con 0 por aprobar, el
 * período se marca «lista para nómina» y queda cerrado (decisión 5).
 *
 * Decidir va por el motor de aprobaciones con la sesión del usuario (aprobador o
 * delegado, nunca lo propio); el jefe solo ve a su equipo. Horas y %, nunca pesos.
 */
import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { CalendarCheck, CalendarRange, ChevronRight, CircleCheck, CircleX, Eye, House, Info, NotebookPen, Trash2 } from 'lucide-react';
import {
  BulkActionBar,
  ConfirmDialog,
  DataTable,
  DialogoMotivo,
  FilterChips,
  FilterPanel,
  FormField,
  KpiStrip,
  ListCard,
  ListToolbar,
  PageHeader,
  Pagination,
  SearchInput,
  SegmentedControl,
  StatCard,
  type AccionFila,
  type ChipFiltro,
  type ColumnaTabla,
} from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { addPlainDays, toPlainDate } from '@/lib/utils/dateCore';
import { ErrorPersonas, pedir, useCarga } from '../personas/apiPersonas';
import { NavPestanasHrm } from '../navegacion/NavPestanasHrm';
import {
  CeldaPersona,
  InsigniaEstado,
  InsigniaListaNomina,
  RUTA_TURNOS,
  conSede,
  rutaHoja,
  useDias,
  useHora,
  usePeriodo,
  useSedeActiva,
} from '../asistencia/comunAsistencia';
import {
  areasDe,
  coincidePersona,
  conteoNovedades,
  enPestana,
  estadoVisible,
  lunesDe,
  puedeMarcarPeriodo,
  quincenaSiguiente,
  textoDuracion,
  tonoNovedad,
  type FilaNovedad,
  type PestanaNovedades,
  type RespuestaNovedades,
  type TipoNovedad,
} from '../asistencia/asistenciaLogica';
import { DialogoRevisarNovedad } from './DialogoRevisarNovedad';
import { useTextosNovedad } from './textosNovedad';

const TIPOS: readonly TipoNovedad[] = ['horas_extra', 'tardanza', 'salida_temprana', 'ausencia', 'cambio_turno', 'ajuste_marca'];

export function NovedadesPage() {
  const t = useTranslations('hrmAsistencia');
  const tc = useTranslations('hrmPersonas.comun');
  const router = useRouter();
  const sp = useSearchParams();
  const dias = useDias();
  const sede = useSedeActiva();
  const { timezone } = useFormatDate();
  const hora = useHora(timezone);
  const tx = useTextosNovedad(timezone);
  const { desde, hasta, cambiar } = usePeriodo();
  const { carga, recargar } = useCarga<RespuestaNovedades>(conSede(`/api/hrm/asistencia/novedades?desde=${desde}&hasta=${hasta}`, sede));
  const datos = carga.estado === 'listo' ? carga.datos : null;

  const tipoUrl = sp?.get('tipo');
  const [pestana, setPestana] = useState<PestanaNovedades>('por_aprobar');
  const [texto, setTexto] = useState('');
  const [tipo, setTipo] = useState<TipoNovedad | null>(TIPOS.includes(tipoUrl as TipoNovedad) ? (tipoUrl as TipoNovedad) : null);
  const [area, setArea] = useState<string | null>(null);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState(25);
  const [revisar, setRevisar] = useState<FilaNovedad | null>(null);
  const [confirmarRechazo, setConfirmarRechazo] = useState<{
    filas: FilaNovedad[];
    comentario: string;
  } | null>(null);
  const [pedirMotivo, setPedirMotivo] = useState<FilaNovedad[] | null>(null);
  const [confirmarLista, setConfirmarLista] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const todas = useMemo(() => datos?.filas ?? [], [datos]);
  const conteo = useMemo(() => conteoNovedades(todas), [todas]);
  const areas = useMemo(() => areasDe(todas), [todas]);
  const delaPestana = useMemo(() => todas.filter((f) => enPestana(f, pestana)), [todas, pestana]);
  const filtradas = useMemo(
    () =>
      delaPestana.filter(
        (f) =>
          coincidePersona(f, texto, [t(`novedades.tipos.${f.tipo}`), f.justificacion ?? '']) &&
          (!tipo || f.tipo === tipo) &&
          (!area || f.area === area)
      ),
    [delaPestana, texto, tipo, area, t]
  );
  const filas = filtradas.slice((pagina - 1) * tamano, pagina * tamano);
  const limpiar = () => {
    setTipo(null);
    setArea(null);
    setPagina(1);
  };
  const chips: ChipFiltro[] = [
    ...(tipo
      ? [
          {
            clave: 'tipo',
            etiqueta: t('filtros.chipTipo', {
              valor: t(`novedades.tipos.${tipo}`),
            }),
          },
        ]
      : []),
    ...(area ? [{ clave: 'area', etiqueta: t('filtros.chipEquipo', { valor: area }) }] : []),
  ];

  const lista = !!datos?.periodo.lista_nomina;
  const puedeMarcar = !!datos && puedeMarcarPeriodo(datos, conteo.porAprobar);
  const motivoNoMarcar = conteo.porAprobar > 0 ? t('novedades.motivoNoMarcar', { n: conteo.porAprobar }) : undefined;

  const decidir = async (filasDecidir: FilaNovedad[], decision: 'aprobar' | 'rechazar', comentario: string) => {
    const instancias = filasDecidir.filter((f) => f.puede_decidir && f.instancia_id).map((f) => f.instancia_id as string);
    if (instancias.length === 0) return;
    setOcupado(true);
    try {
      const r = await pedir<{
        decididas: number;
        fallidas: Array<{ codigo: string }>;
      }>('/api/hrm/asistencia/novedades/decidir', {
        metodo: 'POST',
        cuerpo: { instancias, decision, comentario: comentario || undefined },
      });
      if (r.fallidas.length === 0) {
        toast.success(decision === 'aprobar' ? t('novedades.aprobadasN', { n: r.decididas }) : t('novedades.rechazadasN', { n: r.decididas }));
      } else {
        toast.warning(
          t('novedades.decididasParcial', {
            n: r.decididas,
            total: instancias.length,
          }),
          {
            description: t(
              `errores.decision.${['no_puede_aprobar_lo_propio', 'no_eres_aprobador'].includes(r.fallidas[0].codigo) ? r.fallidas[0].codigo : 'otra'}`
            ),
          }
        );
      }
      setSeleccion(new Set());
      setRevisar(null);
      setConfirmarRechazo(null);
      setPedirMotivo(null);
      void recargar();
    } catch (e) {
      const c = e instanceof ErrorPersonas ? e.codigo : 'error_hrm';
      toast.error(c === 'motivo_requerido' ? t('novedades.revisar.errorMotivo') : t('errores.guardar'));
    } finally {
      setOcupado(false);
    }
  };

  const marcarLista = async () => {
    setOcupado(true);
    try {
      const r = await pedir<{
        listas: number;
        pendientes: Array<{ motivo: string }>;
      }>('/api/hrm/asistencia/lista-nomina', {
        metodo: 'POST',
        cuerpo: { desde, hasta },
      });
      if (r.pendientes.length === 0) {
        toast.success(t('novedades.listaToast'), {
          description: t('novedades.listaToastDesc', {
            n: conteo.aprobadas,
            rango: dias.rango(desde, hasta),
          }),
        });
      } else {
        toast.warning(t('novedades.listaParcial', { n: r.pendientes.length }), {
          description: t(`hojas.motivos.${r.pendientes[0].motivo}`),
        });
      }
      setConfirmarLista(false);
      void recargar();
    } catch (e) {
      const c = e instanceof ErrorPersonas ? e.codigo : 'error_hrm';
      toast.error(c === 'parametro_no_configurado' ? t('errores.parametro') : c === 'sin_permiso' ? t('errores.sinPermiso') : t('errores.guardar'));
    } finally {
      setOcupado(false);
    }
  };

  /** «2 h 20 min extra», «la llegada tarde»… para el título de la confirmación. */
  const que = (f: FilaNovedad) =>
    f.tipo === 'horas_extra' && f.minutos
      ? t('novedades.rechazar.extra', { horas: textoDuracion(f.minutos) })
      : t(`novedades.rechazar.que.${f.tipo}`);
  const consecuencia = (f: FilaNovedad) => t(`novedades.rechazar.consecuencia.${f.tipo}`);

  const accionesDe = (f: FilaNovedad): AccionFila[] => [
    {
      id: 'revisar',
      etiqueta: t('acciones.revisar'),
      icono: Eye,
      onSelect: () => setRevisar(f),
    },
    {
      id: 'aprobar',
      etiqueta: t('acciones.aprobar'),
      icono: CircleCheck,
      onSelect: () => void decidir([f], 'aprobar', ''),
      oculta: !f.puede_decidir,
    },
    {
      id: 'turnos',
      etiqueta: t('acciones.verTurnosSemana'),
      icono: CalendarRange,
      onSelect: () => router.push(`${RUTA_TURNOS}?semana=${lunesDe(f.fecha)}`),
    },
    {
      id: 'hoja',
      etiqueta: t('acciones.verHoja'),
      icono: CalendarCheck,
      onSelect: () => router.push(rutaHoja(f.employment_id, desde, hasta)),
    },
    {
      id: 'rechazar',
      etiqueta: t('acciones.rechazar'),
      icono: CircleX,
      destructiva: true,
      onSelect: () => setPedirMotivo([f]),
      oculta: !f.puede_decidir,
    },
  ];

  const estadoBadge = (f: FilaNovedad) => {
    const e = estadoVisible(f);
    if (e === 'lista_nomina') return <InsigniaListaNomina>{t('estados.listaNomina')}</InsigniaListaNomina>;
    return <InsigniaEstado tono={tonoNovedad(e)}>{t(`novedades.estados.${e}`)}</InsigniaEstado>;
  };
  const novedadCelda = (f: FilaNovedad) => (
    <div className="min-w-0">
      <p className="truncate text-fg">{t(`novedades.tipos.${f.tipo}`)}</p>
      <p className="truncate text-xs text-fg-secondary">{tx.cuando(f)}</p>
    </div>
  );
  const columnas: ColumnaTabla<FilaNovedad>[] = [
    {
      id: 'persona',
      encabezado: t('novedades.columnas.persona'),
      celda: (f) => <CeldaPersona p={f} />,
    },
    {
      id: 'novedad',
      encabezado: t('novedades.columnas.novedad'),
      celda: novedadCelda,
    },
    {
      id: 'detalle',
      encabezado: t('novedades.columnas.detalle'),
      ocultarDebajo: 'md',
      celda: (f) => <span className="line-clamp-2">{tx.detalle(f)}</span>,
    },
    {
      id: 'origen',
      encabezado: t('novedades.columnas.origen'),
      ocultarDebajo: 'lg',
      celda: (f) => tx.origen(f),
    },
    {
      id: 'estado',
      encabezado: t('novedades.columnas.estado'),
      celda: estadoBadge,
    },
  ];

  const seleccionadas = todas.filter((f) => seleccion.has(f.id));
  const decidibles = seleccionadas.filter((f) => f.puede_decidir);
  const sinPermiso = carga.estado === 'sinPermiso';
  const rango = dias.rango(desde, hasta);
  const subtitulo = sinPermiso
    ? t('periodo.subtitulo', { rango })
    : lista && datos?.periodo.listo_en
      ? `${t('periodo.subtitulo', { rango })} · ${t('novedades.listaDesde', { cuando: `${dias.completo(toPlainDate(new Date(datos.periodo.listo_en), timezone))}, ${hora(datos.periodo.listo_en)}` })}`
      : datos
        ? [
            t('periodo.subtitulo', { rango }),
            todas.length === 0 ? t('novedades.sinNovedades') : t('novedades.nPorAprobar', { n: conteo.porAprobar }),
            t('novedades.cierra', { dia: dias.diaMes(addPlainDays(hasta, 1)) }),
          ].join(' · ')
        : t('periodo.subtitulo', { rango });

  const accionCabecera = !datos ? undefined : lista ? (
    <Button variant="outline" onClick={() => cambiar(quincenaSiguiente(hasta))}>
      <ChevronRight className="size-4" aria-hidden="true" /> {t('novedades.periodoSiguiente')}
    </Button>
  ) : datos.puede_gestionar ? (
    <Button
      onClick={() => setConfirmarLista(true)}
      disabled={!puedeMarcar}
      title={motivoNoMarcar}
      aria-describedby={motivoNoMarcar ? 'motivo-no-marcar' : undefined}
    >
      <CircleCheck className="size-4" aria-hidden="true" /> {t('acciones.marcarLista')}
    </Button>
  ) : undefined;

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        titulo={t('novedades.titulo')}
        subtitulo={subtitulo}
        icono={NotebookPen}
        migas={[{ etiqueta: tc('migas.rrhh'), href: '/app/hrm/empleados' }, { etiqueta: t('novedades.titulo') }]}
        cargando={carga.estado === 'cargando'}
        acciones={accionCabecera}
        debajo={sinPermiso ? undefined : <NavPestanasHrm incrustada />}
        movil={{ subtitulo }}
      />
      {motivoNoMarcar && datos?.puede_gestionar && !lista && (
        <p id="motivo-no-marcar" className="-mt-2 text-xs text-fg-secondary">
          {motivoNoMarcar}
        </p>
      )}

      {datos && todas.length > 0 && conteo.porAprobar === 0 && (
        <KpiStrip etiqueta={t('novedades.resumen')}>
          <StatCard
            etiqueta={t('novedades.kpi.aprobadas')}
            valor={String(conteo.aprobadas)}
            detalle={t('novedades.kpi.aprobadasDetalle')}
            tono="exito"
            tendencia="sube"
          />
          <StatCard
            etiqueta={t('novedades.kpi.rechazadas')}
            valor={String(conteo.rechazadas)}
            detalle={t('novedades.kpi.rechazadasDetalle')}
            tono="peligro"
            tendencia="baja"
          />
          <StatCard etiqueta={t('novedades.kpi.porAprobar')} valor={String(conteo.porAprobar)} />
        </KpiStrip>
      )}

      {!sinPermiso && carga.estado !== 'error' && (
        <SegmentedControl
          etiqueta={t('novedades.pestanas.etiqueta')}
          valor={pestana}
          onValorChange={(v) => {
            setPestana(v);
            setPagina(1);
            setSeleccion(new Set());
          }}
          opciones={[
            {
              valor: 'por_aprobar',
              etiqueta: t('novedades.pestanas.por_aprobar'),
            },
            { valor: 'aprobadas', etiqueta: t('novedades.pestanas.aprobadas') },
            { valor: 'todas', etiqueta: t('novedades.pestanas.todas') },
          ]}
          className="self-start"
        />
      )}

      {!sinPermiso && carga.estado !== 'error' && (carga.estado !== 'listo' || delaPestana.length > 0 || chips.length > 0) && (
        <ListToolbar
          busqueda={
            <SearchInput
              value={texto}
              onChange={(v) => {
                setTexto(v);
                setPagina(1);
              }}
              placeholder={t('novedades.buscar')}
              etiqueta={t('novedades.buscar')}
            />
          }
          filtros={
            <FilterPanel
              conteo={chips.length}
              onLimpiar={limpiar}
              textoVerResultados={t('filtros.verNovedades', {
                n: filtradas.length,
              })}
            >
              <FormField etiqueta={t('filtros.tipo')}>
                {(c) => (
                  <Select
                    value={tipo ?? '__todos'}
                    onValueChange={(v) => {
                      setTipo(v === '__todos' ? null : (v as TipoNovedad));
                      setPagina(1);
                    }}
                  >
                    <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__todos">{t('filtros.todos')}</SelectItem>
                      {TIPOS.map((x) => (
                        <SelectItem key={x} value={x}>
                          {t(`novedades.tipos.${x}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
              <FormField etiqueta={t('filtros.equipo')}>
                {(c) => (
                  <Select
                    value={area ?? '__todos'}
                    onValueChange={(v) => {
                      setArea(v === '__todos' ? null : v);
                      setPagina(1);
                    }}
                  >
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
              <FilterChips chips={chips} onQuitar={(c) => (c === 'tipo' ? setTipo(null) : setArea(null))} onLimpiarTodo={limpiar} />
            ) : undefined
          }
        />
      )}

      <DataTable
        etiqueta={t('novedades.titulo')}
        columnas={columnas}
        filas={filas}
        obtenerId={(f) => f.id}
        estado={
          carga.estado === 'cargando'
            ? 'cargando'
            : sinPermiso
              ? 'sinPermiso'
              : carga.estado !== 'listo'
                ? 'error'
                : delaPestana.length === 0 && !texto && chips.length === 0
                  ? 'vacio'
                  : filtradas.length === 0
                    ? 'sinResultados'
                    : 'listo'
        }
        seleccion={pestana === 'por_aprobar' ? seleccion : undefined}
        onSeleccionChange={pestana === 'por_aprobar' ? setSeleccion : undefined}
        onFilaClick={(f) => setRevisar(f)}
        etiquetaFila={(f) => `${t(`novedades.tipos.${f.tipo}`)} · ${f.nombre}`}
        acciones={accionesDe}
        tarjetaMovil={(f, ctx) => (
          <ListCard
            avatar={{ nombre: f.nombre }}
            titulo={f.nombre}
            subtitulo={`${t(`novedades.tipos.${f.tipo}`)} · ${tx.cuando(f)}`}
            meta={tx.detalle(f)}
            estado={estadoBadge(f)}
            onClick={() => setRevisar(f)}
            acciones={accionesDe(f)}
            seleccionable={ctx.modoSeleccion}
            seleccionado={ctx.seleccionado}
            onSeleccionChange={ctx.alternar}
            onMantenerPulsado={pestana === 'por_aprobar' ? () => ctx.alternar(true) : undefined}
          />
        )}
        vacio={{
          titulo: pestana === 'por_aprobar' ? t('novedades.vacio.titulo') : t('novedades.vacio.tituloOtras'),
          descripcion: t('novedades.vacio.descripcion'),
          icono: NotebookPen,
          accion: puedeMarcar
            ? {
                etiqueta: t('acciones.marcarLista'),
                onClick: () => setConfirmarLista(true),
                icono: CircleCheck,
              }
            : undefined,
        }}
        sinResultados={{
          titulo: t('novedades.sinResultados.titulo'),
          descripcion: t('novedades.sinResultados.descripcion'),
          icono: NotebookPen,
        }}
        error={{
          titulo: t('novedades.error.titulo'),
          descripcion: t('novedades.error.descripcion'),
          icono: NotebookPen,
        }}
        sinPermiso={{
          titulo: t('novedades.sinPermiso.titulo'),
          descripcion: t('novedades.sinPermiso.descripcion'),
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
        pie={
          <Pagination
            pagina={pagina}
            tamano={tamano}
            total={filtradas.length}
            onPaginaChange={setPagina}
            onTamanoChange={(n) => {
              setTamano(n);
              setPagina(1);
            }}
            opcionesTamano={[10, 25, 50, 100]}
            sustantivo={{
              singular: t('novedades.sustantivo.singular'),
              plural: t('novedades.sustantivo.plural'),
            }}
            cargando={carga.estado === 'cargando'}
          />
        }
      />

      {seleccion.size > 0 && (
        <BulkActionBar
          seleccionados={seleccion.size}
          total={filtradas.length}
          onSeleccionarTodos={() => setSeleccion(new Set(filtradas.map((f) => f.id)))}
          sustantivo={{
            singular: t('novedades.sustantivo.singular'),
            plural: t('novedades.sustantivo.plural'),
            genero: 'femenino',
          }}
          acciones={[
            {
              id: 'aprobar',
              etiqueta: t('acciones.aprobar'),
              icono: CircleCheck,
              onClick: () => void decidir(decidibles, 'aprobar', ''),
              cargando: ocupado,
              deshabilitada: decidibles.length === 0,
              motivo: decidibles.length === 0 ? t('novedades.motivoNingunaDecidible') : undefined,
            },
            {
              id: 'rechazar',
              etiqueta: t('acciones.rechazar'),
              icono: CircleX,
              onClick: () => setPedirMotivo(decidibles),
              deshabilitada: decidibles.length === 0,
              motivo: decidibles.length === 0 ? t('novedades.motivoNingunaDecidible') : undefined,
            },
          ]}
          onLimpiar={() => setSeleccion(new Set())}
        />
      )}

      <DialogoRevisarNovedad
        novedad={revisar}
        zona={timezone}
        ocupado={ocupado}
        onCerrar={() => setRevisar(null)}
        onAprobar={(f, comentario) => void decidir([f], 'aprobar', comentario)}
        onRechazar={(f, comentario) => setConfirmarRechazo({ filas: [f], comentario })}
      />

      {confirmarRechazo && (
        <ConfirmDialog
          abierto
          onAbiertoChange={(a) => !a && setConfirmarRechazo(null)}
          tono="peligro"
          icono={Trash2}
          titulo={t('novedades.rechazar.titulo', {
            que: que(confirmarRechazo.filas[0]),
            nombre: confirmarRechazo.filas[0].nombre,
          })}
          descripcion={t('novedades.rechazar.descripcion', {
            consecuencia: consecuencia(confirmarRechazo.filas[0]),
            nombre: confirmarRechazo.filas[0].nombre.split(' ')[0],
            comentario: confirmarRechazo.comentario,
          })}
          textoConfirmar={t('acciones.rechazar')}
          cargando={ocupado}
          onConfirmar={() => decidir(confirmarRechazo.filas, 'rechazar', confirmarRechazo.comentario)}
        />
      )}

      {pedirMotivo && (
        <DialogoMotivo
          abierto
          onAbiertoChange={(a) => !a && setPedirMotivo(null)}
          titulo={
            pedirMotivo.length === 1
              ? t('novedades.rechazar.titulo', {
                  que: que(pedirMotivo[0]),
                  nombre: pedirMotivo[0].nombre,
                })
              : t('novedades.rechazar.tituloVarias', { n: pedirMotivo.length })
          }
          descripcion={pedirMotivo.length === 1 ? consecuencia(pedirMotivo[0]) : t('novedades.rechazar.descripcionVarias')}
          etiquetaMotivo={t('novedades.revisar.comentario')}
          textoConfirmar={t('acciones.rechazar')}
          minimo={3}
          maximo={2000}
          cargando={ocupado}
          onConfirmar={(motivo) => decidir(pedirMotivo, 'rechazar', motivo)}
        />
      )}

      {confirmarLista && datos && (
        <ConfirmDialog
          abierto
          onAbiertoChange={setConfirmarLista}
          tono="marca"
          icono={Info}
          titulo={t('novedades.marcar.titulo', { rango })}
          descripcion={t('novedades.marcar.descripcion', {
            n: conteo.aprobadas,
          })}
          textoConfirmar={t('acciones.marcarLista')}
          cargando={ocupado}
          onConfirmar={marcarLista}
        />
      )}
    </div>
  );
}
