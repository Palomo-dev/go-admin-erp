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

export type VistaTesoreria = 'movimientos' | 'ingresos' | 'egresos';

const TAMANO_PAGINA = 25;

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
  const { formatDate, getToday, toDate } = useFormatDate();

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

  useEffect(() => setPagina(1), [filtro, termino, branchFilter]);

  const hoy = getToday();
  const diaDe = useCallback((iso: string) => toDate(new Date(iso)), [toDate]);
  const visibles = useMemo(() => filtrarMovimientos(filas, filtro, termino), [filas, filtro, termino]);
  const resumen = useMemo(() => resumirMovimientos(visibles, hoy, diaDe), [visibles, hoy, diaDe]);
  const todasBuscadas = useMemo(() => filtrarMovimientos(filas, 'todos', termino), [filas, termino]);
  const conteos = useMemo(() => contarPorTipo(todasBuscadas), [todasBuscadas]);
  // «Por conciliar» mira todos los bancos, no solo la pestaña abierta.
  const resumenTodo = useMemo(() => resumirMovimientos(todasBuscadas, hoy, diaDe), [todasBuscadas, hoy, diaDe]);
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
          { id: 'numero', encabezado: t('columnas.numero'), variante: 'mono' as const, celda: (f: FilaMovimiento) => (f.fuente === 'traslado' ? f.referencia ?? '—' : `#${f.id}`), ocultarDebajo: 'xl' as const },
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
            {vista === 'movimientos' ? f.categoria ?? f.notas ?? '' : [`#${f.id}`, f.notas].filter(Boolean).join(' · ')}
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
      celda: (f) => (vista === 'movimientos' ? nombreCuenta(f) : f.fuente === 'caja' ? tc('caja') : f.cuenta ? `${tc('banco')} · ${f.cuenta}` : tc('banco')),
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
                etiqueta={t(`conciliacion.${f.conciliacion ?? 'noAplica'}`)}
                tono={f.conciliacion === 'conciliado' ? 'exito' : f.conciliacion === 'pendiente' ? 'advertencia' : 'neutro'}
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

  const kpis =
    vista === 'movimientos' ? (
      <KpiStrip etiqueta={t('kpi.etiqueta')}>
        <StatCard etiqueta={t('kpi.entradasMes')} valor={formatear(resumen.entradasMes)} detalle={t('kpi.movimientos', { n: resumen.conteoEntradasMes })} tono="exito" cargando={estado === 'cargando'} onClick={() => setPestana('entradas')} />
        <StatCard etiqueta={t('kpi.salidasMes')} valor={formatear(resumen.salidasMes)} detalle={t('kpi.movimientos', { n: resumen.conteoSalidasMes })} tono="peligro" cargando={estado === 'cargando'} onClick={() => setPestana('salidas')} />
        <StatCard etiqueta={t('kpi.netoMes')} valor={formatear(resumen.netoMes)} tono={resumen.netoMes < 0 ? 'peligro' : 'neutro'} cargando={estado === 'cargando'} />
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
      <KpiStrip etiqueta={t('kpi.etiqueta')}>
        <StatCard etiqueta={t('kpi.total')} valor={formatear(resumen.total)} tamano="sm" cargando={estado === 'cargando'} />
        <StatCard etiqueta={t('kpi.mes')} valor={formatear(resumen.mes)} tamano="sm" cargando={estado === 'cargando'} />
        <StatCard etiqueta={t('kpi.hoy')} valor={formatear(resumen.hoy)} tamano="sm" cargando={estado === 'cargando'} />
        <StatCard etiqueta={t('kpi.registros')} valor={resumen.registros} tamano="sm" cargando={estado === 'cargando'} />
      </KpiStrip>
    );

  const estadoTabla: EstadoTabla = estado === 'listo' && filas.length > 0 && visibles.length === 0 ? 'sinResultados' : estado;

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
              acciones={[{ id: 'actualizar', etiqueta: tc('actualizar'), icono: RefreshCw, onSelect: () => void cargar() }]}
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
