'use client';

/**
 * Logística › Cuadres (Figma 2803:4298 · 2803:14655): lo que cobraron los domiciliarios contra lo
 * que entra a la caja.
 *
 * Pestaña «Domiciliarios»: indicadores del día, los cobros que aún no están en un cuadre («por
 * recibir»), los cuadres abiertos y los cerrados (cuadrados o con diferencia). «Recibir dinero»
 * abre la hoja que cobra en la caja abierta de la sede con las RPC del cuadre.
 * Pestaña «Transportadoras y terceros»: deshabilitada, llega en las fases 2 y 3.
 *
 * Lee con el cliente del navegador (RLS de miembro activo, filtrado por organización y por la
 * sucursal del header); lo que mueve dinero son RPC con su guarda (`pos.create`, acceso a la sede).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Ban, Clock, Download, HandCoins, RefreshCw, Scale, TriangleAlert, Wallet } from 'lucide-react';
import {
  BranchBadgeActiva,
  DataTable,
  Dialogo,
  DialogoMotivo,
  KpiStrip,
  ListCard,
  ListToolbar,
  PageHeader,
  SearchInput,
  StatCard,
  StatusBadge,
  TabBar,
  clasesBoton,
  idPanel,
  idPestana,
  type AccionFila,
  type ColumnaTabla,
} from '@/components/kit';
import { toastSuccess } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { addPlainDays, toPlainDate } from '@/lib/utils/dateCore';
import { aCsv, descargarCsv } from '@/lib/finanzas/csv';
import {
  filasCuadres,
  filtrarCuadres,
  kpisCuadres,
  leerFiltroCuadres,
  type CuadreGuardado,
  type EnvioCobrado,
  type EstadoFilaCuadre,
  type FilaCuadre,
} from '@/lib/logistica/cuadresVista';
import { nombreDomiciliario } from '@/lib/logistica/domiciliarios';
import { CuadreError, anularCuadre, listarCuadres, pendientesPorCuadrar } from '@/lib/services/logistica/cuadresDomiciliarioService';
import { listarDomiciliarios, type DomiciliarioFila } from '@/lib/services/logistica/domiciliariosService';
import { RecibirDineroHoja, type CajaAbierta, type LineaHoja } from './RecibirDineroHoja';

type Pestana = 'domiciliarios' | 'transportadoras';

const TONO_ESTADO: Readonly<Record<EstadoFilaCuadre, 'advertencia' | 'informacion' | 'exito' | 'peligro' | 'neutro'>> = {
  por_recibir: 'advertencia',
  abierto: 'informacion',
  cuadrado: 'exito',
  con_diferencia: 'peligro',
  anulado: 'neutro',
};

interface LineaGuardada {
  id: string;
  settlement_id: string;
  shipment_id: string;
  source_type: string | null;
  source_id: string | null;
  expected_amount: number | string;
  reported_amount: number | string | null;
  reported_method: string | null;
  received_amount: number | string | null;
  status: LineaHoja['status'];
}

export function CuadresPantalla() {
  const t = useTranslations('logistica.cuadres');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const moneda = useMonedaOrganizacion();
  const { organization } = useOrganization();
  const orgId = organization?.id ?? null;
  const { branchFilter, branches } = useBranch();
  const { getToday, timezone, formatDate, formatTime } = useFormatDate(null);
  const hoy = getToday();
  const filtroDomiciliario = searchParams?.get('domiciliario') ?? null;
  // `?filtro=con_diferencia_hoy|por_recibir`: lo abre el Inicio («1 cuadre con diferencia»,
  // «2 cuadres abiertos»), con la misma regla de los indicadores de arriba.
  const filtroUrl = leerFiltroCuadres(searchParams?.get('filtro'));

  const [pestana, setPestana] = useState<Pestana>('domiciliarios');
  const [cuadres, setCuadres] = useState<CuadreGuardado[]>([]);
  const [lineasAbiertas, setLineasAbiertas] = useState<LineaGuardada[]>([]);
  const [cobrados, setCobrados] = useState<EnvioCobrado[]>([]);
  const [domiciliarios, setDomiciliarios] = useState<DomiciliarioFila[]>([]);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error'>('cargando');
  const [version, setVersion] = useState(0);
  const [busqueda, setBusqueda] = useState('');
  const [recibir, setRecibir] = useState<FilaCuadre | null>(null);
  const [caja, setCaja] = useState<CajaAbierta | null | undefined>(undefined);
  const [elegir, setElegir] = useState(false);
  const [anular, setAnular] = useState<FilaCuadre | null>(null);
  const [anulando, setAnulando] = useState(false);
  const [errorAnular, setErrorAnular] = useState<string | null>(null);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!orgId) return;
    let cancelado = false;
    setEstado((e) => (e === 'listo' ? e : 'cargando'));
    (async () => {
      try {
        const [lista, pendientes, dom] = await Promise.all([
          listarCuadres(supabase, orgId, { branchId: branchFilter, driverId: filtroDomiciliario, limite: 200 }),
          pendientesPorCuadrar(supabase, orgId, branchFilter),
          listarDomiciliarios(supabase, orgId),
        ]);
        const ids = (lista as unknown as Array<{ id: string }>).map((c) => c.id);
        const { data: lineas, error } = ids.length
          ? await supabase
              .from('courier_settlement_lines')
              .select('id, settlement_id, shipment_id, source_type, source_id, expected_amount, reported_amount, reported_method, received_amount, status')
              .eq('organization_id', orgId)
              .in('settlement_id', ids)
          : { data: [], error: null };
        if (error) throw error;
        if (cancelado) return;
        const porCuadre = new Map<string, number>();
        for (const l of (lineas ?? []) as LineaGuardada[]) if (l.status !== 'cancelled') porCuadre.set(l.settlement_id, (porCuadre.get(l.settlement_id) ?? 0) + 1);
        setCuadres((lista as unknown as CuadreGuardado[]).map((c) => ({ ...c, lineas: porCuadre.get(c.id) ?? 0 })));
        setLineasAbiertas(((lineas ?? []) as LineaGuardada[]).filter((l) => (lista as unknown as CuadreGuardado[]).some((c) => c.id === l.settlement_id && c.status === 'open')));
        setCobrados((pendientes as EnvioCobrado[]).filter((p) => !filtroDomiciliario || p.driver_id === filtroDomiciliario));
        setDomiciliarios(dom);
        setEstado('listo');
      } catch {
        if (!cancelado) setEstado('error');
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [orgId, branchFilter, filtroDomiciliario, version]);

  const enCuadreAbierto = useMemo(() => new Set(lineasAbiertas.filter((l) => l.status !== 'cancelled').map((l) => l.shipment_id)), [lineasAbiertas]);
  const filas = useMemo(() => filasCuadres(cuadres, cobrados, enCuadreAbierto), [cuadres, cobrados, enCuadreAbierto]);
  const kpis = useMemo(() => kpisCuadres(filas, cuadres, hoy, timezone), [filas, cuadres, hoy, timezone]);
  const nombres = useMemo(() => new Map(domiciliarios.map((d) => [d.id, nombreDomiciliario(d)])), [domiciliarios]);
  const nombreDe = useCallback((id: string) => nombres.get(id) || t('sinNombre'), [nombres, t]);
  const nombreSede = useCallback((id: number) => branches.find((b) => b.id === id)?.name ?? '—', [branches]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const filtradas = filtrarCuadres(filas, cuadres, filtroUrl, hoy, timezone);
    return q ? filtradas.filter((f) => nombreDe(f.driverId).toLowerCase().includes(q)) : filtradas;
  }, [filas, cuadres, filtroUrl, hoy, timezone, busqueda, nombreDe]);
  const porRecibir = filas.filter((f) => f.estado === 'por_recibir' || f.estado === 'abierto');

  const quitarDeUrl = (clave: 'domiciliario' | 'filtro') => {
    const q = new URLSearchParams(searchParams?.toString() ?? '');
    q.delete(clave);
    const s = q.toString();
    router.replace(s ? `${pathname}?${s}` : pathname ?? '', { scroll: false });
  };
  const quitarFiltroDomiciliario = () => quitarDeUrl('domiciliario');

  // ── Recibir dinero ───────────────────────────────────────────────────────
  const [lineasHoja, setLineasHoja] = useState<LineaHoja[]>([]);
  const abrirRecibir = async (f: FilaCuadre) => {
    setElegir(false);
    setCaja(undefined);
    setRecibir(f);
    // Líneas: las del cuadre abierto o, si aún no hay cuadre, los envíos cobrados de esa sede.
    const numeros = new Map(cobrados.map((c) => [c.id, c.shipment_number ?? null]));
    if (f.cuadreId) {
      const propias = lineasAbiertas.filter((l) => l.settlement_id === f.cuadreId && l.status !== 'cancelled');
      const sinNumero = propias.filter((l) => !numeros.has(l.shipment_id)).map((l) => l.shipment_id);
      if (sinNumero.length) {
        const { data } = await supabase.from('shipments').select('id, shipment_number').eq('organization_id', orgId!).in('id', sinNumero);
        for (const s of (data ?? []) as Array<{ id: string; shipment_number: string }>) numeros.set(s.id, s.shipment_number);
      }
      setLineasHoja(
        propias.map((l) => ({
          id: l.id,
          shipment_id: l.shipment_id,
          source_type: l.source_type,
          source_id: l.source_id,
          esperado: Number(l.expected_amount) || 0,
          reportado: l.reported_amount == null ? null : Number(l.reported_amount),
          metodo_reportado: l.reported_method,
          recibido: l.received_amount == null ? null : Number(l.received_amount),
          status: l.status,
          numero: numeros.get(l.shipment_id) ?? null,
        })),
      );
    } else {
      setLineasHoja(
        cobrados
          .filter((c) => c.driver_id === f.driverId && c.branch_id === f.branchId && !enCuadreAbierto.has(c.id) && Number(c.cod_amount) > 0)
          .map((c) => ({
            id: c.id,
            shipment_id: c.id,
            source_type: null,
            source_id: null,
            esperado: Number(c.cod_amount) || 0,
            reportado: c.cod_collected_amount == null ? null : Number(c.cod_collected_amount),
            metodo_reportado: c.cod_collected_method,
            recibido: null,
            status: 'pending' as const,
            numero: c.shipment_number ?? null,
          })),
      );
    }
    // Caja abierta de la sede (misma regla del POS: fn_caja_abierta_para).
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data: idCaja } = await supabase.rpc('fn_caja_abierta_para', { p_org: orgId, p_branch: f.branchId, p_user: user?.id ?? null });
      if (!idCaja) return setCaja(null);
      const { data } = await supabase.from('cash_sessions').select('id, opened_at').eq('organization_id', orgId!).eq('id', idCaja).maybeSingle();
      setCaja((data as CajaAbierta | null) ?? { id: Number(idCaja), opened_at: '' });
    } catch {
      setCaja(null);
    }
  };

  const empezarRecibir = () => {
    if (porRecibir.length === 1) void abrirRecibir(porRecibir[0]);
    else setElegir(true);
  };

  const confirmarAnular = async (motivo: string) => {
    if (!anular?.cuadreId) return;
    setAnulando(true);
    setErrorAnular(null);
    try {
      await anularCuadre(supabase, anular.cuadreId, motivo);
      toastSuccess(t('anular.hecho'));
      setAnular(null);
      recargar();
    } catch (err) {
      const codigo = err instanceof CuadreError ? err.codigo : 'ERROR';
      setErrorAnular(t.has(`errores.${codigo}`) ? t(`errores.${codigo}`) : t('errores.ERROR'));
    } finally {
      setAnulando(false);
    }
  };

  // ── Tabla ────────────────────────────────────────────────────────────────
  const dia = (f: FilaCuadre) => {
    if (!f.fecha) return '—';
    const d = toPlainDate(new Date(f.fecha), timezone);
    return d === hoy ? t('hoy') : d === addPlainDays(hoy, -1) ? t('ayer') : formatDate(f.fecha);
  };
  const badge = (f: FilaCuadre) => <StatusBadge estado={f.estado} etiqueta={t(`estados.${f.estado}`)} tono={TONO_ESTADO[f.estado]} />;
  const textoDiferencia = (f: FilaCuadre) =>
    f.estado !== 'cuadrado' && f.estado !== 'con_diferencia' ? (
      <span className="text-fg-muted">—</span>
    ) : f.diferencia === 0 ? (
      <span className="text-success-text">{moneda.formatear(0)}</span>
    ) : (
      <span className="flex flex-col items-end">
        <span className={f.diferencia < 0 ? 'text-danger-text' : 'text-warning-text'}>
          {f.diferencia < 0 ? t('faltan', { monto: moneda.formatear(-f.diferencia) }) : t('sobran', { monto: moneda.formatear(f.diferencia) })}
        </span>
        {f.motivo && <span className="max-w-[180px] truncate text-xs text-fg-muted">{f.motivo}</span>}
      </span>
    );
  const puedeRecibir = (f: FilaCuadre) => f.estado === 'por_recibir' || f.estado === 'abierto';

  const accionesDe = (f: FilaCuadre): AccionFila[] => [
    { id: 'recibir', etiqueta: t('acciones.recibir'), icono: HandCoins, onSelect: () => void abrirRecibir(f), oculta: !puedeRecibir(f) },
    { id: 'domiciliario', etiqueta: t('acciones.soloEste'), icono: Scale, onSelect: () => router.replace(`${pathname}?domiciliario=${f.driverId}`, { scroll: false }), oculta: !!filtroDomiciliario },
    { id: 'anular', etiqueta: t('acciones.anular'), icono: Ban, destructiva: true, onSelect: () => setAnular(f), oculta: f.estado !== 'abierto' },
  ];

  const columnas: ColumnaTabla<FilaCuadre>[] = [
    {
      id: 'fecha',
      encabezado: t('columnas.fecha'),
      celda: (f) => (
        <span className="flex flex-col">
          <span className="text-fg">{dia(f)}</span>
          {f.fecha && <span className="text-xs text-fg-muted">{formatTime(f.fecha)}</span>}
        </span>
      ),
    },
    {
      id: 'domiciliario',
      encabezado: t('columnas.domiciliario'),
      celda: (f) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-fg">{nombreDe(f.driverId)}</span>
          <span className="truncate text-xs text-fg-muted">{nombreSede(f.branchId)}</span>
        </span>
      ),
    },
    { id: 'entregas', encabezado: t('columnas.entregas'), celda: (f) => String(f.entregas), ocultarDebajo: 'md' },
    { id: 'esperado', encabezado: t('columnas.esperado'), variante: 'importe', alinear: 'derecha', celda: (f) => moneda.formatear(f.esperado) },
    { id: 'efectivo', encabezado: t('columnas.efectivo'), variante: 'importe', alinear: 'derecha', celda: (f) => moneda.formatear(f.porMedio.efectivo), ocultarDebajo: 'lg' },
    { id: 'datafono', encabezado: t('columnas.datafono'), variante: 'importe', alinear: 'derecha', celda: (f) => moneda.formatear(f.porMedio.datafono), ocultarDebajo: 'lg' },
    { id: 'transferencia', encabezado: t('columnas.transferencia'), variante: 'importe', alinear: 'derecha', celda: (f) => moneda.formatear(f.porMedio.transferencia), ocultarDebajo: 'xl' },
    { id: 'diferencia', encabezado: t('columnas.diferencia'), alinear: 'derecha', celda: textoDiferencia },
    { id: 'estado', encabezado: t('columnas.estado'), celda: badge },
  ];

  const exportar = () => {
    const csv = aCsv([
      [t('columnas.fecha'), t('columnas.domiciliario'), t('columnas.sede'), t('columnas.entregas'), t('columnas.esperado'), t('columnas.efectivo'), t('columnas.datafono'), t('columnas.transferencia'), t('columnas.diferencia'), t('columnas.motivo'), t('columnas.estado')],
      ...visibles.map((f) => [
        f.fecha ? formatDate(f.fecha) : '',
        nombreDe(f.driverId),
        nombreSede(f.branchId),
        f.entregas,
        f.esperado,
        f.porMedio.efectivo,
        f.porMedio.datafono,
        f.porMedio.transferencia,
        f.diferencia,
        f.motivo ?? '',
        t(`estados.${f.estado}`),
      ]),
    ]);
    descargarCsv(`cuadres-domiciliarios-${hoy}.csv`, csv);
  };

  const nombreFiltro = filtroDomiciliario ? nombreDe(filtroDomiciliario) : null;
  const botonRecibir = (
    <button
      type="button"
      onClick={empezarRecibir}
      disabled={porRecibir.length === 0}
      title={porRecibir.length === 0 ? t('nadaPorRecibir') : undefined}
      className={clasesBoton()}
    >
      <HandCoins aria-hidden="true" className="size-4" strokeWidth={1.5} />
      {t('acciones.recibir')}
    </button>
  );

  return (
    <div className="flex flex-col gap-4 p-4 pb-28 sm:p-6 sm:pb-28 lg:gap-5">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={t('subtitulo')}
        icono={HandCoins}
        migas={[{ etiqueta: t('migaLogistica') }, { etiqueta: t('titulo') }]}
        cargando={estado === 'cargando'}
        debajo={<BranchBadgeActiva />}
        acciones={
          <>
            <button type="button" onClick={recargar} aria-label={t('acciones.recargar')} className={clasesBoton({ variante: 'secundario' })}>
              <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </button>
            <button type="button" onClick={exportar} disabled={visibles.length === 0} className={clasesBoton({ variante: 'secundario' })}>
              <Download aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('acciones.exportar')}
            </button>
            {botonRecibir}
          </>
        }
        movil={{
          accion: (
            <button
              type="button"
              onClick={empezarRecibir}
              disabled={porRecibir.length === 0}
              aria-label={t('acciones.recibir')}
              className="flex size-10 items-center justify-center rounded-lg text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
            >
              <HandCoins aria-hidden="true" className="size-5" strokeWidth={1.5} />
            </button>
          ),
        }}
      />

      <div className="flex flex-col gap-1">
        <TabBar<Pestana>
          id="cuadres"
          etiqueta={t('tabs.etiqueta')}
          valor={pestana}
          onValorChange={setPestana}
          pestanas={[
            { valor: 'domiciliarios', etiqueta: t('tabs.domiciliarios'), contador: filas.length },
            { valor: 'transportadoras', etiqueta: t('tabs.transportadoras'), deshabilitada: true },
          ]}
        />
        <p className="text-xs text-fg-muted">{t('tabs.transportadorasAviso')}</p>
      </div>

      <div role="tabpanel" id={idPanel('cuadres', 'domiciliarios')} aria-labelledby={idPestana('cuadres', 'domiciliarios')} className="flex flex-col gap-4">
        <KpiStrip etiqueta={t('kpis.etiqueta')}>
          <StatCard
            etiqueta={t('kpis.porRecibir')}
            icono={Wallet}
            cargando={estado === 'cargando'}
            valor={moneda.formatear(kpis.porRecibir)}
            tono={kpis.porRecibir > 0 ? 'advertencia' : 'neutro'}
            iconoDetalle={kpis.domiciliariosPorRecibir > 0 ? TriangleAlert : undefined}
            detalle={kpis.domiciliariosPorRecibir > 0 ? t('kpis.domiciliariosPorRecibir', { n: kpis.domiciliariosPorRecibir }) : t('kpis.nadaPorRecibir')}
          />
          <StatCard
            etiqueta={t('kpis.cuadradosHoy')}
            icono={HandCoins}
            cargando={estado === 'cargando'}
            valor={String(kpis.cuadradosHoy)}
            tendencia={kpis.recibidoHoy > 0 ? 'sube' : undefined}
            detalle={t('kpis.recibidoHoy', { monto: moneda.formatear(kpis.recibidoHoy) })}
          />
          <StatCard
            etiqueta={t('kpis.conDiferencia')}
            icono={Scale}
            cargando={estado === 'cargando'}
            valor={String(kpis.conDiferenciaHoy)}
            tono={kpis.conDiferenciaHoy > 0 ? 'peligro' : 'neutro'}
            tendencia={kpis.faltanteHoy < 0 ? 'baja' : undefined}
            detalle={kpis.faltanteHoy < 0 ? t('kpis.faltante', { monto: moneda.formatear(-kpis.faltanteHoy) }) : t('kpis.sinDiferencias')}
          />
          <StatCard
            etiqueta={t('kpis.abiertosAnteriores')}
            icono={Clock}
            cargando={estado === 'cargando'}
            valor={String(kpis.abiertosAnteriores)}
            tono={kpis.abiertosAnteriores > 0 ? 'advertencia' : 'neutro'}
            detalle={kpis.abiertosAnteriores > 0 ? t('kpis.cerrarPendientes') : t('kpis.todoCerrado')}
          />
        </KpiStrip>

        <ListToolbar
          busqueda={<SearchInput value={busqueda} onChange={setBusqueda} placeholder={t('buscar')} etiqueta={t('buscar')} />}
          chips={
            nombreFiltro || filtroUrl ? (
              <>
                {nombreFiltro && (
                  <button type="button" onClick={quitarFiltroDomiciliario} className={clasesBoton({ variante: 'tinte', tamano: 'sm' })}>
                    {t('filtroDomiciliario', { nombre: nombreFiltro })} ×
                  </button>
                )}
                {filtroUrl && (
                  <button type="button" onClick={() => quitarDeUrl('filtro')} className={clasesBoton({ variante: 'tinte', tamano: 'sm' })} data-filtro-url={filtroUrl}>
                    {t(filtroUrl === 'por_recibir' ? 'kpis.porRecibir' : 'kpis.conDiferencia')} ×
                  </button>
                )}
              </>
            ) : undefined
          }
        />

        <DataTable
          etiqueta={t('tabs.domiciliarios')}
          columnas={columnas}
          filas={visibles}
          obtenerId={(f) => f.clave}
          estado={estado === 'cargando' ? 'cargando' : estado === 'error' ? 'error' : visibles.length > 0 ? 'listo' : busqueda.trim() || filtroUrl ? 'sinResultados' : 'vacio'}
          onFilaClick={(f) => (puedeRecibir(f) ? void abrirRecibir(f) : undefined)}
          etiquetaFila={(f) => t('etiquetaFila', { nombre: nombreDe(f.driverId), estado: t(`estados.${f.estado}`) })}
          tonoFila={(f) => (f.estado === 'con_diferencia' ? 'peligro' : undefined)}
          acciones={accionesDe}
          accionesRapidas={(f) =>
            puedeRecibir(f) ? (
              <button
                type="button"
                onClick={() => void abrirRecibir(f)}
                aria-label={t('acciones.recibirDe', { nombre: nombreDe(f.driverId) })}
                title={t('acciones.recibir')}
                className="flex size-8 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <HandCoins aria-hidden="true" className="size-4" strokeWidth={1.5} />
              </button>
            ) : null
          }
          tarjetaMovil={(f) => (
            <ListCard
              icono={HandCoins}
              titulo={nombreDe(f.driverId)}
              subtitulo={`${dia(f)} · ${nombreSede(f.branchId)}`}
              meta={t('entregasN', { n: f.entregas })}
              valor={moneda.formatear(f.esperado)}
              estado={badge(f)}
              acciones={accionesDe(f)}
              onClick={puedeRecibir(f) ? () => void abrirRecibir(f) : undefined}
            />
          )}
          vacio={{ titulo: t('vacio.titulo'), descripcion: t('vacio.descripcion'), icono: HandCoins }}
          sinResultados={{ descripcion: t('sinResultados') }}
          error={{ titulo: t('error.titulo'), descripcion: t('error.descripcion') }}
          onReintentar={recargar}
          onLimpiarFiltros={() => {
            setBusqueda('');
            if (filtroUrl) quitarDeUrl('filtro');
          }}
          termino={busqueda}
        />
        <p className="text-xs text-fg-muted">{t('nota')}</p>
      </div>

      {recibir && orgId && (
        <RecibirDineroHoja
          abierta={!!recibir}
          onAbiertaChange={(v) => !v && setRecibir(null)}
          fila={recibir}
          organizationId={orgId}
          nombreDomiciliario={nombreDe(recibir.driverId)}
          nombreSede={nombreSede(recibir.branchId)}
          lineasIniciales={lineasHoja}
          caja={caja}
          onTerminado={(c) => {
            toastSuccess(c.diferencia === 0 ? t('recibir.hecho') : t('recibir.hechoConDiferencia', { monto: moneda.formatear(-c.diferencia) }));
            setRecibir(null);
            recargar();
          }}
        />
      )}

      <Dialogo
        abierto={elegir}
        onAbiertoChange={setElegir}
        titulo={t('elegir.titulo')}
        descripcion={t('elegir.descripcion')}
        icono={HandCoins}
        ancho={440}
        sinCancelar
        primario={{ etiqueta: t('elegir.cerrar'), onClick: () => setElegir(false) }}
      >
        <ul className="flex flex-col gap-2">
          {porRecibir.map((f) => (
            <li key={f.clave}>
              <button
                type="button"
                onClick={() => void abrirRecibir(f)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-line px-4 py-3 text-left hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium text-fg">{nombreDe(f.driverId)}</span>
                  <span className="truncate text-xs text-fg-muted">{`${nombreSede(f.branchId)} · ${t('entregasN', { n: f.entregas })}`}</span>
                </span>
                <span className="shrink-0 font-semibold text-fg">{moneda.formatear(f.esperado)}</span>
              </button>
            </li>
          ))}
        </ul>
      </Dialogo>

      <DialogoMotivo
        abierto={!!anular}
        onAbiertoChange={(v) => {
          if (anulando) return;
          setErrorAnular(null);
          if (!v) setAnular(null);
        }}
        titulo={t('anular.titulo')}
        descripcion={anular ? t('anular.descripcion', { nombre: nombreDe(anular.driverId) }) : undefined}
        textoConfirmar={t('anular.confirmar')}
        onConfirmar={confirmarAnular}
        destructiva
        cargando={anulando}
        error={errorAnular}
        icono={Ban}
      />
    </div>
  );
}
