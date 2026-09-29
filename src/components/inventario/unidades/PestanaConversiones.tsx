'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeftRight, ChefHat, Copy, Download, Package, Pencil, Plus, Scale, Trash2, TriangleAlert } from 'lucide-react';
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
  StatCard,
  StatusBadge,
  calcularRango,
  type AccionFila,
  type ColumnaTabla,
  type ListadoServidor,
} from '@/components/kit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TIPOS_UNIDAD, type Conversion, type ResumenUnidades, type TipoUnidad } from './tipos';
import { equivalencia, filasConversion, filtrarConversiones, tipoDeConversion, type FilaConversion, type FiltroAmbito } from './logicaUnidades';
import { BadgeAmbito, BadgeTipoUnidad } from './piezas';

export interface AccionesConversiones {
  nueva: () => void;
  verRecetas: () => void;
  editar: (c: Conversion) => void;
  crearInversa: (c: Conversion) => void;
  versionOrganizacion: (c: Conversion) => void;
  porProducto: (c: Conversion) => void;
  verInversa: (c: Conversion) => void;
  eliminar: (c: Conversion[]) => void;
  exportar: (c: Conversion[]) => void;
}

export interface PestanaConversionesProps {
  resumen: ResumenUnidades | null;
  estado: 'cargando' | 'listo' | 'error' | 'sinPermiso';
  listado: ListadoServidor;
  permisos: { editar: boolean; eliminar: boolean };
  acciones: AccionesConversiones;
  onReintentar: () => void;
}

/**
 * Pestaña «Conversiones» (Figma `594:339276` y estados, menú `594:342140`,
 * filtros `594:342965`, selección `594:343805`, móvil `595:346655`). Las del
 * sistema son de solo lectura y se agrupan con su inversa; las propias y las
 * de producto se editan y eliminan (la RPC no deja borrar una que una receta
 * activa necesita).
 */
export function PestanaConversiones({ resumen, estado, listado, permisos, acciones, onReintentar }: PestanaConversionesProps) {
  const t = useTranslations('inventarioUnidades');
  const locale = useLocale();
  const fmt = (n: number) => n.toLocaleString(locale);
  const [seleccion, setSeleccion] = useState<Set<string>>(() => new Set());

  const conversiones = useMemo(() => resumen?.conversiones ?? [], [resumen]);
  const kpis = resumen?.kpis;
  const filas = useMemo(() => filasConversion(conversiones), [conversiones]);
  const tipo = (listado.filtros.tipo as TipoUnidad | undefined) ?? 'todos';
  const ambito = (listado.filtros.ambito as FiltroAmbito | undefined) ?? 'todas';
  const unidad = listado.filtros.unidad ?? null;
  const soloRevisar = listado.filtros.revisar === 'si';

  const filtradas = useMemo(
    () => filtrarConversiones(filas, { texto: listado.busqueda, tipo, ambito, unidad, soloRevisar }),
    [filas, listado.busqueda, tipo, ambito, unidad, soloRevisar],
  );
  const rango = calcularRango(listado.pagina, listado.tamano, filtradas.length);
  const pagina = filtradas.slice((rango.pagina - 1) * listado.tamano, rango.pagina * listado.tamano);
  const propias = (c: Conversion) => c.ambito !== 'sistema';
  const seleccionadas = conversiones.filter((c) => seleccion.has(String(c.id)));

  const cuenta = useMemo(
    () => ({
      sistema: conversiones.filter((c) => c.ambito === 'sistema').length,
      organizacion: conversiones.filter((c) => c.ambito === 'organizacion').length,
      producto: conversiones.filter((c) => c.ambito === 'producto').length,
    }),
    [conversiones],
  );
  const ejemploRevisar = useMemo(() => Array.from(new Set(conversiones.filter((c) => c.revisar).map((c) => (c.de === 'UN' ? c.a : c.de)))).slice(0, 3), [conversiones]);

  const inversaTexto = (f: FilaConversion) => {
    const c = f.conversion;
    return f.inversa ? equivalencia(f.inversa.de, f.inversa.a, f.inversa.factor, locale) : equivalencia(c.a, c.de, 1 / c.factor, locale);
  };

  const accionesDe = (f: FilaConversion): AccionFila[] => {
    const c = f.conversion;
    const esSistema = c.ambito === 'sistema';
    return [
      { id: 'recetas', etiqueta: t('acciones.verRecetas'), icono: ChefHat, onSelect: acciones.verRecetas, oculta: c.recetas === 0 },
      { id: 'editar', etiqueta: t('acciones.editarFactor'), icono: Pencil, onSelect: () => acciones.editar(c), oculta: esSistema || !permisos.editar },
      {
        id: 'version',
        etiqueta: t('acciones.versionOrganizacion'),
        icono: Copy,
        onSelect: () => acciones.versionOrganizacion(c),
        oculta: !esSistema || !permisos.editar,
      },
      { id: 'producto', etiqueta: t('acciones.porProducto'), icono: Package, onSelect: () => acciones.porProducto(c), oculta: !permisos.editar },
      {
        id: 'inversa',
        etiqueta: c.inversa_id ? t('acciones.verInversa') : t('acciones.crearInversa'),
        icono: ArrowLeftRight,
        onSelect: () => (c.inversa_id ? acciones.verInversa(c) : acciones.crearInversa(c)),
        oculta: esSistema ? !!f.inversa || !c.inversa_id : !c.inversa_id && !permisos.editar,
      },
      {
        id: 'eliminar',
        etiqueta: t('acciones.eliminar'),
        icono: Trash2,
        destructiva: true,
        onSelect: () => acciones.eliminar([c]),
        oculta: esSistema || !permisos.eliminar,
      },
    ];
  };

  const columnas: ColumnaTabla<FilaConversion>[] = [
    {
      id: 'equivalencia',
      encabezado: t('columnas.equivalencia'),
      celda: ({ conversion: c }) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-fg">{equivalencia(c.de, c.a, c.factor, locale)}</span>
          <span className="truncate text-xs text-fg-secondary">
            {c.nombre_de ?? c.de} → {c.nombre_a ?? c.a}
          </span>
        </span>
      ),
    },
    {
      id: 'tipo',
      encabezado: t('columnas.tipo'),
      ocultarDebajo: 'sm',
      celda: ({ conversion: c }) => {
        const tp = tipoDeConversion(c);
        return tp ? <BadgeTipoUnidad tipo={tp} /> : '—';
      },
    },
    {
      id: 'ambito',
      encabezado: t('columnas.ambito'),
      ocultarDebajo: 'md',
      celda: ({ conversion: c }) => (
        <span className="inline-flex flex-wrap items-center gap-1">
          <BadgeAmbito ambito={c.ambito} producto={c.producto?.nombre} />
          {c.revisar && <StatusBadge estado="revisar" etiqueta={t('revisar')} tono="advertencia" tamano="sm" />}
        </span>
      ),
    },
    { id: 'inversa', encabezado: t('columnas.inversa'), ocultarDebajo: 'lg', celda: (f) => <span className="text-fg-secondary">{inversaTexto(f)}</span> },
    {
      id: 'recetas',
      encabezado: t('columnas.enRecetas'),
      variante: 'importe',
      ancho: 110,
      celda: ({ conversion: c, inversa }) => {
        const n = c.recetas + (inversa?.recetas ?? 0);
        return n > 0 ? (
          <Link href="/app/inventario/recetas" onClick={(e) => e.stopPropagation()} className="font-medium text-link hover:underline">
            {fmt(n)}
          </Link>
        ) : (
          <span className="text-fg-muted">0</span>
        );
      },
    },
  ];

  const estadoTabla =
    estado === 'cargando' ? 'cargando' : estado === 'error' ? 'error' : estado === 'sinPermiso' ? 'sinPermiso' : filtradas.length === 0 ? (filas.length ? 'sinResultados' : 'vacio') : 'listo';

  const chips = [
    ...(tipo !== 'todos' ? [{ clave: 'tipo', etiqueta: `${t('filtros.tipo')}: ${t(`tipos.${tipo}`)}` }] : []),
    ...(ambito !== 'todas' ? [{ clave: 'ambito', etiqueta: `${t('filtros.ambito')}: ${t(`ambitos.${ambito}`)}` }] : []),
    ...(unidad ? [{ clave: 'unidad', etiqueta: `${t('filtros.unidad')}: ${unidad}` }] : []),
    ...(soloRevisar ? [{ clave: 'revisar', etiqueta: t('filtros.soloRevisar') }] : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <KpiStrip etiqueta={t('kpi.etiquetaConversiones')}>
        <StatCard
          etiqueta={t('kpi.conversiones')}
          valor={fmt(conversiones.length)}
          detalle={t('kpi.conversionesDetalle', cuenta)}
          icono={Scale}
          cargando={estado === 'cargando'}
        />
        <StatCard
          etiqueta={t('kpi.usadasRecetas')}
          valor={fmt(kpis?.conversiones_usadas ?? 0)}
          detalle={t('kpi.usadasRecetasDetalle')}
          icono={ChefHat}
          cargando={estado === 'cargando'}
        />
        <StatCard
          etiqueta={t('kpi.porRevisar')}
          valor={fmt(kpis?.conversiones_revisar ?? 0)}
          detalle={kpis?.conversiones_revisar ? t('kpi.porRevisarDetalle', { unidades: ejemploRevisar.join(' y ') }) : t('kpi.porRevisarNinguna')}
          tono={kpis?.conversiones_revisar ? 'advertencia' : 'neutro'}
          iconoDetalle={kpis?.conversiones_revisar ? TriangleAlert : undefined}
          icono={TriangleAlert}
          cargando={estado === 'cargando'}
          onClick={() => listado.setFiltro('revisar', 'si')}
        />
        <StatCard
          etiqueta={t('kpi.ingredientesSinConversion')}
          valor={fmt(kpis?.ingredientes_sin_conversion ?? 0)}
          detalle={kpis?.ingredientes_sin_conversion ? t('kpi.ingredientesSinConversionDetalle') : t('kpi.ingredientesTodos')}
          tono={kpis?.ingredientes_sin_conversion ? 'peligro' : 'neutro'}
          tendencia={kpis?.ingredientes_sin_conversion ? 'baja' : undefined}
          icono={Package}
          cargando={estado === 'cargando'}
          href={kpis?.ingredientes_sin_conversion ? '/app/inventario/reportes/costo-recetas' : undefined}
        />
      </KpiStrip>

      <ListToolbar
        busqueda={<SearchInput value={listado.busqueda} onChange={listado.setBusqueda} placeholder={t('buscarConversion')} etiqueta={t('buscarConversion')} />}
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
                    <SelectItem value="producto">{t('ambitos.producto')}</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <p className="text-xs text-fg-muted">{t('filtros.notaConversiones')}</p>
          </FilterPanel>
        }
        chips={<FilterChips chips={chips} onQuitar={(c) => listado.setFiltro(c, null)} onLimpiarTodo={listado.limpiarTodo} />}
      />

      <DataTable
        etiqueta={t('tituloConversiones')}
        columnas={columnas}
        filas={pagina}
        obtenerId={(f) => String(f.conversion.id)}
        estado={estadoTabla}
        seleccion={permisos.eliminar ? seleccion : undefined}
        onSeleccionChange={permisos.eliminar ? setSeleccion : undefined}
        etiquetaFila={(f) => equivalencia(f.conversion.de, f.conversion.a, f.conversion.factor, locale)}
        acciones={accionesDe}
        tonoFila={(f) => (f.conversion.revisar ? 'advertencia' : undefined)}
        onFilaClick={(f) => (propias(f.conversion) && permisos.editar ? acciones.editar(f.conversion) : undefined)}
        tarjetaMovil={(f, ctx) => (
          <ListCard
            icono={Scale}
            titulo={equivalencia(f.conversion.de, f.conversion.a, f.conversion.factor, locale)}
            subtitulo={inversaTexto(f)}
            etiquetas={
              <>
                <BadgeAmbito ambito={f.conversion.ambito} producto={f.conversion.producto?.nombre} />
                {f.conversion.revisar && <StatusBadge estado="revisar" etiqueta={t('revisar')} tono="advertencia" tamano="sm" />}
              </>
            }
            meta={t('tarjeta.recetas', { n: f.conversion.recetas })}
            acciones={accionesDe(f)}
            seleccionable={ctx.modoSeleccion && propias(f.conversion)}
            seleccionado={ctx.seleccionado}
            onSeleccionChange={ctx.alternar}
            onMantenerPulsado={permisos.eliminar && propias(f.conversion) ? () => ctx.alternar(true) : undefined}
            onClick={propias(f.conversion) && permisos.editar ? () => acciones.editar(f.conversion) : undefined}
          />
        )}
        vacio={{
          titulo: t('vacio.conversiones.titulo'),
          descripcion: t('vacio.conversiones.descripcion'),
          accion: permisos.editar ? { etiqueta: t('nuevaConversion'), onClick: acciones.nueva, icono: Plus } : undefined,
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
            sustantivo={{ singular: t('sustantivo.conversion'), plural: t('sustantivo.conversiones') }}
            cargando={estado === 'cargando'}
          />
        }
      />
      {filtradas.some((f) => f.inversa) && <p className="-mt-2 text-xs text-fg-muted">{t('notaAgrupadas')}</p>}

      <BulkActionBar
        seleccionados={seleccion.size}
        total={filtradas.length}
        onSeleccionarTodos={() => setSeleccion(new Set(filtradas.filter((f) => propias(f.conversion)).map((f) => String(f.conversion.id))))}
        sustantivo={{ singular: t('sustantivo.conversion'), plural: t('sustantivo.conversiones') }}
        acciones={[
          { id: 'exportar', etiqueta: t('masivo.exportar'), icono: Download, onClick: () => acciones.exportar(seleccionadas) },
          {
            id: 'eliminar',
            etiqueta: t('masivo.eliminar'),
            icono: Trash2,
            destructiva: true,
            onClick: () => acciones.eliminar(seleccionadas.filter(propias)),
            deshabilitada: !seleccionadas.some(propias),
            motivo: t('masivo.motivoEliminarConversiones'),
          },
        ]}
        onLimpiar={() => setSeleccion(new Set())}
      />
    </div>
  );
}
