'use client';

/**
 * Membresías › Reservas (antes /app/gym/reservaciones). «Hoy» y «Semana»
 * filtran por la fecha de la CLASE en la zona de la organización (antes
 * filtraba por `booked_at`). La asistencia se escribe con los estados que
 * acepta la base (checked_in | no_show); la entrada a la clase se registra
 * desde la reserva (`apiMembresias.entradaReserva`, §13): la base valida la
 * reserva y la membresía, marca la asistencia y no duplica con un segundo clic.
 * «Importar CSV» (memberships.classes.manage) carga reservas desde un archivo.
 *
 * Permisos: ver = memberships.view; gestionar = memberships.classes.manage;
 * registrar entrada = memberships.checkin.
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { CalendarCheck, CalendarDays, Copy, LogIn, Pencil, Plus, RefreshCw, Upload, UserCheck, UserX, Users, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
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
  SegmentedControl,
  StatCard,
  StatusBadge,
  type AccionFila,
  type ChipFiltro,
  type ColumnaTabla,
  type EstadoTabla,
} from '@/components/kit';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { apiMembresias, usePermisosMembresias } from '@/lib/services/membresias/clienteMembresias';
import { avisoEntradaReserva, puedeRegistrarEntradaReserva } from '@/lib/services/membresias/checkinReserva';
import { useMensajeError } from '@/components/membresias/comun/useMensajeError';
import { DialogoImportarCsv } from '@/components/membresias/operacion/importar/DialogoImportarCsv';
import {
  cancelReservation,
  createReservation,
  getClasses,
  getOccupancyByClass,
  getReservations,
  markAttendance,
  updateReservation,
  type ClassReservation,
  type GymClass,
} from '@/lib/services/gymService';
import { DialogoReserva } from '@/components/membresias/operacion/reservas/DialogoReserva';
import { FiltroSelect } from '@/components/membresias/operacion/FiltroSelect';
import {
  ESTADOS_RESERVA,
  TONO_ESTADO_RESERVA,
  coincide,
  cuposLibres,
  esAvisoConocido,
  esMotivoConocido,
  esTipoSugerido,
  estadoClase,
  estadoReserva,
  instanteEnZona,
  rangoFiltroReservas,
  type EstadoReserva,
  type FiltroFechaReserva,
  type OrigenReserva,
} from '@/components/membresias/operacion/logica';
import { useFechasOrg } from '@/components/membresias/operacion/useFechasOrg';

const TAMANO = 20;
const TODOS = 'todos';

export default function ReservasPage() {
  return (
    <Suspense fallback={null}>
      <Reservas />
    </Suspense>
  );
}

function nombreCliente(r: ClassReservation): string {
  const c = r.customers;
  return [c?.first_name, c?.last_name].filter(Boolean).join(' ') || c?.email || '—';
}

function Reservas() {
  const t = useTranslations('membresias.reservas');
  const tc = useTranslations('membresias.clases');
  const tk = useTranslations('membresias.checkin');
  const tm = useTranslations('membresias');
  const router = useRouter();
  const params = useSearchParams();
  const claseParam = Number(params?.get('clase') ?? params?.get('classId') ?? '') || null;
  const { organization } = useOrganization();
  const orgId = organization?.id ?? 0;
  const permisos = usePermisosMembresias();
  const fechas = useFechasOrg();
  const entero = useFormatoEntero();
  const mensajeError = useMensajeError();

  const [reservas, setReservas] = useState<ClassReservation[]>([]);
  const [clases, setClases] = useState<GymClass[]>([]);
  const [ocupacion, setOcupacion] = useState<Map<number, number>>(new Map());
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState<EstadoReserva | typeof TODOS>(TODOS);
  const [fecha, setFecha] = useState<FiltroFechaReserva>('todas');
  const [pagina, setPagina] = useState(1);

  const [dialogo, setDialogo] = useState<{ reserva: ClassReservation | null } | null>(null);
  const [cancelar, setCancelar] = useState<ClassReservation | null>(null);
  const [duplicar, setDuplicar] = useState<{ reserva: ClassReservation; claseId: string } | null>(null);
  const [ocupado, setOcupado] = useState<number | 'dialogo' | null>(null);
  const [importar, setImportar] = useState(false);

  const cargar = useCallback(async () => {
    if (!orgId || !permisos.ver) return;
    setCargando(true);
    setError(null);
    try {
      const rango = rangoFiltroReservas(fecha, fechas.hoy, fechas.zona);
      const [lista, proximas] = await Promise.all([
        getReservations(orgId, {
          classId: claseParam ?? undefined,
          status: estado === TODOS ? undefined : estado,
          classFrom: rango?.desde,
          classTo: rango?.hasta,
        }),
        getClasses(orgId, { status: 'active', dateFrom: instanteEnZona(fechas.hoy, '00:00', fechas.zona) }),
      ]);
      // La clase filtrada por la URL también se ofrece aunque ya haya pasado.
      const extra = claseParam && !proximas.some((c) => c.id === claseParam) ? (await getClasses(orgId)).filter((c) => c.id === claseParam) : [];
      const todas = [...proximas, ...extra];
      setReservas(lista);
      setClases(todas);
      setOcupacion(await getOccupancyByClass(todas.map((c) => c.id), orgId));
    } catch {
      setError(t('errores.cargar'));
    } finally {
      setCargando(false);
    }
  }, [orgId, permisos.ver, claseParam, estado, fecha, fechas.hoy, fechas.zona, t]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const filtradas = useMemo(
    () =>
      reservas.filter(
        (r) =>
          !busqueda ||
          coincide(nombreCliente(r), busqueda) ||
          coincide(r.customers?.email, busqueda) ||
          coincide(r.customers?.identification_number, busqueda) ||
          coincide(r.gym_classes?.title, busqueda),
      ),
    [reservas, busqueda],
  );
  useEffect(() => setPagina(1), [busqueda, estado, fecha, claseParam]);
  const filasPagina = filtradas.slice((pagina - 1) * TAMANO, pagina * TAMANO);

  const kpi = useMemo(
    () => ({
      total: reservas.length,
      reservadas: reservas.filter((r) => estadoReserva(r.status) === 'booked').length,
      asistieron: reservas.filter((r) => estadoReserva(r.status) === 'checked_in').length,
      hoy: reservas.filter((r) => r.gym_classes?.start_at && fechas.dia(r.gym_classes.start_at) === fechas.hoy && estadoReserva(r.status) !== 'cancelled').length,
    }),
    [reservas, fechas],
  );

  const claseFiltrada = claseParam ? clases.find((c) => c.id === claseParam) ?? null : null;
  const nombreTipo = (v?: string) => (v ? (esTipoSugerido(v) ? tc(`tipos.${v}`) : v) : '');

  const errorServicio = (e: unknown) => {
    const codigo = e instanceof Error ? e.message : '';
    return ['clase_sin_cupo', 'reserva_duplicada', 'clase_no_programada', 'clase_no_encontrada'].includes(codigo) ? t(`errores.${codigo}`) : t('errores.guardar');
  };

  const guardar = async (datos: { claseId: number; clienteId: string; origen: OrigenReserva; notas: string | null }) => {
    try {
      if (dialogo?.reserva) {
        await updateReservation(dialogo.reserva.id, { notes: datos.notas ?? undefined, reservation_source: datos.origen }, orgId);
        toast.success(t('toasts.actualizada'));
      } else {
        await createReservation({ gym_class_id: datos.claseId, customer_id: datos.clienteId, reservation_source: datos.origen, notes: datos.notas ?? undefined }, orgId);
        toast.success(t('toasts.creada'));
      }
      await cargar();
    } catch (e) {
      toast.error(errorServicio(e));
      throw e;
    }
  };

  const correr = async (id: number, accion: () => Promise<unknown>, ok?: string) => {
    setOcupado(id);
    try {
      await accion();
      if (ok) toast.success(ok);
      await cargar();
    } catch (e) {
      toast.error(errorServicio(e));
    } finally {
      setOcupado(null);
    }
  };

  /**
   * Entrada a la clase desde la reserva (§13): la base valida la reserva (organización, miembro,
   * sede de la clase) y la membresía con las reglas del check-in, registra la entrada o el
   * rechazo y, si se permite, deja la reserva `checked_in`. Idempotente: un segundo clic no
   * duplica la entrada (`repetida`).
   */
  const registrarEntrada = async (r: ClassReservation) => {
    setOcupado(r.id);
    try {
      const res = await apiMembresias.entradaReserva(r.id);
      const tipo = avisoEntradaReserva(res);
      if (tipo === 'rechazada') {
        toast.error(t('toasts.entradaRechazada', { motivo: esMotivoConocido(res.motivo) ? tk(`motivos.${res.motivo}`) : res.motivo ?? '' }));
      } else if (tipo === 'repetida') {
        toast.info(t('toasts.entradaRepetida'));
      } else {
        const aviso = esAvisoConocido(res.aviso) ? tk(`avisos.${res.aviso}`, { dias: res.diasGracia ?? 0 }) : null;
        toast.success(aviso ? `${t('toasts.entrada')} · ${aviso}` : t('toasts.entrada'));
      }
      await cargar();
    } catch (e) {
      toast.error(mensajeError(e));
    } finally {
      setOcupado(null);
    }
  };

  const gestiona = permisos.clases;
  const accionesDe = (r: ClassReservation): AccionFila[] => {
    const e = estadoReserva(r.status);
    const abierta = e === 'booked';
    return [
      {
        id: 'entrada',
        etiqueta: t('acciones.entrada'),
        icono: LogIn,
        onSelect: () => void registrarEntrada(r),
        oculta: !puedeRegistrarEntradaReserva(e, estadoClase(r.gym_classes?.status) === 'cancelled') || !permisos.checkin,
      },
      { id: 'asistio', etiqueta: t('acciones.asistio'), icono: UserCheck, onSelect: () => void correr(r.id, () => markAttendance(r.id, true, orgId), t('toasts.asistio')), oculta: !gestiona || e === 'checked_in' || e === 'cancelled' },
      { id: 'noAsistio', etiqueta: t('acciones.noAsistio'), icono: UserX, onSelect: () => void correr(r.id, () => markAttendance(r.id, false, orgId), t('toasts.noAsistio')), oculta: !gestiona || e === 'no_show' || e === 'cancelled' },
      { id: 'clase', etiqueta: t('acciones.verClase'), icono: CalendarDays, onSelect: () => router.push('/app/membresias/clases'), separadorAntes: true },
      { id: 'editar', etiqueta: t('acciones.editar'), icono: Pencil, onSelect: () => setDialogo({ reserva: r }), oculta: !gestiona },
      { id: 'duplicar', etiqueta: t('acciones.duplicar'), icono: Copy, onSelect: () => setDuplicar({ reserva: r, claseId: '' }), oculta: !gestiona },
      { id: 'cancelar', etiqueta: t('acciones.cancelar'), icono: XCircle, onSelect: () => setCancelar(r), oculta: !gestiona || !abierta, destructiva: true },
    ];
  };

  const insignia = (r: ClassReservation) => {
    const e = estadoReserva(r.status);
    return <StatusBadge estado={e} etiqueta={t(`estados.${e}`)} tono={TONO_ESTADO_RESERVA[e]} />;
  };

  const columnas: ColumnaTabla<ClassReservation>[] = [
    {
      id: 'cliente',
      encabezado: t('tabla.cliente'),
      celda: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-fg">{nombreCliente(r)}</p>
          <p className="truncate text-xs text-fg-secondary">{r.customers?.identification_number || r.customers?.email || r.customers?.phone || ''}</p>
        </div>
      ),
    },
    {
      id: 'clase',
      encabezado: t('tabla.clase'),
      celda: (r) => (
        <div className="min-w-0">
          <p className="truncate text-fg">{r.gym_classes?.title ?? '—'}</p>
          <p className="truncate text-xs text-fg-secondary">{nombreTipo(r.gym_classes?.class_type)}</p>
        </div>
      ),
    },
    {
      id: 'fecha',
      encabezado: t('tabla.fecha'),
      celda: (r) =>
        r.gym_classes ? (
          <div>
            <p className="capitalize text-fg">{fechas.fechaCorta(r.gym_classes.start_at)}</p>
            <p className="text-xs tabular-nums text-fg-secondary">{fechas.hora(r.gym_classes.start_at)}</p>
          </div>
        ) : (
          '—'
        ),
    },
    { id: 'origen', encabezado: t('tabla.origen'), celda: (r) => (r.reservation_source ? t(`origenes.${r.reservation_source}`) : '—'), ocultarDebajo: 'lg' },
    { id: 'reservada', encabezado: t('tabla.reservada'), celda: (r) => fechas.fechaHora(r.booked_at), ocultarDebajo: 'xl' },
    { id: 'estado', encabezado: t('tabla.estado'), celda: insignia },
  ];

  const chips: ChipFiltro[] = [
    ...(estado !== TODOS ? [{ clave: 'estado', etiqueta: `${t('filtros.estado')}: ${t(`estados.${estado}`)}` }] : []),
    ...(claseParam ? [{ clave: 'clase', etiqueta: `${t('filtros.clase')}: ${claseFiltrada?.title ?? `#${claseParam}`}` }] : []),
  ];
  const quitarChip = (clave: string) => {
    if (clave === 'estado') setEstado(TODOS);
    if (clave === 'clase') router.replace('/app/membresias/reservas', { scroll: false });
  };
  const limpiar = () => {
    setEstado(TODOS);
    if (claseParam) router.replace('/app/membresias/reservas', { scroll: false });
  };

  const hayFiltros = chips.length > 0 || !!busqueda || fecha !== 'todas';
  const estadoTabla: EstadoTabla = error
    ? 'error'
    : cargando || permisos.cargando
      ? 'cargando'
      : filtradas.length === 0
        ? hayFiltros
          ? 'sinResultados'
          : 'vacio'
        : 'listo';

  const migas = [{ etiqueta: tm('modulo'), href: '/app/membresias' }, { etiqueta: t('cabecera.titulo') }];
  if (!permisos.cargando && !permisos.ver) {
    return (
      <div className="flex min-h-full flex-col gap-4 bg-canvas p-4 lg:gap-6 lg:p-6">
        <PageHeader titulo={t('cabecera.titulo')} icono={CalendarCheck} migas={migas} />
        <EmptyState variante="forbidden" descripcion={t('sinPermiso')} />
      </div>
    );
  }

  const destinosDuplicar = duplicar ? clases.filter((c) => c.id !== duplicar.reserva.gym_class_id && c.status === 'active' && cuposLibres(c.capacity, ocupacion.get(c.id) ?? 0) > 0) : [];

  return (
    <div className="flex min-h-full min-w-0 flex-col gap-4 bg-canvas p-4 pb-28 lg:gap-6 lg:p-6 lg:pb-24">
      <PageHeader
        titulo={t('cabecera.titulo')}
        subtitulo={claseFiltrada ? t('cabecera.subtituloClase', { titulo: claseFiltrada.title, dia: fechas.fechaCorta(claseFiltrada.start_at), hora: fechas.hora(claseFiltrada.start_at) }) : t('cabecera.subtitulo')}
        icono={CalendarCheck}
        migas={migas}
        cargando={cargando}
        acciones={
          <>
            <Button variant="outline" size="icon" className="size-10" onClick={() => void cargar()} disabled={cargando} aria-label={t('cabecera.actualizar')} title={t('cabecera.actualizar')}>
              <RefreshCw aria-hidden="true" className={cargando ? 'size-4 animate-spin' : 'size-4'} />
            </Button>
            {gestiona && (
              <Button variant="outline" className="h-10" onClick={() => setImportar(true)}>
                <Upload aria-hidden="true" className="mr-2 size-4" />
                {tm('importar.boton')}
              </Button>
            )}
            {gestiona && (
              <Button className="h-10" onClick={() => setDialogo({ reserva: null })}>
                <Plus aria-hidden="true" className="mr-2 size-4" />
                {t('cabecera.nueva')}
              </Button>
            )}
          </>
        }
        movil={{
          accion: gestiona ? (
            <Button variant="ghost" size="icon" className="size-10" onClick={() => setDialogo({ reserva: null })} aria-label={t('cabecera.nueva')}>
              <Plus aria-hidden="true" className="size-5" />
            </Button>
          ) : undefined,
        }}
      />

      <KpiStrip etiqueta={t('kpi.etiqueta')} className="hidden lg:grid">
        <StatCard etiqueta={t('kpi.hoy')} valor={entero(kpi.hoy)} icono={CalendarDays} cargando={cargando} onClick={() => setFecha('hoy')} />
        <StatCard etiqueta={t('kpi.reservadas')} valor={entero(kpi.reservadas)} tono="informacion" cargando={cargando} onClick={() => setEstado('booked')} />
        <StatCard etiqueta={t('kpi.asistieron')} valor={entero(kpi.asistieron)} tono="exito" cargando={cargando} onClick={() => setEstado('checked_in')} />
        <StatCard etiqueta={t('kpi.total')} valor={entero(kpi.total)} icono={Users} cargando={cargando} />
      </KpiStrip>

      <div className="flex flex-col gap-3">
        <ListToolbar
          busqueda={<SearchInput value={busqueda} onChange={setBusqueda} placeholder={t('busqueda.placeholder')} etiqueta={t('busqueda.etiqueta')} />}
          filtros={
            <FilterPanel conteo={chips.length} onLimpiar={limpiar} textoVerResultados={t('filtros.ver', { n: filtradas.length })}>
              <FiltroSelect
                etiqueta={t('filtros.estado')}
                valor={estado}
                onValor={(v) => setEstado(v as EstadoReserva | typeof TODOS)}
                opciones={[{ v: TODOS, e: t('filtros.todos') }, ...ESTADOS_RESERVA.map((e) => ({ v: e, e: t(`estados.${e}`) }))]}
              />
            </FilterPanel>
          }
          chips={<FilterChips chips={chips} onQuitar={quitarChip} onLimpiarTodo={limpiar} />}
        />
        <SegmentedControl<FiltroFechaReserva>
          etiqueta={t('fecha.etiqueta')}
          valor={fecha}
          onValorChange={setFecha}
          opciones={[
            { valor: 'todas', etiqueta: t('fecha.todas') },
            { valor: 'hoy', etiqueta: t('fecha.hoy') },
            { valor: 'semana', etiqueta: t('fecha.semana') },
          ]}
          className="self-start"
        />
      </div>

      <DataTable
        etiqueta={t('tabla.etiqueta')}
        columnas={columnas}
        filas={filasPagina}
        obtenerId={(r) => String(r.id)}
        estado={estadoTabla}
        etiquetaFila={nombreCliente}
        acciones={accionesDe}
        accionesRapidas={(r) =>
          estadoReserva(r.status) === 'booked' && estadoClase(r.gym_classes?.status) !== 'cancelled' && (permisos.checkin || gestiona) ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              disabled={ocupado === r.id}
              onClick={(e) => {
                e.stopPropagation();
                void (permisos.checkin ? registrarEntrada(r) : correr(r.id, () => markAttendance(r.id, true, orgId), t('toasts.asistio')));
              }}
              aria-label={t('acciones.entradaDe', { nombre: nombreCliente(r) })}
              title={t('acciones.entrada')}
            >
              <LogIn aria-hidden="true" className="size-4" />
            </Button>
          ) : null
        }
        tarjetaMovil={(r) => (
          <ListCard
            avatar={{ nombre: nombreCliente(r) }}
            titulo={nombreCliente(r)}
            subtitulo={r.gym_classes ? `${r.gym_classes.title} · ${fechas.fechaCorta(r.gym_classes.start_at)} ${fechas.hora(r.gym_classes.start_at)}` : undefined}
            meta={r.reservation_source ? t(`origenes.${r.reservation_source}`) : undefined}
            estado={insignia(r)}
            acciones={accionesDe(r)}
          />
        )}
        vacio={{
          titulo: t('vacio.titulo'),
          descripcion: t('vacio.descripcion'),
          icono: CalendarCheck,
          accion: gestiona ? { etiqueta: t('cabecera.nueva'), onClick: () => setDialogo({ reserva: null }), icono: Plus } : undefined,
        }}
        sinResultados={{ descripcion: t('vacio.sinResultados') }}
        error={{ descripcion: error ?? undefined }}
        onReintentar={() => void cargar()}
        onLimpiarFiltros={() => {
          limpiar();
          setBusqueda('');
          setFecha('todas');
        }}
        termino={busqueda}
        pie={
          filtradas.length > TAMANO ? (
            <Pagination pagina={pagina} tamano={TAMANO} total={filtradas.length} onPaginaChange={setPagina} sustantivo={{ singular: t('sustantivo.singular'), plural: t('sustantivo.plural') }} />
          ) : undefined
        }
      />

      <DialogoReserva
        abierto={!!dialogo}
        onAbiertoChange={(v) => !v && setDialogo(null)}
        reserva={dialogo?.reserva ?? null}
        clases={clases}
        ocupacion={ocupacion}
        claseInicial={claseParam}
        organizationId={orgId}
        fechas={fechas}
        onGuardar={guardar}
      />

      {gestiona && (
        <DialogoImportarCsv tipo="reservas" abierto={importar} onAbiertoChange={setImportar} fechas={fechas} onImportado={() => void cargar()} />
      )}

      <DialogoMotivo
        abierto={!!cancelar}
        onAbiertoChange={(v) => !v && setCancelar(null)}
        titulo={t('cancelar.titulo')}
        descripcion={cancelar ? t('cancelar.descripcion', { nombre: nombreCliente(cancelar), clase: cancelar.gym_classes?.title ?? '' }) : undefined}
        textoConfirmar={t('cancelar.confirmar')}
        cargando={ocupado !== null}
        icono={XCircle}
        onConfirmar={async (motivo) => {
          if (!cancelar) return;
          const r = cancelar;
          await correr(r.id, () => cancelReservation(r.id, motivo, orgId), t('toasts.cancelada'));
          setCancelar(null);
        }}
      />

      <Dialogo
        abierto={!!duplicar}
        onAbiertoChange={(v) => !v && setDuplicar(null)}
        titulo={t('duplicar.titulo')}
        descripcion={duplicar ? t('duplicar.descripcion', { nombre: nombreCliente(duplicar.reserva) }) : undefined}
        icono={Copy}
        primario={{
          etiqueta: t('duplicar.confirmar'),
          cargando: ocupado === 'dialogo',
          deshabilitada: !duplicar?.claseId,
          onClick: async () => {
            if (!duplicar?.claseId) return;
            setOcupado('dialogo');
            try {
              await createReservation(
                {
                  gym_class_id: Number(duplicar.claseId),
                  customer_id: duplicar.reserva.customer_id,
                  notes: duplicar.reserva.notes,
                  reservation_source: 'staff',
                  membership_id: duplicar.reserva.membership_id,
                },
                orgId,
              );
              toast.success(t('toasts.duplicada'));
              setDuplicar(null);
              await cargar();
            } catch (e) {
              toast.error(errorServicio(e));
            } finally {
              setOcupado(null);
            }
          },
        }}
        textoCancelar={t('dialogo.cancelar')}
      >
        {duplicar &&
          (destinosDuplicar.length === 0 ? (
            <p className="text-sm text-fg-secondary">{t('dialogo.sinClases')}</p>
          ) : (
            <FormField etiqueta={t('duplicar.clase')} obligatorio>
              {(campo) => (
                <Select value={duplicar.claseId} onValueChange={(v) => setDuplicar({ ...duplicar, claseId: v })}>
                  <SelectTrigger id={campo.id}>
                    <SelectValue placeholder={t('dialogo.clasePlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {destinosDuplicar.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {t('dialogo.opcionClase', { titulo: c.title, dia: fechas.fechaCorta(c.start_at), hora: fechas.hora(c.start_at), libres: cuposLibres(c.capacity, ocupacion.get(c.id) ?? 0) })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
          ))}
      </Dialogo>
    </div>
  );
}
