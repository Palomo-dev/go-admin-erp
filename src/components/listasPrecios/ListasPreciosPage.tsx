'use client';

/**
 * Ventas › Listas de precios (Figma «05 POS y ventas» 01, 3018:198733).
 *
 * - Cuatro StatCards: listas activas, clientes con lista, productos con precio fijo y ventas netas
 *   del mes con lista (sin IVA ni propinas, regla única de ventas netas).
 * - Listado con estado (activa, programada, vencida, inactiva, sin clientes). El orden importa:
 *   un cliente en dos grupos con lista paga la que está más arriba (se ordena arrastrando).
 * - Todo sale de `price_lists_overview` por /api/listas-precios; escribir exige
 *   pos.listas_precios.gestionar (resuelto en el servidor): aquí solo decide qué botones se ven.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Copy, Eye, Pencil, Plus, RefreshCw, Tags, Trash2, Upload, Users } from 'lucide-react';
import { toast } from 'sonner';
import {
  ChipsOpcion,
  ConfirmDialog,
  DataTable,
  KpiStrip,
  ListCard,
  ListToolbar,
  PageHeader,
  RowActionsMenu,
  SearchInput,
  StatCard,
  clasesBoton,
  type AccionFila,
  type ColumnaTabla,
  type EstadoTabla,
} from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { useMigaVentas } from '@/components/pos/useMigaVentas';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { ListasPreciosService, ErrorPeticionLista, tienePermisoLista } from '@/lib/services/listasPreciosService';
import type { EstadoLista, ListaResumen, ResumenListas } from '@/lib/listasPrecios/tipos';
import { ImportarPreciosDialog } from './ImportarPreciosDialog';
import {
  RUTA_NUEVA_LISTA,
  TONO_ESTADO_LISTA,
  canalesLista,
  comoSeDefine,
  productosLista,
  rutaEditarLista,
  rutaLista,
  vigenciaLista,
} from './vistaListas';

type Filtro = 'todas' | 'activas' | 'programadas' | 'vencidas' | 'inactivas';
const FILTROS: readonly Filtro[] = ['todas', 'activas', 'programadas', 'vencidas', 'inactivas'];
const CUMPLE: Record<Filtro, (e: EstadoLista) => boolean> = {
  todas: () => true,
  activas: (e) => e === 'activa' || e === 'sin_clientes',
  programadas: (e) => e === 'programada',
  vencidas: (e) => e === 'vencida',
  inactivas: (e) => e === 'inactiva',
};

export function ListasPreciosPage() {
  const t = useTranslations('listasPrecios');
  const router = useRouter();
  const migaVentas = useMigaVentas();
  const { formatear } = useMonedaOrganizacion();
  const { formatPlain, getToday } = useFormatDate();
  const hoy = getToday();

  const [datos, setDatos] = useState<ResumenListas | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [puedeGestionar, setPuedeGestionar] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [borrar, setBorrar] = useState<ListaResumen | null>(null);
  const [importar, setImportar] = useState<ListaResumen | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setDatos(await ListasPreciosService.resumen());
    } catch (e) {
      setError(e instanceof ErrorPeticionLista ? e.codigo : 'error_desconocido');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
    tienePermisoLista('pos.listas_precios.gestionar').then(setPuedeGestionar).catch(() => setPuedeGestionar(false));
  }, [cargar]);

  const filas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (datos?.listas ?? []).filter((l) => CUMPLE[filtro](l.estado) && (!q || l.name.toLowerCase().includes(q)));
  }, [datos, busqueda, filtro]);

  const ejecutar = async (accion: () => Promise<unknown>, exito: string) => {
    try {
      await accion();
      toast.success(exito);
      void cargar();
    } catch (e) {
      toast.error(t(`errores.${e instanceof ErrorPeticionLista ? e.codigo : 'error_desconocido'}`));
    }
  };

  const mover = (id: string, sobre: string) => {
    const lista = datos?.listas ?? [];
    const desde = lista.findIndex((l) => l.id === id);
    const hasta = lista.findIndex((l) => l.id === sobre);
    if (desde < 0 || hasta < 0 || desde === hasta) return;
    const nueva = [...lista];
    const [movida] = nueva.splice(desde, 1);
    nueva.splice(hasta, 0, movida);
    setDatos((d) => (d ? { ...d, listas: nueva } : d));
    void ejecutar(() => ListasPreciosService.ordenar(nueva.map((l) => l.id)), t('toast.orden'));
  };

  const badge = (l: ListaResumen) => (
    <Badge tono={TONO_ESTADO_LISTA[l.estado]} apariencia="suave" tamano="sm" punto>
      {t(`estado.${l.estado}`)}
    </Badge>
  );

  const acciones = (l: ListaResumen): AccionFila[] => [
    { id: 'ver', etiqueta: t('acciones.ver'), icono: Eye, onSelect: () => router.push(rutaLista(l.id)) },
    { id: 'editar', etiqueta: t('acciones.editar'), icono: Pencil, onSelect: () => router.push(rutaEditarLista(l.id)), oculta: !puedeGestionar },
    { id: 'clientes', etiqueta: t('acciones.clientes'), icono: Users, onSelect: () => router.push(`${rutaLista(l.id)}?pestana=clientes`) },
    { id: 'importar', etiqueta: t('acciones.importar'), icono: Upload, onSelect: () => setImportar(l), oculta: !puedeGestionar },
    {
      id: 'duplicar',
      etiqueta: t('acciones.duplicar'),
      icono: Copy,
      onSelect: () => void ejecutar(() => ListasPreciosService.duplicar(l.id, t('copiaDe', { nombre: l.name })), t('toast.duplicada')),
      oculta: !puedeGestionar,
    },
    { id: 'borrar', etiqueta: t('acciones.borrar'), icono: Trash2, destructiva: true, separadorAntes: true, onSelect: () => setBorrar(l), oculta: !puedeGestionar },
  ];

  const columnas: ColumnaTabla<ListaResumen>[] = [
    { id: 'lista', encabezado: t('columnas.lista'), celda: (l) => <span className="font-medium text-fg">{l.name}</span> },
    { id: 'como', encabezado: t('columnas.como'), celda: (l) => comoSeDefine(t, l) },
    { id: 'clientes', encabezado: t('columnas.clientes'), variante: 'importe', celda: (l) => l.clientes.toLocaleString() },
    { id: 'vigencia', encabezado: t('columnas.vigencia'), ocultarDebajo: 'md', celda: (l) => vigenciaLista(t, l, hoy, formatPlain) },
    { id: 'productos', encabezado: t('columnas.productos'), ocultarDebajo: 'lg', celda: (l) => productosLista(t, l) },
    { id: 'canales', encabezado: t('columnas.canales'), ocultarDebajo: 'lg', celda: (l) => canalesLista(t, l) },
    { id: 'estado', encabezado: t('columnas.estado'), celda: badge },
  ];

  const kpis = datos?.kpis;
  const estadoTabla: EstadoTabla = cargando && !datos
    ? 'cargando'
    : error === 'sin_permiso'
      ? 'sinPermiso'
      : error
        ? 'error'
        : filas.length === 0
          ? (datos?.listas.length ?? 0) > 0 ? 'sinResultados' : 'vacio'
          : 'listo';
  const nuevo = () => router.push(RUTA_NUEVA_LISTA);
  const sinFiltros = !busqueda.trim() && filtro === 'todas';

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <PageHeader
        titulo={t('titulo')}
        icono={Tags}
        migas={[migaVentas, { etiqueta: t('titulo') }]}
        subtitulo={kpis ? t('subtitulo', { total: kpis.creadas, activas: kpis.activas }) : t('subtituloCorto')}
        acciones={
          <>
            <button
              type="button"
              aria-label={t('actualizar')}
              title={t('actualizar')}
              className={clasesBoton({ variante: 'secundario', className: 'w-10 px-0' })}
              onClick={() => void cargar()}
            >
              <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </button>
            {puedeGestionar && (datos?.listas.length ?? 0) > 0 && (
              <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => setImportar(datos?.listas[0] ?? null)}>
                <Upload aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('importar')}
              </button>
            )}
            {puedeGestionar && (
              <button type="button" className={clasesBoton({ variante: 'primario' })} onClick={nuevo}>
                <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('nueva')}
              </button>
            )}
            <RowActionsMenu
              orientacion="horizontal"
              tamano="md"
              titulo={t('titulo')}
              acciones={[{ id: 'actualizar', etiqueta: t('actualizar'), icono: RefreshCw, onSelect: () => void cargar() }]}
            />
          </>
        }
        movil={{
          subtitulo: kpis ? t('subtitulo', { total: kpis.creadas, activas: kpis.activas }) : undefined,
          accion: puedeGestionar ? (
            <button
              type="button"
              aria-label={t('nueva')}
              onClick={nuevo}
              className="flex size-10 items-center justify-center rounded-lg text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Plus aria-hidden="true" className="size-5" strokeWidth={1.5} />
            </button>
          ) : undefined,
          menu: [{ id: 'actualizar', etiqueta: t('actualizar'), icono: RefreshCw, onSelect: () => void cargar() }],
        }}
      />

      {error !== 'sin_permiso' && (
        <KpiStrip etiqueta={t('kpi.etiqueta')}>
          <StatCard
            etiqueta={t('kpi.activas')}
            valor={(kpis?.activas ?? 0).toLocaleString()}
            detalle={t('kpi.activasDetalle', { creadas: kpis?.creadas ?? 0, programadas: kpis?.programadas ?? 0 })}
            cargando={cargando && !kpis}
            onClick={() => setFiltro('activas')}
          />
          <StatCard
            etiqueta={t('kpi.clientes')}
            valor={(kpis?.clientes ?? 0).toLocaleString()}
            detalle={t('kpi.clientesDetalle', { grupo: kpis?.clientes_grupo ?? 0, directos: kpis?.clientes_directos ?? 0 })}
            cargando={cargando && !kpis}
          />
          <StatCard
            etiqueta={t('kpi.productos')}
            valor={(kpis?.productos_fijos ?? 0).toLocaleString()}
            detalle={t('kpi.productosDetalle')}
            cargando={cargando && !kpis}
          />
          <StatCard
            etiqueta={t('kpi.ventas')}
            valor={formatear(kpis?.ventas_netas_mes ?? 0)}
            detalle={t('kpi.ventasDetalle', { n: kpis?.ventas_mes ?? 0 })}
            cargando={cargando && !kpis}
          />
        </KpiStrip>
      )}

      <ListToolbar
        busqueda={<SearchInput value={busqueda} onChange={setBusqueda} placeholder={t('buscar')} etiqueta={t('buscar')} />}
        chips={
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-fg-secondary">{t('filtros.estado')}</span>
            <ChipsOpcion<Filtro>
              valor={filtro}
              onValorChange={setFiltro}
              opciones={FILTROS.map((f) => ({ valor: f, etiqueta: t(`filtros.${f}`) }))}
              etiqueta={t('filtros.estado')}
            />
          </div>
        }
      />

      <DataTable
        etiqueta={t('titulo')}
        columnas={columnas}
        filas={filas}
        obtenerId={(l) => l.id}
        estado={estadoTabla}
        onFilaClick={(l) => router.push(rutaLista(l.id))}
        etiquetaFila={(l) => l.name}
        acciones={acciones}
        arrastre={puedeGestionar && sinFiltros ? { onMover: mover } : undefined}
        tarjetaMovil={(l) => (
          <ListCard
            titulo={l.name}
            subtitulo={comoSeDefine(t, l)}
            meta={`${t('clientesN', { n: l.clientes })} · ${canalesLista(t, l)}`}
            estado={badge(l)}
            acciones={acciones(l)}
            onClick={() => router.push(rutaLista(l.id))}
          />
        )}
        vacio={{
          titulo: t('vacio.titulo'),
          descripcion: t('vacio.descripcion'),
          icono: Tags,
          accion: puedeGestionar ? { etiqueta: t('nueva'), onClick: nuevo, icono: Plus } : undefined,
        }}
        error={{ titulo: t('error.titulo'), descripcion: t('error.descripcion') }}
        sinPermiso={{ titulo: t('sinPermiso.titulo'), descripcion: t('sinPermiso.descripcion') }}
        onReintentar={() => void cargar()}
        onLimpiarFiltros={() => {
          setBusqueda('');
          setFiltro('todas');
        }}
        termino={busqueda || undefined}
        pie={
          estadoTabla === 'listo' ? (
            <p className="px-4 py-3 text-sm text-fg-secondary">
              {t('pie', { n: filas.length })}
              {puedeGestionar && sinFiltros ? ` · ${t('pieOrden')}` : ''}
            </p>
          ) : undefined
        }
      />

      <ConfirmDialog
        abierto={borrar !== null}
        onAbiertoChange={(v) => !v && setBorrar(null)}
        titulo={t('borrar.titulo', { nombre: borrar?.name ?? '' })}
        descripcion={t('borrar.descripcion', { n: borrar?.clientes ?? 0 })}
        textoConfirmar={t('borrar.confirmar')}
        tono="peligro"
        onConfirmar={() => {
          const l = borrar;
          setBorrar(null);
          if (l) void ejecutar(() => ListasPreciosService.eliminar(l.id), t('toast.borrada'));
        }}
      />
      {importar && (
        <ImportarPreciosDialog
          abierto={importar !== null}
          onAbiertoChange={(v) => !v && setImportar(null)}
          listaId={importar.id}
          listaNombre={importar.name}
          listas={datos?.listas ?? []}
          onImportado={() => void cargar()}
        />
      )}
    </div>
  );
}
