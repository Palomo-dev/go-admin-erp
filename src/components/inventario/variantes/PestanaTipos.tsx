'use client';

import { useMemo, useState } from 'react';
import {
  ArrowUpDown,
  CircleDashed,
  Copy,
  Download,
  Eye,
  LayoutGrid,
  Layers,
  List,
  Merge,
  Pencil,
  Power,
  Rows3,
  SpellCheck,
  Tag,
  Trash2,
} from 'lucide-react';
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
  ViewToggle,
  calcularRango,
  normalizarBusqueda,
  type AccionFila,
  type ColumnaTabla,
  type ListadoServidor,
} from '@/components/kit';
import type { EstiloTipo, ResumenVariantes, TipoVariante, ValorVariante } from './tipos';
import {
  cifrasTipos,
  estadoDe,
  mapaRepetidos,
  pasaFiltroEstado,
  sePuedeEliminar,
  type FiltroEstado,
} from './logicaVariantes';
import { BadgeEstadoCatalogo, BadgeEstilo } from './piezas';

export interface AccionesTipos {
  nuevo: () => void;
  editar: (tipo: TipoVariante) => void;
  verValores: (tipo: TipoVariante) => void;
  ordenarValores: (tipo: TipoVariante) => void;
  unificar: (tipo: TipoVariante) => void;
  fusionar: (tipos: TipoVariante[]) => void;
  activar: (tipos: TipoVariante[], activo: boolean) => void;
  estilo: (tipos: TipoVariante[], estilo: EstiloTipo) => void;
  eliminar: (tipos: TipoVariante[]) => void;
  copiarId: (tipo: TipoVariante) => void;
  exportar: (tipos: TipoVariante[]) => void;
}

export interface PestanaTiposProps {
  resumen: ResumenVariantes | null;
  estado: 'cargando' | 'listo' | 'error' | 'sinPermiso';
  listado: ListadoServidor;
  permisos: { editar: boolean; eliminar: boolean };
  acciones: AccionesTipos;
  onReintentar: () => void;
}

type Vista = 'lista' | 'tarjetas';

/**
 * Pestaña «Tipos» de /app/inventario/variantes (Figma `969:595073` tabla,
 * `971:593241` tarjetas, `971:594169` menú, `971:594795` selección, móvil
 * `972:607790`). Datos del resumen del servidor: sin traer variantes al
 * navegador.
 */
export function PestanaTipos({ resumen, estado, listado, permisos, acciones, onReintentar }: PestanaTiposProps) {
  const t = useTranslations('inventarioVariantes');
  const locale = useLocale();
  const fmt = (n: number) => n.toLocaleString(locale);
  const [vista, setVista] = useState<Vista>('lista');
  const [seleccion, setSeleccion] = useState<Set<string>>(() => new Set());

  const tipos = useMemo(() => resumen?.tipos ?? [], [resumen]);
  const valoresPorTipo = useMemo(() => {
    const mapa = new Map<number, ValorVariante[]>();
    for (const v of resumen?.valores ?? []) mapa.set(v.tipo_id, [...(mapa.get(v.tipo_id) ?? []), v]);
    return mapa;
  }, [resumen]);
  const repetidos = useMemo(() => mapaRepetidos(tipos, (x) => x.nombre), [tipos]);
  const cifras = useMemo(() => cifrasTipos({ tipos, valores: resumen?.valores ?? [] }), [tipos, resumen]);

  const filtroEstado = (listado.filtros.estado as FiltroEstado | undefined) ?? 'todos';
  const filtroEstilo = (listado.filtros.estilo as EstiloTipo | 'todos' | undefined) ?? 'todos';

  const filtrados = useMemo(() => {
    const q = normalizarBusqueda(listado.busqueda);
    const lista = tipos.filter((x) => {
      if (!pasaFiltroEstado(estadoDe(x, repetidos), filtroEstado)) return false;
      if (filtroEstilo !== 'todos' && x.estilo !== filtroEstilo) return false;
      if (!q) return true;
      if (normalizarBusqueda(x.nombre).includes(q)) return true;
      return (valoresPorTipo.get(x.id) ?? []).some((v) => normalizarBusqueda(v.valor).includes(q));
    });
    const o = listado.orden ?? { campo: 'orden', direccion: 'asc' as const };
    const signo = o.direccion === 'asc' ? 1 : -1;
    return [...lista].sort((a, b) => {
      if (o.campo === 'nombre') return signo * a.nombre.localeCompare(b.nombre, locale);
      if (o.campo === 'valores') return signo * ((valoresPorTipo.get(a.id)?.length ?? 0) - (valoresPorTipo.get(b.id)?.length ?? 0));
      if (o.campo === 'variantes') return signo * (a.variantes - b.variantes);
      return signo * (a.orden - b.orden || a.id - b.id);
    });
  }, [tipos, listado.busqueda, listado.orden, filtroEstado, filtroEstilo, repetidos, valoresPorTipo, locale]);

  const rango = calcularRango(listado.pagina, listado.tamano, filtrados.length);
  const pagina = filtrados.slice((rango.pagina - 1) * listado.tamano, rango.pagina * listado.tamano);
  const seleccionados = tipos.filter((x) => seleccion.has(String(x.id)));
  const limpiarSeleccion = () => setSeleccion(new Set());

  const vistaPreviaValores = (tipo: TipoVariante) => {
    const vals = valoresPorTipo.get(tipo.id) ?? [];
    const principal = repetidos.get(tipo.id);
    const texto = vals.slice(0, 6).map((v) => v.valor).join(' · ') + (vals.length > 6 ? ` · +${vals.length - 6}` : '');
    if (principal) return `${texto}${texto ? ' — ' : ''}${t('tipos.igualA', { nombre: principal.nombre })}`;
    return texto || t('tipos.sinValores');
  };

  const accionesDe = (x: TipoVariante): AccionFila[] => {
    const n = valoresPorTipo.get(x.id)?.length ?? 0;
    const eliminable = sePuedeEliminar(x);
    return [
      { id: 'editar', etiqueta: t('acciones.editarTipo'), icono: Pencil, onSelect: () => acciones.editar(x), oculta: !permisos.editar },
      { id: 'valores', etiqueta: t('acciones.verValores', { n }), icono: List, onSelect: () => acciones.verValores(x) },
      {
        id: 'ordenar',
        etiqueta: t('acciones.ordenarValores'),
        icono: ArrowUpDown,
        onSelect: () => acciones.ordenarValores(x),
        oculta: !permisos.editar || n < 2,
      },
      {
        id: 'unificar',
        etiqueta: t('acciones.unificar', { nombre: x.nombre }),
        icono: SpellCheck,
        onSelect: () => acciones.unificar(x),
        oculta: !permisos.editar || x.escrituras.length === 0,
      },
      {
        id: 'estilo',
        etiqueta: t('acciones.estilo'),
        descripcion: t('acciones.estiloDetalle'),
        icono: Eye,
        onSelect: () => acciones.editar(x),
        oculta: !permisos.editar,
      },
      { id: 'fusionar', etiqueta: t('acciones.fusionarCon'), icono: Merge, onSelect: () => acciones.fusionar([x]), oculta: !permisos.editar || tipos.length < 2 },
      { id: 'copiar', etiqueta: t('acciones.copiarId'), icono: Copy, onSelect: () => acciones.copiarId(x) },
      {
        id: 'activar',
        etiqueta: x.activo ? t('acciones.desactivar') : t('acciones.activar'),
        descripcion: x.activo ? t('acciones.desactivarDetalle', { n: x.variantes }) : undefined,
        icono: Power,
        onSelect: () => acciones.activar([x], !x.activo),
        oculta: !permisos.editar,
      },
      {
        id: 'eliminar',
        etiqueta: t('acciones.eliminar'),
        icono: Trash2,
        destructiva: true,
        onSelect: () => acciones.eliminar([x]),
        deshabilitada: !eliminable,
        motivo: t('acciones.motivoEnUso', { n: x.variantes + x.relaciones }),
        oculta: !permisos.eliminar,
      },
    ];
  };

  const columnas: ColumnaTabla<TipoVariante>[] = [
    { id: 'orden', encabezado: t('columnas.orden'), ordenable: true, ancho: 88, celda: (x) => <span className="tabular-nums text-fg-secondary">{x.orden + 1}</span> },
    {
      id: 'nombre',
      encabezado: t('columnas.tipo'),
      ordenable: true,
      celda: (x) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-fg">{x.nombre}</span>
          <span className="truncate text-xs text-fg-secondary">{vistaPreviaValores(x)}</span>
        </span>
      ),
    },
    { id: 'estilo', encabezado: t('columnas.estilo'), ocultarDebajo: 'md', celda: (x) => <BadgeEstilo estilo={x.estilo} /> },
    { id: 'estado', encabezado: t('columnas.estado'), ocultarDebajo: 'sm', celda: (x) => <BadgeEstadoCatalogo estado={estadoDe(x, repetidos)} /> },
    {
      id: 'valores',
      encabezado: t('columnas.valores'),
      ordenable: true,
      variante: 'importe',
      ancho: 96,
      celda: (x) => {
        const n = valoresPorTipo.get(x.id)?.length ?? 0;
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              acciones.verValores(x);
            }}
            className="font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            aria-label={t('acciones.verValores', { n })}
          >
            {fmt(n)}
          </button>
        );
      },
    },
    {
      id: 'variantes',
      encabezado: t('columnas.variantes'),
      ordenable: true,
      variante: 'importe',
      ancho: 110,
      celda: (x) => <span className={x.variantes === 0 ? 'text-fg-muted' : 'text-fg'}>{fmt(x.variantes)}</span>,
    },
  ];

  const estadoTabla =
    estado === 'cargando'
      ? 'cargando'
      : estado === 'error'
        ? 'error'
        : estado === 'sinPermiso'
          ? 'sinPermiso'
          : tipos.length === 0
            ? 'vacio'
            : filtrados.length === 0
              ? 'sinResultados'
              : 'listo';

  const chips = [
    ...(filtroEstado !== 'todos' ? [{ clave: 'estado', etiqueta: `${t('filtros.estado')}: ${t(`filtros.estados.${filtroEstado}`)}` }] : []),
    ...(filtroEstilo !== 'todos' ? [{ clave: 'estilo', etiqueta: `${t('filtros.estilo')}: ${t(`estilos.${filtroEstilo}`)}` }] : []),
  ];

  const tarjeta = (x: TipoVariante, extra?: { seleccionable: boolean; seleccionado: boolean; alternar: (v: boolean) => void }) => (
    <ListCard
      icono={Layers}
      titulo={x.nombre}
      subtitulo={vistaPreviaValores(x)}
      etiquetas={
        <>
          <BadgeEstadoCatalogo estado={estadoDe(x, repetidos)} />
          <BadgeEstilo estilo={x.estilo} />
        </>
      }
      meta={t('tarjeta.meta', { valores: valoresPorTipo.get(x.id)?.length ?? 0, variantes: x.variantes })}
      acciones={accionesDe(x)}
      seleccionable={extra?.seleccionable}
      seleccionado={extra?.seleccionado}
      onSeleccionChange={extra?.alternar}
      onMantenerPulsado={permisos.editar || permisos.eliminar ? () => extra?.alternar(true) : undefined}
      onClick={permisos.editar ? () => acciones.editar(x) : () => acciones.verValores(x)}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <KpiStrip etiqueta={t('kpi.etiquetaTipos')}>
        <StatCard
          etiqueta={t('kpi.tiposActivos')}
          valor={fmt(cifras.activos)}
          detalle={
            tipos.length
              ? t('kpi.tiposActivosDetalle', {
                  nombres: tipos.slice(0, 3).map((x) => x.nombre).join(', '),
                  mas: Math.max(tipos.length - 3, 0),
                })
              : t('kpi.ninguno')
          }
          icono={Layers}
          cargando={estado === 'cargando'}
          onClick={() => listado.setFiltro('estado', 'activos')}
        />
        <StatCard
          etiqueta={t('kpi.valores')}
          valor={fmt(cifras.valores)}
          detalle={t('kpi.valoresDetalle', { tipos: cifras.tiposConValores, sinOrden: cifras.sinOrden })}
          icono={Tag}
          cargando={estado === 'cargando'}
        />
        <StatCard
          etiqueta={t('kpi.repetidos')}
          valor={fmt(cifras.repetidos.length)}
          detalle={
            cifras.repetidos.length
              ? t('kpi.repetidosDetalle', { ejemplo: cifras.repetidos[0].map((x) => `«${x.nombre}»`).slice(0, 3).join(' = ') })
              : t('kpi.repetidosNinguno')
          }
          tono={cifras.repetidos.length ? 'advertencia' : 'neutro'}
          icono={Merge}
          cargando={estado === 'cargando'}
          onClick={cifras.repetidos.length && permisos.editar ? () => acciones.fusionar(cifras.repetidos[0]) : () => listado.setFiltro('estado', 'repetidos')}
        />
        <StatCard
          etiqueta={t('kpi.sinUsar')}
          valor={fmt(cifras.sinUsar.length)}
          detalle={cifras.sinUsar.length ? t('kpi.sinUsarDetalleTipos') : t('kpi.sinUsarNinguno')}
          icono={CircleDashed}
          cargando={estado === 'cargando'}
          onClick={() => listado.setFiltro('estado', 'sinUsar')}
        />
      </KpiStrip>

      <ListToolbar
        busqueda={<SearchInput value={listado.busqueda} onChange={listado.setBusqueda} placeholder={t('buscarTipo')} etiqueta={t('buscarTipo')} />}
        filtros={
          <div className="flex items-center gap-2">
            <ViewToggle<Vista>
              valor={vista}
              onValorChange={setVista}
              etiqueta={t('vista.etiqueta')}
              opciones={[
                { valor: 'lista', etiqueta: t('vista.tabla'), icono: Rows3 },
                { valor: 'tarjetas', etiqueta: t('vista.tarjetas'), icono: LayoutGrid },
              ]}
            />
            <FilterPanel conteo={listado.filtrosActivos} onLimpiar={listado.limpiarFiltros} textoVerResultados={t('verResultados', { n: filtrados.length })}>
              <FormField etiqueta={t('filtros.estado')}>
                {(c) => (
                  <SegmentedControl
                    aria-labelledby={c.idEtiqueta}
                    anchoCompleto
                    valor={filtroEstado}
                    onValorChange={(v) => listado.setFiltro('estado', v === 'todos' ? null : v)}
                    opciones={(['todos', 'activos', 'repetidos', 'sinUsar', 'inactivos'] as const).map((v) => ({
                      valor: v,
                      etiqueta: t(`filtros.estados.${v}`),
                    }))}
                  />
                )}
              </FormField>
              <FormField etiqueta={t('filtros.estilo')}>
                {(c) => (
                  <SegmentedControl
                    aria-labelledby={c.idEtiqueta}
                    anchoCompleto
                    valor={filtroEstilo}
                    onValorChange={(v) => listado.setFiltro('estilo', v === 'todos' ? null : v)}
                    opciones={[
                      { valor: 'todos', etiqueta: t('filtros.estados.todos') },
                      { valor: 'texto', etiqueta: t('estilos.texto') },
                      { valor: 'color', etiqueta: t('estilos.color') },
                      { valor: 'imagen', etiqueta: t('estilos.imagen') },
                    ]}
                  />
                )}
              </FormField>
            </FilterPanel>
          </div>
        }
        chips={<FilterChips chips={chips} onQuitar={(c) => listado.setFiltro(c, null)} onLimpiarTodo={listado.limpiarTodo} />}
      />

      {vista === 'tarjetas' && estadoTabla === 'listo' ? (
        <div className="flex flex-col gap-3">
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label={t('tipos.titulo')}>
            {pagina.map((x) => (
              <li key={x.id}>{tarjeta(x)}</li>
            ))}
          </ul>
          <Pagination
            pagina={rango.pagina}
            tamano={listado.tamano}
            total={filtrados.length}
            onPaginaChange={listado.setPagina}
            onTamanoChange={listado.setTamano}
            sustantivo={{ singular: t('sustantivo.tipo'), plural: t('sustantivo.tipos') }}
          />
        </div>
      ) : (
        <DataTable
          etiqueta={t('tipos.titulo')}
          columnas={columnas}
          filas={pagina}
          obtenerId={(x) => String(x.id)}
          estado={estadoTabla}
          orden={listado.orden}
          onOrdenar={listado.ordenarPor}
          seleccion={permisos.editar || permisos.eliminar ? seleccion : undefined}
          onSeleccionChange={permisos.editar || permisos.eliminar ? setSeleccion : undefined}
          etiquetaFila={(x) => x.nombre}
          acciones={accionesDe}
          tonoFila={(x) => (repetidos.has(x.id) ? 'advertencia' : undefined)}
          onFilaClick={permisos.editar ? acciones.editar : acciones.verValores}
          tarjetaMovil={(x, ctx) => tarjeta(x, { seleccionable: ctx.modoSeleccion, seleccionado: ctx.seleccionado, alternar: ctx.alternar })}
          vacio={{
            titulo: t('vacio.tipos.titulo'),
            descripcion: t('vacio.tipos.descripcion'),
            accion: permisos.editar ? { etiqueta: t('nuevoTipo'), onClick: acciones.nuevo } : undefined,
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
              total={filtrados.length}
              onPaginaChange={listado.setPagina}
              onTamanoChange={listado.setTamano}
              sustantivo={{ singular: t('sustantivo.tipo'), plural: t('sustantivo.tipos') }}
              cargando={estado === 'cargando'}
            />
          }
        />
      )}

      <BulkActionBar
        seleccionados={seleccion.size}
        total={filtrados.length}
        onSeleccionarTodos={() => setSeleccion(new Set(filtrados.map((x) => String(x.id))))}
        sustantivo={{ singular: t('sustantivo.tipo'), plural: t('sustantivo.tipos') }}
        acciones={[
          ...(permisos.editar
            ? [
                {
                  id: 'fusionar',
                  etiqueta: t('masivo.fusionar'),
                  icono: Merge,
                  onClick: () => acciones.fusionar(seleccionados),
                  deshabilitada: seleccionados.length < 2,
                  motivo: t('masivo.motivoFusionar'),
                },
                {
                  id: 'estilo',
                  etiqueta: t('masivo.estilo'),
                  icono: Eye,
                  onClick: () => undefined,
                  menu: [
                    {
                      acciones: (['texto', 'color', 'imagen'] as const).map((e) => ({
                        id: `estilo-${e}`,
                        etiqueta: t(`estilos.${e}`),
                        icono: Eye,
                        onSelect: () => {
                          acciones.estilo(seleccionados, e);
                          limpiarSeleccion();
                        },
                      })),
                    },
                  ],
                },
              ]
            : []),
          { id: 'exportar', etiqueta: t('masivo.exportar'), icono: Download, onClick: () => acciones.exportar(seleccionados) },
          ...(permisos.editar
            ? [
                {
                  id: 'desactivar',
                  etiqueta: t('masivo.desactivar'),
                  icono: Power,
                  onClick: () => {
                    acciones.activar(seleccionados, false);
                    limpiarSeleccion();
                  },
                },
              ]
            : []),
        ]}
        accionesSecundarias={[
          {
            id: 'activar',
            etiqueta: t('masivo.activar'),
            icono: Power,
            onSelect: () => {
              acciones.activar(seleccionados, true);
              limpiarSeleccion();
            },
            oculta: !permisos.editar,
          },
          {
            id: 'eliminar',
            etiqueta: t('masivo.eliminarSinUso'),
            icono: Trash2,
            destructiva: true,
            onSelect: () => acciones.eliminar(seleccionados.filter(sePuedeEliminar)),
            deshabilitada: !seleccionados.some(sePuedeEliminar),
            motivo: t('masivo.motivoEliminar'),
            oculta: !permisos.eliminar,
          },
        ]}
        onLimpiar={limpiarSeleccion}
      />
    </div>
  );
}

