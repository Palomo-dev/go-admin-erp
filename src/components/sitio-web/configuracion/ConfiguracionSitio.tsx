'use client';

/**
 * «Configuración del sitio» (Figma B/12-01 escritorio, 12-02/12-02b
 * confirmaciones, 12-03 móvil, 12-04 estados; notas 12-05 y 12-06).
 *
 * Un solo formulario con índice lateral y UNA SettingsSaveBar («N cambios ·
 * Tienes cambios sin guardar · Descartar · Guardar cambios · Ctrl+S»). En móvil
 * (< lg) la página es una lista de secciones con resumen; cada fila abre su
 * sección sola, con la misma barra fija abajo. Todo el estado vive en
 * `useConfiguracionSitio`; cada sección es un componente que también usa el
 * escritorio (no hay copias para móvil).
 */
import { useMemo, useState } from 'react';
import { ArrowLeft, Box, ExternalLink, RefreshCw, Upload } from 'lucide-react';
import { AvisoTonal, EmptyState, SettingsSaveBar, clasesBoton, useEsEscritorio, type AccionFila } from '@/components/kit';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { esPrimeraVez, resumenSecciones, type SeccionConfiguracion } from '@/lib/website/configuracionSitio';
import { MarcoSitioWeb, type EstadoVistaSitio } from '../MarcoSitioWeb';
import { RAIZ_SITIO_WEB } from '../rutasSitioWeb';
import { CLASE_TAMANO_ICONO, TRAZO_ICONO } from '../ui/iconosSitio';
import { IndiceConfiguracion } from './IndiceConfiguracion';
import { ListaSeccionesMovil } from './ListaSeccionesMovil';
import { SeccionCodigo } from './SeccionCodigo';
import { SeccionDatosNegocio } from './SeccionDatosNegocio';
import { SeccionLegales } from './SeccionLegales';
import { SeccionChat, SeccionIdiomaMoneda, SeccionMantenimiento, nombreMoneda } from './SeccionesAjustes';
import { ZonaPeligro } from './ZonaPeligro';
import { useTextosConfiguracion } from './textos';
import { useConfiguracionSitio } from './useConfiguracionSitio';

export const RUTA_CONFIGURACION_SITIO = `${RAIZ_SITIO_WEB}/configuracion`;

/** Esqueleto de B/12-04: una tarjeta FormSection (título, bloque y dos líneas). */
export function EsqueletoFormulario() {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4 sm:p-6" aria-busy="true">
      <Skeleton className="h-3 w-40 rounded" />
      <Skeleton className="h-16 rounded-lg" />
      <Skeleton className="h-3 rounded" />
      <Skeleton className="h-3 rounded" />
    </div>
  );
}

export function ConfiguracionSitio() {
  const t = useTextosConfiguracion();
  const c = useConfiguracionSitio();
  const esEscritorio = useEsEscritorio();
  const { organization } = useOrganization();
  const { toast } = useToast();
  const [seccionMovil, setSeccionMovil] = useState<SeccionConfiguracion | null>(null);
  const [formularioAbierto, setFormularioAbierto] = useState(false);

  const d = c.datos;
  const f = c.formulario;
  const pendiente = (x: 'contacto' | 'idioma' | 'mantenimiento' | 'codigo' | 'eliminar') => !!d?.pendientes.includes(x);
  const sinPermiso = c.fallo === 'sin_permiso' || (!!d && !d.permisos.editar);
  const estado: EstadoVistaSitio = sinPermiso ? 'listo' : c.cargando ? 'cargando' : c.fallo ? 'error' : 'listo';

  const guardar = async () => {
    const r = await c.guardar();
    if (r === 'ok') toast({ title: t('barra.guardado') });
    else if (r === 'pendiente') toast({ title: t('estados.pendienteGuardar'), variant: 'destructive' });
    else if (r === 'invalido') toast({ title: t('barra.invalido'), variant: 'destructive' });
    else if (r === 'conflicto') toast({ title: t('estados.conflicto'), variant: 'destructive' });
  };

  const textoIdioma = f ? `${t(`idioma.idiomas.${f.idioma}`)} · ${d?.monedas.base ?? ''}`.replace(/ · $/, '') : '';
  const resumenes = useMemo(
    () => (f && d ? resumenSecciones(f, c.legales, { publicado: d.ajustes.publicado, moneda: d.monedas.base }) : []),
    [f, d, c.legales],
  );

  // «⋯» solo en móvil: en escritorio Recargar y Ver sitio ya están a la vista.
  const menu: AccionFila[] = [
    { id: 'recargar', etiqueta: t('pagina.recargar'), icono: RefreshCw, onSelect: () => void c.recargar() },
    ...(d?.host
      ? [{ id: 'ver', etiqueta: t('pagina.verSitio'), icono: ExternalLink, onSelect: () => window.open(`https://${d.host}`, '_blank', 'noopener,noreferrer') }]
      : []),
  ];

  const seccion = (s: SeccionConfiguracion) => {
    if (!f || !d) return null;
    switch (s) {
      case 'datos':
        return (
          <SeccionDatosNegocio
            key={s}
            t={t}
            formulario={f}
            errores={c.errores}
            editar={c.editar}
            organizationId={organization?.id}
            contactoPendiente={pendiente('contacto')}
            organizacion={d.organizacion}
          />
        );
      case 'legales':
        return (
          <SeccionLegales
            key={s}
            t={t}
            legales={c.legales}
            error={c.legalesError}
            creando={c.creandoLegal}
            crear={c.crearLegal}
            organizacion={{ nombre: d.organizacion.nombre, correo: f.correo || d.organizacion.correo }}
          />
        );
      case 'codigo':
        return <SeccionCodigo key={s} t={t} codigo={f.codigo} onCambiar={(v) => c.editar('codigo', v)} pendiente={pendiente('codigo')} />;
      case 'chat':
        return <SeccionChat key={s} t={t} activo={f.chatActivo} onCambiar={(v) => c.editar('chatActivo', v)} moduloChat={d.moduloChat} esRestaurante={d.esRestaurante === true} />;
      case 'idioma':
        return <SeccionIdiomaMoneda key={s} t={t} idioma={f.idioma} onIdioma={(v) => c.editar('idioma', v)} moneda={d.monedas.base} pendiente={pendiente('idioma')} />;
      case 'mantenimiento':
        return (
          <SeccionMantenimiento key={s} t={t} activo={f.mantenimiento} onCambiar={(v) => c.editar('mantenimiento', v)} pendiente={pendiente('mantenimiento')} />
        );
      case 'peligro':
        return (
          <ZonaPeligro
            key={s}
            t={t}
            publicado={d.ajustes.publicado}
            host={d.host}
            subdominio={d.subdominio}
            puedePublicar={d.permisos.publicar}
            publicando={c.publicando}
            eliminando={c.eliminando}
            eliminarPendiente={pendiente('eliminar')}
            cambiarPublicacion={c.cambiarPublicacion}
            eliminarSitio={c.eliminarSitio}
          />
        );
    }
  };

  const barra = (
    <SettingsSaveBar
      cambios={c.cambios}
      guardando={c.guardando}
      onGuardar={() => void guardar()}
      onDescartar={c.descartar}
      textoGuardar={t('barra.guardar')}
      mensaje={t('barra.mensaje')}
    />
  );

  const contenido = () => {
    if (sinPermiso) {
      return <EmptyState variante="forbidden" titulo={t('estados.sinPermisoTitulo')} descripcion={t('estados.sinPermisoDescripcion')} />;
    }
    if (!f || !d) return null;
    if (c.errorGuardado) {
      return (
        <EmptyState
          variante="error"
          titulo={t('estados.errorGuardarTitulo')}
          descripcion={t('estados.errorGuardarDescripcion')}
          onReintentar={() => void guardar()}
          accionSecundaria={{ etiqueta: t('estados.volverCambios'), onClick: c.cerrarErrorGuardado }}
        />
      );
    }
    if (!formularioAbierto && c.cambios === 0 && esPrimeraVez(f)) {
      return (
        <EmptyState
          variante="empty"
          icono={Box}
          titulo={t('estados.vacioTitulo')}
          descripcion={t('estados.vacioDescripcion')}
          accion={{
            etiqueta: t('estados.vacioAccion'),
            icono: Upload,
            onClick: () => {
              c.usarDatosOrganizacion();
              setFormularioAbierto(true);
            },
          }}
        />
      );
    }

    const aviso =
      d.pendientes.length > 0 ? <AvisoTonal tono="informacion" titulo={t('estados.pendienteTitulo')} descripcion={t('estados.pendienteDescripcion')} /> : null;

    if (!esEscritorio) {
      if (seccionMovil === null) {
        return (
          <div className="flex flex-col gap-4">
            {aviso}
            <ListaSeccionesMovil t={t} resumenes={resumenes} onAbrir={setSeccionMovil} textoIdioma={textoIdioma} />
            {barra}
          </div>
        );
      }
      return (
        <div className="flex flex-col gap-4">
          <button type="button" onClick={() => setSeccionMovil(null)} className={clasesBoton({ variante: 'fantasma', tamano: 'sm', className: 'self-start' })}>
            <ArrowLeft aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
            {t('movil.volver')}
          </button>
          {seccion(seccionMovil)}
          {barra}
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[12rem_minmax(0,1fr)]">
        <IndiceConfiguracion t={t} />
        <div className="flex min-w-0 flex-col gap-4 lg:gap-6">
          {aviso}
          {(['datos', 'legales', 'codigo', 'chat', 'idioma', 'mantenimiento', 'peligro'] as const).map(seccion)}
          {barra}
        </div>
      </div>
    );
  };

  return (
    <MarcoSitioWeb
      href={RUTA_CONFIGURACION_SITIO}
      titulo={t('pagina.titulo')}
      subtitulo={t('pagina.subtitulo')}
      host={d ? d.host : undefined}
      estado={estado}
      onReintentar={() => void c.recargar()}
      esqueleto={<EsqueletoFormulario />}
      nombreContenido={t('pagina.nombreContenido')}
      menu={sinPermiso || esEscritorio ? undefined : menu}
      acciones={sinPermiso ? <></> : undefined}
      sinVerSitio
      accionesSecundarias={
        <>
          <button
            type="button"
            className={clasesBoton({ variante: 'secundario', tamano: 'md', className: 'w-10 px-0' })}
            aria-label={t('pagina.recargar')}
            title={t('pagina.recargar')}
            onClick={() => void c.recargar()}
          >
            <RefreshCw aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
          </button>
          {d?.host && (
            <a href={`https://${d.host}`} target="_blank" rel="noopener noreferrer" className={clasesBoton({ variante: 'secundario', tamano: 'md' })}>
              <ExternalLink aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
              {t('pagina.verSitio')}
            </a>
          )}
        </>
      }
    >
      {contenido()}
    </MarcoSitioWeb>
  );
}

export { nombreMoneda };
