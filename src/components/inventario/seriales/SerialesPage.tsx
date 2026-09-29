'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle, ArrowLeftRight, Download, Printer, RefreshCw, ScanBarcode, ShieldCheck } from 'lucide-react';
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
  StatCard,
  useListadoServidor,
  type AccionFila,
  type ChipFiltro,
  type ColumnaTabla,
  type EstadoTabla,
} from '@/components/kit';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { getOrganizationName } from '@/lib/hooks/useOrganization';
import { filasACsv } from '@/lib/utils/csv';
import { ErrorPeticionSeriales, clienteSeriales } from '@/lib/services/seriales/cliente';
import {
  PERMISOS_SERIALES_VACIOS,
  type FiltroGarantiaSerial,
  type FiltrosSeriales,
  type KpisSeriales,
  type PermisosSeriales,
  type SerialFila,
} from '@/lib/services/seriales/contrato';
import {
  ESTADOS_FILTRO_SERIAL,
  FILTROS_GARANTIA,
  dondeEsta,
  estadosDeUrl,
  filasCsvSeriales,
  numeroDocumento,
  rutaNuevoTraslado,
  rutaSerial,
  situacionGarantia,
} from './logica';
import { BadgeEstadoSerial, CeldaGarantia, EnlaceDocumento, useEtiquetaDocumento, useEtiquetaEstadoSerialB4 } from './piezas';
import { useAccionesSerial } from './useAccionesSerial';

const CAMPOS_ORDEN = ['serial', 'recibido', 'venta'] as const;
const LIMITE_TODO = 5000;

/**
 * Listado de seriales (Figma «Existencias — Seriales» 590:319444, escritorio y
 * móvil): una fila por unidad con su estado, dónde está, la venta y el cliente
 * enlazados y la garantía desde la venta. Paginado y filtrado en el servidor
 * (`GET /api/inventario/seriales` → `fn_seriales_listado`) con el estado en la
 * URL; la sucursal es la del selector del encabezado.
 */
export function SerialesPage() {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations('inventarioSeriales.listado');
  const tc = useTranslations('inventarioSeriales.comun');
  const etiquetaEstado = useEtiquetaEstadoSerialB4();
  const etiquetaDocumento = useEtiquetaDocumento();
  const entero = useFormatoEntero();
  const { formatDate, formatPlain, getToday } = useFormatDate();
  const { branchFilter, branches, isLoading: cargandoSucursales } = useBranch();

  const l = useListadoServidor({
    filtros: ['estado', 'garantia', 'producto'],
    camposOrden: [...CAMPOS_ORDEN],
    ordenPorDefecto: { campo: 'recibido', direccion: 'desc' },
    tamanoPorDefecto: 20,
  });

  const [filas, setFilas] = useState<SerialFila[]>([]);
  const [total, setTotal] = useState(0);
  const [kpis, setKpis] = useState<KpisSeriales | null>(null);
  const [permisos, setPermisos] = useState<PermisosSeriales>(PERMISOS_SERIALES_VACIOS);
  const [hoy, setHoy] = useState('');
  const [cargando, setCargando] = useState(true);
  const [estadoError, setEstadoError] = useState<'error' | 'sinPermiso' | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [seleccionadas, setSeleccionadas] = useState<Map<string, SerialFila>>(new Map());
  const [exportando, setExportando] = useState(false);

  const recargar = useCallback(() => setRecarga((n) => n + 1), []);
  const acciones = useAccionesSerial({ permisos, hoy: hoy || getToday(), onCambio: recargar });

  const estados = estadosDeUrl(l.filtros.estado);
  const garantia = (FILTROS_GARANTIA as readonly string[]).includes(l.filtros.garantia ?? '') ? (l.filtros.garantia as FiltroGarantiaSerial) : undefined;
  const producto = /^\d+$/.test(l.filtros.producto ?? '') ? Number(l.filtros.producto) : undefined;
  const sinSucursal = !cargandoSucursales && branches.length === 0;

  const filtrosServidor = useMemo<FiltrosSeriales>(
    () => ({
      busqueda: l.busqueda || undefined,
      estados: estados.length ? (estados as FiltrosSeriales['estados']) : undefined,
      garantia,
      producto,
      sucursal: branchFilter ?? undefined,
      orden: (CAMPOS_ORDEN as readonly string[]).includes(l.orden?.campo ?? '') ? (l.orden!.campo as FiltrosSeriales['orden']) : 'recibido',
      direccion: l.orden?.direccion ?? 'desc',
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [l.busqueda, l.filtros.estado, garantia, producto, branchFilter, l.orden?.campo, l.orden?.direccion],
  );
  const clave = JSON.stringify({ ...filtrosServidor, desde: l.rango.desde, limite: l.tamano });

  useEffect(() => {
    if (sinSucursal || cargandoSucursales) return;
    const control = new AbortController();
    setCargando(true);
    clienteSeriales
      .listar({ ...filtrosServidor, desde: l.rango.desde, limite: l.tamano }, control.signal)
      .then((r) => {
        setFilas(r.filas);
        setTotal(r.total);
        setKpis(r.kpis);
        setPermisos(r.permisos);
        setHoy(r.hoy);
        setEstadoError(null);
      })
      .catch((e: unknown) => {
        if (control.signal.aborted) return;
        if (e instanceof ErrorPeticionSeriales && e.sinPermiso) setEstadoError('sinPermiso');
        else {
          console.error('Error cargando seriales:', e);
          setEstadoError('error');
        }
      })
      .finally(() => {
        if (!control.signal.aborted) setCargando(false);
      });
    return () => control.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, recarga, sinSucursal, cargandoSucursales]);

  // Criterios nuevos parten de una selección vacía.
  const claveCriterios = JSON.stringify({ b: l.busqueda, f: l.filtros, s: branchFilter });
  useEffect(() => {
    setSeleccion(new Set());
    setSeleccionadas(new Map());
  }, [claveCriterios]);

  // Recuerda las filas seleccionadas aunque se cambie de página.
  const cambiarSeleccion = (nueva: Set<string>) => {
    setSeleccion(nueva);
    setSeleccionadas((prev) => {
      const m = new Map<string, SerialFila>();
      nueva.forEach((id) => {
        const fila = filas.find((f) => String(f.id) === id) ?? prev.get(id);
        if (fila) m.set(id, fila);
      });
      return m;
    });
  };

  const todasLasFilas = async (): Promise<SerialFila[]> => {
    const r = await clienteSeriales.listar({ ...filtrosServidor, desde: 0, limite: Math.min(Math.max(total, 1), LIMITE_TODO) });
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
          t('csv.serial'),
          t('csv.producto'),
          t('csv.sku'),
          t('csv.estado'),
          t('csv.sucursal'),
          t('csv.recibido'),
          t('csv.origen'),
          t('csv.proveedor'),
          t('csv.venta'),
          t('csv.fechaVenta'),
          t('csv.cliente'),
          t('csv.garantiaMeses'),
          t('csv.garantiaDesde'),
          t('csv.garantiaHasta'),
          t('csv.reclamo'),
        ],
        filasCsvSeriales(datos, { estado: etiquetaEstado, fechaInstante: (v) => formatDate(v), fechaPlana: (v) => formatPlain(v) }),
      );
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = `seriales_${getToday()}.csv`;
      document.body.appendChild(enlace);
      enlace.click();
      document.body.removeChild(enlace);
      URL.revokeObjectURL(url);
      toast({ title: t('exportar.listo', { count: datos.length }) });
    } catch (e) {
      console.error('Error exportando seriales:', e);
      toast({ variant: 'destructive', title: t('exportar.error') });
    } finally {
      setExportando(false);
    }
  };

  // ── Selección: trasladar, etiquetas, dañados ────────────────────────────
  const listaSeleccion = [...seleccionadas.values()];
  const enBodega = listaSeleccion.filter((f) => f.estado === 'in_stock');
  const unSoloProducto = new Set(listaSeleccion.map((f) => `${f.producto.id}:${f.sucursal?.id ?? ''}`)).size === 1;
  const motivoTrasladar = !permisos.trasladar
    ? t('masivas.sinPermiso')
    : enBodega.length !== listaSeleccion.length
      ? t('masivas.soloEnStock')
      : !unSoloProducto
        ? t('masivas.unProducto')
        : undefined;

  // ── Chips ───────────────────────────────────────────────────────────────
  const chips: ChipFiltro[] = [
    ...(estados.length ? [{ clave: 'estado', etiqueta: t('chips.estado', { estados: estados.map(etiquetaEstado).join(', ') }) }] : []),
    ...(garantia ? [{ clave: 'garantia', etiqueta: t(`chips.garantia.${garantia}`) }] : []),
    ...(producto ? [{ clave: 'producto', etiqueta: t('chips.producto', { nombre: filas[0]?.producto.nombre ?? `#${producto}` }) }] : []),
  ];

  // ── Columnas ────────────────────────────────────────────────────────────
  const columnas: ColumnaTabla<SerialFila>[] = [
    {
      id: 'serial',
      encabezado: t('columnas.serial'),
      ordenable: true,
      campoOrden: 'serial',
      celda: (f) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-fg tabular-nums">{f.serial}</span>
          <span className="truncate text-xs text-fg-secondary">{f.producto.nombre}</span>
        </div>
      ),
    },
    { id: 'estado', encabezado: t('columnas.estado'), celda: (f) => <BadgeEstadoSerial estado={f.estado} /> },
    {
      id: 'donde',
      encabezado: t('columnas.donde'),
      ocultarDebajo: 'md',
      celda: (f) => celdaDonde(f),
    },
    {
      id: 'venta',
      encabezado: t('columnas.venta'),
      ordenable: true,
      campoOrden: 'venta',
      ocultarDebajo: 'lg',
      celda: (f) => {
        const doc = f.venta?.documento ?? null;
        if (!doc) return <span className="text-fg-muted">—</span>;
        return (
          <div className="flex min-w-0 flex-col">
            <EnlaceDocumento documento={doc} />
            {f.vendedor && <span className="truncate text-xs text-fg-secondary">{t('por', { nombre: f.vendedor })}</span>}
          </div>
        );
      },
    },
    {
      id: 'cliente',
      encabezado: t('columnas.cliente'),
      ocultarDebajo: 'xl',
      celda: (f) => <span className="truncate text-fg">{f.cliente?.nombre ?? <span className="text-fg-muted">—</span>}</span>,
    },
    {
      id: 'garantia',
      encabezado: t('columnas.garantia'),
      celda: (f) => <CeldaGarantia situacion={situacionGarantia(f, hoy || getToday())} />,
    },
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
  const subtitulo = [getOrganizationName(), tc('nSeriales', { count: kpis?.total ?? total, n: entero(kpis?.total ?? total) }), t('subtituloLema')]
    .filter(Boolean)
    .join(' · ');

  const cabecera = (
    <PageHeader
      titulo={tc('titulo')}
      subtitulo={sinSucursal ? getOrganizationName() : subtitulo}
      icono={ScanBarcode}
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
          </>
        )
      }
      movil={{
        subtitulo: kpis ? t('subtituloMovil', { total: entero(kpis.total), stock: entero(kpis.en_stock) }) : undefined,
        accion: sinSucursal ? undefined : (
          <RowActionsMenu
            orientacion="horizontal"
            titulo={tc('titulo')}
            acciones={[
              { id: 'actualizar', etiqueta: t('actualizar'), icono: RefreshCw, onSelect: recargar },
              { id: 'exportar', etiqueta: t('exportar.boton'), icono: Download, onSelect: () => exportar(false) },
            ]}
          />
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

  const accionesFila = (f: SerialFila): AccionFila[] => acciones.accionesDe(f);

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      {cabecera}

      {estadoError !== 'sinPermiso' && (
        <KpiStrip etiqueta={t('kpis.etiqueta')} className="hidden sm:grid">
          <StatCard
            etiqueta={t('kpis.enStock')}
            cargando={!kpis}
            valor={kpis ? entero(kpis.en_stock) : '—'}
            detalle={kpis ? t('kpis.enSucursales', { count: kpis.sucursales_en_stock, n: entero(kpis.sucursales_en_stock) }) : undefined}
            onClick={() => l.setFiltro('estado', 'in_stock')}
          />
          <StatCard
            etiqueta={t('kpis.vendidos')}
            cargando={!kpis}
            valor={kpis ? entero(kpis.vendidos) : '—'}
            tono={kpis && (kpis.vendidos_con_venta < kpis.vendidos || kpis.vendidos_con_cliente < kpis.vendidos) ? 'advertencia' : 'neutro'}
            iconoDetalle={kpis && (kpis.vendidos_con_venta < kpis.vendidos || kpis.vendidos_con_cliente < kpis.vendidos) ? AlertTriangle : undefined}
            detalle={
              kpis
                ? kpis.vendidos_con_venta < kpis.vendidos || kpis.vendidos_con_cliente < kpis.vendidos
                  ? t('kpis.vendidosEnlazados', { venta: entero(kpis.vendidos_con_venta), cliente: entero(kpis.vendidos_con_cliente) })
                  : t('kpis.vendidosCompletos')
                : undefined
            }
            onClick={() => l.setFiltro('estado', 'sold')}
          />
          <StatCard
            etiqueta={t('kpis.garantiaVigente')}
            cargando={!kpis}
            valor={kpis ? entero(kpis.garantia_vigente) : '—'}
            tono={kpis && kpis.garantia_vence_30 > 0 ? 'advertencia' : 'exito'}
            tendencia={kpis && kpis.garantia_vence_30 === 0 ? 'sube' : undefined}
            detalle={
              kpis
                ? kpis.garantia_vence_30 > 0
                  ? t('kpis.vencen30', { count: kpis.garantia_vence_30, n: entero(kpis.garantia_vence_30) })
                  : t('kpis.ningunaVence30')
                : undefined
            }
            onClick={() => l.setFiltro('garantia', kpis && kpis.garantia_vence_30 > 0 ? 'por_vencer' : 'vigente')}
          />
          <StatCard
            etiqueta={t('kpis.enReclamo')}
            cargando={!kpis}
            valor={kpis ? entero(kpis.en_reclamo) : '—'}
            detalle={
              kpis
                ? kpis.reclamos_abiertos > 0
                  ? t('kpis.reclamosAbiertos', { count: kpis.reclamos_abiertos, n: entero(kpis.reclamos_abiertos) })
                  : t('kpis.sinReclamos')
                : undefined
            }
            href="/app/inventario/garantias"
          />
        </KpiStrip>
      )}

      {kpis && kpis.corriendo_en_bodega > 0 && garantia !== 'corriendo_en_bodega' && (
        <div role="status" className="flex flex-col gap-3 rounded-xl border border-line-warning bg-warning-subtle p-4 sm:flex-row sm:items-center">
          <AlertTriangle aria-hidden="true" className="size-5 shrink-0 text-warning-text" strokeWidth={1.75} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-warning-text">{t('aviso.titulo', { count: kpis.corriendo_en_bodega, n: entero(kpis.corriendo_en_bodega) })}</p>
            <p className="text-[13px] text-fg-secondary">{t('aviso.descripcion')}</p>
          </div>
          <Button variant="outline" className="h-9 bg-surface" onClick={() => l.setFiltro('garantia', 'corriendo_en_bodega')}>
            {t('aviso.verCuales')}
          </Button>
        </div>
      )}

      <ListToolbar
        busqueda={
          <SearchInput
            value={l.busqueda}
            onChange={l.setBusqueda}
            cargando={cargando}
            placeholder={t('buscar.placeholder')}
            etiqueta={t('buscar.etiqueta')}
            accesorio={<ScanBarcode aria-hidden="true" className="size-4 text-fg-muted" strokeWidth={1.5} />}
          />
        }
        filtros={
          <FilterPanel conteo={l.filtrosActivos} onLimpiar={l.limpiarFiltros} textoVerResultados={t('filtros.verN', { count: total, n: entero(total) })}>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium text-fg">{t('filtros.estado')}</legend>
              <div className="grid grid-cols-2 gap-2">
                {ESTADOS_FILTRO_SERIAL.map((e) => (
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
            <FormField etiqueta={t('filtros.garantia')}>
              {(c) => (
                <Select value={garantia ?? 'todas'} onValueChange={(v) => l.setFiltro('garantia', v === 'todas' ? null : v)}>
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">{t('filtros.garantiaTodas')}</SelectItem>
                    {FILTROS_GARANTIA.map((g) => (
                      <SelectItem key={g} value={g}>
                        {t(`chips.garantia.${g}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
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
        onFilaClick={(f) => router.push(rutaSerial(f.id))}
        etiquetaFila={(f) => t('etiquetaFila', { serial: f.serial, producto: f.producto.nombre })}
        acciones={accionesFila}
        tarjetaMovil={(f, ctx) => (
          <ListCard
            icono={ScanBarcode}
            titulo={f.serial}
            subtitulo={f.producto.nombre}
            meta={metaMovil(f)}
            estado={<BadgeEstadoSerial estado={f.estado} />}
            acciones={accionesFila(f)}
            onClick={() => router.push(rutaSerial(f.id))}
            seleccionable={ctx.modoSeleccion}
            seleccionado={ctx.seleccionado}
            onSeleccionChange={ctx.alternar}
            onMantenerPulsado={() => ctx.alternar(true)}
          />
        )}
        vacio={{ titulo: t('vacio.titulo'), descripcion: t('vacio.descripcion'), icono: ScanBarcode }}
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
          {
            id: 'trasladar',
            etiqueta: t('masivas.trasladar'),
            icono: ArrowLeftRight,
            deshabilitada: !!motivoTrasladar,
            motivo: motivoTrasladar,
            onClick: () => {
              const f = listaSeleccion[0];
              if (f) router.push(rutaNuevoTraslado(f.producto.id, f.sucursal?.id));
            },
          },
          {
            id: 'etiquetas',
            etiqueta: t('masivas.etiquetas'),
            icono: Printer,
            onClick: () => acciones.imprimirEtiquetas(listaSeleccion),
          },
          { id: 'exportar', etiqueta: t('masivas.exportar'), icono: Download, onClick: () => exportar(true), cargando: exportando },
        ]}
        accionesSecundarias={[
          ...((permisos.ajustar || permisos.editar_catalogo) && enBodega.length > 0
            ? [
                {
                  id: 'danados',
                  etiqueta: t('masivas.danados', { count: enBodega.length }),
                  icono: AlertTriangle,
                  destructiva: true,
                  onSelect: () => acciones.marcarDanados(enBodega),
                },
              ]
            : []),
          ...(listaSeleccion.length === 1 && acciones.puedeReclamar(listaSeleccion[0])
            ? [{ id: 'reclamo', etiqueta: t('masivas.reclamo'), icono: ShieldCheck, onSelect: () => acciones.abrirReclamo(listaSeleccion[0].id) }]
            : []),
        ]}
        onLimpiar={() => cambiarSeleccion(new Set())}
      />

      {acciones.dialogos}
    </div>
  );

  function celdaDonde(fila: SerialFila) {
    const d = dondeEsta(fila);
    let linea1: ReactNode;
    let linea2: ReactNode = null;
    switch (d.clave) {
      case 'conCliente':
        linea1 = t('donde.conCliente');
        linea2 = d.detalle === 'vendidoEn' ? t('donde.vendidoEn', { sucursal: d.sucursal ?? '' }) : t('donde.vendido');
        break;
      case 'conProveedor':
        linea1 = t('donde.conProveedor');
        linea2 = d.proveedor;
        break;
      case 'enTransito':
        linea1 = d.destino ? t('donde.haciaSucursal', { sucursal: d.destino }) : t('donde.enTransito');
        linea2 = d.documento ? t('donde.traslado', { numero: numeroDocumento(d.documento) }) : null;
        break;
      default:
        linea1 = d.sucursal ?? t('donde.sinSucursal');
        linea2 =
          d.detalle === 'revision'
            ? t('donde.revision')
            : d.detalle === 'recibido'
              ? [d.recibido ? t('donde.recibido', { fecha: formatDate(d.recibido) }) : null, d.documento ? numeroDocumento(d.documento) : null].filter(Boolean).join(' · ') || null
              : d.detalle === 'documento' && d.documento
                ? etiquetaDocumento(d.documento)
                : null;
    }
    return (
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-fg">{linea1}</span>
        {linea2 && <span className="truncate text-xs text-fg-secondary">{linea2}</span>}
      </div>
    );
  }

  function metaMovil(fila: SerialFila) {
    const partes: string[] = [];
    if (fila.estado === 'sold') {
      partes.push(t('movil.vendida'));
      if (fila.venta?.numero) partes.push(fila.venta.numero);
      if (fila.cliente?.nombre) partes.push(fila.cliente.nombre);
    } else if (fila.reclamo && ['pending', 'approved', 'in_process'].includes(fila.reclamo.estado)) {
      partes.push(t('movil.reclamo', { codigo: fila.reclamo.codigo ?? '' }));
      if (fila.cliente?.nombre) partes.push(fila.cliente.nombre);
    } else {
      const d = dondeEsta(fila);
      if (d.clave === 'enTransito') {
        partes.push(t('donde.enTransito'));
        if (d.documento) partes.push(`${numeroDocumento(d.documento)}${d.destino ? ` → ${d.destino}` : ''}`);
      } else {
        if (fila.sucursal?.nombre) partes.push(fila.sucursal.nombre);
        if (fila.origen) partes.push(numeroDocumento(fila.origen));
      }
    }
    return partes.join(' · ');
  }
}

export default SerialesPage;
