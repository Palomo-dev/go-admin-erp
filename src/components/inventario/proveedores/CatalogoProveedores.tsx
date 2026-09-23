'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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

const SUSTANTIVO = { singular: 'proveedor', plural: 'proveedores' } as const;

const ETIQUETAS_FILTRO: Record<string, Record<string, string>> = {
  estado: { activo: 'Estado: Activos', inactivo: 'Estado: Inactivos' },
  tipo: { company: 'Tipo: Empresa', person: 'Tipo: Persona' },
  cartera: { con_saldo: 'Cartera: Con saldo', vencido: 'Cartera: Vencida', al_dia: 'Cartera: Al día' },
  documento: { sin_nit: 'Sin NIT registrado' },
};

type Formato = 'csv' | 'xlsx' | 'pdf';

const nProveedores = (n: number) => `${n.toLocaleString('es-CO')} ${n === 1 ? SUSTANTIVO.singular : SUSTANTIVO.plural}`;

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
  if (valor === null) {
    return (
      <Badge tono="neutro" tamano="sm">
        Sin datos
      </Badge>
    );
  }
  const tono = valor >= 80 ? 'exito' : valor >= 60 ? 'advertencia' : 'peligro';
  return (
    <Badge tono={tono} tamano="sm" className="tabular-nums">
      {valor} %
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
          toast({ variant: 'destructive', title: 'Sin datos', description: 'No hay proveedores para exportar' });
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
        toast({ title: 'Exportación completada', description: `El archivo ${nombre} ha sido descargado` });
      } catch (e) {
        console.error('Error exportando proveedores:', e);
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo exportar los proveedores' });
      } finally {
        setExportando(null);
      }
    },
    [getToday, toast],
  );

  const accionesExportar = (ids?: readonly number[]): AccionFila[] => [
    { id: 'csv', etiqueta: 'Exportar CSV (.csv)', icono: FileText, onSelect: () => exportar('csv', ids), deshabilitada: !!exportando, motivo: 'Exportando…' },
    { id: 'xlsx', etiqueta: 'Exportar Excel (.xlsx)', icono: FileSpreadsheet, onSelect: () => exportar('xlsx', ids), deshabilitada: !!exportando, motivo: 'Exportando…' },
    { id: 'pdf', etiqueta: 'Exportar PDF (.pdf)', icono: Sheet, onSelect: () => exportar('pdf', ids), deshabilitada: !!exportando, motivo: 'Exportando…' },
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
      toast({ variant: 'destructive', title: 'No se pudo seleccionar todo' });
    }
  };

  const cambiarEstadoSeleccion = async (activo: boolean) => {
    if (await cambiarEstado(idsSeleccionados, activo)) setSeleccion(new Set());
  };

  // ── Chips ───────────────────────────────────────────────────────────────
  const chips: ChipFiltro[] = Object.entries(l.filtros)
    .map(([clave, valor]) => ({ clave, etiqueta: ETIQUETAS_FILTRO[clave]?.[valor] ?? '' }))
    .filter((c) => c.etiqueta);

  // ── Columnas ────────────────────────────────────────────────────────────
  const columnas: ColumnaTabla<ProveedorListadoItem>[] = [
    {
      id: 'nombre',
      encabezado: 'Proveedor',
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
                {documentoProveedor(p)} · {tipoProveedor(p.supplier_type)}
              </span>
            </div>
          </div>
        );
      },
    },
    {
      id: 'contacto',
      encabezado: 'Contacto',
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
      encabezado: 'Condición de pago',
      ocultarDebajo: 'xl',
      celda: (p) => <span className="whitespace-nowrap">{condicionPago(p.payment_terms, p.credit_days)}</span>,
    },
    {
      id: 'saldo',
      encabezado: 'Saldo por pagar',
      variante: 'importe',
      ordenable: true,
      celda: (p) => {
        const linea = lineaCartera(p);
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
      encabezado: 'Cumplimiento',
      alinear: 'derecha',
      ocultarDebajo: 'lg',
      celda: (p) => <BadgeCumplimiento valor={p.cumplimiento} />,
    },
    {
      id: 'estado',
      encabezado: 'Estado',
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
    resumen ? `${resumen.activos.toLocaleString('es-CO')} activos` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <PageHeader
        titulo="Proveedores"
        subtitulo={subtituloEscritorio}
        icono={Truck}
        cargando={cargando}
        migas={[{ etiqueta: 'Inventario', href: '/app/inventario' }, { etiqueta: 'Proveedores' }]}
        acciones={
          <>
            <Link
              href={`${RUTA_PROVEEDORES}/importar`}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Upload aria-hidden="true" className="size-4" strokeWidth={1.5} />
              Importar
            </Link>
            <Link
              href={`${RUTA_PROVEEDORES}/nuevo`}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-action px-4 text-sm font-medium text-fg-on-brand hover:bg-brand-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
              Nuevo proveedor
            </Link>
            <RowActionsMenu orientacion="horizontal" tamano="md" titulo="Proveedores" acciones={accionesExportar()} />
          </>
        }
        movil={{
          subtitulo: nProveedores(total),
          accion: (
            <div className="flex items-center">
              <RowActionsMenu
                orientacion="horizontal"
                titulo="Proveedores"
                acciones={[
                  { id: 'importar', etiqueta: 'Importar proveedores', icono: Upload, onSelect: () => router.push(`${RUTA_PROVEEDORES}/importar`) },
                  ...accionesExportar(),
                ]}
              />
              <Link
                href={`${RUTA_PROVEEDORES}/nuevo`}
                aria-label="Nuevo proveedor"
                className="flex size-10 items-center justify-center rounded-lg text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <Plus aria-hidden="true" className="size-5" strokeWidth={1.5} />
              </Link>
            </div>
          ),
        }}
      />

      <KpiStrip etiqueta="Resumen de proveedores" className="hidden sm:grid">
        <StatCard
          etiqueta="Proveedores activos"
          icono={Truck}
          cargando={!resumen}
          valor={resumen?.activos.toLocaleString('es-CO') ?? '—'}
          detalle={resumen ? `${resumen.inactivos.toLocaleString('es-CO')} inactivos` : undefined}
          onClick={() => l.setFiltro('estado', 'activo')}
        />
        <StatCard
          etiqueta="Saldo por pagar"
          icono={WalletCards}
          cargando={!resumen}
          valor={formatoMoneda(resumen?.saldo_por_pagar ?? 0, moneda)}
          detalle={resumen ? `${resumen.proveedores_con_saldo.toLocaleString('es-CO')} proveedores con saldo` : undefined}
          onClick={() => l.setFiltro('cartera', 'con_saldo')}
        />
        <StatCard
          etiqueta="Vencido más de 30 días"
          icono={AlertTriangle}
          cargando={!resumen}
          valor={formatoMoneda(resumen?.vencido_30 ?? 0, moneda)}
          tono={resumen && resumen.vencido_30 > 0 ? 'peligro' : 'neutro'}
          tendencia={resumen && resumen.vencido_30 > 0 ? 'baja' : undefined}
          detalle={resumen ? `${resumen.proveedores_vencido_30.toLocaleString('es-CO')} proveedores · ver cartera` : undefined}
          onClick={() => l.setFiltro('cartera', 'vencido')}
        />
        <StatCard
          etiqueta="Sin NIT registrado"
          icono={Info}
          cargando={!resumen}
          valor={resumen?.sin_nit.toLocaleString('es-CO') ?? '—'}
          tono={resumen && resumen.sin_nit > 0 ? 'advertencia' : 'neutro'}
          detalle={resumen && resumen.sin_nit > 0 ? 'No se les puede registrar factura' : 'Todos tienen documento'}
          onClick={() => l.setFiltro('documento', 'sin_nit')}
        />
      </KpiStrip>

      <ListToolbar
        busqueda={
          <SearchInput
            value={l.busqueda}
            onChange={l.setBusqueda}
            cargando={cargando}
            placeholder="Buscar proveedor o NIT"
            etiqueta="Buscar por nombre, NIT, contacto, correo o teléfono"
          />
        }
        filtros={
          <FilterPanel conteo={l.filtrosActivos} onLimpiar={l.limpiarFiltros} textoVerResultados={`Ver ${nProveedores(total)}`}>
            <FormField etiqueta="Estado">
              {(c) => (
                <SegmentedControl
                  aria-labelledby={c.idEtiqueta}
                  anchoCompleto
                  valor={l.filtros.estado ?? 'todos'}
                  onValorChange={(v) => l.setFiltro('estado', v === 'todos' ? null : v)}
                  opciones={[
                    { valor: 'todos', etiqueta: 'Todos' },
                    { valor: 'activo', etiqueta: 'Activos' },
                    { valor: 'inactivo', etiqueta: 'Inactivos' },
                  ]}
                />
              )}
            </FormField>
            <FormField etiqueta="Tipo">
              {(c) => (
                <SegmentedControl
                  aria-labelledby={c.idEtiqueta}
                  anchoCompleto
                  valor={l.filtros.tipo ?? 'todos'}
                  onValorChange={(v) => l.setFiltro('tipo', v === 'todos' ? null : v)}
                  opciones={[
                    { valor: 'todos', etiqueta: 'Todos' },
                    { valor: 'company', etiqueta: 'Empresa' },
                    { valor: 'person', etiqueta: 'Persona' },
                  ]}
                />
              )}
            </FormField>
            <FormField etiqueta="Cartera">
              {(c) => (
                <Select value={l.filtros.cartera ?? 'todas'} onValueChange={(v) => l.setFiltro('cartera', v === 'todas' ? null : v)}>
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas</SelectItem>
                    <SelectItem value="con_saldo">Con saldo por pagar</SelectItem>
                    <SelectItem value="vencido">Con facturas vencidas</SelectItem>
                    <SelectItem value="al_dia">Al día</SelectItem>
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
              Solo sin NIT registrado
            </label>
          </FilterPanel>
        }
        chips={<FilterChips chips={chips} onQuitar={(c) => l.setFiltro(c, null)} onLimpiarTodo={l.limpiarFiltros} />}
      />

      <DataTable
        etiqueta="Proveedores"
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
              aria-label={`Nueva orden de compra a ${p.name}`}
              title="Nueva orden de compra"
              onClick={(e) => e.stopPropagation()}
              className="flex size-8 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <ClipboardList aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </Link>
          ) : null
        }
        tarjetaMovil={(p, ctx) => {
          const linea = lineaCartera(p);
          return (
            <ListCard
              icono={p.supplier_type === 'person' ? User : Building2}
              titulo={p.name}
              subtitulo={`${documentoProveedor(p)} · ${condicionPago(p.payment_terms, p.credit_days)}`}
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
          titulo: 'Aún no tienes proveedores',
          descripcion: 'Registra a quién le compras para hacer órdenes de compra y llevar lo que les debes.',
          icono: Truck,
          accion: { etiqueta: 'Nuevo proveedor', href: `${RUTA_PROVEEDORES}/nuevo`, icono: Plus },
          accionSecundaria: { etiqueta: 'Importar', href: `${RUTA_PROVEEDORES}/importar`, icono: Upload },
        }}
        sinResultados={{ descripcion: 'Prueba con otro nombre o NIT, o quita un filtro.' }}
        error={{ titulo: 'No pudimos cargar los proveedores' }}
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
            sustantivo={SUSTANTIVO}
            cargando={cargando}
          />
        }
      />

      <BulkActionBar
        seleccionados={seleccion.size}
        total={total}
        onSeleccionarTodos={seleccionarTodos}
        sustantivo={SUSTANTIVO}
        acciones={[
          {
            id: 'exportar',
            etiqueta: 'Exportar',
            icono: Download,
            onClick: () => exportar('xlsx', idsSeleccionados),
            cargando: exportando === 'xlsx',
          },
          { id: 'activar', etiqueta: 'Activar', icono: Power, onClick: () => cambiarEstadoSeleccion(true) },
          { id: 'desactivar', etiqueta: 'Desactivar', icono: PowerOff, onClick: () => cambiarEstadoSeleccion(false) },
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
