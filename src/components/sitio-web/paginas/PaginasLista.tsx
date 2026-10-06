'use client';

/**
 * Sitio web › Páginas (Figma A/04a-04h): tabla de páginas con TabBar Todas / En el menú /
 * Ocultas / Legales, estado de publicación, interruptor «En el menú», salud SEO y fecha; diálogo
 * «Nueva página»; estados cargando, vacío (primera vez), error, sin permiso y móvil 390 (tarjetas
 * con ActionSheet y el aviso «Para editar secciones, usa un computador»).
 *
 * Datos y acciones: `usePaginasSitio` (GET/POST/PATCH/DELETE de /api/sitio-web/paginas). Todo
 * se escribe en el borrador; publicar se hace desde el Resumen o el editor.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ExternalLink, FileText, Pencil, Plus, RotateCcw, Scale } from 'lucide-react';
import {
  ActionSheet,
  AvisoTonal,
  DataTable,
  EmptyState,
  ListCard,
  RowActionsMenu,
  TabBar,
  clasesBoton,
  idPanel,
  idPestana,
  useEsEscritorio,
  useOpcionUrl,
  type AccionFila,
  type ColumnaTabla,
} from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/use-toast';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { MarcoSitioWeb } from '@/components/sitio-web/MarcoSitioWeb';
import { PublishStatusBadge } from '@/components/sitio-web/ui/PublishStatusBadge';
import { CLASE_TAMANO_ICONO, ICONO_TAREA_SITIO, TRAZO_ICONO } from '@/components/sitio-web/ui/iconosSitio';
import { RAIZ_SITIO_WEB, rutaEditorSitio } from '@/components/sitio-web/rutasSitioWeb';
import { useUrlSitio } from '@/components/sitio-web/useUrlSitio';
import { RUTA_MENU_NAVEGACION, useAccionesPagina } from './AccionesPagina';
import { apiPaginas, ErrorApiPaginas } from './apiPaginas';
import { DialogoConflicto } from './DialogoConflicto';
import { fechaRelativa } from './fechaPagina';
import { ICONO_SALUD_SEO, ICONO_TIPO_PAGINA } from './iconosPagina';
import { NuevaPaginaDialog, type DatosNuevaPagina } from './NuevaPaginaDialog';
import { TONO_SALUD_SEO } from './saludSeo';
import { useTextosPaginas, type TraductorPaginas } from './textos';
import { usePaginasSitio } from './usePaginasSitio';
import { enPestana, type FilaPagina, type PestanaPaginas } from './vistaPaginas';

export const RUTA_PAGINAS = `${RAIZ_SITIO_WEB}/paginas`;
export const RUTA_LEGALES = `${RAIZ_SITIO_WEB}/configuracion#legales`;
/** Menú y navegación: el icono de la tarea en la tabla única del módulo. */
const IconoMenu = ICONO_TAREA_SITIO.menu;

const PESTANAS: readonly PestanaPaginas[] = ['todas', 'menu', 'ocultas', 'legales'];

/** «Inicio, Menú, Ofertas, Contacto y legales» a partir del juego base REAL del giro (no cableado). */
function listaBase(titulos: readonly string[], t: TraductorPaginas): string {
  const sinLegales = titulos.filter((x) => !/términos|privacidad/i.test(x));
  return t('lista.listaBase', { paginas: sinLegales.join(', ') });
}

export function PaginasLista() {
  const t = useTextosPaginas();
  const router = useRouter();
  const esEscritorio = useEsEscritorio();
  const locale = useLocaleIntl();
  const { timezone } = useFormatDate(null);
  const { organization } = useOrganization();
  const url = useUrlSitio(organization?.id);
  const paginas = usePaginasSitio(null);
  const { datos, cargando, fallo } = paginas;
  const [pestana, setPestana] = useOpcionUrl<PestanaPaginas>('tab', PESTANAS, 'todas');
  const [nueva, setNueva] = useState(false);
  const [hoja, setHoja] = useState<FilaPagina | null>(null);
  const acciones = useAccionesPagina(paginas, url.host);

  const puedeEditar = !!datos?.permisos.editar;
  const sinPermiso = fallo === 'sin_permiso' || (!!datos && !datos.permisos.editar);
  const filas = useMemo(() => (datos?.paginas ?? []).filter((f) => enPestana(f, pestana)), [datos, pestana]);
  const ahora = useMemo(() => new Date(), [datos]); // eslint-disable-line react-hooks/exhaustive-deps

  const restaurar = async () => {
    try {
      const r = await paginas.escribir('*', (c) => apiPaginas.restaurarBase(c));
      if (r) {
        toast({
          title: r.creadas ? t('lista.restauradas', { n: r.creadas }) : t('lista.restauradasNinguna'),
          description: r.creadas ? t('lista.guardadoBorrador') : undefined,
        });
      }
    } catch (error) {
      toast({ title: t('lista.noSePudo'), description: error instanceof ErrorApiPaginas ? error.message : undefined, variant: 'destructive' });
    }
  };

  const crear = async (d: DatosNuevaPagina) => {
    try {
      const r = await paginas.escribir('*', (c) => apiPaginas.crear(c, d));
      if (!r) {
        setNueva(false);
        return null;
      }
      toast({ title: t('nueva.creada') });
      setNueva(false);
      if (r.paginaId) router.push(rutaEditorSitio(r.paginaId));
      return null;
    } catch (error) {
      return error instanceof ErrorApiPaginas && error.codigoPagina ? error.codigoPagina : 'otro';
    }
  };

  const alternarMenu = async (fila: FilaPagina, valor: boolean) => {
    const ok = await paginas.alternarEnMenu(fila.id, valor);
    if (!ok && !paginas.conflicto) toast({ title: t('lista.noSePudo'), description: t('lista.revertido'), variant: 'destructive' });
  };

  // ── Cabecera ──────────────────────────────────────────────────────────────
  const verSitio: AccionFila | null = url.url
    ? { id: 'ver', etiqueta: t('lista.verSitio'), icono: ExternalLink, onSelect: () => window.open(url.url!, '_blank', 'noopener,noreferrer') }
    : null;
  const menuCabecera: AccionFila[] = [
    // En móvil la cabecera solo tiene «⋯» (A/04h): ahí van también las dos acciones visibles en escritorio.
    { id: 'nueva', etiqueta: t('lista.nuevaPagina'), icono: Plus, onSelect: () => setNueva(true), oculta: esEscritorio },
    { id: 'navegacion', etiqueta: t('lista.menuYNavegacion'), icono: IconoMenu, onSelect: () => router.push(RUTA_MENU_NAVEGACION), oculta: esEscritorio },
    { id: 'restaurar', etiqueta: t('lista.restaurarBase'), icono: RotateCcw, onSelect: () => void restaurar(), deshabilitada: paginas.ocupado !== null },
    ...(verSitio ? [verSitio] : []),
    { id: 'legales', etiqueta: t('lista.irLegales'), icono: Scale, onSelect: () => router.push(RUTA_LEGALES) },
  ];
  const accionesCabecera = sinPermiso ? (
    <></>
  ) : (
    <>
      <Link href={RUTA_MENU_NAVEGACION} className={clasesBoton({ variante: 'secundario', tamano: 'md' })}>
        <IconoMenu aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
        {t('lista.menuYNavegacion')}
      </Link>
      <button type="button" onClick={() => setNueva(true)} className={clasesBoton({ variante: 'primario', tamano: 'md' })}>
        <Plus aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
        {t('lista.nuevaPagina')}
      </button>
      <RowActionsMenu acciones={menuCabecera} titulo={t('lista.masAcciones')} orientacion="horizontal" tamano="md" />
    </>
  );

  const contadores = datos?.contadores;
  const subtitulo =
    fallo || sinPermiso
      ? url.host ?? undefined
      : !contadores
        ? undefined
        : contadores.conCambios > 0
          ? contadores.conCambios === 1
            ? t('lista.subtituloCambiosUna', { n: contadores.todas })
            : t('lista.subtituloCambios', { n: contadores.todas, c: contadores.conCambios })
          : contadores.todas === 1
            ? t('lista.subtituloUna')
            : t('lista.subtitulo', { n: contadores.todas });

  // ── Columnas (A/04a) ────────────────────────────────────────────────────────
  const fecha = (valor: string | null) => {
    const f = fechaRelativa(valor, timezone, ahora, locale);
    if (f.tipo === 'hoy') return t('fecha.hoy', { hora: f.hora });
    if (f.tipo === 'ayer') return t('fecha.ayer');
    if (f.tipo === 'fecha') return f.texto;
    return t('fecha.sinFecha');
  };

  const columnas: ColumnaTabla<FilaPagina>[] = [
    {
      id: 'pagina',
      encabezado: t('lista.columnas.pagina'),
      celda: (f) => {
        const Icono = ICONO_TIPO_PAGINA[f.tipo] ?? FileText;
        return (
          <span className="flex min-w-0 items-center gap-3">
            <Icono aria-hidden="true" className={`${CLASE_TAMANO_ICONO.base} shrink-0 text-fg-secondary`} strokeWidth={TRAZO_ICONO} />
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-medium text-fg">{f.titulo}</span>
              <span className="truncate text-xs text-fg-secondary">{f.ruta}</span>
            </span>
          </span>
        );
      },
    },
    { id: 'tipo', encabezado: t('lista.columnas.tipo'), celda: (f) => <span className="text-fg-secondary">{t(`tipos.${f.tipo}`)}</span>, ocultarDebajo: 'xl' },
    { id: 'estado', encabezado: t('lista.columnas.estado'), celda: (f) => <PublishStatusBadge estado={f.estado} tamano="sm" /> },
    {
      id: 'menu',
      encabezado: t('lista.columnas.enMenu'),
      celda: (f) =>
        f.legal ? (
          <span className="text-fg-secondary">{t('lista.piePagina')}</span>
        ) : (
          <Switch
            checked={f.enMenu}
            disabled={paginas.ocupado !== null}
            aria-label={t('lista.mostrarEnMenu', { nombre: f.titulo })}
            onCheckedChange={(v) => void alternarMenu(f, v)}
          />
        ),
    },
    {
      id: 'seo',
      encabezado: t('lista.columnas.seo'),
      celda: (f) => (
        <Badge tono={TONO_SALUD_SEO[f.seo]} apariencia="suave" tamano="sm" icono={ICONO_SALUD_SEO[f.seo]} data-salud={f.seo}>
          {t(`seo.${f.seo}`)}
        </Badge>
      ),
      ocultarDebajo: 'lg',
    },
    {
      id: 'actualizada',
      encabezado: t('lista.columnas.actualizada'),
      celda: (f) => <span className="whitespace-nowrap tabular-nums text-fg-secondary">{fecha(f.actualizadaEn)}</span>,
    },
  ];

  // ── Estados ───────────────────────────────────────────────────────────────
  const listaVacia = !!datos && datos.paginas.length === 0;
  let cuerpo;
  if (sinPermiso) {
    cuerpo = (
      <EmptyState
        variante="forbidden"
        titulo={t('lista.sinPermisoTitulo')}
        descripcion={t('lista.sinPermisoDescripcion')}
        accion={url.url ? { etiqueta: t('lista.verSitio'), onClick: () => window.open(url.url!, '_blank', 'noopener,noreferrer') } : undefined}
      />
    );
  } else if (fallo === 'error') {
    cuerpo = (
      <EmptyState
        variante="error"
        titulo={t('lista.errorTitulo')}
        descripcion={t('lista.errorDescripcion')}
        onReintentar={() => void paginas.recargar()}
      />
    );
  } else if (listaVacia) {
    cuerpo = (
      <EmptyState
        variante="empty"
        titulo={t('lista.vacioTitulo')}
        descripcion={t('lista.vacioDescripcion', { lista: listaBase(datos.paginasBase, t) })}
        accionSecundaria={{ etiqueta: t('lista.nuevaPagina'), onClick: () => setNueva(true), icono: Plus }}
        accion={{ etiqueta: t('lista.restaurarBase'), onClick: () => void restaurar(), icono: RotateCcw }}
      />
    );
  } else {
    cuerpo = (
      <div className="flex flex-col gap-4">
        {datos?.modo === 'legacy' && puedeEditar && <AvisoTonal tono="informacion" compacto titulo={t('lista.soloLectura')} />}
        <TabBar
          id="paginas"
          etiqueta={t('lista.pestanas')}
          valor={pestana}
          onValorChange={setPestana}
          pestanas={PESTANAS.map((p) => ({
            valor: p,
            etiqueta: t(p === 'menu' ? 'lista.enMenu' : `lista.${p}`),
            contador: contadores ? contadores[p] : undefined,
          }))}
        />
        <div role="tabpanel" id={idPanel('paginas', pestana)} aria-labelledby={idPestana('paginas', pestana)}>
          <DataTable
            etiqueta={t('lista.etiquetaTabla')}
            columnas={columnas}
            filas={filas}
            obtenerId={(f) => f.id}
            etiquetaFila={(f) => f.titulo}
            estado={cargando ? 'cargando' : 'listo'}
            filasEsqueleto={7}
            acciones={acciones.accionesFila}
            accionesRapidas={(f) => (
              <Link
                href={rutaEditorSitio(f.id)}
                aria-label={t('lista.editarPagina', { nombre: f.titulo })}
                className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}
              >
                <Pencil aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
                {t('lista.editar')}
              </Link>
            )}
            tarjetaMovil={(f) => (
              <ListCard
                // Icono del tipo en caja de 40 (icono de 20): en móvil se reconoce la página antes de leerla.
                icono={ICONO_TIPO_PAGINA[f.tipo] ?? FileText}
                titulo={f.titulo}
                subtitulo={f.ruta}
                estado={<PublishStatusBadge estado={f.estado} tamano="sm" />}
                onClick={() => setHoja(f)}
              />
            )}
            vacio={{
              titulo: t('lista.vacioPestanaTitulo'),
              descripcion: pestana === 'legales' ? t('lista.vacioLegalesDescripcion') : t('lista.vacioPestanaDescripcion'),
              accion:
                pestana === 'legales'
                  ? { etiqueta: t('lista.irLegales'), href: RUTA_LEGALES }
                  : { etiqueta: t('lista.nuevaPagina'), onClick: () => setNueva(true), icono: Plus },
            }}
          />
        </div>
        {!cargando && (
          <AvisoTonal tono="informacion" titulo={t('lista.avisoMovilTitulo')} descripcion={t('lista.avisoMovilDescripcion')} className="lg:hidden" />
        )}
      </div>
    );
  }

  return (
    <MarcoSitioWeb
      href={RUTA_PAGINAS}
      estado={cargando && !datos ? 'cargando' : 'listo'}
      esqueleto={cuerpo}
      subtitulo={subtitulo}
      host={url.host}
      acciones={accionesCabecera}
    >
      {cuerpo}
      {datos && (
        <NuevaPaginaDialog
          abierto={nueva}
          onAbiertoChange={setNueva}
          giro={datos.giro}
          slugsUsados={datos.paginas.map((p) => p.slug)}
          host={url.host}
          onCrear={crear}
        />
      )}
      {hoja && (
        <ActionSheet
          abierto={hoja !== null}
          onAbiertoChange={(v) => !v && setHoja(null)}
          titulo={hoja.titulo}
          descripcion={hoja.ruta}
          acciones={acciones.accionesMovil(hoja)}
        />
      )}
      {acciones.dialogos}
      <DialogoConflicto abierto={paginas.conflicto} onCerrar={paginas.cerrarConflicto} onRecargar={paginas.recargar} />
    </MarcoSitioWeb>
  );
}
