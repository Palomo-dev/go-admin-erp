'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, CircleDashed, Download, Eye, GripVertical, Info, Merge, Palette, Pencil, Power, SpellCheck, Tag, Trash2 } from 'lucide-react';
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
  calcularRango,
  normalizarBusqueda,
  type AccionFila,
  type ColumnaTabla,
  type ListadoServidor,
} from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IDIOMAS_TRADUCCION, type ResumenVariantes, type TipoVariante, type ValorVariante } from './tipos';
import { cifrasValores, estadoDe, mapaRepetidos, pasaFiltroEstado, sePuedeEliminar, traduccionesFaltantes, type FiltroEstado } from './logicaVariantes';
import { BadgeEstadoCatalogo, MuestraColor } from './piezas';

const TODOS = 'todos';

export interface AccionesValores {
  nuevo: (tipo: number | null) => void;
  editar: (valor: ValorVariante) => void;
  mover: (valor: ValorVariante, delta: -1 | 1) => void;
  ordenar: (tipo: TipoVariante) => void;
  unificar: (valor: ValorVariante) => void;
  fusionar: (valores: ValorVariante[]) => void;
  activar: (valores: ValorVariante[], activo: boolean) => void;
  eliminar: (valores: ValorVariante[]) => void;
  exportar: (valores: ValorVariante[]) => void;
}

export interface PestanaValoresProps {
  resumen: ResumenVariantes | null;
  estado: 'cargando' | 'listo' | 'error' | 'sinPermiso';
  listado: ListadoServidor;
  permisos: { editar: boolean; eliminar: boolean };
  acciones: AccionesValores;
  onReintentar: () => void;
}

/**
 * Pestaña «Valores» (Figma `972:600617` «Talla» con orden, `972:601473`
 * «Color» con muestras, móvil `972:608438`). Se filtra por tipo (`?tipo=`); el
 * orden se cambia con ↑ ↓ del menú o con «Ordenar» (arrastrar).
 */
export function PestanaValores({ resumen, estado, listado, permisos, acciones, onReintentar }: PestanaValoresProps) {
  const t = useTranslations('inventarioVariantes');
  const locale = useLocale();
  const fmt = (n: number) => n.toLocaleString(locale);
  const [seleccion, setSeleccion] = useState<Set<string>>(() => new Set());

  const tipos = useMemo(() => resumen?.tipos ?? [], [resumen]);
  const todos = useMemo(() => resumen?.valores ?? [], [resumen]);
  const tipoId = listado.filtros.tipo ? Number(listado.filtros.tipo) : null;
  const tipo = tipos.find((x) => x.id === tipoId) ?? null;
  const nombreTipo = useMemo(() => new Map(tipos.map((x) => [x.id, x.nombre])), [tipos]);
  const delAlcance = useMemo(() => (tipo ? todos.filter((v) => v.tipo_id === tipo.id) : todos), [todos, tipo]);

  const repetidos = useMemo(() => {
    const mapa = new Map<number, ValorVariante>();
    const porTipo = new Map<number, ValorVariante[]>();
    for (const v of todos) porTipo.set(v.tipo_id, [...(porTipo.get(v.tipo_id) ?? []), v]);
    for (const grupo of porTipo.values()) for (const [id, p] of mapaRepetidos(grupo, (v) => v.valor)) mapa.set(id, p);
    return mapa;
  }, [todos]);
  const cifras = useMemo(() => cifrasValores(delAlcance), [delAlcance]);
  const filtroEstado = (listado.filtros.estado as FiltroEstado | undefined) ?? 'todos';

  const filtrados = useMemo(() => {
    const q = normalizarBusqueda(listado.busqueda);
    const lista = delAlcance.filter((v) => {
      if (!pasaFiltroEstado(estadoDe(v, repetidos), filtroEstado)) return false;
      return !q || normalizarBusqueda(v.valor).includes(q) || normalizarBusqueda(v.sku ?? '').includes(q);
    });
    const o = listado.orden ?? { campo: 'orden', direccion: 'asc' as const };
    const signo = o.direccion === 'asc' ? 1 : -1;
    return [...lista].sort((a, b) => {
      if (o.campo === 'valor') return signo * a.valor.localeCompare(b.valor, locale, { numeric: true });
      if (o.campo === 'variantes') return signo * (a.variantes - b.variantes);
      return signo * ((nombreTipo.get(a.tipo_id) ?? '').localeCompare(nombreTipo.get(b.tipo_id) ?? '', locale) || a.orden - b.orden || a.id - b.id);
    });
  }, [delAlcance, listado.busqueda, listado.orden, filtroEstado, repetidos, nombreTipo, locale]);

  const rango = calcularRango(listado.pagina, listado.tamano, filtrados.length);
  const pagina = filtrados.slice((rango.pagina - 1) * listado.tamano, rango.pagina * listado.tamano);
  const seleccionados = todos.filter((v) => seleccion.has(String(v.id)));
  const mismoTipo = seleccionados.length > 1 && seleccionados.every((v) => v.tipo_id === seleccionados[0].tipo_id);
  const limpiarSeleccion = () => setSeleccion(new Set());
  const ordenPorTipo = useMemo(() => {
    const mapa = new Map<number, number[]>();
    for (const v of [...todos].sort((a, b) => a.orden - b.orden || a.id - b.id)) mapa.set(v.tipo_id, [...(mapa.get(v.tipo_id) ?? []), v.id]);
    return mapa;
  }, [todos]);

  const detalleValor = (v: ValorVariante) => {
    const principal = repetidos.get(v.id);
    if (principal) return t('valores.igualA', { nombre: principal.valor });
    const partes = [v.sku ? t('valores.codigoSku', { codigo: v.sku }) : null, !tipo ? nombreTipo.get(v.tipo_id) : null].filter(Boolean);
    return partes.join(' · ');
  };

  const accionesDe = (v: ValorVariante): AccionFila[] => {
    const ids = ordenPorTipo.get(v.tipo_id) ?? [];
    const pos = ids.indexOf(v.id);
    return [
      { id: 'editar', etiqueta: t('acciones.editarValor'), icono: Pencil, onSelect: () => acciones.editar(v), oculta: !permisos.editar },
      { id: 'subir', etiqueta: t('acciones.subir'), icono: ArrowUp, onSelect: () => acciones.mover(v, -1), oculta: !permisos.editar || pos <= 0 },
      { id: 'bajar', etiqueta: t('acciones.bajar'), icono: ArrowDown, onSelect: () => acciones.mover(v, 1), oculta: !permisos.editar || pos < 0 || pos >= ids.length - 1 },
      {
        id: 'unificar',
        etiqueta: t('acciones.unificar', { nombre: v.valor }),
        icono: SpellCheck,
        onSelect: () => acciones.unificar(v),
        oculta: !permisos.editar || v.escrituras.length === 0,
      },
      {
        id: 'fusionar',
        etiqueta: t('acciones.fusionarCon'),
        icono: Merge,
        onSelect: () => acciones.fusionar([v]),
        oculta: !permisos.editar || (ordenPorTipo.get(v.tipo_id)?.length ?? 0) < 2,
      },
      {
        id: 'activar',
        etiqueta: v.activo ? t('acciones.desactivar') : t('acciones.activar'),
        icono: Power,
        onSelect: () => acciones.activar([v], !v.activo),
        oculta: !permisos.editar,
      },
      {
        id: 'eliminar',
        etiqueta: t('acciones.eliminar'),
        icono: Trash2,
        destructiva: true,
        onSelect: () => acciones.eliminar([v]),
        deshabilitada: !sePuedeEliminar(v),
        motivo: t('acciones.motivoEnUso', { n: v.variantes + v.relaciones }),
        oculta: !permisos.eliminar,
      },
    ];
  };

  const traduccionesDe = (v: ValorVariante) => {
    const faltan = traduccionesFaltantes(v.traducciones, IDIOMAS_TRADUCCION);
    if (faltan.length === IDIOMAS_TRADUCCION.length) return <span className="text-fg-muted">—</span>;
    if (faltan.length === 0) return <span className="text-fg-secondary">{IDIOMAS_TRADUCCION.join(' · ')}</span>;
    return <span className="text-warning-text">{t('valores.falta', { idiomas: faltan.join(' · ') })}</span>;
  };

  const columnas: ColumnaTabla<ValorVariante>[] = [
    {
      id: 'orden',
      encabezado: t('columnas.orden'),
      ordenable: true,
      ancho: 88,
      celda: (v) => (
        <span className="inline-flex items-center gap-1.5 tabular-nums text-fg-secondary">
          <GripVertical aria-hidden className="size-4 text-fg-muted" strokeWidth={1.5} />
          {(ordenPorTipo.get(v.tipo_id)?.indexOf(v.id) ?? 0) + 1}
        </span>
      ),
    },
    {
      id: 'valor',
      encabezado: t('columnas.valor'),
      ordenable: true,
      celda: (v) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-fg">{v.valor}</span>
          {detalleValor(v) && <span className="truncate text-xs text-fg-secondary">{detalleValor(v)}</span>}
        </span>
      ),
    },
    { id: 'muestra', encabezado: t('columnas.muestra'), ocultarDebajo: 'md', celda: (v) => <MuestraColor hex={v.hex} /> },
    { id: 'estado', encabezado: t('columnas.estado'), ocultarDebajo: 'sm', celda: (v) => <BadgeEstadoCatalogo estado={estadoDe(v, repetidos)} /> },
    {
      id: 'variantes',
      encabezado: t('columnas.variantes'),
      ordenable: true,
      variante: 'importe',
      ancho: 110,
      celda: (v) => <span className={v.variantes === 0 ? 'text-fg-muted' : 'text-fg'}>{fmt(v.variantes)}</span>,
    },
    { id: 'traducciones', encabezado: t('columnas.traducciones'), ocultarDebajo: 'lg', celda: traduccionesDe },
  ];

  const estadoTabla =
    estado === 'cargando'
      ? 'cargando'
      : estado === 'error'
        ? 'error'
        : estado === 'sinPermiso'
          ? 'sinPermiso'
          : delAlcance.length === 0 && !listado.busqueda && filtroEstado === 'todos'
            ? 'vacio'
            : filtrados.length === 0
              ? 'sinResultados'
              : 'listo';

  const chips = [
    ...(tipo ? [{ clave: 'tipo', etiqueta: `${t('filtros.tipo')}: ${tipo.nombre}` }] : []),
    ...(filtroEstado !== 'todos' ? [{ clave: 'estado', etiqueta: `${t('filtros.estado')}: ${t(`filtros.estados.${filtroEstado}`)}` }] : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <KpiStrip etiqueta={t('kpi.etiquetaValores')}>
        <StatCard
          etiqueta={t('kpi.valores')}
          valor={fmt(cifras.total)}
          detalle={tipo ? t('kpi.valoresDe', { tipo: tipo.nombre }) : t('kpi.valoresEnTipos', { n: tipos.length })}
          icono={Tag}
          cargando={estado === 'cargando'}
        />
        <StatCard
          etiqueta={t('kpi.conMuestra')}
          valor={fmt(cifras.conMuestra)}
          detalle={t('kpi.conMuestraDetalle')}
          icono={Palette}
          cargando={estado === 'cargando'}
        />
        <StatCard
          etiqueta={t('kpi.valoresRepetidos')}
          valor={fmt(cifras.repetidos.length)}
          detalle={
            cifras.repetidos.length
              ? t('kpi.repetidosDetalle', { ejemplo: cifras.repetidos[0].map((v) => `«${v.valor}»`).slice(0, 3).join(' = ') })
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
          detalle={cifras.sinUsar.length ? t('kpi.sinUsarDetalleValores') : t('kpi.sinUsarNinguno')}
          icono={CircleDashed}
          cargando={estado === 'cargando'}
          onClick={() => listado.setFiltro('estado', 'sinUsar')}
        />
      </KpiStrip>

      <ListToolbar
        busqueda={<SearchInput value={listado.busqueda} onChange={listado.setBusqueda} placeholder={t('buscarValor')} etiqueta={t('buscarValor')} />}
        filtros={
          <div className="flex items-center gap-2">
            {tipo && permisos.editar && delAlcance.length > 1 && (
              <Button type="button" variant="outline" className="h-10 gap-2" onClick={() => acciones.ordenar(tipo)}>
                <ArrowUpDown aria-hidden className="size-4" strokeWidth={1.5} />
                <span className="hidden sm:inline">{t('acciones.ordenar')}</span>
              </Button>
            )}
            <FilterPanel conteo={listado.filtrosActivos} onLimpiar={listado.limpiarFiltros} textoVerResultados={t('verResultados', { n: filtrados.length })}>
              <FormField etiqueta={t('filtros.tipo')}>
                {(c) => (
                  <Select value={tipo ? String(tipo.id) : TODOS} onValueChange={(v) => listado.setFiltro('tipo', v === TODOS ? null : v)}>
                    <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TODOS}>{t('filtros.todosLosTipos')}</SelectItem>
                      {tipos.map((x) => (
                        <SelectItem key={x.id} value={String(x.id)}>
                          {x.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
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
            </FilterPanel>
          </div>
        }
        chips={<FilterChips chips={chips} onQuitar={(c) => listado.setFiltro(c, null)} onLimpiarTodo={listado.limpiarTodo} />}
      />

      {tipo?.estilo === 'color' && (
        <p className="flex items-start gap-2 rounded-lg bg-info-subtle p-3 text-sm text-info-text">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
          {t('valores.avisoColor', { tipo: tipo.nombre })}
        </p>
      )}

      <DataTable
        etiqueta={tipo ? t('valores.tituloDe', { tipo: tipo.nombre }) : t('valores.titulo')}
        columnas={columnas}
        filas={pagina}
        obtenerId={(v) => String(v.id)}
        estado={estadoTabla}
        orden={listado.orden}
        onOrdenar={listado.ordenarPor}
        seleccion={permisos.editar || permisos.eliminar ? seleccion : undefined}
        onSeleccionChange={permisos.editar || permisos.eliminar ? setSeleccion : undefined}
        etiquetaFila={(v) => v.valor}
        acciones={accionesDe}
        tonoFila={(v) => (repetidos.has(v.id) ? 'advertencia' : undefined)}
        onFilaClick={permisos.editar ? acciones.editar : undefined}
        tarjetaMovil={(v, ctx) => (
          <ListCard
            miniatura={v.hex ? <span aria-hidden className="block size-6 rounded-full border border-line" style={{ backgroundColor: v.hex }} /> : undefined}
            icono={v.hex ? undefined : Tag}
            titulo={v.valor}
            subtitulo={detalleValor(v) || undefined}
            etiquetas={<BadgeEstadoCatalogo estado={estadoDe(v, repetidos)} />}
            meta={t('tarjeta.variantes', { n: v.variantes })}
            acciones={accionesDe(v)}
            seleccionable={ctx.modoSeleccion}
            seleccionado={ctx.seleccionado}
            onSeleccionChange={ctx.alternar}
            onMantenerPulsado={permisos.editar || permisos.eliminar ? () => ctx.alternar(true) : undefined}
            onClick={permisos.editar ? () => acciones.editar(v) : undefined}
          />
        )}
        vacio={{
          titulo: tipo ? t('vacio.valores.tituloDe', { tipo: tipo.nombre }) : t('vacio.valores.titulo'),
          descripcion: t('vacio.valores.descripcion'),
          accion: permisos.editar && tipos.length ? { etiqueta: t('nuevoValor'), onClick: () => acciones.nuevo(tipo?.id ?? null) } : undefined,
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
            sustantivo={{ singular: t('sustantivo.valor'), plural: t('sustantivo.valores') }}
            cargando={estado === 'cargando'}
          />
        }
      />

      <BulkActionBar
        seleccionados={seleccion.size}
        total={filtrados.length}
        onSeleccionarTodos={() => setSeleccion(new Set(filtrados.map((v) => String(v.id))))}
        sustantivo={{ singular: t('sustantivo.valor'), plural: t('sustantivo.valores') }}
        acciones={[
          ...(permisos.editar
            ? [
                {
                  id: 'fusionar',
                  etiqueta: t('masivo.fusionar'),
                  icono: Merge,
                  onClick: () => acciones.fusionar(seleccionados),
                  deshabilitada: !mismoTipo,
                  motivo: t('masivo.motivoFusionarValores'),
                },
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
          { id: 'exportar', etiqueta: t('masivo.exportar'), icono: Download, onClick: () => acciones.exportar(seleccionados) },
        ]}
        accionesSecundarias={[
          {
            id: 'activar',
            etiqueta: t('masivo.activar'),
            icono: Eye,
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
