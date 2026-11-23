'use client';

/**
 * Transporte › Viajes › Despachos de hoy (Figma «23 Transporte» › 6, 2876:3844; vacío
 * 2912:31922). La vista del despachador: cada salida del día con vehículo, conductor,
 * ocupación y cumplimiento. Desde aquí se despacha, se imprime la planilla y se resuelve el
 * bloqueo. Fila: máximo 2 íconos (planilla y despachar); el resto en «⋯». Barra masiva flotante
 * del kit con la selección.
 *
 * Los datos los lee la página (`useDespachosHoy`) para compartirlos con las StatCards.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CalendarCheck, Eye, FileText, Printer, Send, Truck } from 'lucide-react';
import {
  BulkActionBar,
  DataTable,
  EmptyState,
  ListCard,
  ListToolbar,
  SearchInput,
  StatusBadge,
  clasesBoton,
  type AccionFila,
  type ColumnaTabla,
} from '@/components/kit';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { supabase } from '@/lib/supabase/config';
import { tripsService } from '@/lib/services/tripsService';
import { DespachoError, despacharViaje } from '@/lib/services/transporte/despachosService';
import { ocupacion, porDespachar, yaSalio, type ResultadoDespacho } from '@/lib/transporte/despachos';
import { DialogoDespachar, type VehiculoOpcion } from './DialogoDespachar';
import { InsigniaCumplimiento } from './InsigniaCumplimiento';
import { useImprimirPlanilla } from './useImprimirPlanilla';
import type { FilaDespachoHoy } from './useDespachosHoy';

const TONO_ESTADO = { listo: 'exito', bloqueado: 'peligro', despachado: 'marca', excepcion: 'advertencia', cancelado: 'neutro' } as const;

interface Props {
  organizationId: number | null;
  filas: readonly FilaDespachoHoy[];
  cargando: boolean;
  error: 'sin_permiso' | 'error' | null;
  recargar: () => void;
}

export function DespachosHoy({ organizationId, filas, cargando, error, recargar }: Props) {
  const t = useTranslations('transporte.despachos');
  const router = useRouter();
  const { formatTime } = useFormatDate();
  const imprimir = useImprimirPlanilla();
  const [busqueda, setBusqueda] = useState('');
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [abierta, setAbierta] = useState<string | null>(null);
  const [vehiculos, setVehiculos] = useState<VehiculoOpcion[]>([]);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!organizationId) return;
    tripsService
      .getVehicles(organizationId)
      .then((v) => setVehiculos(v as VehiculoOpcion[]))
      .catch(() => setVehiculos([]));
  }, [organizationId]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const activas = filas.filter((f) => f.estado !== 'cancelado');
    if (!q) return activas;
    return activas.filter((f) =>
      [f.viaje.codigo, f.viaje.ruta?.nombre, f.viaje.ruta?.codigo, f.viaje.vehiculo?.placa, f.viaje.conductor?.nombre].some((x) => x?.toLowerCase().includes(q)),
    );
  }, [filas, busqueda]);
  const porId = useMemo(() => new Map(filas.map((f) => [f.id, f])), [filas]);
  const seleccionadas = useMemo(() => Array.from(seleccion, (id) => porId.get(id)).filter((f): f is FilaDespachoHoy => !!f), [seleccion, porId]);
  const fila = abierta ? porId.get(abierta) ?? null : null;

  useEffect(() => setSeleccion(new Set()), [busqueda]);

  const mensajeError = (e: unknown) => (e instanceof DespachoError && t.has(`errores.${e.codigo}`) ? t(`errores.${e.codigo}`) : t('errores.error'));

  const avisarResultado = (f: FilaDespachoHoy, r: ResultadoDespacho) => {
    if (r.estado === 'despachado' || r.estado === 'despachado_con_excepcion') {
      toastSuccess(t(r.estado === 'despachado' ? 'toast.despachado' : 'toast.conExcepcion', { codigo: f.viaje.codigo, planilla: r.planilla ?? '' }));
    } else if (r.estado === 'bloqueado') {
      toastError(t('toast.bloqueado', { codigo: f.viaje.codigo }));
    }
  };

  const despacharDesdeDialogo = async (f: FilaDespachoHoy, excepcion?: { motivo: string; pin: string }) => {
    try {
      const r = await despacharViaje(supabase, f.id, excepcion);
      avisarResultado(f, r);
      if (r.estado === 'despachado' || r.estado === 'despachado_con_excepcion') {
        setAbierta(null);
        recargar();
      }
      return r;
    } catch (e) {
      toastError(mensajeError(e));
      return null;
    }
  };

  const cambiarVehiculo = async (f: FilaDespachoHoy, vehiculoId: string) => {
    try {
      await tripsService.updateTrip(f.id, { vehicle_id: vehiculoId });
      toastSuccess(t('toast.vehiculoCambiado', { codigo: f.viaje.codigo }));
      recargar();
    } catch {
      toastError(t('errores.vehiculo'));
    }
  };

  /** Barra masiva: despacha los listos de la selección; los bloqueados se abren uno a uno. */
  const despacharListos = async () => {
    const listos = seleccionadas.filter((f) => f.estado === 'listo');
    if (listos.length === 0) return;
    setOcupado(true);
    let ok = 0;
    let bloqueados = 0;
    for (const f of listos) {
      try {
        const r = await despacharViaje(supabase, f.id);
        if (r.estado === 'despachado') ok += 1;
        else if (r.estado === 'bloqueado') bloqueados += 1;
      } catch {
        bloqueados += 1;
      }
    }
    setOcupado(false);
    if (ok > 0) toastSuccess(t('toast.masivo', { count: ok }));
    if (bloqueados > 0) toastError(t('toast.masivoBloqueados', { count: bloqueados }));
    setSeleccion(new Set());
    recargar();
  };

  const imprimirSeleccion = async () => {
    for (const f of seleccionadas.filter((x) => yaSalio(x.estado) && x.viaje.planilla)) await imprimir(f.viaje);
  };

  const verViaje = (f: FilaDespachoHoy) => router.push(`/app/transporte/viajes/${f.id}`);

  const accionesDe = (f: FilaDespachoHoy): AccionFila[] => [
    { id: 'ver', etiqueta: t('acciones.verViaje'), icono: Eye, onSelect: () => verViaje(f) },
    { id: 'despachar', etiqueta: t('acciones.despachar'), icono: Send, onSelect: () => setAbierta(f.id), oculta: !porDespachar(f.estado), separadorAntes: true },
    { id: 'planilla', etiqueta: t('acciones.planilla'), icono: Printer, onSelect: () => void imprimir(f.viaje), oculta: !yaSalio(f.estado) || !f.viaje.planilla },
    { id: 'novedad', etiqueta: t('acciones.novedad'), icono: FileText, onSelect: () => verViaje(f) },
  ];

  const rapidas = (f: FilaDespachoHoy) => (
    <div className="flex items-center justify-end gap-1">
      {yaSalio(f.estado) && f.viaje.planilla && (
        <button type="button" className={clasesBoton({ variante: 'fantasma', tamano: 'sm', className: 'w-8 px-0' })} onClick={(e) => (e.stopPropagation(), void imprimir(f.viaje))} aria-label={t('acciones.planillaDe', { codigo: f.viaje.codigo })} title={t('acciones.planilla')}>
          <Printer aria-hidden="true" className="size-4" strokeWidth={1.5} />
        </button>
      )}
      {porDespachar(f.estado) && (
        <button type="button" className={clasesBoton({ variante: 'fantasma', tamano: 'sm', className: 'w-8 px-0' })} onClick={(e) => (e.stopPropagation(), setAbierta(f.id))} aria-label={t('acciones.despacharDe', { codigo: f.viaje.codigo })} title={t('acciones.despachar')}>
          {f.estado === 'bloqueado' ? <Truck aria-hidden="true" className="size-4" strokeWidth={1.5} /> : <Send aria-hidden="true" className="size-4" strokeWidth={1.5} />}
        </button>
      )}
    </div>
  );

  const estadoCelda = (f: FilaDespachoHoy) => <StatusBadge estado={f.estado} tono={TONO_ESTADO[f.estado]} etiqueta={t(`estados.${f.estado}`)} />;
  const ocupacionCelda = (f: FilaDespachoHoy) => {
    const o = ocupacion(f.viaje.puestos, f.viaje.disponibles);
    return (
      <div className="flex flex-col">
        <span className="tabular-nums text-fg">{t('ocupacion', { vendidos: o.vendidos, total: f.viaje.puestos })}</span>
        <span className="text-xs text-fg-muted">{t('pasajeros')}</span>
      </div>
    );
  };

  const columnas: ColumnaTabla<FilaDespachoHoy>[] = [
    { id: 'sale', encabezado: t('columnas.sale'), celda: (f) => <span className="font-medium tabular-nums text-fg">{formatTime(f.viaje.salida)}</span> },
    {
      id: 'viaje',
      encabezado: t('columnas.viaje'),
      celda: (f) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-fg">{[f.viaje.codigo, f.viaje.ruta?.nombre].filter(Boolean).join(' · ')}</span>
          {f.viaje.planilla && <span className="truncate text-xs text-fg-muted">{t('planillaN', { numero: f.viaje.planilla })}</span>}
        </div>
      ),
    },
    {
      id: 'vehiculo',
      encabezado: t('columnas.vehiculo'),
      ocultarDebajo: 'md',
      celda: (f) => (
        <div className="flex min-w-0 max-w-[180px] flex-col">
          <span className="truncate text-fg">{f.viaje.vehiculo?.placa ?? '—'}</span>
          <span className="truncate text-xs text-fg-muted">{f.viaje.conductor?.nombre || '—'}</span>
        </div>
      ),
    },
    { id: 'ocupacion', encabezado: t('columnas.ocupacion'), ocultarDebajo: 'lg', celda: ocupacionCelda },
    { id: 'cumplimiento', encabezado: t('columnas.cumplimiento'), celda: (f) => <InsigniaCumplimiento estado={f.estado} cumplimiento={f.cumplimiento} /> },
    { id: 'estado', encabezado: t('columnas.estado'), ocultarDebajo: 'md', celda: estadoCelda },
    { id: 'rapidas', encabezado: t('columnas.acciones'), alinear: 'derecha', celda: rapidas },
  ];

  const sustantivo = { singular: t('sustantivo.singular'), plural: t('sustantivo.plural'), genero: 'masculino' as const };
  const estadoTabla = error === 'sin_permiso' ? 'sinPermiso' : cargando && filas.length === 0 ? 'cargando' : error ? 'error' : visibles.length === 0 ? (busqueda ? 'sinResultados' : 'vacio') : 'listo';
  const sinViajes = !cargando && !error && filas.length === 0;

  return (
    <div className="flex flex-col gap-4">
      {sinViajes ? (
        <EmptyState
          icono={CalendarCheck}
          titulo={t('vacio.titulo')}
          descripcion={t('vacio.descripcion')}
          accion={{ etiqueta: t('vacio.programar'), href: '/app/transporte/viajes?pestana=todos' }}
          accionSecundaria={{ etiqueta: t('vacio.horarios'), href: '/app/transporte/horarios' }}
        />
      ) : (
        <>
          <ListToolbar busqueda={<SearchInput value={busqueda} onChange={setBusqueda} cargando={cargando} placeholder={t('buscar.placeholder')} etiqueta={t('buscar.etiqueta')} />} />
          <DataTable
            etiqueta={t('tabla')}
            columnas={columnas}
            filas={visibles}
            obtenerId={(f) => f.id}
            estado={estadoTabla}
            seleccion={seleccion}
            onSeleccionChange={setSeleccion}
            onFilaClick={(f) => (porDespachar(f.estado) ? setAbierta(f.id) : verViaje(f))}
            etiquetaFila={(f) => f.viaje.codigo}
            acciones={accionesDe}
            tonoFila={(f) => (f.estado === 'bloqueado' ? 'peligro' : undefined)}
            tarjetaMovil={(f, ctx) => (
              <ListCard
                icono={Truck}
                titulo={`${formatTime(f.viaje.salida)} · ${f.viaje.codigo}`}
                subtitulo={[f.viaje.ruta?.nombre, f.viaje.vehiculo?.placa, f.viaje.conductor?.nombre].filter(Boolean).join(' · ')}
                meta={<InsigniaCumplimiento estado={f.estado} cumplimiento={f.cumplimiento} />}
                estado={estadoCelda(f)}
                acciones={accionesDe(f)}
                onClick={() => (porDespachar(f.estado) ? setAbierta(f.id) : verViaje(f))}
                seleccionable={ctx.modoSeleccion}
                seleccionado={ctx.seleccionado}
                onSeleccionChange={ctx.alternar}
              />
            )}
            vacio={{ icono: CalendarCheck, titulo: t('vacio.titulo'), descripcion: t('vacio.descripcion') }}
            sinResultados={{ descripcion: t('sinResultados') }}
            error={{ titulo: t('errores.carga') }}
            sinPermiso={{ titulo: t('sinPermiso.titulo'), descripcion: t('sinPermiso.descripcion') }}
            onLimpiarFiltros={() => setBusqueda('')}
            onReintentar={recargar}
            termino={busqueda}
          />
        </>
      )}

      <BulkActionBar
        seleccionados={seleccion.size}
        total={visibles.length}
        sustantivo={sustantivo}
        onSeleccionarTodos={() => setSeleccion(new Set(visibles.map((f) => f.id)))}
        onLimpiar={() => setSeleccion(new Set())}
        acciones={[
          {
            id: 'despachar',
            etiqueta: t('masivo.despacharListos'),
            icono: Send,
            onClick: () => void despacharListos(),
            deshabilitada: ocupado || !seleccionadas.some((f) => f.estado === 'listo'),
            motivo: t('masivo.sinListos'),
          },
          {
            id: 'planillas',
            etiqueta: t('masivo.imprimir'),
            icono: Printer,
            onClick: () => void imprimirSeleccion(),
            deshabilitada: !seleccionadas.some((f) => yaSalio(f.estado) && f.viaje.planilla),
            motivo: t('masivo.sinPlanillas'),
          },
        ]}
      />

      {fila && (
        <DialogoDespachar
          viaje={fila.viaje}
          cumplimiento={fila.cumplimiento}
          vehiculos={vehiculos}
          onCerrar={() => setAbierta(null)}
          onDespachar={(exc) => despacharDesdeDialogo(fila, exc)}
          onCambiarVehiculo={(id) => cambiarVehiculo(fila, id)}
        />
      )}

      <p className="text-xs text-fg-muted">
        {t('pie')}{' '}
        <Link href="/app/transporte/viajes?pestana=novedades" className="text-brand underline-offset-2 hover:underline">
          {t('verNovedades')}
        </Link>
      </p>
    </div>
  );
}
