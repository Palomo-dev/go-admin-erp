'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Merge, Package, Pencil, Plus, RefreshCw, Tag, TriangleAlert, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import {
  BulkActionBar,
  DataTable,
  Dialogo,
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
  calcularRango,
  normalizarBusqueda,
  useListadoServidor,
  type AccionFila,
  type ColumnaTabla,
} from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { EtiquetasService } from './EtiquetasService';
import { ProductTag } from './types';

const COLORES_PREDEFINIDOS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
];

type Uso = 'todas' | 'enUso' | 'sinUsar';

/** Nombre comparable: sin tildes ni mayúsculas (la misma regla del buscador del kit). */
const clave = (nombre: string) => normalizarBusqueda(nombre);

/** Chip de la etiqueta con su color (el color es del registro: estilo en línea). */
function ChipEtiqueta({ etiqueta }: { etiqueta: ProductTag }) {
  return (
    <span
      className="inline-flex max-w-full items-center truncate rounded-full border px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: `${etiqueta.color}1A`, color: etiqueta.color, borderColor: `${etiqueta.color}66` }}
    >
      {etiqueta.name}
    </span>
  );
}

/**
 * «Etiquetas de producto» (`/app/inventario/etiquetas`): los *tags* de
 * clasificación, no las etiquetas de papel («Imprimir etiquetas» vive en el
 * catálogo). Figma sección `591:325136` sobre el kit compartido: cifras (en
 * uso, sin usar, nombres repetidos, productos etiquetados), buscador y filtro
 * de uso, tabla con selección y, en lote, «Fusionar» y «Eliminar»; en «⋯» de
 * la cabecera, «Eliminar sin usar».
 */
export function EtiquetasPage() {
  const t = useTranslations('inventarioEtiquetas.tags');
  const locale = useLocale();
  const { toast } = useToast();
  const { formatDate } = useFormatDate();
  const fmtN = useCallback((n: number) => n.toLocaleString(locale), [locale]);

  const listado = useListadoServidor({
    filtros: ['uso'],
    camposOrden: ['nombre', 'productos', 'creada'],
    ordenPorDefecto: { campo: 'nombre', direccion: 'asc' },
    tamanoPorDefecto: 25,
  });

  const [etiquetas, setEtiquetas] = useState<ProductTag[]>([]);
  const [resumen, setResumen] = useState<{ etiquetados: number; total: number } | null>(null);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error'>('cargando');
  const [seleccion, setSeleccion] = useState<Set<string>>(() => new Set());
  const [editando, setEditando] = useState<ProductTag | 'nueva' | null>(null);
  const [formNombre, setFormNombre] = useState('');
  const [formColor, setFormColor] = useState(COLORES_PREDEFINIDOS[0]);
  const [errorNombre, setErrorNombre] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [aEliminar, setAEliminar] = useState<ProductTag[] | null>(null);
  const [fusionar, setFusionar] = useState<ProductTag[] | null>(null);
  const [destino, setDestino] = useState<string>('');
  const [procesando, setProcesando] = useState(false);

  const cargar = useCallback(async () => {
    setEstado('cargando');
    try {
      const [lista, cifras] = await Promise.all([EtiquetasService.obtenerEtiquetas(), EtiquetasService.obtenerResumen()]);
      setEtiquetas(lista);
      setResumen(cifras);
      setEstado('listo');
    } catch (error) {
      console.error('Error cargando etiquetas:', error);
      setEstado('error');
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Grupos de nombres iguales salvo mayúsculas y tildes («Oferta» y «oferta»).
  const repetidos = useMemo(() => {
    const grupos = new Map<string, ProductTag[]>();
    for (const e of etiquetas) grupos.set(clave(e.name), [...(grupos.get(clave(e.name)) ?? []), e]);
    return Array.from(grupos.values()).filter((g) => g.length > 1);
  }, [etiquetas]);
  const idsRepetidos = useMemo(() => new Set(repetidos.flat().map((e) => e.id)), [repetidos]);

  const enUso = etiquetas.filter((e) => (e.product_count ?? 0) > 0).length;
  const sinUsar = etiquetas.filter((e) => (e.product_count ?? 0) === 0 && (e.rule_count ?? 0) === 0);

  const uso = (listado.filtros.uso as Uso | undefined) ?? 'todas';
  const filtradas = useMemo(() => {
    const q = clave(listado.busqueda);
    const lista = etiquetas.filter((e) => {
      if (q && !clave(e.name).includes(q)) return false;
      if (uso === 'enUso') return (e.product_count ?? 0) > 0;
      if (uso === 'sinUsar') return (e.product_count ?? 0) === 0;
      return true;
    });
    const o = listado.orden ?? { campo: 'nombre', direccion: 'asc' as const };
    const signo = o.direccion === 'asc' ? 1 : -1;
    return [...lista].sort((a, b) => {
      if (o.campo === 'productos') return signo * ((a.product_count ?? 0) - (b.product_count ?? 0));
      if (o.campo === 'creada') return signo * (Date.parse(a.created_at ?? '') - Date.parse(b.created_at ?? '') || 0);
      return signo * a.name.localeCompare(b.name, locale);
    });
  }, [etiquetas, listado.busqueda, listado.orden, uso, locale]);

  const rango = calcularRango(listado.pagina, listado.tamano, filtradas.length);
  const pagina = filtradas.slice((rango.pagina - 1) * listado.tamano, rango.pagina * listado.tamano);
  const seleccionadas = etiquetas.filter((e) => seleccion.has(String(e.id)));

  const abrirNueva = () => {
    setEditando('nueva');
    setFormNombre('');
    setFormColor(COLORES_PREDEFINIDOS[0]);
    setErrorNombre(null);
  };
  const abrirEditar = (e: ProductTag) => {
    setEditando(e);
    setFormNombre(e.name);
    setFormColor(e.color);
    setErrorNombre(null);
  };

  const guardar = async () => {
    const nombre = formNombre.trim();
    if (!nombre) {
      setErrorNombre(t('form.nombreObligatorio'));
      return;
    }
    const mismoNombre = etiquetas.find((e) => e.name.trim().toLowerCase() === nombre.toLowerCase() && (editando === 'nueva' || e.id !== editando?.id));
    if (mismoNombre && mismoNombre.name.trim() === nombre) {
      setErrorNombre(t('form.nombreExiste'));
      return;
    }
    setGuardando(true);
    try {
      if (editando && editando !== 'nueva') {
        await EtiquetasService.actualizarEtiqueta(editando.id, { name: nombre, color: formColor });
        toast({ title: t('toast.actualizada') });
      } else {
        await EtiquetasService.crearEtiqueta({ name: nombre, color: formColor });
        toast({ title: t('toast.creada') });
      }
      setEditando(null);
      void cargar();
    } catch (error) {
      console.error('Error guardando etiqueta:', error);
      setErrorNombre(t('form.errorGuardar'));
    } finally {
      setGuardando(false);
    }
  };

  const duplicar = async (e: ProductTag) => {
    try {
      await EtiquetasService.duplicarEtiqueta(e.id, t('sufijoCopia'));
      toast({ title: t('toast.duplicada') });
      void cargar();
    } catch {
      toast({ variant: 'destructive', title: t('toast.errorDuplicar') });
    }
  };

  const eliminar = async () => {
    if (!aEliminar) return;
    setProcesando(true);
    try {
      const n = await EtiquetasService.eliminarEtiquetas(aEliminar.map((e) => e.id));
      toast({ title: t('toast.eliminadas', { n }) });
      setSeleccion(new Set());
      setAEliminar(null);
      void cargar();
    } catch (error) {
      const enReglas = error instanceof Object && 'message' in error && String((error as { message: unknown }).message).includes('etiqueta_en_reglas');
      toast({ variant: 'destructive', title: enReglas ? t('toast.enReglas') : t('toast.errorEliminar') });
    } finally {
      setProcesando(false);
    }
  };

  const abrirFusion = (lista: ProductTag[]) => {
    const porUso = [...lista].sort((a, b) => (b.product_count ?? 0) - (a.product_count ?? 0));
    setFusionar(porUso);
    setDestino(String(porUso[0]?.id ?? ''));
  };

  const confirmarFusion = async () => {
    if (!fusionar || !destino) return;
    setProcesando(true);
    try {
      await EtiquetasService.fusionarEtiquetas(
        Number(destino),
        fusionar.map((e) => e.id).filter((id) => id !== Number(destino)),
      );
      toast({ title: t('toast.fusionadas', { n: fusionar.length }) });
      setFusionar(null);
      setSeleccion(new Set());
      void cargar();
    } catch {
      toast({ variant: 'destructive', title: t('toast.errorFusionar') });
    } finally {
      setProcesando(false);
    }
  };

  const accionesDe = (e: ProductTag): AccionFila[] => [
    { id: 'editar', etiqueta: t('acciones.editar'), icono: Pencil, onSelect: () => abrirEditar(e) },
    { id: 'duplicar', etiqueta: t('acciones.duplicar'), icono: Copy, onSelect: () => void duplicar(e) },
    {
      id: 'eliminar',
      etiqueta: t('acciones.eliminar'),
      icono: Trash2,
      destructiva: true,
      onSelect: () => setAEliminar([e]),
      deshabilitada: (e.rule_count ?? 0) > 0,
      motivo: t('acciones.motivoEnReglas'),
    },
  ];

  const columnas: ColumnaTabla<ProductTag>[] = [
    { id: 'nombre', encabezado: t('columnas.etiqueta'), ordenable: true, celda: (e) => <ChipEtiqueta etiqueta={e} /> },
    {
      id: 'productos',
      encabezado: t('columnas.productos'),
      ordenable: true,
      variante: 'importe',
      ancho: 120,
      celda: (e) => <span className={(e.product_count ?? 0) === 0 ? 'text-fg-muted' : 'font-medium text-link'}>{fmtN(e.product_count ?? 0)}</span>,
    },
    {
      id: 'reglas',
      encabezado: t('columnas.reglas'),
      ocultarDebajo: 'md',
      celda: (e) => (e.rule_count ? e.rule_category ?? fmtN(e.rule_count) : <span className="text-fg-muted">—</span>),
    },
    {
      id: 'creada',
      encabezado: t('columnas.creada'),
      ordenable: true,
      ocultarDebajo: 'lg',
      ancho: 140,
      celda: (e) => (e.created_at ? formatDate(e.created_at) : '—'),
    },
  ];

  const subtitulo =
    estado === 'cargando' && etiquetas.length === 0
      ? t('cargando')
      : t('subtitulo', { total: (etiquetas.length), enUso: (enUso) });

  const masAcciones: AccionFila[] = [
    {
      id: 'eliminar-sin-usar',
      etiqueta: t('acciones.eliminarSinUsar', { n: (sinUsar.length) }),
      icono: Trash2,
      destructiva: true,
      onSelect: () => setAEliminar(sinUsar),
      deshabilitada: sinUsar.length === 0,
      motivo: t('acciones.motivoNadaSinUsar'),
    },
    { id: 'actualizar', etiqueta: t('acciones.actualizar'), icono: RefreshCw, onSelect: () => void cargar() },
  ];

  const nombreDialogo = editando && editando !== 'nueva' ? t('form.tituloEditar') : t('form.tituloNueva');
  const vistaPrevia: ProductTag = { id: 0, organization_id: 0, name: formNombre.trim() || t('form.vistaPreviaTexto'), color: formColor };

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <PageHeader
        titulo={t('titulo')}
        icono={Tag}
        migas={[{ etiqueta: t('migaInventario'), href: '/app/inventario' }, { etiqueta: t('titulo') }]}
        subtitulo={subtitulo}
        cargando={estado === 'cargando'}
        acciones={
          <>
            <Button className="h-10 gap-2" onClick={abrirNueva}>
              <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('nueva')}
            </Button>
            <RowActionsMenu acciones={masAcciones} orientacion="horizontal" tamano="md" titulo={t('titulo')} />
          </>
        }
        movil={{
          subtitulo: estado === 'cargando' ? t('cargando') : t('subtituloMovil', { total: (etiquetas.length) }),
          accion: (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={abrirNueva}
                aria-label={t('nueva')}
                className="flex size-10 items-center justify-center rounded-lg text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <Plus aria-hidden="true" className="size-5" strokeWidth={1.5} />
              </button>
              <RowActionsMenu acciones={masAcciones} orientacion="horizontal" tamano="sm" titulo={t('titulo')} className="size-10" />
            </div>
          ),
        }}
      />

      <KpiStrip etiqueta={t('kpi.etiqueta')}>
        <StatCard etiqueta={t('kpi.enUso')} valor={fmtN(enUso)} detalle={t('kpi.enUsoDetalle')} icono={Tag} cargando={estado === 'cargando'} onClick={() => listado.setFiltro('uso', 'enUso')} />
        <StatCard
          etiqueta={t('kpi.sinUsar')}
          valor={fmtN(sinUsar.length)}
          detalle={sinUsar.length ? t('kpi.sinUsarDetalle') : t('kpi.sinUsarNinguna')}
          tono={sinUsar.length ? 'advertencia' : 'neutro'}
          icono={TriangleAlert}
          cargando={estado === 'cargando'}
          onClick={() => listado.setFiltro('uso', 'sinUsar')}
        />
        <StatCard
          etiqueta={t('kpi.repetidos')}
          valor={fmtN(repetidos.length)}
          detalle={
            repetidos.length
              ? t('kpi.repetidosDetalle', { ejemplo: repetidos[0].map((e) => `«${e.name}»`).slice(0, 2).join(' · ') })
              : t('kpi.repetidosNinguno')
          }
          tono={repetidos.length ? 'advertencia' : 'neutro'}
          icono={Merge}
          cargando={estado === 'cargando'}
          onClick={repetidos.length ? () => abrirFusion(repetidos[0]) : undefined}
        />
        <StatCard
          etiqueta={t('kpi.productos')}
          valor={fmtN(resumen?.etiquetados ?? 0)}
          detalle={t('kpi.productosDetalle', { total: (resumen?.total ?? 0) })}
          icono={Package}
          cargando={estado === 'cargando'}
        />
      </KpiStrip>

      <ListToolbar
        busqueda={
          <SearchInput value={listado.busqueda} onChange={listado.setBusqueda} placeholder={t('buscar')} etiqueta={t('buscar')} />
        }
        filtros={
          <FilterPanel
            conteo={listado.filtrosActivos}
            onLimpiar={listado.limpiarFiltros}
            textoVerResultados={t('verResultados', { n: (filtradas.length) })}
          >
            <FormField etiqueta={t('filtros.uso')}>
              {(c) => (
                <SegmentedControl
                  aria-labelledby={c.idEtiqueta}
                  anchoCompleto
                  valor={uso}
                  onValorChange={(v) => listado.setFiltro('uso', v === 'todas' ? null : v)}
                  opciones={[
                    { valor: 'todas', etiqueta: t('filtros.todas') },
                    { valor: 'enUso', etiqueta: t('filtros.enUso') },
                    { valor: 'sinUsar', etiqueta: t('filtros.sinUsar') },
                  ]}
                />
              )}
            </FormField>
          </FilterPanel>
        }
        chips={
          <FilterChips
            chips={uso !== 'todas' ? [{ clave: 'uso', etiqueta: `${t('filtros.uso')}: ${t(`filtros.${uso}`)}` }] : []}
            onQuitar={(c) => listado.setFiltro(c, null)}
            onLimpiarTodo={listado.limpiarTodo}
          />
        }
      />

      <DataTable
        etiqueta={t('titulo')}
        columnas={columnas}
        filas={pagina}
        obtenerId={(e) => String(e.id)}
        estado={estado === 'cargando' ? 'cargando' : estado === 'error' ? 'error' : filtradas.length === 0 && listado.hayCriterios ? 'sinResultados' : 'listo'}
        orden={listado.orden}
        onOrdenar={listado.ordenarPor}
        seleccion={seleccion}
        onSeleccionChange={setSeleccion}
        etiquetaFila={(e) => e.name}
        acciones={accionesDe}
        tonoFila={(e) => (idsRepetidos.has(e.id) ? 'advertencia' : undefined)}
        onFilaClick={abrirEditar}
        tarjetaMovil={(e, ctx) => (
          <ListCard
            icono={Tag}
            titulo={e.name}
            subtitulo={t('tarjetaProductos', { n: (e.product_count ?? 0) })}
            meta={e.created_at ? formatDate(e.created_at) : undefined}
            acciones={accionesDe(e)}
            seleccionable={ctx.modoSeleccion}
            seleccionado={ctx.seleccionado}
            onSeleccionChange={ctx.alternar}
            onMantenerPulsado={() => ctx.alternar(true)}
            onClick={() => abrirEditar(e)}
          />
        )}
        vacio={{ titulo: t('vacio.titulo'), descripcion: t('vacio.descripcion'), accion: { etiqueta: t('nueva'), onClick: abrirNueva, icono: Plus } }}
        error={{ titulo: t('errorCarga') }}
        onReintentar={() => void cargar()}
        onLimpiarFiltros={listado.limpiarTodo}
        termino={listado.busqueda || undefined}
        pie={
          <Pagination
            pagina={rango.pagina}
            tamano={listado.tamano}
            total={filtradas.length}
            onPaginaChange={listado.setPagina}
            onTamanoChange={listado.setTamano}
            sustantivo={{ singular: t('sustantivo.singular'), plural: t('sustantivo.plural') }}
            cargando={estado === 'cargando'}
          />
        }
      />

      <BulkActionBar
        seleccionados={seleccion.size}
        total={filtradas.length}
        onSeleccionarTodos={() => setSeleccion(new Set(filtradas.map((e) => String(e.id))))}
        sustantivo={{ singular: t('sustantivo.singular'), plural: t('sustantivo.plural') }}
        acciones={[
          {
            id: 'fusionar',
            etiqueta: t('acciones.fusionar'),
            icono: Merge,
            onClick: () => abrirFusion(seleccionadas),
            deshabilitada: seleccionadas.length < 2,
            motivo: t('acciones.motivoFusionar'),
          },
          {
            id: 'eliminar',
            etiqueta: t('acciones.eliminar'),
            icono: Trash2,
            destructiva: true,
            onClick: () => setAEliminar(seleccionadas),
          },
        ]}
        onLimpiar={() => setSeleccion(new Set())}
      />

      {/* Crear / editar */}
      <Dialogo
        abierto={editando !== null}
        onAbiertoChange={(v) => !v && setEditando(null)}
        titulo={nombreDialogo}
        descripcion={t('form.descripcion')}
        icono={Tag}
        ancho={440}
        primario={{ etiqueta: t('form.guardar'), onClick: () => void guardar(), cargando: guardando }}
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(ev) => {
            ev.preventDefault();
            void guardar();
          }}
        >
          <FormField etiqueta={t('form.nombre')} obligatorio error={errorNombre}>
            <Input
              value={formNombre}
              onChange={(ev) => {
                setFormNombre(ev.target.value);
                setErrorNombre(null);
              }}
              placeholder={t('form.nombrePlaceholder')}
              maxLength={60}
              autoFocus
              className="h-10"
            />
          </FormField>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-sm font-medium text-fg">{t('form.color')}</legend>
            <div className="flex flex-wrap items-center gap-2">
              {COLORES_PREDEFINIDOS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setFormColor(color)}
                  aria-label={color}
                  aria-pressed={formColor === color}
                  className="size-8 rounded-full border-2 border-transparent transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand aria-pressed:scale-110 aria-pressed:border-fg"
                  style={{ backgroundColor: color }}
                />
              ))}
              <input
                type="color"
                value={formColor}
                onChange={(ev) => setFormColor(ev.target.value)}
                aria-label={t('form.colorPersonalizado')}
                className="h-8 w-12 cursor-pointer rounded border border-line bg-surface p-0.5"
              />
            </div>
          </fieldset>
          <div className="flex items-center gap-2 border-t border-line pt-3 text-sm text-fg-secondary">
            {t('form.vistaPrevia')} <ChipEtiqueta etiqueta={vistaPrevia} />
          </div>
        </form>
      </Dialogo>

      {/* Fusionar */}
      <Dialogo
        abierto={fusionar !== null}
        onAbiertoChange={(v) => !v && !procesando && setFusionar(null)}
        titulo={t('fusion.titulo', { n: fusionar?.length ?? 0 })}
        descripcion={t('fusion.descripcion')}
        icono={Merge}
        ancho={520}
        primario={{
          etiqueta: t('fusion.confirmar'),
          onClick: () => void confirmarFusion(),
          cargando: procesando,
          deshabilitada: !destino,
          motivo: t('fusion.motivo'),
        }}
      >
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium text-fg">{t('fusion.conservar')}</legend>
          {fusionar?.map((e) => (
            <label key={e.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-line px-3 py-2.5 hover:bg-hover">
              <input
                type="radio"
                name="etiqueta-destino"
                value={String(e.id)}
                checked={destino === String(e.id)}
                onChange={() => setDestino(String(e.id))}
                className="size-[18px] accent-brand"
              />
              <ChipEtiqueta etiqueta={e} />
              <span className="ml-auto text-xs text-fg-secondary">{t('tarjetaProductos', { n: (e.product_count ?? 0) })}</span>
            </label>
          ))}
        </fieldset>
      </Dialogo>

      <ConfirmDialog
        open={aEliminar !== null}
        onOpenChange={(v) => !v && !procesando && setAEliminar(null)}
        title={aEliminar && aEliminar.length === 1 ? t('eliminar.tituloUna', { nombre: aEliminar[0].name }) : t('eliminar.tituloVarias', { n: aEliminar?.length ?? 0 })}
        description={t('eliminar.descripcion', {
          productos: ((aEliminar ?? []).reduce((s, e) => s + (e.product_count ?? 0), 0)),
        })}
        confirmLabel={t('acciones.eliminar')}
        variant="destructive"
        loading={procesando}
        onConfirm={eliminar}
      />
    </div>
  );
}
