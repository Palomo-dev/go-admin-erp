'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle, ArrowLeftRight, CheckCircle2, Clock, Download, PackageCheck, Plus, Printer, RefreshCw, Send, Truck, Waypoints } from 'lucide-react';
import {
  BranchBadgeActiva,
  BulkActionBar,
  DataTable,
  EmptyState,
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
  useListadoServidor,
  type ChipFiltro,
  type ColumnaTabla,
  type EstadoTabla,
} from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { branchService } from '@/lib/services/branchService';
import { filasACsv } from '@/lib/utils/csv';
import { ErrorPeticionTraslado, clienteDistribucion, clienteTraslados } from '@/lib/inventario/transferencias/cliente';
import {
  ESTADOS_VISIBLES,
  PERIODOS,
  PERMISOS_TRASLADOS_VACIOS,
  type EstadoVisibleTraslado,
  type FiltrosTraslados,
  type KpisTraslados,
  type OrdenDistribuible,
  type Periodo,
  type PermisosTraslados,
  type TrasladoFila,
} from '@/lib/inventario/transferencias/contrato';
import { accionesDe, filasCsvTraslados, RUTA_TRASLADOS, rutaOrdenProduccion, rutaTraslado, unidadesEnTransito } from '@/lib/inventario/transferencias/logica';
import { useImpresionGuias } from '@/components/inventario/transferencias/ImpresionGuias';
import { BadgeEstadoTraslado, useCantidad, useEtiquetaEstadoTraslado } from '@/components/inventario/transferencias/piezas';
import { useAccionesTraslado, type TrasladoAccionable } from '@/components/inventario/transferencias/useAccionesTraslado';
import { AsistenteDistribucion } from './AsistenteDistribucion';

const LIMITE_TODO = 5000;

const aAccionable = (f: TrasladoFila): TrasladoAccionable => ({
  id: f.id,
  code: f.code,
  estado: f.estado,
  origen: f.origen,
  destino: f.destino,
  unidades: f.estado === 'pending' ? f.enviadas : unidadesEnTransito(f),
  orden_produccion: f.orden_produccion,
});

/**
 * Distribución (Figma «Distribución — envíos, asistente…» 606:159579): los
 * envíos que salen de la sucursal del encabezado (el origen) hacia las demás,
 * cada uno un traslado, con la orden de producción de la que salen. Mismo
 * backend que Traslados (`fn_traslados_listado` con `origen`), KPI reales,
 * filtros (destino, estado, periodo, diferencias, orden), acciones por estado
 * y el asistente de 3 pasos. La organización sale de la sesión (antes se leía
 * de localStorage).
 */
export function DistribucionPage() {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations('inventarioDistribucion');
  const tc = useTranslations('inventarioTraslados.comun');
  const etiquetaEstado = useEtiquetaEstadoTraslado();
  const cantidad = useCantidad();
  const { formatDate, formatDateTime, getToday } = useFormatDate();
  const { branchFilter, branches, isLoading: cargandoSucursales } = useBranch();
  const guias = useImpresionGuias();

  const l = useListadoServidor({
    filtros: ['destino', 'estado', 'periodo', 'diferencia', 'orden', 'produccion', 'cancelados'],
    camposOrden: ['fecha', 'codigo'],
    ordenPorDefecto: { campo: 'fecha', direccion: 'desc' },
    tamanoPorDefecto: 10,
  });

  const [filas, setFilas] = useState<TrasladoFila[]>([]);
  const [total, setTotal] = useState(0);
  const [kpis, setKpis] = useState<KpisTraslados | null>(null);
  const [permisos, setPermisos] = useState<PermisosTraslados>(PERMISOS_TRASLADOS_VACIOS);
  const [cargando, setCargando] = useState(true);
  const [estadoError, setEstadoError] = useState<'error' | 'sinPermiso' | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [asistente, setAsistente] = useState(false);
  const [todas, setTodas] = useState<{ id: number; nombre: string }[]>([]);
  const [ordenes, setOrdenes] = useState<OrdenDistribuible[]>([]);
  const [exportando, setExportando] = useState(false);

  const recargar = useCallback(() => setRecarga((n) => n + 1), []);
  const acciones = useAccionesTraslado({ permisos, onCambio: recargar, onImprimir: (ids) => void guias.imprimir(ids), distribucion: true });

  const origen = branchFilter;
  const origenNombre = branches.find((b) => b.id === origen)?.name ?? '';
  const sinSucursal = !cargandoSucursales && branches.length === 0;

  useEffect(() => {
    const org = getOrganizationId();
    if (!org) return;
    branchService
      .getBranches(org)
      .then((bs) => setTodas(bs.filter((b) => b.is_active !== false && b.id != null).map((b) => ({ id: Number(b.id), nombre: b.name }))))
      .catch(() => setTodas([]));
  }, []);

  useEffect(() => {
    if (!origen) {
      setOrdenes([]);
      return;
    }
    const control = new AbortController();
    clienteDistribucion
      .ordenes(origen, control.signal)
      .then(setOrdenes)
      .catch(() => undefined);
    return () => control.abort();
  }, [origen, recarga]);

  const destinosPosibles = useMemo(() => todas.filter((b) => b.id !== origen), [todas, origen]);

  const numero = (v: string | undefined) => (v && /^\d{1,9}$/.test(v) ? Number(v) : undefined);
  const destino = numero(l.filtros.destino);
  const estado = (ESTADOS_VISIBLES as readonly string[]).includes(l.filtros.estado ?? '') ? (l.filtros.estado as EstadoVisibleTraslado) : undefined;
  const periodo = (PERIODOS as readonly string[]).includes(l.filtros.periodo ?? '') ? (l.filtros.periodo as Periodo) : undefined;
  const conDiferencia = l.filtros.diferencia === 'con';
  const ordenFiltro = numero(l.filtros.orden);
  const soloProduccion = l.filtros.produccion === '1';
  const incluirCancelados = l.filtros.cancelados === '1';

  const filtrosServidor = useMemo<FiltrosTraslados>(
    () => ({
      busqueda: l.busqueda || undefined,
      origen: origen ?? undefined,
      destino,
      estados: conDiferencia ? ['con_diferencia'] : estado ? [estado] : undefined,
      periodo,
      orden_produccion: ordenFiltro,
      solo_produccion: soloProduccion || undefined,
      excluir_cancelados: incluirCancelados || estado === 'cancelled' ? undefined : true,
      orden: l.orden?.campo === 'codigo' ? 'codigo' : 'fecha',
      direccion: l.orden?.direccion ?? 'desc',
    }),
    [l.busqueda, origen, destino, conDiferencia, estado, periodo, ordenFiltro, soloProduccion, incluirCancelados, l.orden?.campo, l.orden?.direccion],
  );
  const clave = JSON.stringify({ ...filtrosServidor, d: l.rango.desde, n: l.tamano });

  useEffect(() => {
    if (sinSucursal || cargandoSucursales) return;
    const control = new AbortController();
    setCargando(true);
    clienteTraslados
      .listar({ ...filtrosServidor, desde_fila: l.rango.desde, limite: l.tamano }, control.signal)
      .then((r) => {
        setFilas(r.filas);
        setTotal(r.total);
        setKpis(r.kpis);
        setPermisos(r.permisos);
        setEstadoError(null);
      })
      .catch((e: unknown) => {
        if (control.signal.aborted) return;
        if (e instanceof ErrorPeticionTraslado && e.sinPermiso) setEstadoError('sinPermiso');
        else {
          console.error('Error cargando la distribución:', e);
          setEstadoError('error');
        }
      })
      .finally(() => {
        if (!control.signal.aborted) setCargando(false);
      });
    return () => control.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, recarga, sinSucursal, cargandoSucursales]);

  useEffect(() => setSeleccion(new Set()), [clave]);

  const exportar = async () => {
    setExportando(true);
    try {
      const r = await clienteTraslados.listar({ ...filtrosServidor, desde_fila: 0, limite: Math.min(Math.max(total, 1), LIMITE_TODO) });
      if (r.filas.length === 0) {
        toast({ title: t('exportar.sinDatos') });
        return;
      }
      const tl = (k: string) => t(`csv.${k}`);
      const csv = filasACsv(
        ['codigo', 'estado', 'origen', 'destino', 'creado', 'autor', 'despachado', 'recibido', 'productos', 'enviadas', 'recibidas', 'faltantes', 'devueltas', 'valor', 'orden', 'notas'].map(tl),
        filasCsvTraslados(r.filas, { estado: etiquetaEstado, fecha: (v) => (v ? formatDateTime(v) : '') }),
      );
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = `distribucion_${getToday()}.csv`;
      document.body.appendChild(enlace);
      enlace.click();
      document.body.removeChild(enlace);
      URL.revokeObjectURL(url);
    } catch {
      toast({ variant: 'destructive', title: t('exportar.error') });
    } finally {
      setExportando(false);
    }
  };

  // ── Chips ───────────────────────────────────────────────────────────────
  const chips: ChipFiltro[] = [
    ...(destino ? [{ clave: 'destino', etiqueta: t('chips.destino', { sucursal: todas.find((b) => b.id === destino)?.nombre ?? `#${destino}` }) }] : []),
    ...(estado ? [{ clave: 'estado', etiqueta: t('chips.estado', { estado: etiquetaEstado(estado) }) }] : []),
    ...(periodo ? [{ clave: 'periodo', etiqueta: t('chips.periodo', { periodo: t(`filtros.periodos.${periodo}`) }) }] : []),
    ...(conDiferencia ? [{ clave: 'diferencia', etiqueta: t('chips.diferencia') }] : []),
    ...(ordenFiltro ? [{ clave: 'orden', etiqueta: t('chips.orden', { numero: `OP-${ordenFiltro}` }) }] : []),
    ...(soloProduccion ? [{ clave: 'produccion', etiqueta: t('chips.produccion') }] : []),
    ...(incluirCancelados ? [{ clave: 'cancelados', etiqueta: t('chips.cancelados') }] : []),
  ];

  // ── Columnas ────────────────────────────────────────────────────────────
  const lineaRuta = (f: TrasladoFila): { texto: string; tono?: 'advertencia' } => {
    if (f.con_diferencia) return { texto: t('linea.llegaron', { recibidas: cantidad(f.recibidas), enviadas: cantidad(f.enviadas) }), tono: 'advertencia' };
    const base = t('linea.productos', { productos: tc('productos', { count: f.productos, n: f.productos }), unidades: tc('unidades', { count: f.enviadas, n: cantidad(f.enviadas) }) });
    if (f.estado === 'in_transit' && f.despachado_en) return { texto: `${base} · ${t('linea.salio', { fecha: formatDate(f.despachado_en) })}` };
    if (f.estado === 'pending' && f.primer_producto && f.productos === 1) return { texto: `${base} · ${f.primer_producto}` };
    return { texto: base };
  };

  const accionRapida = (f: TrasladoFila) => {
    const a = accionesDe(f.estado, permisos);
    if (a.despachar) {
      return (
        <Button variant="ghost" size="icon" className="size-8" onClick={() => acciones.despachar(f.id)} aria-label={t('acciones.marcarTransitoDe', { codigo: f.code })} title={t('acciones.marcarTransito')}>
          <Send aria-hidden="true" className="size-4" strokeWidth={1.5} />
        </Button>
      );
    }
    if (a.recibir) {
      return (
        <Button variant="ghost" size="icon" className="size-8" onClick={() => acciones.recibir(f.id)} aria-label={t('acciones.recibirDe', { codigo: f.code })} title={t('acciones.recibir')}>
          <PackageCheck aria-hidden="true" className="size-4" strokeWidth={1.5} />
        </Button>
      );
    }
    return null;
  };

  const columnas: ColumnaTabla<TrasladoFila>[] = [
    { id: 'codigo', encabezado: t('columnas.traslado'), ordenable: true, campoOrden: 'codigo', celda: (f) => <span className="font-medium tabular-nums text-fg">{f.code}</span> },
    {
      id: 'ruta',
      encabezado: t('columnas.ruta'),
      celda: (f) => {
        const linea = lineaRuta(f);
        return (
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-fg">{tc('ruta', { origen: f.origen.nombre ?? '—', destino: f.destino.nombre ?? '—' })}</span>
            <span className={linea.tono ? 'truncate text-xs text-warning-text' : 'truncate text-xs text-fg-secondary'}>{linea.texto}</span>
          </div>
        );
      },
    },
    {
      id: 'orden',
      encabezado: t('columnas.orden'),
      ocultarDebajo: 'md',
      celda: (f) =>
        f.orden_produccion ? (
          <Link
            href={rutaOrdenProduccion(f.orden_produccion.id)}
            onClick={(e) => e.stopPropagation()}
            className="rounded text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {f.orden_produccion.numero}
          </Link>
        ) : (
          <span className="text-fg-muted">—</span>
        ),
    },
    { id: 'fecha', encabezado: t('columnas.fecha'), ordenable: true, campoOrden: 'fecha', ocultarDebajo: 'sm', celda: (f) => <span className="text-fg">{formatDate(f.creado_en)}</span> },
    { id: 'estado', encabezado: t('columnas.estado'), celda: (f) => <BadgeEstadoTraslado estado={f.estado} conDiferencia={f.con_diferencia} /> },
  ];

  const estadoTabla: EstadoTabla = cargando
    ? 'cargando'
    : estadoError === 'sinPermiso'
      ? 'sinPermiso'
      : estadoError
        ? 'error'
        : filas.length === 0 && l.hayCriterios
          ? 'sinResultados'
          : 'listo';

  const sustantivo = { singular: t('sustantivo.singular'), plural: t('sustantivo.plural') };
  const motivoNueva = !origen ? t('elegirOrigen') : !permisos.trasladar ? t('sinPermisoCrear') : undefined;
  const subtitulo = origen
    ? t('subtitulo', { sucursal: origenNombre, count: total, n: cantidad(total) })
    : t('subtituloTodas', { count: total, n: cantidad(total) });

  const cabecera = (
    <PageHeader
      titulo={t('titulo')}
      subtitulo={sinSucursal ? undefined : subtitulo}
      icono={Waypoints}
      cargando={cargando && !sinSucursal}
      migas={[{ etiqueta: tc('inventario'), href: '/app/inventario' }, { etiqueta: t('titulo') }]}
      debajo={
        <div className="flex flex-wrap items-center gap-2">
          <BranchBadgeActiva />
          <span className="text-xs text-fg-secondary">{origen ? t('notaOrigen') : t('elegirOrigen')}</span>
        </div>
      }
      acciones={
        sinSucursal ? undefined : (
          <>
            <Button variant="outline" className="h-10 gap-2" onClick={() => router.push(RUTA_TRASLADOS)}>
              <ArrowLeftRight aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('traslados')}
            </Button>
            <Button className="h-10 gap-2" onClick={() => setAsistente(true)} disabled={!!motivoNueva} title={motivoNueva}>
              <Plus aria-hidden="true" className="size-4" strokeWidth={1.75} />
              {t('nueva')}
            </Button>
            <RowActionsMenu
              orientacion="horizontal"
              tamano="md"
              titulo={t('titulo')}
              acciones={[
                { id: 'actualizar', etiqueta: t('actualizar'), icono: RefreshCw, onSelect: recargar },
                { id: 'exportar', etiqueta: t('exportar.boton'), icono: Download, onSelect: () => void exportar(), deshabilitada: exportando },
              ]}
            />
          </>
        )
      }
      movil={{
        subtitulo: t('subtituloMovil', { count: total, n: cantidad(total) }),
        accion: motivoNueva ? undefined : (
          <Button variant="ghost" size="icon" className="size-10" onClick={() => setAsistente(true)} aria-label={t('nueva')}>
            <Plus aria-hidden="true" className="size-5" strokeWidth={1.75} />
          </Button>
        ),
      }}
    />
  );

  if (sinSucursal) {
    return (
      <div className="flex flex-col gap-4 lg:gap-5">
        {cabecera}
        <EmptyState variante="sinSucursal" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      {cabecera}

      {estadoError !== 'sinPermiso' && (
        <KpiStrip etiqueta={t('kpis.etiqueta')} className="hidden sm:grid">
          <StatCard
            etiqueta={t('kpis.pendientes')}
            icono={Clock}
            cargando={!kpis}
            valor={kpis ? cantidad(kpis.por_despachar) : '—'}
            detalle={kpis ? t('kpis.pendientesDetalle', { n: cantidad(kpis.por_despachar_unidades) }) : undefined}
            onClick={() => l.setFiltro('estado', 'pending')}
          />
          <StatCard
            etiqueta={t('kpis.enTransito')}
            icono={Truck}
            cargando={!kpis}
            valor={kpis ? cantidad(kpis.en_transito) : '—'}
            tono={kpis && kpis.en_transito > 0 ? 'advertencia' : 'neutro'}
            iconoDetalle={kpis && kpis.en_transito > 0 ? AlertTriangle : undefined}
            detalle={
              kpis
                ? kpis.en_transito_desde
                  ? t('kpis.enTransitoDetalle', { fecha: formatDate(kpis.en_transito_desde) })
                  : t('kpis.nadaEnTransito')
                : undefined
            }
            onClick={() => l.setFiltro('estado', 'in_transit')}
          />
          <StatCard
            etiqueta={t('kpis.recibidos')}
            icono={CheckCircle2}
            cargando={!kpis}
            valor={kpis ? cantidad(kpis.recibidos_mes) : '—'}
            tono="exito"
            tendencia={kpis && kpis.recibidos_mes > 0 ? 'sube' : undefined}
            detalle={kpis ? t('kpis.recibidosDetalle', { n: cantidad(kpis.recibidos_mes_unidades) }) : undefined}
            onClick={() => l.setFiltro('estado', 'received')}
          />
          <StatCard
            etiqueta={t('kpis.conDiferencia')}
            icono={AlertTriangle}
            cargando={!kpis}
            valor={kpis ? cantidad(kpis.con_diferencia) : '—'}
            tono={kpis && kpis.con_diferencia > 0 ? 'peligro' : 'neutro'}
            tendencia={kpis && kpis.con_diferencia > 0 ? 'baja' : undefined}
            detalle={
              kpis
                ? kpis.con_diferencia > 0
                  ? t('kpis.conDiferenciaDetalle', { recibidas: cantidad(kpis.con_diferencia_recibidas), enviadas: cantidad(kpis.con_diferencia_enviadas) })
                  : t('kpis.sinDiferencia')
                : undefined
            }
            onClick={() => l.setFiltro('diferencia', 'con')}
          />
        </KpiStrip>
      )}

      <ListToolbar
        busqueda={<SearchInput value={l.busqueda} onChange={l.setBusqueda} cargando={cargando} placeholder={t('buscar.placeholder')} etiqueta={t('buscar.etiqueta')} />}
        filtros={
          <FilterPanel conteo={l.filtrosActivos} onLimpiar={l.limpiarFiltros} nota={t('filtros.nota')} textoVerResultados={t('filtros.verN', { count: total, n: cantidad(total) })}>
            <FormField etiqueta={t('filtros.destino')}>
              {(c) => (
                <Select value={l.filtros.destino ?? 'todas'} onValueChange={(v) => l.setFiltro('destino', v === 'todas' ? null : v)}>
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">{t('filtros.todas')}</SelectItem>
                    {destinosPosibles.map((b) => (
                      <SelectItem key={b.id} value={String(b.id)}>
                        {b.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <FormField etiqueta={t('filtros.estado')}>
              {(c) => (
                <Select value={estado ?? 'todos'} onValueChange={(v) => l.setFiltro('estado', v === 'todos' ? null : v)}>
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">{t('filtros.todos')}</SelectItem>
                    {ESTADOS_VISIBLES.map((e) => (
                      <SelectItem key={e} value={e}>
                        {etiquetaEstado(e)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <FormField etiqueta={t('filtros.periodo')}>
              {(c) => (
                <SegmentedControl
                  aria-labelledby={c.idEtiqueta}
                  anchoCompleto
                  valor={periodo ?? 'todo'}
                  onValorChange={(v) => l.setFiltro('periodo', v === 'todo' ? null : v)}
                  opciones={[
                    { valor: 'hoy', etiqueta: t('filtros.periodos.hoy') },
                    { valor: '7d', etiqueta: t('filtros.periodos.7d') },
                    { valor: 'mes', etiqueta: t('filtros.periodos.mes') },
                    { valor: 'todo', etiqueta: t('filtros.periodos.todo') },
                  ]}
                />
              )}
            </FormField>
            <FormField etiqueta={t('filtros.diferencias')}>
              {(c) => (
                <SegmentedControl
                  aria-labelledby={c.idEtiqueta}
                  anchoCompleto
                  valor={conDiferencia ? 'con' : 'todos'}
                  onValorChange={(v) => l.setFiltro('diferencia', v === 'con' ? 'con' : null)}
                  opciones={[
                    { valor: 'todos', etiqueta: t('filtros.todos') },
                    { valor: 'con', etiqueta: t('filtros.conDiferencia') },
                  ]}
                />
              )}
            </FormField>
            <FormField etiqueta={t('filtros.orden')}>
              {(c) => (
                <Select value={l.filtros.orden ?? 'todas'} onValueChange={(v) => l.setFiltro('orden', v === 'todas' ? null : v)}>
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">{t('filtros.todas')}</SelectItem>
                    {ordenes.map((o) => (
                      <SelectItem key={o.id} value={String(o.id)}>
                        {`${o.numero} · ${o.producto.nombre}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <label className="flex items-center gap-2 text-sm text-fg">
              <Checkbox checked={soloProduccion} onCheckedChange={(v) => l.setFiltro('produccion', v === true ? '1' : null)} className="size-[18px] rounded" />
              {t('filtros.soloProduccion')}
            </label>
            <label className="flex items-center gap-2 text-sm text-fg">
              <Checkbox checked={incluirCancelados} onCheckedChange={(v) => l.setFiltro('cancelados', v === true ? '1' : null)} className="size-[18px] rounded" />
              {t('filtros.incluirCancelados')}
            </label>
          </FilterPanel>
        }
        chips={<FilterChips chips={chips} onQuitar={(c) => l.setFiltro(c, null)} onLimpiarTodo={l.limpiarFiltros} />}
      />

      <DataTable
        etiqueta={t('titulo')}
        columnas={columnas}
        filas={filas}
        obtenerId={(f) => String(f.id)}
        estado={estadoTabla}
        orden={l.orden}
        onOrdenar={l.ordenarPor}
        seleccion={seleccion}
        onSeleccionChange={setSeleccion}
        onFilaClick={(f) => router.push(rutaTraslado(f.id))}
        etiquetaFila={(f) => tc('etiquetaFila', { codigo: f.code, origen: f.origen.nombre ?? '', destino: f.destino.nombre ?? '' })}
        acciones={(f) => acciones.accionesFila(aAccionable(f))}
        accionesRapidas={accionRapida}
        tarjetaMovil={(f, ctx) => {
          const linea = lineaRuta(f);
          return (
            <ListCard
              icono={Waypoints}
              titulo={tc('codigoADestino', { codigo: f.code, destino: f.destino.nombre ?? '—' })}
              subtitulo={[linea.texto, f.orden_produccion?.numero].filter(Boolean).join(' · ')}
              meta={f.estado === 'in_transit' && f.despachado_en ? t('linea.salio', { fecha: formatDate(f.despachado_en) }) : formatDate(f.creado_en)}
              estado={<BadgeEstadoTraslado estado={f.estado} conDiferencia={f.con_diferencia} />}
              acciones={acciones.accionesFila(aAccionable(f))}
              onClick={() => router.push(rutaTraslado(f.id))}
              seleccionable={ctx.modoSeleccion}
              seleccionado={ctx.seleccionado}
              onSeleccionChange={ctx.alternar}
              onMantenerPulsado={() => ctx.alternar(true)}
            />
          );
        }}
        vacio={{
          titulo: t('vacio.titulo'),
          descripcion: t('vacio.descripcion'),
          icono: Waypoints,
          accion: motivoNueva ? undefined : { etiqueta: t('nueva'), icono: Plus, onClick: () => setAsistente(true) },
        }}
        sinResultados={{ descripcion: t('sinResultados') }}
        error={{ titulo: t('errorCarga') }}
        sinPermiso={{ titulo: t('sinPermiso.titulo'), descripcion: t('sinPermiso.descripcion') }}
        onLimpiarFiltros={l.limpiarTodo}
        onReintentar={recargar}
        termino={l.busqueda}
        pie={
          <Pagination pagina={l.pagina} tamano={l.tamano} total={total} onPaginaChange={l.setPagina} onTamanoChange={l.setTamano} sustantivo={sustantivo} cargando={cargando} />
        }
      />

      <BulkActionBar
        seleccionados={seleccion.size}
        sustantivo={sustantivo}
        acciones={[
          {
            id: 'imprimir',
            etiqueta: t('masivas.imprimir'),
            icono: Printer,
            onClick: () => void guias.imprimir([...seleccion].map(Number)),
          },
        ]}
        onLimpiar={() => setSeleccion(new Set())}
      />

      <AsistenteDistribucion
        abierto={asistente}
        onAbiertoChange={setAsistente}
        origen={origen ? { id: origen, nombre: origenNombre } : null}
        destinos={destinosPosibles}
        onCreado={recargar}
      />
      {acciones.dialogos}
      {guias.nodo}
    </div>
  );
}
