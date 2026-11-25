'use client';

/**
 * La lista de dinero que entra y sale. UNA sola pieza para tres páginas
 * (requisito del dueño, 2026-11-07: «todo comparte componentes»):
 *
 * - `vista="movimientos"` → «Movimientos» (Tesorería v2, `1000:79670`):
 *   pestañas Todos · Entradas · Salidas · Traslados, «Nuevo ▾» con ingreso,
 *   egreso, traslado y consignar caja a banco.
 * - `vista="ingresos"` → «Ingresos» (`2335:142791`): Movimientos con el tipo
 *   fijado en entradas y su propio «Nuevo ingreso».
 * - `vista="egresos"` → «Egresos» (`2386:721`): el espejo, «Nuevo egreso».
 *
 * Mismo servicio (`movimientosService`, `transferenciasService`), misma fila,
 * mismos KPIs, mismo formulario de alta (`FormularioMovimientoTesoreria`, que
 * trae la cuenta de la categoría y la variante de pago de impuesto), mismo
 * «Anular» con motivo y mismo detalle (`/ingresos/[id]`, `/egresos/[id]`).
 *
 * Acciones de las listas viejas que se conservan: ver detalle, duplicar,
 * anular con motivo, exportar CSV, buscar, actualizar, nuevo. Las que no
 * hacían nada («Importar» y «Editar» sin `onClick`) no se dibujan.
 *
 * Recaudo por medio de pago (Figma «05 POS y ventas» 3300-420896, 2026-11-25): barra a la
 * vista con Fecha («Hoy» por defecto, recordada por persona solo durante el día) y Medio de
 * pago; tarjetas del periodo filtrado con «Recaudado» (pagos aprobados, con los anticipos de
 * contraentrega en una línea aparte); lo cobrado por pasarela o datáfono se ve el día del cobro
 * («Por abonar», desde `payments`) y los abonos del procesador al banco son traslados que no
 * suman. Sin tablero nuevo: las gráficas siguen en Reportes.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  ArrowDownCircle,
  ArrowLeftRight,
  ArrowUpCircle,
  Copy,
  Download,
  Eye,
  ListChecks,
  Plus,
  RefreshCw,
  Wallet,
  XCircle,
} from 'lucide-react';
import {
  BranchBadgeActiva,
  DataTable,
  DialogoMotivo,
  KpiStrip,
  PageHeader,
  Pagination,
  RowActionsMenu,
  SearchInput,
  StatCard,
  StatusBadge,
  TabBar,
  clasesBoton,
  useOpcionUrl,
  type AccionFila,
  type ColumnaTabla,
  type EstadoTabla,
} from '@/components/kit';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { movimientosService, type UnifiedMovement } from '@/lib/services/movimientosService';
import { transferenciasService, type BankTransfer } from '@/lib/services/transferenciasService';
import {
  FILTROS_TIPO,
  accionesFila,
  contarPorTipo,
  csvMovimientos,
  filtrarMovimientos,
  resumirMovimientos,
  signoFila,
  unirMovimientos,
  type FilaMovimiento,
  type FiltroTipo,
} from '@/lib/finanzas/tesoreria/movimientosLista';
import { RUTAS_TESORERIA } from '@/lib/finanzas/tesoreria/rutas';
import { FormularioMovimientoTesoreria } from './formularios';
import { ConsignarCajaDialogo } from './ConsignarCajaDialogo';
import { NuevaTransferenciaDialogo } from './NuevaTransferenciaDialogo';
import { MovimientoTipoBadge, descargarCsv } from './TesoreriaComun';
import { cn } from '@/utils/Utils';
import { BarraFecha, FilterChips, presetsRango, etiquetaRango, type ChipFiltro, type IdPresetRango, type RangoFechas } from '@/components/kit';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { FiltroConteo } from '@/components/finanzas/recaudo/FiltroConteo';
import { useFiltroDelDia } from '@/components/finanzas/recaudo/useFiltroDelDia';
import { useMediosRecaudo } from '@/components/finanzas/recaudo/useMediosRecaudo';
import { leerPagosRecaudo } from '@/lib/services/recaudoService';
import { filtrarPorMedio, resumenRecaudo, totalesPorMedio, type ClaveMedio, type PagoRecaudo } from '@/lib/finanzas/recaudo/recaudoPorMedio';
import { esCobroPorAbonar, filaDeAbono, filaDeCobroPasarela, filtrarFilasRecaudo, tarjetasMovimientos, type AbonoOrigen } from '@/lib/finanzas/recaudo/movimientosRecaudo';
import { getDateRange } from '@/lib/utils/dateRanges';
import { plainDateToInstant } from '@/lib/utils/dateCore';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';

export type VistaTesoreria = 'movimientos' | 'ingresos' | 'egresos';

const TAMANO_PAGINA = 25;

/** Fecha y medio recordados por persona y pantalla SOLO durante el día (decisión 2). */
interface FiltroRecaudoTesoreria {
  /** Atajo de la barra, `rango` o `todo` (sin filtro de fecha, como antes). */
  periodo: IdPresetRango | 'rango' | 'todo';
  desde: string;
  hasta: string;
  medios: string[];
}
const FILTRO_TESORERIA_POR_DEFECTO: FiltroRecaudoTesoreria = { periodo: 'hoy', desde: '', hasta: '', medios: [] };
const RUTA_PROCESADORES = '/app/finanzas/tesoreria/procesadores-pago';

/** El tipo fijado de cada vista (Ingresos y Egresos son Movimientos con el tipo fijado). */
const TIPO_FIJO: Record<VistaTesoreria, FiltroTipo | null> = { movimientos: null, ingresos: 'entradas', egresos: 'salidas' };

function esSinPermiso(e: unknown): boolean {
  const x = (e ?? {}) as { code?: string; message?: string };
  return x.code === '42501' || /permission denied|sin_permiso/i.test(x.message ?? '');
}

export function ListaTesoreria({ vista }: { vista: VistaTesoreria }) {
  const t = useTranslations('finanzasTesoreriaR3.lista');
  const tc = useTranslations('finanzasTesoreriaR3.comun');
  const te = useTranslations('tesoreria');
  const router = useRouter();
  const { branchFilter } = useBranch();
  const { formatear } = useMonedaOrganizacion();
  const { formatDate, getToday, toDate, timezone } = useFormatDate();
  const tRec = useTranslations('recaudoMedio');
  const locale = useLocaleIntl();
  const mediosRecaudo = useMediosRecaudo();
  const recordado = useFiltroDelDia<FiltroRecaudoTesoreria>(`tesoreria-${vista}`, FILTRO_TESORERIA_POR_DEFECTO);
  const { setValor: setRecordado } = recordado;
  const [pagos, setPagos] = useState<PagoRecaudo[] | null>(null);
  const [abonos, setAbonos] = useState<AbonoOrigen[]>([]);
  const [errorRecaudo, setErrorRecaudo] = useState(false);

  const [filas, setFilas] = useState<FilaMovimiento[]>([]);
  const [estado, setEstado] = useState<EstadoTabla>('cargando');
  const [termino, setTermino] = useState('');
  const [pagina, setPagina] = useState(1);
  const [pestana, setPestana] = useOpcionUrl<FiltroTipo>('tipo', FILTROS_TIPO, 'todos', 'replace');
  const filtro: FiltroTipo = TIPO_FIJO[vista] ?? pestana;
  const [alta, setAlta] = useState<'ingreso' | 'egreso' | 'traslado' | 'consignar' | null>(null);
  const [anulando, setAnulando] = useState<FilaMovimiento | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [errorAnular, setErrorAnular] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setEstado('cargando');
    try {
      const vacio: never[] = [];
      const [ingresos, egresos, traslados] = await Promise.all([
        vista === 'egresos' ? Promise.resolve(vacio as UnifiedMovement[]) : movimientosService.getAllMovements('income', branchFilter),
        vista === 'ingresos' ? Promise.resolve(vacio as UnifiedMovement[]) : movimientosService.getAllMovements('expense', branchFilter),
        vista === 'movimientos' ? transferenciasService.getTransfers(branchFilter) : Promise.resolve(vacio as BankTransfer[]),
      ]);
      setFilas(unirMovimientos(ingresos, egresos, traslados));
      setEstado('listo');
    } catch (e) {
      // El servicio ya no devuelve [] cuando falla: la lista no finge estar vacía.
      setEstado(esSinPermiso(e) ? 'sinPermiso' : 'error');
    }
  }, [branchFilter, vista]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const hoy = getToday();
  const diaDe = useCallback((iso: string) => toDate(new Date(iso)), [toDate]);

  // ── Fecha y medio (barra a la vista) ─────────────────────────────────────
  const periodoFecha = recordado.valor.periodo;
  const medios = useMemo(() => (Array.isArray(recordado.valor.medios) ? recordado.valor.medios : []), [recordado.valor.medios]);
  const rango: RangoFechas | null = useMemo(() => {
    if (periodoFecha === 'todo') return null;
    if (periodoFecha === 'rango') return recordado.valor.desde && recordado.valor.hasta ? { desde: recordado.valor.desde, hasta: recordado.valor.hasta } : { desde: hoy, hasta: hoy };
    return presetsRango(hoy).find((p) => p.id === periodoFecha)?.rango ?? { desde: hoy, hasta: hoy };
  }, [periodoFecha, recordado.valor.desde, recordado.valor.hasta, hoy]);
  const claveRango = rango ? `${rango.desde}|${rango.hasta}` : 'todo';

  // Después de declarar `claveRango` y `medios` (antes iba arriba: TS2448 en el CI).
  useEffect(() => setPagina(1), [filtro, termino, branchFilter, claveRango, medios]);

  const cargarRecaudo = useCallback(async () => {
    if (!recordado.listo) return;
    let organizacion: number | null = null;
    try {
      organizacion = getOrganizationId();
    } catch {
      organizacion = null;
    }
    if (!organizacion) return;
    const instantes = rango ? getDateRange(rango.desde, rango.hasta, timezone) : null;
    try {
      const [leidos, payouts] = await Promise.all([
        leerPagosRecaudo(organizacion, { desde: instantes?.start, hasta: instantes?.end }, branchFilter ?? null),
        vista === 'movimientos'
          ? (async () => {
              let q = supabase
                .from('payment_processor_payouts')
                .select('id, processor, payout_date, gross_amount, net_amount, reference, bank_account:bank_accounts(name, bank_name)')
                .eq('organization_id', organizacion)
                .eq('status', 'registrado')
                .order('payout_date', { ascending: false })
                .limit(500);
              if (rango) q = q.gte('payout_date', rango.desde).lte('payout_date', rango.hasta);
              const { data, error } = await q;
              if (error) throw error;
              return ((data ?? []) as Record<string, unknown>[]).map((a): AbonoOrigen => {
                const banco = (Array.isArray(a.bank_account) ? a.bank_account[0] : a.bank_account) as { name?: string | null; bank_name?: string | null } | null;
                return {
                  id: String(a.id),
                  procesador: String(a.processor),
                  // `payout_date` es un día (date): a mediodía en la zona de la organización, para que no corra de día.
                  fecha: plainDateToInstant(String(a.payout_date), timezone, '12:00'),
                  neto: Number(a.net_amount) || 0,
                  bruto: Number(a.gross_amount) || 0,
                  referencia: (a.reference as string | null) ?? null,
                  banco: banco?.name || banco?.bank_name || null,
                };
              });
            })()
          : Promise.resolve([] as AbonoOrigen[]),
      ]);
      setPagos(leidos);
      setAbonos(payouts);
      setErrorRecaudo(false);
    } catch {
      setPagos(null);
      setAbonos([]);
      setErrorRecaudo(true);
    }
    // `rango` se sigue por `claveRango`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordado.listo, claveRango, timezone, branchFilter, vista]);

  useEffect(() => {
    void cargarRecaudo();
  }, [cargarRecaudo]);
  const recargarTodo = useCallback(() => {
    void cargar();
    void cargarRecaudo();
  }, [cargar, cargarRecaudo]);

  const nombreProcesador = useCallback(
    (codigo: string) => (codigo === 'datafono' ? tRec('medios.datafono') : mediosRecaudo.nombre(codigo)),
    [mediosRecaudo, tRec],
  );
  // Cobros de pasarela y datáfono del periodo («Por abonar») y abonos al banco (traslados).
  const filasRecaudo = useMemo(() => {
    if (vista === 'egresos' || !pagos) return [] as FilaMovimiento[];
    const cobros = pagos.filter(esCobroPorAbonar).map((p) =>
      filaDeCobroPasarela(p, {
        concepto: (x) =>
          x.pedidoNumero ? tRec('movimientos.conceptoPedido', { numero: x.pedidoNumero }) : x.factura ? tRec('movimientos.conceptoVenta', { numero: x.factura }) : tRec('movimientos.conceptoCobro'),
        detalle: (x) => [mediosRecaudo.nombre(x.medio), x.tipo === 'anticipo' ? tRec('movimientos.anticipo2805') : null].filter(Boolean).join(' · ') || null,
        cuenta: (x) => tRec('movimientos.cuentaProcesador', { procesador: mediosRecaudo.nombre(x.medio) }),
      }),
    );
    const traslados =
      vista === 'movimientos'
        ? abonos.map((a) => filaDeAbono(a, { concepto: (x) => tRec('movimientos.conceptoAbono', { procesador: nombreProcesador(x.procesador) }), procesador: nombreProcesador, nota: tRec('movimientos.noSuma') }))
        : [];
    return [...cobros, ...traslados];
  }, [vista, pagos, abonos, mediosRecaudo, tRec, nombreProcesador]);
  const mediosCobro = useMemo(() => new Map<string, ClaveMedio>((pagos ?? []).map((p) => [p.id, p.medio])), [pagos]);
  const todasLasFilas = useMemo(
    () => [...filas, ...filasRecaudo].sort((a, b) => Date.parse(b.fecha) - Date.parse(a.fecha) || a.clave.localeCompare(b.clave)),
    [filas, filasRecaudo],
  );
  const filasDelPeriodo = useMemo(() => filtrarFilasRecaudo(todasLasFilas, rango, diaDe, medios, mediosCobro), [todasLasFilas, rango, diaDe, medios, mediosCobro]);
  const filasSinFecha = useMemo(() => filtrarFilasRecaudo(todasLasFilas, null, diaDe, medios, mediosCobro), [todasLasFilas, diaDe, medios, mediosCobro]);
  const pagosFiltrados = useMemo(() => (pagos ? filtrarPorMedio(pagos, medios) : null), [pagos, medios]);
  const recaudo = useMemo(() => (pagosFiltrados ? resumenRecaudo(pagosFiltrados) : null), [pagosFiltrados]);
  const totalesMedio = useMemo(() => totalesPorMedio(pagos ?? []), [pagos]);

  const visibles = useMemo(() => filtrarMovimientos(filasDelPeriodo, filtro, termino), [filasDelPeriodo, filtro, termino]);
  const resumen = useMemo(() => resumirMovimientos(visibles, hoy, diaDe), [visibles, hoy, diaDe]);
  // «Mes» y «Hoy» de Ingresos/Egresos miran todo (con el medio y la búsqueda), no solo el periodo.
  const resumenSinFecha = useMemo(() => resumirMovimientos(filtrarMovimientos(filasSinFecha, filtro, termino), hoy, diaDe), [filasSinFecha, filtro, termino, hoy, diaDe]);
  const todasBuscadas = useMemo(() => filtrarMovimientos(filasDelPeriodo, 'todos', termino), [filasDelPeriodo, termino]);
  const conteos = useMemo(() => contarPorTipo(todasBuscadas), [todasBuscadas]);
  // «Por conciliar» mira todos los bancos y todas las fechas, no solo la pestaña abierta.
  const resumenTodo = useMemo(() => resumirMovimientos(filtrarMovimientos(filas, 'todos', termino), hoy, diaDe), [filas, termino, hoy, diaDe]);
  const tarjetas = useMemo(() => tarjetasMovimientos(filasDelPeriodo, pagosFiltrados ?? []), [filasDelPeriodo, pagosFiltrados]);

  const elegirFecha = (id: IdPresetRango | 'rango', r: RangoFechas) =>
    setRecordado((v) => ({ ...v, periodo: id, desde: id === 'rango' ? r.desde : v.desde, hasta: id === 'rango' ? r.hasta : v.hasta }));
  const esHoy = periodoFecha === 'hoy';
  const etiquetaPeriodo = (claveHoy: string, clavePeriodo: string) => tRec(esHoy ? claveHoy : clavePeriodo);
  const nombreMedios = medios.map(mediosRecaudo.nombre).join(', ');
  const chipsRecaudo: ChipFiltro[] = [
    rango ? { clave: 'fecha', etiqueta: tRec('chips.fecha', { valor: etiquetaRango(rango, locale) }) } : null,
    medios.length > 0 ? { clave: 'medios', etiqueta: tRec('chips.medio', { valor: nombreMedios }) } : null,
  ].filter((c): c is ChipFiltro => c !== null);
  const quitarChipRecaudo = (clave: string) =>
    setRecordado((v) => (clave === 'fecha' ? { ...v, periodo: 'todo' } : clave === 'medios' ? { ...v, medios: [] } : v));
  const textoRecaudo = (n: number) => (errorRecaudo ? '—' : formatear(n));
  const cargandoRecaudo = !pagos && !errorRecaudo;
  const pag = visibles.slice((pagina - 1) * TAMANO_PAGINA, pagina * TAMANO_PAGINA);

  const nombreCuenta = useCallback(
    (f: FilaMovimiento) => (f.tipo === 'traslado' ? `${f.cuenta ?? '—'} → ${f.cuentaDestino ?? '—'}` : f.cuenta ?? tc('caja')),
    [tc],
  );

  const duplicar = useCallback(
    async (f: FilaMovimiento) => {
      const r = await movimientosService.duplicateMovement({ id: Number(f.id), source: f.fuente === 'caja' ? 'cash' : 'bank' }, '');
      if (r.success) {
        toast.success(t(f.tipo === 'entrada' ? 'duplicadoIngreso' : 'duplicadoEgreso'));
        void cargar();
      } else {
        toast.error(te(`errores.${r.codigo ?? 'desconocido'}`));
      }
    },
    [cargar, t, te],
  );

  const confirmarAnulacion = async (motivo: string) => {
    const f = anulando;
    if (!f) return;
    setOcupado(true);
    setErrorAnular(null);
    try {
      const r =
        f.fuente === 'traslado'
          ? await transferenciasService.cancelTransfer(f.id, motivo)
          : await movimientosService.cancelMovement({ id: Number(f.id), source: f.fuente === 'caja' ? 'cash' : 'bank' }, motivo);
      if (!r.success) {
        setErrorAnular(te(`errores.${r.codigo ?? 'desconocido'}`));
        return;
      }
      toast.success(t('anulado'));
      setAnulando(null);
      void cargar();
    } catch {
      setErrorAnular(te('errores.desconocido'));
    } finally {
      setOcupado(false);
    }
  };

  const exportar = () => {
    const csv = csvMovimientos(visibles, (iso) => formatDate(iso), {
      tipo: { entrada: tc('tipos.entrada'), salida: tc('tipos.salida'), traslado: tc('tipos.traslado') },
      caja: tc('caja'),
      encabezados: [t('csv.id'), t('csv.fecha'), t('csv.concepto'), t('csv.monto'), t('csv.notas'), t('csv.tipo'), t('csv.cuenta')],
    });
    descargarCsv(`${vista}_${hoy}.csv`, csv);
  };

  const accionesDe = (f: FilaMovimiento): AccionFila[] => {
    const a = accionesFila(f);
    return [
      { id: 'ver', etiqueta: t('acciones.ver'), icono: Eye, onSelect: () => router.push(f.href) },
      { id: 'duplicar', etiqueta: t('acciones.duplicar'), icono: Copy, onSelect: () => void duplicar(f), oculta: !a.duplicar },
      { id: 'anular', etiqueta: t('acciones.anular'), icono: XCircle, destructiva: true, onSelect: () => setAnulando(f), oculta: !a.anular },
    ];
  };

  const importe = (f: FilaMovimiento) => {
    const s = signoFila(f);
    return (
      <span
        className={cn(
          'font-semibold tabular-nums',
          f.anulado || f.esReverso ? 'text-fg-tertiary line-through' : s === '+' ? 'text-success-text' : s === '-' ? 'text-danger-text' : 'text-fg',
        )}
      >
        {s === '-' ? '−' : s}
        {formatear(f.importe)}
      </span>
    );
  };

  const columnas: ColumnaTabla<FilaMovimiento>[] = [
    { id: 'fecha', encabezado: t('columnas.fecha'), celda: (f) => <span className="whitespace-nowrap text-fg-secondary">{formatDate(f.fecha)}</span>, ancho: 120 },
    ...(vista === 'movimientos'
      ? [
          {
            id: 'numero',
            encabezado: t('columnas.numero'),
            variante: 'mono' as const,
            celda: (f: FilaMovimiento) => (f.fuente === 'traslado' || f.fuente === 'abono' ? f.referencia ?? '—' : f.fuente === 'pasarela' ? f.referencia ?? '—' : `#${f.id}`),
            ocultarDebajo: 'xl' as const,
          },
          { id: 'tipo', encabezado: t('columnas.tipo'), celda: (f: FilaMovimiento) => <MovimientoTipoBadge tipo={f.tipo} anulado={f.anulado} /> },
        ]
      : []),
    {
      id: 'concepto',
      encabezado: vista === 'movimientos' ? t('columnas.conceptoTercero') : t('columnas.concepto'),
      celda: (f) => (
        <div className="min-w-0">
          <p className={cn('truncate font-medium', f.anulado ? 'text-fg-tertiary' : 'text-fg')}>
            {f.concepto || (f.tipo === 'traslado' ? t('trasladoEntreCuentas') : '—')}
          </p>
          <p className="truncate text-xs text-fg-secondary">
            {vista === 'movimientos' || f.fuente === 'pasarela' ? f.categoria ?? f.notas ?? '' : [`#${f.id}`, f.notas].filter(Boolean).join(' · ')}
          </p>
        </div>
      ),
    },
    ...(vista === 'movimientos'
      ? []
      : [{ id: 'categoria', encabezado: t('columnas.categoria'), celda: (f: FilaMovimiento) => f.categoria ?? '—', ocultarDebajo: 'lg' as const }]),
    {
      id: 'cuenta',
      encabezado: vista === 'movimientos' ? t('columnas.cuentaDinero') : t('columnas.origen'),
      celda: (f) => (vista === 'movimientos' || f.fuente === 'pasarela' ? nombreCuenta(f) : f.fuente === 'caja' ? tc('caja') : f.cuenta ? `${tc('banco')} · ${f.cuenta}` : tc('banco')),
      ocultarDebajo: 'md',
    },
    { id: 'importe', encabezado: vista === 'movimientos' ? t('columnas.importe') : t('columnas.monto'), variante: 'importe', celda: importe },
    ...(vista === 'movimientos'
      ? [
          {
            id: 'conciliacion',
            encabezado: t('columnas.conciliacion'),
            ocultarDebajo: 'xl' as const,
            celda: (f: FilaMovimiento) => (
              <StatusBadge
                estado={f.conciliacion ?? 'no aplica'}
                etiqueta={f.conciliacion === 'porAbonar' ? tRec('movimientos.porAbonar') : t(`conciliacion.${f.conciliacion ?? 'noAplica'}`)}
                tono={f.conciliacion === 'conciliado' ? 'exito' : f.conciliacion === 'pendiente' || f.conciliacion === 'porAbonar' ? 'advertencia' : 'neutro'}
              />
            ),
          },
        ]
      : []),
  ];

  const titulo = t(`${vista}.titulo`);
  const tituloAnular = anulando?.tipo === 'traslado' ? t('anular.tituloTraslado') : anulando?.tipo === 'entrada' ? t('anular.tituloIngreso') : t('anular.tituloEgreso');

  const accionesNuevo: AccionFila[] = [
    { id: 'ingreso', etiqueta: t('nuevo.ingreso'), descripcion: t('nuevo.ingresoAyuda'), icono: ArrowDownCircle, onSelect: () => setAlta('ingreso') },
    { id: 'egreso', etiqueta: t('nuevo.egreso'), descripcion: t('nuevo.egresoAyuda'), icono: ArrowUpCircle, onSelect: () => setAlta('egreso') },
    { id: 'traslado', etiqueta: t('nuevo.traslado'), descripcion: t('nuevo.trasladoAyuda'), icono: ArrowLeftRight, onSelect: () => setAlta('traslado') },
    { id: 'consignar', etiqueta: t('nuevo.consignar'), descripcion: t('nuevo.consignarAyuda'), icono: Wallet, onSelect: () => setAlta('consignar') },
  ];

  const tarjetaRecaudado = (
    <StatCard
      etiqueta={medios.length === 1 ? tRec(esHoy ? 'movimientos.recaudadoHoyPor' : 'movimientos.recaudadoPeriodoPor', { medio: nombreMedios }) : etiquetaPeriodo('movimientos.recaudadoHoy', 'movimientos.recaudadoPeriodo')}
      valor={textoRecaudo(recaudo?.total.monto ?? 0)}
      tono={errorRecaudo ? 'advertencia' : 'exito'}
      detalle={
        errorRecaudo
          ? tRec('errorLectura')
          : recaudo && recaudo.porTipo.anticipo.monto > 0
            ? tRec('incluyeAnticipos', { monto: formatear(recaudo.porTipo.anticipo.monto) })
            : tRec('movimientos.pagosAprobados', { n: recaudo?.total.pagos ?? 0 })
      }
      cargando={estado === 'cargando' || cargandoRecaudo}
    />
  );

  const kpis =
    vista === 'movimientos' ? (
      <KpiStrip etiqueta={t('kpi.etiqueta')} columnas={5}>
        {tarjetaRecaudado}
        <StatCard
          etiqueta={etiquetaPeriodo('movimientos.salidasHoy', 'movimientos.salidasPeriodo')}
          valor={formatear(tarjetas.salidas)}
          detalle={t('kpi.movimientos', { n: tarjetas.conteoSalidas })}
          tono="peligro"
          cargando={estado === 'cargando'}
          onClick={() => setPestana('salidas')}
        />
        <StatCard
          etiqueta={etiquetaPeriodo('movimientos.netoHoy', 'movimientos.netoPeriodo')}
          valor={textoRecaudo((recaudo?.total.monto ?? 0) - tarjetas.salidas)}
          detalle={tRec('movimientos.netoDetalle')}
          tono={(recaudo?.total.monto ?? 0) - tarjetas.salidas < 0 ? 'peligro' : 'neutro'}
          cargando={estado === 'cargando' || cargandoRecaudo}
        />
        <StatCard
          etiqueta={tRec('movimientos.porAbonarTitulo')}
          valor={textoRecaudo(tarjetas.porAbonar)}
          detalle={tarjetas.mediosPorAbonar.length > 0 ? tarjetas.mediosPorAbonar.map(mediosRecaudo.nombre).join(', ') : tRec('movimientos.porAbonarNada')}
          tono={tarjetas.porAbonar > 0 ? 'advertencia' : 'neutro'}
          href={RUTA_PROCESADORES}
          cargando={cargandoRecaudo}
        />
        <StatCard
          etiqueta={t('kpi.porConciliar')}
          valor={resumenTodo.porConciliar}
          detalle={
            resumenTodo.porConciliar > 0
              ? t('kpi.porConciliarAyuda', { monto: formatear(resumenTodo.importePorConciliar), bancos: resumenTodo.bancosPorConciliar })
              : t('kpi.alDia')
          }
          tono={resumenTodo.porConciliar > 0 ? 'advertencia' : 'neutro'}
          href={RUTAS_TESORERIA.conciliacion}
          cargando={estado === 'cargando'}
        />
      </KpiStrip>
    ) : (
      <KpiStrip etiqueta={t('kpi.etiqueta')} columnas={vista === 'ingresos' ? 5 : 4}>
        {vista === 'ingresos' && tarjetaRecaudado}
        <StatCard etiqueta={rango ? tRec('movimientos.totalPeriodo') : t('kpi.total')} valor={formatear(resumen.total)} tamano="sm" cargando={estado === 'cargando'} />
        <StatCard etiqueta={t('kpi.mes')} valor={formatear(resumenSinFecha.mes)} tamano="sm" cargando={estado === 'cargando'} />
        {/* «Hoy» ahora filtra la lista (antes solo mostraba la cifra). */}
        <StatCard
          etiqueta={t('kpi.hoy')}
          valor={formatear(resumenSinFecha.hoy)}
          tamano="sm"
          cargando={estado === 'cargando'}
          resaltada={esHoy}
          onClick={() => elegirFecha('hoy', { desde: hoy, hasta: hoy })}
        />
        <StatCard etiqueta={t('kpi.registros')} valor={resumen.registros} tamano="sm" cargando={estado === 'cargando'} />
      </KpiStrip>
    );

  // Barra a la vista (Figma 3300-420896): fecha y medio de pago, con lo que entró por cada medio.
  const barraRecaudo = (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
        <BarraFecha activo={periodoFecha === 'todo' ? null : periodoFecha} rango={rango ?? { desde: hoy, hasta: hoy }} hoy={hoy} onElegir={elegirFecha} />
        <FiltroConteo
          titulo={tRec('filtro.medio')}
          resumen={tRec('filtro.medioResumen', { valor: medios.length > 0 ? nombreMedios : tRec('filtro.todos') })}
          opciones={mediosRecaudo.opcionesMedio(totalesMedio, formatear, medios)}
          grupos={[
            { id: 'pasarelas', titulo: tRec('filtro.grupoPasarelas') },
            { id: 'otros', titulo: tRec('filtro.grupoOtros') },
          ]}
          valores={medios}
          onAplicar={(v) => setRecordado((x) => ({ ...x, medios: v }))}
          buscador
          nota={tRec('movimientos.notaMedio')}
        />
      </div>
      {vista !== 'egresos' && totalesMedio.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-fg-secondary">{tRec('movimientos.porMedio')}</span>
          {totalesMedio.map((m) => {
            const activo = medios.includes(String(m.medio));
            return (
              <button
                key={String(m.medio)}
                type="button"
                aria-pressed={activo}
                onClick={() => setRecordado((x) => ({ ...x, medios: activo ? x.medios.filter((y) => y !== m.medio) : [...x.medios, String(m.medio)] }))}
                className={cn(
                  'inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                  activo ? 'border-brand bg-brand-tint text-brand-deep' : 'border-line-strong bg-surface text-fg-secondary hover:bg-hover',
                )}
              >
                {mediosRecaudo.nombre(m.medio)} {formatear(m.monto)}
              </button>
            );
          })}
          <span className="ml-auto text-xs text-fg-muted">{tRec('movimientos.noSumanNota')}</span>
        </div>
      )}
      <FilterChips chips={chipsRecaudo} onQuitar={quitarChipRecaudo} onLimpiarTodo={() => setRecordado(FILTRO_TESORERIA_POR_DEFECTO)} />
    </div>
  );

  const estadoTabla: EstadoTabla = estado === 'listo' && todasLasFilas.length > 0 && visibles.length === 0 ? 'sinResultados' : estado;

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        titulo={titulo}
        subtitulo={t(`${vista}.subtitulo`)}
        icono={vista === 'movimientos' ? ArrowLeftRight : ListChecks}
        migas={[
          { etiqueta: tc('migas.finanzas'), href: '/app/finanzas' },
          { etiqueta: tc('migas.tesoreria'), href: vista === 'movimientos' ? undefined : RUTAS_TESORERIA.movimientos },
          { etiqueta: titulo },
        ]}
        movil={{ accionesEnFila: true }}
        acciones={
          <>
            <button type="button" onClick={exportar} disabled={visibles.length === 0} className={clasesBoton({ variante: 'secundario' })}>
              <Download className="h-4 w-4" aria-hidden />
              {tc('exportar')}
            </button>
            {vista === 'movimientos' ? (
              <RowActionsMenu acciones={accionesNuevo} etiquetaBoton={t('nuevo.movimiento')} iconoBoton={Plus} orientacion="horizontal" tamano="md" />
            ) : (
              <button type="button" onClick={() => setAlta(vista === 'ingresos' ? 'ingreso' : 'egreso')} className={clasesBoton({ variante: 'primario' })}>
                <Plus className="h-4 w-4" aria-hidden />
                {t(`${vista}.nuevo`)}
              </button>
            )}
            <RowActionsMenu
              acciones={[{ id: 'actualizar', etiqueta: tc('actualizar'), icono: RefreshCw, onSelect: recargarTodo }]}
              titulo={titulo}
              orientacion="horizontal"
              tamano="md"
            />
          </>
        }
        debajo={
          <div className="space-y-3">
            <BranchBadgeActiva />
            {vista === 'movimientos' && (
              <TabBar
                id="tesoreria-movimientos"
                etiqueta={t('pestanas.etiqueta')}
                valor={pestana}
                onValorChange={setPestana}
                pestanas={FILTROS_TIPO.map((v) => ({ valor: v, etiqueta: t(`pestanas.${v}`), contador: estado === 'listo' ? conteos[v] : undefined }))}
              />
            )}
          </div>
        }
      />

      {barraRecaudo}
      {vista !== 'movimientos' && (
        <SearchInput value={termino} onChange={setTermino} placeholder={t('buscarConcepto')} etiqueta={t('buscarConcepto')} />
      )}
      {kpis}
      {vista === 'movimientos' && (
        <SearchInput value={termino} onChange={setTermino} placeholder={t('buscar')} etiqueta={t('buscar')} />
      )}

      <DataTable<FilaMovimiento>
        etiqueta={titulo}
        columnas={columnas}
        filas={pag}
        obtenerId={(f) => f.clave}
        estado={estadoTabla}
        termino={termino}
        onLimpiarFiltros={() => setTermino('')}
        onReintentar={() => void cargar()}
        onFilaClick={(f) => router.push(f.href)}
        etiquetaFila={(f) => f.concepto || titulo}
        acciones={accionesDe}
        vacio={{
          titulo: t(`${vista}.vacioTitulo`),
          descripcion: t(`${vista}.vacioDescripcion`),
          accion:
            vista === 'movimientos'
              ? { etiqueta: t('nuevo.ingreso'), onClick: () => setAlta('ingreso') }
              : { etiqueta: t(`${vista}.nuevo`), onClick: () => setAlta(vista === 'ingresos' ? 'ingreso' : 'egreso') },
        }}
        sinPermiso={{ titulo: tc('sinPermiso.titulo'), descripcion: tc('sinPermiso.descripcion') }}
        tarjetaMovil={(f) => (
          <div className="flex items-start gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-fg">{f.concepto || t('trasladoEntreCuentas')}</p>
              <p className="truncate text-xs text-fg-secondary">
                {nombreCuenta(f)} · {formatDate(f.fecha)}
              </p>
              {vista === 'movimientos' && (
                <div className="mt-1">
                  <MovimientoTipoBadge tipo={f.tipo} anulado={f.anulado} />
                </div>
              )}
            </div>
            <div className="text-right">{importe(f)}</div>
          </div>
        )}
        pie={
          visibles.length > TAMANO_PAGINA ? (
            <Pagination pagina={pagina} tamano={TAMANO_PAGINA} total={visibles.length} onPaginaChange={setPagina} sustantivo={{ singular: t('sustantivo.uno'), plural: t('sustantivo.otros') }} />
          ) : undefined
        }
      />

      {/* UN solo formulario: el tipo es su variante (y en Movimientos se cambia dentro). */}
      <FormularioMovimientoTesoreria
        tipo={alta === 'egreso' ? 'egreso' : 'ingreso'}
        open={alta === 'ingreso' || alta === 'egreso'}
        onOpenChange={(a) => !a && setAlta(null)}
        permitirCambiarTipo={vista === 'movimientos'}
        onTraslado={vista === 'movimientos' ? () => setAlta('traslado') : undefined}
        onSuccess={() => {
          setAlta(null);
          void cargar();
        }}
      />
      {vista === 'movimientos' && (
        <>
          <NuevaTransferenciaDialogo
            abierto={alta === 'traslado'}
            onAbiertoChange={(a) => !a && setAlta(null)}
            onHecha={() => {
              setAlta(null);
              void cargar();
            }}
          />
          <ConsignarCajaDialogo
            abierto={alta === 'consignar'}
            onAbiertoChange={(a) => !a && setAlta(null)}
            onHecha={() => {
              setAlta(null);
              void cargar();
            }}
          />
        </>
      )}

      <DialogoMotivo
        abierto={!!anulando}
        onAbiertoChange={(a) => !a && !ocupado && (setAnulando(null), setErrorAnular(null))}
        titulo={tituloAnular}
        descripcion={te('anular.descripcion')}
        textoConfirmar={t('anular.boton')}
        consecuencias={anulando?.tipo === 'traslado' ? [t('anular.consecuenciaTraslado')] : [t('anular.consecuenciaMovimiento')]}
        cargando={ocupado}
        error={errorAnular}
        onConfirmar={(m) => void confirmarAnulacion(m)}
      />
    </div>
  );
}
