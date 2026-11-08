'use client';

/**
 * Periodos contables (Figma 991:77842 año, 991:78604 cerrar con avisos,
 * 991:78713 cerrar bloqueado, 991:78789 reabrir, 993:79844 móvil; diálogos
 * «Generar períodos fiscales» 2327:128337 y «Cerrar ejercicio» 2327:128271).
 *
 * Única pantalla de periodos: `/app/finanzas/periodos-contables` redirige
 * aquí. Cerrar, reabrir y cerrar ejercicio van por sus RPC (`fn_cierre_periodo`,
 * `fn_reabrir_periodo`, `fn_cierre_ejercicio`); la base exige el permiso y
 * bloquea el cambio de estado directo. Los botones salen de `botonesDePeriodo`.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CalendarClock, Lock, Plus, RefreshCw } from 'lucide-react';
import {
  EmptyState,
  PageHeader,
  RowActionsMenu,
  SegmentedControl,
  Skeleton,
  clasesBoton,
  type AccionFila,
} from '@/components/kit';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { formatPlainDate } from '@/lib/utils/dateDisplay';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { usePermissionContext } from '@/hooks/usePermissionContext';
import { cn } from '@/lib/utils';
import {
  PERMISO_CERRAR_EJERCICIO,
  PERMISO_CERRAR_PERIODO,
  botonesDePeriodo,
} from '@/lib/finanzas/permisosCierre';
import {
  aniosDisponibles,
  anioParaGenerar,
  codigoErrorPeriodo,
  estadoDelAnio,
  mesesSinCerrar,
  rejillaDelAnio,
  type CeldaMes,
} from '@/lib/finanzas/contabilidad/periodosLogica';
import { EstadoPeriodo } from '../piezas';
import { PeriodosFiscalesService, type FiscalPeriod } from './PeriodosFiscalesService';
import { CerrarEjercicioDialogo, CerrarPeriodoDialogo, GenerarPeriodosDialogo, ReabrirPeriodoDialogo } from './DialogosPeriodo';

type Estado = 'cargando' | 'listo' | 'error' | 'sinPermiso';
type Pendientes = { borradores: number; pendientes: number };

export function PeriodosFiscalesPage() {
  const t = useTranslations('finanzasContabilidadR3.periodos');
  const tc = useTranslations('finanzasContabilidadR3.comun');
  const locale = useLocale();
  const { formatDate, getToday } = useFormatDate();
  const { organization } = useOrganization();
  const { checker, loading: cargandoPermisos } = usePermissionContext(organization?.id);
  const puede = useCallback((codigo: string) => checker.can(codigo), [checker]);
  const puedeCerrarEjercicio = !cargandoPermisos && puede(PERMISO_CERRAR_EJERCICIO);

  const hoy = getToday();
  const anioHoy = Number(hoy.slice(0, 4));

  const [estado, setEstado] = useState<Estado>('cargando');
  const [periodos, setPeriodos] = useState<FiscalPeriod[]>([]);
  const [anio, setAnio] = useState<number>(anioHoy);
  const [conteos, setConteos] = useState<Map<number, number>>(new Map());
  const [pendientes, setPendientes] = useState<Map<string, Pendientes>>(new Map());
  const [nombres, setNombres] = useState<Map<string, string>>(new Map());

  const [cerrar, setCerrar] = useState<FiscalPeriod | null>(null);
  const [reabrir, setReabrir] = useState<FiscalPeriod | null>(null);
  const [generar, setGenerar] = useState(false);
  const [ejercicio, setEjercicio] = useState(false);
  const [creandoMes, setCreandoMes] = useState<number | null>(null);

  const mesLargo = useCallback(
    (mes: number, conAnio?: number) => {
      const texto = new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, mes - 1, 15)));
      const mayuscula = texto.charAt(0).toLocaleUpperCase(locale) + texto.slice(1);
      return conAnio ? `${mayuscula} ${conAnio}` : mayuscula;
    },
    [locale],
  );

  const nombrePeriodo = useCallback(
    (p: FiscalPeriod) => {
      if (p.period_type === 'yearly') return t('anio', { anio: p.year });
      if (p.period_type === 'quarterly') return `${t('periodoTrimestral', { n: Math.ceil((p.month ?? 1) / 3) })} ${p.year}`;
      return p.month ? mesLargo(p.month, p.year) : String(p.year);
    },
    [mesLargo, t],
  );

  const mensajeError = useCallback((error: unknown) => t(`errores.${codigoErrorPeriodo(error)}`), [t]);

  const cargar = useCallback(async () => {
    setEstado('cargando');
    try {
      const data = await PeriodosFiscalesService.obtenerPeriodos();
      setPeriodos(data);
      setEstado('listo');
      const ids = data.flatMap((p) => [p.closed_by, p.reopened_by]).filter((v): v is string => !!v);
      void PeriodosFiscalesService.nombresUsuarios(ids).then(setNombres).catch(() => undefined);
    } catch (error) {
      console.error('No se pudieron cargar los periodos:', error);
      setEstado(codigoErrorPeriodo(error) === 'sinPermiso' ? 'sinPermiso' : 'error');
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Cifras del año elegido: asientos por mes y pendientes de los meses abiertos.
  useEffect(() => {
    if (estado !== 'listo') return;
    let vigente = true;
    setConteos(new Map());
    void PeriodosFiscalesService.asientosPorMes(anio)
      .then((c) => vigente && setConteos(c))
      .catch((error) => console.error('No se pudieron contar los asientos del año:', error));
    const abiertos = periodos.filter((p) => p.year === anio && p.status === 'open');
    void Promise.all(
      abiertos.map(async (p) => [p.id, await PeriodosFiscalesService.pendientesDelPeriodo(p.id)] as const),
    ).then((filas) => {
      if (!vigente) return;
      const mapa = new Map<string, Pendientes>();
      for (const [id, valor] of filas) if (valor) mapa.set(id, valor);
      setPendientes(mapa);
    });
    return () => {
      vigente = false;
    };
  }, [anio, periodos, estado]);

  const anios = useMemo(() => aniosDisponibles(periodos, anioHoy), [periodos, anioHoy]);
  const celdas = useMemo(() => rejillaDelAnio(periodos, anio, hoy), [periodos, anio, hoy]);
  const otros = useMemo(() => periodos.filter((p) => p.year === anio && p.period_type !== 'monthly'), [periodos, anio]);
  const estadoAnio = estadoDelAnio(periodos, anio);
  const sinCerrar = mesesSinCerrar(celdas);
  const mesesCreados = celdas.filter((c) => c.periodo).length;
  const anioGenerar = anioParaGenerar(periodos, anioHoy);
  const borradoresDelAnio = periodos
    .filter((p) => p.year === anio && p.period_type === 'monthly')
    .reduce((suma, p) => suma + (pendientes.get(p.id)?.borradores ?? 0), 0);

  const subtitulo =
    sinCerrar.length > 0
      ? t('subtituloSinCerrar', {
          anio,
          meses: mesesCreados,
          lista: new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(
            sinCerrar.map((m) => mesLargo(m).toLocaleLowerCase(locale)),
          ),
        })
      : t('subtitulo', { anio, meses: mesesCreados });

  const crearMes = async (mes: number) => {
    setCreandoMes(mes);
    try {
      await PeriodosFiscalesService.crearMes(anio, mes);
      toastSuccess(t('exito.mesCreado', { periodo: mesLargo(mes, anio) }));
      await cargar();
    } catch (error) {
      toastError(mensajeError(error));
    } finally {
      setCreandoMes(null);
    }
  };

  const accionesCabecera: AccionFila[] = [
    { id: 'actualizar', etiqueta: t('actualizar'), icono: RefreshCw, onSelect: () => void cargar() },
  ];

  const enError = estado === 'error' || estado === 'sinPermiso';

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={estado === 'listo' ? subtitulo : undefined}
        icono={CalendarClock}
        migas={[
          { etiqueta: tc('migas.finanzas'), href: '/app/finanzas' },
          { etiqueta: tc('migas.contabilidad'), href: '/app/finanzas/contabilidad' },
          { etiqueta: t('titulo') },
        ]}
        movil={{ accionesEnFila: true }}
        acciones={
          !enError && (
            <>
              <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => setGenerar(true)} disabled={estado !== 'listo'}>
                <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('generar', { anio: anioGenerar })}
              </button>
              <RowActionsMenu acciones={accionesCabecera} titulo={t('masAcciones')} orientacion="horizontal" tamano="md" />
            </>
          )
        }
      />

      {estado === 'error' && (
        <EmptyState variante="error" titulo={t('error.titulo')} descripcion={t('error.descripcion')} onReintentar={() => void cargar()} />
      )}
      {estado === 'sinPermiso' && (
        <EmptyState variante="forbidden" titulo={t('error.sinPermisoTitulo')} descripcion={t('error.sinPermisoDescripcion')} />
      )}

      {!enError && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {estado === 'cargando' ? (
              <Skeleton className="h-9 w-40 rounded-lg" />
            ) : (
              <SegmentedControl
                etiqueta={t('anios')}
                opciones={anios.slice(0, 6).map((a) => ({ valor: String(a), etiqueta: String(a) }))}
                valor={String(anio)}
                onValorChange={(v) => setAnio(Number(v))}
              />
            )}
            <h2 className="text-lg font-semibold text-fg">{t('anio', { anio })}</h2>
            {estadoAnio && <EstadoPeriodo status={estadoAnio} />}
          </div>
          {estadoAnio === 'open' && !cargandoPermisos && (
            <button
              type="button"
              className={clasesBoton({ variante: 'secundario' })}
              onClick={() => setEjercicio(true)}
              disabled={!puedeCerrarEjercicio}
              title={puedeCerrarEjercicio ? undefined : t('cierreAnualSinPermiso')}
            >
              <Lock aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('cierreAnual')}
            </button>
          )}
        </div>
      )}

      {estado === 'cargando' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true">
          {Array.from({ length: 12 }, (_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      )}

      {estado === 'listo' && mesesCreados === 0 && otros.length === 0 && (
        <EmptyState
          variante="empty"
          titulo={t('vacio.titulo', { anio })}
          descripcion={t('vacio.descripcion')}
          accion={{ etiqueta: t('vacio.accion'), onClick: () => setGenerar(true), icono: Plus }}
        />
      )}

      {estado === 'listo' && (mesesCreados > 0 || otros.length > 0) && (
        <>
          <section aria-label={t('rejilla', { anio })} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {celdas.map((celda) => (
              <TarjetaMes
                key={celda.mes}
                celda={celda}
                titulo={mesLargo(celda.mes)}
                asientos={conteos.get(celda.mes)}
                pendientes={celda.periodo ? pendientes.get(celda.periodo.id) : undefined}
                nombres={nombres}
                formatDate={formatDate}
                puede={puede}
                cargandoPermisos={cargandoPermisos}
                creando={creandoMes === celda.mes}
                onCerrar={setCerrar}
                onReabrir={setReabrir}
                onCrear={() => void crearMes(celda.mes)}
              />
            ))}
          </section>

          {otros.length > 0 && (
            <section aria-label={t('otros', { anio })} className="space-y-3">
              <h2 className="text-base font-semibold text-fg">{t('otros', { anio })}</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {otros.map((periodo) => (
                  <TarjetaMes
                    key={periodo.id}
                    celda={{ mes: periodo.month ?? 0, periodo, situacion: 'pasado', pendienteDeCierre: false }}
                    titulo={periodo.period_type === 'yearly' ? t('periodoAnual') : nombrePeriodo(periodo)}
                    pendientes={pendientes.get(periodo.id)}
                    nombres={nombres}
                    formatDate={formatDate}
                    puede={puede}
                    cargandoPermisos={cargandoPermisos}
                    creando={false}
                    onCerrar={setCerrar}
                    onReabrir={setReabrir}
                    onCrear={() => undefined}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <CerrarPeriodoDialogo
        periodo={cerrar}
        nombre={cerrar ? nombrePeriodo(cerrar) : ''}
        puedeCerrar={!cargandoPermisos && puede(PERMISO_CERRAR_PERIODO)}
        onCerrado={async () => {
          if (cerrar) toastSuccess(t('exito.cerrado', { periodo: nombrePeriodo(cerrar) }));
          setCerrar(null);
          await cargar();
        }}
        onError={(error) => toastError(mensajeError(error))}
        onAbiertoChange={(abierto) => !abierto && setCerrar(null)}
      />

      <ReabrirPeriodoDialogo
        periodo={reabrir}
        nombre={reabrir ? nombrePeriodo(reabrir) : ''}
        onReabierto={async () => {
          if (reabrir) toastSuccess(t('exito.reabierto', { periodo: nombrePeriodo(reabrir) }));
          setReabrir(null);
          await cargar();
        }}
        mensajeError={mensajeError}
        onAbiertoChange={(abierto) => !abierto && setReabrir(null)}
      />

      <GenerarPeriodosDialogo
        abierto={generar}
        anioInicial={anioGenerar}
        periodos={periodos}
        onGenerado={async (anioGenerado, tipo) => {
          toastSuccess(tipo === 'monthly' ? t('exito.generadosMes', { anio: anioGenerado }) : t('exito.generadoAnual', { anio: anioGenerado }));
          setGenerar(false);
          await cargar();
          setAnio(anioGenerado);
        }}
        onError={(error) => toastError(mensajeError(error))}
        onAbiertoChange={setGenerar}
      />

      <CerrarEjercicioDialogo
        abierto={ejercicio}
        anioInicial={anio}
        borradores={borradoresDelAnio}
        anioConBorradores={anio}
        puedeCerrar={puedeCerrarEjercicio}
        onCerrado={async (anioCerrado, resultado) => {
          toastSuccess(t('exito.ejercicio', { anio: anioCerrado, cuenta: resultado.cuenta_resultado, n: resultado.asientos }));
          setEjercicio(false);
          await cargar();
        }}
        onError={(error) => toastError(mensajeError(error))}
        onAbiertoChange={setEjercicio}
      />
    </div>
  );
}

interface TarjetaMesProps {
  celda: CeldaMes<FiscalPeriod>;
  titulo: string;
  asientos?: number;
  pendientes?: Pendientes;
  nombres: Map<string, string>;
  formatDate: (v: string | null | undefined) => string;
  puede: (codigo: string) => boolean;
  cargandoPermisos: boolean;
  creando: boolean;
  onCerrar: (p: FiscalPeriod) => void;
  onReabrir: (p: FiscalPeriod) => void;
  onCrear: () => void;
}

/** «TarjetaPeriodo» de la rejilla: mes, estado, cifras y acción. */
function TarjetaMes({
  celda,
  titulo,
  asientos,
  pendientes,
  nombres,
  formatDate,
  puede,
  cargandoPermisos,
  creando,
  onCerrar,
  onReabrir,
  onCrear,
}: TarjetaMesProps) {
  const t = useTranslations('finanzasContabilidadR3.periodos');
  const periodo = celda.periodo;
  const actual = celda.situacion === 'actual';
  const acciones = periodo ? botonesDePeriodo(periodo, puede, cargandoPermisos) : { cerrar: false, reabrir: false };
  const conPendientes = (pendientes?.pendientes ?? 0) > 0;

  let pie: ReactNode = null;
  if (!periodo) {
    pie = <span className="text-fg-muted">{t('tarjeta.sinCrear')}</span>;
  } else if (periodo.status === 'closed') {
    const quien = periodo.closed_by ? nombres.get(periodo.closed_by) : null;
    pie = (
      <span className="text-fg-muted">
        {periodo.closed_at
          ? quien
            ? t('tarjeta.cerradoPor', { nombre: quien, fecha: formatDate(periodo.closed_at) })
            : t('tarjeta.cerradoEl', { fecha: formatDate(periodo.closed_at) })
          : null}
      </span>
    );
  } else if (celda.pendienteDeCierre) {
    pie = <span className="font-medium text-warning-text">{t('tarjeta.pendienteCierre')}</span>;
  } else if (actual) {
    pie = <span className="text-fg-muted">{t('tarjeta.enCurso')}</span>;
  } else if (celda.situacion === 'futuro') {
    pie = <span className="text-fg-muted">{t('tarjeta.futuro')}</span>;
  }

  return (
    <article
      aria-label={titulo}
      className={cn('flex flex-col gap-1.5 rounded-xl border bg-surface p-4', actual ? 'border-brand bg-brand-tint' : 'border-line')}
    >
      <header className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-fg">{actual ? t('tarjeta.actual', { mes: titulo }) : titulo}</h3>
        {periodo ? <EstadoPeriodo status={periodo.status} /> : null}
      </header>
      <p className="text-sm text-fg-secondary">
        {asientos === undefined ? ' ' : asientos > 0 ? t('tarjeta.asientos', { n: asientos }) : t('tarjeta.sinMovimiento')}
      </p>
      {periodo && periodo.status !== 'closed' && pendientes && (
        <p className={cn('text-sm', conPendientes ? 'font-medium text-danger-text' : 'text-fg-secondary')}>
          {t('tarjeta.pendientes', { n: pendientes.pendientes })}
          {pendientes.borradores > 0 ? ` · ${t('tarjeta.borradores', { n: pendientes.borradores })}` : ''}
        </p>
      )}
      {periodo && (
        <p className="text-xs text-fg-muted">
          {t('tarjeta.rango', { desde: formatPlainDate(periodo.start_date), hasta: formatPlainDate(periodo.end_date) })}
        </p>
      )}
      {periodo?.reopened_at && (
        <p className="text-xs text-fg-muted" title={periodo.reopen_reason ?? undefined}>
          {t('tarjeta.reabierto', { fecha: formatDate(periodo.reopened_at), motivo: periodo.reopen_reason ?? '' })}
        </p>
      )}
      {periodo?.notes && <p className="text-xs italic text-fg-muted">{t('tarjeta.notas', { notas: periodo.notes })}</p>}
      <footer className="mt-auto flex min-h-9 items-center justify-between gap-2 pt-1 text-sm">
        {pie}
        {periodo && acciones.cerrar && (
          <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => onCerrar(periodo)}>
            {t('tarjeta.cerrar')}
          </button>
        )}
        {periodo && acciones.reabrir && (
          <button type="button" className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })} onClick={() => onReabrir(periodo)}>
            {t('tarjeta.reabrir')}
          </button>
        )}
        {!periodo && (
          <button type="button" className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })} onClick={onCrear} disabled={creando}>
            <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('tarjeta.crearMes')}
          </button>
        )}
      </footer>
    </article>
  );
}

