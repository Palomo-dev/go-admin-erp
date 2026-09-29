'use client';

/**
 * Membresías › Instructores (antes /app/gym/instructores). Salen de HRM:
 * empleos activos de la organización en el departamento GYM o con cargo
 * INST-*. Carga semanal en la zona de la organización y asistencia real.
 *
 * Permisos: ver = memberships.view; editar disponibilidad = memberships.classes.manage.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CalendarDays, Clock, Percent, RefreshCw, User, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AvatarIniciales,
  DataTable,
  EmptyState,
  KpiStrip,
  ListCard,
  ListToolbar,
  PageHeader,
  SearchInput,
  SegmentedControl,
  StatCard,
  StatusBadge,
  type ColumnaTabla,
  type EstadoTabla,
} from '@/components/kit';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { usePermisosMembresias } from '@/lib/services/membresias/clienteMembresias';
import { getAttendanceByInstructor, getClasses, getInstructors, type GymClass, type Instructor } from '@/lib/services/gymService';
import { PanelInstructor } from '@/components/membresias/operacion/instructores/PanelInstructor';
import { coincide, estadoClase, instanteEnZona, lunesDe } from '@/components/membresias/operacion/logica';
import { useFechasOrg } from '@/components/membresias/operacion/useFechasOrg';
import { addPlainDays } from '@/lib/utils/dateDisplay';

type FiltroEstado = 'todos' | 'activos' | 'inactivos';

interface Fila {
  instructor: Instructor;
  nombre: string;
  clasesSemana: number;
  horasSemana: number;
  asistencia: number | null;
}

export default function InstructoresPage() {
  const t = useTranslations('membresias.instructores');
  const tm = useTranslations('membresias');
  const { organization } = useOrganization();
  const orgId = organization?.id ?? 0;
  const permisos = usePermisosMembresias();
  const fechas = useFechasOrg();
  const entero = useFormatoEntero();

  const [instructores, setInstructores] = useState<Instructor[]>([]);
  const [clases, setClases] = useState<GymClass[]>([]);
  const [asistencia, setAsistencia] = useState<Map<string, { reservas: number; asistencias: number }>>(new Map());
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState<FiltroEstado>('todos');
  const [abierto, setAbierto] = useState<Instructor | null>(null);

  const lunes = lunesDe(fechas.hoy);

  const cargar = useCallback(async () => {
    if (!orgId || !permisos.ver) return;
    setCargando(true);
    setError(null);
    try {
      const [inst, cls, asis] = await Promise.all([
        getInstructors(orgId),
        // Semana actual y las dos siguientes: carga semanal y horario de la ficha.
        getClasses(orgId, { dateFrom: instanteEnZona(lunes, '00:00', fechas.zona), dateTo: instanteEnZona(addPlainDays(lunes, 21), '00:00', fechas.zona) }),
        getAttendanceByInstructor(orgId).catch(() => new Map<string, { reservas: number; asistencias: number }>()),
      ]);
      setInstructores(inst);
      setClases(cls);
      setAsistencia(asis);
    } catch {
      setError(t('errores.cargar'));
    } finally {
      setCargando(false);
    }
  }, [orgId, permisos.ver, lunes, fechas.zona, t]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const nombre = useCallback(
    (i: Instructor) => [i.profiles?.first_name, i.profiles?.last_name].filter(Boolean).join(' ') || i.profiles?.email || i.employee_code || t('sinNombre'),
    [t],
  );

  const filas: Fila[] = useMemo(() => {
    const fin = addPlainDays(lunes, 7);
    return instructores.map((i) => {
      const semana = clases.filter((c) => {
        if (c.instructor_id !== i.user_id || estadoClase(c.status) === 'cancelled') return false;
        const d = fechas.dia(c.start_at);
        return d >= lunes && d < fin;
      });
      const minutos = semana.reduce((s, c) => s + Math.max(0, (new Date(c.end_at).getTime() - new Date(c.start_at).getTime()) / 60_000), 0);
      const a = asistencia.get(i.user_id);
      return {
        instructor: i,
        nombre: nombre(i),
        clasesSemana: semana.length,
        horasSemana: Math.round((minutos / 60) * 10) / 10,
        asistencia: a && a.reservas > 0 ? a.asistencias / a.reservas : null,
      };
    });
  }, [instructores, clases, asistencia, lunes, fechas, nombre]);

  const visibles = useMemo(
    () =>
      filas.filter((f) => {
        if (estado === 'activos' && !f.instructor.is_active) return false;
        if (estado === 'inactivos' && f.instructor.is_active) return false;
        return !busqueda || coincide(f.nombre, busqueda) || coincide(f.instructor.profiles?.email, busqueda) || coincide(f.instructor.position?.name, busqueda);
      }),
    [filas, estado, busqueda],
  );

  const pct = (v: number | null) => (v === null ? '—' : new Intl.NumberFormat(fechas.locale, { style: 'percent', maximumFractionDigits: 0 }).format(v));
  const horas = (v: number) => new Intl.NumberFormat(fechas.locale, { maximumFractionDigits: 1 }).format(v);

  const kpi = useMemo(() => {
    const tot = [...asistencia.values()].reduce((s, a) => ({ r: s.r + a.reservas, a: s.a + a.asistencias }), { r: 0, a: 0 });
    return {
      total: filas.length,
      activos: filas.filter((f) => f.instructor.is_active).length,
      clases: filas.reduce((s, f) => s + f.clasesSemana, 0),
      horas: filas.reduce((s, f) => s + f.horasSemana, 0),
      asistencia: tot.r > 0 ? tot.a / tot.r : null,
    };
  }, [filas, asistencia]);

  const columnas: ColumnaTabla<Fila>[] = [
    {
      id: 'instructor',
      encabezado: t('tabla.instructor'),
      celda: (f) => (
        <div className="flex min-w-0 items-center gap-3">
          <AvatarIniciales nombre={f.nombre} src={f.instructor.profiles?.avatar_url} tamano="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium text-fg">{f.nombre}</p>
            <p className="truncate text-xs text-fg-secondary">{f.instructor.profiles?.email ?? ''}</p>
          </div>
        </div>
      ),
    },
    { id: 'cargo', encabezado: t('tabla.cargo'), celda: (f) => f.instructor.position?.name ?? '—', ocultarDebajo: 'lg' },
    { id: 'clases', encabezado: t('tabla.clasesSemana'), alinear: 'derecha', variante: 'importe', celda: (f) => entero(f.clasesSemana) },
    { id: 'horas', encabezado: t('tabla.horasSemana'), alinear: 'derecha', variante: 'importe', celda: (f) => horas(f.horasSemana) },
    { id: 'asistencia', encabezado: t('tabla.asistencia'), alinear: 'derecha', variante: 'importe', celda: (f) => pct(f.asistencia), ocultarDebajo: 'md' },
    {
      id: 'estado',
      encabezado: t('tabla.estado'),
      celda: (f) => <StatusBadge estado={f.instructor.is_active ? 'active' : 'inactive'} etiqueta={f.instructor.is_active ? t('estados.activo') : t('estados.inactivo')} />,
    },
  ];

  const estadoTabla: EstadoTabla = error
    ? 'error'
    : cargando || permisos.cargando
      ? 'cargando'
      : visibles.length === 0
        ? filas.length > 0
          ? 'sinResultados'
          : 'vacio'
        : 'listo';

  const migas = [{ etiqueta: tm('modulo'), href: '/app/membresias' }, { etiqueta: t('cabecera.titulo') }];
  if (!permisos.cargando && !permisos.ver) {
    return (
      <div className="flex min-h-full flex-col gap-4 bg-canvas p-4 lg:gap-6 lg:p-6">
        <PageHeader titulo={t('cabecera.titulo')} icono={User} migas={migas} />
        <EmptyState variante="forbidden" descripcion={t('sinPermiso')} />
      </div>
    );
  }

  return (
    <div className="flex min-h-full min-w-0 flex-col gap-4 bg-canvas p-4 pb-28 lg:gap-6 lg:p-6 lg:pb-24">
      <PageHeader
        titulo={t('cabecera.titulo')}
        subtitulo={t('cabecera.subtitulo')}
        icono={User}
        migas={migas}
        cargando={cargando}
        acciones={
          <Button variant="outline" size="icon" className="size-10" onClick={() => void cargar()} disabled={cargando} aria-label={t('cabecera.actualizar')} title={t('cabecera.actualizar')}>
            <RefreshCw aria-hidden="true" className={cargando ? 'size-4 animate-spin' : 'size-4'} />
          </Button>
        }
      />

      <KpiStrip etiqueta={t('kpi.etiqueta')} columnas={4} className="hidden lg:grid">
        <StatCard etiqueta={t('kpi.instructores')} valor={entero(kpi.total)} icono={Users} detalle={t('kpi.activos', { n: kpi.activos })} cargando={cargando} />
        <StatCard etiqueta={t('kpi.clasesSemana')} valor={entero(kpi.clases)} icono={CalendarDays} cargando={cargando} />
        <StatCard etiqueta={t('kpi.horasSemana')} valor={horas(kpi.horas)} icono={Clock} cargando={cargando} />
        <StatCard etiqueta={t('kpi.asistencia')} valor={pct(kpi.asistencia)} icono={Percent} detalle={t('kpi.asistenciaDetalle')} cargando={cargando} />
      </KpiStrip>

      <div className="flex flex-col gap-3">
        <ListToolbar busqueda={<SearchInput value={busqueda} onChange={setBusqueda} placeholder={t('busqueda.placeholder')} etiqueta={t('busqueda.etiqueta')} />} />
        <SegmentedControl<FiltroEstado>
          etiqueta={t('filtros.estado')}
          valor={estado}
          onValorChange={setEstado}
          opciones={[
            { valor: 'todos', etiqueta: t('filtros.todos') },
            { valor: 'activos', etiqueta: t('filtros.activos') },
            { valor: 'inactivos', etiqueta: t('filtros.inactivos') },
          ]}
          className="self-start"
        />
      </div>

      <DataTable
        etiqueta={t('tabla.etiqueta')}
        columnas={columnas}
        filas={visibles}
        obtenerId={(f) => f.instructor.user_id}
        estado={estadoTabla}
        etiquetaFila={(f) => f.nombre}
        onFilaClick={(f) => setAbierto(f.instructor)}
        tarjetaMovil={(f) => (
          <ListCard
            avatar={{ nombre: f.nombre, src: f.instructor.profiles?.avatar_url }}
            titulo={f.nombre}
            subtitulo={f.instructor.position?.name}
            meta={t('tarjeta.semana', { clases: f.clasesSemana, horas: horas(f.horasSemana) })}
            estado={<StatusBadge estado={f.instructor.is_active ? 'active' : 'inactive'} etiqueta={f.instructor.is_active ? t('estados.activo') : t('estados.inactivo')} />}
            onClick={() => setAbierto(f.instructor)}
          />
        )}
        vacio={{ titulo: t('vacio.titulo'), descripcion: t('vacio.descripcion'), icono: User, accion: { etiqueta: t('vacio.irHrm'), href: '/app/hrm/empleados' } }}
        sinResultados={{ descripcion: t('vacio.sinResultados') }}
        error={{ descripcion: error ?? undefined }}
        onReintentar={() => void cargar()}
        onLimpiarFiltros={() => {
          setBusqueda('');
          setEstado('todos');
        }}
        termino={busqueda}
      />

      <PanelInstructor
        instructor={abierto}
        onCerrar={() => setAbierto(null)}
        clases={clases}
        organizationId={orgId}
        puedeEditar={permisos.clases}
        fechas={fechas}
        nombre={nombre}
      />
    </div>
  );
}
