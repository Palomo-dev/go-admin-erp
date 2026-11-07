'use client';

/**
 * Cotizaciones — listado (Figma «Finanzas — Documentos v2»: escritorio `1022:93252`,
 * vacío `1023:95103`, tableta `1023:98155`, móvil `1022:96830`;
 * docs/design/FINANZAS-DOCUMENTOS-V2.md §3.3).
 *
 * Página, orden, filtros y KPI en el servidor (`GET /api/cotizaciones?vista=listado`
 * → `fn_cotizaciones_listado` + `listadoCotizaciones.ts`), estado en la URL
 * (`useListadoServidor`). «Vencida» la deriva la base con el día de la
 * organización. Las acciones van a las rutas que ya existían: enviar
 * (`/enviar`, correo con el PDF del motor), convertir (`/convertir`, factura
 * BORRADOR), duplicar, cambiar estado y eliminar borrador.
 *
 * Acciones del listado anterior que se conservan: ver, imprimir, ver PDF,
 * editar (borrador o enviada), duplicar y eliminar borrador (con confirmación);
 * filtros por estado y búsqueda. Se suman: KPIs que filtran, periodo, cliente,
 * vendedor, monto, «con oportunidad», enviar, convertir, marcar rechazada y exportar.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowDown, ArrowUp, Calculator, Copy, Download, Eye, FileCheck2, FileText, MailCheck, Pencil, Plus, Printer, Send, Trash2, TriangleAlert, XCircle } from 'lucide-react';
import {
  AccionRapida,
  BranchBadgeActiva,
  CampoNumero,
  CustomerPicker,
  DataTable,
  DateRangeButton,
  Dialogo,
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
  etiquetaRango,
  inicioDeMes,
  simboloMoneda,
  useListadoServidor,
  type AccionFila,
  type ChipFiltro,
  type ClientePicker,
  type ColumnaTabla,
} from '@/components/kit';
import { useFormatoEntero, useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchSelect } from '@/components/ui/search-select';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { getOrganizationId, useOrganization } from '@/lib/hooks/useOrganization';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { useOrgMembers } from '@/lib/hooks/useOrgMembers';
import { crearFormateadorMoneda, formatNumeroMoneda } from '@/lib/utils/moneda';
import { abrirDocumento, imprimirDocumento } from '@/lib/documents/cliente';
import { usePermisosFinanzas } from '@/lib/finanzas/usePermisosFinanzas';
import { listarClientes } from '@/lib/services/clientesListadoService';
import { CotizacionesService, ErrorPeticionCotizacion } from '@/lib/services/cotizacionesService';
import { aCsv, descargarCsv } from '@/lib/finanzas/csv';
import {
  CAMPOS_ORDEN_COTIZACIONES,
  FILTROS_LISTADO_COTIZACIONES,
  RUTA_COTIZACIONES,
  TAMANOS_PAGINA_COTIZACIONES,
  accionRapidaFila,
  accionesCotizacion,
  estadoBadgeCotizacion,
  ordenCotizacionesRuta,
  tasaConversion,
  vigenciaDe,
  type FilaCotizacionListado,
  type RespuestaListadoCotizaciones,
} from '@/lib/finanzas/ventas/listadoCotizaciones';
import { EnviarDocumentoDialog } from '@/components/finanzas/documento/EnviarDocumentoDialog';
import { ConvertirCotizacionDialog } from '../detalle/ConvertirCotizacionDialog';
import { useMensajeErrorCotizacion } from '../detalle/useMensajeErrorCotizacion';

const ESTADOS = ['draft', 'sent', 'accepted', 'expired', 'converted', 'rejected'] as const;
const PAGINAS_MAX = 25;

function numeroFiltro(valor: string | undefined): number | null {
  if (!valor) return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

export function ListadoCotizaciones() {
  const t = useTranslations('finanzasDocumentosR3.cotizaciones');
  const router = useRouter();
  const entero = useFormatoEntero();
  const locale = useLocaleIntl();
  const permisos = usePermisosFinanzas();
  const moneda = useMonedaOrganizacion();
  const { organization } = useOrganization();
  const { branchFilter, branches } = useBranch();
  const { formatPlain, getToday } = useFormatDate();
  const { members: miembros } = useOrgMembers();
  const mensajeError = useMensajeErrorCotizacion();
  const hoy = getToday();
  const p = { escribir: permisos.crear, convertir: permisos.crear };

  const l = useListadoServidor({
    filtros: [...FILTROS_LISTADO_COTIZACIONES],
    camposOrden: [...CAMPOS_ORDEN_COTIZACIONES],
    ordenPorDefecto: { campo: 'emision', direccion: 'desc' },
    tamanoPorDefecto: 25,
    tamanosPermitidos: TAMANOS_PAGINA_COTIZACIONES,
  });

  const [datos, setDatos] = useState<RespuestaListadoCotizaciones | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [clienteElegido, setClienteElegido] = useState<ClientePicker | null>(null);
  const [aEnviar, setAEnviar] = useState<FilaCotizacionListado | null>(null);
  const [aConvertir, setAConvertir] = useState<FilaCotizacionListado | null>(null);
  const [aEliminar, setAEliminar] = useState<FilaCotizacionListado | null>(null);
  const [aRechazar, setARechazar] = useState<FilaCotizacionListado | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [exportando, setExportando] = useState(false);

  // Periodo de los KPI (y del listado, si se eligió a mano): por defecto el mes en curso.
  const periodoElegido = !!(l.filtros.desde || l.filtros.hasta);
  const periodo = useMemo(() => ({ desde: l.filtros.desde ?? inicioDeMes(hoy), hasta: l.filtros.hasta ?? hoy }), [l.filtros.desde, l.filtros.hasta, hoy]);

  const consulta = useMemo(() => {
    const q = new URLSearchParams();
    if (l.busqueda) q.set('q', l.busqueda);
    for (const [k, v] of Object.entries(l.filtros)) if (v) q.set(k, v);
    q.set('kpi_desde', periodo.desde);
    q.set('kpi_hasta', periodo.hasta);
    if (branchFilter) q.set('sucursal', String(branchFilter));
    q.set('orden', ordenCotizacionesRuta(l.orden?.campo, l.orden?.direccion));
    q.set('pagina', String(l.pagina));
    q.set('tamano', String(l.tamano));
    return q.toString();
  }, [l.busqueda, l.filtros, l.orden, l.pagina, l.tamano, periodo, branchFilter]);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(null);
    CotizacionesService.listado(new URLSearchParams(consulta))
      .then((r) => !cancelado && setDatos(r))
      .catch((e: unknown) => !cancelado && setError(e instanceof ErrorPeticionCotizacion ? e.codigo : 'error_desconocido'))
      .finally(() => !cancelado && setCargando(false));
    return () => {
      cancelado = true;
    };
  }, [consulta, recarga]);

  const recargar = useCallback(() => setRecarga((n) => n + 1), []);
  const filas = datos?.filas ?? [];
  const total = datos?.total ?? 0;
  const kpi = datos?.kpis.find((k) => k.moneda === moneda.code) ?? datos?.kpis[0] ?? null;
  const fmtKpi = useMemo(() => crearFormateadorMoneda(moneda.paraDocumento(kpi?.moneda)), [moneda, kpi?.moneda]);
  const simboloKpi = useMemo(() => simboloMoneda(moneda.paraDocumento(kpi?.moneda)), [moneda, kpi?.moneda]);
  const fmtFila = useCallback((f: FilaCotizacionListado, v: number) => crearFormateadorMoneda(moneda.paraDocumento(f.moneda))(v), [moneda]);
  const tasa = tasaConversion(kpi);
  const sustantivo = { singular: t('listado.sustantivo.singular'), plural: t('listado.sustantivo.plural'), genero: 'femenino' as const };

  const nombreSucursal =
    branchFilter === null || branchFilter === undefined ? t('listado.todasLasSucursales') : branches.find((b) => b.id === branchFilter)?.name ?? null;
  const subtitulo = [organization?.name, nombreSucursal, t('listado.tambienCrm')].filter(Boolean).join(' · ');

  const ir = (f: FilaCotizacionListado) => router.push(`${RUTA_COTIZACIONES}/${f.id}`);

  // ── Acciones sobre una fila ────────────────────────────────────────────
  const duplicar = async (f: FilaCotizacionListado) => {
    setOcupado(true);
    try {
      const nueva = await CotizacionesService.duplicateQuotation(f.id);
      toastSuccess(t('acciones.duplicada', { numero: nueva.number }));
      router.push(`${RUTA_COTIZACIONES}/${nueva.id}`);
    } catch (e) {
      toastError(mensajeError(e));
    } finally {
      setOcupado(false);
    }
  };

  const eliminar = async () => {
    if (!aEliminar) return;
    setOcupado(true);
    try {
      await CotizacionesService.deleteQuotation(aEliminar.id);
      toastSuccess(t('eliminar.hecho', { numero: aEliminar.numero }));
      setAEliminar(null);
      recargar();
    } catch (e) {
      toastError(mensajeError(e));
    } finally {
      setOcupado(false);
    }
  };

  const marcarEnviada = async (f: FilaCotizacionListado) => {
    setOcupado(true);
    try {
      await CotizacionesService.changeStatus(f.id, 'sent');
      toastSuccess(t('estado.enviada', { numero: f.numero }));
      recargar();
    } catch (e) {
      toastError(mensajeError(e));
    } finally {
      setOcupado(false);
    }
  };

  const rechazar = async () => {
    if (!aRechazar) return;
    setOcupado(true);
    try {
      await CotizacionesService.changeStatus(aRechazar.id, 'rejected');
      toastSuccess(t('estado.rechazada', { numero: aRechazar.numero }));
      setARechazar(null);
      recargar();
    } catch (e) {
      toastError(mensajeError(e));
    } finally {
      setOcupado(false);
    }
  };

  const accionesDe = (f: FilaCotizacionListado): AccionFila[] => {
    const a = accionesCotizacion(f, p);
    const todas = new Set([a.primaria, ...a.secundarias, ...a.menu]);
    return [
      { id: 'ver', etiqueta: t('acciones.ver'), icono: Eye, onSelect: () => ir(f) },
      { id: 'enviar', etiqueta: t('acciones.enviar'), icono: Send, onSelect: () => setAEnviar(f), oculta: !todas.has('enviar') && !todas.has('reenviar') },
      { id: 'marcar_enviada', etiqueta: t('acciones.marcarEnviada'), icono: MailCheck, onSelect: () => void marcarEnviada(f), oculta: !todas.has('marcar_enviada') },
      { id: 'convertir', etiqueta: t('acciones.convertir'), icono: FileCheck2, onSelect: () => setAConvertir(f), oculta: !todas.has('convertir') },
      { id: 'factura', etiqueta: t('acciones.verFactura'), icono: FileText, onSelect: () => router.push(`/app/finanzas/facturas-venta/${f.factura_id}`), oculta: !todas.has('ver_factura') },
      { id: 'editar', etiqueta: t('acciones.editar'), icono: Pencil, onSelect: () => router.push(`${RUTA_COTIZACIONES}/${f.id}/editar`), oculta: !todas.has('editar') },
      { id: 'duplicar', etiqueta: t('acciones.duplicar'), icono: Copy, onSelect: () => void duplicar(f), oculta: !todas.has('duplicar') && !todas.has('renovar') },
      { id: 'pdf', etiqueta: t('acciones.descargarPdf'), icono: Download, onSelect: () => abrirDocumento('cotizacion', f.id) },
      { id: 'imprimir', etiqueta: t('acciones.imprimir'), icono: Printer, onSelect: () => imprimirDocumento('cotizacion', f.id) },
      { id: 'rechazar', etiqueta: t('acciones.marcarRechazada'), icono: XCircle, separadorAntes: true, onSelect: () => setARechazar(f), oculta: !todas.has('rechazar') },
      { id: 'eliminar', etiqueta: t('acciones.eliminarBorrador'), icono: Trash2, destructiva: true, onSelect: () => setAEliminar(f), oculta: !todas.has('eliminar') },
    ];
  };

  const accionRapida = (f: FilaCotizacionListado) => {
    const r = accionRapidaFila(f, p);
    if (!r) return null;
    const textos = { convertir: t('acciones.convertir'), enviar: t('acciones.enviar'), renovar: t('acciones.duplicar') };
    const iconos = { convertir: FileCheck2, enviar: Send, renovar: Copy };
    const al = { convertir: () => setAConvertir(f), enviar: () => setAEnviar(f), renovar: () => void duplicar(f) };
    return <AccionRapida etiqueta={textos[r]} icono={iconos[r]} onClick={al[r]} deshabilitada={ocupado} />;
  };

  // ── Exportar ─────────────────────────────────────────────────────────
  const exportar = async () => {
    setExportando(true);
    try {
      const todas: FilaCotizacionListado[] = [];
      const base = new URLSearchParams(consulta);
      base.set('tamano', '200');
      for (let pagina = 1; pagina <= PAGINAS_MAX; pagina++) {
        base.set('pagina', String(pagina));
        const r = await CotizacionesService.listado(base);
        todas.push(...r.filas);
        if (todas.length >= r.total || r.filas.length === 0) break;
      }
      const csv = aCsv([
        [t('columnas.numero'), t('columnas.cliente'), t('columnas.documento'), t('columnas.emision'), t('columnas.validaHasta'), t('columnas.moneda'), t('columnas.total'), t('columnas.estado'), t('columnas.vendedor'), t('columnas.oportunidad')],
        ...todas.map((f) => [
          f.numero,
          f.cliente ?? '',
          f.cliente_doc ?? '',
          formatPlain(f.emision),
          f.valida_hasta ? formatPlain(f.valida_hasta) : '',
          f.moneda,
          formatNumeroMoneda(f.total, moneda.paraDocumento(f.moneda)),
          t(`estados.${f.estado}`),
          f.vendedor ?? '',
          f.oportunidad ?? '',
        ]),
      ]);
      descargarCsv(`${t('listado.archivoExportacion')}_${hoy}.csv`, csv);
    } catch {
      toastError(t('listado.exportarError'));
    } finally {
      setExportando(false);
    }
  };

  // ── Filtros ──────────────────────────────────────────────────────────
  const buscarClientes = useCallback(async (texto: string, _senal: AbortSignal, _filtros: readonly string[], desde: number) => {
    const r = await listarClientes({ organizationId: getOrganizationId(), branchId: null, criterios: { busqueda: texto }, orden: null, desde, tamano: 10 });
    const items: ClientePicker[] = r.filas.map((c) => ({ id: c.id, nombre: c.full_name ?? c.company_name ?? '', documento: c.identification_number, correo: c.email, telefono: c.phone }));
    return { items, total: r.total };
  }, []);

  const nombreClienteFiltro = !l.filtros.cliente
    ? null
    : clienteElegido?.id === l.filtros.cliente
      ? clienteElegido.nombre
      : filas.find((f) => f.cliente_id === l.filtros.cliente)?.cliente ?? null;
  const nombreVendedor = l.filtros.vendedor ? miembros.find((m) => m.user_id === l.filtros.vendedor)?.name ?? null : null;

  const chips: ChipFiltro[] = [
    periodoElegido ? { clave: 'desde', etiqueta: t('filtros.periodoChip', { rango: etiquetaRango(periodo, locale) }) } : null,
    l.filtros.estado ? { clave: 'estado', etiqueta: t('filtros.estadoChip', { estado: l.filtros.estado === 'abiertas' ? t('filtros.abiertas') : t(`estados.${l.filtros.estado}` as never) }) } : null,
    l.filtros.vigencia ? { clave: 'vigencia', etiqueta: t(`filtros.vigencia.${l.filtros.vigencia}` as never) } : null,
    l.filtros.cliente ? { clave: 'cliente', etiqueta: t('filtros.clienteChip', { nombre: nombreClienteFiltro ?? t('filtros.cliente') }) } : null,
    l.filtros.vendedor ? { clave: 'vendedor', etiqueta: t('filtros.vendedorChip', { nombre: nombreVendedor ?? t('filtros.vendedor') }) } : null,
    l.filtros.oportunidad ? { clave: 'oportunidad', etiqueta: t(`filtros.oportunidad.${l.filtros.oportunidad}` as never) } : null,
    l.filtros.monto_min ? { clave: 'monto_min', etiqueta: t('filtros.montoMinChip', { monto: fmtKpi(Number(l.filtros.monto_min)) }) } : null,
    l.filtros.monto_max ? { clave: 'monto_max', etiqueta: t('filtros.montoMaxChip', { monto: fmtKpi(Number(l.filtros.monto_max)) }) } : null,
  ].filter((c): c is ChipFiltro => c !== null);

  const quitarChip = (clave: string) => {
    if (clave === 'desde') l.actualizar({ filtros: Object.fromEntries(Object.entries(l.filtros).filter(([k]) => k !== 'desde' && k !== 'hasta')) });
    else l.setFiltro(clave, null);
  };

  /** Un KPI filtra (y quita el otro filtro de vigencia/estado que choque). */
  const filtrarKpi = (cambio: Record<string, string | null>) => {
    const resto = Object.fromEntries(Object.entries(l.filtros).filter(([k]) => k !== 'estado' && k !== 'vigencia'));
    for (const [k, v] of Object.entries(cambio)) if (v) resto[k] = v;
    l.actualizar({ filtros: resto });
  };

  // ── Columnas ─────────────────────────────────────────────────────────
  const celdaVigencia = (f: FilaCotizacionListado) => {
    if (!f.valida_hasta) return <span className="text-fg-muted">—</span>;
    const v = vigenciaDe(f);
    const clase = v.tipo === 'vencio' ? 'text-danger-text' : v.tipo === 'vence_pronto' || v.tipo === 'vence_hoy' ? 'text-warning-text' : 'text-fg';
    const nota = v.tipo === 'vencio' ? t('vigencia.vencio', { dias: v.dias }) : v.tipo === 'vence_hoy' ? t('vigencia.venceHoy') : v.tipo === 'vence_pronto' ? t('vigencia.venceEn', { dias: v.dias }) : null;
    return (
      <span className="flex flex-col">
        <span className={`whitespace-nowrap tabular-nums ${clase}`}>{formatPlain(f.valida_hasta)}</span>
        {nota && <span className="text-xs text-fg-muted">{nota}</span>}
      </span>
    );
  };

  const badge = (f: FilaCotizacionListado) => <StatusBadge estado={estadoBadgeCotizacion(f.estado)} etiqueta={t(`estados.${f.estado}`)} />;

  const columnas: ColumnaTabla<FilaCotizacionListado>[] = [
    { id: 'numero', encabezado: t('columnas.numero'), ordenable: true, celda: (f) => <span className="whitespace-nowrap font-medium text-fg">{f.numero}</span> },
    {
      id: 'cliente',
      encabezado: t('columnas.cliente'),
      ordenable: true,
      celda: (f) => (
        <div className="flex min-w-0 max-w-[220px] flex-col">
          <span className="truncate text-fg">{f.cliente ?? t('detalle.sinCliente')}</span>
          {f.cliente_doc && <span className="truncate text-xs text-fg-muted">{f.cliente_doc}</span>}
        </div>
      ),
    },
    { id: 'emision', encabezado: t('columnas.emision'), ordenable: true, ocultarDebajo: 'lg', celda: (f) => <span className="whitespace-nowrap tabular-nums">{formatPlain(f.emision)}</span> },
    { id: 'vigencia', encabezado: t('columnas.validaHasta'), ordenable: true, ocultarDebajo: 'md', celda: celdaVigencia },
    { id: 'total', encabezado: t('columnas.total'), ordenable: true, variante: 'importe', celda: (f) => fmtFila(f, f.total) },
    { id: 'estado', encabezado: t('columnas.estado'), ordenable: true, alinear: 'centro', celda: badge },
    { id: 'vendedor', encabezado: t('columnas.vendedor'), ocultarDebajo: 'xl', celda: (f) => <span className="whitespace-nowrap text-fg-secondary">{f.vendedor ?? '—'}</span> },
    {
      id: 'oportunidad',
      encabezado: t('columnas.oportunidad'),
      ocultarDebajo: 'xl',
      celda: (f) =>
        f.oportunidad ? (
          <span className="inline-flex max-w-[160px] items-center truncate rounded-full border border-line-brand bg-brand-tint px-2 py-0.5 text-xs font-medium text-brand-deep">{f.oportunidad}</span>
        ) : null,
    },
  ];

  const estadoTabla =
    error === 'sin_permiso' ? 'sinPermiso' : cargando && !datos ? 'cargando' : error ? 'error' : filas.length === 0 ? (l.hayCriterios ? 'sinResultados' : 'vacio') : 'listo';

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={subtitulo}
        icono={Calculator}
        cargando={cargando}
        migas={[{ etiqueta: t('migas.finanzas'), href: '/app/finanzas' }, { etiqueta: t('migas.ventas') }, { etiqueta: t('titulo') }]}
        debajo={<BranchBadgeActiva />}
        acciones={
          <>
            <button type="button" onClick={() => void exportar()} disabled={exportando} className={clasesBoton({ variante: 'secundario' })}>
              <Download aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {exportando ? t('listado.exportando') : t('listado.exportar')}
            </button>
            {permisos.crear && (
              <Link href={`${RUTA_COTIZACIONES}/nuevo`} className={clasesBoton({ variante: 'primario' })}>
                <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('listado.nueva')}
              </Link>
            )}
          </>
        }
        movil={{
          subtitulo: nombreSucursal ?? undefined,
          accion: permisos.crear ? (
            <Link
              href={`${RUTA_COTIZACIONES}/nuevo`}
              aria-label={t('listado.nueva')}
              className="flex size-10 items-center justify-center rounded-lg text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Plus aria-hidden="true" className="size-5" strokeWidth={1.5} />
            </Link>
          ) : undefined,
        }}
      />

      <KpiStrip etiqueta={t('kpis.etiqueta')}>
        <StatCard
          etiqueta={t('kpis.abiertas')}
          cargando={!datos}
          valor={entero(kpi?.abiertas ?? 0)}
          detalle={t('kpis.abiertasDetalle', { valor: fmtKpi(kpi?.valor_abiertas ?? 0) })}
          onClick={() => filtrarKpi({ estado: 'abiertas' })}
        />
        <StatCard
          etiqueta={t('kpis.porVencer')}
          cargando={!datos}
          valor={entero(kpi?.por_vencer ?? 0)}
          tono={kpi && kpi.por_vencer > 0 ? 'advertencia' : 'neutro'}
          iconoDetalle={kpi && kpi.por_vencer > 0 ? TriangleAlert : undefined}
          detalle={fmtKpi(kpi?.valor_por_vencer ?? 0)}
          onClick={() => filtrarKpi({ vigencia: 'por_vencer' })}
        />
        <StatCard
          etiqueta={t('kpis.vencidas')}
          cargando={!datos}
          valor={entero(kpi?.vencidas ?? 0)}
          tono={kpi && kpi.vencidas > 0 ? 'peligro' : 'neutro'}
          iconoDetalle={kpi && kpi.vencidas > 0 ? ArrowDown : undefined}
          detalle={kpi && kpi.vencidas > 0 ? t('kpis.vencidasDetalle') : t('kpis.sinVencidas')}
          onClick={() => filtrarKpi({ estado: 'expired' })}
        />
        <StatCard
          etiqueta={t('kpis.conversion', { periodo: etiquetaRango(periodo, locale) })}
          cargando={!datos}
          valor={tasa === null ? '—' : `${entero(tasa)} %`}
          tono={tasa !== null && tasa > 0 ? 'exito' : 'neutro'}
          iconoDetalle={tasa !== null && tasa > 0 ? ArrowUp : undefined}
          detalle={t('kpis.conversionDetalle', { convertidas: entero(kpi?.convertidas_periodo ?? 0), enviadas: entero(kpi?.enviadas_periodo ?? 0) })}
          onClick={() => filtrarKpi({ estado: 'converted' })}
        />
      </KpiStrip>

      <ListToolbar
        busqueda={
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row">
            <div className="min-w-0 flex-1">
              <SearchInput value={l.busqueda} onChange={l.setBusqueda} cargando={cargando} placeholder={t('listado.buscar')} etiqueta={t('listado.buscarEtiqueta')} />
            </div>
            <DateRangeButton
              valor={periodo}
              hoy={hoy}
              max={hoy}
              etiqueta={t('filtros.periodo')}
              onValorChange={(r) => l.actualizar({ filtros: { ...l.filtros, desde: r.desde, hasta: r.hasta } })}
              onLimpiar={periodoElegido ? () => quitarChip('desde') : undefined}
            />
          </div>
        }
        filtros={
          <FilterPanel conteo={chips.filter((c) => c.clave !== 'desde').length} onLimpiar={l.limpiarFiltros} textoVerResultados={t('filtros.verN', { count: total, n: entero(total) })}>
            <FormField etiqueta={t('filtros.estado')}>
              {(c) => (
                <Select value={l.filtros.estado ?? 'todos'} onValueChange={(v) => l.setFiltro('estado', v === 'todos' ? null : v)}>
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">{t('filtros.todos')}</SelectItem>
                    <SelectItem value="abiertas">{t('filtros.abiertas')}</SelectItem>
                    {ESTADOS.map((e) => (
                      <SelectItem key={e} value={e}>
                        {t(`estados.${e}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <FormField etiqueta={t('filtros.vigenciaEtiqueta')}>
              {(c) => (
                <SegmentedControl
                  aria-labelledby={c.idEtiqueta}
                  anchoCompleto
                  valor={l.filtros.vigencia ?? 'todas'}
                  onValorChange={(v) => l.setFiltro('vigencia', v === 'todas' ? null : v)}
                  opciones={[
                    { valor: 'todas', etiqueta: t('filtros.todos') },
                    { valor: 'por_vencer', etiqueta: t('filtros.porVencerCorto') },
                    { valor: 'vencidas', etiqueta: t('filtros.vencidasCorto') },
                  ]}
                />
              )}
            </FormField>
            <CustomerPicker
              layout="campo"
              cliente={l.filtros.cliente ? (clienteElegido?.id === l.filtros.cliente ? clienteElegido : { id: l.filtros.cliente, nombre: nombreClienteFiltro ?? t('filtros.cliente') }) : null}
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
            <FormField etiqueta={t('filtros.vendedor')}>
              {() => (
                <SearchSelect
                  options={miembros.map((m) => ({ value: m.user_id, label: m.name }))}
                  value={l.filtros.vendedor ?? ''}
                  onValueChange={(v) => l.setFiltro('vendedor', v && v !== '__todos__' ? v : null)}
                  placeholder={t('filtros.todos')}
                  searchPlaceholder={t('filtros.buscarVendedor')}
                  noneLabel={t('filtros.todos')}
                  noneValue="__todos__"
                />
              )}
            </FormField>
            <FormField etiqueta={t('filtros.oportunidadEtiqueta')}>
              {(c) => (
                <SegmentedControl
                  aria-labelledby={c.idEtiqueta}
                  anchoCompleto
                  valor={l.filtros.oportunidad ?? 'todas'}
                  onValorChange={(v) => l.setFiltro('oportunidad', v === 'todas' ? null : v)}
                  opciones={[
                    { valor: 'todas', etiqueta: t('filtros.todos') },
                    { valor: 'con', etiqueta: t('filtros.conOportunidad') },
                    { valor: 'sin', etiqueta: t('filtros.sinOportunidad') },
                  ]}
                />
              )}
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField etiqueta={t('filtros.montoMin')}>
                {(c) => (
                  <CampoNumero id={c.id} valor={numeroFiltro(l.filtros.monto_min)} onValorChange={(v) => l.setFiltro('monto_min', v === null ? null : String(v))} minimo={0} prefijo={simboloKpi} />
                )}
              </FormField>
              <FormField etiqueta={t('filtros.montoMax')}>
                {(c) => (
                  <CampoNumero id={c.id} valor={numeroFiltro(l.filtros.monto_max)} onValorChange={(v) => l.setFiltro('monto_max', v === null ? null : String(v))} minimo={0} prefijo={simboloKpi} />
                )}
              </FormField>
            </div>
          </FilterPanel>
        }
        chips={<FilterChips chips={chips} onQuitar={quitarChip} onLimpiarTodo={l.limpiarFiltros} textoLimpiarTodo={t('filtros.limpiar')} />}
      />

      <DataTable
        etiqueta={t('titulo')}
        columnas={columnas}
        filas={filas}
        obtenerId={(f) => f.id}
        estado={estadoTabla}
        orden={l.orden}
        onOrdenar={l.ordenarPor}
        onFilaClick={ir}
        etiquetaFila={(f) => f.numero}
        acciones={accionesDe}
        accionesRapidas={accionRapida}
        tarjetaMovil={(f) => (
          <ListCard
            icono={Calculator}
            titulo={f.numero}
            subtitulo={f.cliente ?? t('detalle.sinCliente')}
            meta={f.valida_hasta ? celdaVigencia(f) : undefined}
            valor={fmtFila(f, f.total)}
            estado={badge(f)}
            acciones={accionesDe(f)}
            onClick={() => ir(f)}
          />
        )}
        vacio={{
          titulo: t('listado.vacio.titulo'),
          descripcion: t('listado.vacio.descripcion'),
          icono: Calculator,
          accion: permisos.crear ? { etiqueta: t('listado.nueva'), href: `${RUTA_COTIZACIONES}/nuevo`, icono: Plus } : undefined,
        }}
        sinResultados={{ descripcion: t('listado.sinResultados') }}
        error={{ titulo: t('listado.errorCarga') }}
        sinPermiso={{ titulo: t('listado.sinPermiso'), descripcion: t('listado.sinPermisoDescripcion') }}
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
            opcionesTamano={TAMANOS_PAGINA_COTIZACIONES}
            sustantivo={sustantivo}
            cargando={cargando}
          />
        }
      />

      {aEnviar && (
        <EnviarDocumentoDialog
          abierto={!!aEnviar}
          onAbiertoChange={(v) => !v && setAEnviar(null)}
          endpoint={`/api/cotizaciones/${encodeURIComponent(aEnviar.id)}/enviar`}
          tipoClave="cotizacion"
          correo={aEnviar.cliente_correo}
          textos={{
            titulo: t('enviar.titulo', { numero: aEnviar.numero }),
            descripcion: t('enviar.descripcion'),
            enviado: t('enviar.enviada'),
            enviadoA: (destino) => t('enviar.enviadaA', { destino }),
            enviadoSinAdjunto: (destino) => t('enviar.enviadaSinAdjunto', { destino }),
          }}
          mensajeError={(codigo, servidor) => mensajeError(new ErrorPeticionCotizacion(codigo, 0, servidor ?? codigo))}
          onEnviado={recargar}
        />
      )}
      {aConvertir && (
        <ConvertirCotizacionDialog
          abierto={!!aConvertir}
          onAbiertoChange={(v) => !v && setAConvertir(null)}
          cotizacionId={aConvertir.id}
          onConvertida={(r) => router.push(`/app/finanzas/facturas-venta/${r.invoiceId}`)}
        />
      )}
      <Dialogo
        abierto={aEliminar !== null}
        onAbiertoChange={(v) => !v && !ocupado && setAEliminar(null)}
        titulo={t('eliminar.titulo', { numero: aEliminar?.numero ?? '' })}
        descripcion={t('eliminar.descripcion')}
        ancho={440}
        primario={{ etiqueta: t('eliminar.confirmar'), onClick: () => void eliminar(), destructiva: true, cargando: ocupado }}
      />
      <Dialogo
        abierto={aRechazar !== null}
        onAbiertoChange={(v) => !v && !ocupado && setARechazar(null)}
        titulo={t('rechazar.titulo', { numero: aRechazar?.numero ?? '' })}
        descripcion={t('rechazar.descripcion')}
        ancho={440}
        primario={{ etiqueta: t('rechazar.confirmar'), onClick: () => void rechazar(), destructiva: true, cargando: ocupado }}
      />
    </div>
  );
}
