'use client';

/**
 * Documentos soporte — listado (Figma S1 `736:37084`, captura
 * `86-documentos-soporte-listado.png`; estados S2–S6 `736:38173…39745`; móvil M1).
 *
 * Paginado, filtrado y ordenado en el servidor (`GET /api/documentos-soporte`)
 * con el estado en la URL (`useListadoServidor`). Reemplaza
 * `SupportDocumentsPage` + `SupportDocumentsTable` (2026-11-07), que leían
 * desde el navegador y contaban los KPI bajando todas las filas.
 *
 * Acciones conservadas de la pantalla vieja: nuevo, buscar (ahora en el
 * servidor: referencia, número DIAN, vendedor o su documento), filtrar por
 * estado, paginar, ver, imprimir. «Actualizar» pasa a ser automático (cada
 * cambio vuelve a pedir). Nuevas: exportar, filtros por periodo, vendedor y
 * compra, y en la fila editar, enviar a la DIAN, PDF y eliminar borrador.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle, ArrowDown, ArrowUp, Download, Eye, FileCheck, FileText, Pencil, Plus, Printer, Send, Trash2 } from 'lucide-react';
import {
  BranchBadgeActiva,
  ChipDocumento,
  ConfirmDialog,
  DataTable,
  DateRangeButton,
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
  etiquetaRangoLarga,
  inicioDeMes,
  useListadoServidor,
  type AccionFila,
  type ChipFiltro,
  type ColumnaTabla,
} from '@/components/kit';
import { useFormatoEntero, useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toastError, toastSuccess, toastWarning } from '@/components/ui/use-toast';
import { ElegirProveedor, type ProveedorDocumento } from '@/components/finanzas/documento/terceros';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { crearFormateadorMoneda, formatNumeroMoneda } from '@/lib/utils/moneda';
import { abrirDocumento, imprimirDocumento } from '@/lib/documents/cliente';
import { usePermisosFinanzas } from '@/lib/finanzas/usePermisosFinanzas';
import { aCsv, descargarCsv } from '@/lib/finanzas/csv';
import {
  CAMPOS_ORDEN_SOPORTE,
  FILTROS_PANTALLA_SOPORTE,
  TAMANOS_PAGINA_SOPORTE,
  ordenSoporte,
  type FilaSoporteListado,
  type RespuestaListadoSoporte,
} from '@/lib/finanzas/soporte/contratoSoporte';
import {
  BADGE_DIAN,
  BADGE_DOCUMENTO,
  FILTROS_ESTADO,
  accionesSoporte,
  eliminarEnProveedorPrimero,
  esFiltroEstado,
  estadoDian,
  estadoDocumento,
} from '@/lib/finanzas/soporte/soporteLogica';
import { ErrorPeticionSoporte, eliminarEnProveedor, eliminarSoporte, enviarSoporteDian, pedirListadoSoporte } from '@/lib/finanzas/soporte/clienteSoporte';

const RUTA = '/app/finanzas/documentos-soporte';
const PAGINAS_MAX = 25;

export function ListadoDocumentosSoporte() {
  const t = useTranslations('finanzasDocumentosR3.soporte');
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
    filtros: [...FILTROS_PANTALLA_SOPORTE],
    camposOrden: [...CAMPOS_ORDEN_SOPORTE],
    ordenPorDefecto: { campo: 'fecha', direccion: 'desc' },
    tamanoPorDefecto: 25,
    tamanosPermitidos: TAMANOS_PAGINA_SOPORTE,
  });

  const [datos, setDatos] = useState<RespuestaListadoSoporte | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [exportando, setExportando] = useState(false);
  const [aEliminar, setAEliminar] = useState<FilaSoporteListado | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [proveedorElegido, setProveedorElegido] = useState<ProveedorDocumento | null>(null);

  // KPI «Emitidos en …»: el mes en curso de la organización.
  const mes = useMemo(() => ({ desde: inicioDeMes(hoy), hasta: hoy }), [hoy]);

  const consulta = useMemo(() => {
    const q = new URLSearchParams();
    if (l.busqueda) q.set('q', l.busqueda);
    for (const [k, v] of Object.entries(l.filtros)) if (v) q.set(k, v);
    q.set('kpi_desde', mes.desde);
    q.set('kpi_hasta', mes.hasta);
    if (branchFilter) q.set('sucursal', String(branchFilter));
    q.set('orden', ordenSoporte(l.orden?.campo, l.orden?.direccion));
    q.set('pagina', String(l.pagina));
    q.set('tamano', String(l.tamano));
    return q.toString();
  }, [l.busqueda, l.filtros, l.orden, l.pagina, l.tamano, mes, branchFilter]);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(null);
    pedirListadoSoporte(new URLSearchParams(consulta))
      .then((r) => !cancelado && setDatos(r))
      .catch((e: unknown) => !cancelado && setError(e instanceof ErrorPeticionSoporte ? String(e.codigo) : 'error_desconocido'))
      .finally(() => !cancelado && setCargando(false));
    return () => {
      cancelado = true;
    };
  }, [consulta, recarga]);

  const recargar = useCallback(() => setRecarga((n) => n + 1), []);
  const filas = datos?.filas ?? [];
  const total = datos?.total ?? 0;
  const kpis = datos?.kpis ?? null;
  const fmtBase = useMemo(() => crearFormateadorMoneda(moneda.paraDocumento(null)), [moneda]);
  const fmtFila = useCallback((f: FilaSoporteListado, v: number) => crearFormateadorMoneda(moneda.paraDocumento(f.moneda))(v), [moneda]);
  const textoError = (codigo: string) => (t.has(`errores.${codigo}`) ? t(`errores.${codigo}` as never) : t('errores.error_desconocido'));
  const sustantivo = { singular: t('listado.sustantivo.singular'), plural: t('listado.sustantivo.plural'), genero: 'masculino' as const };

  const nombreSucursal = branchFilter === null || branchFilter === undefined ? t('listado.todasLasSucursales') : branches.find((b) => b.id === branchFilter)?.name ?? null;
  const subtitulo = t('listado.subtitulo');

  // ── Estado de la fila ──────────────────────────────────────────────────────
  const badgeDocumento = (f: FilaSoporteListado) => {
    const e = estadoDocumento(f.estado);
    return <StatusBadge estado={BADGE_DOCUMENTO[e]} etiqueta={t(`estadoDocumento.${e}`)} />;
  };
  const badgeDian = (f: FilaSoporteListado) => {
    const e = estadoDian(f.estado, f.envio?.retenido ?? false);
    return <StatusBadge estado={BADGE_DIAN[e]} etiqueta={t(`estadoDian.${e}`)} />;
  };

  // ── Acciones de fila ──────────────────────────────────────────────────────
  const enviar = async (f: FilaSoporteListado) => {
    setEnviando(f.id);
    try {
      const r = await enviarSoporteDian(f.id);
      if (r.tipo === 'aceptado' || r.tipo === 'enviado') toastSuccess(t(`envio.${r.tipo}`, { referencia: f.referencia }));
      else if (r.tipo === 'rechazado') toastError(t('envio.rechazado', { referencia: f.referencia }), r.mensaje ?? undefined);
      else toastWarning(t(`envio.${r.tipo}`, { referencia: f.referencia }));
      recargar();
    } catch (e) {
      toastError(t('envio.error'), e instanceof ErrorPeticionSoporte ? textoError(String(e.codigo)) : undefined);
    } finally {
      setEnviando(null);
    }
  };

  const eliminar = async () => {
    if (!aEliminar) return;
    setEliminando(true);
    try {
      if (eliminarEnProveedorPrimero(aEliminar.estado)) await eliminarEnProveedor(aEliminar.referencia);
      await eliminarSoporte(aEliminar.id);
      toastSuccess(t('eliminar.hecho', { referencia: aEliminar.referencia }));
      setAEliminar(null);
      recargar();
    } catch (e) {
      toastError(t('eliminar.error'), e instanceof ErrorPeticionSoporte ? textoError(String(e.codigo)) : undefined);
    } finally {
      setEliminando(false);
    }
  };

  const accionesDe = (f: FilaSoporteListado): AccionFila[] => {
    const a = accionesSoporte({ status: f.estado, numero: f.numero, estadoJob: f.envio?.estado ?? null, deCompra: f.deCompra });
    return [
      { id: 'ver', etiqueta: t('acciones.ver'), icono: Eye, onSelect: () => router.push(`${RUTA}/${f.id}`) },
      { id: 'editar', etiqueta: t('acciones.editar'), icono: Pencil, onSelect: () => router.push(`${RUTA}/${f.id}/editar`), oculta: !permisos.crear || !a.has('editar') },
      {
        id: 'enviar',
        etiqueta: t('acciones.enviarDian'),
        icono: Send,
        onSelect: () => void enviar(f),
        oculta: !permisos.crear || !a.has('enviar'),
        deshabilitada: enviando === f.id,
        motivo: t('envio.enviando'),
      },
      { id: 'pdf', etiqueta: t('acciones.verPdf'), icono: FileText, onSelect: () => abrirDocumento('documento-soporte', f.id) },
      { id: 'imprimir', etiqueta: t('acciones.imprimir'), icono: Printer, onSelect: () => imprimirDocumento('documento-soporte', f.id) },
      { id: 'eliminar', etiqueta: t('acciones.eliminar'), icono: Trash2, destructiva: true, separadorAntes: true, onSelect: () => setAEliminar(f), oculta: !permisos.anular || !a.has('eliminar') },
    ];
  };

  // ── Exportar ──────────────────────────────────────────────────────────────
  const exportar = async () => {
    setExportando(true);
    try {
      const todas: FilaSoporteListado[] = [];
      const base = new URLSearchParams(consulta);
      base.set('tamano', '200');
      for (let pagina = 1; pagina <= PAGINAS_MAX; pagina++) {
        base.set('pagina', String(pagina));
        const r = await pedirListadoSoporte(base);
        todas.push(...r.filas);
        if (todas.length >= r.total || r.filas.length === 0) break;
      }
      const csv = aCsv([
        [
          t('listado.columnas.referencia'),
          t('listado.columnas.numeroDian'),
          t('listado.columnas.vendedor'),
          t('listado.columnas.documentoVendedor'),
          t('listado.columnas.compra'),
          t('listado.columnas.fecha'),
          t('listado.columnas.moneda'),
          t('listado.columnas.total'),
          t('listado.columnas.estado'),
          t('listado.columnas.dian'),
        ],
        ...todas.map((f) => [
          f.referencia,
          f.numero ?? '',
          f.proveedor ?? '',
          f.proveedorDoc ?? '',
          f.compra?.numero ?? '',
          f.fecha ? formatDate(f.fecha) : '',
          f.moneda ?? moneda.code,
          formatNumeroMoneda(f.total, moneda.paraDocumento(f.moneda)),
          t(`estadoDocumento.${estadoDocumento(f.estado)}`),
          t(`estadoDian.${estadoDian(f.estado, f.envio?.retenido ?? false)}`),
        ]),
      ]);
      descargarCsv(`${t('listado.archivoExportacion')}_${hoy}.csv`, csv);
    } catch {
      toastError(t('listado.exportarError'));
    } finally {
      setExportando(false);
    }
  };

  // ── Filtros y chips ───────────────────────────────────────────────────────
  const filtroEstado = esFiltroEstado(l.filtros.estado) ? l.filtros.estado : null;
  const periodoElegido = l.filtros.desde || l.filtros.hasta ? { desde: l.filtros.desde ?? l.filtros.hasta ?? hoy, hasta: l.filtros.hasta ?? hoy } : null;
  const chip = (clave: string, etiqueta: string, valor: string): ChipFiltro => ({ clave, etiqueta: `${etiqueta}: ${valor}` });
  const chips: ChipFiltro[] = [
    ...(filtroEstado ? [chip('estado', t('listado.filtros.estado'), t(`listado.filtros.estados.${filtroEstado}`))] : []),
    ...(periodoElegido ? [chip('periodo', t('listado.filtros.periodo'), etiquetaRangoLarga(periodoElegido, locale))] : []),
    ...(l.filtros.proveedor ? [chip('proveedor', t('listado.filtros.vendedor'), proveedorElegido?.nombre ?? t('listado.filtros.vendedorChip'))] : []),
    ...(l.filtros.compra ? [chip('compra', t('listado.filtros.compra'), t(`listado.filtros.compraOpcion.${l.filtros.compra === 'con' ? 'con' : 'sin'}`))] : []),
  ];
  const quitarChip = (id: string) => {
    if (id === 'periodo') l.actualizar({ filtros: Object.fromEntries(Object.entries(l.filtros).filter(([k]) => k !== 'desde' && k !== 'hasta')) });
    else {
      if (id === 'proveedor') setProveedorElegido(null);
      l.setFiltro(id, null);
    }
  };
  const filtrarEstado = (e: keyof typeof FILTROS_ESTADO) => l.actualizar({ filtros: { estado: e } });
  const filtrarMes = () => l.actualizar({ filtros: { desde: mes.desde, hasta: mes.hasta } });

  // ── Columnas ──────────────────────────────────────────────────────────────
  const columnas: ColumnaTabla<FilaSoporteListado>[] = [
    {
      id: 'referencia',
      encabezado: t('listado.columnas.referencia'),
      ordenable: true,
      celda: (f) => (
        <div className="flex min-w-0 flex-col">
          <Link href={`${RUTA}/${f.id}`} onClick={(e) => e.stopPropagation()} className="truncate font-medium text-fg hover:text-brand hover:underline">
            {f.referencia}
          </Link>
          <span className="truncate text-xs text-fg-muted">{f.numero ? t('listado.numeroDian', { numero: f.numero }) : t('listado.sinNumero')}</span>
        </div>
      ),
    },
    {
      id: 'vendedor',
      encabezado: t('listado.columnas.vendedor'),
      celda: (f) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-fg">{f.proveedor ?? t('listado.sinVendedor')}</span>
          {f.proveedorDoc && <span className="truncate text-xs text-fg-muted">{f.proveedorDoc}</span>}
        </div>
      ),
    },
    {
      id: 'compra',
      encabezado: t('listado.columnas.compra'),
      ocultarDebajo: 'xl',
      celda: (f) =>
        f.compra ? (
          <ChipDocumento tipo="facturaCompra" numero={f.compra.numero || t('listado.compraSinNumero')} href={`/app/finanzas/facturas-compra/${f.compra.id}`} />
        ) : (
          <span className="text-fg-muted" aria-label={t('listado.sinCompra')}>
            —
          </span>
        ),
    },
    { id: 'fecha', encabezado: t('listado.columnas.fecha'), ordenable: true, ocultarDebajo: 'lg', celda: (f) => <span className="whitespace-nowrap tabular-nums">{f.fecha ? formatDate(f.fecha) : '—'}</span> },
    { id: 'total', encabezado: t('listado.columnas.total'), ordenable: true, variante: 'importe', celda: (f) => fmtFila(f, f.total) },
    { id: 'estado', encabezado: t('listado.columnas.estado'), alinear: 'centro', celda: badgeDocumento },
    { id: 'dian', encabezado: t('listado.columnas.dian'), alinear: 'centro', ocultarDebajo: 'md', celda: badgeDian },
  ];

  const estadoTabla =
    error === 'sin_permiso' ? 'sinPermiso' : cargando && !datos ? 'cargando' : error ? 'error' : filas.length === 0 ? (l.hayCriterios ? 'sinResultados' : 'vacio') : 'listo';

  const nombreMes = useMemo(() => new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(new Date(`${mes.desde}T12:00:00Z`)), [locale, mes.desde]);

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        titulo={t('listado.titulo')}
        subtitulo={[subtitulo, organization?.name, nombreSucursal].filter(Boolean).join(' · ')}
        icono={FileCheck}
        cargando={cargando}
        migas={[{ etiqueta: t('migas.finanzas'), href: '/app/finanzas' }, { etiqueta: t('migas.facturacion') }, { etiqueta: t('listado.titulo') }]}
        debajo={<BranchBadgeActiva />}
        acciones={
          <>
            <button type="button" onClick={() => void exportar()} disabled={exportando || total === 0} className={clasesBoton({ variante: 'secundario' })}>
              <Download aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {exportando ? t('listado.exportando') : t('listado.exportar')}
            </button>
            {permisos.crear && (
              <Link href={`${RUTA}/nuevo`} className={clasesBoton({ variante: 'primario' })}>
                <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('listado.nuevo')}
              </Link>
            )}
          </>
        }
        movil={{
          subtitulo: nombreSucursal ?? undefined,
          accion: permisos.crear ? (
            <Link
              href={`${RUTA}/nuevo`}
              aria-label={t('listado.nuevo')}
              className="flex size-10 items-center justify-center rounded-lg text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Plus aria-hidden="true" className="size-5" strokeWidth={1.5} />
            </Link>
          ) : undefined,
        }}
      />

      <KpiStrip etiqueta={t('listado.kpis.etiqueta')}>
        <StatCard
          etiqueta={t('listado.kpis.emitidosMes', { mes: nombreMes })}
          icono={FileCheck}
          cargando={!datos}
          valor={entero(kpis?.emitidosPeriodo ?? 0)}
          detalle={fmtBase(kpis?.valorPeriodo ?? 0)}
          onClick={filtrarMes}
        />
        <StatCard
          etiqueta={t('listado.kpis.borradores')}
          icono={Pencil}
          cargando={!datos}
          valor={entero(kpis?.borradores ?? 0)}
          tono={kpis && kpis.borradores > 0 ? 'advertencia' : 'neutro'}
          iconoDetalle={kpis && kpis.borradores > 0 ? AlertTriangle : undefined}
          detalle={t('listado.kpis.sinEnviar')}
          onClick={() => filtrarEstado('borrador')}
        />
        <StatCard
          etiqueta={t('listado.kpis.aceptados')}
          icono={FileCheck}
          cargando={!datos}
          valor={entero(kpis?.aceptados ?? 0)}
          tono={kpis && kpis.aceptados > 0 ? 'exito' : 'neutro'}
          iconoDetalle={kpis && kpis.aceptados > 0 ? ArrowUp : undefined}
          detalle={t('listado.kpis.validados')}
          onClick={() => filtrarEstado('aceptado')}
        />
        <StatCard
          etiqueta={t('listado.kpis.rechazados')}
          icono={AlertTriangle}
          cargando={!datos}
          valor={entero(kpis?.rechazados ?? 0)}
          tono={kpis && kpis.rechazados > 0 ? 'peligro' : 'neutro'}
          resaltada={!!kpis && kpis.rechazados > 0}
          iconoDetalle={kpis && kpis.rechazados > 0 ? ArrowDown : undefined}
          detalle={t('listado.kpis.verMotivo')}
          onClick={() => filtrarEstado('rechazado')}
        />
      </KpiStrip>

      <ListToolbar
        busqueda={<SearchInput value={l.busqueda} onChange={l.setBusqueda} cargando={cargando} placeholder={t('listado.buscar.placeholder')} etiqueta={t('listado.buscar.etiqueta')} />}
        filtros={
          <FilterPanel conteo={chips.length} onLimpiar={l.limpiarFiltros} textoVerResultados={t('listado.filtros.verN', { count: total, n: entero(total) })}>
            <FormField etiqueta={t('listado.filtros.estado')}>
              {(c) => (
                <Select value={filtroEstado ?? 'todos'} onValueChange={(v) => l.setFiltro('estado', v === 'todos' ? null : v)}>
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">{t('listado.filtros.todos')}</SelectItem>
                    {(Object.keys(FILTROS_ESTADO) as Array<keyof typeof FILTROS_ESTADO>).map((e) => (
                      <SelectItem key={e} value={e}>
                        {t(`listado.filtros.estados.${e}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <FormField etiqueta={t('listado.filtros.periodo')}>
              {() => (
                <DateRangeButton
                  valor={periodoElegido ?? mes}
                  hoy={hoy}
                  max={hoy}
                  etiqueta={t('listado.filtros.periodo')}
                  onValorChange={(r) => l.actualizar({ filtros: { ...l.filtros, desde: r.desde, hasta: r.hasta } })}
                />
              )}
            </FormField>
            <ElegirProveedor
              layout="campo"
              proveedor={l.filtros.proveedor ? proveedorElegido ?? { id: l.filtros.proveedor, nombre: t('listado.filtros.vendedorChip') } : null}
              onCambiar={(p) => {
                setProveedorElegido(p);
                l.setFiltro('proveedor', String(p.id));
              }}
              onQuitar={() => {
                setProveedorElegido(null);
                l.setFiltro('proveedor', null);
              }}
            />
            <FormField etiqueta={t('listado.filtros.compra')}>
              {(c) => (
                <SegmentedControl
                  aria-labelledby={c.idEtiqueta}
                  anchoCompleto
                  valor={l.filtros.compra ?? 'todos'}
                  onValorChange={(v) => l.setFiltro('compra', v === 'todos' ? null : v)}
                  opciones={[
                    { valor: 'todos', etiqueta: t('listado.filtros.todos') },
                    { valor: 'con', etiqueta: t('listado.filtros.compraOpcion.con') },
                    { valor: 'sin', etiqueta: t('listado.filtros.compraOpcion.sin') },
                  ]}
                />
              )}
            </FormField>
          </FilterPanel>
        }
        chips={<FilterChips chips={chips} onQuitar={quitarChip} onLimpiarTodo={l.limpiarFiltros} textoLimpiarTodo={t('listado.filtros.limpiar')} />}
      />

      <DataTable
        etiqueta={t('listado.titulo')}
        columnas={columnas}
        filas={filas}
        obtenerId={(f) => f.id}
        estado={estadoTabla}
        orden={l.orden}
        onOrdenar={l.ordenarPor}
        onFilaClick={(f) => router.push(`${RUTA}/${f.id}`)}
        etiquetaFila={(f) => f.referencia}
        acciones={accionesDe}
        tarjetaMovil={(f) => (
          <ListCard
            icono={FileCheck}
            titulo={f.referencia}
            subtitulo={f.proveedor ?? t('listado.sinVendedor')}
            meta={f.fecha ? formatDate(f.fecha) : undefined}
            valor={fmtFila(f, f.total)}
            etiquetas={badgeDian(f)}
            estado={badgeDocumento(f)}
            acciones={accionesDe(f)}
            onClick={() => router.push(`${RUTA}/${f.id}`)}
          />
        )}
        vacio={{
          titulo: t('listado.vacio.titulo'),
          descripcion: t('listado.vacio.descripcion'),
          icono: FileCheck,
          accion: permisos.crear ? { etiqueta: t('listado.nuevo'), href: `${RUTA}/nuevo`, icono: Plus } : undefined,
        }}
        sinResultados={{ descripcion: t('listado.sinResultados') }}
        error={{ titulo: t('listado.errorCarga'), descripcion: error && error !== 'error_desconocido' ? textoError(error) : undefined }}
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
            opcionesTamano={TAMANOS_PAGINA_SOPORTE}
            sustantivo={sustantivo}
            cargando={cargando}
          />
        }
      />

      <ConfirmDialog
        abierto={aEliminar !== null}
        onAbiertoChange={(v) => !v && !eliminando && setAEliminar(null)}
        titulo={t('eliminar.titulo', { referencia: aEliminar?.referencia ?? '' })}
        descripcion={aEliminar && eliminarEnProveedorPrimero(aEliminar.estado) ? t('eliminar.descripcionProveedor') : t('eliminar.descripcion')}
        textoConfirmar={t('eliminar.confirmar')}
        textoCancelar={t('acciones.cancelar')}
        tono="peligro"
        icono={Trash2}
        cargando={eliminando}
        onConfirmar={eliminar}
      />
    </div>
  );
}
