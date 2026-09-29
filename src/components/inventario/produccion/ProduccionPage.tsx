'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle, ArrowDown, ArrowUp, Check, ChefHat, CircleCheck, Download, Factory, Play, Plus, RefreshCw } from 'lucide-react';
import {
  BranchBadgeActiva,
  BulkActionBar,
  CampoFecha,
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
  SearchInput,
  StatCard,
  useListadoServidor,
  valoresFiltro,
  type ChipFiltro,
  type ColumnaTabla,
  type EstadoTabla,
} from '@/components/kit';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { SIN_PERMISOS_INVENTARIO } from '@/lib/inventario/permisos';
import type { PermisosInventario } from '@/lib/inventario/nucleo/tipos';
import { filasACsv } from '@/lib/utils/csv';
import {
  ErrorProduccion,
  ESTADOS_PRODUCCION,
  productionOrderService,
  type FiltrosProduccion,
  type KpisProduccion,
  type OrdenProduccionFila,
  type ProductionOrderStatus,
} from '@/lib/services/productionOrderService';
import { DialogoNuevaOrden } from './DialogoNuevaOrden';
import { diferenciaPlaneado, filasCsvProduccion, ordenDeLaUrl, rutaOrdenProduccion, tandas } from './logica';
import { BadgeEstadoProduccion, useFormatoCantidad, useFormatoPorcentaje } from './piezas';
import { useAccionesProduccion } from './useAccionesProduccion';

const CAMPOS_ORDEN = ['fecha', 'numero'] as const;
const DIA_RE = /^\d{4}-\d{2}-\d{2}$/;
const LIMITE_EXPORTAR = 5000;

/**
 * Producción (Figma «Producción — órdenes, detalle y diálogos» 603:153432:
 * listo, cargando, vacío, error, sin permiso, sin sucursal, menú, filtros y
 * selección; móvil). Paginado en el servidor (`fn_produccion_listado`) con el
 * estado en la URL; la sucursal es la del encabezado. Ninguna acción escribe
 * tablas: confirmar, iniciar, completar, cancelar y eliminar son RPC
 * (`useAccionesProduccion`). `?orden=<id>` (enlace del kardex y de los
 * traslados) abre el detalle.
 */
export function ProduccionPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const t = useTranslations('inventarioProduccion.listado');
  const tc = useTranslations('inventarioProduccion');
  const entero = useFormatoEntero();
  const cantidad = useFormatoCantidad();
  const porcentaje = useFormatoPorcentaje();
  const { formatear: moneda } = useMonedaOrganizacion();
  const { formatDate, formatDateTime, getToday } = useFormatDate();
  const { branchFilter, branches, isLoading: cargandoSucursales } = useBranch();

  // Enlace heredado `/produccion?orden=12` (kardex, traslados, documentos del núcleo).
  const ordenUrl = ordenDeLaUrl(params?.get('orden'));
  useEffect(() => {
    if (ordenUrl) router.replace(rutaOrdenProduccion(ordenUrl));
  }, [ordenUrl, router]);

  const l = useListadoServidor({
    filtros: ['estado', 'desde', 'hasta', 'producto'],
    camposOrden: [...CAMPOS_ORDEN],
    ordenPorDefecto: { campo: 'fecha', direccion: 'desc' },
    tamanoPorDefecto: 25,
  });

  const [filas, setFilas] = useState<OrdenProduccionFila[]>([]);
  const [total, setTotal] = useState(0);
  const [kpis, setKpis] = useState<KpisProduccion | null>(null);
  const [permisos, setPermisos] = useState<PermisosInventario>(SIN_PERMISOS_INVENTARIO);
  const [cargando, setCargando] = useState(true);
  const [estadoError, setEstadoError] = useState<'error' | 'sinPermiso' | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [nueva, setNueva] = useState(false);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [exportando, setExportando] = useState(false);

  const recargar = useCallback(() => setRecarga((n) => n + 1), []);
  const acciones = useAccionesProduccion({ permisos, onCambio: recargar });

  const estados = valoresFiltro(l.filtros.estado).filter((e): e is ProductionOrderStatus => (ESTADOS_PRODUCCION as readonly string[]).includes(e));
  const desde = DIA_RE.test(l.filtros.desde ?? '') ? l.filtros.desde : undefined;
  const hasta = DIA_RE.test(l.filtros.hasta ?? '') ? l.filtros.hasta : undefined;
  const producto = /^\d{1,9}$/.test(l.filtros.producto ?? '') ? Number(l.filtros.producto) : undefined;
  const sinSucursal = !cargandoSucursales && branches.length === 0;

  const filtrosServidor = useMemo<FiltrosProduccion>(
    () => ({
      busqueda: l.busqueda || undefined,
      sucursal: branchFilter ?? undefined,
      estados: estados.length ? estados : undefined,
      producto,
      desde,
      hasta,
      orden: l.orden?.campo === 'numero' ? 'numero' : 'fecha',
      direccion: l.orden?.direccion ?? 'desc',
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [l.busqueda, branchFilter, l.filtros.estado, producto, desde, hasta, l.orden?.campo, l.orden?.direccion],
  );
  const clave = JSON.stringify({ ...filtrosServidor, d: l.rango.desde, n: l.tamano });

  useEffect(() => {
    if (sinSucursal || cargandoSucursales || ordenUrl) return;
    const control = new AbortController();
    setCargando(true);
    productionOrderService
      .listar(getOrganizationId(), { ...filtrosServidor, desde_fila: l.rango.desde, limite: l.tamano }, control.signal)
      .then((r) => {
        setFilas(r.filas);
        setTotal(r.total);
        setKpis(r.kpis);
        setPermisos(r.permisos);
        setEstadoError(null);
      })
      .catch((e: unknown) => {
        if (control.signal.aborted) return;
        if (e instanceof ErrorProduccion && e.sinPermiso) setEstadoError('sinPermiso');
        else {
          console.error('Error cargando órdenes de producción:', e);
          setEstadoError('error');
        }
      })
      .finally(() => {
        if (!control.signal.aborted) setCargando(false);
      });
    return () => control.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, recarga, sinSucursal, cargandoSucursales, ordenUrl]);

  const claveCriterios = JSON.stringify({ b: l.busqueda, f: l.filtros, s: branchFilter });
  useEffect(() => setSeleccion(new Set()), [claveCriterios]);

  const exportar = async (soloSeleccion: boolean) => {
    setExportando(true);
    try {
      const datos = soloSeleccion
        ? filas.filter((f) => seleccion.has(String(f.id)))
        : (await productionOrderService.listar(getOrganizationId(), { ...filtrosServidor, desde_fila: 0, limite: Math.min(Math.max(total, 1), LIMITE_EXPORTAR) })).filas;
      if (datos.length === 0) {
        toast({ title: t('exportar.sinDatos') });
        return;
      }
      const csv = filasACsv(
        [t('csv.orden'), t('csv.fecha'), t('csv.sucursal'), t('csv.producto'), t('csv.sku'), t('csv.receta'), t('csv.aProducir'), t('csv.producido'), t('csv.unidad'), t('csv.costo'), t('csv.estado'), t('csv.autor')],
        filasCsvProduccion(datos, { fecha: (v) => (v ? formatDateTime(v) : ''), estado: (e) => tc(`estados.${e}`) }),
      );
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `produccion_${getToday()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: t('exportar.listo', { count: datos.length }) });
    } catch (e) {
      console.error('Error exportando órdenes de producción:', e);
      toast({ variant: 'destructive', title: t('exportar.error') });
    } finally {
      setExportando(false);
    }
  };

  const chips: ChipFiltro[] = [
    ...(estados.length ? [{ clave: 'estado', etiqueta: t('chips.estado', { estados: estados.map((e) => tc(`estados.${e}`)).join(', ') }) }] : []),
    ...(desde ? [{ clave: 'desde', etiqueta: t('chips.desde', { dia: desde }) }] : []),
    ...(hasta ? [{ clave: 'hasta', etiqueta: t('chips.hasta', { dia: hasta }) }] : []),
    ...(producto ? [{ clave: 'producto', etiqueta: t('chips.producto') }] : []),
  ];

  const detalleCantidad = (f: OrdenProduccionFila) => {
    if (f.estado === 'completed') return t('producidasDe', { planeado: cantidad(f.a_producir) });
    if (f.primer_faltante) return t('falta', { cantidad: cantidad(f.primer_faltante.faltante, f.primer_faltante.unidad), nombre: f.primer_faltante.nombre });
    if (f.estado === 'cancelled') return '';
    return t('planeadas');
  };
  const cifraCosto = (f: OrdenProduccionFila) => {
    if (f.estado === 'cancelled') return { valor: '—', detalle: '' };
    if (f.estado === 'completed')
      return {
        valor: f.costo_real !== null ? moneda(f.costo_real) : '—',
        detalle: f.sin_consumos ? t('sinConsumos') : f.costo_real_unidad !== null ? t('realPorUnidad', { costo: moneda(f.costo_real_unidad), unidad: f.producto.unidad }) : '',
      };
    return { valor: f.costo_estimado !== null ? moneda(f.costo_estimado) : '—', detalle: f.costo_estimado !== null ? t('estimado') : '' };
  };

  const columnas: ColumnaTabla<OrdenProduccionFila>[] = [
    { id: 'numero', encabezado: t('columnas.orden'), ordenable: true, campoOrden: 'numero', variante: 'mono', celda: (f) => <span className="font-medium text-fg">{f.numero}</span> },
    {
      id: 'producto',
      encabezado: t('columnas.producto'),
      celda: (f) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-fg">{f.producto.nombre}</span>
          <span className="truncate text-xs text-fg-secondary">
            {t('recetaTandas', { version: f.receta.version, count: tandas(f.a_producir, f.receta.rinde), n: cantidad(tandas(f.a_producir, f.receta.rinde)) })}
          </span>
        </div>
      ),
    },
    { id: 'sucursal', encabezado: t('columnas.sucursal'), ocultarDebajo: 'xl', celda: (f) => <span className="truncate text-fg">{f.sucursal.nombre}</span> },
    {
      id: 'cantidad',
      encabezado: t('columnas.cantidad'),
      variante: 'importe',
      celda: (f) => (
        <div className="flex flex-col items-end">
          <span className="text-fg">{cantidad(f.estado === 'completed' ? f.producido : f.a_producir, f.producto.unidad)}</span>
          <span className={f.primer_faltante && f.estado !== 'completed' ? 'text-xs text-warning-text' : 'text-xs text-fg-secondary'}>{detalleCantidad(f)}</span>
        </div>
      ),
    },
    {
      id: 'costo',
      encabezado: t('columnas.costo'),
      variante: 'importe',
      ocultarDebajo: 'md',
      celda: (f) => {
        const c = cifraCosto(f);
        return (
          <div className="flex flex-col items-end">
            <span className="text-fg">{c.valor}</span>
            <span className="text-xs text-fg-secondary">{c.detalle}</span>
          </div>
        );
      },
    },
    { id: 'fecha', encabezado: t('columnas.fecha'), ordenable: true, campoOrden: 'fecha', ocultarDebajo: 'lg', celda: (f) => <span className="text-fg">{f.creado_en ? formatDate(f.creado_en) : '—'}</span> },
    { id: 'estado', encabezado: t('columnas.estado'), celda: (f) => <BadgeEstadoProduccion estado={f.estado} /> },
  ];

  const accionRapida = (f: OrdenProduccionFila) => {
    if (!acciones.puedeProducir) return null;
    const boton = (etiqueta: string, Icono: typeof Check, onClick: () => void) => (
      <Button variant="ghost" size="icon" className="size-8" aria-label={`${etiqueta} ${f.numero}`} title={etiqueta} onClick={(e) => { e.stopPropagation(); onClick(); }}>
        <Icono aria-hidden="true" className="size-4" strokeWidth={1.75} />
      </Button>
    );
    if (f.estado === 'draft') return boton(tc('acciones.confirmar.boton'), Check, () => acciones.confirmar(f));
    if (f.estado === 'confirmed') return boton(tc('acciones.iniciar.boton'), Play, () => acciones.iniciar(f));
    if (f.estado === 'in_progress') return boton(tc('acciones.completar'), CircleCheck, () => acciones.pedirCompletar(f));
    return null;
  };

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
  const sucursalNombre = branches.find((b) => b.id === branchFilter)?.name ?? t('todasSucursales');
  const subtitulo = kpis ? t('subtitulo', { sucursal: sucursalNombre, count: kpis.ordenes_mes, n: entero(kpis.ordenes_mes) }) : sucursalNombre;
  const diferencia = kpis ? diferenciaPlaneado(kpis.planeado_mes, kpis.producido_mes) : null;

  const cabecera = (
    <PageHeader
      titulo={t('titulo')}
      subtitulo={subtitulo}
      icono={Factory}
      cargando={cargando && !sinSucursal}
      migas={[{ etiqueta: tc('inventario'), href: '/app/inventario' }, { etiqueta: t('titulo') }]}
      debajo={
        <div className="flex flex-wrap items-center gap-2">
          <BranchBadgeActiva />
          <span className="text-xs text-fg-secondary">{t('lemaSucursal')}</span>
        </div>
      }
      acciones={
        sinSucursal ? undefined : (
          <>
            <Button variant="outline" size="icon" className="size-10" onClick={recargar} aria-label={t('actualizar')} title={t('actualizar')}>
              <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </Button>
            <Button variant="outline" className="h-10 gap-2" onClick={() => router.push('/app/inventario/recetas')}>
              <ChefHat aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('recetas')}
            </Button>
            <Button variant="outline" className="h-10 gap-2" onClick={() => exportar(false)} disabled={exportando || estadoError !== null}>
              <Download aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('exportar.boton')}
            </Button>
            {acciones.puedeProducir && (
              <Button className="h-10 gap-2" onClick={() => setNueva(true)}>
                <Plus aria-hidden="true" className="size-4" strokeWidth={1.75} />
                {t('nueva')}
              </Button>
            )}
          </>
        )
      }
      movil={{
        titulo: t('titulo'),
        subtitulo,
        accion:
          sinSucursal || !acciones.puedeProducir ? undefined : (
            <Button variant="ghost" size="icon" className="size-10" onClick={() => setNueva(true)} aria-label={t('nueva')}>
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

  const seleccionadas = filas.filter((f) => seleccion.has(String(f.id)));
  const borradoresSel = seleccionadas.filter((f) => f.estado === 'draft');

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      {cabecera}

      {estadoError !== 'sinPermiso' && (
        <KpiStrip etiqueta={t('kpis.etiqueta')} className="hidden sm:grid">
          <StatCard
            etiqueta={t('kpis.porConfirmar')}
            cargando={!kpis}
            valor={kpis ? entero(kpis.por_confirmar) : '—'}
            detalle={t('kpis.borradores')}
            onClick={() => l.setFiltro('estado', 'draft')}
          />
          <StatCard
            etiqueta={t('kpis.enProceso')}
            cargando={!kpis}
            valor={kpis ? entero(kpis.en_proceso) : '—'}
            detalle={kpis ? t('kpis.confirmadas', { count: kpis.confirmadas, n: entero(kpis.confirmadas) }) : undefined}
            onClick={() => l.setFiltro('estado', 'in_progress')}
          />
          <StatCard
            etiqueta={t('kpis.completadasMes')}
            cargando={!kpis}
            valor={kpis ? entero(kpis.completadas_mes) : '—'}
            tono="exito"
            tendencia={kpis && kpis.completadas_mes > 0 ? 'sube' : undefined}
            detalle={kpis ? (kpis.costo_real_mes !== null ? t('kpis.costoReal', { costo: moneda(kpis.costo_real_mes) }) : t('kpis.sinCostos')) : undefined}
            onClick={() => l.setFiltro('estado', 'completed')}
          />
          <StatCard
            etiqueta={t('kpis.diferencia')}
            cargando={!kpis}
            valor={diferencia === null ? '—' : porcentaje(diferencia)}
            tono={diferencia !== null && diferencia < 0 ? 'advertencia' : 'neutro'}
            iconoDetalle={diferencia !== null && diferencia < 0 ? ArrowDown : diferencia !== null && diferencia > 0 ? ArrowUp : undefined}
            detalle={diferencia === null ? t('kpis.sinCompletadas') : diferencia < 0 ? t('kpis.mermaMes') : t('kpis.sobreProduccion')}
          />
        </KpiStrip>
      )}

      <ListToolbar
        busqueda={<SearchInput value={l.busqueda} onChange={l.setBusqueda} cargando={cargando} placeholder={t('buscar.placeholder')} etiqueta={t('buscar.etiqueta')} />}
        filtros={
          <FilterPanel conteo={l.filtrosActivos} onLimpiar={l.limpiarFiltros} textoVerResultados={t('filtros.verN', { count: total, n: entero(total) })}>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium text-fg">{t('filtros.estado')}</legend>
              <div className="grid grid-cols-2 gap-2">
                {ESTADOS_PRODUCCION.map((e) => (
                  <label key={e} className="flex items-center gap-2 text-sm text-fg">
                    <Checkbox
                      checked={estados.includes(e)}
                      onCheckedChange={(v) => l.setFiltro('estado', v === true ? [...estados, e] : estados.filter((x) => x !== e))}
                      className="size-[18px] rounded"
                    />
                    {tc(`estados.${e}`)}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid grid-cols-2 gap-3">
              <FormField etiqueta={t('filtros.desde')}>
                {(c) => (
                  <CampoFecha id={c.id} aria-labelledby={c.idEtiqueta} valor={desde ?? ''} onValorChange={(d) => l.setFiltro('desde', d || null)} hoy={getToday()} max={hasta ?? getToday()} limpiable />
                )}
              </FormField>
              <FormField etiqueta={t('filtros.hasta')}>
                {(c) => (
                  <CampoFecha id={c.id} aria-labelledby={c.idEtiqueta} valor={hasta ?? ''} onValorChange={(d) => l.setFiltro('hasta', d || null)} hoy={getToday()} min={desde ?? null} max={getToday()} limpiable />
                )}
              </FormField>
            </div>
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
        onFilaClick={(f) => router.push(rutaOrdenProduccion(f.id))}
        etiquetaFila={(f) => t('etiquetaFila', { numero: f.numero, producto: f.producto.nombre })}
        acciones={acciones.accionesDe}
        accionesRapidas={accionRapida}
        tarjetaMovil={(f, ctx) => (
          <ListCard
            icono={Factory}
            titulo={`${f.numero} · ${f.producto.nombre}`}
            subtitulo={[t('recetaVersion', { version: f.receta.version }), f.sucursal.nombre].join(' · ')}
            meta={[f.creado_en ? formatDate(f.creado_en) : null, detalleCantidad(f)].filter(Boolean).join(' · ')}
            valor={
              <span className="flex flex-col items-end gap-0.5">
                <span className="text-sm font-medium text-fg">{cantidad(f.estado === 'completed' ? f.producido : f.a_producir, f.producto.unidad)}</span>
                <span className="text-xs text-fg-secondary">{cifraCosto(f).valor}</span>
              </span>
            }
            estado={<BadgeEstadoProduccion estado={f.estado} />}
            acciones={acciones.accionesDe(f)}
            onClick={() => router.push(rutaOrdenProduccion(f.id))}
            seleccionable={ctx.modoSeleccion}
            seleccionado={ctx.seleccionado}
            onSeleccionChange={ctx.alternar}
            onMantenerPulsado={() => ctx.alternar(true)}
          />
        )}
        vacio={{
          titulo: t('vacio.titulo'),
          descripcion: t('vacio.descripcion'),
          icono: Factory,
          accion: acciones.puedeProducir ? { etiqueta: t('nueva'), onClick: () => setNueva(true) } : undefined,
        }}
        sinResultados={{ descripcion: t('sinResultados') }}
        error={{ titulo: t('errorCarga') }}
        sinPermiso={{ titulo: t('sinPermiso.titulo'), descripcion: t('sinPermiso.descripcion') }}
        onLimpiarFiltros={l.limpiarTodo}
        onReintentar={recargar}
        termino={l.busqueda}
        pie={<Pagination pagina={l.pagina} tamano={l.tamano} total={total} onPaginaChange={l.setPagina} onTamanoChange={l.setTamano} sustantivo={sustantivo} cargando={cargando} />}
      />

      <BulkActionBar
        seleccionados={seleccion.size}
        total={total}
        sustantivo={sustantivo}
        acciones={[
          { id: 'exportar', etiqueta: t('masivas.exportar'), icono: Download, onClick: () => exportar(true), cargando: exportando },
          {
            id: 'confirmar',
            etiqueta: t('masivas.confirmar', { count: borradoresSel.length }),
            icono: Check,
            deshabilitada: !acciones.puedeProducir || borradoresSel.length === 0,
            motivo: !acciones.puedeProducir ? t('masivas.sinPermiso') : borradoresSel.length === 0 ? t('masivas.soloBorradores') : undefined,
            onClick: async () => {
              for (const f of borradoresSel) await acciones.confirmar(f);
              setSeleccion(new Set());
            },
          },
        ]}
        onLimpiar={() => setSeleccion(new Set())}
      />

      {kpis && kpis.en_proceso > 0 && filas.some((f) => f.faltantes > 0 && f.estado !== 'completed') && (
        <p role="status" className="flex items-center gap-2 text-xs text-warning-text">
          <AlertTriangle aria-hidden="true" className="size-4" strokeWidth={1.75} />
          {t('avisoFaltantes')}
        </p>
      )}

      <DialogoNuevaOrden
        abierto={nueva}
        onAbiertoChange={setNueva}
        onCreada={(id) => {
          toast({ title: t('creada') });
          router.push(rutaOrdenProduccion(id));
        }}
      />
      {acciones.dialogos}
    </div>
  );
}

export default ProduccionPage;
