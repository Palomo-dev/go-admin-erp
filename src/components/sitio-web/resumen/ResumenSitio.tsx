'use client';

/**
 * Resumen del módulo Sitio web (/app/sitio-web, Figma A/02a-02i): orquesta los
 * cinco estados (cargando A/02c, primera vez A/02b, error A/02d, sin permiso
 * A/02e y listo A/02a) y el móvil a 390 (A/02f, A/02g) sobre `MarcoSitioWeb`.
 *
 * Datos: UNA llamada a `GET /api/sitio-web/resumen`. Publicar va por
 * `useSitioV2` (el mismo hook que Diseño, Configuración y el editor), con su
 * conflicto 409. La dirección es la del servidor (`hostSitio`).
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Copy, Pencil, QrCode } from 'lucide-react';
import { CLASE_TAMANO_ICONO, ICONO_TAREA_SITIO, TRAZO_ICONO } from '../ui/iconosSitio';
import { ActionSheet, AvisoTonal, Skeleton, clasesBoton, type AccionFila } from '@/components/kit';
import { MarcoSitioWeb, type EstadoVistaSitio } from '../MarcoSitioWeb';
import { RAIZ_SITIO_WEB, rutaEditorSitio } from '../rutasSitioWeb';
import { useSitioV2 } from '../useSitioV2';
import { resolverEstadoPublicacion } from '../ui/estadoPublicacion';
import { useResumenSitio } from './useResumenSitio';
import { TarjetaSitio } from './TarjetaSitio';
import { ListaLanzamiento } from './ListaLanzamiento';
import { KpisSitio } from './KpisSitio';
import { AlertaDelSitio, AlertasSitio } from './AlertasSitio';
import { CambiosRecientes, useCuandoTexto } from './CambiosRecientes';
import { HeroPrimeraVez, rutaAsistente } from './HeroPrimeraVez';
import { DialogoCodigoQr } from './DialogoCodigoQr';
import { DialogoRevisarCambios } from './DialogoRevisarCambios';
import { plantillaPorId } from './asistente/catalogoAsistente';
import { useTextosResumen } from './textos';
import { useTextosComun } from '../ui/textos';

/** Parámetros del editor que abre el área editor (historial y cambios rápidos en móvil). */
export const PANEL_HISTORIAL = 'panel=historial';
export const VISTA_CAMBIOS_RAPIDOS = 'vista=cambios-rapidos';

/** Esqueleto de A/02c: dos tarjetas (1,6fr/1fr), cuatro KPI y tres filas tipo tabla. */
function EsqueletoResumen() {
  return (
    <div className="flex flex-col gap-4 lg:gap-6" aria-busy="true">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr] lg:gap-6">
        {[0, 1].map((i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4">
            <Skeleton className="size-10 rounded-lg" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-6">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4">
            <Skeleton className="size-8 rounded-lg" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="size-4 rounded" />
            <Skeleton className="size-8 rounded-lg" />
            <Skeleton className="h-3 flex-1" />
            <Skeleton className="hidden h-3 w-24 md:block" />
            <Skeleton className="hidden h-5 w-20 rounded-full md:block" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ResumenSitio() {
  const t = useTextosResumen();
  const tx = useTextosComun();
  const router = useRouter();
  const cuando = useCuandoTexto();
  const { datos, cargando, fallo, recargar } = useResumenSitio();
  const sitioV2 = useSitioV2({ deshabilitado: !datos?.sitio.v2Id });
  const [qrAbierto, setQrAbierto] = useState(false);
  const [revisarAbierto, setRevisarAbierto] = useState(false);
  const [compartirAbierto, setCompartirAbierto] = useState(false);

  const estado: EstadoVistaSitio = cargando && !datos ? 'cargando' : fallo === 'sin_permiso' ? 'sin_permiso' : fallo || !datos ? 'error' : datos.estado;
  const sitio = datos?.sitio;
  const permisos = datos?.permisos ?? { editar: false, publicar: false };
  const primeraVez = datos?.estado === 'primera_vez';

  const estadoPublicacion = useMemo(() => {
    if (!sitio || primeraVez) return resolverEstadoPublicacion({ publicadoEn: null });
    return resolverEstadoPublicacion({
      publicadoEn: sitio.publicado ? sitio.ultimaPublicacion?.en ?? 'publicado' : null,
      cambiosSinPublicar: sitio.cambiosSinPublicar.cantidad,
      guardando: sitioV2.publicando,
      falloPublicacion: sitioV2.estadoPublicacion.tipo === 'error',
    });
  }, [sitio, primeraVez, sitioV2.publicando, sitioV2.estadoPublicacion]);

  const rutaEditor = permisos.editar && sitio?.paginaInicioId ? rutaEditorSitio(sitio.paginaInicioId) : null;
  const plantilla = useMemo(() => {
    if (!sitio?.plantillaId) return null;
    const p = plantillaPorId(sitio.plantillaId);
    return p ? `${p.nombre} · ${t(`asistente.giro.giros.${p.giro}`).toLowerCase()}` : sitio.plantillaId;
  }, [sitio?.plantillaId, t]);
  const ultimaPublicacion = sitio?.ultimaPublicacion
    ? [cuando(sitio.ultimaPublicacion.en), sitio.ultimaPublicacion.autor].filter(Boolean).join(' · ')
    : null;

  const copiar = async () => {
    if (!sitio?.url) return;
    try {
      await navigator.clipboard.writeText(sitio.url);
      toast.success(t('resumen.tarjeta.enlaceCopiado'));
    } catch {
      toast.error(t('resumen.tarjeta.noSeCopio', { url: sitio.url }));
    }
  };

  const compartir = async () => {
    if (!sitio?.url) return;
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ url: sitio.url, title: sitio.nombre || sitio.host || undefined });
        return;
      } catch (error) {
        if ((error as { name?: string })?.name === 'AbortError') return;
      }
    }
    setCompartirAbierto(true);
  };

  const publicar = async () => {
    const r = await sitioV2.publicar(null);
    if (r) {
      setRevisarAbierto(false);
      toast.success(t('resumen.tarjeta.publicado'));
      await recargar();
      return;
    }
    if (sitioV2.conflicto || sitioV2.error?.esConflicto) {
      setRevisarAbierto(false);
      toast.error(t('resumen.tarjeta.conflicto'));
      await Promise.all([recargar(), sitioV2.recargar()]);
    }
  };

  // El hook guarda el error en su estado: lo mostramos cuando cambia.
  const errorPublicar = sitioV2.error && !sitioV2.error.esConflicto && !sitioV2.publicando ? sitioV2.error.message : null;

  const accionesMenu: AccionFila[] = [
    { id: 'copiar', etiqueta: t('resumen.menu.copiarEnlace'), icono: Copy, onSelect: () => void copiar(), oculta: !sitio?.url },
    { id: 'qr', etiqueta: t('resumen.menu.codigoQr'), icono: QrCode, onSelect: () => setQrAbierto(true), oculta: !sitio?.url },
    {
      id: 'plantilla',
      etiqueta: t('resumen.menu.cambiarPlantilla'),
      icono: ICONO_TAREA_SITIO.plantilla,
      onSelect: () => router.push(`${RAIZ_SITIO_WEB}/plantillas`),
      oculta: !permisos.editar,
    },
    { id: 'configuracion', etiqueta: t('resumen.menu.irConfiguracion'), icono: ICONO_TAREA_SITIO.configuracion, onSelect: () => router.push(`${RAIZ_SITIO_WEB}/configuracion`) },
  ];

  const cabecera =
    estado === 'cargando'
      ? {
          accionPrimaria: (
            <button type="button" disabled className={clasesBoton({ variante: 'primario', tamano: 'md' })}>
              <Pencil aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
              {tx('marco.abrirEditor')}
            </button>
          ),
        }
      : primeraVez
        ? {
            sinVerSitio: true,
            accionesSecundarias: (
              <Link href={`${RAIZ_SITIO_WEB}/plantillas`} className={clasesBoton({ variante: 'secundario', tamano: 'md' })}>
                <ICONO_TAREA_SITIO.plantilla aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
                {t('resumen.primeraVez.verPlantillas')}
              </Link>
            ),
            accionPrimaria: permisos.editar ? (
              <Link href={rutaAsistente(datos?.onboarding.pasoActual)} className={clasesBoton({ variante: 'primario', tamano: 'md' })}>
                {datos?.onboarding.pasoActual && datos.onboarding.pasoActual > 1 ? t('resumen.primeraVez.seguir') : t('resumen.primeraVez.empezar')}
              </Link>
            ) : undefined,
          }
        : { rutaEditor };

  return (
    <MarcoSitioWeb
      href={RAIZ_SITIO_WEB}
      estado={estado}
      onReintentar={() => void recargar()}
      nombreContenido={t('resumen.nombreContenido')}
      esqueleto={<EsqueletoResumen />}
      estadoPublicacion={estado === 'cargando' || estado === 'error' ? null : estadoPublicacion}
      host={sitio ? sitio.host : undefined}
      menu={estado === 'sin_permiso' ? undefined : accionesMenu}
      {...cabecera}
      primeraVez={
        datos && (
          <div className="flex flex-col gap-4 lg:gap-6">
            <HeroPrimeraVez giro={datos.giro} pasoGuardado={datos.onboarding.pasoActual} puedeEditar={permisos.editar} />
            {/* A/02b: lista a la izquierda y las tres cifras vacías a la derecha. */}
            <div className="hidden grid-cols-[1fr_1.6fr] items-start gap-6 lg:grid">
              <ListaLanzamiento pasos={datos.lanzamiento} puedeEditar={permisos.editar} onPublicar={() => undefined} sinBarra />
              <KpisSitio kpis={datos.kpis} primeraVez esRestaurante={datos.giro === 'restaurante'} />
            </div>
          </div>
        )
      }
    >
      {datos && sitio && (
        <div className="flex flex-col gap-4 lg:gap-6">
          {errorPublicar && (
            <AvisoTonal tono="peligro" rol="alert" titulo={t('resumen.tarjeta.errorPublicar', { mensaje: errorPublicar })} />
          )}
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.6fr_1fr] lg:gap-6">
            <TarjetaSitio
              sitio={sitio}
              estado={estadoPublicacion}
              plantilla={plantilla}
              ultimaPublicacion={ultimaPublicacion}
              puedePublicar={permisos.publicar && !!sitioV2.borrador}
              publicando={sitioV2.publicando}
              onPublicar={() => setRevisarAbierto(true)}
              onRevisar={() => setRevisarAbierto(true)}
              onCopiar={() => void copiar()}
              onQr={() => setQrAbierto(true)}
              onCompartir={() => void compartir()}
            />
            {/* Móvil (A/02f): el editor completo es de computador. */}
            {rutaEditor && (
              <AvisoTonal
                className="lg:hidden"
                tono="informacion"
                titulo={t('resumen.movil.editorTitulo')}
                descripcion={t('resumen.movil.editorDescripcion')}
                accion={{ etiqueta: t('resumen.movil.cambiosRapidos'), href: `${rutaEditor}?${VISTA_CAMBIOS_RAPIDOS}` }}
              />
            )}
            <div className="lg:hidden">
              <KpisSitio kpis={datos.kpis} esRestaurante={datos.giro === 'restaurante'} />
            </div>
            <ListaLanzamiento
              className="hidden lg:flex"
              pasos={datos.lanzamiento}
              puedeEditar={permisos.editar}
              onPublicar={() => setRevisarAbierto(true)}
            />
            {datos.lanzamiento.some((p) => p.estado !== 'listo') && (
              <ListaLanzamiento
                className="lg:hidden"
                pasos={datos.lanzamiento}
                puedeEditar={permisos.editar}
                onPublicar={() => setRevisarAbierto(true)}
                soloPendientes
              />
            )}
            {datos.alertas[0] && (
              <div className="lg:hidden">
                <AlertaDelSitio alerta={datos.alertas[0]} />
              </div>
            )}
          </div>
          <div className="hidden lg:block">
            <KpisSitio kpis={datos.kpis} esRestaurante={datos.giro === 'restaurante'} />
          </div>
          <div className="hidden items-start gap-6 lg:grid lg:grid-cols-[1.6fr_1fr]">
            {datos.alertas.length > 0 ? <AlertasSitio alertas={datos.alertas} /> : <span aria-hidden="true" />}
            <CambiosRecientes cambios={datos.cambios} rutaHistorial={rutaEditor ? `${rutaEditor}?${PANEL_HISTORIAL}` : null} />
          </div>

          {sitio.url && sitio.host && <DialogoCodigoQr abierto={qrAbierto} onAbiertoChange={setQrAbierto} url={sitio.url} host={sitio.host} />}
          <DialogoRevisarCambios
            abierto={revisarAbierto}
            onAbiertoChange={setRevisarAbierto}
            areas={sitio.cambiosSinPublicar.areas}
            rutaEditor={rutaEditor}
            puedePublicar={permisos.publicar && !!sitioV2.borrador}
            publicando={sitioV2.publicando}
            onPublicar={() => void publicar()}
          />
          <ActionSheet
            abierto={compartirAbierto}
            onAbiertoChange={setCompartirAbierto}
            titulo={t('resumen.movil.compartirTitulo')}
            descripcion={sitio.host ?? undefined}
            acciones={[
              { id: 'copiar', etiqueta: t('resumen.menu.copiarEnlace'), icono: Copy, onSelect: () => void copiar() },
              { id: 'qr', etiqueta: t('resumen.menu.codigoQr'), icono: QrCode, onSelect: () => setQrAbierto(true) },
            ]}
          />
        </div>
      )}
    </MarcoSitioWeb>
  );
}
