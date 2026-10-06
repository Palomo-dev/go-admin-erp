'use client';

/**
 * Marco común de las subpáginas del módulo «Sitio web» (/app/sitio-web/**,
 * Figma A/02a-02g, A/04, A/06, B/07-B/12):
 *
 * - Cabecera: migas «Sitio web › <página>», icono y título SACADOS DEL
 *   CATÁLOGO de navegación (el mismo nombre que el menú lateral, sin lista
 *   propia), subtítulo «<estado de publicación> · <dirección real>» y las
 *   acciones estándar: «Ver sitio» (secundaria), «Abrir editor» (la única
 *   primaria) y «⋯». En móvil (< lg) todo eso se publica en el MobileHeader
 *   del shell («Sitio web» + nombre de la página, A/02f).
 * - Cinco estados de la página (`estado`): cargando (esqueleto), primera vez
 *   (lleva al asistente), error con «Reintentar», sin permiso y listo.
 *
 * La dirección sale de `useUrlSitio`/`hostSitio` (dominio principal
 * verificado o subdominio): ninguna página la arma por su cuenta.
 */
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ExternalLink, Pencil, type LucideIcon } from 'lucide-react';
import { EmptyState, PageHeader, RowActionsMenu, clasesBoton, type AccionFila, type Miga } from '@/components/kit';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import { moduloPorCodigo } from '@/lib/navigation/catalog';
import { useNombresNav } from '@/lib/navigation/useNombresNav';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useUrlSitio } from './useUrlSitio';
import { RAIZ_SITIO_WEB } from './rutasSitioWeb';
import { useEtiquetaPublicacion } from './ui/PublishStatusBadge';
import type { EstadoPublicacion } from './ui/estadoPublicacion';
import { CLASE_TAMANO_ICONO, TRAZO_ICONO } from './ui/iconosSitio';
import { SubtituloConEstado } from './ui/IconoEstadoPublicacion';
import { useTextosComun } from './ui/textos';

/** Código del módulo en `modules` (y en el catálogo de navegación). */
export const CODIGO_MODULO_SITIO_WEB = 'website';

/** Ruta del asistente de creación (pantalla completa, sin entrada en el menú; A/03). */
export const RUTA_PRIMERA_CONFIGURACION = `${RAIZ_SITIO_WEB}/primera-configuracion`;

/** Los cinco estados de una página del módulo (A/02b-02e). */
export type EstadoVistaSitio = 'cargando' | 'primera_vez' | 'error' | 'sin_permiso' | 'listo';

export interface MarcoSitioWebProps {
  /** Ruta de la subpágina tal como está en el catálogo (`/app/sitio-web/diseno`). */
  href: string;
  /** Para vistas sin entrada en el catálogo (`/paginas/menu`, `/dominios/[id]`). */
  titulo?: string;
  icono?: LucideIcon;
  /** Migas intermedias entre «Sitio web» y la página («Páginas» en Menú y navegación). */
  migasPadre?: readonly Miga[];
  /** Sustituye el subtítulo estándar «<estado> · <dirección>». */
  subtitulo?: ReactNode;
  /** Estado de publicación del sitio (de `useSitioV2`); va al subtítulo. */
  estadoPublicacion?: EstadoPublicacion | null;
  /** Dirección pública ya resuelta; si no se pasa, el marco la lee con `useUrlSitio`. */
  host?: string | null;
  /** «Abrir editor»: ruta del editor (`rutaEditorSitio(pageId)`); sin ella no se pinta. */
  rutaEditor?: string | null;
  /** Primaria propia en lugar de «Abrir editor» («Publicar», «Nueva página», «Guardar»). */
  accionPrimaria?: ReactNode;
  /** Secundarias propias entre «Ver sitio» y la primaria. */
  accionesSecundarias?: ReactNode;
  /** Oculta «Ver sitio» (asistente, páginas donde no aporta). */
  sinVerSitio?: boolean;
  /** Entradas del menú «⋯» de la cabecera. */
  menu?: readonly AccionFila[];
  /** Sustituye TODAS las acciones (compatibilidad con las páginas actuales). */
  acciones?: ReactNode;
  /** Estado de la página; por defecto `listo`. */
  estado?: EstadoVistaSitio;
  onReintentar?: () => void;
  /** Esqueleto propio para `cargando` (por defecto, el de A/02c). */
  esqueleto?: ReactNode;
  /** Contenido de «primera vez» (el héroe del Resumen, A/02b); por defecto, un vacío que lleva al asistente. */
  primeraVez?: ReactNode;
  /** Nombre del contenido para el error («el resumen del sitio»). */
  nombreContenido?: string;
  /**
   * Cabecera móvil propia de la página (< lg). Por defecto es «Sitio web» +
   * nombre de la página (A/02f). Con `subtitulo`, el título pasa a ser la
   * página y el subtítulo, la sección activa («Diseño» / «Estilo del sitio»,
   * A/06g); `volverA` pone la flecha de volver.
   */
  movil?: { subtitulo?: string; volverA?: string };
  children?: ReactNode;
}

export function MarcoSitioWeb({
  href,
  titulo: tituloProp,
  icono: iconoProp,
  migasPadre,
  subtitulo,
  estadoPublicacion,
  host: hostProp,
  rutaEditor,
  accionPrimaria,
  accionesSecundarias,
  sinVerSitio,
  menu,
  acciones,
  estado = 'listo',
  onReintentar,
  esqueleto,
  primeraVez,
  nombreContenido,
  movil,
  children,
}: MarcoSitioWebProps) {
  const tNav = useTranslations('nav');
  const tx = useTextosComun();
  const nombres = useNombresNav();
  const etiquetaPublicacion = useEtiquetaPublicacion();
  const { organization } = useOrganization();
  const urlLeida = useUrlSitio(hostProp === undefined ? organization?.id : null);
  const host = hostProp === undefined ? urlLeida.host : hostProp;
  const url = host ? `https://${host}` : null;

  const modulo = moduloPorCodigo(CODIGO_MODULO_SITIO_WEB);
  const pagina = modulo?.paginas.find((p) => p.href === href);
  const nombreModulo = tNav(modulo?.etiqueta ?? 'sitioWeb');
  const raiz = modulo?.rutas[0] ?? RAIZ_SITIO_WEB;
  const sinPermiso = estado === 'sin_permiso';
  // Sin permiso, la cabecera no revela la página (A/02e: «Sitio web» y nada más).
  const titulo = sinPermiso ? nombreModulo : tituloProp ?? (pagina ? nombres.pagina(pagina) : nombreModulo);
  const icono = iconoProp ?? pagina?.icono ?? modulo?.icono;
  const migas: Miga[] =
    href === raiz && !tituloProp
      ? [{ etiqueta: nombreModulo, href: sinPermiso ? undefined : raiz }, ...(sinPermiso ? [] : [{ etiqueta: titulo }])]
      : [{ etiqueta: nombreModulo, href: raiz }, ...(migasPadre ?? []), { etiqueta: titulo }];

  const textoSubtitulo =
    typeof subtitulo === 'string'
      ? subtitulo
      : [estadoPublicacion ? etiquetaPublicacion(estadoPublicacion) : null, host ?? (urlLeida.cargando ? null : tx('marco.sinDireccion'))]
          .filter(Boolean)
          .join(' · ');
  // Con estado de publicación, el subtítulo lleva su icono de 14 px (el mismo
  // de PublishStatusBadge), para leer el estado sin leer el texto (A/01a).
  const subtituloConIcono =
    estadoPublicacion && textoSubtitulo ? <SubtituloConEstado estado={estadoPublicacion} texto={textoSubtitulo} /> : null;
  const subtituloFinal = sinPermiso
    ? undefined
    : estado === 'cargando'
      ? tx('marco.cargando')
      : subtitulo ?? (subtituloConIcono || textoSubtitulo || undefined);

  const menuCabecera =
    menu && menu.length > 0 ? <RowActionsMenu acciones={menu} titulo={nombreModulo} orientacion="horizontal" tamano="md" /> : null;
  const accionesEstandar = (
    <>
      {!sinVerSitio && url && (
        <a href={url} target="_blank" rel="noopener noreferrer" className={clasesBoton({ variante: 'secundario', tamano: 'md' })}>
          <ExternalLink aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
          {tx('marco.verSitio')}
        </a>
      )}
      {accionesSecundarias}
      {estado !== 'error' &&
        (accionPrimaria ??
          (rutaEditor ? (
            <Link href={rutaEditor} className={clasesBoton({ variante: 'primario', tamano: 'md' })}>
              <Pencil aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
              {tx('marco.abrirEditor')}
            </Link>
          ) : null))}
      {menuCabecera}
    </>
  );

  return (
    <div className="flex min-h-full min-w-0 flex-col gap-4 bg-canvas p-4 lg:gap-6 lg:p-6">
      <PageHeader
        titulo={titulo}
        subtitulo={subtituloFinal}
        cargando={estado === 'cargando'}
        icono={icono}
        migas={migas}
        acciones={sinPermiso ? undefined : acciones ?? accionesEstandar}
        volverA={sinPermiso ? undefined : movil?.volverA}
        movil={{
          titulo: !sinPermiso && movil?.subtitulo ? titulo : nombreModulo,
          subtitulo: sinPermiso ? undefined : movil?.subtitulo ?? (titulo === nombreModulo ? undefined : titulo),
          accion: sinPermiso ? undefined : menuCabecera ?? undefined,
        }}
      />
      <EstadoPagina
        estado={estado}
        onReintentar={onReintentar}
        esqueleto={esqueleto}
        primeraVez={primeraVez}
        nombreContenido={nombreContenido ?? titulo.toLowerCase()}
      >
        {children}
      </EstadoPagina>
    </div>
  );
}

export interface EstadoPaginaProps {
  estado: EstadoVistaSitio;
  onReintentar?: () => void;
  esqueleto?: ReactNode;
  primeraVez?: ReactNode;
  /** «el resumen del sitio» → «No pudimos cargar el resumen del sitio». */
  nombreContenido?: string;
  children?: ReactNode;
}

/** Esqueleto por defecto (A/02c): dos tarjetas, cuatro KPIs y tres filas. */
function EsqueletoSitio() {
  return (
    <div className="flex flex-col gap-4 lg:gap-6" aria-busy="true">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-10 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

/** Contenido según el estado de la página: uno de los cinco de A/02. */
export function EstadoPagina({ estado, onReintentar, esqueleto, primeraVez, nombreContenido, children }: EstadoPaginaProps) {
  const tx = useTextosComun();
  if (estado === 'cargando') return <>{esqueleto ?? <EsqueletoSitio />}</>;
  if (estado === 'error') {
    return (
      <EmptyState
        variante="error"
        titulo={tx('marco.errorTitulo', { pagina: nombreContenido ?? '' })}
        descripcion={tx('marco.errorDescripcion')}
        onReintentar={onReintentar}
      />
    );
  }
  if (estado === 'sin_permiso') {
    return (
      <EmptyState
        variante="forbidden"
        titulo={tx('marco.sinPermisoTitulo')}
        descripcion={tx('marco.sinPermisoDescripcion')}
        accion={{ etiqueta: tx('marco.volverInicio'), href: '/app/inicio' }}
      />
    );
  }
  if (estado === 'primera_vez') {
    return (
      <>
        {primeraVez ?? (
          <EmptyState
            variante="empty"
            titulo={tx('marco.primeraVezTitulo')}
            descripcion={tx('marco.primeraVezDescripcion')}
            accion={{ etiqueta: tx('marco.primeraVezAccion'), href: RUTA_PRIMERA_CONFIGURACION }}
          />
        )}
      </>
    );
  }
  return <>{children}</>;
}

export interface EstadoAjustesProps {
  cargando: boolean;
  hayAjustes: boolean;
  onReintentar: () => void;
  /** La persona no tiene permiso (decidido en el servidor). */
  sinPermiso?: boolean;
  /** El sitio aún no existe: muestra `primeraVez` o el vacío que lleva al asistente. */
  esPrimeraVez?: boolean;
  primeraVez?: ReactNode;
  nombreContenido?: string;
  children: ReactNode;
}

/**
 * Compatibilidad para las páginas que leen `website_settings`: traduce
 * (cargando, hayAjustes) a los cinco estados de `EstadoPagina`.
 */
export function EstadoAjustes({
  cargando,
  hayAjustes,
  onReintentar,
  sinPermiso,
  esPrimeraVez,
  primeraVez,
  nombreContenido,
  children,
}: EstadoAjustesProps) {
  const estado: EstadoVistaSitio = sinPermiso
    ? 'sin_permiso'
    : cargando
      ? 'cargando'
      : esPrimeraVez
        ? 'primera_vez'
        : hayAjustes
          ? 'listo'
          : 'error';
  return (
    <EstadoPagina estado={estado} onReintentar={onReintentar} primeraVez={primeraVez} nombreContenido={nombreContenido}>
      {children}
    </EstadoPagina>
  );
}
