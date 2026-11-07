'use client';

/**
 * Notas — listado único de notas crédito y débito de venta (Figma `1021:91497`
 * listo, `1023:95636` sin resultados, `1021:95060` móvil;
 * `73-documentos-notas-listo.png`; FINANZAS-DOCUMENTOS-V2 §4.3).
 *
 * Pestañas Crédito · Débito (`?tipo=debito`), KPIs del periodo, búsqueda y
 * filtros (periodo, estado, DIAN, cliente), tabla ≥ lg y tarjetas debajo. Todo
 * en el servidor (`GET /api/notas`) con el estado en la URL.
 *
 * Acciones del listado anterior (`notas-credito/NotasCreditoPage.tsx`) que se
 * conservan: buscar, filtrar por estado, exportar CSV, ver detalle, imprimir y
 * ver PDF (motor), anular con motivo (`POST /api/notas-credito/[id]/anular`),
 * enlace a la factura de origen. «Nueva nota» ya no manda al listado de
 * facturas: elige la factura aquí y abre el diálogo de siempre.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Ban, CircleDollarSign, Download, Eye, FileMinus, FilePlus, FileText, Plus, Printer, Receipt } from 'lucide-react';
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
  RowActionsMenu,
  SearchInput,
  SegmentedControl,
  StatCard,
  StatusBadge,
  TabBar,
  clasesBoton,
  etiquetaRango,
  etiquetaRangoLarga,
  inicioDeMes,
  useListadoServidor,
  type AccionFila,
  type ChipFiltro,
  type ClientePicker,
  type ColumnaTabla,
} from '@/components/kit';
import { useFormatoEntero, useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { getOrganizationId, useOrganization } from '@/lib/hooks/useOrganization';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { crearFormateadorMoneda, formatNumeroMoneda } from '@/lib/utils/moneda';
import { abrirDocumento, imprimirDocumento } from '@/lib/documents/cliente';
import { usePermisosFinanzas } from '@/lib/finanzas/usePermisosFinanzas';
import { listarClientes } from '@/lib/services/clientesListadoService';
import { aCsv, descargarCsv } from '@/lib/finanzas/csv';
import { ErrorPeticionNota, anularNota, pedirListadoNotas } from '@/lib/finanzas/notas/clienteNotas';
import {
  CAMPOS_ORDEN_NOTAS,
  ESTADOS_DIAN_NOTA,
  TAMANOS_PAGINA_NOTAS,
  anulabilidadNota,
  esTipoNota,
  estadoBadgeDian,
  rutaDetalleNota,
  type FilaNota,
  type RespuestaListadoNotas,
  type TipoNota,
} from '@/lib/finanzas/notas/contratoNotas';
import { RegistrarPagoConectado } from '@/components/finanzas/pagos/RegistrarPagoConectado';
import { NotaCreditoVentaDialog } from '@/components/finanzas/facturas-venta/detalle/NotaCreditoVentaDialog';
import { ElegirFacturaNotaDialog } from './ElegirFacturaNotaDialog';
import { NotaDebitoDialog } from './NotaDebitoDialog';
import { detalleConceptoFila } from './notasVistaLogica';

const RUTA_FACTURAS = '/app/finanzas/facturas-venta';
/** Tope de la exportación: 25 páginas de 200. */
const PAGINAS_MAX = 25;

function sinClaves(filtros: Record<string, string>, claves: readonly string[]): Record<string, string> {
  return Object.fromEntries(Object.entries(filtros).filter(([k]) => !claves.includes(k)));
}

export function ListadoNotas() {
  const t = useTranslations('finanzasDocumentosR3.notas');
  const router = useRouter();
  const entero = useFormatoEntero();
  const locale = useLocaleIntl();
  const permisos = usePermisosFinanzas();
  const moneda = useMonedaOrganizacion();
  const { organization } = useOrganization();
  const { branchFilter, branches } = useBranch();
  const { formatDate, getToday } = useFormatDate();
  const hoy = getToday();

  const l = useListadoServidor({
    filtros: ['tipo', 'estado', 'dian', 'cliente', 'desde', 'hasta', 'periodo'],
    camposOrden: [...CAMPOS_ORDEN_NOTAS],
    ordenPorDefecto: { campo: 'fecha', direccion: 'desc' },
    tamanoPorDefecto: 25,
    tamanosPermitidos: TAMANOS_PAGINA_NOTAS,
  });
  const tipo: TipoNota = esTipoNota(l.filtros.tipo) ? l.filtros.tipo : 'credito';

  const [datos, setDatos] = useState<RespuestaListadoNotas | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [exportando, setExportando] = useState(false);
  const [clienteElegido, setClienteElegido] = useState<ClientePicker | null>(null);
  const [elegir, setElegir] = useState<TipoNota | null>(null);
  const [notaCredito, setNotaCredito] = useState<{ id: string; numero: string } | null>(null);
  const [notaDebito, setNotaDebito] = useState<{ id: string; numero: string } | null>(null);
  const [aAnular, setAAnular] = useState<FilaNota | null>(null);
  const [anulando, setAnulando] = useState(false);
  const [errorAnular, setErrorAnular] = useState<string | null>(null);
  const [pago, setPago] = useState<string | null>(null);

  const periodo = useMemo(() => ({ desde: l.filtros.desde ?? inicioDeMes(hoy), hasta: l.filtros.hasta ?? hoy }), [l.filtros.desde, l.filtros.hasta, hoy]);
  const todasLasFechas = l.filtros.periodo === 'todo';
  const periodoElegido = !!(l.filtros.desde || l.filtros.hasta);

  const consulta = useMemo(() => {
    const q = new URLSearchParams();
    q.set('tipo', tipo);
    if (l.busqueda) q.set('q', l.busqueda);
    for (const k of ['estado', 'dian', 'cliente'] as const) if (l.filtros[k]) q.set(k, l.filtros[k]);
    if (!todasLasFechas) {
      q.set('desde', periodo.desde);
      q.set('hasta', periodo.hasta);
    }
    q.set('kpi_desde', periodo.desde);
    q.set('kpi_hasta', periodo.hasta);
    if (branchFilter) q.set('sucursal', String(branchFilter));
    q.set('orden', l.orden?.campo ?? 'fecha');
    q.set('dir', l.orden?.direccion ?? 'desc');
    q.set('pagina', String(l.pagina));
    q.set('tamano', String(l.tamano));
    return q.toString();
  }, [tipo, l.busqueda, l.filtros, l.orden, l.pagina, l.tamano, periodo, todasLasFechas, branchFilter]);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(null);
    pedirListadoNotas(new URLSearchParams(consulta))
      .then((r) => !cancelado && setDatos(r))
      .catch((e) => !cancelado && setError(e instanceof ErrorPeticionNota ? e.codigo : 'error_desconocido'))
      .finally(() => !cancelado && setCargando(false));
    return () => {
      cancelado = true;
    };
  }, [consulta, recarga]);

  const recargar = useCallback(() => setRecarga((n) => n + 1), []);
  const filas = datos?.filas ?? [];
  const total = datos?.total ?? 0;
  const kpi = datos?.kpis;
  const fmtKpi = useMemo(() => crearFormateadorMoneda(moneda.paraDocumento(datos?.moneda)), [moneda, datos?.moneda]);
  const fmtFila = useCallback((f: FilaNota, v: number) => crearFormateadorMoneda(moneda.paraDocumento(f.moneda))(v), [moneda]);
  const sustantivo = {
    singular: t('listado.sustantivo.singular'),
    plural: t('listado.sustantivo.plural'),
    genero: t('listado.sustantivo.genero') === 'femenino' ? ('femenino' as const) : ('masculino' as const),
  };

  const nombreSucursal =
    branchFilter === null || branchFilter === undefined ? t('listado.todasLasSucursales') : branches.find((b) => b.id === branchFilter)?.name ?? null;
  const textoPeriodo = todasLasFechas ? t('listado.todasLasFechas') : etiquetaRangoLarga(periodo, locale);
  const subtitulo = [organization?.name, nombreSucursal, t('subtituloSufijo')].filter(Boolean).join(' · ');

  const cambiarTipo = (v: TipoNota) => l.actualizar({ filtros: { ...sinClaves(l.filtros, ['tipo', 'dian']), ...(v === 'debito' ? { tipo: 'debito' } : {}) } });

  // ── Badges y textos de fila ────────────────────────────────────────────────
  const badgeEstado = (f: FilaNota) => {
    if (f.anulada) return <StatusBadge estado="void" etiqueta={t('estados.void')} />;
    const clave = t.has(`estados.${f.estado}`) ? f.estado : 'issued';
    return <StatusBadge estado={clave} etiqueta={t(`estados.${clave}` as never)} />;
  };
  const badgeDian = (f: FilaNota) => <StatusBadge estado={estadoBadgeDian(f.dian)} etiqueta={t(`dian.${f.dian}`)} />;
  const textoConcepto = (f: FilaNota) =>
    f.concepto && t.has(`conceptos.${f.tipo}.${f.concepto}`) ? t(`conceptos.${f.tipo}.${f.concepto}` as never) : '—';
  const subConcepto = (f: FilaNota) => {
    const d = detalleConceptoFila(f);
    return d.clave === 'anulada'
      ? t('listado.detalleConcepto.anulada', { motivo: d.motivo ?? '' })
      : d.clave === 'porCobrar'
        ? t('listado.detalleConcepto.porCobrar', { saldo: fmtFila(f, f.saldo) })
        : t(`listado.detalleConcepto.${d.clave}`);
  };
  const valorConSigno = (f: FilaNota) => `${f.tipo === 'credito' ? '−' : '+'}${fmtFila(f, f.valor)}`;

  // ── Acciones ───────────────────────────────────────────────────────────────
  const verNota = (f: FilaNota) => router.push(rutaDetalleNota(f.tipo, f.id));
  const accionesDe = (f: FilaNota): AccionFila[] => {
    const anulable = anulabilidadNota({ tipo: f.tipo, anulada: f.anulada, dian: f.dian, pagado: f.valor - f.saldo, permisoAnular: permisos.anular });
    return [
      { id: 'ver', etiqueta: t('listado.acciones.ver'), icono: Eye, onSelect: () => verNota(f) },
      { id: 'imprimir', etiqueta: t('listado.acciones.imprimir'), icono: Printer, onSelect: () => imprimirDocumento('nota-credito', f.id), oculta: f.tipo !== 'credito' },
      { id: 'pdf', etiqueta: t('listado.acciones.pdf'), icono: FileText, onSelect: () => abrirDocumento('nota-credito', f.id), oculta: f.tipo !== 'credito' },
      {
        id: 'pagar',
        etiqueta: t('listado.acciones.registrarPago'),
        icono: CircleDollarSign,
        onSelect: () => setPago(f.id),
        oculta: f.tipo !== 'debito' || f.anulada || f.saldo <= 0 || !permisos.crear,
      },
      {
        id: 'factura',
        etiqueta: t('listado.acciones.verFactura'),
        icono: Receipt,
        onSelect: () => f.factura && router.push(`${RUTA_FACTURAS}/${f.factura.id}`),
        oculta: !f.factura,
      },
      {
        id: 'anular',
        etiqueta: t('listado.acciones.anular'),
        icono: Ban,
        destructiva: true,
        separadorAntes: true,
        onSelect: () => {
          setErrorAnular(null);
          setAAnular(f);
        },
        oculta: f.anulada || !permisos.anular,
        deshabilitada: !anulable.ok,
        motivo: anulable.ok ? undefined : t(`anular.bloqueos.${anulable.motivo}` as never),
      },
    ];
  };

  const anular = async (motivo: string) => {
    if (!aAnular) return;
    setAnulando(true);
    setErrorAnular(null);
    try {
      await anularNota(aAnular.tipo, aAnular.id, motivo);
      toastSuccess(t('anular.hecho'), t('anular.hechoDescripcion', { numero: aAnular.numero ?? '' }));
      setAAnular(null);
      recargar();
    } catch (e) {
      const codigo = e instanceof ErrorPeticionNota ? e.codigo : 'error_desconocido';
      // La ruta de la nota crédito ya devuelve el texto en el idioma del usuario.
      setErrorAnular(e instanceof ErrorPeticionNota && e.mensaje && aAnular.tipo === 'credito' ? e.mensaje : t.has(`anular.errores.${codigo}`) ? t(`anular.errores.${codigo}` as never) : t('anular.errores.error_desconocido'));
    } finally {
      setAnulando(false);
    }
  };

  // ── Exportar (todas las filas del filtro) ───────────────────────────────────
  const exportar = async () => {
    setExportando(true);
    try {
      const todas: FilaNota[] = [];
      const base = new URLSearchParams(consulta);
      base.set('tamano', '200');
      for (let pagina = 1; pagina <= PAGINAS_MAX; pagina++) {
        base.set('pagina', String(pagina));
        const r = await pedirListadoNotas(base);
        todas.push(...r.filas);
        if (todas.length >= r.total || r.filas.length === 0) break;
      }
      const csv = aCsv([
        [
          t('listado.columnas.numero'),
          t('listado.columnas.factura'),
          t('listado.columnas.cliente'),
          t('listado.columnas.fecha'),
          t('listado.columnas.concepto'),
          t('listado.columnas.motivo'),
          t('listado.columnas.valor'),
          t('listado.columnas.saldo'),
          t('listado.columnas.estado'),
          t('listado.columnas.dian'),
        ],
        ...todas.map((f) => [
          f.numero ?? '',
          f.factura?.numero ?? '',
          f.cliente ?? '',
          formatDate(f.fecha),
          textoConcepto(f),
          f.motivo ?? '',
          formatNumeroMoneda(f.valor, moneda.paraDocumento(f.moneda)),
          formatNumeroMoneda(f.saldo, moneda.paraDocumento(f.moneda)),
          f.anulada ? t('estados.void') : t.has(`estados.${f.estado}`) ? t(`estados.${f.estado}` as never) : f.estado,
          t(`dian.${f.dian}`),
        ]),
      ]);
      descargarCsv(`${t('listado.archivo')}_${tipo}_${hoy}.csv`, csv);
    } catch {
      toastError(t('listado.exportarError'));
    } finally {
      setExportando(false);
    }
  };

  // ── Filtros ────────────────────────────────────────────────────────────────
  const buscarClientes = useCallback(async (texto: string, _senal: AbortSignal, _filtros: readonly string[], desde: number) => {
    const r = await listarClientes({ organizationId: getOrganizationId(), branchId: null, criterios: { busqueda: texto }, orden: null, desde, tamano: 10 });
    const items: ClientePicker[] = r.filas.map((c) => ({ id: c.id, nombre: c.full_name ?? c.company_name ?? '', documento: c.identification_number, correo: c.email, telefono: c.phone }));
    return { items, total: r.total };
  }, []);
  const nombreClienteFiltro = !l.filtros.cliente
    ? null
    : clienteElegido?.id === l.filtros.cliente
      ? clienteElegido.nombre
      : filas.find((f) => f.clienteId === l.filtros.cliente)?.cliente ?? null;

  const chips: ChipFiltro[] = [
    todasLasFechas ? { clave: 'periodo', etiqueta: t('listado.todasLasFechas') } : null,
    !todasLasFechas && periodoElegido ? { clave: 'desde', etiqueta: `${t('listado.filtros.periodo')}: ${etiquetaRango(periodo, locale)}` } : null,
    l.filtros.estado ? { clave: 'estado', etiqueta: `${t('listado.filtros.estado')}: ${t(l.filtros.estado === 'anulada' ? 'estados.void' : 'estados.issued')}` } : null,
    l.filtros.dian && (ESTADOS_DIAN_NOTA as readonly string[]).includes(l.filtros.dian)
      ? { clave: 'dian', etiqueta: `${t('listado.filtros.dian')}: ${t(`dian.${l.filtros.dian}` as never)}` }
      : null,
    l.filtros.cliente ? { clave: 'cliente', etiqueta: nombreClienteFiltro ?? t('listado.filtros.clienteChip') } : null,
  ].filter((c): c is ChipFiltro => c !== null);
  const quitarChip = (clave: string) => {
    if (clave === 'desde') l.actualizar({ filtros: sinClaves(l.filtros, ['desde', 'hasta']) });
    else l.setFiltro(clave, null);
  };
  const limpiarFiltros = () => l.actualizar({ filtros: tipo === 'debito' ? { tipo: 'debito' } : {} });

  // ── Columnas (Figma 1021:91497) ────────────────────────────────────────────
  const columnas: ColumnaTabla<FilaNota>[] = [
    {
      id: 'numero',
      encabezado: t('listado.columnas.numero'),
      ordenable: true,
      celda: (f) => (
        <Link
          href={rutaDetalleNota(f.tipo, f.id)}
          onClick={(e) => e.stopPropagation()}
          className="whitespace-nowrap font-medium text-link underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {f.numero ?? t('listado.sinNumero')}
        </Link>
      ),
    },
    {
      id: 'factura',
      encabezado: t('listado.columnas.factura'),
      celda: (f) =>
        f.factura ? (
          <span onClick={(e) => e.stopPropagation()}>
            <ChipDocumento tipo="factura" numero={f.factura.numero ?? t('listado.sinNumero')} href={`${RUTA_FACTURAS}/${f.factura.id}`} />
          </span>
        ) : (
          <span className="text-fg-muted">—</span>
        ),
    },
    {
      id: 'cliente',
      encabezado: t('listado.columnas.cliente'),
      celda: (f) => (
        <div className="flex min-w-0 max-w-[220px] flex-col">
          <span className="truncate text-fg">{f.cliente ?? t('listado.sinCliente')}</span>
          {f.clienteDoc && <span className="truncate text-xs text-fg-muted">{f.clienteDoc}</span>}
        </div>
      ),
    },
    { id: 'fecha', encabezado: t('listado.columnas.fecha'), ordenable: true, ocultarDebajo: 'lg', celda: (f) => <span className="whitespace-nowrap tabular-nums">{formatDate(f.fecha)}</span> },
    {
      id: 'concepto',
      encabezado: t('listado.columnas.concepto'),
      ocultarDebajo: 'xl',
      celda: (f) => (
        <div className="flex min-w-0 max-w-[240px] flex-col">
          <span className="truncate text-fg">{textoConcepto(f)}</span>
          <span className="truncate text-xs text-fg-muted">{subConcepto(f)}</span>
        </div>
      ),
    },
    {
      id: 'valor',
      encabezado: t('listado.columnas.valor'),
      ordenable: true,
      variante: 'importe',
      celda: (f) => <span className={f.anulada ? 'text-fg-muted line-through' : undefined}>{valorConSigno(f)}</span>,
    },
    { id: 'estado', encabezado: t('listado.columnas.estado'), alinear: 'centro', celda: badgeEstado },
    { id: 'dian', encabezado: t('listado.columnas.dian'), alinear: 'centro', ocultarDebajo: 'lg', celda: badgeDian },
  ];

  const estadoTabla =
    error === 'sin_permiso' ? 'sinPermiso' : cargando && !datos ? 'cargando' : error ? 'error' : filas.length === 0 ? (l.hayCriterios ? 'sinResultados' : 'vacio') : 'listo';

  const nuevaPrimaria = tipo === 'debito' ? 'debito' : 'credito';
  const puedeNueva = (v: TipoNota) => (v === 'credito' ? permisos.anular : permisos.crear);
  const conteo = datos?.conteo;

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={subtitulo}
        icono={tipo === 'debito' ? FilePlus : FileMinus}
        cargando={cargando}
        migas={[{ etiqueta: t('migas.finanzas'), href: '/app/finanzas' }, { etiqueta: t('migas.facturacion') }, { etiqueta: t('migas.notas') }]}
        debajo={<BranchBadgeActiva />}
        acciones={
          <>
            <button type="button" onClick={() => void exportar()} disabled={exportando} className={clasesBoton({ variante: 'secundario' })}>
              <Download aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {exportando ? t('listado.exportando') : t('listado.exportar')}
            </button>
            {puedeNueva(nuevaPrimaria) && (
              <button type="button" onClick={() => setElegir(nuevaPrimaria)} className={clasesBoton({ variante: 'primario' })}>
                <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {nuevaPrimaria === 'debito' ? t('listado.nuevaDebito') : t('listado.nuevaCredito')}
              </button>
            )}
            <RowActionsMenu
              orientacion="horizontal"
              tamano="md"
              titulo={t('titulo')}
              acciones={[
                {
                  id: 'otra',
                  etiqueta: nuevaPrimaria === 'debito' ? t('listado.nuevaCredito') : t('listado.nuevaDebito'),
                  icono: nuevaPrimaria === 'debito' ? FileMinus : FilePlus,
                  onSelect: () => setElegir(nuevaPrimaria === 'debito' ? 'credito' : 'debito'),
                  oculta: !puedeNueva(nuevaPrimaria === 'debito' ? 'credito' : 'debito'),
                },
              ]}
            />
          </>
        }
        movil={{
          subtitulo: textoPeriodo,
          accion: puedeNueva(nuevaPrimaria) ? (
            <button
              type="button"
              onClick={() => setElegir(nuevaPrimaria)}
              aria-label={nuevaPrimaria === 'debito' ? t('listado.nuevaDebito') : t('listado.nuevaCredito')}
              className="flex size-10 items-center justify-center rounded-lg text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Plus aria-hidden="true" className="size-5" strokeWidth={1.5} />
            </button>
          ) : undefined,
        }}
      />

      <TabBar<TipoNota>
        id="notas-tipo"
        etiqueta={t('pestanas.etiqueta')}
        valor={tipo}
        onValorChange={cambiarTipo}
        pestanas={[
          { valor: 'credito', etiqueta: t('pestanas.credito'), contador: conteo?.credito, icono: FileMinus },
          { valor: 'debito', etiqueta: t('pestanas.debito'), contador: conteo?.debito, icono: FilePlus },
        ]}
      />

      <KpiStrip etiqueta={t('listado.kpis.etiqueta')}>
        <StatCard
          etiqueta={tipo === 'debito' ? t('listado.kpis.debitado') : t('listado.kpis.acreditado')}
          icono={tipo === 'debito' ? FilePlus : FileMinus}
          cargando={!datos}
          valor={fmtKpi(kpi?.valor ?? 0)}
          detalle={t('listado.kpis.notas', { count: kpi?.notas ?? 0 })}
        />
        {tipo === 'credito' ? (
          <StatCard
            etiqueta={t('listado.kpis.excedente')}
            icono={CircleDollarSign}
            cargando={!datos}
            valor={fmtKpi(kpi?.excedente ?? 0)}
            detalle={t('listado.kpis.conExcedente', { count: kpi?.notasConExcedente ?? 0 })}
          />
        ) : (
          <StatCard
            etiqueta={t('listado.kpis.porCobrar')}
            icono={CircleDollarSign}
            cargando={!datos}
            valor={fmtKpi(kpi?.porCobrar ?? 0)}
            tono={kpi && kpi.porCobrar > 0 ? 'advertencia' : 'neutro'}
            detalle={t('listado.kpis.porCobrarDetalle')}
          />
        )}
        <StatCard
          etiqueta={t('listado.kpis.anuladas')}
          icono={Ban}
          cargando={!datos}
          valor={entero(kpi?.anuladas ?? 0)}
          detalle={t('listado.kpis.anuladasDetalle')}
          onClick={() => l.setFiltro('estado', 'anulada')}
        />
        <StatCard
          etiqueta={t('listado.kpis.sinEnviar')}
          icono={AlertTriangle}
          cargando={!datos}
          valor={entero(kpi?.sinEnviar ?? 0)}
          tono={kpi && kpi.sinEnviar > 0 ? 'advertencia' : 'neutro'}
          detalle={t('listado.kpis.sinEnviarDetalle')}
          onClick={() => l.setFiltro('dian', 'sin_enviar')}
        />
      </KpiStrip>

      {datos?.truncado && <p className="text-xs text-warning-text">{t('listado.truncado')}</p>}

      <ListToolbar
        busqueda={<SearchInput value={l.busqueda} onChange={l.setBusqueda} cargando={cargando} placeholder={t('listado.buscar.placeholder')} etiqueta={t('listado.buscar.etiqueta')} />}
        filtros={
          <FilterPanel conteo={chips.length} onLimpiar={limpiarFiltros} textoVerResultados={t('listado.filtros.verN', { count: total })}>
            <FormField etiqueta={t('listado.filtros.periodo')}>
              {() => (
                <div className="flex flex-col gap-2">
                  <DateRangeButton
                    valor={periodo}
                    hoy={hoy}
                    max={hoy}
                    etiqueta={t('listado.filtros.periodo')}
                    onValorChange={(r) => l.actualizar({ filtros: { ...sinClaves(l.filtros, ['periodo']), desde: r.desde, hasta: r.hasta } })}
                  />
                  <label className="flex items-center gap-2 text-sm text-fg">
                    <Checkbox checked={todasLasFechas} onCheckedChange={(v) => l.setFiltro('periodo', v === true ? 'todo' : null)} />
                    {t('listado.filtros.todasLasFechas')}
                  </label>
                </div>
              )}
            </FormField>
            <FormField etiqueta={t('listado.filtros.estado')}>
              {(c) => (
                <SegmentedControl
                  aria-labelledby={c.idEtiqueta}
                  anchoCompleto
                  valor={l.filtros.estado ?? 'todos'}
                  onValorChange={(v) => l.setFiltro('estado', v === 'todos' ? null : v)}
                  opciones={[
                    { valor: 'todos', etiqueta: t('listado.filtros.todos') },
                    { valor: 'emitida', etiqueta: t('estados.issued') },
                    { valor: 'anulada', etiqueta: t('estados.void') },
                  ]}
                />
              )}
            </FormField>
            <FormField etiqueta={t('listado.filtros.dian')}>
              {(c) => (
                <Select value={l.filtros.dian ?? 'todos'} onValueChange={(v) => l.setFiltro('dian', v === 'todos' ? null : v)}>
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">{t('listado.filtros.todos')}</SelectItem>
                    {ESTADOS_DIAN_NOTA.map((e) => (
                      <SelectItem key={e} value={e}>
                        {t(`dian.${e}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <CustomerPicker
              layout="campo"
              cliente={l.filtros.cliente ? (clienteElegido?.id === l.filtros.cliente ? clienteElegido : { id: l.filtros.cliente, nombre: nombreClienteFiltro ?? t('listado.filtros.clienteChip') }) : null}
              etiqueta={t('listado.filtros.cliente')}
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
          </FilterPanel>
        }
        chips={<FilterChips chips={chips} onQuitar={quitarChip} onLimpiarTodo={limpiarFiltros} textoLimpiarTodo={t('listado.filtros.limpiar')} />}
      />

      <DataTable
        etiqueta={t('titulo')}
        columnas={columnas}
        filas={filas}
        obtenerId={(f) => f.id}
        estado={estadoTabla}
        orden={l.orden}
        onOrdenar={l.ordenarPor}
        onFilaClick={verNota}
        etiquetaFila={(f) => f.numero ?? t('listado.sinNumero')}
        acciones={accionesDe}
        tarjetaMovil={(f) => (
          <ListCard
            icono={f.tipo === 'debito' ? FilePlus : FileMinus}
            titulo={f.numero ?? t('listado.sinNumero')}
            subtitulo={[f.cliente ?? t('listado.sinCliente'), f.factura?.numero].filter(Boolean).join(' · ')}
            meta={<span>{formatDate(f.fecha)}</span>}
            valor={<span className={f.anulada ? 'text-fg-muted line-through' : undefined}>{valorConSigno(f)}</span>}
            etiquetas={badgeDian(f)}
            estado={badgeEstado(f)}
            acciones={accionesDe(f)}
            onClick={() => verNota(f)}
          />
        )}
        vacio={{
          titulo: tipo === 'debito' ? t('listado.vacio.tituloDebito') : t('listado.vacio.tituloCredito'),
          descripcion: tipo === 'debito' ? t('listado.vacio.descripcionDebito') : t('listado.vacio.descripcionCredito'),
          icono: tipo === 'debito' ? FilePlus : FileMinus,
          accion: puedeNueva(tipo)
            ? { etiqueta: tipo === 'debito' ? t('listado.nuevaDebito') : t('listado.nuevaCredito'), onClick: () => setElegir(tipo), icono: Plus }
            : undefined,
        }}
        sinResultados={{ descripcion: t('listado.sinResultados') }}
        error={{ titulo: t('listado.errorCarga') }}
        sinPermiso={{ titulo: t('detalle.sinPermiso'), descripcion: t('detalle.sinPermisoDescripcion') }}
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
            opcionesTamano={TAMANOS_PAGINA_NOTAS}
            sustantivo={sustantivo}
            cargando={cargando}
          />
        }
      />

      <DialogoMotivo
        abierto={aAnular !== null}
        onAbiertoChange={(v) => {
          if (!v && !anulando) {
            setAAnular(null);
            setErrorAnular(null);
          }
        }}
        titulo={aAnular?.tipo === 'debito' ? t('anular.tituloDebito', { numero: aAnular?.numero ?? '' }) : t('anular.tituloCredito', { numero: aAnular?.numero ?? '' })}
        descripcion={t('anular.descripcion')}
        textoConfirmar={t('anular.confirmar')}
        onConfirmar={anular}
        tituloConsecuencias={t('anular.consecuenciasTitulo')}
        consecuencias={
          aAnular?.tipo === 'debito'
            ? [t('anular.consecuencias.cartera_nd'), t('anular.consecuencias.asiento')]
            : [t('anular.consecuencias.factura_vuelve', { factura: aAnular?.factura?.numero ?? '' }), t('anular.consecuencias.asiento')]
        }
        motivosRapidos={[t('anular.rapidos.error'), t('anular.rapidos.duplicada'), t('anular.rapidos.cliente')]}
        cargando={anulando}
        error={errorAnular}
      />

      <ElegirFacturaNotaDialog
        abierto={elegir !== null}
        onAbiertoChange={(v) => !v && setElegir(null)}
        tipo={elegir ?? 'credito'}
        sucursal={branchFilter ?? null}
        onElegida={(f) => {
          const tipoElegido = elegir;
          setElegir(null);
          if (tipoElegido === 'debito') setNotaDebito(f);
          else setNotaCredito(f);
        }}
      />
      {notaCredito && (
        <NotaCreditoVentaDialog
          abierto={notaCredito !== null}
          onAbiertoChange={(v) => !v && setNotaCredito(null)}
          facturaId={notaCredito.id}
          numero={notaCredito.numero}
          onEmitida={recargar}
        />
      )}
      {notaDebito && (
        <NotaDebitoDialog
          abierto={notaDebito !== null}
          onAbiertoChange={(v) => !v && setNotaDebito(null)}
          facturaId={notaDebito.id}
          numero={notaDebito.numero}
          onEmitida={recargar}
        />
      )}
      {pago && (
        <RegistrarPagoConectado
          abierto={pago !== null}
          onAbiertoChange={(v) => !v && setPago(null)}
          destino={{ tipo: 'factura', id: pago }}
          origen="factura_venta"
          onRegistrado={recargar}
        />
      )}
    </div>
  );
}

