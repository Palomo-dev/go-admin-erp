'use client';

/**
 * «Tienda» del sitio web (Figma A/01b fila Tienda: catálogo web, destacados y
 * reseñas; A/04i nota 2: las plantillas de detalle de producto y categoría se
 * gestionan aquí). No tiene captura propia: sigue el patrón de Carta (B/13-01,
 * 13-02) con las piezas del kit, sin inventar datos.
 *
 * Tres pestañas (`?tab=catalogo|plantillas|resenas`; la redirección vieja de
 * Branding › Reseñas llega a `?tab=resenas`):
 * - Catálogo web: KPIs y, por sede, qué productos salen en la web y cuáles
 *   están agotados, con el MISMO motor de la carta por sede.
 * - Plantillas de producto y categoría: las páginas de detalle que Páginas no
 *   lista; «Editar» abre el editor.
 * - Reseñas: «Aprobar automáticamente» y la moderación con el kit
 *   (`ModeracionResenas`, por `/api/sitio-web/tienda/resenas` con permiso), y «Ajustes de
 *   reseñas» (`AjustesResenasHoja`, Figma 3131-92277: quién escribe, fotos y correo tras la entrega).
 */
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Boxes, EyeOff, FileText, Package, PackageX, Pencil, Plus, Settings, Star, Tags, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useOrganization } from '@/lib/hooks/useOrganization';
import {
  DataTable,
  EmptyState,
  KpiStrip,
  ListCard,
  PaginationCompact,
  RelatedLinkCard,
  SearchInput,
  SegmentedControl,
  SettingRow,
  StatCard,
  StatusBadge,
  TabBar,
  Tarjeta,
  clasesBoton,
  idPanel,
  idPestana,
  useOpcionUrl,
  type ColumnaTabla,
} from '@/components/kit';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { formatMoneda } from '@/lib/utils/moneda';
import type { FiltroCartaSede, ProductoCartaSede } from '@/lib/services/website/cartaSede';
import type { PlantillaTienda, RespuestaTienda } from '@/lib/website/tiendaSitio.server';
import { cn } from '@/utils/Utils';
import { OutletSwitcher } from '../ui/OutletSwitcher';
import { MarcoSitioWeb, type EstadoVistaSitio } from '../MarcoSitioWeb';
import { RAIZ_SITIO_WEB, rutaEditorSitio } from '../rutasSitioWeb';
import { CLASE_TAMANO_ICONO, TRAZO_ICONO } from '../ui/iconosSitio';
import { ICONO_INTERRUPTOR_CATALOGO, ICONO_PESTANA_TIENDA, iconoDestino } from './iconosVentas';
import { ModeracionResenas } from './ModeracionResenas';
import { AjustesResenasHoja } from './AjustesResenas';
import { useTextosVentas, type TraductorVentas } from './textos';
import { useCatalogoSede, useTiendaSitio } from './useTiendaSitio';
import { ErrorApiVentas } from './useVentasSitio';
import type { TipoPaginaDetalle } from '../paginas/paginasDetalle';

export const RUTA_TIENDA = `${RAIZ_SITIO_WEB}/tienda`;
const RUTA_INVENTARIO = '/app/inventario/productos';
const PESTANAS = ['catalogo', 'plantillas', 'resenas'] as const;
type PestanaTienda = (typeof PESTANAS)[number];
const ID_TABS = 'tienda-sitio';

function EsqueletoTienda() {
  return (
    <div className="flex flex-col gap-4 lg:gap-6" aria-busy="true">
      <Skeleton className="h-10 w-80 rounded-lg" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

/** Interruptor de la tarjeta móvil con su icono y su nombre a la vista. */
function InterruptorConEtiqueta({ icono: Icono, etiqueta, children }: { icono: LucideIcon; etiqueta: string; children: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-2 px-3 py-2">
      <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-fg-secondary">
        <Icono aria-hidden="true" className={cn(CLASE_TAMANO_ICONO.base, 'shrink-0')} strokeWidth={TRAZO_ICONO} />
        <span className="truncate">{etiqueta}</span>
      </span>
      {children}
    </div>
  );
}

function CatalogoWeb({ datos, t }: { datos: RespuestaTienda; t: TraductorVentas }) {
  const { toast } = useToast();
  const moneda = useMonedaOrganizacion();
  const principal = datos.sedes.find((s) => s.principal) ?? datos.sedes[0] ?? null;
  const [sedeId, setSedeId] = useState<number | null>(principal?.id ?? null);
  const [q, setQ] = useState('');
  const [filtro, setFiltro] = useState<FiltroCartaSede>('todos');
  const [pagina, setPagina] = useState(1);
  const catalogo = useCatalogoSede({ branchId: sedeId, q, filtro, pagina });
  const sede = datos.sedes.find((s) => s.id === sedeId) ?? principal;
  const puedeEditar = !!catalogo.datos?.puedeEditar;

  const cambiar = async (p: ProductoCartaSede, parche: { is_listed?: boolean; is_sold_out?: boolean }) => {
    try {
      await catalogo.cambiar({ product_id: p.id, ...parche });
      toast({ title: t('tienda.catalogo.guardado', { sede: sede?.nombre ?? '' }) });
    } catch (error) {
      toast({ title: t('tienda.catalogo.error', { mensaje: (error as Error).message }), variant: 'destructive' });
    }
  };

  const precio = (p: ProductoCartaSede) => {
    const web = p.ajuste?.web_price ?? null;
    const valor = web ?? p.precio_vigente;
    return (
      <span className="flex flex-col items-end">
        <span className="tabular-nums text-fg">{valor === null ? t('tienda.catalogo.sinPrecio') : formatMoneda(valor, moneda)}</span>
        <span className="text-xs text-fg-secondary">{web !== null ? t('tienda.catalogo.precioPersonalizado') : t('tienda.catalogo.precioInventario')}</span>
      </span>
    );
  };

  const enWeb = (p: ProductoCartaSede) => (
    <Switch
      checked={p.ajuste?.is_listed ?? true}
      disabled={!puedeEditar}
      onCheckedChange={(v) => void cambiar(p, { is_listed: v })}
      aria-label={t('tienda.catalogo.mostrarEnWeb', { producto: p.name })}
    />
  );
  const agotado = (p: ProductoCartaSede) => (
    <Switch
      checked={p.ajuste?.agotado_ahora ?? false}
      disabled={!puedeEditar}
      onCheckedChange={(v) => void cambiar(p, { is_sold_out: v })}
      aria-label={t('tienda.catalogo.marcarAgotado', { producto: p.name })}
    />
  );

  const columnas: ColumnaTabla<ProductoCartaSede>[] = [
    {
      id: 'producto',
      encabezado: t('tienda.catalogo.columnas.producto'),
      celda: (p) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-fg">{p.name}</p>
          <p className="truncate text-xs text-fg-secondary">{p.sku}</p>
        </div>
      ),
    },
    { id: 'precio', encabezado: t('tienda.catalogo.columnas.precio'), alinear: 'derecha', celda: precio },
    { id: 'web', encabezado: t('tienda.catalogo.columnas.enWeb'), alinear: 'centro', ancho: 110, celda: enWeb },
    { id: 'agotado', encabezado: t('tienda.catalogo.columnas.agotado'), alinear: 'centro', ancho: 110, celda: agotado },
  ];

  const filtros: FiltroCartaSede[] = ['todos', 'personalizados', 'agotados', 'ocultos'];
  const enSede = sede ? t('tienda.kpis.enSede', { sede: sede.nombre }) : undefined;

  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      <KpiStrip columnas={4} etiqueta={t('tienda.kpis.etiqueta')}>
        <StatCard etiqueta={t('tienda.kpis.productosActivos')} valor={datos.kpis.productosActivos} icono={Package} />
        <StatCard etiqueta={t('tienda.kpis.categorias')} valor={datos.kpis.categorias} icono={Tags} />
        <StatCard etiqueta={t('tienda.kpis.ocultos')} valor={sede?.ocultos ?? 0} detalle={enSede} icono={EyeOff} />
        <StatCard etiqueta={t('tienda.kpis.agotados')} valor={sede?.agotados ?? 0} detalle={enSede} icono={PackageX} tono={(sede?.agotados ?? 0) > 0 ? 'advertencia' : 'neutro'} />
      </KpiStrip>

      {datos.kpis.productosActivos === 0 ? (
        <EmptyState
          variante="empty"
          icono={Boxes}
          titulo={t('tienda.catalogo.vacio')}
          accion={datos.inventarioVisible ? { etiqueta: t('tienda.catalogo.irInventario'), href: RUTA_INVENTARIO } : undefined}
        />
      ) : (
        <>
          <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-3 lg:flex-row lg:items-center">
            {datos.sedes.length > 1 && (
              <OutletSwitcher
                valor={sedeId !== null && sedeId !== principal?.id ? String(sedeId) : null}
                onCambiar={(id) => {
                  setSedeId(id === null ? principal?.id ?? null : Number(id));
                  setPagina(1);
                }}
                sedes={datos.sedes.filter((s) => !s.principal).map((s) => ({ id: String(s.id), nombre: s.nombre }))}
                nombrePrincipal={principal?.nombre}
              />
            )}
            <SearchInput
              value={q}
              onChange={(v) => {
                setQ(v);
                setPagina(1);
              }}
              debounceMs={300}
              placeholder={t('tienda.catalogo.buscar')}
              etiqueta={t('tienda.catalogo.buscar')}
              atajo={false}
              className="min-w-0 flex-1"
            />
            <SegmentedControl
              etiqueta={t('tienda.catalogo.filtro')}
              opciones={filtros.map((f) => ({ valor: f, etiqueta: t(`tienda.catalogo.filtros.${f}`) }))}
              valor={filtro}
              onValorChange={(v) => {
                setFiltro(v);
                setPagina(1);
              }}
              tamano="sm"
            />
          </div>
          {catalogo.datos && !catalogo.datos.puedeEditar && <p className="text-xs text-fg-secondary">{t('tienda.catalogo.sinPermisoEditar')}</p>}
          <DataTable
            etiqueta={t('tienda.pestanas.catalogo')}
            columnas={columnas}
            filas={catalogo.datos?.productos ?? []}
            obtenerId={(p) => String(p.id)}
            estado={catalogo.cargando ? 'cargando' : catalogo.fallo === 'sin_permiso' ? 'sinPermiso' : catalogo.fallo ? 'error' : q || filtro !== 'todos' ? ((catalogo.datos?.productos.length ?? 0) === 0 ? 'sinResultados' : 'listo') : 'listo'}
            onReintentar={() => void catalogo.recargar()}
            onLimpiarFiltros={() => {
              setQ('');
              setFiltro('todos');
            }}
            termino={q}
            vacio={{ titulo: t('tienda.catalogo.vacio') }}
            sinResultados={{ titulo: t('tienda.catalogo.sinResultados') }}
            tarjetaMovil={(p) => (
              <div className="flex flex-col rounded-xl border border-line bg-surface">
                <ListCard titulo={p.name} subtitulo={p.sku} valor={precio(p)} className="border-0" />
                {/* Cada interruptor con su icono y su nombre: dos interruptores sin texto se confunden. */}
                <div className="grid grid-cols-2 divide-x divide-line border-t border-line">
                  <InterruptorConEtiqueta icono={ICONO_INTERRUPTOR_CATALOGO.enWeb} etiqueta={t('tienda.catalogo.enWebCorto')}>
                    {enWeb(p)}
                  </InterruptorConEtiqueta>
                  <InterruptorConEtiqueta icono={ICONO_INTERRUPTOR_CATALOGO.agotado} etiqueta={t('tienda.catalogo.agotadoCorto')}>
                    {agotado(p)}
                  </InterruptorConEtiqueta>
                </div>
              </div>
            )}
            pie={
              catalogo.datos && catalogo.datos.total > catalogo.datos.tamano ? (
                <PaginationCompact pagina={catalogo.datos.pagina} tamano={catalogo.datos.tamano} total={catalogo.datos.total} onPaginaChange={setPagina} cargando={catalogo.cargando} />
              ) : undefined
            }
          />
          {datos.inventarioVisible && (
            <RelatedLinkCard icono={iconoDestino(RUTA_INVENTARIO)} etiqueta={t('tienda.catalogo.editarInventario')} valor={t('tienda.catalogo.editarInventarioDetalle')} href={RUTA_INVENTARIO} />
          )}
        </>
      )}
    </div>
  );
}

/**
 * «Crear ficha editable» / «Crear página editable» (Figma 2700:57498): una tarjeta por página de
 * detalle que el borrador no tiene. Al crearla abre el editor en ella.
 */
function DetallesFaltantes({
  faltan,
  puedeEditar,
  onCrear,
  t,
}: {
  faltan: readonly TipoPaginaDetalle[];
  puedeEditar: boolean;
  onCrear: (tipo: TipoPaginaDetalle) => Promise<void>;
  t: TraductorVentas;
}) {
  const [creando, setCreando] = useState<TipoPaginaDetalle | null>(null);
  const crear = async (tipo: TipoPaginaDetalle) => {
    setCreando(tipo);
    try {
      await onCrear(tipo);
    } finally {
      setCreando(null);
    }
  };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {faltan.map((tipo) => (
        <Tarjeta key={tipo} titulo={t(`tienda.plantillas.crear.${tipo}.titulo`)} descripcion={t(`tienda.plantillas.crear.${tipo}.descripcion`)}>
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-line bg-subtle px-4 py-6 text-center">
            <p className="text-sm font-semibold text-fg">{t(`tienda.plantillas.crear.${tipo}.vacioTitulo`)}</p>
            <p className="max-w-prose text-[13px] leading-[18px] text-fg-secondary">{t(`tienda.plantillas.crear.${tipo}.vacioTexto`)}</p>
            <button
              type="button"
              className={clasesBoton({ variante: 'primario', tamano: 'md', className: 'mt-2' })}
              disabled={!puedeEditar || creando !== null}
              aria-busy={creando === tipo}
              onClick={() => void crear(tipo)}
            >
              <Plus aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
              {creando === tipo ? t('tienda.plantillas.crear.creando') : t(`tienda.plantillas.crear.${tipo}.boton`)}
            </button>
            {!puedeEditar && <p className="text-xs text-fg-secondary">{t('tienda.plantillas.crear.sinPermiso')}</p>}
          </div>
        </Tarjeta>
      ))}
    </div>
  );
}

function PlantillasDetalle({
  plantillas,
  faltan,
  puedeEditar,
  onCrear,
  t,
}: {
  plantillas: readonly PlantillaTienda[];
  faltan: readonly TipoPaginaDetalle[];
  puedeEditar: boolean;
  onCrear: (tipo: TipoPaginaDetalle) => Promise<void>;
  t: TraductorVentas;
}) {
  const tipo = (p: PlantillaTienda) => {
    const clave = `tienda.plantillas.tipos.${p.tipo}`;
    const texto = t(clave);
    return texto === clave ? p.tipo : texto;
  };
  const editar = (p: PlantillaTienda) =>
    p.origen === 'v2' ? (
      <Link href={rutaEditorSitio(p.id)} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
        <Pencil aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
        {t('tienda.plantillas.editar')}
      </Link>
    ) : (
      <span className="text-xs text-fg-secondary">{t('tienda.plantillas.soloV2')}</span>
    );
  const columnas: ColumnaTabla<PlantillaTienda>[] = [
    {
      id: 'plantilla',
      encabezado: t('tienda.plantillas.columnas.plantilla'),
      celda: (p) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-fg">{p.titulo}</p>
          <p className="text-xs text-fg-secondary">{tipo(p)}</p>
        </div>
      ),
    },
    { id: 'ruta', encabezado: t('tienda.plantillas.columnas.direccion'), variante: 'mono', celda: (p) => <span className="text-[13px] text-fg-secondary">{p.ruta}</span> },
    { id: 'editar', encabezado: '', alinear: 'derecha', celda: editar },
  ];
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-fg-secondary">{t('tienda.plantillas.descripcion')}</p>
      {faltan.length > 0 && <DetallesFaltantes faltan={faltan} puedeEditar={puedeEditar} onCrear={onCrear} t={t} />}
      {(plantillas.length > 0 || faltan.length === 0) && (
      <DataTable
        etiqueta={t('tienda.pestanas.plantillas')}
        columnas={columnas}
        filas={plantillas}
        obtenerId={(p) => p.id}
        vacio={{ titulo: t('tienda.plantillas.vacio'), icono: FileText }}
        tarjetaMovil={(p) => <ListCard inicio="icono" icono={FileText} titulo={p.titulo} subtitulo={`${tipo(p)} · ${p.ruta}`} estado={editar(p)} />}
      />
      )}
    </div>
  );
}

function Resenas({
  datos,
  onAutoAprobar,
  onModerada,
  t,
  rutaEditor,
}: {
  datos: RespuestaTienda;
  onAutoAprobar: (v: boolean) => Promise<void>;
  onModerada: () => void;
  t: TraductorVentas;
  rutaEditor: string | null;
}) {
  const { toast } = useToast();
  const tr = useTranslations('sitioWeb.resenas');
  const { organization } = useOrganization() as { organization?: { name?: string | null } | null };
  const [ajustes, setAjustes] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const alternar = async (v: boolean) => {
    setOcupado(true);
    try {
      await onAutoAprobar(v);
      toast({ title: t('tienda.resenas.guardado') });
    } catch (error) {
      toast({ title: t('tienda.resenas.error', { mensaje: (error as Error).message }), variant: 'destructive' });
    } finally {
      setOcupado(false);
    }
  };
  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      <div className="flex justify-end">
        <button type="button" onClick={() => setAjustes(true)} className={clasesBoton({ variante: 'secundario', tamano: 'md' })}>
          <Settings aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
          {tr('ajustes.boton')}
        </button>
      </div>
      <Tarjeta>
        <SettingRow titulo={t('tienda.resenas.autoAprobar')} descripcion={t('tienda.resenas.autoAprobarAyuda')} htmlFor="auto-aprobar-resenas">
          <Switch
            id="auto-aprobar-resenas"
            checked={datos.autoAprobarResenas}
            disabled={!datos.permisos.editar || ocupado}
            onCheckedChange={(v) => void alternar(v)}
          />
        </SettingRow>
      </Tarjeta>
      <ModeracionResenas t={t} puedeEditar={datos.permisos.editar} pendientes={datos.kpis.resenasPendientes} alCambiar={onModerada} nombreTienda={organization?.name ?? null} />
      {/* «Moderar» de la hoja es el mismo ajuste que el interruptor de arriba: al guardar se relee. */}
      <AjustesResenasHoja abierto={ajustes} onAbiertoChange={setAjustes} rutaEditor={rutaEditor} alGuardar={onModerada} />
    </div>
  );
}

export function PantallaTienda() {
  const t = useTextosVentas();
  const { datos, cargando, fallo, recargar, refrescar, alternarAutoAprobar, crearDetalle } = useTiendaSitio();
  const router = useRouter();
  const { toast } = useToast();
  const onCrearDetalle = async (tipo: TipoPaginaDetalle) => {
    try {
      const paginaId = await crearDetalle(tipo);
      toast({ title: t('tienda.plantillas.crear.publicar') });
      router?.push(rutaEditorSitio(paginaId));
    } catch (error) {
      if (error instanceof ErrorApiVentas && error.codigo === 'conflicto_version') {
        toast({ title: t('tienda.plantillas.crear.conflicto'), variant: 'destructive' });
        await refrescar();
        return;
      }
      toast({ title: t('tienda.plantillas.crear.error', { mensaje: (error as Error).message }), variant: 'destructive' });
    }
  };
  const [pestana, setPestana] = useOpcionUrl<PestanaTienda>('tab', PESTANAS, 'catalogo', 'replace');

  const estado: EstadoVistaSitio = cargando ? 'cargando' : fallo === 'sin_permiso' ? 'sin_permiso' : fallo || !datos ? 'error' : 'listo';
  const plantillaProducto = datos?.plantillas.find((p) => p.tipo === 'product_detail' && p.origen === 'v2');

  return (
    <MarcoSitioWeb
      href={RUTA_TIENDA}
      subtitulo={estado === 'listo' ? t('tienda.subtitulo') : undefined}
      rutaEditor={plantillaProducto ? rutaEditorSitio(plantillaProducto.id) : null}
      estado={estado === 'sin_permiso' ? 'listo' : estado}
      acciones={estado === 'sin_permiso' ? <></> : undefined}
      onReintentar={() => void recargar()}
      esqueleto={<EsqueletoTienda />}
      nombreContenido={t('tienda.nombreContenido')}
    >
      {estado === 'sin_permiso' ? (
        <EmptyState variante="forbidden" titulo={t('tienda.sinPermiso.titulo')} descripcion={t('tienda.sinPermiso.descripcion')} />
      ) : datos ? (
        <div className="flex flex-col gap-4 lg:gap-6">
          <TabBar
            id={ID_TABS}
            etiqueta={t('tienda.pestanas.etiqueta')}
            valor={pestana}
            onValorChange={setPestana}
            pestanas={[
              { valor: 'catalogo', etiqueta: t('tienda.pestanas.catalogo'), icono: ICONO_PESTANA_TIENDA.catalogo },
              { valor: 'plantillas', etiqueta: t('tienda.pestanas.plantillas'), icono: ICONO_PESTANA_TIENDA.plantillas, contador: datos.plantillas.length },
              { valor: 'resenas', etiqueta: t('tienda.pestanas.resenas'), icono: ICONO_PESTANA_TIENDA.resenas, contador: datos.kpis.resenasPendientes || undefined },
            ]}
          />
          <div role="tabpanel" id={idPanel(ID_TABS, pestana)} aria-labelledby={idPestana(ID_TABS, pestana)}>
            {pestana === 'catalogo' && <CatalogoWeb datos={datos} t={t} />}
            {pestana === 'plantillas' && (
              <PlantillasDetalle
                plantillas={datos.plantillas}
                faltan={datos.detalles.faltan}
                puedeEditar={datos.permisos.editar}
                onCrear={onCrearDetalle}
                t={t}
              />
            )}
            {pestana === 'resenas' && (
              <>
                {datos.kpis.resenasPendientes > 0 && (
                  <p className="mb-3 flex items-center gap-2 text-[13px] text-fg-secondary">
                    <Star aria-hidden="true" className={cn(CLASE_TAMANO_ICONO.base, 'text-warning-text')} strokeWidth={TRAZO_ICONO} />
                    <StatusBadge estado="pendiente" etiqueta={t('tienda.resenas.pendientes', { n: datos.kpis.resenasPendientes })} tamano="sm" />
                  </p>
                )}
                <Resenas datos={datos} onAutoAprobar={alternarAutoAprobar} onModerada={() => void refrescar()} t={t} rutaEditor={plantillaProducto ? rutaEditorSitio(plantillaProducto.id) : null} />
              </>
            )}
          </div>
        </div>
      ) : null}
    </MarcoSitioWeb>
  );
}
