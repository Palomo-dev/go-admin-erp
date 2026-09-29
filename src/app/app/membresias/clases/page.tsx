'use client';

/**
 * Membresías › Clases: Clases y Horarios en una sola página (P10), con vista
 * Lista · Calendario (`?vista=calendario`). Escrituras desde el navegador
 * contra Supabase con RLS (gymService), con la organización de la sesión y
 * los estados que acepta la base (active | completed | cancelled).
 *
 * Permisos (servidor): ver = memberships.view; crear, editar, mover, duplicar,
 * cancelar y eliminar = memberships.classes.manage.
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  Calendar,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  Copy,
  Pencil,
  Plus,
  RefreshCw,
  Rows3,
  Trash2,
  Users,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  CampoFecha,
  DataTable,
  Dialogo,
  DialogoMotivo,
  EmptyState,
  FilterChips,
  FilterPanel,
  FormField,
  KpiStrip,
  ListCard,
  ListToolbar,
  PageHeader,
  Pagination,
  SearchInput,
  StatCard,
  StatusBadge,
  ViewToggle,
  type AccionFila,
  type ChipFiltro,
  type ColumnaTabla,
  type EstadoTabla,
} from '@/components/kit';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useBranch } from '@/lib/context/BranchContext';
import { usePermisosMembresias } from '@/lib/services/membresias/clienteMembresias';
import {
  cancelClass,
  createClass,
  deleteClass,
  duplicateClass,
  getClasses,
  getInstructors,
  getOccupancyByClass,
  updateClass,
  type GymClass,
  type Instructor,
} from '@/lib/services/gymService';
import { DialogoClase, type DatosNuevaClase } from '@/components/membresias/operacion/clases/DialogoClase';
import { CalendarioSemanal } from '@/components/membresias/operacion/clases/CalendarioSemanal';
import {
  ESTADOS_CLASE,
  TONO_ESTADO_CLASE,
  coincide,
  esTipoSugerido,
  estadoClase,
  horarioMovido,
  lunesDe,
  tiposDeClase,
  type EstadoClase,
} from '@/components/membresias/operacion/logica';
import { useFechasOrg } from '@/components/membresias/operacion/useFechasOrg';
import { FiltroSelect } from '@/components/membresias/operacion/FiltroSelect';
import { addPlainDays } from '@/lib/utils/dateDisplay';

type Vista = 'lista' | 'calendario';
type Periodo = 'proximas' | 'pasadas' | 'todas';
const TAMANO = 20;
const TODOS = 'todos';

export default function ClasesPage() {
  return (
    <Suspense fallback={null}>
      <Clases />
    </Suspense>
  );
}

function Clases() {
  const t = useTranslations('membresias.clases');
  const tm = useTranslations('membresias');
  const router = useRouter();
  const params = useSearchParams();
  const vista: Vista = params?.get('vista') === 'calendario' ? 'calendario' : 'lista';
  const { organization } = useOrganization();
  const orgId = organization?.id ?? 0;
  const { branches, branchFilter, selectedBranchId } = useBranch();
  const permisos = usePermisosMembresias();
  const fechas = useFechasOrg();
  const entero = useFormatoEntero();

  const [clases, setClases] = useState<GymClass[]>([]);
  const [ocupacion, setOcupacion] = useState<Map<number, number>>(new Map());
  const [instructores, setInstructores] = useState<Instructor[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState<EstadoClase | typeof TODOS>(TODOS);
  const [tipo, setTipo] = useState<string>(TODOS);
  const [sede, setSede] = useState<string>(TODOS);
  const [instructor, setInstructor] = useState<string>(TODOS);
  const [periodo, setPeriodo] = useState<Periodo>('proximas');
  const [pagina, setPagina] = useState(1);
  const [lunes, setLunes] = useState('');

  const [editar, setEditar] = useState<{ clase: GymClass | null; propuesta: DatosNuevaClase | null } | null>(null);
  const [duplicar, setDuplicar] = useState<{ clase: GymClass; dia: string } | null>(null);
  const [cancelar, setCancelar] = useState<GymClass | null>(null);
  const [notificar, setNotificar] = useState(false);
  const [eliminar, setEliminar] = useState<GymClass | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // La sede del selector global de la barra es el filtro inicial.
  useEffect(() => {
    setSede(branchFilter ? String(branchFilter) : TODOS);
  }, [branchFilter]);

  const semana = lunes || lunesDe(fechas.hoy);

  const cargar = useCallback(async () => {
    if (!orgId || !permisos.ver) return;
    setCargando(true);
    setError(null);
    try {
      const [lista, inst] = await Promise.all([getClasses(orgId), getInstructors(orgId).catch(() => [] as Instructor[])]);
      setClases(lista);
      setInstructores(inst);
      setOcupacion(await getOccupancyByClass(lista.map((c) => c.id), orgId));
    } catch {
      setError(t('errores.cargar'));
    } finally {
      setCargando(false);
    }
  }, [orgId, permisos.ver, t]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const sucursales = useMemo(
    () => branches.filter((b): b is typeof b & { id: number } => typeof b.id === 'number').map((b) => ({ id: b.id, nombre: b.name })),
    [branches],
  );
  const nombreSede = useCallback((id: number) => sucursales.find((s) => s.id === id)?.nombre ?? '—', [sucursales]);
  const nombreInstructor = useCallback(
    (userId?: string) => {
      const i = instructores.find((x) => x.user_id === userId);
      return i ? [i.profiles?.first_name, i.profiles?.last_name].filter(Boolean).join(' ') || i.profiles?.email || '—' : '—';
    },
    [instructores],
  );
  const nombreTipo = useCallback((v: string) => (esTipoSugerido(v) ? t(`tipos.${v}`) : v), [t]);
  const tipos = useMemo(() => tiposDeClase(clases.map((c) => c.class_type)), [clases]);

  const inicioHoy = useMemo(() => fechas.hoy, [fechas.hoy]);
  const filtradas = useMemo(() => {
    return clases.filter((c) => {
      if (estado !== TODOS && estadoClase(c.status) !== estado) return false;
      if (tipo !== TODOS && c.class_type !== tipo) return false;
      if (sede !== TODOS && String(c.branch_id) !== sede) return false;
      if (instructor !== TODOS && c.instructor_id !== instructor) return false;
      if (busqueda && !(coincide(c.title, busqueda) || coincide(c.room, busqueda) || coincide(nombreTipo(c.class_type), busqueda) || coincide(nombreInstructor(c.instructor_id), busqueda)))
        return false;
      return true;
    });
  }, [clases, estado, tipo, sede, instructor, busqueda, nombreTipo, nombreInstructor]);

  const deLaLista = useMemo(() => {
    const dia = (c: GymClass) => fechas.dia(c.start_at);
    if (periodo === 'proximas') return filtradas.filter((c) => dia(c) >= inicioHoy);
    if (periodo === 'pasadas') return filtradas.filter((c) => dia(c) < inicioHoy).reverse();
    return filtradas;
  }, [filtradas, periodo, fechas, inicioHoy]);

  const deLaSemana = useMemo(() => {
    const fin = addPlainDays(semana, 7);
    return filtradas.filter((c) => {
      const d = fechas.dia(c.start_at);
      return d >= semana && d < fin;
    });
  }, [filtradas, semana, fechas]);

  useEffect(() => setPagina(1), [busqueda, estado, tipo, sede, instructor, periodo]);
  const filasPagina = deLaLista.slice((pagina - 1) * TAMANO, pagina * TAMANO);

  const kpi = useMemo(() => {
    const hoy = clases.filter((c) => fechas.dia(c.start_at) === fechas.hoy && estadoClase(c.status) !== 'cancelled');
    const proximas = clases.filter((c) => estadoClase(c.status) === 'active' && fechas.dia(c.start_at) >= fechas.hoy);
    const cupos = proximas.reduce((s, c) => s + Math.max(0, c.capacity - (ocupacion.get(c.id) ?? 0)), 0);
    return {
      hoy: hoy.length,
      proximas: proximas.length,
      completadas: clases.filter((c) => estadoClase(c.status) === 'completed').length,
      canceladas: clases.filter((c) => estadoClase(c.status) === 'cancelled').length,
      cupos,
    };
  }, [clases, ocupacion, fechas]);

  const cambiarVista = (v: Vista) => {
    const q = new URLSearchParams(params?.toString() ?? '');
    if (v === 'calendario') q.set('vista', 'calendario');
    else q.delete('vista');
    const s = q.toString();
    router.replace(`/app/membresias/clases${s ? `?${s}` : ''}`, { scroll: false });
  };

  const mensajeError = (e: unknown) => {
    const codigo = e instanceof Error ? e.message : '';
    return ['clase_con_reservas', 'clase_no_encontrada'].includes(codigo) ? t(`errores.${codigo}`) : t('errores.guardar');
  };

  const guardar = async (datos: Partial<GymClass>) => {
    try {
      if (editar?.clase) {
        await updateClass(editar.clase.id, datos, orgId);
        toast.success(t('toasts.actualizada'));
      } else {
        await createClass(datos, orgId);
        toast.success(t('toasts.creada'));
      }
      await cargar();
    } catch (e) {
      toast.error(mensajeError(e));
      throw e;
    }
  };

  const mover = async (clase: GymClass, dia: string, hora: string) => {
    const { inicio, fin } = horarioMovido(clase, dia, hora, fechas.zona);
    try {
      await updateClass(clase.id, { start_at: inicio, end_at: fin }, orgId);
      toast.success(t('toasts.movida', { dia: fechas.diaPlano(dia), hora }));
      await cargar();
    } catch (e) {
      toast.error(mensajeError(e));
    }
  };

  const ejecutar = async (accion: () => Promise<unknown>, ok: string, cerrar: () => void) => {
    setOcupado(true);
    try {
      await accion();
      toast.success(ok);
      cerrar();
      await cargar();
    } catch (e) {
      toast.error(mensajeError(e));
    } finally {
      setOcupado(false);
    }
  };

  const puedeGestionar = permisos.clases;
  const accionesDe = (c: GymClass): AccionFila[] => {
    const est = estadoClase(c.status);
    const reservas = ocupacion.get(c.id) ?? 0;
    return [
      { id: 'reservas', etiqueta: t('acciones.reservas'), icono: CalendarCheck, onSelect: () => router.push(`/app/membresias/reservas?clase=${c.id}`) },
      { id: 'editar', etiqueta: t('acciones.editar'), icono: Pencil, onSelect: () => setEditar({ clase: c, propuesta: null }), oculta: !puedeGestionar },
      {
        id: 'duplicar',
        etiqueta: t('acciones.duplicar'),
        icono: Copy,
        onSelect: () => setDuplicar({ clase: c, dia: addPlainDays(fechas.dia(c.start_at), 7) }),
        oculta: !puedeGestionar,
      },
      {
        id: 'completar',
        etiqueta: t('acciones.completar'),
        icono: CheckCircle2,
        onSelect: () => void ejecutar(() => updateClass(c.id, { status: 'completed' }, orgId), t('toasts.completada'), () => undefined),
        oculta: !puedeGestionar || est !== 'active',
        separadorAntes: true,
      },
      {
        id: 'cancelar',
        etiqueta: t('acciones.cancelar'),
        icono: XCircle,
        onSelect: () => {
          setNotificar(false);
          setCancelar(c);
        },
        oculta: !puedeGestionar || est !== 'active',
        destructiva: true,
      },
      {
        id: 'eliminar',
        etiqueta: t('acciones.eliminar'),
        icono: Trash2,
        onSelect: () => setEliminar(c),
        oculta: !puedeGestionar,
        deshabilitada: reservas > 0,
        motivo: reservas > 0 ? t('eliminar.conReservas') : undefined,
        destructiva: true,
      },
    ];
  };

  const insignia = (c: GymClass) => {
    const e = estadoClase(c.status);
    return <StatusBadge estado={e} etiqueta={t(`estados.${e}`)} tono={TONO_ESTADO_CLASE[e]} />;
  };

  const columnas: ColumnaTabla<GymClass>[] = [
    {
      id: 'clase',
      encabezado: t('tabla.clase'),
      celda: (c) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-fg">{c.title}</p>
          <p className="truncate text-xs text-fg-secondary">
            {nombreTipo(c.class_type)}
            {c.difficulty_level ? ` · ${t(`niveles.${c.difficulty_level}`)}` : ''}
          </p>
        </div>
      ),
    },
    {
      id: 'fecha',
      encabezado: t('tabla.fecha'),
      celda: (c) => (
        <div>
          <p className="capitalize text-fg">{fechas.fechaCorta(c.start_at)}</p>
          <p className="text-xs tabular-nums text-fg-secondary">
            {fechas.hora(c.start_at)}–{fechas.hora(c.end_at)}
          </p>
        </div>
      ),
    },
    { id: 'instructor', encabezado: t('tabla.instructor'), celda: (c) => nombreInstructor(c.instructor_id), ocultarDebajo: 'lg' },
    {
      id: 'sede',
      encabezado: t('tabla.sede'),
      celda: (c) => (
        <div>
          <p className="text-fg">{c.branches?.name ?? nombreSede(c.branch_id)}</p>
          {c.room && <p className="text-xs text-fg-secondary">{c.room}</p>}
        </div>
      ),
      ocultarDebajo: 'xl',
    },
    {
      id: 'cupo',
      encabezado: t('tabla.cupo'),
      alinear: 'derecha',
      variante: 'importe',
      celda: (c) => t('tabla.cupoValor', { ocupadas: ocupacion.get(c.id) ?? 0, capacidad: c.capacity }),
    },
    { id: 'estado', encabezado: t('tabla.estado'), celda: insignia },
  ];

  const chips: ChipFiltro[] = [
    ...(estado !== TODOS ? [{ clave: 'estado', etiqueta: `${t('filtros.estado')}: ${t(`estados.${estado}`)}` }] : []),
    ...(tipo !== TODOS ? [{ clave: 'tipo', etiqueta: `${t('filtros.tipo')}: ${nombreTipo(tipo)}` }] : []),
    ...(sede !== TODOS ? [{ clave: 'sede', etiqueta: `${t('filtros.sede')}: ${nombreSede(Number(sede))}` }] : []),
    ...(instructor !== TODOS ? [{ clave: 'instructor', etiqueta: `${t('filtros.instructor')}: ${nombreInstructor(instructor)}` }] : []),
  ];
  const quitarChip = (clave: string) => {
    if (clave === 'estado') setEstado(TODOS);
    if (clave === 'tipo') setTipo(TODOS);
    if (clave === 'sede') setSede(TODOS);
    if (clave === 'instructor') setInstructor(TODOS);
  };
  const limpiar = () => {
    setEstado(TODOS);
    setTipo(TODOS);
    setSede(TODOS);
    setInstructor(TODOS);
  };

  const hayFiltros = chips.length > 0 || !!busqueda;
  const estadoTabla: EstadoTabla = error
    ? 'error'
    : cargando || permisos.cargando
      ? 'cargando'
      : deLaLista.length === 0
        ? hayFiltros || (periodo !== 'todas' && clases.length > 0)
          ? 'sinResultados'
          : 'vacio'
        : 'listo';

  const migas = [{ etiqueta: tm('modulo'), href: '/app/membresias' }, { etiqueta: t('cabecera.titulo') }];

  if (!permisos.cargando && !permisos.ver) {
    return (
      <div className="flex min-h-full flex-col gap-4 bg-canvas p-4 lg:gap-6 lg:p-6">
        <PageHeader titulo={t('cabecera.titulo')} icono={Calendar} migas={migas} />
        <EmptyState variante="forbidden" descripcion={t('sinPermiso')} />
      </div>
    );
  }

  const nueva = (propuesta: DatosNuevaClase | null = null) => setEditar({ clase: null, propuesta });

  return (
    <div className="flex min-h-full min-w-0 flex-col gap-4 bg-canvas p-4 pb-28 lg:gap-6 lg:p-6 lg:pb-24">
      <PageHeader
        titulo={t('cabecera.titulo')}
        subtitulo={t('cabecera.subtitulo')}
        icono={Calendar}
        migas={migas}
        cargando={cargando}
        acciones={
          <>
            <Button variant="outline" size="icon" className="size-10" onClick={() => void cargar()} disabled={cargando} aria-label={t('cabecera.actualizar')} title={t('cabecera.actualizar')}>
              <RefreshCw aria-hidden="true" className={cargando ? 'size-4 animate-spin' : 'size-4'} />
            </Button>
            {puedeGestionar && (
              <Button className="h-10" onClick={() => nueva()}>
                <Plus aria-hidden="true" className="mr-2 size-4" />
                {t('cabecera.nueva')}
              </Button>
            )}
          </>
        }
        movil={{
          accion: puedeGestionar ? (
            <Button variant="ghost" size="icon" className="size-10" onClick={() => nueva()} aria-label={t('cabecera.nueva')}>
              <Plus aria-hidden="true" className="size-5" />
            </Button>
          ) : undefined,
        }}
      />

      <KpiStrip etiqueta={t('kpi.etiqueta')} columnas={5} className="hidden lg:grid">
        <StatCard etiqueta={t('kpi.hoy')} valor={entero(kpi.hoy)} icono={CalendarDays} cargando={cargando} />
        <StatCard etiqueta={t('kpi.programadas')} valor={entero(kpi.proximas)} detalle={t('kpi.programadasDetalle')} cargando={cargando} onClick={() => { setEstado('active'); setPeriodo('proximas'); }} />
        <StatCard etiqueta={t('kpi.cupos')} valor={entero(kpi.cupos)} icono={Users} detalle={t('kpi.cuposDetalle')} cargando={cargando} />
        <StatCard etiqueta={t('kpi.completadas')} valor={entero(kpi.completadas)} tono="exito" cargando={cargando} onClick={() => { setEstado('completed'); setPeriodo('todas'); }} />
        <StatCard etiqueta={t('kpi.canceladas')} valor={entero(kpi.canceladas)} cargando={cargando} onClick={() => { setEstado('cancelled'); setPeriodo('todas'); }} />
      </KpiStrip>

      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <ListToolbar
              busqueda={<SearchInput value={busqueda} onChange={setBusqueda} placeholder={t('busqueda.placeholder')} etiqueta={t('busqueda.etiqueta')} />}
              filtros={
                <FilterPanel conteo={chips.length} onLimpiar={limpiar} textoVerResultados={t('filtros.ver', { n: vista === 'lista' ? deLaLista.length : deLaSemana.length })}>
                  <FiltroSelect etiqueta={t('filtros.estado')} valor={estado} onValor={(v) => setEstado(v as EstadoClase | typeof TODOS)} opciones={[{ v: TODOS, e: t('filtros.todos') }, ...ESTADOS_CLASE.map((e) => ({ v: e, e: t(`estados.${e}`) }))]} />
                  <FiltroSelect etiqueta={t('filtros.tipo')} valor={tipo} onValor={setTipo} opciones={[{ v: TODOS, e: t('filtros.todos') }, ...tipos.map((x) => ({ v: x, e: nombreTipo(x) }))]} />
                  <FiltroSelect etiqueta={t('filtros.sede')} valor={sede} onValor={setSede} opciones={[{ v: TODOS, e: t('filtros.todas') }, ...sucursales.map((s) => ({ v: String(s.id), e: s.nombre }))]} />
                  <FiltroSelect
                    etiqueta={t('filtros.instructor')}
                    valor={instructor}
                    onValor={setInstructor}
                    opciones={[{ v: TODOS, e: t('filtros.todos') }, ...instructores.map((i) => ({ v: i.user_id, e: nombreInstructor(i.user_id) }))]}
                  />
                </FilterPanel>
              }
              chips={<FilterChips chips={chips} onQuitar={quitarChip} onLimpiarTodo={limpiar} />}
            />
          </div>
          <ViewToggle<Vista>
            valor={vista}
            onValorChange={cambiarVista}
            etiqueta={t('vista.etiqueta')}
            opciones={[
              { valor: 'lista', etiqueta: t('vista.lista'), icono: Rows3 },
              { valor: 'calendario', etiqueta: t('vista.calendario'), icono: CalendarDays },
            ]}
          />
        </div>
        {vista === 'lista' && (
          <div role="radiogroup" aria-label={t('periodo.etiqueta')} className="flex flex-wrap gap-2">
            {(['proximas', 'pasadas', 'todas'] as const).map((p) => (
              <Button key={p} role="radio" aria-checked={periodo === p} size="sm" variant={periodo === p ? 'default' : 'outline'} onClick={() => setPeriodo(p)}>
                {t(`periodo.${p}`)}
              </Button>
            ))}
          </div>
        )}
      </div>

      {vista === 'calendario' ? (
        error ? (
          <EmptyState variante="error" descripcion={error} onReintentar={() => void cargar()} />
        ) : (
          <CalendarioSemanal
            clases={deLaSemana}
            ocupacion={ocupacion}
            lunes={semana}
            onSemana={setLunes}
            onAbrir={(c) => (puedeGestionar ? setEditar({ clase: c, propuesta: null }) : router.push(`/app/membresias/reservas?clase=${c.id}`))}
            onNuevo={puedeGestionar ? (dia, hora) => nueva({ dia, hora }) : undefined}
            onMover={puedeGestionar ? (c, dia, hora) => void mover(c, dia, hora) : undefined}
            nombreTipo={nombreTipo}
            fechas={fechas}
          />
        )
      ) : (
        <DataTable
          etiqueta={t('tabla.etiqueta')}
          columnas={columnas}
          filas={filasPagina}
          obtenerId={(c) => String(c.id)}
          estado={estadoTabla}
          etiquetaFila={(c) => c.title}
          acciones={accionesDe}
          onFilaClick={puedeGestionar ? (c) => setEditar({ clase: c, propuesta: null }) : undefined}
          tonoFila={(c) => (estadoClase(c.status) === 'active' && (ocupacion.get(c.id) ?? 0) >= c.capacity ? 'advertencia' : undefined)}
          tarjetaMovil={(c) => (
            <ListCard
              icono={Calendar}
              titulo={c.title}
              subtitulo={`${fechas.fechaCorta(c.start_at)} · ${fechas.hora(c.start_at)}–${fechas.hora(c.end_at)}`}
              datos={[
                { icono: Users, texto: t('tabla.cupoValor', { ocupadas: ocupacion.get(c.id) ?? 0, capacidad: c.capacity }), etiqueta: t('tabla.cupo') },
              ]}
              meta={`${nombreTipo(c.class_type)} · ${nombreInstructor(c.instructor_id)}`}
              estado={insignia(c)}
              acciones={accionesDe(c)}
              onClick={puedeGestionar ? () => setEditar({ clase: c, propuesta: null }) : undefined}
            />
          )}
          vacio={{
            titulo: t('vacio.titulo'),
            descripcion: t('vacio.descripcion'),
            icono: Calendar,
            accion: puedeGestionar ? { etiqueta: t('cabecera.nueva'), onClick: () => nueva(), icono: Plus } : undefined,
          }}
          sinResultados={{ descripcion: t('vacio.sinResultados') }}
          error={{ descripcion: error ?? undefined }}
          onReintentar={() => void cargar()}
          onLimpiarFiltros={() => {
            limpiar();
            setBusqueda('');
            setPeriodo('todas');
          }}
          termino={busqueda}
          pie={
            deLaLista.length > TAMANO ? (
              <Pagination pagina={pagina} tamano={TAMANO} total={deLaLista.length} onPaginaChange={setPagina} sustantivo={{ singular: t('sustantivo.singular'), plural: t('sustantivo.plural') }} />
            ) : undefined
          }
        />
      )}

      <DialogoClase
        abierto={!!editar}
        onAbiertoChange={(v) => !v && setEditar(null)}
        clase={editar?.clase ?? null}
        propuesta={editar?.propuesta ?? null}
        sucursales={sucursales}
        sucursalPorDefecto={selectedBranchId}
        instructores={instructores}
        tipos={tipos}
        fechas={fechas}
        onGuardar={guardar}
      />

      <Dialogo
        abierto={!!duplicar}
        onAbiertoChange={(v) => !v && setDuplicar(null)}
        titulo={t('duplicar.titulo')}
        descripcion={duplicar ? t('duplicar.descripcion', { titulo: duplicar.clase.title, hora: fechas.hora(duplicar.clase.start_at) }) : undefined}
        icono={Copy}
        primario={{
          etiqueta: t('duplicar.confirmar'),
          cargando: ocupado,
          deshabilitada: !duplicar?.dia,
          onClick: () =>
            duplicar &&
            void ejecutar(() => duplicateClass(duplicar.clase.id, duplicar.dia, orgId), t('toasts.duplicada', { dia: fechas.diaPlano(duplicar.dia) }), () => setDuplicar(null)),
        }}
        textoCancelar={t('dialogo.cancelar')}
      >
        {duplicar && (
          <FormField etiqueta={t('duplicar.fecha')} obligatorio>
            <CampoFecha valor={duplicar.dia} onValorChange={(d) => setDuplicar({ ...duplicar, dia: d })} hoy={fechas.hoy} required />
          </FormField>
        )}
      </Dialogo>

      <DialogoMotivo
        abierto={!!cancelar}
        onAbiertoChange={(v) => !v && setCancelar(null)}
        titulo={t('cancelarClase.titulo')}
        descripcion={cancelar ? t('cancelarClase.descripcion', { titulo: cancelar.title, dia: fechas.fechaCorta(cancelar.start_at) }) : undefined}
        textoConfirmar={t('cancelarClase.confirmar')}
        consecuencias={cancelar ? [t('cancelarClase.consecuencia', { n: ocupacion.get(cancelar.id) ?? 0 })] : undefined}
        cargando={ocupado}
        icono={XCircle}
        onConfirmar={async (motivo) => {
          if (!cancelar) return;
          await ejecutar(() => cancelClass(cancelar.id, motivo, notificar, orgId), t('toasts.cancelada'), () => setCancelar(null));
        }}
      >
        <div className="flex items-center gap-2">
          <Checkbox id="notificar-reservas" checked={notificar} onCheckedChange={(v) => setNotificar(v === true)} />
          <Label htmlFor="notificar-reservas" className="text-sm font-normal">
            {t('cancelarClase.notificar')}
          </Label>
        </div>
      </DialogoMotivo>

      <Dialogo
        abierto={!!eliminar}
        onAbiertoChange={(v) => !v && setEliminar(null)}
        titulo={t('eliminar.titulo')}
        descripcion={eliminar ? t('eliminar.descripcion', { titulo: eliminar.title }) : undefined}
        icono={Trash2}
        primario={{
          etiqueta: t('eliminar.confirmar'),
          destructiva: true,
          cargando: ocupado,
          onClick: () => eliminar && void ejecutar(() => deleteClass(eliminar.id, orgId), t('toasts.eliminada'), () => setEliminar(null)),
        }}
        textoCancelar={t('dialogo.cancelar')}
      />
    </div>
  );
}

