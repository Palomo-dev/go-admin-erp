'use client';

/**
 * Saldos a favor y anticipos de clientes — listado (Figma `1020:90370` listo,
 * `1023:96176` sin permiso, `1020:92149` móvil; captura `73-documentos-saldos-listo.png`).
 *
 * Paginado, filtrado y ordenado en el servidor (`GET /api/saldos-a-favor/listado`)
 * con el estado en la URL (`useListadoServidor`); la hoja de detalle se abre con
 * `?saldo=<id>`. Acciones (todas al servidor, una RPC cada una):
 * - Registrar anticipo → `POST /api/saldos-a-favor` (pago real con recibo y caja).
 * - Aplicar a una factura → `POST …/[id]/aplicar`.
 * - Devolver en dinero → `POST …/[id]/devolver`.
 * - Anular un anticipo sin usar → `POST …/[id]/anular`.
 * Los permisos los resuelve el servidor (`usePermisosFinanzas` solo decide qué
 * botones se ven; la ruta y la base vuelven a exigirlos).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle, ArrowUpRight, Ban, Banknote, Download, Eye, FileText, HandCoins, PiggyBank, Plus, ScrollText, Undo2, Users, Wallet } from 'lucide-react';
import {
  BranchBadgeActiva,
  ChipDocumento,
  CustomerPicker,
  DataTable,
  DateRangeButton,
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
  StatusBadge,
  clasesBoton,
  inicioDeMes,
  useListadoServidor,
  type AccionFila,
  type ChipFiltro,
  type ClientePicker,
  type ColumnaTabla,
  type TipoDocumento,
} from '@/components/kit';
import { useFormatoEntero, useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { getOrganizationId, useOrganization } from '@/lib/hooks/useOrganization';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { usePermisosFinanzas } from '@/lib/finanzas/usePermisosFinanzas';
import { abrirDocumento } from '@/lib/documents/cliente';
import { listarClientes } from '@/lib/services/clientesListadoService';
import { aCsv, descargarCsv } from '@/lib/finanzas/csv';
import { formatNumeroMoneda } from '@/lib/utils/moneda';
import {
  BADGE_ESTADO_SALDO,
  CAMPOS_ORDEN_SALDOS,
  ESTADOS_SALDO,
  FILTROS_SALDOS,
  ORIGENES_SALDO,
  TAMANOS_PAGINA_SALDOS,
  accionesSaldo,
  type FilaListadoSaldo,
  type OrigenSaldo,
} from '@/lib/finanzas/saldosAFavor/listadoLogica';
import { ErrorPeticionSaldoFavor, saldosAFavorService, type RespuestaListadoSaldos } from './saldosAFavorService';
import { textoErrorSaldo } from './textosSaldo';
import { AplicarSaldoDialog } from './AplicarSaldoDialog';
import { DevolverSaldoDialog } from './DevolverSaldoDialog';
import { RegistrarAnticipoDialog } from './RegistrarAnticipoDialog';
import { DetalleSaldoPanel } from './DetalleSaldoPanel';

const RUTA_CLIENTE = '/app/finanzas/cuentas-por-cobrar/cliente';
const RUTA_NOTA = '/app/finanzas/notas-credito';
/** Tope de la exportación: 25 páginas de 200. */
const PAGINAS_MAX = 25;

/** Tipo de chip del documento que creó el saldo. */
const TIPO_ORIGEN: Readonly<Record<OrigenSaldo, TipoDocumento | null>> = {
  pago: 'recibo',
  nota_credito: 'notaCredito',
  devolucion: 'devolucion',
  otro: null,
};

export function ListadoSaldosAFavor() {
  const t = useTranslations('finanzasDocumentosR3.saldos');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const entero = useFormatoEntero();
  const locale = useLocaleIntl();
  const permisos = usePermisosFinanzas();
  const moneda = useMonedaOrganizacion();
  const { organization } = useOrganization();
  const { branchFilter, branches } = useBranch();
  const { formatDate, getToday } = useFormatDate();
  const hoy = getToday();

  const l = useListadoServidor({
    filtros: [...FILTROS_SALDOS],
    camposOrden: [...CAMPOS_ORDEN_SALDOS],
    ordenPorDefecto: { campo: 'fecha', direccion: 'desc' },
    tamanoPorDefecto: 25,
    tamanosPermitidos: TAMANOS_PAGINA_SALDOS,
  });

  const [datos, setDatos] = useState<RespuestaListadoSaldos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [exportando, setExportando] = useState(false);
  const [clienteElegido, setClienteElegido] = useState<ClientePicker | null>(null);
  const [anticipo, setAnticipo] = useState(false);
  const [aplicar, setAplicar] = useState<FilaListadoSaldo | null>(null);
  const [devolver, setDevolver] = useState<FilaListadoSaldo | null>(null);
  const [anular, setAnular] = useState<FilaListadoSaldo | null>(null);
  const [anulando, setAnulando] = useState(false);
  const [errorAnular, setErrorAnular] = useState<string | null>(null);

  const saldoAbierto = searchParams?.get('saldo') ?? null;
  const abrirSaldo = useCallback(
    (id: string | null) => {
      const q = new URLSearchParams(searchParams?.toString() ?? '');
      if (id) q.set('saldo', id);
      else q.delete('saldo');
      const s = q.toString();
      router.replace(s ? `${pathname}?${s}` : pathname ?? '', { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const periodoKpi = useMemo(() => ({ desde: inicioDeMes(hoy), hasta: hoy }), [hoy]);
  const consulta = useMemo(() => {
    const q = new URLSearchParams();
    if (l.busqueda) q.set('q', l.busqueda);
    for (const [k, v] of Object.entries(l.filtros)) if (v) q.set(k, v);
    if (branchFilter) q.set('sucursal', String(branchFilter));
    if (l.orden) q.set('orden', `${l.orden.campo}.${l.orden.direccion}`);
    q.set('pagina', String(l.pagina));
    q.set('tamano', String(l.tamano));
    q.set('kpi_desde', periodoKpi.desde);
    q.set('kpi_hasta', periodoKpi.hasta);
    return q.toString();
  }, [l.busqueda, l.filtros, l.orden, l.pagina, l.tamano, branchFilter, periodoKpi]);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(null);
    saldosAFavorService
      .listado(new URLSearchParams(consulta))
      .then((r) => !cancelado && setDatos(r))
      .catch((e: { codigo?: string }) => !cancelado && setError(e?.codigo ?? 'error_desconocido'))
      .finally(() => !cancelado && setCargando(false));
    return () => {
      cancelado = true;
    };
  }, [consulta, recarga]);

  const recargar = useCallback(() => setRecarga((n) => n + 1), []);
  const filas = datos?.filas ?? [];
  const total = datos?.total ?? 0;
  const kpis = datos?.kpis ?? null;
  const fmt = moneda.formatear;
  const permisosSaldo = { crear: permisos.crear, anular: permisos.anular };
  const sustantivo = {
    singular: t('sustantivo.singular'),
    plural: t('sustantivo.plural'),
    genero: t('sustantivo.genero') === 'femenino' ? ('femenino' as const) : ('masculino' as const),
  };

  const nombreSucursal =
    branchFilter === null || branchFilter === undefined ? t('todasLasSucursales') : branches.find((b) => b.id === branchFilter)?.name ?? null;
  const subtitulo = [organization?.name, nombreSucursal, t('subtitulo')].filter(Boolean).join(' · ');
  const mes = useMemo(() => {
    const [a, m] = hoy.split('-').map(Number);
    return new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(a, (m || 1) - 1, 1)));
  }, [hoy, locale]);

  const badge = (s: FilaListadoSaldo) => <StatusBadge estado={BADGE_ESTADO_SALDO[s.estado]} etiqueta={t(`estados.${s.estado}`)} />;

  const hrefOrigen = (s: FilaListadoSaldo) =>
    s.origenId && (s.origen === 'nota_credito' || s.origen === 'devolucion') ? `${RUTA_NOTA}/${s.origenId}` : undefined;
  const chipOrigen = (s: FilaListadoSaldo) => {
    const tipo = TIPO_ORIGEN[s.origen];
    if (!tipo) return <span className="text-sm text-fg-secondary">{t(`origenes.${s.origen}`)}</span>;
    return (
      <ChipDocumento
        tipo={tipo}
        numero={s.origenNumero ?? t(`origenes.${s.origen}`)}
        href={hrefOrigen(s)}
        onClick={s.origen === 'pago' && s.origenId ? () => abrirDocumento('recibo-caja', s.origenId as string) : undefined}
      />
    );
  };

  const accionesDe = (s: FilaListadoSaldo): AccionFila[] => {
    const a = accionesSaldo(s, permisosSaldo);
    return [
      { id: 'ver', etiqueta: t('acciones.verMovimientos'), icono: Eye, onSelect: () => abrirSaldo(s.id) },
      { id: 'aplicar', etiqueta: t('acciones.aplicar'), icono: FileText, onSelect: () => setAplicar(s), oculta: !a.aplicar },
      { id: 'devolver', etiqueta: t('acciones.devolver'), icono: Banknote, onSelect: () => setDevolver(s), oculta: !a.devolver },
      { id: 'cliente', etiqueta: t('acciones.verCliente'), icono: Users, onSelect: () => router.push(`${RUTA_CLIENTE}/${s.clienteId}`), separadorAntes: true },
      {
        id: 'recibo',
        etiqueta: t('acciones.verRecibo'),
        icono: ScrollText,
        onSelect: () => s.origenId && abrirDocumento('recibo-caja', s.origenId),
        oculta: s.origen !== 'pago' || !s.origenId,
      },
      {
        id: 'nota',
        etiqueta: t('acciones.verOrigen'),
        icono: ArrowUpRight,
        onSelect: () => {
          const href = hrefOrigen(s);
          if (href) router.push(href);
        },
        oculta: !hrefOrigen(s),
      },
      {
        id: 'anular',
        etiqueta: t('acciones.anular'),
        icono: Ban,
        destructiva: true,
        onSelect: () => setAnular(s),
        // Sin permiso no se ofrece; un saldo ya anulado tampoco. Si no se puede, se dice por qué.
        oculta: !permisos.anular || s.estado === 'anulado',
        deshabilitada: !a.anular,
        motivo: a.motivoNoAnulable ? t(`anular.bloqueos.${a.motivoNoAnulable}`) : undefined,
      },
    ];
  };

  // ── Exportar (todas las filas del filtro) ───────────────────────────────
  const exportar = async () => {
    setExportando(true);
    try {
      const base = new URLSearchParams(consulta);
      base.set('tamano', '200');
      const todas: FilaListadoSaldo[] = [];
      for (let pagina = 1; pagina <= PAGINAS_MAX; pagina++) {
        base.set('pagina', String(pagina));
        const r = await saldosAFavorService.listado(base);
        todas.push(...r.filas);
        if (todas.length >= r.total || r.filas.length === 0) break;
      }
      const ctxMoneda = moneda.paraDocumento(null);
      const csv = aCsv([
        [
          t('columnas.cliente'),
          t('columnas.documento'),
          t('columnas.origen'),
          t('columnas.fecha'),
          t('columnas.valor'),
          t('columnas.usado'),
          t('columnas.disponible'),
          t('columnas.vence'),
          t('columnas.estado'),
        ],
        ...todas.map((s) => [
          s.cliente ?? '',
          s.clienteDoc ?? '',
          [t(`origenes.${s.origen}`), s.origenNumero].filter(Boolean).join(' '),
          formatDate(s.fecha),
          formatNumeroMoneda(s.valor, ctxMoneda),
          formatNumeroMoneda(s.usado, ctxMoneda),
          formatNumeroMoneda(s.disponible, ctxMoneda),
          s.vence ? formatDate(s.vence) : '',
          t(`estados.${s.estado}`),
        ]),
      ]);
      descargarCsv(`${t('archivoExportacion')}_${hoy}.csv`, csv);
    } catch {
      toastError(t('exportarError'));
    } finally {
      setExportando(false);
    }
  };

  // ── Anular ───────────────────────────────────────────────────────────────
  const confirmarAnular = async (motivo: string) => {
    if (!anular) return;
    setAnulando(true);
    setErrorAnular(null);
    try {
      await saldosAFavorService.anular(anular.id, motivo);
      toastSuccess(t('anular.exito', { cliente: anular.cliente ?? t('sinCliente') }));
      setAnular(null);
      recargar();
    } catch (e) {
      setErrorAnular(textoErrorSaldo(t, e));
    } finally {
      setAnulando(false);
    }
  };
  const bloqueoAnular = anular ? accionesSaldo(anular, permisosSaldo).motivoNoAnulable : null;

  // ── Filtros y chips ──────────────────────────────────────────────────────
  const buscarClientes = useCallback(async (texto: string, _senal: AbortSignal, _filtros: readonly string[], desde: number) => {
    const r = await listarClientes({ organizationId: getOrganizationId(), branchId: null, criterios: { busqueda: texto }, orden: null, desde, tamano: 10 });
    const items: ClientePicker[] = r.filas.map((c) => ({ id: c.id, nombre: c.full_name ?? c.company_name ?? '', documento: c.identification_number, correo: c.email, telefono: c.phone }));
    return { items, total: r.total };
  }, []);

  const nombreCliente =
    l.filtros.cliente && clienteElegido?.id === l.filtros.cliente
      ? clienteElegido.nombre
      : (filas.find((f) => f.clienteId === l.filtros.cliente)?.cliente ?? null);

  const chips: ChipFiltro[] = [
    l.filtros.estado ? { clave: 'estado', etiqueta: `${t('filtros.estado')}: ${t(`estados.${l.filtros.estado}` as never)}` } : null,
    l.filtros.origen ? { clave: 'origen', etiqueta: `${t('filtros.origen')}: ${t(`origenes.${l.filtros.origen}` as never)}` } : null,
    l.filtros.cliente ? { clave: 'cliente', etiqueta: `${t('filtros.cliente')}: ${nombreCliente ?? t('filtros.clienteChip')}` } : null,
    l.filtros.con_saldo ? { clave: 'con_saldo', etiqueta: t('filtros.conSaldo') } : null,
    l.filtros.desde || l.filtros.hasta
      ? { clave: 'periodo', etiqueta: `${t('filtros.periodo')}: ${[l.filtros.desde, l.filtros.hasta].filter(Boolean).join(' – ')}` }
      : null,
  ].filter((c): c is ChipFiltro => c !== null);

  const quitarChip = (clave: string) => {
    if (clave === 'periodo') {
      l.actualizar({ filtros: Object.fromEntries(Object.entries(l.filtros).filter(([k]) => k !== 'desde' && k !== 'hasta')) });
      return;
    }
    if (clave === 'cliente') setClienteElegido(null);
    l.setFiltro(clave, null);
  };

  // ── Columnas ─────────────────────────────────────────────────────────────
  const columnas: ColumnaTabla<FilaListadoSaldo>[] = [
    {
      id: 'cliente',
      encabezado: t('columnas.cliente'),
      ordenable: true,
      celda: (s) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-fg">{s.cliente ?? t('sinCliente')}</span>
          {s.clienteDoc && <span className="truncate text-xs text-fg-muted">{s.clienteDoc}</span>}
        </div>
      ),
    },
    { id: 'origen', encabezado: t('columnas.origen'), celda: chipOrigen },
    { id: 'fecha', encabezado: t('columnas.fecha'), ordenable: true, ocultarDebajo: 'xl', celda: (s) => <span className="whitespace-nowrap tabular-nums">{formatDate(s.fecha)}</span> },
    { id: 'valor', encabezado: t('columnas.valor'), ordenable: true, variante: 'importe', celda: (s) => fmt(s.valor) },
    { id: 'usado', encabezado: t('columnas.usado'), variante: 'importe', ocultarDebajo: 'lg', celda: (s) => fmt(s.usado) },
    {
      id: 'disponible',
      encabezado: t('columnas.disponible'),
      ordenable: true,
      variante: 'importe',
      celda: (s) => <span className={s.estado === 'disponible' && s.disponible > 0 ? 'font-semibold text-fg' : 'text-fg-muted'}>{fmt(s.disponible)}</span>,
    },
    {
      id: 'vence',
      encabezado: t('columnas.vence'),
      ordenable: true,
      ocultarDebajo: 'lg',
      celda: (s) => (
        <span className={s.estado === 'vencido' ? 'whitespace-nowrap tabular-nums text-danger-text' : 'whitespace-nowrap tabular-nums'}>{s.vence ? formatDate(s.vence) : '—'}</span>
      ),
    },
    { id: 'estado', encabezado: t('columnas.estado'), alinear: 'centro', celda: badge },
  ];

  const estadoTabla =
    error === 'sin_permiso' ? 'sinPermiso' : cargando && !datos ? 'cargando' : error ? 'error' : filas.length === 0 ? (l.hayCriterios ? 'sinResultados' : 'vacio') : 'listo';

  const botonAnticipo = permisos.crear ? (
    <button type="button" onClick={() => setAnticipo(true)} className={clasesBoton({ variante: 'primario' })}>
      <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
      {t('acciones.registrarAnticipo')}
    </button>
  ) : null;

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={subtitulo}
        icono={PiggyBank}
        cargando={cargando}
        migas={[{ etiqueta: t('migas.finanzas'), href: '/app/finanzas' }, { etiqueta: t('migas.cartera') }, { etiqueta: t('titulo') }]}
        debajo={<BranchBadgeActiva />}
        acciones={
          <>
            <button type="button" onClick={() => void exportar()} disabled={exportando || total === 0} className={clasesBoton({ variante: 'secundario' })}>
              <Download aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {exportando ? t('exportando') : t('acciones.exportar')}
            </button>
            {botonAnticipo}
          </>
        }
        movil={{
          subtitulo: t('subtitulo'),
          accion: permisos.crear ? (
            <button
              type="button"
              onClick={() => setAnticipo(true)}
              aria-label={t('acciones.registrarAnticipo')}
              className="flex size-10 items-center justify-center rounded-lg text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Plus aria-hidden="true" className="size-5" strokeWidth={1.5} />
            </button>
          ) : undefined,
        }}
      />

      <KpiStrip etiqueta={t('kpis.etiqueta')}>
        <StatCard
          etiqueta={t('kpis.disponible')}
          icono={Wallet}
          cargando={!datos}
          valor={fmt(kpis?.disponible ?? 0)}
          tono={kpis && kpis.disponible > 0 ? 'exito' : 'neutro'}
          detalle={t('kpis.enClientes', { count: kpis?.clientesConSaldo ?? 0, n: entero(kpis?.clientesConSaldo ?? 0) })}
          onClick={() => l.actualizar({ filtros: { ...l.filtros, estado: 'disponible', con_saldo: '1' } })}
        />
        <StatCard
          etiqueta={t('kpis.vencidos')}
          icono={AlertTriangle}
          cargando={!datos}
          valor={fmt(kpis?.vencido ?? 0)}
          tono={kpis && kpis.saldosVencidos > 0 ? 'advertencia' : 'neutro'}
          iconoDetalle={kpis && kpis.saldosVencidos > 0 ? AlertTriangle : undefined}
          detalle={kpis && kpis.saldosVencidos > 0 ? t('kpis.vencidosDetalle', { count: kpis.saldosVencidos, n: entero(kpis.saldosVencidos) }) : t('kpis.sinVencidos')}
          onClick={() => l.actualizar({ filtros: { ...l.filtros, estado: 'vencido' } })}
        />
        <StatCard
          etiqueta={t('kpis.aplicado', { mes })}
          icono={FileText}
          cargando={!datos}
          valor={fmt(kpis?.aplicado ?? 0)}
          tendencia={kpis && kpis.facturasAplicadas > 0 ? 'sube' : undefined}
          detalle={t('kpis.facturas', { count: kpis?.facturasAplicadas ?? 0, n: entero(kpis?.facturasAplicadas ?? 0) })}
        />
        <StatCard
          etiqueta={t('kpis.devuelto', { mes })}
          icono={Undo2}
          cargando={!datos}
          valor={fmt(kpis?.devuelto ?? 0)}
          detalle={
            kpis && kpis.devolucionesEfectivo > 0
              ? t('kpis.devolucionesEfectivo', { count: kpis.devolucionesEfectivo, n: entero(kpis.devolucionesEfectivo) })
              : t('kpis.devoluciones', { count: kpis?.devoluciones ?? 0, n: entero(kpis?.devoluciones ?? 0) })
          }
        />
      </KpiStrip>

      <ListToolbar
        busqueda={<SearchInput value={l.busqueda} onChange={l.setBusqueda} cargando={cargando} placeholder={t('buscar.placeholder')} etiqueta={t('buscar.etiqueta')} />}
        filtros={
          <FilterPanel conteo={chips.length} onLimpiar={l.limpiarFiltros} textoVerResultados={t('filtros.verN', { count: total, n: entero(total) })}>
            <FormField etiqueta={t('filtros.estado')}>
              {(c) => (
                <Select value={l.filtros.estado ?? 'todos'} onValueChange={(v) => l.setFiltro('estado', v === 'todos' ? null : v)}>
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">{t('filtros.todos')}</SelectItem>
                    {ESTADOS_SALDO.map((e) => (
                      <SelectItem key={e} value={e}>
                        {t(`estados.${e}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <FormField etiqueta={t('filtros.origen')}>
              {(c) => (
                <Select value={l.filtros.origen ?? 'todos'} onValueChange={(v) => l.setFiltro('origen', v === 'todos' ? null : v)}>
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">{t('filtros.todos')}</SelectItem>
                    {ORIGENES_SALDO.map((o) => (
                      <SelectItem key={o} value={o}>
                        {t(`origenes.${o}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <CustomerPicker
              layout="campo"
              cliente={l.filtros.cliente ? { id: l.filtros.cliente, nombre: nombreCliente ?? t('filtros.clienteChip') } : null}
              etiqueta={t('filtros.cliente')}
              buscar={buscarClientes}
              onCambiar={(c) => {
                setClienteElegido(c);
                l.setFiltro('cliente', c.id);
              }}
              onQuitar={() => {
                setClienteElegido(null);
                l.setFiltro('cliente', null);
              }}
            />
            <FormField etiqueta={t('filtros.periodo')}>
              {() => (
                <DateRangeButton
                  valor={{ desde: l.filtros.desde ?? inicioDeMes(hoy), hasta: l.filtros.hasta ?? hoy }}
                  hoy={hoy}
                  max={hoy}
                  etiqueta={t('filtros.periodo')}
                  onValorChange={(r) => l.actualizar({ filtros: { ...l.filtros, desde: r.desde, hasta: r.hasta } })}
                />
              )}
            </FormField>
            <FormField etiqueta={t('filtros.saldo')}>
              {(c) => (
                <SegmentedControl
                  aria-labelledby={c.idEtiqueta}
                  anchoCompleto
                  valor={l.filtros.con_saldo ? 'con' : 'todos'}
                  onValorChange={(v) => l.setFiltro('con_saldo', v === 'con' ? '1' : null)}
                  opciones={[
                    { valor: 'todos', etiqueta: t('filtros.todos') },
                    { valor: 'con', etiqueta: t('filtros.conSaldo') },
                  ]}
                />
              )}
            </FormField>
          </FilterPanel>
        }
        chips={<FilterChips chips={chips} onQuitar={quitarChip} onLimpiarTodo={l.limpiarFiltros} textoLimpiarTodo={t('filtros.limpiar')} />}
      />

      <DataTable
        etiqueta={t('titulo')}
        columnas={columnas}
        filas={filas}
        obtenerId={(s) => s.id}
        estado={estadoTabla}
        orden={l.orden}
        onOrdenar={l.ordenarPor}
        onFilaClick={(s) => abrirSaldo(s.id)}
        etiquetaFila={(s) => t('etiquetaFila', { cliente: s.cliente ?? t('sinCliente'), monto: fmt(s.disponible) })}
        acciones={accionesDe}
        accionesRapidas={(s) => {
          const a = accionesSaldo(s, permisosSaldo);
          return (
            <div className="flex items-center gap-1">
              {a.aplicar && (
                <button
                  type="button"
                  onClick={() => setAplicar(s)}
                  aria-label={t('acciones.aplicarDe', { cliente: s.cliente ?? t('sinCliente') })}
                  className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}
                >
                  {t('acciones.aplicar')}
                </button>
              )}
              {a.devolver && (
                <button
                  type="button"
                  onClick={() => setDevolver(s)}
                  aria-label={t('acciones.devolverDe', { cliente: s.cliente ?? t('sinCliente') })}
                  className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}
                >
                  {t('acciones.devolver')}
                </button>
              )}
            </div>
          );
        }}
        tarjetaMovil={(s) => (
          <ListCard
            icono={PiggyBank}
            titulo={s.cliente ?? t('sinCliente')}
            subtitulo={[s.origenNumero ?? t(`origenes.${s.origen}`), formatDate(s.fecha)].join(' · ')}
            meta={s.vence ? <span className={s.estado === 'vencido' ? 'text-danger-text' : undefined}>{t('detalle.venceEl', { fecha: formatDate(s.vence) })}</span> : undefined}
            valor={
              <span className="flex flex-col items-end">
                <span>{fmt(s.disponible)}</span>
                <span className="text-xs font-normal text-fg-muted">{t('deValor', { valor: fmt(s.valor) })}</span>
              </span>
            }
            estado={badge(s)}
            acciones={accionesDe(s)}
            onClick={() => abrirSaldo(s.id)}
          />
        )}
        vacio={{
          titulo: t('vacio.titulo'),
          descripcion: t('vacio.descripcion'),
          icono: HandCoins,
          accion: permisos.crear ? { etiqueta: t('acciones.registrarAnticipo'), onClick: () => setAnticipo(true), icono: Plus } : undefined,
        }}
        sinResultados={{ descripcion: t('sinResultados') }}
        error={{ titulo: t('errorCarga'), descripcion: error && error !== 'error_desconocido' ? textoErrorSaldo(t, new ErrorPeticionSaldoFavor(error, 0)) : undefined }}
        sinPermiso={{ titulo: t('sinPermiso.titulo'), descripcion: t('sinPermiso.descripcion') }}
        onLimpiarFiltros={l.limpiarTodo}
        onReintentar={recargar}
        termino={l.busqueda}
        pie={
          <Pagination
            pagina={l.pagina}
            tamano={l.tamano}
            total={total}
            onPaginaChange={l.setPagina}
            onTamanoChange={l.setTamano}
            opcionesTamano={TAMANOS_PAGINA_SALDOS}
            sustantivo={sustantivo}
            cargando={cargando}
          />
        }
      />

      <DetalleSaldoPanel
        saldoId={saldoAbierto}
        onCerrar={() => abrirSaldo(null)}
        permisos={permisosSaldo}
        version={recarga}
        onAplicar={setAplicar}
        onDevolver={setDevolver}
        onAnular={setAnular}
      />

      <RegistrarAnticipoDialog
        abierto={anticipo}
        onAbiertoChange={setAnticipo}
        clienteInicial={l.filtros.cliente && nombreCliente ? { id: l.filtros.cliente, nombre: nombreCliente } : null}
        onRegistrado={(r) => {
          recargar();
          abrirSaldo(r.id);
        }}
      />
      <AplicarSaldoDialog abierto={!!aplicar} onAbiertoChange={(v) => !v && setAplicar(null)} saldo={aplicar} onAplicado={recargar} />
      <DevolverSaldoDialog abierto={!!devolver} onAbiertoChange={(v) => !v && setDevolver(null)} saldo={devolver} onDevuelto={recargar} />
      <DialogoMotivo
        abierto={!!anular}
        onAbiertoChange={(v) => {
          if (anulando) return;
          setErrorAnular(null);
          if (!v) setAnular(null);
        }}
        titulo={t('anular.titulo')}
        descripcion={anular ? t('anular.descripcion', { cliente: anular.cliente ?? t('sinCliente'), monto: fmt(anular.valor), recibo: anular.origenNumero ?? '—' }) : undefined}
        textoConfirmar={t('anular.confirmar')}
        onConfirmar={confirmarAnular}
        tituloConsecuencias={t('anular.consecuenciasTitulo')}
        consecuencias={[t('anular.consecuencias.pago'), t('anular.consecuencias.saldo'), t('anular.consecuencias.asiento')]}
        motivosRapidos={[t('anular.rapidos.error'), t('anular.rapidos.duplicado'), t('anular.rapidos.cliente')]}
        cargando={anulando}
        error={errorAnular}
        bloqueo={bloqueoAnular ? t(`anular.bloqueos.${bloqueoAnular}`) : null}
      >
        {bloqueoAnular && anular && accionesSaldo(anular, permisosSaldo).devolver && (
          <button
            type="button"
            onClick={() => {
              const s = anular;
              setAnular(null);
              setDevolver(s);
            }}
            className={clasesBoton({ variante: 'secundario' })}
          >
            <Banknote aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('anular.devolverEnSuLugar')}
          </button>
        )}
      </DialogoMotivo>
    </div>
  );
}
