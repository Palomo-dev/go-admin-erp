'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChefHat, Download, Package, Pencil, Plus, Ruler, Scale, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import {
  BulkActionBar,
  DataTable,
  FilterChips,
  FilterPanel,
  FormField,
  KpiStrip,
  ListCard,
  ListToolbar,
  Pagination,
  SearchInput,
  SegmentedControl,
  StatCard,
  StatusBadge,
  calcularRango,
  type AccionFila,
  type ColumnaTabla,
  type ListadoServidor,
} from '@/components/kit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TIPOS_UNIDAD, type ResumenUnidades, type TipoUnidad, type Unidad } from './tipos';
import { filtrarUnidades, unidadEliminable, type FiltroUso } from './logicaUnidades';
import { BadgeAmbito, BadgeTipoUnidad } from './piezas';

/** Catálogo filtrado por unidad (contrato para B7: el catálogo lee `?unidad=`). */
export const rutaProductosDeUnidad = (codigo: string) => `/app/inventario/productos?unidad=${encodeURIComponent(codigo)}`;

export interface AccionesUnidades {
  nueva: () => void;
  verProductos: (u: Unidad) => void;
  editar: (u: Unidad) => void;
  eliminar: (u: Unidad[]) => void;
  verConversiones: (u: Unidad) => void;
  nuevaConversionDesde: (u: Unidad) => void;
  exportar: (u: Unidad[]) => void;
}

export interface PestanaUnidadesProps {
  resumen: ResumenUnidades | null;
  estado: 'cargando' | 'listo' | 'error' | 'sinPermiso';
  listado: ListadoServidor;
  permisos: { editar: boolean; eliminar: boolean };
  acciones: AccionesUnidades;
  onReintentar: () => void;
}

/**
 * Pestaña «Unidades» (Figma `593:333689` y estados, menú `593:336662`,
 * filtros `593:337604`, selección `593:338541`, móvil `595:345558`).
 */
export function PestanaUnidades({ resumen, estado, listado, permisos, acciones, onReintentar }: PestanaUnidadesProps) {
  const t = useTranslations('inventarioUnidades');
  const locale = useLocale();
  const fmt = (n: number) => n.toLocaleString(locale);
  const [seleccion, setSeleccion] = useState<Set<string>>(() => new Set());

  const unidades = useMemo(() => resumen?.unidades ?? [], [resumen]);
  const kpis = resumen?.kpis;
  const tipo = (listado.filtros.tipo as TipoUnidad | undefined) ?? 'todos';
  const ambito = (listado.filtros.ambito as 'sistema' | 'organizacion' | undefined) ?? 'todas';
  const uso = (listado.filtros.uso as FiltroUso | undefined) ?? 'todas';
  const sinConversion = listado.filtros.conversiones === 'sin';

  const filtradas = useMemo(() => {
    const lista = filtrarUnidades(unidades, { texto: listado.busqueda, tipo, ambito, uso, sinConversion });
    const o = listado.orden;
    if (!o) return lista;
    const signo = o.direccion === 'asc' ? 1 : -1;
    return [...lista].sort((a, b) => {
      if (o.campo === 'nombre') return signo * a.nombre.localeCompare(b.nombre, locale);
      if (o.campo === 'productos') return signo * (a.productos - b.productos);
      return signo * a.codigo.localeCompare(b.codigo, locale);
    });
  }, [unidades, listado.busqueda, listado.orden, tipo, ambito, uso, sinConversion, locale]);

  const rango = calcularRango(listado.pagina, listado.tamano, filtradas.length);
  const pagina = filtradas.slice((rango.pagina - 1) * listado.tamano, rango.pagina * listado.tamano);
  const seleccionadas = unidades.filter((u) => seleccion.has(u.codigo));

  const accionesDe = (u: Unidad): AccionFila[] => [
    {
      id: 'productos',
      etiqueta: t('acciones.verProductos', { n: u.productos }),
      icono: Package,
      onSelect: () => acciones.verProductos(u),
      oculta: u.productos === 0,
    },
    { id: 'conversiones', etiqueta: t('acciones.verConversiones', { n: u.conversiones }), icono: Scale, onSelect: () => acciones.verConversiones(u) },
    {
      id: 'nueva-conversion',
      etiqueta: t('acciones.nuevaConversionDesde', { codigo: u.codigo }),
      icono: Plus,
      onSelect: () => acciones.nuevaConversionDesde(u),
      oculta: !permisos.editar,
    },
    { id: 'editar', etiqueta: t('acciones.editar'), icono: Pencil, onSelect: () => acciones.editar(u), oculta: !permisos.editar || u.ambito !== 'organizacion' },
    {
      id: 'eliminar',
      etiqueta: t('acciones.eliminar'),
      icono: Trash2,
      destructiva: true,
      onSelect: () => acciones.eliminar([u]),
      deshabilitada: !unidadEliminable(u),
      motivo: t('acciones.motivoUnidadEnUso'),
      oculta: !permisos.eliminar || u.ambito !== 'organizacion',
    },
  ];

  const columnas: ColumnaTabla<Unidad>[] = [
    { id: 'codigo', encabezado: t('columnas.codigo'), ordenable: true, ancho: 104, variante: 'mono', celda: (u) => u.codigo },
    {
      id: 'nombre',
      encabezado: t('columnas.nombre'),
      ordenable: true,
      celda: (u) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-fg">{u.nombre}</span>
          {u.dian_codigo && <span className="truncate text-xs text-fg-secondary">{t('dianCorto', { codigo: u.dian_codigo, nombre: u.dian_nombre ?? '' })}</span>}
        </span>
      ),
    },
    { id: 'tipo', encabezado: t('columnas.tipo'), ocultarDebajo: 'sm', celda: (u) => (u.tipo ? <BadgeTipoUnidad tipo={u.tipo} /> : '—') },
    {
      id: 'ambito',
      encabezado: t('columnas.ambito'),
      ocultarDebajo: 'md',
      celda: (u) => (
        <span className="inline-flex flex-wrap gap-1">
          <BadgeAmbito ambito={u.ambito} />
          {!u.activo && <StatusBadge estado="inactivo" etiqueta={t('inactiva')} tono="neutro" apariencia="contorno" tamano="sm" />}
        </span>
      ),
    },
    {
      id: 'productos',
      encabezado: t('columnas.productos'),
      ordenable: true,
      variante: 'importe',
      ancho: 110,
      celda: (u) =>
        u.productos > 0 ? (
          <Link
            href={rutaProductosDeUnidad(u.codigo)}
            onClick={(e) => e.stopPropagation()}
            className="font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {fmt(u.productos)}
          </Link>
        ) : (
          <span className="text-fg-muted">0</span>
        ),
    },
    {
      id: 'conversiones',
      encabezado: t('columnas.conversiones'),
      variante: 'importe',
      ancho: 120,
      celda: (u) =>
        u.conversiones > 0 ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              acciones.verConversiones(u);
            }}
            className="font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {fmt(u.conversiones)}
          </button>
        ) : (
          <span className="text-fg-muted">0</span>
        ),
    },
  ];

  const estadoTabla =
    estado === 'cargando' ? 'cargando' : estado === 'error' ? 'error' : estado === 'sinPermiso' ? 'sinPermiso' : filtradas.length === 0 ? (unidades.length ? 'sinResultados' : 'vacio') : 'listo';

  const chips = [
    ...(tipo !== 'todos' ? [{ clave: 'tipo', etiqueta: `${t('filtros.tipo')}: ${t(`tipos.${tipo}`)}` }] : []),
    ...(ambito !== 'todas' ? [{ clave: 'ambito', etiqueta: `${t('filtros.ambito')}: ${t(`ambitos.${ambito}`)}` }] : []),
    ...(uso !== 'todas' ? [{ clave: 'uso', etiqueta: `${t('filtros.uso')}: ${t(`filtros.usos.${uso}`)}` }] : []),
    ...(sinConversion ? [{ clave: 'conversiones', etiqueta: t('filtros.sinConversion') }] : []),
  ];

  const sinConv = kpis?.unidades_sin_conversion ?? [];

  return (
    <div className="flex flex-col gap-4">
      <KpiStrip etiqueta={t('kpi.etiquetaUnidades')}>
        <StatCard
          etiqueta={t('kpi.enUso')}
          valor={fmt(kpis?.unidades_en_uso ?? 0)}
          detalle={t('kpi.enUsoDetalle', { n: kpis?.unidades_disponibles ?? 0 })}
          icono={Ruler}
          cargando={estado === 'cargando'}
          onClick={() => listado.setFiltro('uso', 'conProductos')}
        />
        <StatCard
          etiqueta={t('kpi.sinUnidad')}
          valor={fmt(kpis?.productos_sin_unidad ?? 0)}
          detalle={kpis?.productos_sin_unidad ? t('kpi.sinUnidadDetalle') : t('kpi.sinUnidadNinguno')}
          tono={kpis?.productos_sin_unidad ? 'peligro' : 'neutro'}
          tendencia={kpis?.productos_sin_unidad ? 'baja' : undefined}
          icono={Package}
          cargando={estado === 'cargando'}
          href={kpis?.productos_sin_unidad ? '/app/inventario/productos' : undefined}
        />
        <StatCard
          etiqueta={t('kpi.sinConversion')}
          valor={fmt(sinConv.length)}
          detalle={sinConv.length ? sinConv.slice(0, 5).join(', ') : t('kpi.sinConversionNinguna')}
          tono={sinConv.length ? 'advertencia' : 'neutro'}
          icono={Scale}
          cargando={estado === 'cargando'}
          onClick={() => listado.setFiltro('conversiones', 'sin')}
        />
        <StatCard
          etiqueta={t('kpi.recetasMezcladas')}
          valor={fmt(kpis?.recetas_mezcladas ?? 0)}
          detalle={
            (kpis?.recetas_mezcladas_sin_conversion ?? 0) > 0
              ? t('kpi.recetasSinConversion', { n: kpis?.recetas_mezcladas_sin_conversion ?? 0 })
              : t('kpi.recetasTodasConConversion')
          }
          tono={(kpis?.recetas_mezcladas_sin_conversion ?? 0) > 0 ? 'peligro' : 'exito'}
          tendencia={(kpis?.recetas_mezcladas_sin_conversion ?? 0) > 0 ? 'baja' : 'sube'}
          icono={ChefHat}
          cargando={estado === 'cargando'}
          href="/app/inventario/recetas"
        />
      </KpiStrip>

      <ListToolbar
        busqueda={<SearchInput value={listado.busqueda} onChange={listado.setBusqueda} placeholder={t('buscarUnidad')} etiqueta={t('buscarUnidad')} />}
        filtros={
          <FilterPanel conteo={listado.filtrosActivos} onLimpiar={listado.limpiarFiltros} textoVerResultados={t('verResultados', { n: filtradas.length })}>
            <FormField etiqueta={t('filtros.tipo')}>
              {(c) => (
                <Select value={tipo} onValueChange={(v) => listado.setFiltro('tipo', v === 'todos' ? null : v)}>
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">{t('filtros.todos')}</SelectItem>
                    {TIPOS_UNIDAD.map((x) => (
                      <SelectItem key={x} value={x}>
                        {t(`tipos.${x}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <FormField etiqueta={t('filtros.ambito')}>
              {(c) => (
                <Select value={ambito} onValueChange={(v) => listado.setFiltro('ambito', v === 'todas' ? null : v)}>
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">{t('filtros.ambitoTodas')}</SelectItem>
                    <SelectItem value="sistema">{t('ambitos.sistema')}</SelectItem>
                    <SelectItem value="organizacion">{t('ambitos.organizacion')}</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <FormField etiqueta={t('filtros.uso')}>
              {(c) => (
                <SegmentedControl
                  aria-labelledby={c.idEtiqueta}
                  anchoCompleto
                  valor={uso}
                  onValorChange={(v) => listado.setFiltro('uso', v === 'todas' ? null : v)}
                  opciones={(['todas', 'conProductos', 'sinUso'] as const).map((v) => ({ valor: v, etiqueta: t(`filtros.usos.${v}`) }))}
                />
              )}
            </FormField>
            <FormField etiqueta={t('filtros.conversiones')}>
              {(c) => (
                <SegmentedControl
                  aria-labelledby={c.idEtiqueta}
                  anchoCompleto
                  valor={sinConversion ? 'sin' : 'todas'}
                  onValorChange={(v) => listado.setFiltro('conversiones', v === 'sin' ? 'sin' : null)}
                  opciones={[
                    { valor: 'todas', etiqueta: t('filtros.usos.todas') },
                    { valor: 'sin', etiqueta: t('filtros.sinConversion') },
                  ]}
                />
              )}
            </FormField>
            <p className="text-xs text-fg-muted">{t('filtros.nota')}</p>
          </FilterPanel>
        }
        chips={<FilterChips chips={chips} onQuitar={(c) => listado.setFiltro(c, null)} onLimpiarTodo={listado.limpiarTodo} />}
      />

      <DataTable
        etiqueta={t('tituloUnidades')}
        columnas={columnas}
        filas={pagina}
        obtenerId={(u) => u.codigo}
        estado={estadoTabla}
        orden={listado.orden}
        onOrdenar={listado.ordenarPor}
        seleccion={seleccion}
        onSeleccionChange={setSeleccion}
        etiquetaFila={(u) => `${u.codigo} · ${u.nombre}`}
        acciones={accionesDe}
        onFilaClick={(u) => (permisos.editar && u.ambito === 'organizacion' ? acciones.editar(u) : acciones.verConversiones(u))}
        tarjetaMovil={(u, ctx) => (
          <ListCard
            icono={Ruler}
            titulo={`${u.codigo} · ${u.nombre}`}
            subtitulo={[u.tipo ? t(`tipos.${u.tipo}`) : null, t(`ambitos.${u.ambito}`)].filter(Boolean).join(' · ')}
            meta={u.conversiones ? t('tarjeta.conversiones', { n: u.conversiones }) : t('tarjeta.sinConversion')}
            valor={fmt(u.productos)}
            estado={
              u.ambito === 'organizacion' ? (
                <StatusBadge estado="propia" etiqueta={t('tarjeta.propia')} tono="marca" tamano="sm" />
              ) : u.conversiones === 0 ? (
                <StatusBadge estado="sin" etiqueta={t('tarjeta.sinConv')} tono="advertencia" tamano="sm" />
              ) : undefined
            }
            acciones={accionesDe(u)}
            seleccionable={ctx.modoSeleccion}
            seleccionado={ctx.seleccionado}
            onSeleccionChange={ctx.alternar}
            onMantenerPulsado={() => ctx.alternar(true)}
            onClick={() => (permisos.editar && u.ambito === 'organizacion' ? acciones.editar(u) : acciones.verConversiones(u))}
          />
        )}
        vacio={{
          titulo: t('vacio.unidades.titulo'),
          descripcion: t('vacio.unidades.descripcion'),
          accion: permisos.editar ? { etiqueta: t('nuevaUnidad'), onClick: acciones.nueva, icono: Plus } : undefined,
        }}
        sinPermiso={{ titulo: t('sinPermiso.titulo'), descripcion: t('sinPermiso.descripcion') }}
        error={{ titulo: t('errorCarga') }}
        onReintentar={onReintentar}
        onLimpiarFiltros={listado.limpiarTodo}
        termino={listado.busqueda || undefined}
        pie={
          <Pagination
            pagina={rango.pagina}
            tamano={listado.tamano}
            total={filtradas.length}
            onPaginaChange={listado.setPagina}
            onTamanoChange={listado.setTamano}
            sustantivo={{ singular: t('sustantivo.unidad'), plural: t('sustantivo.unidades') }}
            cargando={estado === 'cargando'}
          />
        }
      />

      <BulkActionBar
        seleccionados={seleccion.size}
        total={filtradas.length}
        onSeleccionarTodos={() => setSeleccion(new Set(filtradas.map((u) => u.codigo)))}
        sustantivo={{ singular: t('sustantivo.unidad'), plural: t('sustantivo.unidades') }}
        acciones={[
          { id: 'exportar', etiqueta: t('masivo.exportar'), icono: Download, onClick: () => acciones.exportar(seleccionadas) },
          ...(permisos.eliminar
            ? [
                {
                  id: 'eliminar',
                  etiqueta: t('masivo.eliminar'),
                  icono: Trash2,
                  destructiva: true,
                  onClick: () => acciones.eliminar(seleccionadas.filter(unidadEliminable)),
                  deshabilitada: !seleccionadas.some(unidadEliminable),
                  motivo: t('masivo.motivoEliminarUnidades'),
                },
              ]
            : []),
        ]}
        onLimpiar={() => setSeleccion(new Set())}
      />
    </div>
  );
}
