'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  Building2,
  ClipboardList,
  Download,
  FileSpreadsheet,
  FileText,
  Info,
  Plus,
  Power,
  PowerOff,
  Sheet,
  Truck,
  Upload,
  User,
  WalletCards,
} from 'lucide-react';
import {
  BulkActionBar,
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
  SegmentedControl,
  StatCard,
  StatusBadge,
  useListadoServidor,
  type AccionFila,
  type ChipFiltro,
  type ColumnaTabla,
  type ListadoServidor,
} from '@/components/kit';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useOrgCurrency } from '@/lib/hooks/useOrgCurrency';
import { getOrganizationId, getOrganizationName } from '@/lib/hooks/useOrganization';
import {
  supplierService,
  type FiltrosListadoProveedores,
  type ProveedorListadoItem,
  type ProveedoresResumen,
} from '@/lib/services/supplierService';
import { cn } from '@/utils/Utils';
import { DialogoEliminarProveedor } from './DialogoEliminarProveedor';
import {
  condicionPago,
  documentoProveedor,
  estadoCartera,
  formatoMoneda,
  formatoMonedaCompacta,
  lineaCartera,
  tipoProveedor,
} from './formato';
import { RUTA_PROVEEDORES, rutaNuevaOrdenCompra, useAccionesProveedor } from './useAccionesProveedor';

/** Filtro de la URL → clave del chip en `proveedores.listado.chips`. */
const CLAVES_CHIP: Record<string, Record<string, string>> = {
  estado: { activo: 'estadoActivos', inactivo: 'estadoInactivos' },
  tipo: { company: 'tipoEmpresa', person: 'tipoPersona' },
  cartera: { con_saldo: 'carteraConSaldo', vencido: 'carteraVencida', al_dia: 'carteraAlDia' },
  documento: { sin_nit: 'sinNit' },
};

type Formato = 'csv' | 'xlsx' | 'pdf';

/** Lo que se lee de la URL (ya validado por el kit) → parámetros de la RPC. */
function filtrosServidor(l: ListadoServidor): FiltrosListadoProveedores {
  const f = l.filtros;
  return {
    busqueda: l.busqueda,
    estado: f.estado === 'activo' || f.estado === 'inactivo' ? f.estado : null,
    tipo: f.tipo === 'company' || f.tipo === 'person' ? f.tipo : null,
    cartera: f.cartera === 'con_saldo' || f.cartera === 'vencido' || f.cartera === 'al_dia' ? f.cartera : null,
    sinNit: f.documento === 'sin_nit',
    orden: l.orden?.campo === 'saldo' ? 'saldo' : 'nombre',
    direccion: l.orden?.direccion ?? 'asc',
  };
}

/** % de entregas a tiempo como badge (Figma: «92 %» verde, «Sin datos» gris). */
function BadgeCumplimiento({ valor }: { valor: number | null }) {
  const t = useTranslations('proveedores.listado');
  if (valor === null) {
    return (
      <Badge tono="neutro" tamano="sm">
        {t('sinDatos')}
      </Badge>
    );
  }
  const tono = valor >= 80 ? 'exito' : valor >= 60 ? 'advertencia' : 'peligro';
  return (
    <Badge tono={tono} tamano="sm" className="tabular-nums">
      {t('porcentaje', { valor })}
    </Badge>
  );
}

/**
 * Listado de proveedores (Figma «Proveedores — listado» de escritorio y
 * «Móvil · Proveedores — listo»). Paginado, filtrado y ordenado en el servidor
 * (RPC `proveedores_listado`: saldo y cartera salen de `accounts_payable` en
 * la misma consulta), con el estado en la URL (`useListadoServidor`).
 */
export default function CatalogoProveedores() {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations('proveedores.listado');
  const tc = useTranslations('proveedores.comun');
  const tf = useTranslations('proveedores.formato');
  const entero = useFormatoEntero();
  const sustantivo = { singular: tc('sustantivo.singular'), plural: tc('sustantivo.plural') };
  const nProveedores = (n: number) => tc('nProveedores', { count: n, n: entero(n) });
  const moneda = useOrgCurrency();
  // Día de la organización para el nombre de las descargas: los proveedores
  // no cuelgan de una sucursal, así que la zona es la de la organización.
  const { getToday } = useFormatDate();

  const l = useListadoServidor({
    filtros: ['estado', 'tipo', 'cartera', 'documento'],
    camposOrden: ['nombre', 'saldo'],
    ordenPorDefecto: { campo: 'nombre', direccion: 'asc' },
    tamanoPorDefecto: 10,
  });

  const [filas, setFilas] = useState<ProveedorListadoItem[]>([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [resumen, setResumen] = useState<ProveedoresResumen | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [exportando, setExportando] = useState<Formato | null>(null);

  const recargar = useCallback(() => setRecarga((n) => n + 1), []);
  const { accionesDe, cambiarEstado, aEliminar, setAEliminar } = useAccionesProveedor({ onCambio: recargar });

  const filtros = filtrosServidor(l);
  const claveConsulta = JSON.stringify({ ...filtros, desde: l.rango.desde, limite: l.tamano });

  // ── Datos de la página ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelado = false;
    const consulta = JSON.parse(claveConsulta) as FiltrosListadoProveedores;
    setCargando(true);
    setError(false);
    supplierService
      .listarProveedores(getOrganizationId(), consulta)
      .then(({ items, total: t }) => {
        if (cancelado) return;
        setFilas(items);
        setTotal(t);
      })
      .catch((e: unknown) => {
        if (cancelado) return;
        console.error('Error cargando proveedores:', e);
        setError(true);
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [claveConsulta, recarga]);

  // ── KPIs (no dependen de los filtros) ───────────────────────────────────
  useEffect(() => {
    let cancelado = false;
    supplierService
      .obtenerResumenProveedores(getOrganizationId())
      .then((r) => {
        if (!cancelado) setResumen(r);
      })
      .catch(() => {
        if (!cancelado) setResumen(null);
      });
    return () => {
      cancelado = true;
    };
  }, [recarga]);

  // Una búsqueda o un filtro nuevo parte de una selección vacía.
  const claveCriterios = JSON.stringify({ b: l.busqueda, f: l.filtros });
  useEffect(() => setSeleccion(new Set()), [claveCriterios]);

  // ── Exportar (todo o la selección) ──────────────────────────────────────
  const exportar = useCallback(
    async (formato: Formato, ids?: readonly number[]) => {
      setExportando(formato);
      try {
        const org = getOrganizationId();
        let blob: Blob;
        if (formato === 'csv') {
          const csv = await supplierService.exportSuppliersToCSV(org, ids);
          blob = new Blob(csv ? ['﻿' + csv] : [], { type: 'text/csv;charset=utf-8;' });
        } else if (formato === 'xlsx') {
          blob = await supplierService.exportSuppliersToXLSX(org, ids);
        } else {
          blob = await supplierService.exportSuppliersToPDF(org, ids);
        }
        if (blob.size === 0) {
          toast({ variant: 'destructive', title: t('exportar.sinDatos'), description: t('exportar.sinDatosDescripcion') });
          return;
        }
        const url = URL.createObjectURL(blob);
        const enlace = document.createElement('a');
        enlace.href = url;
        enlace.download = `proveedores_${getToday()}.${formato}`;
        document.body.appendChild(enlace);
        enlace.click();
        document.body.removeChild(enlace);
        URL.revokeObjectURL(url);
        const nombre = formato === 'csv' ? 'CSV' : formato === 'xlsx' ? 'Excel' : 'PDF';
        toast({ title: t('exportar.completada'), description: t('exportar.descargado', { formato: nombre }) });
      } catch (e) {
        console.error('Error exportando proveedores:', e);
        toast({ variant: 'destructive', title: tc('error'), description: t('exportar.error') });
      } finally {
        setExportando(null);
      }
    },
    [getToday, t, tc, toast],
  );

  const accionesExportar = (ids?: readonly number[]): AccionFila[] => [
    { id: 'csv', etiqueta: t('exportar.csv'), icono: FileText, onSelect: () => exportar('csv', ids), deshabilitada: !!exportando, motivo: t('exportar.exportando') },
    { id: 'xlsx', etiqueta: t('exportar.xlsx'), icono: FileSpreadsheet, onSelect: () => exportar('xlsx', ids), deshabilitada: !!exportando, motivo: t('exportar.exportando') },
    { id: 'pdf', etiqueta: t('exportar.pdf'), icono: Sheet, onSelect: () => exportar('pdf', ids), deshabilitada: !!exportando, motivo: t('exportar.exportando') },
  ];

  // ── Selección ───────────────────────────────────────────────────────────
  const idsSeleccionados = useMemo(() => [...seleccion].map(Number).filter(Number.isFinite), [seleccion]);

  const seleccionarTodos = async () => {
    try {
      const { items } = await supplierService.listarProveedores(getOrganizationId(), {
        ...filtros,
        desde: 0,
        limite: Math.min(Math.max(total, 1), 10000),
      });
      setSeleccion(new Set(items.map((p) => String(p.id))));
    } catch {
      toast({ variant: 'destructive', title: t('errorSeleccionarTodo') });
    }
  };

  const cambiarEstadoSeleccion = async (activo: boolean) => {
    if (await cambiarEstado(idsSeleccionados, activo)) setSeleccion(new Set());
  };

  // ── Chips ───────────────────────────────────────────────────────────────
  const chips: ChipFiltro[] = Object.entries(l.filtros)
    .map(([clave, valor]) => {
      const k = CLAVES_CHIP[clave]?.[valor];
      return { clave, etiqueta: k ? t(`chips.${k}`) : '' };
    })
    .filter((c) => c.etiqueta);

  // ── Columnas ────────────────────────────────────────────────────────────
  const columnas: ColumnaTabla<ProveedorListadoItem>[] = [
    {
      id: 'nombre',
      encabezado: t('columnas.proveedor'),
      ordenable: true,
      celda: (p) => {
        const Icono = p.supplier_type === 'person' ? User : Building2;
        return (
          <div className="flex min-w-0 items-center gap-3">
            <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand">
              <Icono className="size-4" strokeWidth={1.5} />
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-medium text-fg">{p.name}</span>
              <span className="truncate text-xs text-fg-secondary">
                {documentoProveedor(p, tf)} · {tipoProveedor(p.supplier_type, tf)}
              </span>
            </div>
          </div>
        );
      },
    },
    {
      id: 'contacto',
      encabezado: t('columnas.contacto'),
      ocultarDebajo: 'xl',
      celda: (p) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-fg">{p.contact || p.email || '—'}</span>
          {p.phone && <span className="truncate text-xs text-fg-secondary tabular-nums">{p.phone}</span>}
        </div>
      ),
    },
    {
      id: 'condicion',
      encabezado: t('columnas.condicion'),
      ocultarDebajo: 'xl',
      celda: (p) => <span className="whitespace-nowrap">{condicionPago(p.payment_terms, p.credit_days, tf)}</span>,
    },
    {
      id: 'saldo',
      encabezado: t('columnas.saldo'),
      variante: 'importe',
      ordenable: true,
      celda: (p) => {
        const linea = lineaCartera(p, tf);
        return (
          <div className="flex flex-col items-end">
            <span className="font-medium text-fg">{formatoMoneda(p.saldo, moneda)}</span>
            <span className={cn('text-xs', linea.peligro ? 'text-danger-text' : 'text-fg-secondary')}>{linea.texto}</span>
          </div>
        );
      },
    },
    {
      id: 'cumplimiento',
      encabezado: t('columnas.cumplimiento'),
      alinear: 'derecha',
      ocultarDebajo: 'lg',
      celda: (p) => <BadgeCumplimiento valor={p.cumplimiento} />,
    },
    {
      id: 'estado',
      encabezado: t('columnas.estado'),
      celda: (p) => <StatusBadge estado={p.is_active ? 'activo' : 'inactivo'} />,
    },
  ];

  const abrir = (p: ProveedorListadoItem) => router.push(`${RUTA_PROVEEDORES}/${p.uuid}`);

  const estadoTabla = cargando
    ? 'cargando'
    : error
      ? 'error'
      : filas.length === 0 && l.hayCriterios
        ? 'sinResultados'
        : 'listo';

  const subtituloEscritorio = [
    getOrganizationName(),
    nProveedores(total),
    resumen ? t('subtituloActivos', { count: resumen.activos, n: entero(resumen.activos) }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <PageHeader
        titulo={tc('titulo')}
        subtitulo={subtituloEscritorio}
        icono={Truck}
        cargando={cargando}
        migas={[{ etiqueta: tc('inventario'), href: '/app/inventario' }, { etiqueta: tc('titulo') }]}
        acciones={
          <>
            <Link
              href={`${RUTA_PROVEEDORES}/importar`}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Upload aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('importar')}
            </Link>
            <Link
              href={`${RUTA_PROVEEDORES}/nuevo`}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-action px-4 text-sm font-medium text-fg-on-brand hover:bg-brand-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {tc('nuevoProveedor')}
            </Link>
            <RowActionsMenu orientacion="horizontal" tamano="md" titulo={tc('titulo')} acciones={accionesExportar()} />
          </>
        }
        movil={{
          subtitulo: nProveedores(total),
          accion: (
            <div className="flex items-center">
              <RowActionsMenu
                orientacion="horizontal"
                titulo={tc('titulo')}
                acciones={[
                  { id: 'importar', etiqueta: t('importarProveedores'), icono: Upload, onSelect: () => router.push(`${RUTA_PROVEEDORES}/importar`) },
                  ...accionesExportar(),
                ]}
              />
              <Link
                href={`${RUTA_PROVEEDORES}/nuevo`}
                aria-label={tc('nuevoProveedor')}
                className="flex size-10 items-center justify-center rounded-lg text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <Plus aria-hidden="true" className="size-5" strokeWidth={1.5} />
              </Link>
            </div>
          ),
        }}
      />

      <KpiStrip etiqueta={t('kpis.etiqueta')} className="hidden sm:grid">
        <StatCard
          etiqueta={t('kpis.activos')}
          icono={Truck}
          cargando={!resumen}
          valor={resumen ? entero(resumen.activos) : '—'}
          detalle={resumen ? t('kpis.inactivosDetalle', { count: resumen.inactivos, n: entero(resumen.inactivos) }) : undefined}
          onClick={() => l.setFiltro('estado', 'activo')}
        />
        <StatCard
          etiqueta={t('kpis.saldo')}
          icono={WalletCards}
          cargando={!resumen}
          valor={formatoMoneda(resumen?.saldo_por_pagar ?? 0, moneda)}
          detalle={
            resumen
              ? t('kpis.conSaldoDetalle', { count: resumen.proveedores_con_saldo, n: entero(resumen.proveedores_con_saldo) })
              : undefined
          }
          onClick={() => l.setFiltro('cartera', 'con_saldo')}
        />
        <StatCard
          etiqueta={t('kpis.vencido30')}
          icono={AlertTriangle}
          cargando={!resumen}
          valor={formatoMoneda(resumen?.vencido_30 ?? 0, moneda)}
          tono={resumen && resumen.vencido_30 > 0 ? 'peligro' : 'neutro'}
          tendencia={resumen && resumen.vencido_30 > 0 ? 'baja' : undefined}
          detalle={
            resumen
              ? t('kpis.vencido30Detalle', { count: resumen.proveedores_vencido_30, n: entero(resumen.proveedores_vencido_30) })
              : undefined
          }
          onClick={() => l.setFiltro('cartera', 'vencido')}
        />
        <StatCard
          etiqueta={t('kpis.sinNit')}
          icono={Info}
          cargando={!resumen}
          valor={resumen ? entero(resumen.sin_nit) : '—'}
          tono={resumen && resumen.sin_nit > 0 ? 'advertencia' : 'neutro'}
          detalle={resumen && resumen.sin_nit > 0 ? t('kpis.sinNitDetalle') : t('kpis.todosConDocumento')}
          onClick={() => l.setFiltro('documento', 'sin_nit')}
        />
      </KpiStrip>

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
            <FormField etiqueta={t('filtros.estado')}>
              {(c) => (
                <SegmentedControl
                  aria-labelledby={c.idEtiqueta}
                  anchoCompleto
                  valor={l.filtros.estado ?? 'todos'}
                  onValorChange={(v) => l.setFiltro('estado', v === 'todos' ? null : v)}
                  opciones={[
                    { valor: 'todos', etiqueta: t('filtros.todos') },
                    { valor: 'activo', etiqueta: t('filtros.activos') },
                    { valor: 'inactivo', etiqueta: t('filtros.inactivos') },
                  ]}
                />
              )}
            </FormField>
            <FormField etiqueta={t('filtros.tipo')}>
              {(c) => (
                <SegmentedControl
                  aria-labelledby={c.idEtiqueta}
                  anchoCompleto
                  valor={l.filtros.tipo ?? 'todos'}
                  onValorChange={(v) => l.setFiltro('tipo', v === 'todos' ? null : v)}
                  opciones={[
                    { valor: 'todos', etiqueta: t('filtros.todos') },
                    { valor: 'company', etiqueta: tf('tipo.company') },
                    { valor: 'person', etiqueta: tf('tipo.person') },
                  ]}
                />
              )}
            </FormField>
            <FormField etiqueta={t('filtros.cartera')}>
              {(c) => (
                <Select value={l.filtros.cartera ?? 'todas'} onValueChange={(v) => l.setFiltro('cartera', v === 'todas' ? null : v)}>
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">{t('filtros.carteraTodas')}</SelectItem>
                    <SelectItem value="con_saldo">{t('filtros.carteraConSaldo')}</SelectItem>
                    <SelectItem value="vencido">{t('filtros.carteraVencidas')}</SelectItem>
                    <SelectItem value="al_dia">{t('filtros.carteraAlDia')}</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <label className="flex items-center gap-2 text-sm text-fg">
              <Checkbox
                checked={l.filtros.documento === 'sin_nit'}
                onCheckedChange={(v) => l.setFiltro('documento', v === true ? 'sin_nit' : null)}
                className="size-[18px] rounded"
              />
              {t('filtros.soloSinNit')}
            </label>
          </FilterPanel>
        }
        chips={<FilterChips chips={chips} onQuitar={(c) => l.setFiltro(c, null)} onLimpiarTodo={l.limpiarFiltros} />}
      />

      <DataTable
        etiqueta={tc('titulo')}
        columnas={columnas}
        filas={filas}
        obtenerId={(p) => String(p.id)}
        estado={estadoTabla}
        orden={l.orden}
        onOrdenar={l.ordenarPor}
        seleccion={seleccion}
        onSeleccionChange={setSeleccion}
        onFilaClick={abrir}
        etiquetaFila={(p) => p.name}
        acciones={(p) => accionesDe(p)}
        accionesRapidas={(p) =>
          p.is_active ? (
            <Link
              href={rutaNuevaOrdenCompra(p.id)}
              aria-label={t('nuevaOrdenA', { nombre: p.name })}
              title={t('nuevaOrden')}
              onClick={(e) => e.stopPropagation()}
              className="flex size-8 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <ClipboardList aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </Link>
          ) : null
        }
        tarjetaMovil={(p, ctx) => {
          const linea = lineaCartera(p, tf);
          return (
            <ListCard
              icono={p.supplier_type === 'person' ? User : Building2}
              titulo={p.name}
              subtitulo={`${documentoProveedor(p, tf)} · ${condicionPago(p.payment_terms, p.credit_days, tf)}`}
              meta={<span className={linea.peligro ? 'text-danger-text' : undefined}>{linea.texto}</span>}
              valor={formatoMonedaCompacta(p.saldo, moneda)}
              estado={<StatusBadge estado={estadoCartera(p)} />}
              acciones={accionesDe(p)}
              onClick={() => abrir(p)}
              seleccionable={ctx.modoSeleccion}
              seleccionado={ctx.seleccionado}
              onSeleccionChange={ctx.alternar}
            />
          );
        }}
        vacio={{
          titulo: t('vacio.titulo'),
          descripcion: t('vacio.descripcion'),
          icono: Truck,
          accion: { etiqueta: tc('nuevoProveedor'), href: `${RUTA_PROVEEDORES}/nuevo`, icono: Plus },
          accionSecundaria: { etiqueta: t('importar'), href: `${RUTA_PROVEEDORES}/importar`, icono: Upload },
        }}
        sinResultados={{ descripcion: t('sinResultados') }}
        error={{ titulo: t('errorCarga') }}
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
            id: 'exportar',
            etiqueta: t('masivas.exportar'),
            icono: Download,
            onClick: () => exportar('xlsx', idsSeleccionados),
            cargando: exportando === 'xlsx',
          },
          { id: 'activar', etiqueta: t('masivas.activar'), icono: Power, onClick: () => cambiarEstadoSeleccion(true) },
          { id: 'desactivar', etiqueta: t('masivas.desactivar'), icono: PowerOff, onClick: () => cambiarEstadoSeleccion(false) },
        ]}
        accionesSecundarias={accionesExportar(idsSeleccionados).filter((a) => a.id !== 'xlsx')}
        onLimpiar={() => setSeleccion(new Set())}
      />

      <DialogoEliminarProveedor
        proveedor={aEliminar}
        onCerrar={() => setAEliminar(null)}
        onEliminado={() => {
          setAEliminar(null);
          recargar();
        }}
        onDesactivado={() => {
          setAEliminar(null);
          recargar();
        }}
      />
    </div>
  );
}
