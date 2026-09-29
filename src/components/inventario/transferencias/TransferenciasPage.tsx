'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle, ArrowLeftRight, Ban, Clock, Download, Plus, Printer, RefreshCw, Send } from 'lucide-react';
import {
  BranchBadgeActiva,
  BulkActionBar,
  CampoFecha,
  DataTable,
  Dialogo,
  EmptyState,
  FilterChips,
  FilterPanel,
  FormField,
  KpiStrip,
  ListCard,
  ListToolbar,
  PageHeader,
  Pagination,
  SearchInput,
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
import { getOrganizationName } from '@/lib/hooks/useOrganization';
import { filasACsv } from '@/lib/utils/csv';
import { ErrorPeticionTraslado, clienteTraslados } from '@/lib/inventario/transferencias/cliente';
import {
  ESTADOS_VISIBLES,
  PERMISOS_TRASLADOS_VACIOS,
  type EstadoVisibleTraslado,
  type FiltrosTraslados,
  type KpisTraslados,
  type PermisosTraslados,
  type TrasladoAtascado,
  type TrasladoFila,
} from '@/lib/inventario/transferencias/contrato';
import { filasCsvTraslados, nuevaClave, rutaNuevoTraslado, rutaTraslado, unidadesEnTransito } from '@/lib/inventario/transferencias/logica';
import { useImpresionGuias } from './ImpresionGuias';
import { BadgeEstadoTraslado, useCantidad, useEtiquetaEstadoTraslado, useMensajeErrorTraslado } from './piezas';
import { useAccionesTraslado, type TrasladoAccionable } from './useAccionesTraslado';

const CAMPOS_ORDEN = ['fecha', 'codigo'] as const;
const LIMITE_TODO = 5000;

function estadosDeUrl(valor: string | undefined): EstadoVisibleTraslado[] {
  if (!valor) return [];
  return valor.split(',').filter((v): v is EstadoVisibleTraslado => (ESTADOS_VISIBLES as readonly string[]).includes(v));
}

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
 * Traslados entre sucursales (Figma «Existencias — Traslados» 589:304083,
 * escritorio y móvil): KPI reales, aviso de los traslados en tránsito hace más
 * de 30 días, lista paginada en el servidor (`GET /api/inventario/transferencias`
 * → `fn_traslados_listado`) con el estado en la URL, menú ⋯ por estado,
 * selección con acciones masivas y guías imprimibles. La sucursal es la del
 * selector del encabezado (origen o destino).
 */
export function TransferenciasPage() {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations('inventarioTraslados.listado');
  const tc = useTranslations('inventarioTraslados.comun');
  const tm = useTranslations('inventarioTraslados.masivas');
  const etiquetaEstado = useEtiquetaEstadoTraslado();
  const cantidad = useCantidad();
  const mensajeError = useMensajeErrorTraslado();
  const { formatDate, formatDateTime, formatPlain, getToday } = useFormatDate();
  const { branchFilter, branches, isLoading: cargandoSucursales } = useBranch();
  const guias = useImpresionGuias();

  const l = useListadoServidor({
    filtros: ['estado', 'origen', 'destino', 'desde', 'hasta'],
    camposOrden: [...CAMPOS_ORDEN],
    ordenPorDefecto: { campo: 'fecha', direccion: 'desc' },
    tamanoPorDefecto: 25,
  });

  const [filas, setFilas] = useState<TrasladoFila[]>([]);
  const [total, setTotal] = useState(0);
  const [kpis, setKpis] = useState<KpisTraslados | null>(null);
  const [atascados, setAtascados] = useState<TrasladoAtascado[]>([]);
  const [permisos, setPermisos] = useState<PermisosTraslados>(PERMISOS_TRASLADOS_VACIOS);
  const [cargando, setCargando] = useState(true);
  const [estadoError, setEstadoError] = useState<'error' | 'sinPermiso' | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [seleccionadas, setSeleccionadas] = useState<Map<string, TrasladoFila>>(new Map());
  const [exportando, setExportando] = useState(false);
  const [masiva, setMasiva] = useState<'despachar' | 'cancelar' | null>(null);
  const [procesando, setProcesando] = useState(false);

  const recargar = useCallback(() => setRecarga((n) => n + 1), []);
  const acciones = useAccionesTraslado({ permisos, onCambio: recargar, onImprimir: (ids) => void guias.imprimir(ids) });

  const estados = estadosDeUrl(l.filtros.estado);
  const numero = (v: string | undefined) => (v && /^\d{1,9}$/.test(v) ? Number(v) : undefined);
  const fecha = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  const origen = numero(l.filtros.origen);
  const destino = numero(l.filtros.destino);
  const desde = fecha(l.filtros.desde);
  const hasta = fecha(l.filtros.hasta);
  const sinSucursal = !cargandoSucursales && branches.length === 0;

  const filtrosServidor = useMemo<FiltrosTraslados>(
    () => ({
      busqueda: l.busqueda || undefined,
      estados: estados.length ? estados : undefined,
      sucursal: branchFilter ?? undefined,
      origen,
      destino,
      desde,
      hasta,
      orden: l.orden?.campo === 'codigo' ? 'codigo' : 'fecha',
      direccion: l.orden?.direccion ?? 'desc',
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [l.busqueda, l.filtros.estado, branchFilter, origen, destino, desde, hasta, l.orden?.campo, l.orden?.direccion],
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
        setAtascados(r.atascados);
        setPermisos(r.permisos);
        setEstadoError(null);
      })
      .catch((e: unknown) => {
        if (control.signal.aborted) return;
        if (e instanceof ErrorPeticionTraslado && e.sinPermiso) setEstadoError('sinPermiso');
        else {
          console.error('Error cargando traslados:', e);
          setEstadoError('error');
        }
      })
      .finally(() => {
        if (!control.signal.aborted) setCargando(false);
      });
    return () => control.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, recarga, sinSucursal, cargandoSucursales]);

  const claveCriterios = JSON.stringify({ b: l.busqueda, f: l.filtros, s: branchFilter });
  useEffect(() => {
    setSeleccion(new Set());
    setSeleccionadas(new Map());
  }, [claveCriterios]);

  const cambiarSeleccion = (nueva: Set<string>) => {
    setSeleccion(nueva);
    setSeleccionadas((prev) => {
      const m = new Map<string, TrasladoFila>();
      nueva.forEach((id) => {
        const fila = filas.find((f) => String(f.id) === id) ?? prev.get(id);
        if (fila) m.set(id, fila);
      });
      return m;
    });
  };

  const todasLasFilas = async (): Promise<TrasladoFila[]> => {
    const r = await clienteTraslados.listar({ ...filtrosServidor, desde_fila: 0, limite: Math.min(Math.max(total, 1), LIMITE_TODO) });
    return r.filas;
  };

  const seleccionarTodos = async () => {
    try {
      const todas = await todasLasFilas();
      setSeleccion(new Set(todas.map((f) => String(f.id))));
      setSeleccionadas(new Map(todas.map((f) => [String(f.id), f])));
    } catch {
      toast({ variant: 'destructive', title: t('errorSeleccionarTodo') });
    }
  };

  const exportar = async (soloSeleccion: boolean) => {
    setExportando(true);
    try {
      const datos = soloSeleccion ? [...seleccionadas.values()] : await todasLasFilas();
      if (datos.length === 0) {
        toast({ title: t('exportar.sinDatos') });
        return;
      }
      const csv = filasACsv(
        [
          t('csv.codigo'),
          t('csv.estado'),
          t('csv.origen'),
          t('csv.destino'),
          t('csv.creado'),
          t('csv.autor'),
          t('csv.despachado'),
          t('csv.recibido'),
          t('csv.productos'),
          t('csv.enviadas'),
          t('csv.recibidas'),
          t('csv.faltantes'),
          t('csv.devueltas'),
          t('csv.valor'),
          t('csv.orden'),
          t('csv.notas'),
        ],
        filasCsvTraslados(datos, { estado: etiquetaEstado, fecha: (v) => (v ? formatDateTime(v) : '') }),
      );
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = `traslados_${getToday()}.csv`;
      document.body.appendChild(enlace);
      enlace.click();
      document.body.removeChild(enlace);
      URL.revokeObjectURL(url);
      toast({ title: t('exportar.listo', { count: datos.length }) });
    } catch (e) {
      console.error('Error exportando traslados:', e);
      toast({ variant: 'destructive', title: t('exportar.error') });
    } finally {
      setExportando(false);
    }
  };

  // ── Acciones masivas ────────────────────────────────────────────────────
  const listaSeleccion = [...seleccionadas.values()];
  const pendientes = listaSeleccion.filter((f) => f.estado === 'pending');
  const motivoDespachar = !permisos.trasladar ? tm('sinPermiso') : pendientes.length === 0 ? tm('soloPendientes') : undefined;

  const ejecutarMasiva = async () => {
    if (!masiva) return;
    setProcesando(true);
    let ok = 0;
    const fallos: string[] = [];
    for (const f of pendientes) {
      try {
        if (masiva === 'despachar') await clienteTraslados.despachar(f.id, { clave: nuevaClave('despachar') });
        else await clienteTraslados.cancelar(f.id, null);
        ok += 1;
      } catch (e) {
        fallos.push(`${f.code}: ${mensajeError(e)}`);
      }
    }
    setProcesando(false);
    setMasiva(null);
    toast({
      variant: fallos.length > 0 ? 'destructive' : undefined,
      title:
        masiva === 'despachar'
          ? tm('resultadoDespachar', { ok, fallidos: fallos.length })
          : tm('resultadoCancelar', { ok, fallidos: fallos.length }),
      description: fallos.length > 0 ? fallos.slice(0, 3).join(' · ') : undefined,
    });
    cambiarSeleccion(new Set());
    recargar();
  };

  // ── Chips ───────────────────────────────────────────────────────────────
  const nombreSucursal = (id: number) => branches.find((b) => b.id === id)?.name ?? `#${id}`;
  const chips: ChipFiltro[] = [
    ...(estados.length ? [{ clave: 'estado', etiqueta: t('chips.estado', { estados: estados.map(etiquetaEstado).join(', ') }) }] : []),
    ...(origen ? [{ clave: 'origen', etiqueta: t('chips.origen', { sucursal: nombreSucursal(origen) }) }] : []),
    ...(destino ? [{ clave: 'destino', etiqueta: t('chips.destino', { sucursal: nombreSucursal(destino) }) }] : []),
    ...(desde ? [{ clave: 'desde', etiqueta: t('chips.desde', { fecha: formatPlain(desde) }) }] : []),
    ...(hasta ? [{ clave: 'hasta', etiqueta: t('chips.hasta', { fecha: formatPlain(hasta) }) }] : []),
  ];

  // ── Celdas ──────────────────────────────────────────────────────────────
  const lineaEstado = (f: TrasladoFila): { texto: string; peligro?: boolean } => {
    if (f.estado === 'pending') return { texto: t('linea.porDespachar') };
    if (f.estado === 'in_transit') {
      if (f.atascado) return { texto: t('linea.sinRecibirDesde', { fecha: formatDate(f.despachado_en ?? f.creado_en) }), peligro: true };
      return { texto: f.despachado_en ? t('linea.despachado', { fecha: formatDateTime(f.despachado_en) }) : t('linea.enTransito') };
    }
    if (f.estado === 'received') {
      if (f.faltantes > 0) return { texto: t('linea.faltan', { n: cantidad(f.faltantes) }) };
      if (f.devueltas > 0) return { texto: t('linea.devueltas', { n: cantidad(f.devueltas) }) };
      return { texto: f.recibido_en ? t('linea.recibido', { fecha: formatDateTime(f.recibido_en) }) : t('linea.recibidoSinFecha') };
    }
    if (f.devueltas > 0) return { texto: t('linea.devueltoAlOrigen') };
    return { texto: f.despachado_en ? t('linea.cancelado') : t('linea.canceladoAntes') };
  };

  const celdaUnidades = (f: TrasladoFila) => {
    if (f.estado === 'pending' || (f.estado === 'cancelled' && !f.despachado_en && f.devueltas === 0)) {
      return <span className="text-fg">{t('unidades.porEnviar', { n: cantidad(f.enviadas) })}</span>;
    }
    return (
      <div className="flex flex-col">
        <span className="text-fg">{t('unidades.enviadas', { n: cantidad(f.enviadas) })}</span>
        <span className={f.faltantes > 0 ? 'text-xs font-medium text-danger-text' : 'text-xs text-fg-secondary'}>
          {t('unidades.recibidas', { n: cantidad(f.recibidas) })}
        </span>
      </div>
    );
  };

  const columnas: ColumnaTabla<TrasladoFila>[] = [
    {
      id: 'codigo',
      encabezado: t('columnas.traslado'),
      ordenable: true,
      campoOrden: 'codigo',
      celda: (f) => (
        <div className="flex min-w-0 flex-col">
          <span className="font-medium text-fg tabular-nums">{f.code}</span>
          <span className="truncate text-xs text-fg-secondary">
            {formatDateTime(f.creado_en)} · {f.autor ?? t('sinAutor')}
          </span>
        </div>
      ),
    },
    {
      id: 'ruta',
      encabezado: t('columnas.ruta'),
      celda: (f) => {
        const linea = lineaEstado(f);
        return (
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-fg">{tc('ruta', { origen: f.origen.nombre ?? '—', destino: f.destino.nombre ?? '—' })}</span>
            <span className={linea.peligro ? 'truncate text-xs text-danger-text' : 'truncate text-xs text-fg-secondary'}>{linea.texto}</span>
          </div>
        );
      },
    },
    { id: 'productos', encabezado: t('columnas.productos'), alinear: 'derecha', ocultarDebajo: 'md', celda: (f) => <span className="tabular-nums">{f.productos}</span> },
    { id: 'unidades', encabezado: t('columnas.unidades'), ocultarDebajo: 'sm', celda: celdaUnidades },
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

  const sustantivo = { singular: tc('sustantivo.singular'), plural: tc('sustantivo.plural') };
  const totalOrg = kpis?.total ?? total;
  const subtitulo = [getOrganizationName(), tc('nTraslados', { count: totalOrg, n: cantidad(totalOrg) }), t('lema')].filter(Boolean).join(' · ');

  const cabecera = (
    <PageHeader
      titulo={tc('titulo')}
      subtitulo={sinSucursal ? getOrganizationName() : subtitulo}
      icono={ArrowLeftRight}
      cargando={cargando && !sinSucursal}
      migas={[{ etiqueta: tc('inventario'), href: '/app/inventario' }, { etiqueta: tc('existencias') }]}
      debajo={<BranchBadgeActiva />}
      acciones={
        sinSucursal ? undefined : (
          <>
            <Button variant="outline" size="icon" className="size-10" onClick={recargar} aria-label={t('actualizar')} title={t('actualizar')}>
              <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </Button>
            <Button variant="outline" className="h-10 gap-2" onClick={() => exportar(false)} disabled={exportando || estadoError !== null}>
              <Download aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('exportar.boton')}
            </Button>
            {permisos.trasladar && (
              <Button className="h-10 gap-2" onClick={() => router.push(rutaNuevoTraslado({ origen: branchFilter }))}>
                <Plus aria-hidden="true" className="size-4" strokeWidth={1.75} />
                {t('nuevo')}
              </Button>
            )}
          </>
        )
      }
      movil={{
        titulo: tc('tituloCorto'),
        subtitulo: kpis ? t('subtituloMovil', { transito: kpis.en_transito, pendientes: kpis.por_despachar }) : undefined,
        accion:
          sinSucursal || !permisos.trasladar ? undefined : (
            <Button variant="ghost" size="icon" className="size-10" onClick={() => router.push(rutaNuevoTraslado({ origen: branchFilter }))} aria-label={t('nuevo')}>
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

  const primerAtascado = atascados[0] ?? null;

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      {cabecera}

      {estadoError !== 'sinPermiso' && (
        <KpiStrip etiqueta={t('kpis.etiqueta')} className="hidden sm:grid">
          <StatCard
            etiqueta={t('kpis.porDespachar')}
            cargando={!kpis}
            valor={kpis ? cantidad(kpis.por_despachar) : '—'}
            tono={kpis && kpis.por_despachar > 0 ? 'advertencia' : 'neutro'}
            iconoDetalle={kpis && kpis.por_despachar > 0 ? AlertTriangle : undefined}
            detalle={kpis ? (kpis.por_despachar > 0 ? t('kpis.porDespacharDetalle') : t('kpis.nadaPorDespachar')) : undefined}
            onClick={() => l.setFiltro('estado', 'pending')}
          />
          <StatCard
            etiqueta={t('kpis.enTransito')}
            cargando={!kpis}
            valor={kpis ? cantidad(kpis.en_transito) : '—'}
            detalle={kpis ? t('kpis.enTransitoDetalle', { n: cantidad(kpis.en_transito_unidades) }) : undefined}
            onClick={() => l.setFiltro('estado', 'in_transit')}
          />
          <StatCard
            etiqueta={t('kpis.recibidosMes')}
            cargando={!kpis}
            valor={kpis ? cantidad(kpis.recibidos_mes) : '—'}
            tono="exito"
            tendencia={kpis && kpis.recibidos_mes > 0 ? 'sube' : undefined}
            detalle={kpis ? t('kpis.recibidosMesDetalle') : undefined}
            onClick={() => l.setFiltro('estado', 'received')}
          />
          <StatCard
            etiqueta={t('kpis.conDiferencia')}
            cargando={!kpis}
            valor={kpis ? cantidad(kpis.con_diferencia) : '—'}
            tono={kpis && kpis.con_diferencia > 0 ? 'peligro' : 'neutro'}
            tendencia={kpis && kpis.con_diferencia > 0 ? 'baja' : undefined}
            detalle={kpis ? (kpis.con_diferencia > 0 ? t('kpis.conDiferenciaDetalle') : t('kpis.sinDiferencia')) : undefined}
            onClick={() => l.setFiltro('estado', 'con_diferencia')}
          />
        </KpiStrip>
      )}

      {primerAtascado && (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border border-line-danger bg-danger-subtle p-4 sm:flex-row sm:items-center">
          <AlertTriangle aria-hidden="true" className="size-5 shrink-0 text-danger-text" strokeWidth={1.75} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-danger-text">
              {t('aviso.titulo', { count: atascados.length, n: atascados.length, fecha: formatDate(primerAtascado.desde) })}
            </p>
            <p className="text-[13px] text-fg-secondary">
              {t('aviso.descripcion', {
                codigo: primerAtascado.code,
                n: cantidad(primerAtascado.unidades),
                origen: primerAtascado.origen ?? '—',
              })}
            </p>
          </div>
          <Button variant="outline" className="h-9 bg-surface" onClick={() => router.push(rutaTraslado(primerAtascado.id))}>
            {t('aviso.revisar', { codigo: primerAtascado.code })}
          </Button>
        </div>
      )}

      <ListToolbar
        busqueda={
          <SearchInput value={l.busqueda} onChange={l.setBusqueda} cargando={cargando} placeholder={t('buscar.placeholder')} etiqueta={t('buscar.etiqueta')} />
        }
        filtros={
          <FilterPanel conteo={l.filtrosActivos} onLimpiar={l.limpiarFiltros} textoVerResultados={t('filtros.verN', { count: total, n: cantidad(total) })}>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium text-fg">{t('filtros.estado')}</legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {ESTADOS_VISIBLES.map((e) => (
                  <label key={e} className="flex items-center gap-2 text-sm text-fg">
                    <Checkbox
                      checked={estados.includes(e)}
                      onCheckedChange={(v) => l.setFiltro('estado', v === true ? [...estados, e] : estados.filter((x) => x !== e))}
                      className="size-[18px] rounded"
                    />
                    {etiquetaEstado(e)}
                  </label>
                ))}
              </div>
            </fieldset>
            {(['origen', 'destino'] as const).map((campo) => (
              <FormField key={campo} etiqueta={t(`filtros.${campo}`)}>
                {(c) => (
                  <Select value={l.filtros[campo] ?? 'todas'} onValueChange={(v) => l.setFiltro(campo, v === 'todas' ? null : v)}>
                    <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">{t('filtros.todas')}</SelectItem>
                      {branches.map((b) => (
                        <SelectItem key={b.id} value={String(b.id)}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
            ))}
            <div className="grid grid-cols-2 gap-3">
              <FormField etiqueta={t('filtros.desde')}>
                {(c) => (
                  <CampoFecha id={c.id} aria-labelledby={c.idEtiqueta} valor={desde ?? ''} onValorChange={(v) => l.setFiltro('desde', v || null)} max={hasta} hoy={getToday()} />
                )}
              </FormField>
              <FormField etiqueta={t('filtros.hasta')}>
                {(c) => (
                  <CampoFecha id={c.id} aria-labelledby={c.idEtiqueta} valor={hasta ?? ''} onValorChange={(v) => l.setFiltro('hasta', v || null)} min={desde} hoy={getToday()} alinear="end" />
                )}
              </FormField>
            </div>
          </FilterPanel>
        }
        chips={<FilterChips chips={chips} onQuitar={(c) => l.setFiltro(c, null)} onLimpiarTodo={l.limpiarFiltros} />}
      />

      <DataTable
        etiqueta={tc('titulo')}
        columnas={columnas}
        filas={filas}
        obtenerId={(f) => String(f.id)}
        estado={estadoTabla}
        orden={l.orden}
        onOrdenar={l.ordenarPor}
        seleccion={seleccion}
        onSeleccionChange={cambiarSeleccion}
        onFilaClick={(f) => router.push(rutaTraslado(f.id))}
        etiquetaFila={(f) => t('etiquetaFila', { codigo: f.code, origen: f.origen.nombre ?? '', destino: f.destino.nombre ?? '' })}
        acciones={(f) => acciones.accionesFila(aAccionable(f))}
        tonoFila={(f) => (f.atascado ? 'peligro' : undefined)}
        tarjetaMovil={(f, ctx) => {
          const linea = lineaEstado(f);
          return (
            <ListCard
              icono={ArrowLeftRight}
              titulo={f.code}
              subtitulo={tc('ruta', { origen: f.origen.nombre ?? '—', destino: f.destino.nombre ?? '—' })}
              datos={[{ icono: linea.peligro ? AlertTriangle : Clock, texto: linea.texto }]}
              meta={
                f.estado === 'pending'
                  ? t('unidades.porEnviarMovil', { n: cantidad(f.enviadas), productos: f.productos })
                  : t('unidades.enviadasRecibidasMovil', { enviadas: cantidad(f.enviadas), recibidas: cantidad(f.recibidas), productos: f.productos })
              }
              estado={<BadgeEstadoTraslado estado={f.estado} conDiferencia={f.con_diferencia} />}
              acciones={acciones.accionesFila(aAccionable(f))}
              onClick={() => router.push(rutaTraslado(f.id))}
              seleccionable={ctx.modoSeleccion}
              seleccionado={ctx.seleccionado}
              onSeleccionChange={ctx.alternar}
              onMantenerPulsado={() => ctx.alternar(true)}
              className={f.atascado ? 'border-line-danger bg-danger-subtle' : undefined}
            />
          );
        }}
        vacio={{
          titulo: t('vacio.titulo'),
          descripcion: t('vacio.descripcion'),
          icono: ArrowLeftRight,
          accion: permisos.trasladar ? { etiqueta: t('nuevo'), icono: Plus, onClick: () => router.push(rutaNuevoTraslado({ origen: branchFilter })) } : undefined,
        }}
        sinResultados={{ descripcion: t('sinResultados') }}
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
            sustantivo={sustantivo}
            cargando={cargando}
          />
        }
      />

      <BulkActionBar
        seleccionados={seleccion.size}
        total={total}
        onSeleccionarTodos={seleccionarTodos}
        sustantivo={sustantivo}
        acciones={[
          { id: 'despachar', etiqueta: tm('despachar'), icono: Send, deshabilitada: !!motivoDespachar, motivo: motivoDespachar, onClick: () => setMasiva('despachar') },
          { id: 'imprimir', etiqueta: tm('imprimir'), icono: Printer, onClick: () => void guias.imprimir(listaSeleccion.map((f) => f.id)) },
          { id: 'exportar', etiqueta: tm('exportar'), icono: Download, onClick: () => exportar(true), cargando: exportando },
        ]}
        accionesSecundarias={
          permisos.trasladar && pendientes.length > 0
            ? [{ id: 'cancelar', etiqueta: tm('cancelar', { count: pendientes.length }), icono: Ban, destructiva: true, onSelect: () => setMasiva('cancelar') }]
            : []
        }
        onLimpiar={() => cambiarSeleccion(new Set())}
      />

      <Dialogo
        abierto={masiva !== null}
        onAbiertoChange={(v) => !procesando && !v && setMasiva(null)}
        titulo={masiva === 'cancelar' ? tm('cancelarTitulo', { count: pendientes.length }) : tm('despacharTitulo', { count: pendientes.length })}
        descripcion={masiva === 'cancelar' ? tm('cancelarDescripcion') : tm('despacharDescripcion')}
        icono={masiva === 'cancelar' ? Ban : Send}
        ancho={440}
        textoCancelar={tm('volver')}
        primario={{
          etiqueta: masiva === 'cancelar' ? tm('cancelarConfirmar') : tm('despacharConfirmar'),
          onClick: ejecutarMasiva,
          destructiva: masiva === 'cancelar',
          cargando: procesando,
        }}
      >
        {pendientes.length < listaSeleccion.length && (
          <p className="text-[13px] text-fg-secondary">{tm('soloPendientesNota', { count: listaSeleccion.length - pendientes.length })}</p>
        )}
      </Dialogo>

      {acciones.dialogos}
      {guias.nodo}

      <span className="sr-only" aria-live="polite">
        {cargando ? '' : tc('nTraslados', { count: total, n: cantidad(total) })}
      </span>
    </div>
  );
}

export default TransferenciasPage;
