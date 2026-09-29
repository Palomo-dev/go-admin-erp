'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Download, Plus, RefreshCw, ScanBarcode, ShieldCheck } from 'lucide-react';
import {
  DataTable,
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
  type ChipFiltro,
  type ColumnaTabla,
  type EstadoTabla,
} from '@/components/kit';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { SegmentedControl } from '@/components/kit';
import { useToast } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { getOrganizationName } from '@/lib/hooks/useOrganization';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { filasACsv } from '@/lib/utils/csv';
import { ErrorPeticionSeriales, clienteGarantias } from '@/lib/services/seriales/cliente';
import {
  ESTADOS_RECLAMO,
  PERMISOS_SERIALES_VACIOS,
  type EstadoReclamo,
  type FiltrosGarantias,
  type KpisGarantias,
  type PermisosSeriales,
  type ReclamoFila,
} from '@/lib/services/seriales/contrato';
import { rutaReclamo } from '@/components/inventario/seriales/logica';
import { CreateClaimDialog } from './CreateClaimDialog';
import { useAccionesReclamo } from './DialogosReclamo';
import { BadgeEstadoReclamo } from './piezas';

const CAMPOS_ORDEN = ['fecha', 'codigo'] as const;
const ESTADOS_FILTRO: readonly EstadoReclamo[] = ['pending', 'approved', 'in_process', 'resolved', 'rejected'];

/**
 * Reclamos de garantía (Figma «Existencias — Garantías» 592:329722): ámbito
 * de organización (sin selector de sucursal), estado del reclamo y garantía
 * calculada desde la venta. Paginado y filtrado en el servidor
 * (`GET /api/inventario/garantias` → `fn_garantias_listado`).
 */
export function GarantiasPage() {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations('inventarioGarantias.listado');
  const tc = useTranslations('inventarioGarantias.comun');
  const te = useTranslations('inventarioGarantias.estados');
  const entero = useFormatoEntero();
  const { formatDateTime, formatPlain, getToday } = useFormatDate();
  const { formatear } = useMonedaOrganizacion();

  const l = useListadoServidor({
    filtros: ['estado', 'garantia'],
    camposOrden: [...CAMPOS_ORDEN],
    ordenPorDefecto: { campo: 'fecha', direccion: 'desc' },
    tamanoPorDefecto: 20,
  });

  const [filas, setFilas] = useState<ReclamoFila[]>([]);
  const [total, setTotal] = useState(0);
  const [kpis, setKpis] = useState<KpisGarantias | null>(null);
  const [permisos, setPermisos] = useState<PermisosSeriales>(PERMISOS_SERIALES_VACIOS);
  const [cargando, setCargando] = useState(true);
  const [estadoError, setEstadoError] = useState<'error' | 'sinPermiso' | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [nuevo, setNuevo] = useState(false);
  const [exportando, setExportando] = useState(false);

  const recargar = useCallback(() => setRecarga((n) => n + 1), []);
  const acciones = useAccionesReclamo({ permisos, onCambio: recargar });

  const estados = useMemo(
    () => (l.filtros.estado ?? '').split(',').filter((e): e is EstadoReclamo => (ESTADOS_RECLAMO as readonly string[]).includes(e)),
    [l.filtros.estado],
  );
  const garantia = l.filtros.garantia === 'vigente' || l.filtros.garantia === 'vencida' ? l.filtros.garantia : undefined;

  const filtrosServidor = useMemo<FiltrosGarantias>(
    () => ({
      busqueda: l.busqueda || undefined,
      estados: estados.length ? estados : undefined,
      garantia,
      orden: l.orden?.campo === 'codigo' ? 'codigo' : 'fecha',
      direccion: l.orden?.direccion ?? 'desc',
    }),
    [l.busqueda, estados, garantia, l.orden?.campo, l.orden?.direccion],
  );
  const clave = JSON.stringify({ ...filtrosServidor, desde: l.rango.desde, limite: l.tamano });

  useEffect(() => {
    const control = new AbortController();
    setCargando(true);
    clienteGarantias
      .listar({ ...filtrosServidor, desde: l.rango.desde, limite: l.tamano }, control.signal)
      .then((r) => {
        setFilas(r.filas);
        setTotal(r.total);
        setKpis(r.kpis);
        setPermisos(r.permisos);
        setEstadoError(null);
      })
      .catch((e: unknown) => {
        if (control.signal.aborted) return;
        if (e instanceof ErrorPeticionSeriales && e.sinPermiso) setEstadoError('sinPermiso');
        else {
          console.error('Error cargando garantías:', e);
          setEstadoError('error');
        }
      })
      .finally(() => {
        if (!control.signal.aborted) setCargando(false);
      });
    return () => control.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, recarga]);

  const exportar = async () => {
    setExportando(true);
    try {
      const r = await clienteGarantias.listar({ ...filtrosServidor, desde: 0, limite: Math.min(Math.max(total, 1), 5000) });
      if (r.filas.length === 0) {
        toast({ title: t('exportar.sinDatos') });
        return;
      }
      const csv = filasACsv(
        [t('csv.codigo'), t('csv.fecha'), t('csv.estado'), t('csv.serial'), t('csv.producto'), t('csv.cliente'), t('csv.motivo'), t('csv.garantiaHasta'), t('csv.rma'), t('csv.resolucion')],
        r.filas.map((f) => [
          f.codigo,
          formatDateTime(f.fecha),
          te(f.estado),
          f.serial.serial,
          f.producto?.nombre ?? null,
          f.cliente?.nombre ?? null,
          f.motivo,
          formatPlain(f.garantia.fin),
          f.rma,
          f.resolucion ? t(`resoluciones.${f.resolucion}`) : null,
        ]),
      );
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = `garantias_${getToday()}.csv`;
      document.body.appendChild(enlace);
      enlace.click();
      document.body.removeChild(enlace);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Error exportando garantías:', e);
      toast({ variant: 'destructive', title: t('exportar.error') });
    } finally {
      setExportando(false);
    }
  };

  const chips: ChipFiltro[] = [
    ...(estados.length ? [{ clave: 'estado', etiqueta: t('chips.estado', { estados: estados.map((e) => te(e)).join(', ') }) }] : []),
    ...(garantia ? [{ clave: 'garantia', etiqueta: t(`chips.garantia.${garantia}`) }] : []),
  ];

  const columnas: ColumnaTabla<ReclamoFila>[] = [
    {
      id: 'codigo',
      encabezado: t('columnas.reclamo'),
      ordenable: true,
      campoOrden: 'codigo',
      celda: (f) => (
        <div className="flex min-w-0 flex-col">
          <span className="font-medium text-fg tabular-nums">{f.codigo ?? '—'}</span>
          <span className="text-xs text-fg-secondary tabular-nums">{formatDateTime(f.fecha)}</span>
        </div>
      ),
    },
    {
      id: 'serial',
      encabezado: t('columnas.serial'),
      celda: (f) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-fg tabular-nums">{f.serial.serial}</span>
          <span className="truncate text-xs text-fg-secondary">{f.producto?.nombre ?? ''}</span>
        </div>
      ),
    },
    { id: 'cliente', encabezado: t('columnas.cliente'), ocultarDebajo: 'md', celda: (f) => <span className="truncate">{f.cliente?.nombre ?? '—'}</span> },
    { id: 'motivo', encabezado: t('columnas.motivo'), ocultarDebajo: 'lg', celda: (f) => <span className="truncate">{f.motivo}</span> },
    {
      id: 'garantia',
      encabezado: t('columnas.garantia'),
      ocultarDebajo: 'xl',
      celda: (f) =>
        f.garantia.estado === 'vigente' ? (
          <Badge tono="exito" tamano="sm">{t('garantiaVigente')}</Badge>
        ) : f.garantia.estado === 'vencida' ? (
          <Badge tono="peligro" tamano="sm">{t('garantiaVencida')}</Badge>
        ) : (
          <Badge tono="neutro" tamano="sm">{t('sinGarantia')}</Badge>
        ),
    },
    { id: 'estado', encabezado: t('columnas.estado'), celda: (f) => <BadgeEstadoReclamo estado={f.estado} /> },
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
  const botonNuevo = permisos.gestionar ? (
    <Button className="h-10 gap-2" onClick={() => setNuevo(true)}>
      <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
      {t('nuevoReclamo')}
    </Button>
  ) : null;

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <PageHeader
        titulo={tc('titulo')}
        subtitulo={[getOrganizationName(), t('subtituloLema')].filter(Boolean).join(' · ')}
        icono={ShieldCheck}
        cargando={cargando}
        migas={[{ etiqueta: tc('inventario'), href: '/app/inventario' }, { etiqueta: tc('seriales'), href: '/app/inventario/seriales' }]}
        acciones={
          <>
            <Button variant="outline" size="icon" className="size-10" onClick={recargar} aria-label={t('actualizar')} title={t('actualizar')}>
              <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </Button>
            <Button variant="outline" className="h-10 gap-2" onClick={exportar} disabled={exportando || estadoError !== null}>
              <Download aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('exportar.boton')}
            </Button>
            {botonNuevo}
          </>
        }
        movil={{
          subtitulo: kpis ? t('subtituloMovil', { pendientes: entero(kpis.pendientes), proveedor: entero(kpis.con_proveedor) }) : undefined,
          accion: permisos.gestionar ? (
            <button
              type="button"
              onClick={() => setNuevo(true)}
              aria-label={t('nuevoReclamo')}
              className="flex size-10 items-center justify-center rounded-lg text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Plus aria-hidden="true" className="size-5" strokeWidth={1.5} />
            </button>
          ) : (
            <RowActionsMenu orientacion="horizontal" titulo={tc('titulo')} acciones={[{ id: 'exportar', etiqueta: t('exportar.boton'), icono: Download, onSelect: exportar }]} />
          ),
        }}
      />

      {estadoError !== 'sinPermiso' && (
        <KpiStrip etiqueta={t('kpis.etiqueta')} className="hidden sm:grid">
          <StatCard
            etiqueta={t('kpis.pendientes')}
            cargando={!kpis}
            valor={kpis ? entero(kpis.pendientes) : '—'}
            tono={kpis && kpis.pendientes_vencidos > 0 ? 'peligro' : kpis && kpis.pendientes > 0 ? 'advertencia' : 'neutro'}
            iconoDetalle={kpis && kpis.pendientes > 0 ? AlertTriangle : undefined}
            detalle={
              kpis
                ? kpis.pendientes_vencidos > 0
                  ? t('kpis.pendientesVencidos', { count: kpis.pendientes_vencidos, n: entero(kpis.pendientes_vencidos) })
                  : kpis.pendientes > 0
                    ? t('kpis.pendientesPlazo')
                    : t('kpis.sinPendientes')
                : undefined
            }
            onClick={() => l.setFiltro('estado', 'pending')}
          />
          <StatCard
            etiqueta={t('kpis.conProveedor')}
            cargando={!kpis}
            valor={kpis ? entero(kpis.con_proveedor) : '—'}
            detalle={kpis ? t('kpis.rmaAbiertos', { count: kpis.con_proveedor, n: entero(kpis.con_proveedor) }) : undefined}
            onClick={() => l.setFiltro('estado', 'in_process')}
          />
          <StatCard
            etiqueta={t('kpis.resueltosMes')}
            cargando={!kpis}
            valor={kpis ? entero(kpis.resueltos_mes) : '—'}
            tono={kpis && kpis.resueltos_mes > 0 ? 'exito' : 'neutro'}
            tendencia={kpis && kpis.resueltos_mes > 0 ? 'sube' : undefined}
            detalle={kpis ? t('kpis.resueltosDetalle', { reparados: entero(kpis.reparados_mes), reemplazados: entero(kpis.reemplazados_mes) }) : undefined}
            onClick={() => l.setFiltro('estado', 'resolved')}
          />
          <StatCard
            etiqueta={t('kpis.reembolsadoMes')}
            cargando={!kpis}
            valor={kpis ? formatear(kpis.reembolsado_mes) : '—'}
            detalle={kpis ? t('kpis.reembolsos', { count: kpis.reembolsos_mes, n: entero(kpis.reembolsos_mes) }) : undefined}
          />
        </KpiStrip>
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
                {ESTADOS_FILTRO.map((e) => (
                  <label key={e} className="flex items-center gap-2 text-sm text-fg">
                    <Checkbox
                      checked={estados.includes(e)}
                      onCheckedChange={(v) => l.setFiltro('estado', v === true ? [...estados, e] : estados.filter((x) => x !== e))}
                      className="size-[18px] rounded"
                    />
                    {te(e)}
                  </label>
                ))}
              </div>
            </fieldset>
            <FormField etiqueta={t('filtros.garantia')}>
              {(c) => (
                <SegmentedControl
                  aria-labelledby={c.idEtiqueta}
                  anchoCompleto
                  valor={garantia ?? 'todas'}
                  onValorChange={(v) => l.setFiltro('garantia', v === 'todas' ? null : v)}
                  opciones={[
                    { valor: 'todas', etiqueta: t('filtros.todas') },
                    { valor: 'vigente', etiqueta: t('chips.garantia.vigente') },
                    { valor: 'vencida', etiqueta: t('chips.garantia.vencida') },
                  ]}
                />
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
        obtenerId={(f) => f.id}
        estado={estadoTabla}
        orden={l.orden}
        onOrdenar={l.ordenarPor}
        onFilaClick={(f) => router.push(rutaReclamo(f.id))}
        etiquetaFila={(f) => t('etiquetaFila', { codigo: f.codigo ?? '', serial: f.serial.serial })}
        acciones={(f) => acciones.accionesDe(f)}
        tarjetaMovil={(f) => (
          <ListCard
            icono={ShieldCheck}
            titulo={f.codigo ?? f.serial.serial}
            subtitulo={`${f.serial.serial} · ${f.motivo}`}
            meta={
              f.estado === 'in_process' && f.rma
                ? t('movil.conProveedor', { rma: f.rma })
                : [f.cliente?.nombre, f.garantia.estado === 'vigente' ? t('movil.garantiaVigente') : f.garantia.estado === 'vencida' ? t('movil.garantiaVencida') : null]
                    .filter(Boolean)
                    .join(' · ')
            }
            estado={<BadgeEstadoReclamo estado={f.estado} />}
            acciones={acciones.accionesDe(f)}
            onClick={() => router.push(rutaReclamo(f.id))}
          />
        )}
        vacio={{
          titulo: t('vacio.titulo'),
          descripcion: t('vacio.descripcion'),
          icono: ShieldCheck,
          accion: permisos.gestionar ? { etiqueta: t('nuevoReclamo'), onClick: () => setNuevo(true), icono: Plus } : undefined,
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


      <CreateClaimDialog
        open={nuevo}
        onOpenChange={setNuevo}
        onCreated={(id) => {
          recargar();
          if (id) router.push(rutaReclamo(id));
        }}
      />
      {acciones.dialogos}
    </div>
  );
}

export default GarantiasPage;
