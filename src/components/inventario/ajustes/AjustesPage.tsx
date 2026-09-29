'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle, CheckCircle2, ClipboardCheck, Download, Plus, Printer, RefreshCw, Trash2 } from 'lucide-react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { getOrganizationId, getOrganizationName } from '@/lib/hooks/useOrganization';
import { SIN_PERMISOS_INVENTARIO } from '@/lib/inventario/permisos';
import type { PermisosInventario } from '@/lib/inventario/nucleo/tipos';
import { filasACsv } from '@/lib/utils/csv';
import {
  adjustmentService,
  ErrorAjuste,
  RAZONES_AJUSTE,
  type AjusteFila,
  type EstadoAjuste,
  type FiltrosAjustes,
  type KpisAjustes,
  type TipoAjuste,
} from '@/lib/services/adjustmentService';
import { filasCsvAjustes, rutaAjuste, rutaNuevoAjuste } from './logica';
import { BadgeEstadoAjuste, BadgeTipoAjuste, CifraDiferencia, useEtiquetaRazon, useFormatoCantidad } from './piezas';
import { useAccionesAjuste } from './useAccionesAjuste';

const ESTADOS: readonly EstadoAjuste[] = ['draft', 'posted', 'cancelled'];
const TIPOS: readonly TipoAjuste[] = ['entrada', 'salida'];
const CAMPOS_ORDEN = ['fecha', 'codigo', 'impacto'] as const;
const LIMITE_EXPORTAR = 5000;
const DIA_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Ajustes de inventario (Figma «Existencias — Ajustes» 586:303290: listo,
 * cargando, vacío, error, sin permiso, sin sucursal, menú de fila, selección y
 * móvil 587:305001…306460). Paginado y filtrado en el servidor
 * (`fn_ajustes_listado`) con el estado en la URL; la sucursal es la del
 * selector del encabezado. Nada aquí mueve stock: aplicar y descartar pasan por
 * `useAccionesAjuste` (una RPC por ajuste).
 */
export function AjustesPage() {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations('inventarioAjustes.listado');
  const tc = useTranslations('inventarioAjustes');
  const entero = useFormatoEntero();
  const cantidad = useFormatoCantidad();
  const etiquetaRazon = useEtiquetaRazon();
  const { formatear: moneda } = useMonedaOrganizacion();
  const { formatDateTime, getToday } = useFormatDate();
  const { branchFilter, branches, isLoading: cargandoSucursales } = useBranch();

  const l = useListadoServidor({
    filtros: ['estado', 'tipo', 'razon', 'desde', 'hasta'],
    camposOrden: [...CAMPOS_ORDEN],
    ordenPorDefecto: { campo: 'fecha', direccion: 'desc' },
    tamanoPorDefecto: 25,
  });

  const [filas, setFilas] = useState<AjusteFila[]>([]);
  const [total, setTotal] = useState(0);
  const [kpis, setKpis] = useState<KpisAjustes | null>(null);
  const [permisos, setPermisos] = useState<PermisosInventario>(SIN_PERMISOS_INVENTARIO);
  const [cargando, setCargando] = useState(true);
  const [estadoError, setEstadoError] = useState<'error' | 'sinPermiso' | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [seleccionadas, setSeleccionadas] = useState<Map<string, AjusteFila>>(new Map());
  const [exportando, setExportando] = useState(false);

  const recargar = useCallback(() => setRecarga((n) => n + 1), []);
  const acciones = useAccionesAjuste({ permisos, onCambio: recargar });

  const estados = valoresFiltro(l.filtros.estado).filter((e): e is EstadoAjuste => (ESTADOS as readonly string[]).includes(e));
  const tipo = (TIPOS as readonly string[]).includes(l.filtros.tipo ?? '') ? (l.filtros.tipo as TipoAjuste) : undefined;
  const razon = (RAZONES_AJUSTE as readonly string[]).includes(l.filtros.razon ?? '') ? l.filtros.razon : undefined;
  const desde = DIA_RE.test(l.filtros.desde ?? '') ? l.filtros.desde : undefined;
  const hasta = DIA_RE.test(l.filtros.hasta ?? '') ? l.filtros.hasta : undefined;
  const sinSucursal = !cargandoSucursales && branches.length === 0;

  const filtrosServidor = useMemo<FiltrosAjustes>(
    () => ({
      busqueda: l.busqueda || undefined,
      sucursal: branchFilter ?? undefined,
      estados: estados.length ? estados : undefined,
      tipo,
      razon,
      fecha_desde: desde,
      fecha_hasta: hasta,
      orden: (CAMPOS_ORDEN as readonly string[]).includes(l.orden?.campo ?? '') ? (l.orden!.campo as FiltrosAjustes['orden']) : 'fecha',
      direccion: l.orden?.direccion ?? 'desc',
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [l.busqueda, branchFilter, l.filtros.estado, tipo, razon, desde, hasta, l.orden?.campo, l.orden?.direccion],
  );
  const clave = JSON.stringify({ ...filtrosServidor, desde: l.rango.desde, limite: l.tamano });

  useEffect(() => {
    if (sinSucursal || cargandoSucursales) return;
    const control = new AbortController();
    setCargando(true);
    adjustmentService
      .listar(getOrganizationId(), { ...filtrosServidor, desde: l.rango.desde, limite: l.tamano }, control.signal)
      .then((r) => {
        setFilas(r.filas);
        setTotal(r.total);
        setKpis(r.kpis);
        setPermisos(r.permisos);
        setEstadoError(null);
      })
      .catch((e: unknown) => {
        if (control.signal.aborted) return;
        if (e instanceof ErrorAjuste && e.sinPermiso) setEstadoError('sinPermiso');
        else {
          console.error('Error cargando ajustes:', e);
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

  const cambiarSeleccion = (nueva: Set<string>) => {
    setSeleccion(nueva);
    setSeleccionadas((prev) => {
      const m = new Map<string, AjusteFila>();
      nueva.forEach((id) => {
        const fila = filas.find((f) => String(f.id) === id) ?? prev.get(id);
        if (fila) m.set(id, fila);
      });
      return m;
    });
  };

  const todasLasFilas = async (): Promise<AjusteFila[]> => {
    const r = await adjustmentService.listar(getOrganizationId(), { ...filtrosServidor, desde: 0, limite: Math.min(Math.max(total, 1), LIMITE_EXPORTAR) });
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
          t('csv.ajuste'),
          t('csv.fecha'),
          t('csv.sucursal'),
          t('csv.tipo'),
          t('csv.razon'),
          t('csv.productos'),
          t('csv.diferencia'),
          t('csv.unidad'),
          t('csv.impacto'),
          t('csv.estado'),
          t('csv.autor'),
          t('csv.nota'),
        ],
        filasCsvAjustes(datos, {
          fecha: (v) => formatDateTime(v),
          estado: (e) => tc(`estados.${e}`),
          tipo: (x) => tc(`tipos.${x}`),
          razon: etiquetaRazon,
        }),
      );
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = `ajustes_${getToday()}.csv`;
      document.body.appendChild(enlace);
      enlace.click();
      document.body.removeChild(enlace);
      URL.revokeObjectURL(url);
      toast({ title: t('exportar.listo', { count: datos.length }) });
    } catch (e) {
      console.error('Error exportando ajustes:', e);
      toast({ variant: 'destructive', title: t('exportar.error') });
    } finally {
      setExportando(false);
    }
  };

  // ── Chips ───────────────────────────────────────────────────────────────
  const chips: ChipFiltro[] = [
    ...(estados.length ? [{ clave: 'estado', etiqueta: t('chips.estado', { estados: estados.map((e) => tc(`estados.${e}`)).join(', ') }) }] : []),
    ...(tipo ? [{ clave: 'tipo', etiqueta: tc(`tipos.${tipo}`) }] : []),
    ...(razon ? [{ clave: 'razon', etiqueta: etiquetaRazon(razon) }] : []),
    ...(desde ? [{ clave: 'desde', etiqueta: t('chips.desde', { dia: desde }) }] : []),
    ...(hasta ? [{ clave: 'hasta', etiqueta: t('chips.hasta', { dia: hasta }) }] : []),
  ];

  const importe = (n: number | null) => (n === null ? '—' : `${n > 0 ? '+' : n < 0 ? '−' : ''}${moneda(Math.abs(n))}`);

  // ── Columnas ────────────────────────────────────────────────────────────
  const columnas: ColumnaTabla<AjusteFila>[] = [
    {
      id: 'codigo',
      encabezado: t('columnas.ajuste'),
      ordenable: true,
      campoOrden: 'fecha',
      celda: (f) => (
        <div className="flex min-w-0 flex-col">
          <span className="font-medium text-fg tabular-nums">{f.codigo}</span>
          <span className="truncate text-xs text-fg-secondary">{[formatDateTime(f.fecha), f.autor].filter(Boolean).join(' · ')}</span>
        </div>
      ),
    },
    { id: 'sucursal', encabezado: t('columnas.sucursal'), ocultarDebajo: 'lg', celda: (f) => <span className="truncate text-fg">{f.sucursal.nombre}</span> },
    { id: 'tipo', encabezado: t('columnas.tipo'), celda: (f) => <BadgeTipoAjuste tipo={f.tipo} /> },
    { id: 'razon', encabezado: t('columnas.razon'), ocultarDebajo: 'md', celda: (f) => <span className="truncate text-fg">{etiquetaRazon(f.razon)}</span> },
    { id: 'productos', encabezado: t('columnas.productos'), variante: 'importe', ocultarDebajo: 'xl', celda: (f) => entero(f.productos) },
    {
      id: 'diferencia',
      encabezado: t('columnas.diferencia'),
      variante: 'importe',
      celda: (f) => <CifraDiferencia valor={f.diferencia} texto={cantidad(f.diferencia, { signo: true, unidad: f.unidad ?? t('uds') })} />,
    },
    {
      id: 'impacto',
      encabezado: t('columnas.impacto'),
      variante: 'importe',
      ordenable: true,
      campoOrden: 'impacto',
      ocultarDebajo: 'md',
      celda: (f) => <CifraDiferencia valor={f.impacto} texto={importe(f.impacto)} />,
    },
    { id: 'estado', encabezado: t('columnas.estado'), celda: (f) => <BadgeEstadoAjuste estado={f.estado} /> },
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
  const subtitulo = [getOrganizationName(), tc('nAjustes', { count: kpis?.total ?? total, n: entero(kpis?.total ?? total) }), t('lema')]
    .filter(Boolean)
    .join(' · ');

  const nuevo = () => router.push(rutaNuevoAjuste({ sucursal: branchFilter }));

  const cabecera = (
    <PageHeader
      titulo={t('titulo')}
      subtitulo={sinSucursal ? getOrganizationName() : subtitulo}
      icono={ClipboardCheck}
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
            {acciones.puedeAjustar && (
              <Button className="h-10 gap-2" onClick={nuevo}>
                <Plus aria-hidden="true" className="size-4" strokeWidth={1.75} />
                {t('nuevo')}
              </Button>
            )}
          </>
        )
      }
      movil={{
        titulo: t('tituloMovil'),
        subtitulo: kpis ? t('subtituloMovil', { total: entero(kpis.total), borradores: kpis.borradores, n: entero(kpis.borradores) }) : undefined,
        accion:
          sinSucursal || !acciones.puedeAjustar ? undefined : (
            <Button variant="ghost" size="icon" className="size-10" onClick={nuevo} aria-label={t('nuevo')}>
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

  const listaSeleccion = [...seleccionadas.values()];
  const borradoresSeleccion = listaSeleccion.filter((f) => f.estado === 'draft');
  const motivoMasivo = !acciones.puedeAjustar
    ? t('masivas.sinPermiso')
    : borradoresSeleccion.length === 0
      ? t('masivas.soloBorradores')
      : undefined;
  const borradores = kpis?.borradores ?? 0;
  const soloBorradores = estados.length === 1 && estados[0] === 'draft';

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      {cabecera}

      {estadoError !== 'sinPermiso' && (
        <KpiStrip etiqueta={t('kpis.etiqueta')} className="hidden sm:grid">
          <StatCard
            etiqueta={t('kpis.mes')}
            cargando={!kpis}
            valor={kpis ? entero(kpis.mes) : '—'}
            detalle={kpis ? t('kpis.enSucursales', { count: kpis.sucursales_mes, n: entero(kpis.sucursales_mes) }) : undefined}
          />
          <StatCard
            etiqueta={t('kpis.borradores')}
            cargando={!kpis}
            valor={kpis ? entero(kpis.borradores) : '—'}
            tono={borradores > 0 ? 'advertencia' : 'neutro'}
            iconoDetalle={borradores > 0 ? AlertTriangle : undefined}
            detalle={kpis ? (borradores > 0 ? t('kpis.sinAplicar') : t('kpis.ningunBorrador')) : undefined}
            onClick={() => l.setFiltro('estado', 'draft')}
          />
          <StatCard
            etiqueta={t('kpis.aplicados')}
            cargando={!kpis}
            valor={kpis ? entero(kpis.aplicados) : '—'}
            tono="exito"
            tendencia="sube"
            detalle={t('kpis.conKardex')}
            onClick={() => l.setFiltro('estado', 'posted')}
          />
          <StatCard
            etiqueta={t('kpis.impactoMes')}
            cargando={!kpis}
            valor={kpis ? importe(kpis.impacto_mes) : '—'}
            tono={kpis && kpis.impacto_mes !== null && kpis.impacto_mes < 0 ? 'peligro' : kpis && (kpis.impacto_mes ?? 0) > 0 ? 'exito' : 'neutro'}
            tendencia={kpis && kpis.impacto_mes !== null && kpis.impacto_mes !== 0 ? (kpis.impacto_mes < 0 ? 'baja' : 'sube') : undefined}
            detalle={kpis ? (kpis.impacto_mes === null ? t('kpis.sinCostos') : t('kpis.impactoDetalle')) : undefined}
          />
        </KpiStrip>
      )}

      {kpis && borradores > 0 && !soloBorradores && estadoError === null && (
        <div role="status" className="flex flex-col gap-3 rounded-xl border border-line-warning bg-warning-subtle p-4 sm:flex-row sm:items-center">
          <AlertTriangle aria-hidden="true" className="size-5 shrink-0 text-warning-text" strokeWidth={1.75} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-warning-text">
              {kpis.borrador_mas_antiguo_dias && kpis.borrador_mas_antiguo_dias > 0
                ? t('aviso.titulo', { count: borradores, n: entero(borradores), dias: kpis.borrador_mas_antiguo_dias })
                : t('aviso.tituloHoy', { count: borradores, n: entero(borradores) })}
            </p>
            <p className="text-[13px] text-fg-secondary">{t('aviso.descripcion')}</p>
          </div>
          <Button variant="outline" className="h-9 bg-surface" onClick={() => l.setFiltro('estado', 'draft')}>
            {t('aviso.verBorradores')}
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
          />
        }
        filtros={
          <FilterPanel conteo={l.filtrosActivos} onLimpiar={l.limpiarFiltros} textoVerResultados={t('filtros.verN', { count: total, n: entero(total) })}>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium text-fg">{t('filtros.estado')}</legend>
              <div className="grid grid-cols-2 gap-2">
                {ESTADOS.map((e) => (
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
            <FormField etiqueta={t('filtros.tipo')}>
              {(c) => (
                <Select value={tipo ?? 'todos'} onValueChange={(v) => l.setFiltro('tipo', v === 'todos' ? null : v)}>
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">{t('filtros.todos')}</SelectItem>
                    {TIPOS.map((x) => (
                      <SelectItem key={x} value={x}>
                        {tc(`tipos.${x}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <FormField etiqueta={t('filtros.razon')}>
              {(c) => (
                <Select value={razon ?? 'todas'} onValueChange={(v) => l.setFiltro('razon', v === 'todas' ? null : v)}>
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">{t('filtros.todas')}</SelectItem>
                    {RAZONES_AJUSTE.map((r) => (
                      <SelectItem key={r} value={r}>
                        {etiquetaRazon(r)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField etiqueta={t('filtros.desde')}>
                {(c) => (
                  <CampoFecha
                    id={c.id}
                    aria-labelledby={c.idEtiqueta}
                    valor={desde ?? ''}
                    onValorChange={(d) => l.setFiltro('desde', d || null)}
                    hoy={getToday()}
                    max={hasta ?? getToday()}
                    limpiable
                  />
                )}
              </FormField>
              <FormField etiqueta={t('filtros.hasta')}>
                {(c) => (
                  <CampoFecha
                    id={c.id}
                    aria-labelledby={c.idEtiqueta}
                    valor={hasta ?? ''}
                    onValorChange={(d) => l.setFiltro('hasta', d || null)}
                    hoy={getToday()}
                    min={desde ?? null}
                    max={getToday()}
                    limpiable
                  />
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
        onSeleccionChange={cambiarSeleccion}
        onFilaClick={(f) => router.push(rutaAjuste(f.id))}
        etiquetaFila={(f) => t('etiquetaFila', { codigo: f.codigo, sucursal: f.sucursal.nombre })}
        acciones={acciones.accionesDe}
        tarjetaMovil={(f, ctx) => (
          <ListCard
            icono={ClipboardCheck}
            titulo={f.codigo}
            subtitulo={[etiquetaRazon(f.razon), f.sucursal.nombre].join(' · ')}
            meta={[formatDateTime(f.fecha), f.autor].filter(Boolean).join(' · ')}
            valor={
              <span className="flex flex-col items-end gap-0.5">
                <CifraDiferencia
                  valor={f.diferencia}
                  texto={[cantidad(f.diferencia, { signo: true, unidad: f.unidad ?? t('uds') }), f.impacto !== null ? importe(f.impacto) : null].filter(Boolean).join(' · ')}
                  className="text-sm font-medium"
                />
                <span className="text-xs text-fg-secondary">{t('nProductos', { count: f.productos, n: entero(f.productos) })}</span>
              </span>
            }
            estado={<BadgeEstadoAjuste estado={f.estado} />}
            acciones={acciones.accionesDe(f)}
            onClick={() => router.push(rutaAjuste(f.id))}
            seleccionable={ctx.modoSeleccion}
            seleccionado={ctx.seleccionado}
            onSeleccionChange={ctx.alternar}
            onMantenerPulsado={() => ctx.alternar(true)}
          />
        )}
        vacio={{
          titulo: t('vacio.titulo'),
          descripcion: t('vacio.descripcion'),
          icono: ClipboardCheck,
          accion: acciones.puedeAjustar ? { etiqueta: t('nuevo'), onClick: nuevo } : undefined,
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
          {
            id: 'aplicar',
            etiqueta: t('masivas.aplicar'),
            icono: CheckCircle2,
            deshabilitada: !!motivoMasivo,
            motivo: motivoMasivo,
            onClick: () => acciones.pedirAplicar(borradoresSeleccion),
          },
          { id: 'exportar', etiqueta: t('masivas.exportar'), icono: Download, onClick: () => exportar(true), cargando: exportando },
          {
            id: 'imprimir',
            etiqueta: t('masivas.imprimir'),
            icono: Printer,
            deshabilitada: listaSeleccion.length !== 1,
            motivo: listaSeleccion.length !== 1 ? t('masivas.imprimirUno') : undefined,
            onClick: () => {
              const f = listaSeleccion[0];
              if (f) router.push(`${rutaAjuste(f.id)}?imprimir=1`);
            },
          },
        ]}
        accionesSecundarias={
          acciones.puedeAjustar && borradoresSeleccion.length > 0
            ? [
                {
                  id: 'descartar',
                  etiqueta: t('masivas.descartar', { count: borradoresSeleccion.length }),
                  icono: Trash2,
                  destructiva: true,
                  onSelect: () => acciones.pedirDescartar(borradoresSeleccion),
                },
              ]
            : []
        }
        onLimpiar={() => cambiarSeleccion(new Set())}
      />

      {acciones.dialogos}
    </div>
  );
}

export default AjustesPage;
