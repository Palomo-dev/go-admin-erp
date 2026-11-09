'use client';

/**
 * Integraciones › Conexiones (diseño 85-00, 01, 14 y 15): Catálogo · Mis conexiones ·
 * Actividad · Desarrolladores. Frente INT, 2026-11-07; barra y filtros del kit, 2026-11-09.
 *
 * Cabecera «Conectar» + «⋯» (Importar CSV; Exportar CSV en Actividad); debajo la fila estándar
 * buscador + «Filtros» (`ListToolbar` + `SearchInput` + `FilterPanel` + `FilterChips`, como las
 * demás listas del ERP) y luego las pestañas. Búsqueda, filtros y página viven en la URL
 * (`useListadoServidor`); la pestaña en `?tab=`. En celular las acciones van en el «⋯» del
 * MobileHeader (`movil.menu`) y las pestañas se desplazan en horizontal.
 *
 * Los datos salen SOLO de `/api/integrations/conexiones/**` (organización y permisos de la
 * sesión, en el servidor); el navegador nunca lee credenciales. `?conectar=<servicio>` abre la
 * ficha de ese servicio (lo usan las redirecciones del formulario avanzado y del Channel Manager);
 * los callbacks OAuth vuelven con `?meta_success=` / `?meta_error=` (y `tiktok_*`, `google_*`).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { BookOpen, Download, Link2, Plus, Upload } from 'lucide-react';
import {
  FilterChips,
  FilterPanel,
  ListToolbar,
  PageHeader,
  RowActionsMenu,
  SearchInput,
  TabBar,
  clasesBoton,
  idPanel,
  idPestana,
  useListadoServidor,
  useOpcionUrl,
  useParametrosUrl,
  type AccionFila,
} from '@/components/kit';
import {
  apiConexiones,
  type ConexionResumen,
  type ItemCatalogo,
} from '@/lib/services/integrations/conexiones/clienteConexiones';
import { PestanaCatalogo } from './catalogo/PestanaCatalogo';
import { FichaServicio } from './catalogo/FichaServicio';
import { PestanaMisConexiones } from './PestanaMisConexiones';
import { PestanaActividad } from './PestanaActividad';
import { PestanaDesarrolladores } from './PestanaDesarrolladores';
import { ImportarCsvDialogo } from './ImportarCsvDialogo';
import { CamposFiltroConexiones } from './CamposFiltroConexiones';
import { AsistenteConexion, tieneAsistente } from '@/components/integraciones/conexiones-v2/asistentes';
import { rutaInterna } from '@/lib/services/integrations/conexiones/rutaAsistente';
import { CLAVES_A_LIMPIAR, FILTROS_URL, PESTANAS, chipsDeFiltros, clavePlaceholderBusqueda, type Pestana } from './filtrosConexiones';

const PROVEEDORES_OAUTH = ['meta', 'tiktok', 'google'] as const;
const ID_TABS = 'conexiones';

export function ConexionesPagina() {
  const t = useTranslations('integracionesConexiones');
  const router = useRouter();
  const url = useParametrosUrl();
  const [tab] = useOpcionUrl('tab', PESTANAS, 'catalogo');
  const listado = useListadoServidor({ filtros: FILTROS_URL, tamanoPorDefecto: 50, tamanosPermitidos: [20, 50, 100] });
  const busqueda = listado.busqueda;
  const [catalogo, setCatalogo] = useState<ItemCatalogo[]>([]);
  const [conexiones, setConexiones] = useState<ConexionResumen[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ficha, setFicha] = useState<ItemCatalogo | null>(null);
  const [asistente, setAsistente] = useState<ItemCatalogo | null>(null);
  const [asistenteConexion, setAsistenteConexion] = useState<string | undefined>(undefined);
  const [retorno, setRetorno] = useState<string | null>(null);
  const [sucursalAsistente, setSucursalAsistente] = useState<number | undefined>(undefined);
  const [conectores, setConectores] = useState<{ id: string; nombre: string }[]>([]);
  const [importando, setImportando] = useState(false);
  const [exportarActividad, setExportarActividad] = useState(0);
  const [totalActividad, setTotalActividad] = useState<number | null>(null);
  const [erroresActividad, setErroresActividad] = useState<number | null>(null);
  const alTotalActividad = useCallback((total: number, errores30d: number) => {
    setTotalActividad(total);
    setErroresActividad(errores30d);
  }, []);

  /** Cambiar de pestaña limpia búsqueda, filtros y página: cada pestaña tiene los suyos. */
  const cambiarTab = useCallback(
    (v: Pestana, extra: Record<string, string | null> = {}) => url.fijar({ tab: v === 'catalogo' ? null : v, ...CLAVES_A_LIMPIAR, conexion: null, ...extra }),
    [url],
  );

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const datos = await apiConexiones.listar();
      setCatalogo(datos.catalogo);
      setConexiones(datos.conexiones);
      setConectores(datos.conectores ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('comun.errorCarga'));
    } finally {
      setCargando(false);
    }
  }, [t]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Resultado de los callbacks OAuth (Meta, TikTok, Google Ads): aviso y URL limpia.
  const okOauth = PROVEEDORES_OAUTH.map((p) => url.leer(`${p}_success`)).find(Boolean) ?? null;
  const errorOauth = PROVEEDORES_OAUTH.map((p) => url.leer(`${p}_error`)).find(Boolean) ?? null;
  useEffect(() => {
    if (!okOauth && !errorOauth) return;
    if (errorOauth) toast.error(t('comun.oauthError'), { description: errorOauth });
    else {
      toast.success(t('comun.oauthOk'), { description: okOauth ?? undefined });
      void cargar();
    }
    const limpiar: Record<string, null> = {};
    for (const p of PROVEEDORES_OAUTH) {
      limpiar[`${p}_success`] = null;
      limpiar[`${p}_error`] = null;
    }
    url.fijar(limpiar, 'replace');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [okOauth, errorOauth]);

  // `?conectar=<id>` abre la ficha del servicio una vez cargado el catálogo. Con `&conexion=<uuid>`
  // (regreso del OAuth de Meta) abre directamente el asistente en el paso siguiente (85-42).
  // Con `&return=<ruta interna>` (desde Métodos de pago, el PMS…) el proveedor ya está elegido: se
  // abre directo el asistente y al terminar o cerrar se vuelve allí; `&sucursal=` pasa al guardado.
  const conectar = url.leer('conectar');
  const conexionUrl = url.leer('conexion');
  const retornoUrl = url.leer('return');
  const sucursalUrl = url.leer('sucursal');
  useEffect(() => {
    if (!conectar || catalogo.length === 0) return;
    const item = catalogo.find((i) => i.id === conectar || i.proveedor === conectar);
    const volver = rutaInterna(retornoUrl);
    const sucursal = Number.parseInt(sucursalUrl ?? '', 10);
    setRetorno(volver);
    setSucursalAsistente(Number.isInteger(sucursal) && sucursal > 0 ? sucursal : undefined);
    if (item && conexionUrl && item.asistente === 'oauth') {
      setAsistenteConexion(conexionUrl);
      setAsistente(item);
    } else if (item && volver && tieneAsistente(item)) {
      setAsistenteConexion(undefined);
      setAsistente(item);
    } else if (item) {
      setFicha(item);
    }
    url.fijar({ conectar: null, return: null, sucursal: null, ...(tab === 'actividad' ? {} : { conexion: null }) }, 'replace');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conectar, catalogo]);

  /** Botón principal de la ficha: asistente propio, flujo de logística o enlace. */
  const abrirAsistente = useCallback(
    (item: ItemCatalogo) => {
      setFicha(null);
      if (item.asistente === 'logistica') {
        router.push(`/app/integraciones/conexiones/logistica?proveedor=${encodeURIComponent(item.id)}`);
        return;
      }
      if ((item.asistente === 'enlace' || item.asistente === 'avanzado') && item.enlace) {
        router.push(item.enlace);
        return;
      }
      setAsistenteConexion(undefined);
      setRetorno(null);
      setSucursalAsistente(undefined);
      setAsistente(item);
    },
    [router],
  );

  const nombreServicio = useCallback(
    (i: Pick<ItemCatalogo, 'id' | 'nombre'>) => (t.has(`servicios.${i.id}.nombre`) ? t(`servicios.${i.id}.nombre`) : i.nombre ?? i.id),
    [t],
  );

  const porId = useMemo(() => new Map(conexiones.map((c) => [c.id, c])), [conexiones]);
  const nombreConexion = useCallback(
    (id: string) => {
      const c = porId.get(id);
      if (!c) return t('actividad.conexionDesconocida');
      return t.has(`servicios.${c.proveedor}.nombre`) ? t(`servicios.${c.proveedor}.nombre`) : c.proveedorNombre || c.nombre;
    },
    [porId, t],
  );

  const atencion = useMemo(() => conexiones.filter((c) => c.necesitaAtencion).length, [conexiones]);
  const conectadas = useMemo(() => conexiones.filter((c) => c.estado === 'connected').length, [conexiones]);

  const subtitulo =
    tab === 'mis'
      ? t('misConexiones.subtitulo', { conectadas, atencion })
      : tab === 'actividad'
        ? erroresActividad === null
          ? t('actividad.subtitulo')
          : t('actividad.subtituloErrores', { n: erroresActividad })
        : tab === 'desarrolladores'
          ? t('desarrolladores.subtitulo')
          : t('catalogo.subtitulo');

  /** «⋯» de la cabecera (y el menú del MobileHeader en celular). */
  const menuCabecera: AccionFila[] = [
    { id: 'conectar', etiqueta: t('comun.conectarServicio'), descripcion: t('comun.conectarDescripcion'), icono: Plus, onSelect: () => cambiarTab('catalogo') },
    { id: 'importar', etiqueta: t('importar.abrir'), descripcion: t('importar.descripcionMenu'), icono: Upload, onSelect: () => setImportando(true) },
    {
      id: 'exportar',
      etiqueta: t('comun.exportarCsv'),
      icono: Download,
      onSelect: () => setExportarActividad((n) => n + 1),
      oculta: tab !== 'actividad',
      deshabilitada: totalActividad === 0,
      motivo: totalActividad === 0 ? t('actividad.vacioTitulo') : undefined,
    },
    { id: 'documentacion', etiqueta: t('comun.verDocumentacion'), icono: BookOpen, separadorAntes: true, onSelect: () => cambiarTab('desarrolladores') },
  ];

  const chips = chipsDeFiltros(tab, listado.filtros, {
    chip: (clave, valor) => t(`filtros.chips.${clave}`, { valor: valor ?? '' }),
    valor: (clave, v) =>
      clave === 'grupo'
        ? t(`grupos.${v}.chip`)
        : clave === 'estadoCatalogo'
          ? t(`estados.catalogo.${v}`)
          : clave === 'estadoConexion'
            ? t(`estados.conexion.${v}`)
            : clave === 'sentido'
              ? t(`actividad.sentido.${v}`)
              : t(`filtros.valores.${clave}.${v}`),
    nombreConexion,
  });

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 sm:p-6">
      <PageHeader
        titulo={t('comun.titulo')}
        subtitulo={subtitulo}
        icono={Link2}
        cargando={cargando}
        migas={[{ etiqueta: t('comun.migaIntegraciones'), href: '/app/integraciones' }, { etiqueta: t('comun.titulo') }]}
        acciones={
          <div className="flex items-center gap-2">
            <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => cambiarTab('catalogo')}>
              <Plus aria-hidden="true" className="size-4" />
              {t('comun.conectar')}
            </button>
            <RowActionsMenu acciones={menuCabecera.filter((a) => a.id !== 'conectar')} orientacion="horizontal" tamano="md" titulo={t('comun.titulo')} />
          </div>
        }
        // En celular (< lg) el PageHeader no se dibuja: «Conectar», «Importar CSV» y «Exportar»
        // van en el «⋯» del MobileHeader (guardarraíl `accionesMovil.test.ts`).
        movil={{ subtitulo, menu: menuCabecera }}
      />

      <ListToolbar
        busqueda={
          <SearchInput
            value={busqueda}
            onChange={listado.setBusqueda}
            cargando={cargando}
            placeholder={t(clavePlaceholderBusqueda(tab))}
            etiqueta={t(clavePlaceholderBusqueda(tab))}
          />
        }
        filtros={
          <FilterPanel conteo={listado.filtrosActivos} onLimpiar={listado.limpiarFiltros} textoVerResultados={t('filtros.verResultados')}>
            <CamposFiltroConexiones tab={tab} listado={listado} conexiones={conexiones} nombreConexion={nombreConexion} />
          </FilterPanel>
        }
        chips={<FilterChips chips={chips} onQuitar={(c) => listado.setFiltro(c, null)} onLimpiarTodo={listado.limpiarFiltros} />}
      />

      <TabBar
        id={ID_TABS}
        etiqueta={t('comun.pestanas')}
        valor={tab}
        onValorChange={(v) => cambiarTab(v)}
        pestanas={PESTANAS.map((v) => ({
          valor: v,
          etiqueta: t(`comun.tab.${v}`),
          contador: v === 'mis' && !cargando && !error ? conexiones.length : undefined,
        }))}
      />

      <div role="tabpanel" id={idPanel(ID_TABS, tab)} aria-labelledby={idPestana(ID_TABS, tab)} className="min-w-0">
        {tab === 'catalogo' && (
          <PestanaCatalogo
            items={catalogo}
            cargando={cargando}
            error={error}
            busqueda={busqueda}
            filtros={listado.filtros}
            onGrupoChange={(g) => listado.setFiltro('grupo', g === 'todos' ? null : g)}
            onLimpiarFiltros={listado.limpiarTodo}
            onReintentar={() => void cargar()}
            nombreServicio={nombreServicio}
            onAbrirFicha={setFicha}
          />
        )}
        {tab === 'mis' && (
          <PestanaMisConexiones
            conexiones={conexiones}
            catalogo={catalogo}
            cargando={cargando}
            error={error}
            busqueda={busqueda}
            filtros={listado.filtros}
            onLimpiarFiltros={listado.limpiarTodo}
            onReintentar={() => void cargar()}
            onVerErrores={() => cambiarTab('actividad', { errores: '1' })}
            onIrCatalogo={() => cambiarTab('catalogo')}
            onCambio={() => void cargar()}
          />
        )}
        {tab === 'actividad' && (
          <PestanaActividad
            conexiones={conexiones}
            listado={listado}
            nombreConexion={nombreConexion}
            exportar={exportarActividad}
            onTotal={alTotalActividad}
          />
        )}
        {tab === 'desarrolladores' && <PestanaDesarrolladores busqueda={busqueda} filtros={listado.filtros} onLimpiarFiltros={listado.limpiarTodo} />}
      </div>

      <FichaServicio
        item={ficha}
        nombre={ficha ? nombreServicio(ficha) : ''}
        onCerrar={() => setFicha(null)}
        onConectar={abrirAsistente}
      />

      <ImportarCsvDialogo
        abierto={importando}
        onAbiertoChange={setImportando}
        conectores={conectores}
        onImportado={() => void cargar()}
      />
      {asistente && (
        <AsistenteConexion
          item={asistente}
          abierto={!!asistente}
          conexionId={asistenteConexion}
          sucursalId={sucursalAsistente}
          onCerrar={() => {
            setAsistente(null);
            setAsistenteConexion(undefined);
            if (retorno) router.push(retorno);
          }}
          onConectado={(conexionId) => {
            setAsistente(null);
            setAsistenteConexion(undefined);
            void cargar();
            if (retorno) router.push(retorno);
            else if (conexionId) router.push(`/app/integraciones/conexiones/${conexionId}`);
          }}
        />
      )}
    </div>
  );
}
