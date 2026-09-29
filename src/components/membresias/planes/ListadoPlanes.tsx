'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Crown, Eye, Pencil, Plus, RefreshCw, ShoppingCart, TriangleAlert, LayoutGrid, List } from 'lucide-react';
import { useTranslations } from 'next-intl';
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
  SegmentedControl,
  StatCard,
  ViewToggle,
  calcularRango,
  clasesBoton,
  type AccionFila,
  type ColumnaTabla,
  type EstadoTabla,
} from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { apiMembresias } from '@/lib/services/membresias/clienteMembresias';
import type { ListadoPlanes as DatosPlanes, PlanFila } from '@/lib/services/membresias/tipos';
import { EstadoPantalla } from '../comun/EstadoPantalla';
import { esSinPermiso, useCargaMembresias } from '../comun/useCargaMembresias';
import { useFormatoMembresias } from '../comun/useFormatoMembresias';
import { RUTA_MEMBRESIAS, rutaCobrarEnPos } from '../logica';
import { useContextoPlanes } from './contextoPlanes';
import {
  RUTA_NUEVO_PLAN,
  TONO_ESTADO_PLAN,
  estadoPlan,
  filtrarPlanes,
  ordenarPlanes,
  resumenPlanes,
  rutaEditarProducto,
  rutaPlan,
  type FiltroPlanes,
} from './logicaPlanes';
import { useTextosPlan } from './useTextosPlan';

type Vista = 'lista' | 'tarjetas';

/**
 * Planes de membresía (Figma B1 981:611296 escritorio, B3 981:612770 móvil). Cada plan es la
 * configuración de un producto membresía: nombre y precio salen del producto (P9). «Nuevo
 * plan» abre el formulario de producto con Servicio › Membresía preseleccionado; la
 * configuración se edita SOLO allí. Estados F1–F7 con el kit.
 */
export function ListadoPlanes() {
  const t = useTranslations('membresias.planes');
  const router = useRouter();
  const carga = useCargaMembresias<DatosPlanes>('planes', () => apiMembresias.planes());
  // «Ingresos del mes» vive en el resumen del módulo; si falla, la cifra queda en «—».
  const resumenModulo = useCargaMembresias('resumen-planes', () => apiMembresias.resumen());
  const datos = carga.datos;
  const formato = useFormatoMembresias(datos?.zona);

  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<FiltroPlanes>('todos');
  const [vista, setVista] = useState<Vista>('lista');
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState(20);

  const planes = useMemo(() => ordenarPlanes(datos?.planes ?? []), [datos]);
  const resumen = useMemo(() => resumenPlanes(planes), [planes]);
  const filtrados = useMemo(() => filtrarPlanes(planes, { q: busqueda, estado: filtro }), [planes, busqueda, filtro]);
  const rango = calcularRango(pagina, tamano, filtrados.length);
  const visibles = filtrados.slice(Math.max(0, rango.desde - 1), rango.hasta);

  const contexto = useContextoPlanes(planes.map((p) => p.productId).filter((id): id is number => id !== null));
  const textos = useTextosPlan(contexto.nombreSede);
  const puedeGestionar = datos?.permisos.planes === true;

  const cambiarBusqueda = (v: string) => {
    setBusqueda(v);
    setPagina(1);
  };
  const cambiarFiltro = (v: FiltroPlanes) => {
    setFiltro(v);
    setPagina(1);
  };
  const limpiarTodo = () => {
    setBusqueda('');
    setFiltro('todos');
    setPagina(1);
  };

  const precio = (p: PlanFila) => (p.precio !== null ? formato.moneda(p.precio) : t('sinPrecio'));
  const estadoBadge = (p: PlanFila) => {
    const e = estadoPlan(p);
    return (
      <Badge tono={TONO_ESTADO_PLAN[e]} apariencia="suave" tamano="sm">
        {t(`estadoPlan.${e}`)}
      </Badge>
    );
  };
  const subtituloFila = (p: PlanFila) =>
    p.productId ? t('subtituloFila', { sku: p.sku ?? '—' }) : t('sinProductoFila');

  const acciones = (p: PlanFila): AccionFila[] => {
    const uuid = p.productId ? contexto.uuidProducto.get(p.productId) : undefined;
    return [
      { id: 'ver', etiqueta: t('acciones.ver'), icono: Eye, onSelect: () => router.push(rutaPlan(p.id)) },
      {
        id: 'editar',
        etiqueta: t('acciones.editarProducto'),
        icono: Pencil,
        onSelect: () => uuid && router.push(rutaEditarProducto(uuid)),
        oculta: !puedeGestionar || !p.productId,
        deshabilitada: !uuid,
        motivo: t('acciones.cargandoProducto'),
      },
      {
        id: 'vender',
        etiqueta: t('acciones.vender'),
        icono: ShoppingCart,
        onSelect: () => router.push(rutaCobrarEnPos(null, p.productId)),
        oculta: !p.productId,
        deshabilitada: estadoPlan(p) !== 'activo',
        motivo: t('acciones.inactivoMotivo'),
      },
    ];
  };

  const columnas: ColumnaTabla<PlanFila>[] = [
    {
      id: 'plan',
      encabezado: t('columnas.plan'),
      celda: (p) => (
        <div className="min-w-0">
          <Link href={rutaPlan(p.id)} className="block truncate font-medium text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
            {p.nombre}
          </Link>
          <p className="truncate text-xs text-fg-secondary">{subtituloFila(p)}</p>
        </div>
      ),
    },
    { id: 'precio', encabezado: t('columnas.precio'), variante: 'importe', celda: precio },
    { id: 'duracion', encabezado: t('columnas.duracion'), celda: (p) => textos.duracion(p.reglas) },
    { id: 'cobro', encabezado: t('columnas.cobro'), ocultarDebajo: 'lg', celda: (p) => (p.productId ? textos.cobroCorto(p.reglas) : '—') },
    { id: 'acceso', encabezado: t('columnas.acceso'), ocultarDebajo: 'xl', celda: (p) => textos.acceso(p.reglas) },
    { id: 'activas', encabezado: t('columnas.activas'), variante: 'importe', celda: (p) => formato.entero(p.membresiasActivas) },
    { id: 'estado', encabezado: t('columnas.estado'), celda: estadoBadge },
  ];

  const tarjeta = (p: PlanFila) => (
    <ListCard
      icono={Crown}
      titulo={p.nombre}
      subtitulo={p.productId ? `${textos.duracion(p.reglas)} · ${textos.cobroCorto(p.reglas).toLowerCase()}` : t('sinProductoTarjeta')}
      meta={t('activasTarjeta', { n: p.membresiasActivas })}
      valor={precio(p)}
      estado={estadoBadge(p)}
      acciones={acciones(p)}
      onClick={() => router.push(rutaPlan(p.id))}
    />
  );

  const sinPermiso = esSinPermiso(carga.error);
  const estadoTabla: EstadoTabla = carga.cargando && !datos
    ? 'cargando'
    : sinPermiso
      ? 'sinPermiso'
      : carga.error
        ? 'error'
        : planes.length === 0
          ? 'vacio'
          : filtrados.length === 0
            ? 'sinResultados'
            : 'listo';
  const cargandoCifras = carga.cargando && !datos;
  const ingresos = resumenModulo.datos?.ingresosMes;

  const nuevoPlan = (
    <Link href={RUTA_NUEVO_PLAN} className={clasesBoton({ variante: 'primario' })}>
      <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
      {t('nuevo')}
    </Link>
  );
  const accionesCabecera: AccionFila[] = [
    { id: 'actualizar', etiqueta: t('actualizar'), icono: RefreshCw, onSelect: () => carga.recargar() },
  ];

  const pie = (
    <Pagination
      pagina={rango.pagina}
      tamano={tamano}
      total={filtrados.length}
      onPaginaChange={setPagina}
      onTamanoChange={(n) => {
        setTamano(n);
        setPagina(1);
      }}
      sustantivo={{ singular: t('sustantivo.singular'), plural: t('sustantivo.plural') }}
      cargando={carga.cargando}
    />
  );

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <PageHeader
        titulo={t('titulo')}
        icono={Crown}
        migas={[{ etiqueta: t('migaModulo'), href: RUTA_MEMBRESIAS }, { etiqueta: t('titulo') }]}
        subtitulo={datos ? t('subtitulo', { total: resumen.total, activos: resumen.activos }) : undefined}
        cargando={cargandoCifras}
        acciones={
          <>
            {nuevoPlan}
            <RowActionsMenu orientacion="horizontal" tamano="md" titulo={t('titulo')} acciones={accionesCabecera} />
          </>
        }
        movil={{
          subtitulo: datos ? t('subtitulo', { total: resumen.total, activos: resumen.activos }) : undefined,
          accion: (
            <Link
              href={RUTA_NUEVO_PLAN}
              aria-label={t('nuevo')}
              className="flex size-10 items-center justify-center rounded-lg text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Plus aria-hidden="true" className="size-5" strokeWidth={1.5} />
            </Link>
          ),
        }}
      />

      {carga.error && (sinPermiso || !datos) ? (
        // F4 (error con «Reintentar») y F5 (sin permiso), comunes a Membresías.
        <EstadoPantalla error={carga.error} onReintentar={carga.recargar} tituloError={t('errorTitulo')} />
      ) : (
        <>
          <KpiStrip etiqueta={t('kpi.etiqueta')}>
            <StatCard
              etiqueta={t('kpi.activos')}
              valor={formato.entero(resumen.activos)}
              detalle={t('kpi.activosDetalle', { n: resumen.inactivos })}
              icono={Crown}
              cargando={cargandoCifras}
              onClick={() => cambiarFiltro('activos')}
            />
            <StatCard
              etiqueta={t('kpi.membresias')}
              valor={formato.entero(resumen.activas)}
              detalle={t('kpi.membresiasDetalle', { n: resumen.vivas })}
              tono="exito"
              cargando={cargandoCifras}
              href={`${RUTA_MEMBRESIAS}/membresias`}
            />
            <StatCard
              etiqueta={t('kpi.ingresos')}
              valor={ingresos !== undefined ? formato.monedaCompacta(ingresos) : '—'}
              detalle={t('kpi.ingresosDetalle')}
              cargando={resumenModulo.cargando && !resumenModulo.datos}
            />
            <StatCard
              etiqueta={t('kpi.sinProducto')}
              valor={formato.entero(resumen.sinProducto)}
              detalle={resumen.sinProducto > 0 ? t('kpi.sinProductoDetalle') : t('kpi.sinProductoNinguno')}
              tono={resumen.sinProducto > 0 ? 'advertencia' : 'neutro'}
              iconoDetalle={resumen.sinProducto > 0 ? TriangleAlert : undefined}
              resaltada={resumen.sinProducto > 0}
              cargando={cargandoCifras}
            />
          </KpiStrip>

          {resumen.sinProducto > 0 && (
            <p role="status" className="flex items-start gap-2 rounded-lg border border-line-warning bg-warning-subtle px-3 py-2 text-sm text-warning-text">
              <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
              {t('avisoSinProducto', { n: resumen.sinProducto })}
            </p>
          )}

          <div className="flex items-start gap-2">
            <ListToolbar
              className="min-w-0 flex-1"
              busqueda={
                <SearchInput value={busqueda} onChange={cambiarBusqueda} onValueChange={cambiarBusqueda} placeholder={t('buscar')} etiqueta={t('buscar')} />
              }
              filtros={
                <FilterPanel
                  conteo={filtro !== 'todos' ? 1 : 0}
                  onLimpiar={() => cambiarFiltro('todos')}
                  textoVerResultados={t('filtros.verResultados', { n: filtrados.length })}
                >
                  <FormField etiqueta={t('filtros.estado')}>
                    {(c) => (
                      <SegmentedControl
                        aria-labelledby={c.idEtiqueta}
                        anchoCompleto
                        valor={filtro}
                        onValorChange={cambiarFiltro}
                        opciones={[
                          { valor: 'todos', etiqueta: t('filtros.todos') },
                          { valor: 'activos', etiqueta: t('filtros.activos') },
                          { valor: 'inactivos', etiqueta: t('filtros.inactivos') },
                        ]}
                      />
                    )}
                  </FormField>
                </FilterPanel>
              }
              chips={
                <FilterChips
                  chips={filtro !== 'todos' ? [{ clave: 'estado', etiqueta: `${t('filtros.estado')}: ${t(`filtros.${filtro}`)}` }] : []}
                  onQuitar={() => cambiarFiltro('todos')}
                  onLimpiarTodo={limpiarTodo}
                />
              }
            />
            <ViewToggle
              valor={vista}
              onValorChange={setVista}
              etiqueta={t('vista.etiqueta')}
              className="hidden md:inline-flex"
              opciones={[
                { valor: 'lista', etiqueta: t('vista.lista'), icono: List },
                { valor: 'tarjetas', etiqueta: t('vista.tarjetas'), icono: LayoutGrid },
              ]}
            />
          </div>

          {vista === 'tarjetas' && estadoTabla === 'listo' ? (
            <section aria-label={t('titulo')} className="flex flex-col gap-3">
              <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {visibles.map((p) => (
                  <li key={p.id}>{tarjeta(p)}</li>
                ))}
              </ul>
              {pie}
            </section>
          ) : vista === 'tarjetas' && estadoTabla === 'cargando' ? (
            <div role="status" aria-live="polite" className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <span className="sr-only">{t('cargando')}</span>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
          ) : (
            <DataTable
              etiqueta={t('titulo')}
              columnas={columnas}
              filas={visibles}
              obtenerId={(p) => String(p.id)}
              estado={estadoTabla}
              onFilaClick={(p) => router.push(rutaPlan(p.id))}
              etiquetaFila={(p) => p.nombre}
              acciones={acciones}
              tonoFila={(p) => (estadoPlan(p) === 'sin_producto' ? 'advertencia' : undefined)}
              tarjetaMovil={(p) => tarjeta(p)}
              vacio={{
                titulo: t('vacio.titulo'),
                descripcion: t('vacio.descripcion'),
                icono: Crown,
                accion: { etiqueta: t('nuevo'), href: RUTA_NUEVO_PLAN },
              }}
              error={{ titulo: t('errorTitulo') }}
              onReintentar={carga.recargar}
              onLimpiarFiltros={limpiarTodo}
              termino={busqueda || undefined}
              pie={estadoTabla === 'listo' ? pie : undefined}
            />
          )}
        </>
      )}
    </div>
  );
}
