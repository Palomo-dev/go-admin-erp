'use client';

/**
 * «SEO y redes» (/app/sitio-web/seo; Figma B/08-01 escritorio, B/08-02 estados,
 * B/08-03 móvil, notas B/08-04 y B/08-05).
 *
 * - Cabecera (MarcoSitioWeb): «Actualizar», «Ver sitemap», «Guardar» (la única
 *   primaria) y «⋯» (ocultar de los buscadores, robots.txt, Search Console).
 * - Escritorio: formulario a la izquierda y vista previa fija a la derecha;
 *   debajo, «Calidad SEO por página».
 * - Móvil (< lg): vista previa de una red y filas que abren cada sección en
 *   una hoja (los MISMOS componentes de sección, sin copia).
 * - Cinco estados: cargando, primera vez, error, sin permiso y listo; barra
 *   «Tienes cambios sin guardar» con Ctrl+S; conflicto 409 con «Recargar».
 *
 * Guarda en el BORRADOR V2 (`useSitioV2`) y en `website_settings` por
 * servidor; la publicación sale por la barra del módulo.
 */
import { toast } from 'sonner';
import { EmptyState, SettingsSaveBar, clasesBoton, useEsEscritorio, type AccionFila } from '@/components/kit';
import { Skeleton } from '@/components/ui/skeleton';
import { MarcoSitioWeb } from '../MarcoSitioWeb';
import { DialogoConflicto } from '../paginas/DialogoConflicto';
import { giroEnTexto } from './giroTexto';
import { sugerenciaBasica } from './seoLogica';
import { SeccionTituloDescripcion } from './SeccionTituloDescripcion';
import { SeccionImagenCompartir } from './SeccionImagenCompartir';
import { SeccionRedesSociales } from './SeccionRedesSociales';
import { SeccionGoogle, urlSearchConsole } from './SeccionGoogle';
import { VistaPreviaCompartir } from './VistaPreviaCompartir';
import { CalidadSeoPaginas } from './CalidadSeoPaginas';
import { SeoMovil } from './SeoMovil';
import { useSeoSitio } from './useSeoSitio';
import { useSaludSeo } from './useSaludSeo';
import { useTextosSeoAnalitica } from './textos';
import { ICONO_ACCION_SEO, ICONO_GOOGLE_SEO } from './iconosSeoAnalitica';
import { CLASE_TAMANO_ICONO, TRAZO_ICONO } from '../ui/iconosSitio';

export const RUTA_SEO_SITIO_WEB = '/app/sitio-web/seo';

/** Esqueleto de B/08-02: barra de título, dos líneas, un bloque y una línea. */
export function EsqueletoSeo() {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-6" aria-busy="true" data-testid="esqueleto-seo">
      <Skeleton className="h-4 w-1/3 rounded-md" />
      <Skeleton className="h-3 w-full rounded-md" />
      <Skeleton className="h-3 w-full rounded-md" />
      <Skeleton className="h-16 w-full rounded-lg" />
      <Skeleton className="h-3 w-full rounded-md" />
    </div>
  );
}

export function SeoYRedes() {
  const t = useTextosSeoAnalitica();
  const s = useSeoSitio();
  const escritorio = useEsEscritorio();
  const salud = useSaludSeo(s.estado === 'listo');
  const host = s.servidor?.host ?? s.ctx.host;
  const f = s.formulario;

  const guardar = async () => {
    const r = await s.guardar();
    if (r === 'ok') toast.success(t('seo.estados.guardado'));
    else if (r === 'error') toast.error(t('seo.estados.errorGuardar', { mensaje: s.errorGuardado ?? t('seo.estados.errorTexto') }));
  };

  const actualizar = () => {
    void salud.actualizar();
    void s.recargar();
  };

  const noindexDisponible = s.servidor?.ocultarBuscadores !== null && s.servidor?.ocultarBuscadores !== undefined;
  const menu: AccionFila[] = [
    {
      id: 'ocultar',
      etiqueta: f.ocultar ? t('seo.acciones.mostrar') : t('seo.acciones.ocultar'),
      icono: ICONO_GOOGLE_SEO.ocultar,
      onSelect: () => s.cambiar({ ocultar: !f.ocultar }),
      deshabilitada: !noindexDisponible,
      motivo: t('seo.google.ocultarPendiente'),
    },
    {
      id: 'robots',
      etiqueta: t('seo.acciones.verRobots'),
      icono: ICONO_ACCION_SEO.robots,
      onSelect: () => host && window.open(`https://${host}/robots.txt`, '_blank', 'noopener,noreferrer'),
      deshabilitada: !host,
      motivo: t('seo.google.canonicaFalta'),
    },
    {
      id: 'search-console',
      etiqueta: t('seo.acciones.abrirSearchConsole'),
      icono: ICONO_GOOGLE_SEO.searchConsole,
      onSelect: () => window.open(urlSearchConsole(host), '_blank', 'noopener,noreferrer'),
    },
  ];

  const listo = s.estado === 'listo' && !s.primeraVez;
  const fallo = s.estado === 'error' || s.estado === 'sin_permiso';

  const botonGuardar = (
    <button
      type="button"
      onClick={() => void guardar()}
      disabled={!listo || s.cambios === 0 || s.guardando || s.hayErrores}
      className={clasesBoton({ variante: 'primario', tamano: 'md' })}
    >
      <ICONO_ACCION_SEO.guardar aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
      {t('seo.acciones.guardar')}
    </button>
  );
  const secundarias = (
    <>
      <button type="button" onClick={actualizar} aria-label={t('seo.acciones.actualizar')} title={t('seo.acciones.actualizar')} className={clasesBoton({ variante: 'secundario', tamano: 'md' }) + ' w-10 px-0'}>
        <ICONO_ACCION_SEO.actualizar aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
      </button>
      {host && (
        <a href={`https://${host}/sitemap.xml`} target="_blank" rel="noopener noreferrer" className={clasesBoton({ variante: 'secundario', tamano: 'md' })}>
          <ICONO_ACCION_SEO.abrirFuera aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
          {t('seo.acciones.verSitemap')}
        </a>
      )}
    </>
  );

  const primeraVez = (
    <div className="rounded-xl border border-line bg-surface">
      <EmptyState
        variante="empty"
        titulo={t('seo.estados.vacioTitulo')}
        descripcion={t('seo.estados.vacioTexto')}
        accionSecundaria={{
          etiqueta: t('seo.estados.usarSugerencias'),
          icono: ICONO_ACCION_SEO.sugerirIa,
          onClick: () => {
            const n = s.servidor?.negocio;
            s.empezar(n ? sugerenciaBasica(n.nombre, giroEnTexto(n.giro), n.logoUrl) : undefined);
          },
        }}
        accion={{ etiqueta: t('seo.estados.escribirLosMios'), icono: ICONO_ACCION_SEO.escribir, onClick: () => s.empezar() }}
      />
    </div>
  );

  const contenidoFallo =
    s.estado === 'sin_permiso' ? (
      <div className="rounded-xl border border-line bg-surface">
        <EmptyState variante="forbidden" titulo={t('seo.estados.sinPermisoTitulo')} descripcion={t('seo.estados.sinPermisoTexto')} />
      </div>
    ) : (
      <div className="rounded-xl border border-line bg-surface">
        <EmptyState variante="error" titulo={t('seo.estados.errorTitulo')} descripcion={t('seo.estados.errorTexto')} onReintentar={() => void s.recargar()} />
      </div>
    );

  return (
    <MarcoSitioWeb
      href={RUTA_SEO_SITIO_WEB}
      subtitulo={t('seo.subtitulo')}
      host={host}
      sinVerSitio
      estado={fallo ? 'listo' : s.estado === 'listo' && s.primeraVez ? 'primera_vez' : s.estado}
      primeraVez={primeraVez}
      esqueleto={<EsqueletoSeo />}
      nombreContenido={t('seo.nombreContenido')}
      onReintentar={() => void s.recargar()}
      acciones={fallo ? <></> : undefined}
      accionesSecundarias={secundarias}
      accionPrimaria={botonGuardar}
      menu={menu}
    >
      {fallo ? (
        contenidoFallo
      ) : (
        <>
          {f.ocultar && s.base.ocultar && (
            <p role="status" className="flex items-start gap-2 rounded-lg border border-line-warning bg-warning-subtle px-3 py-2 text-sm text-warning-text">
              <ICONO_GOOGLE_SEO.ocultar aria-hidden="true" className={`${CLASE_TAMANO_ICONO.base} mt-0.5 shrink-0`} strokeWidth={TRAZO_ICONO} />
              {t('seo.google.ocultoAviso')}
            </p>
          )}
          {escritorio ? (
            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="flex min-w-0 flex-col gap-6">
                  <SeccionTituloDescripcion s={s} />
                  <SeccionImagenCompartir s={s} />
                  <SeccionRedesSociales s={s} />
                  <SeccionGoogle s={s} salud={salud} />
                </div>
                <VistaPreviaCompartir host={host} titulo={f.titulo} descripcion={f.descripcion} imagen={f.imagen} className="lg:sticky lg:top-4" />
              </div>
              <CalidadSeoPaginas paginas={s.paginas} productos={s.servidor?.productos ?? null} />
            </div>
          ) : (
            <SeoMovil s={s} salud={salud} host={host} />
          )}
          <SettingsSaveBar
            cambios={s.cambios}
            guardando={s.guardando}
            onGuardar={() => void guardar()}
            onDescartar={s.descartar}
            deshabilitado={s.hayErrores}
            motivo={t('seo.redes.invalido')}
          />
        </>
      )}
      <DialogoConflicto abierto={s.ctx.sitio.conflicto} onCerrar={() => void s.ctx.sitio.recargar()} onRecargar={() => s.ctx.sitio.recargar()} />
    </MarcoSitioWeb>
  );
}
