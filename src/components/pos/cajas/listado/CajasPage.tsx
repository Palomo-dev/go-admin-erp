'use client';

/**
 * /app/pos/cajas — rediseño aprobado en Figma (sección 680:404392, página 05):
 * pestañas «Mi caja», «Cajas abiertas» e «Historial» con el kit compartido.
 *
 * Funcionalidad que se conserva del listado anterior: abrir caja con monto
 * inicial (AperturaCajaDialog), entradas y salidas manuales (MovimientosDialog),
 * cierre con conteo por método, diferencia y observaciones (CierreCajaDialog),
 * reporte imprimible carta / POS 80 mm (ReportGenerator), resumen y movimientos
 * de la caja propia, cajas abiertas de la organización, historial paginado,
 * cierre ciego, realtime y el modo de cajas de la organización (por cajero o
 * por sucursal). El arqueo con conteo por denominación sigue en el detalle
 * (/app/pos/cajas/[id]/arqueos/nuevo), enlazado desde «⋯».
 *
 * Permisos (regla dura 6): quién puede cerrar cajas ajenas y ver el esperado
 * en cierre ciego lo decide el servidor (`usePermisosCaja`); el cierre de una
 * caja ajena lo vuelve a comprobar `POST /api/pos/cajas/[id]/cerrar`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Banknote, DollarSign, Eye, History, ListChecks, Lock, Plus, RefreshCw } from 'lucide-react';
import {
  BranchBadgeActiva,
  EmptyState,
  KpiStrip,
  PageHeader,
  RowActionsMenu,
  SegmentedControl,
  StatCard,
  type AccionFila,
} from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { formatDateInTz } from '@/lib/utils/dateDisplay';
import { addPlainDays } from '@/lib/utils/dateCore';
import { MOTIVO_NO_PUEDE_CERRAR, puedeCerrarCaja } from '@/lib/pos/cajas/reglasCierre';
import { AperturaCajaDialog } from '../AperturaCajaDialog';
import { CierreCajaDialog } from '../CierreCajaDialog';
import { MovimientosDialog } from '../MovimientosDialog';
import { CajasService } from '../CajasService';
import { useBlindCloseMode } from '../useBlindCloseMode';
import { usePermisosCaja } from '../usePermisosCaja';
import type { CashSession, CashSummary } from '../types';
import { dinero, dineroConSigno, haceCuanto, resumenCajasAbiertas, resumenDiferencias, type ResumenDiferencias } from '../historialCajas';
import { CajasAbiertasTab } from './CajasAbiertasTab';
import { HistorialTab } from './HistorialTab';
import { MiCajaTab } from './MiCajaTab';
import { Oculto, esPestanaCajas, type PestanaCajas } from './comunes';

export function CajasPage() {
  const router = useRouter();
  const pathname = usePathname() ?? '/app/pos/cajas';
  const params = useSearchParams();
  const { organization, isLoading: orgLoading } = useOrganization();
  const { branchFilter, branches, selectedBranchId, isLoading: branchLoading } = useBranch();
  const { timezone, getToday, toInstant } = useFormatDate();
  const permisos = usePermisosCaja();
  const { showExpected, isBlindMode } = useBlindCloseMode();

  // ── Pestaña (en la URL: «Ver historial» y el enlace compartido la conservan) ──
  const tabUrl = params?.get('tab');
  const tab: PestanaCajas = esPestanaCajas(tabUrl) ? tabUrl : 'mi-caja';
  const setTab = (siguiente: PestanaCajas) => {
    const qs = new URLSearchParams(params?.toString() ?? '');
    if (siguiente === 'mi-caja') qs.delete('tab');
    else qs.set('tab', siguiente);
    const texto = qs.toString();
    router.replace(texto ? `${pathname}?${texto}` : pathname, { scroll: false });
  };

  // ── Datos ────────────────────────────────────────────────────────────────
  const [modo, setModo] = useState<'branch' | 'user'>('branch');
  const [miCaja, setMiCaja] = useState<CashSession | null>(null);
  const [cargandoMiCaja, setCargandoMiCaja] = useState(true);
  const [errorMiCaja, setErrorMiCaja] = useState<string | null>(null);
  const [abiertas, setAbiertas] = useState<CashSession[]>([]);
  const [cargandoAbiertas, setCargandoAbiertas] = useState(true);
  const [errorAbiertas, setErrorAbiertas] = useState<string | null>(null);
  const [resumenes, setResumenes] = useState<Map<number, CashSummary>>(new Map());
  const [delDia, setDelDia] = useState<ResumenDiferencias | null>(null);
  const [refrescando, setRefrescando] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [recargaHistorial, setRecargaHistorial] = useState(0);
  const [actualizado, setActualizado] = useState(() => new Date());
  const [, setReloj] = useState(0);

  // ── Diálogos ─────────────────────────────────────────────────────────────
  const [aperturaAbierta, setAperturaAbierta] = useState(false);
  const [movimientoAbierto, setMovimientoAbierto] = useState(false);
  const [cajaACerrar, setCajaACerrar] = useState<CashSession | null>(null);

  const cargarMiCaja = useCallback(async () => {
    setErrorMiCaja(null);
    try {
      const [sesion, modoOrg] = await Promise.all([CajasService.getActiveSession(), CajasService.getCashSessionMode()]);
      setMiCaja(sesion);
      setModo(modoOrg);
    } catch (e) {
      console.error('Error loading active session:', e);
      setErrorMiCaja(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setCargandoMiCaja(false);
    }
  }, []);

  const cargarAbiertas = useCallback(async () => {
    setErrorAbiertas(null);
    try {
      const sesiones = await CajasService.getActiveSessions();
      setAbiertas(sesiones);
      setCargandoAbiertas(false);
      // El resumen de cada caja (ventas en efectivo, movimientos, esperado) es el
      // mismo `getCashSummary` del cierre: una sola forma de calcular el esperado.
      const calculados = await Promise.allSettled(sesiones.map((s) => CajasService.getCashSummary(s.id)));
      const mapa = new Map<number, CashSummary>();
      calculados.forEach((r, i) => {
        if (r.status === 'fulfilled') mapa.set(sesiones[i].id, r.value);
      });
      setResumenes(mapa);
    } catch (e) {
      console.error('Error loading active sessions:', e);
      setErrorAbiertas(e instanceof Error ? e.message : 'Error desconocido');
      setCargandoAbiertas(false);
    }
  }, []);

  const cargarDelDia = useCallback(async () => {
    try {
      const hoy = getToday();
      const diferencias = await CajasService.getSessionHistoryDifferences({
        status: 'closed',
        desde: toInstant(hoy),
        hasta: toInstant(addPlainDays(hoy, 1)),
      });
      setDelDia(resumenDiferencias(diferencias));
    } catch (e) {
      console.warn('No se pudo calcular la diferencia del día:', e);
      setDelDia(null);
    }
  }, [getToday, toInstant]);

  const recargarTodo = useCallback(
    async (silenciosa: boolean) => {
      if (!silenciosa) setRefrescando(true);
      await Promise.all([cargarMiCaja(), cargarAbiertas(), cargarDelDia()]);
      setRefreshTrigger((n) => n + 1);
      setRecargaHistorial((n) => n + 1);
      setActualizado(new Date());
      setRefrescando(false);
    },
    [cargarAbiertas, cargarDelDia, cargarMiCaja],
  );

  // Al entrar y al cambiar de organización o de sucursal.
  useEffect(() => {
    if (!organization?.id || branchLoading) return;
    void recargarTodo(true);
  }, [organization?.id, branchFilter, branchLoading, recargarTodo]);

  // Realtime: recarga silenciosa (sin esqueleto) con 300 ms de agrupación.
  const recargarRef = useRef(recargarTodo);
  useEffect(() => {
    recargarRef.current = recargarTodo;
  }, [recargarTodo]);
  useEffect(() => {
    if (!organization?.id) return;
    let espera: ReturnType<typeof setTimeout> | null = null;
    const alCambiar = () => {
      if (espera) clearTimeout(espera);
      espera = setTimeout(() => void recargarRef.current(true), 300);
    };
    const cancelar = CajasService.subscribeToCashSessions(organization.id, alCambiar, { includeMovements: true });
    return () => {
      if (espera) clearTimeout(espera);
      cancelar();
    };
  }, [organization?.id, branchFilter]);

  // «Actualizado hace 1 min» se refresca solo.
  useEffect(() => {
    const id = setInterval(() => setReloj((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // ── Permisos ─────────────────────────────────────────────────────────────
  const puedeCerrarMiCaja = !!miCaja && puedeCerrarCaja(miCaja, permisos.userId, permisos.cerrarCajasAjenas);
  const abrirCaja = useCallback(() => setAperturaAbierta(true), []);
  const cerrarMiCaja = useCallback(() => miCaja && setCajaACerrar(miCaja), [miCaja]);

  // F9: abre caja si no hay; si hay y puedes, la cierra (el diálogo pide el conteo).
  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key !== 'F9' || aperturaAbierta || movimientoAbierto || cajaACerrar) return;
      e.preventDefault();
      if (!miCaja) abrirCaja();
      else if (puedeCerrarMiCaja) cerrarMiCaja();
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [abrirCaja, aperturaAbierta, cajaACerrar, cerrarMiCaja, miCaja, movimientoAbierto, puedeCerrarMiCaja]);

  // ── Eventos de los diálogos (los toasts los muestran los propios diálogos) ──
  const alAbrir = (sesion: CashSession) => {
    setMiCaja(sesion);
    setAperturaAbierta(false);
    void recargarTodo(true);
  };
  const alCerrar = () => {
    setCajaACerrar(null);
    void recargarTodo(true);
  };
  const alRegistrarMovimiento = () => {
    setRefreshTrigger((n) => n + 1);
    setActualizado(new Date());
    void cargarAbiertas();
  };

  // ── Cabecera ─────────────────────────────────────────────────────────────
  const nombreSucursal =
    branchFilter === null ? 'tus sucursales' : branches.find((b) => b.id === (branchFilter ?? selectedBranchId))?.name ?? 'esta sucursal';
  const fechaTurno = formatDateInTz(miCaja?.opened_at ?? new Date(), timezone, {
    locale: 'es-CO',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const subtitulo = `${organization?.name ?? 'Organización'} · Turno del ${fechaTurno}`;

  const masAcciones: AccionFila[] = [
    {
      id: 'detalle',
      etiqueta: 'Ver detalle de mi caja',
      icono: Eye,
      onSelect: () => miCaja && router.push(`/app/pos/cajas/${miCaja.uuid}`),
      oculta: !miCaja || miCaja.id < 0,
    },
    {
      id: 'arqueo',
      etiqueta: 'Nuevo arqueo',
      icono: ListChecks,
      onSelect: () => miCaja && router.push(`/app/pos/cajas/${miCaja.uuid}/arqueos/nuevo`),
      oculta: !miCaja || miCaja.id < 0,
    },
    { id: 'historial', etiqueta: 'Ver historial', icono: History, onSelect: () => setTab('historial'), separadorAntes: true },
  ];

  const botonPrincipal = miCaja ? (
    <Button
      className="h-10 gap-2"
      onClick={cerrarMiCaja}
      disabled={!puedeCerrarMiCaja}
      title={puedeCerrarMiCaja ? 'Cerrar caja (F9)' : MOTIVO_NO_PUEDE_CERRAR}
    >
      <Lock aria-hidden="true" className="size-4" strokeWidth={1.5} />
      Cerrar caja
    </Button>
  ) : (
    <Button className="h-10 gap-2" onClick={abrirCaja} title="Abrir caja (F9)">
      <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
      Abrir caja
    </Button>
  );

  const etiquetaEstado = miCaja
    ? modo === 'user'
      ? 'Mi caja abierta'
      : 'Caja de la sucursal abierta'
    : modo === 'user'
      ? 'Sin caja abierta'
      : 'Sucursal sin caja abierta';

  const cargandoInicial = orgLoading || branchLoading || (cargandoMiCaja && !miCaja);

  const pestanas = (
    <SegmentedControl
      etiqueta="Vista de cajas"
      valor={tab}
      onValorChange={setTab}
      anchoCompleto
      className="lg:w-auto"
      opciones={[
        { valor: 'mi-caja', etiqueta: 'Mi caja' },
        { valor: 'abiertas', etiqueta: 'Cajas abiertas', contador: abiertas.length },
        { valor: 'historial', etiqueta: 'Historial' },
      ]}
    />
  );

  const resumenAbiertas = useMemo(() => resumenCajasAbiertas(abiertas, resumenes), [abiertas, resumenes]);

  return (
    <div className="flex min-h-screen flex-col gap-4 bg-canvas p-4 sm:p-6">
      <PageHeader
        titulo="Cajas"
        icono={Banknote}
        subtitulo={subtitulo}
        cargando={refrescando}
        migas={[{ etiqueta: 'Punto de venta', href: '/app/pos' }, { etiqueta: 'Cajas' }]}
        acciones={
          <>
            <Button
              variant="outline"
              size="icon"
              className="size-10"
              onClick={() => void recargarTodo(false)}
              disabled={refrescando}
              aria-label="Recargar"
              title="Recargar"
            >
              <RefreshCw aria-hidden="true" className={refrescando ? 'size-4 animate-spin' : 'size-4'} strokeWidth={1.5} />
            </Button>
            {miCaja && (
              <Button variant="outline" className="h-10 gap-2" onClick={() => setMovimientoAbierto(true)}>
                <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
                Registrar movimiento
              </Button>
            )}
            {botonPrincipal}
            <RowActionsMenu orientacion="horizontal" tamano="md" acciones={masAcciones} />
          </>
        }
        movil={{
          accion: (
            <button
              type="button"
              onClick={miCaja ? cerrarMiCaja : abrirCaja}
              disabled={!!miCaja && !puedeCerrarMiCaja}
              aria-label={miCaja ? 'Cerrar caja' : 'Abrir caja'}
              className="flex size-10 items-center justify-center rounded-lg text-brand disabled:opacity-50"
            >
              {miCaja ? <Lock className="size-5" strokeWidth={1.5} /> : <Plus className="size-5" strokeWidth={1.5} />}
            </button>
          ),
        }}
        debajo={
          <>
            <BranchBadgeActiva />
            <Badge tono={miCaja ? 'exito' : 'neutro'} apariencia="suave" tamano="sm" punto>
              {etiquetaEstado}
            </Badge>
            {miCaja?.pending_sync && (
              <Badge tono="advertencia" apariencia="suave" tamano="sm">
                Pendiente de sincronizar
              </Badge>
            )}
            {isBlindMode && (
              <Badge tono="informacion" apariencia="suave" tamano="sm">
                Cierre ciego
              </Badge>
            )}
            <span className="text-xs text-fg-muted" aria-live="polite">
              Actualizado {haceCuanto(actualizado)}
            </span>
            <kbd className="hidden rounded border border-line bg-subtle px-1.5 font-mono text-[11px] leading-4 text-fg-secondary lg:inline">
              F9
            </kbd>
          </>
        }
      />

      {tab === 'abiertas' && (
        <KpiStrip etiqueta="Resumen de cajas abiertas">
          <StatCard
            etiqueta="Cajas abiertas"
            icono={DollarSign}
            cargando={cargandoAbiertas}
            valor={resumenAbiertas.cajas}
            detalle={
              resumenAbiertas.cajas === 0
                ? 'ninguna sucursal'
                : `en ${resumenAbiertas.sucursales} ${resumenAbiertas.sucursales === 1 ? 'sucursal' : 'sucursales'}`
            }
          />
          <StatCard
            etiqueta="Efectivo esperado"
            icono={DollarSign}
            cargando={cargandoAbiertas}
            valor={showExpected ? dinero(resumenAbiertas.esperado) : <Oculto />}
            detalle={showExpected ? `en ${resumenAbiertas.cajas} ${resumenAbiertas.cajas === 1 ? 'caja' : 'cajas'}` : 'cierre ciego'}
          />
          <StatCard
            etiqueta="Diferencia del día"
            icono={DollarSign}
            cargando={!delDia && cargandoAbiertas}
            valor={showExpected ? dineroConSigno(delDia?.neta ?? 0) : <Oculto />}
            detalle={
              !showExpected
                ? 'cierre ciego'
                : !delDia?.sesiones
                  ? 'sin cierres hoy'
                  : delDia.cajasConFaltante
                    ? `${delDia.cajasConFaltante} ${delDia.cajasConFaltante === 1 ? 'caja' : 'cajas'} con faltante`
                    : `${delDia.sesiones} ${delDia.sesiones === 1 ? 'cierre' : 'cierres'} sin faltante`
            }
            tono={showExpected && delDia?.cajasConFaltante ? 'peligro' : 'neutro'}
            tendencia={showExpected && delDia?.cajasConFaltante ? 'baja' : undefined}
          />
          <StatCard
            etiqueta="Movimientos del turno"
            icono={DollarSign}
            cargando={cargandoAbiertas}
            valor={resumenAbiertas.movimientos}
            detalle={
              resumenAbiertas.cajas === 0
                ? 'sin turno abierto'
                : `${resumenAbiertas.ingresos} ${resumenAbiertas.ingresos === 1 ? 'ingreso' : 'ingresos'} · ${resumenAbiertas.egresos} ${resumenAbiertas.egresos === 1 ? 'egreso' : 'egresos'}`
            }
          />
        </KpiStrip>
      )}

      {tab === 'mi-caja' &&
        (cargandoInicial ? (
          <div className="flex flex-col gap-4" aria-busy="true">
            <div className="flex lg:justify-end">{pestanas}</div>
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        ) : errorMiCaja ? (
          <div className="flex flex-col gap-4">
            <div className="flex lg:justify-end">{pestanas}</div>
            <div className="rounded-xl border border-line bg-surface">
              <EmptyState
                variante="error"
                titulo="No pudimos cargar tu caja"
                descripcion={errorMiCaja}
                onReintentar={() => void recargarTodo(false)}
              />
            </div>
          </div>
        ) : (
          <MiCajaTab
            sesion={miCaja}
            modo={modo}
            refreshTrigger={refreshTrigger}
            puedeCerrar={puedeCerrarMiCaja}
            onAbrirCaja={abrirCaja}
            pestanas={pestanas}
          />
        ))}

      {tab === 'abiertas' && (
        <CajasAbiertasTab
          sesiones={abiertas}
          resumenes={resumenes}
          cargando={cargandoAbiertas}
          error={errorAbiertas}
          onReintentar={() => void recargarTodo(false)}
          userId={permisos.userId}
          cerrarAjenas={permisos.cerrarCajasAjenas}
          showExpected={showExpected}
          onCerrar={setCajaACerrar}
          onAbrirCaja={miCaja ? null : abrirCaja}
          onVerHistorial={() => setTab('historial')}
          nombreSucursal={nombreSucursal}
          pestanas={pestanas}
        />
      )}

      {tab === 'historial' && <HistorialTab showExpected={showExpected} recarga={recargaHistorial} pestanas={pestanas} />}

      {/* Diálogos controlados: los disparadores son los botones de esta pantalla. */}
      <AperturaCajaDialog open={aperturaAbierta} onOpenChange={setAperturaAbierta} onSessionOpened={alAbrir} />
      {miCaja && <MovimientosDialog open={movimientoAbierto} onOpenChange={setMovimientoAbierto} onMovementAdded={alRegistrarMovimiento} />}
      {cajaACerrar && (
        <CierreCajaDialog
          session={cajaACerrar}
          open
          onOpenChange={(abierto) => {
            if (!abierto) setCajaACerrar(null);
          }}
          onSessionClosed={alCerrar}
        />
      )}
    </div>
  );
}
