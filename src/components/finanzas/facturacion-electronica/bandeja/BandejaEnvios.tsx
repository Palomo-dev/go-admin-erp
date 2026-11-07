'use client';

/**
 * Bandeja de envíos a la DIAN (`/app/finanzas/facturacion-electronica`).
 * Figma `07 Finanzas` › Documentos v2: listo `1018:91449`, servicio pendiente
 * `1018:92498`, cargando `1023:96714`, lote `1023:97325`, móvil `1019:90042`,
 * tableta `1023:97394`; capturas `73-documentos-bandeja-*`.
 *
 * Sustituye la página vieja (Card + ui/table + 85 `dark:`, KPIs contados
 * bajando todos los envíos al navegador, retenidos invisibles). Acciones que
 * se conservan, por las MISMAS rutas: filtrar por estado y buscar (ahora en el
 * servidor), paginar, ver el detalle, reintentar (`POST /api/factus/jobs`),
 * cancelar (`DELETE /api/factus/jobs`), descargar PDF y XML si se aceptó
 * (`/api/factus/download`, `/api/factus/support-document/download`), actualizar
 * e ir a la configuración del servicio. Nuevo: enviar retenidos con la fecha de
 * hoy (uno o en lote, `POST /api/factus/config` `liberar`), pestañas, filtros
 * por tipo, periodo y sucursal, exportar. Se quitó el enlace a la documentación
 * del proveedor (el cliente no ve el proveedor; diseño §7.2 FE-5).
 *
 * El flujo de emisión no cambia: esta pantalla solo lee y llama a las rutas
 * que ya existían.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Ban, Download, Eye, FileDown, Info, RefreshCw, Send, Settings, UserPen, Zap } from 'lucide-react';
import {
  AccionRapida,
  BulkActionBar,
  DataTable,
  DateRangeButton,
  Dialogo,
  EmptyState,
  FilterChips,
  FilterPanel,
  FormField,
  KpiCompacto,
  KpiStrip,
  ListCard,
  ListToolbar,
  PageHeader,
  Pagination,
  RowActionsMenu,
  SearchInput,
  StatCard,
  StatusBadge,
  TabBar,
  clasesBoton,
  etiquetaRangoLarga,
  inicioDeMes,
  useListadoServidor,
  useParametrosUrl,
  type AccionFila,
  type ChipFiltro,
  type ColumnaTabla,
} from '@/components/kit';
import { AvisoTonal } from '@/components/kit/AvisoTonal';
import { ConfirmDialog } from '@/components/kit/ConfirmDialog';
import { ICONO_DOCUMENTO } from '@/components/kit/documento/documentos';
import { useFormatoEntero, useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toastError, toastSuccess, toastWarning } from '@/components/ui/use-toast';
import { rutaSeccion } from '@/components/configuracion/config/configSectionsRegistry';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { usePermisosFinanzas } from '@/lib/finanzas/usePermisosFinanzas';
import { crearFormateadorMoneda, formatNumeroMoneda } from '@/lib/utils/moneda';
import { aCsv, descargarCsv } from '@/lib/finanzas/csv';
import {
  ESTADOS_ENVIO,
  MAX_LOTE,
  TIPOS_DOCUMENTO_FE,
  TONO_ESTADO,
  VISTAS,
  accionesEnvio,
  esEstadoEnvio,
  esTipoDocumento,
  estadoEnvio,
  proximoPaso,
  repartoLote,
  respuestaVisible,
  type FilaEnvio,
  type Vista,
} from '@/lib/finanzas/facturacionElectronica/bandejaLogica';
import {
  TIPO_CHIP,
  cancelarEnvio,
  descargarOficial,
  liberarRetenidos,
  pedirListado,
  pedirResumen,
  reintentarEnvio,
  rutaDocumento,
  rutaTercero,
  type RespuestaResumen,
} from './bandejaCliente';
import { DetalleEnvioPanel } from './DetalleEnvioPanel';

const TAMANOS = [25, 50, 100] as const;
const PAGINAS_MAX = 25;

export function BandejaEnvios() {
  const t = useTranslations('finanzasDocumentosR3.bandeja');
  const router = useRouter();
  const permisosFinanzas = usePermisosFinanzas();
  const permisos = useMemo(
    () => ({ crear: permisosFinanzas.crear, anular: permisosFinanzas.anular, aprobar: permisosFinanzas.aprobar }),
    [permisosFinanzas.crear, permisosFinanzas.anular, permisosFinanzas.aprobar],
  );
  const moneda = useMonedaOrganizacion();
  const entero = useFormatoEntero();
  const locale = useLocaleIntl();
  const { branches, branchFilter } = useBranch();
  const { formatDate, formatDateTime, formatTime, getToday } = useFormatDate();
  const hoy = getToday();
  const url = useParametrosUrl();
  const envioAbierto = url.leer('envio');

  const l = useListadoServidor({
    filtros: ['vista', 'estado', 'tipo', 'desde', 'hasta', 'sucursal'],
    tamanoPorDefecto: 25,
    tamanosPermitidos: TAMANOS,
  });
  const vista: Vista = (VISTAS as readonly string[]).includes(l.filtros.vista ?? '') ? (l.filtros.vista as Vista) : 'todos';

  const [resumen, setResumen] = useState<RespuestaResumen | null>(null);
  const [filas, setFilas] = useState<FilaEnvio[]>([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<'sin_permiso' | 'error' | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [conocidas, setConocidas] = useState<Map<string, FilaEnvio>>(new Map());
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [loteAbierto, setLoteAbierto] = useState(false);
  const [aCancelar, setACancelar] = useState<FilaEnvio[] | null>(null);
  const [exportando, setExportando] = useState(false);

  const servicioActivo = resumen?.servicio.estado === 'active';
  const sucursalFiltro = l.filtros.sucursal ?? (branchFilter ? String(branchFilter) : null);

  const consulta = useMemo(() => {
    const q = new URLSearchParams();
    if (l.busqueda) q.set('q', l.busqueda);
    q.set('vista', vista);
    for (const k of ['estado', 'tipo', 'desde', 'hasta'] as const) if (l.filtros[k]) q.set(k, l.filtros[k] as string);
    if (sucursalFiltro) q.set('sucursal', sucursalFiltro);
    q.set('pagina', String(l.pagina));
    q.set('tamano', String(l.tamano));
    return q.toString();
  }, [l.busqueda, l.filtros, l.pagina, l.tamano, vista, sucursalFiltro]);

  const recordar = useCallback((nuevas: readonly FilaEnvio[]) => {
    if (nuevas.length === 0) return;
    setConocidas((prev) => {
      const m = new Map(prev);
      for (const f of nuevas) m.set(f.id, f);
      return m;
    });
  }, []);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(null);
    Promise.all([pedirListado(consulta), pedirResumen()])
      .then(([listado, r]) => {
        if (cancelado) return;
        setFilas(listado.filas ?? []);
        setTotal(listado.total ?? 0);
        setResumen(r);
        recordar(listado.filas ?? []);
      })
      .catch((e: { status?: number }) => !cancelado && setError(e?.status === 403 || e?.status === 401 ? 'sin_permiso' : 'error'))
      .finally(() => !cancelado && setCargando(false));
    return () => {
      cancelado = true;
    };
  }, [consulta, recarga, recordar]);

  const claveCriterios = JSON.stringify({ b: l.busqueda, f: l.filtros, s: sucursalFiltro });
  useEffect(() => setSeleccion(new Set()), [claveCriterios]);

  const recargar = useCallback(() => setRecarga((n) => n + 1), []);
  const c = resumen?.conteos;

  // ── Textos ──────────────────────────────────────────────────────────────────
  const fmtFila = useCallback(
    (f: FilaEnvio) => {
      if (f.total === null) return '—';
      const fmt = crearFormateadorMoneda(moneda.paraDocumento(f.moneda));
      return f.tipo === 'credit_note' ? `−${fmt(Math.abs(f.total))}` : fmt(f.total);
    },
    [moneda],
  );
  const etiquetaEstado = (f: FilaEnvio) => t(`estados.${estadoEnvio(f)}`);
  const badge = (f: FilaEnvio) => {
    const e = estadoEnvio(f);
    return <StatusBadge estado={e} tono={TONO_ESTADO[e]} etiqueta={t(`estados.${e}`)} />;
  };
  const textoIntentos = (f: FilaEnvio) =>
    f.intentos === 0 ? t('intentos.ninguno') : t('intentos.de', { n: entero(f.intentos), max: entero(f.maxIntentos), count: f.intentos });
  const textoRespuesta = (f: FilaEnvio) => {
    const r = respuestaVisible(f);
    return r.texto ?? t(`respuesta.${r.clave}`);
  };
  const textoPaso = (f: FilaEnvio) => {
    const p = proximoPaso(estadoEnvio(f));
    if (p === 'reintento_programado') return f.proximoIntento ? t('paso.reintentoA', { hora: formatTime(f.proximoIntento) }) : t('paso.reintentoPronto');
    if (p === 'ninguno') return '—';
    return t(`paso.${p}`);
  };
  const subtitulo =
    resumen?.servicio.estado === 'active'
      ? t('subtitulo.activo', { fecha: resumen.servicio.activoDesde ? formatDate(resumen.servicio.activoDesde) : '—' })
      : resumen?.servicio.estado === 'suspended'
        ? t('subtitulo.suspendido')
        : t('subtitulo.pendiente');

  // ── Acciones ────────────────────────────────────────────────────────────────
  const abrirDetalle = (f: FilaEnvio) => url.fijar({ envio: f.id });

  const reintentar = async (lista: readonly FilaEnvio[]) => {
    setOcupado('reintentar');
    let fallidas = 0;
    for (const f of lista) {
      try {
        await reintentarEnvio(f.id);
      } catch {
        fallidas++;
      }
    }
    setOcupado(null);
    const ok = lista.length - fallidas;
    if (ok > 0) toastSuccess(t('toast.reintentados', { count: ok, n: entero(ok) }), t('toast.reintentadosAyuda'));
    if (fallidas > 0) toastError(t('toast.errorReintentar', { count: fallidas, n: entero(fallidas) }));
    setSeleccion(new Set());
    recargar();
  };

  const liberar = async (lista: readonly FilaEnvio[]) => {
    setOcupado('liberar');
    try {
      const r = await liberarRetenidos(lista.map((f) => f.id));
      if (r.liberados > 0) toastSuccess(t('toast.liberados', { count: r.liberados, n: entero(r.liberados) }));
      if (r.fallidos > 0) toastWarning(t('toast.liberadosFallidos', { count: r.fallidos, n: entero(r.fallidos) }));
      setLoteAbierto(false);
      setSeleccion(new Set());
    } catch (e) {
      toastError((e as { status?: number })?.status === 403 ? t('toast.sinPermiso') : t('toast.errorLiberar'));
    } finally {
      setOcupado(null);
      recargar();
    }
  };

  const cancelar = async (lista: readonly FilaEnvio[]) => {
    setOcupado('cancelar');
    let fallidas = 0;
    for (const f of lista) {
      try {
        await cancelarEnvio(f.id);
      } catch {
        fallidas++;
      }
    }
    setOcupado(null);
    setACancelar(null);
    const ok = lista.length - fallidas;
    if (ok > 0) toastSuccess(t('toast.cancelados', { count: ok, n: entero(ok) }));
    if (fallidas > 0) toastError(t('toast.errorCancelar', { count: fallidas, n: entero(fallidas) }));
    setSeleccion(new Set());
    recargar();
  };

  const descargar = async (f: FilaEnvio, tipo: 'pdf' | 'xml') => {
    try {
      await descargarOficial(f, tipo);
    } catch {
      toastError(t('toast.errorDescarga', { tipo: tipo.toUpperCase() }));
    }
  };

  const accionesDe = (f: FilaEnvio): AccionFila[] => {
    const a = accionesEnvio(f, permisos, servicioActivo);
    const doc = rutaDocumento(f);
    return [
      { id: 'detalle', etiqueta: t('acciones.verDetalle'), icono: Eye, onSelect: () => abrirDetalle(f) },
      { id: 'documento', etiqueta: t('acciones.verDocumento'), icono: Info, onSelect: () => doc && router.push(doc), oculta: !doc },
      { id: 'pdf', etiqueta: t('acciones.descargarPdf'), icono: FileDown, onSelect: () => void descargar(f, 'pdf'), oculta: !a.descargar },
      { id: 'xml', etiqueta: t('acciones.descargarXml'), icono: Download, onSelect: () => void descargar(f, 'xml'), oculta: !a.descargar },
      {
        id: 'enviar',
        etiqueta: t('acciones.enviarHoy'),
        icono: Send,
        separadorAntes: true,
        onSelect: () => {
          setSeleccion(new Set([f.id]));
          setLoteAbierto(true);
        },
        oculta: estadoEnvio(f) !== 'retenido',
        deshabilitada: !a.enviarHoy,
        motivo: a.motivoEnviarHoy ? t(`motivos.${a.motivoEnviarHoy}`) : undefined,
      },
      { id: 'reintentar', etiqueta: t('acciones.reintentar'), icono: RefreshCw, onSelect: () => void reintentar([f]), oculta: !a.reintentar },
      { id: 'cancelar', etiqueta: t('acciones.cancelar'), icono: Ban, destructiva: true, onSelect: () => setACancelar([f]), oculta: !a.cancelar },
    ];
  };

  const accionRapida = (f: FilaEnvio) => {
    const a = accionesEnvio(f, permisos, servicioActivo);
    const e = estadoEnvio(f);
    if (e === 'retenido')
      return (
        <AccionRapida
          icono={Send}
          etiqueta={t('rapidas.enviarHoy')}
          deshabilitada={!a.enviarHoy}
          motivo={a.motivoEnviarHoy ? t(`motivos.${a.motivoEnviarHoy}`) : undefined}
          onClick={() => {
            setSeleccion(new Set([f.id]));
            setLoteAbierto(true);
          }}
        />
      );
    if (e === 'rechazado') {
      const href = rutaTercero(f) ?? rutaDocumento(f);
      return href ? <AccionRapida icono={UserPen} etiqueta={t('rapidas.corregir')} href={href} /> : null;
    }
    if (a.reintentar) return <AccionRapida icono={RefreshCw} etiqueta={t('rapidas.reintentar')} onClick={() => void reintentar([f])} />;
    if (a.descargar)
      return (
        <AccionRapida
          icono={Download}
          etiqueta={t('rapidas.pdfXml')}
          onClick={() => {
            void descargar(f, 'pdf');
            void descargar(f, 'xml');
          }}
        />
      );
    return null;
  };

  // ── Lote ────────────────────────────────────────────────────────────────────
  const seleccionadas = useMemo(() => Array.from(seleccion, (id) => conocidas.get(id)).filter((f): f is FilaEnvio => !!f), [seleccion, conocidas]);
  const lote = useMemo(() => repartoLote(seleccionadas, permisos, servicioActivo), [seleccionadas, permisos, servicioActivo]);
  const sustantivo = { singular: t('sustantivo.singular'), plural: t('sustantivo.plural'), genero: 'masculino' as const };

  const traerTodas = async (): Promise<FilaEnvio[]> => {
    const todas: FilaEnvio[] = [];
    const base = new URLSearchParams(consulta);
    base.set('tamano', '200');
    for (let pagina = 1; pagina <= PAGINAS_MAX; pagina++) {
      base.set('pagina', String(pagina));
      const r = await pedirListado(base.toString());
      todas.push(...r.filas);
      if (todas.length >= r.total || r.filas.length === 0) break;
    }
    recordar(todas);
    return todas;
  };

  const exportar = async () => {
    setExportando(true);
    try {
      const todas = await traerTodas();
      const csv = aCsv([
        [t('columnas.documento'), t('columnas.tipo'), t('columnas.tercero'), t('columnas.total'), t('columnas.estado'), t('columnas.intentos'), t('columnas.respuesta'), t('columnas.fecha'), t('columnas.codigoUnico')],
        ...todas.map((f) => [
          f.numero ?? '',
          t(`tipos.${f.tipo}`),
          f.tercero ?? '',
          f.total === null ? '' : formatNumeroMoneda(f.tipo === 'credit_note' ? -Math.abs(f.total) : f.total, moneda.paraDocumento(f.moneda)),
          etiquetaEstado(f),
          String(f.intentos),
          textoRespuesta(f),
          formatDateTime(f.actualizado),
          f.codigoUnico ?? '',
        ]),
      ]);
      descargarCsv(`${t('archivoExportacion')}_${hoy}.csv`, csv);
    } catch {
      toastError(t('toast.errorExportar'));
    } finally {
      setExportando(false);
    }
  };

  // ── Filtros ─────────────────────────────────────────────────────────────────
  const periodo = l.filtros.desde || l.filtros.hasta ? { desde: l.filtros.desde ?? inicioDeMes(hoy), hasta: l.filtros.hasta ?? hoy } : null;
  const estadoFiltro = esEstadoEnvio(l.filtros.estado) ? l.filtros.estado : null;
  const tipoFiltro = esTipoDocumento(l.filtros.tipo) ? l.filtros.tipo : null;
  const chips: ChipFiltro[] = [
    ...(periodo ? [{ clave: 'periodo', etiqueta: t('filtros.chipPeriodo', { rango: etiquetaRangoLarga(periodo, locale) }) }] : []),
    ...(estadoFiltro ? [{ clave: 'estado', etiqueta: t('filtros.chipEstado', { estado: t(`estados.${estadoFiltro}`) }) }] : []),
    ...(tipoFiltro ? [{ clave: 'tipo', etiqueta: t('filtros.chipTipo', { tipo: t(`tipos.${tipoFiltro}`) }) }] : []),
    ...(l.filtros.sucursal
      ? [{ clave: 'sucursal', etiqueta: t('filtros.chipSucursal', { sucursal: branches.find((b) => String(b.id) === l.filtros.sucursal)?.name ?? '#' }) }]
      : []),
  ];
  const quitarChip = (clave: string) => {
    if (clave === 'periodo') l.actualizar({ filtros: Object.fromEntries(Object.entries(l.filtros).filter(([k]) => k !== 'desde' && k !== 'hasta')) });
    else l.setFiltro(clave, null);
  };
  const verRetenidos = () => l.actualizar({ filtros: { ...l.filtros, vista: 'atender', estado: 'retenido' } });
  const verRechazados = () => l.actualizar({ filtros: { ...l.filtros, vista: 'atender', estado: 'rechazado' } });
  const elegirVista = (v: Vista) => {
    const resto = Object.fromEntries(Object.entries(l.filtros).filter(([k]) => k !== 'estado' && k !== 'vista'));
    l.actualizar({ filtros: v === 'todos' ? resto : { ...resto, vista: v } });
  };

  // ── Estado de la pantalla ───────────────────────────────────────────────────
  const hayFiltros = !!(l.busqueda || chips.length);
  const servicioSinActivar = !!resumen && !servicioActivo;
  const mostrarVacioServicio = servicioSinActivar && vista === 'todos' && !hayFiltros && !error;
  const estadoTabla =
    error === 'sin_permiso' ? 'sinPermiso' : cargando && filas.length === 0 ? 'cargando' : error ? 'error' : filas.length === 0 ? (hayFiltros || vista !== 'todos' ? 'sinResultados' : 'vacio') : 'listo';

  const columnas: ColumnaTabla<FilaEnvio>[] = [
    {
      id: 'documento',
      encabezado: t('columnas.documento'),
      celda: (f) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-fg">{f.numero ?? t('sinNumero')}</span>
          <span className="truncate text-xs text-fg-muted">{t(`tipos.${f.tipo}`)}</span>
        </div>
      ),
    },
    {
      id: 'tercero',
      encabezado: t('columnas.tercero'),
      ocultarDebajo: 'md',
      celda: (f) => (
        <div className="flex min-w-0 max-w-[220px] flex-col">
          <span className="truncate text-fg">{f.tercero ?? '—'}</span>
          {f.terceroDoc && <span className="truncate text-xs text-fg-muted">{f.terceroDoc}</span>}
        </div>
      ),
    },
    { id: 'total', encabezado: t('columnas.total'), variante: 'importe', celda: (f) => fmtFila(f) },
    {
      id: 'estado',
      encabezado: t('columnas.estadoDian'),
      celda: (f) => (
        <div className="flex flex-col items-start gap-1">
          {badge(f)}
          <span className="text-xs text-fg-muted">{textoIntentos(f)}</span>
        </div>
      ),
    },
    {
      id: 'respuesta',
      encabezado: t('columnas.respuesta'),
      ocultarDebajo: 'lg',
      celda: (f) => (
        <div className="flex min-w-0 max-w-[260px] flex-col">
          <span className="truncate text-fg" title={textoRespuesta(f)}>
            {textoRespuesta(f)}
          </span>
          <span className="text-xs text-fg-muted">{formatDateTime(f.procesado ?? f.actualizado)}</span>
        </div>
      ),
    },
    { id: 'paso', encabezado: t('columnas.proximoPaso'), ocultarDebajo: 'xl', celda: (f) => <span className="text-fg-secondary">{textoPaso(f)}</span> },
  ];

  const kpis = (
    <>
      <div className="hidden sm:block">
        <KpiStrip etiqueta={t('kpis.etiqueta')}>
          <StatCard etiqueta={t('kpis.enCola')} cargando={!resumen} valor={entero(c?.enCola ?? 0)} detalle={t('kpis.enColaDetalle')} />
          <StatCard
            etiqueta={t('kpis.retenidos')}
            cargando={!resumen}
            valor={entero(c?.retenidos ?? 0)}
            tono={(c?.retenidos ?? 0) > 0 ? 'advertencia' : 'neutro'}
            detalle={(c?.retenidos ?? 0) > 0 ? (servicioActivo ? t('kpis.retenidosDetalle') : t('kpis.retenidosPendiente')) : undefined}
            onClick={(c?.retenidos ?? 0) > 0 ? verRetenidos : undefined}
          />
          <StatCard
            etiqueta={t('kpis.aceptadosMes', { mes: resumen ? new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(new Date(`${resumen.mes}T12:00:00Z`)) : '' })}
            cargando={!resumen}
            valor={entero(c?.aceptadosMes ?? 0)}
            tono={(c?.aceptadosMes ?? 0) > 0 ? 'exito' : 'neutro'}
            tendencia={resumen?.exito != null ? 'sube' : undefined}
            detalle={resumen?.exito != null ? t('kpis.exito', { pct: resumen.exito.toLocaleString(locale) }) : undefined}
          />
          <StatCard
            etiqueta={t('kpis.rechazados')}
            cargando={!resumen}
            valor={entero(c?.rechazados ?? 0)}
            tono={(c?.rechazados ?? 0) > 0 ? 'peligro' : 'neutro'}
            tendencia={(c?.rechazados ?? 0) > 0 ? 'baja' : undefined}
            detalle={(c?.rechazados ?? 0) > 0 ? t('kpis.rechazadosDetalle') : undefined}
            onClick={(c?.rechazados ?? 0) > 0 ? verRechazados : undefined}
          />
        </KpiStrip>
      </div>
      <KpiCompacto
        className="sm:hidden"
        etiqueta={t('kpis.etiqueta')}
        cargando={!resumen}
        cifras={[
          { etiqueta: t('kpis.enCola'), valor: entero(c?.enCola ?? 0) },
          { etiqueta: t('kpis.retenidos'), valor: entero(c?.retenidos ?? 0), tono: (c?.retenidos ?? 0) > 0 ? ('advertencia' as const) : undefined, onClick: verRetenidos },
          { etiqueta: t('kpis.rechazados'), valor: entero(c?.rechazados ?? 0), tono: (c?.rechazados ?? 0) > 0 ? ('peligro' as const) : undefined, onClick: verRechazados },
        ]}
      />
    </>
  );

  const menuCabecera: AccionFila[] = [
    { id: 'actualizar', etiqueta: t('actualizar'), icono: RefreshCw, onSelect: recargar },
    { id: 'exportar', etiqueta: t('exportar'), icono: Download, onSelect: () => void exportar(), deshabilitada: exportando, motivo: t('exportando') },
    { id: 'servicio', etiqueta: t('servicioYResoluciones'), icono: Settings, onSelect: () => router.push(rutaSeccion('facturacion.servicio')) },
  ];

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={subtitulo}
        icono={Zap}
        cargando={!resumen && cargando}
        migas={[{ etiqueta: t('migas.finanzas'), href: '/app/finanzas' }, { etiqueta: t('titulo') }]}
        acciones={
          <>
            <Link href={rutaSeccion('facturacion.servicio')} className={clasesBoton({ variante: 'secundario' })}>
              <Settings aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('servicioYResoluciones')}
            </Link>
            <RowActionsMenu orientacion="horizontal" tamano="md" titulo={t('titulo')} acciones={menuCabecera.filter((a) => a.id !== 'servicio')} />
          </>
        }
        movil={{
          subtitulo: resumen ? (servicioActivo ? t('subtitulo.movilActivo') : t('subtitulo.movilPendiente')) : undefined,
          accion: <RowActionsMenu orientacion="horizontal" tamano="md" titulo={t('titulo')} acciones={menuCabecera} />,
        }}
      />

      {servicioSinActivar && (
        <AvisoTonal
          tono={resumen?.servicio.estado === 'suspended' ? 'peligro' : 'informacion'}
          titulo={resumen?.servicio.estado === 'suspended' ? t('avisos.suspendidoTitulo') : t('avisos.pendienteTitulo')}
          descripcion={resumen?.servicio.estado === 'suspended' ? t('avisos.suspendidoDescripcion') : t('avisos.pendienteDescripcion')}
          accion={{ etiqueta: t('avisos.verPasos'), href: rutaSeccion('facturacion.servicio') }}
        />
      )}
      {servicioActivo && (c?.retenidos ?? 0) > 0 && (
        <AvisoTonal
          tono="advertencia"
          rol="alert"
          titulo={t('avisos.retenidosTitulo', { count: c?.retenidos ?? 0, n: entero(c?.retenidos ?? 0) })}
          descripcion={t('avisos.retenidosDescripcion')}
          accion={{ etiqueta: t('avisos.revisar'), onClick: verRetenidos }}
        />
      )}

      {kpis}

      {mostrarVacioServicio ? (
        <EmptyState
          icono={Zap}
          titulo={t('vacioServicio.titulo')}
          descripcion={
            (c?.retenidos ?? 0) > 0
              ? t('vacioServicio.descripcionRetenidos', { count: c?.retenidos ?? 0, n: entero(c?.retenidos ?? 0) })
              : t('vacioServicio.descripcion')
          }
          accion={(c?.retenidos ?? 0) > 0 ? { etiqueta: t('vacioServicio.verRetenidos'), onClick: verRetenidos } : { etiqueta: t('avisos.verPasos'), href: rutaSeccion('facturacion.servicio') }}
          accionSecundaria={(c?.retenidos ?? 0) > 0 ? { etiqueta: t('avisos.verPasos'), href: rutaSeccion('facturacion.servicio') } : undefined}
        />
      ) : (
        <>
          <TabBar<string>
            id="bandeja-dian"
            etiqueta={t('pestanas.etiqueta')}
            valor={vista}
            onValorChange={(v: string) => v !== 'radian' && elegirVista(v as Vista)}
            pestanas={[
              { valor: 'todos', etiqueta: t('pestanas.todos'), contador: c?.todos },
              { valor: 'atender', etiqueta: t('pestanas.atender'), contador: c?.atender },
              { valor: 'aceptados', etiqueta: t('pestanas.aceptados'), contador: c?.aceptados },
              { valor: 'radian', etiqueta: t('pestanas.radian'), deshabilitada: true },
            ]}
          />
          <p className="sr-only">{t('pestanas.radianMotivo')}</p>

          <ListToolbar
            busqueda={<SearchInput value={l.busqueda} onChange={l.setBusqueda} cargando={cargando} placeholder={t('buscar.placeholder')} etiqueta={t('buscar.etiqueta')} />}
            filtros={
              <FilterPanel conteo={chips.length} onLimpiar={l.limpiarFiltros} textoVerResultados={t('filtros.verN', { count: total, n: entero(total) })}>
                <FormField etiqueta={t('filtros.periodo')}>
                  {() => (
                    <DateRangeButton
                      valor={periodo ?? { desde: inicioDeMes(hoy), hasta: hoy }}
                      hoy={hoy}
                      max={hoy}
                      etiqueta={t('filtros.periodo')}
                      onValorChange={(r) => l.actualizar({ filtros: { ...l.filtros, desde: r.desde, hasta: r.hasta } })}
                      onLimpiar={periodo ? () => quitarChip('periodo') : undefined}
                    />
                  )}
                </FormField>
                <FormField etiqueta={t('filtros.tipo')}>
                  {(cp) => (
                    <Select value={tipoFiltro ?? 'todos'} onValueChange={(v) => l.setFiltro('tipo', v === 'todos' ? null : v)}>
                      <SelectTrigger id={cp.id} aria-labelledby={cp.idEtiqueta} className="h-10 border-line-strong bg-surface">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">{t('filtros.todos')}</SelectItem>
                        {TIPOS_DOCUMENTO_FE.map((x) => (
                          <SelectItem key={x} value={x}>
                            {t(`tipos.${x}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </FormField>
                <FormField etiqueta={t('filtros.estado')}>
                  {(cp) => (
                    <Select value={estadoFiltro ?? 'todos'} onValueChange={(v) => l.setFiltro('estado', v === 'todos' ? null : v)}>
                      <SelectTrigger id={cp.id} aria-labelledby={cp.idEtiqueta} className="h-10 border-line-strong bg-surface">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">{t('filtros.todos')}</SelectItem>
                        {ESTADOS_ENVIO.map((x) => (
                          <SelectItem key={x} value={x}>
                            {t(`estados.${x}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </FormField>
                {branches.length > 1 && (
                  <FormField etiqueta={t('filtros.sucursal')}>
                    {(cp) => (
                      <Select value={l.filtros.sucursal ?? 'todas'} onValueChange={(v) => l.setFiltro('sucursal', v === 'todas' ? null : v)}>
                        <SelectTrigger id={cp.id} aria-labelledby={cp.idEtiqueta} className="h-10 border-line-strong bg-surface">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todas">{t('filtros.todasSucursales')}</SelectItem>
                          {branches.map((b) => (
                            <SelectItem key={b.id} value={String(b.id)}>
                              {b.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </FormField>
                )}
              </FilterPanel>
            }
            chips={<FilterChips chips={chips} onQuitar={quitarChip} onLimpiarTodo={l.limpiarFiltros} textoLimpiarTodo={t('filtros.limpiar')} />}
          />

          <DataTable
            etiqueta={t('tabla')}
            columnas={columnas}
            filas={filas}
            obtenerId={(f) => f.id}
            estado={estadoTabla}
            seleccion={seleccion}
            onSeleccionChange={setSeleccion}
            onFilaClick={abrirDetalle}
            etiquetaFila={(f) => f.numero ?? t('sinNumero')}
            acciones={accionesDe}
            accionesRapidas={accionRapida}
            tonoFila={(f) => (estadoEnvio(f) === 'rechazado' ? 'peligro' : estadoEnvio(f) === 'retenido' ? 'advertencia' : undefined)}
            tarjetaMovil={(f, ctx) => (
              <ListCard
                icono={ICONO_DOCUMENTO[TIPO_CHIP[f.tipo]]}
                titulo={`${f.numero ?? t('sinNumero')} · ${etiquetaEstado(f)}`}
                subtitulo={f.tercero ?? t(`tipos.${f.tipo}`)}
                meta={<span className="line-clamp-1">{textoRespuesta(f)}</span>}
                valor={fmtFila(f)}
                estado={badge(f)}
                acciones={accionesDe(f)}
                onClick={() => abrirDetalle(f)}
                seleccionable={ctx.modoSeleccion}
                seleccionado={ctx.seleccionado}
                onSeleccionChange={ctx.alternar}
              />
            )}
            vacio={{ icono: Zap, titulo: t('vacio.titulo'), descripcion: t('vacio.descripcion') }}
            sinResultados={{ descripcion: vista === 'atender' && !hayFiltros ? t('vacio.nadaPorAtender') : t('sinResultados') }}
            error={{ titulo: t('errorCarga') }}
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
                opcionesTamano={TAMANOS}
                sustantivo={sustantivo}
                cargando={cargando}
              />
            }
          />
        </>
      )}

      <BulkActionBar
        seleccionados={seleccion.size}
        total={total}
        sustantivo={sustantivo}
        onLimpiar={() => setSeleccion(new Set())}
        acciones={[
          {
            id: 'liberar',
            etiqueta: t('lote.enviarHoy', { n: entero(lote.retenidos.length) }),
            icono: Send,
            onClick: () => setLoteAbierto(true),
            deshabilitada: lote.retenidos.length === 0 || lote.retenidos.length > MAX_LOTE,
            motivo: lote.retenidos.length > MAX_LOTE ? t('lote.maximo', { n: entero(MAX_LOTE) }) : !servicioActivo ? t('motivos.servicio_inactivo') : t('lote.sinRetenidos'),
          },
          {
            id: 'reintentar',
            etiqueta: t('lote.reintentar', { n: entero(lote.reintentables.length) }),
            icono: RefreshCw,
            onClick: () => void reintentar(lote.reintentables),
            deshabilitada: lote.reintentables.length === 0 || ocupado !== null,
            cargando: ocupado === 'reintentar',
            motivo: t('lote.sinReintentables'),
          },
        ]}
        accionesSecundarias={[
          {
            id: 'cancelar',
            etiqueta: t('lote.cancelar', { n: entero(lote.cancelables.length) }),
            icono: Ban,
            destructiva: true,
            onSelect: () => setACancelar(lote.cancelables),
            deshabilitada: lote.cancelables.length === 0,
            motivo: t('lote.sinCancelables'),
          },
        ]}
      />

      <Dialogo
        abierto={loteAbierto}
        onAbiertoChange={(v) => ocupado === null && setLoteAbierto(v)}
        titulo={t('liberar.titulo', { count: lote.retenidos.length, n: entero(lote.retenidos.length) })}
        descripcion={t('liberar.descripcion')}
        icono={Send}
        ancho={560}
        primario={{
          etiqueta: t('liberar.confirmar', { fecha: formatDate(hoy) }),
          onClick: () => void liberar(lote.retenidos),
          cargando: ocupado === 'liberar',
          deshabilitada: lote.retenidos.length === 0,
          motivo: t('lote.sinRetenidos'),
        }}
        textoCancelar={t('liberar.cancelar')}
      >
        <div className="flex flex-col gap-3">
          <AvisoTonal tono="advertencia" titulo={t('liberar.avisoTitulo', { fecha: formatDate(hoy) })} descripcion={t('liberar.avisoDescripcion')} />
          <ul className="flex max-h-56 flex-col divide-y divide-line overflow-y-auto rounded-lg border border-line">
            {lote.retenidos.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium text-fg">{f.numero ?? t('sinNumero')}</span>
                  <span className="truncate text-xs text-fg-muted">
                    {[f.tercero, f.fechaDocumento ? t('liberar.del', { fecha: formatDate(f.fechaDocumento) }) : null].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="tabular-nums text-fg">{fmtFila(f)}</span>
              </li>
            ))}
          </ul>
        </div>
      </Dialogo>

      <ConfirmDialog
        abierto={aCancelar !== null}
        onAbiertoChange={(v) => !v && ocupado === null && setACancelar(null)}
        titulo={t('cancelarEnvio.titulo', { count: aCancelar?.length ?? 0, n: entero(aCancelar?.length ?? 0) })}
        descripcion={t('cancelarEnvio.descripcion')}
        textoConfirmar={t('cancelarEnvio.confirmar')}
        textoCancelar={t('cancelarEnvio.volver')}
        tono="peligro"
        icono={Ban}
        cargando={ocupado === 'cancelar'}
        onConfirmar={() => void cancelar(aCancelar ?? [])}
      />

      {envioAbierto && (
        <DetalleEnvioPanel
          id={envioAbierto}
          onCerrar={() => url.fijar({ envio: null })}
          servicioActivo={servicioActivo}
          permisos={permisos}
          onEnviarHoy={(f) => {
            url.fijar({ envio: null });
            setSeleccion(new Set([f.id]));
            recordar([f]);
            setLoteAbierto(true);
          }}
          onCancelarEnvio={(f) => setACancelar([f])}
          onReintentar={(f) => void reintentar([f])}
          onDescargar={(f, tipo) => void descargar(f, tipo)}
          ocupado={ocupado}
        />
      )}
    </div>
  );
}
