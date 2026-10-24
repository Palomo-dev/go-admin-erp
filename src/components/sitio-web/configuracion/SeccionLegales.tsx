'use client';

/**
 * Configuración › «Legales»: estado por documento (Publicado / Borrador / Vacío /
 * Falta) y el asistente. Fuente única: las páginas del sitio. El diálogo y los
 * textos se conservan; ahora el botón llama al generador y deja la página con texto.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AvisoTonal, Dialogo, FormSection, ListaDatos, FilaDato, StatusBadge, clasesBoton } from '@/components/kit';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { faltaTratamientoDatos, type DocumentoLegalVista } from '@/lib/website/configuracionSitio';
import { rutaEditorSitio } from '../rutasSitioWeb';
import { CLASE_TAMANO_ICONO, TRAZO_ICONO } from '../ui/iconosSitio';
import { ICONOS_SECCION_CONFIGURACION, ICONO_ACCION_LEGAL, ICONO_ESTADO_LEGAL } from './iconosSecciones';
import type { TraductorConfiguracion } from './textos';
import type { ResultadoRegenerar } from './crearDocumentoLegal';
import { apiLegales, type ConfirmacionLegal, type VistaLegal } from './apiLegales';

export interface SeccionLegalesProps {
  t: TraductorConfiguracion;
  legales: DocumentoLegalVista[] | null;
  error: boolean;
  creando: string | null;
  crear: (doc: DocumentoLegalVista) => Promise<{ id: string; origen: 'ia' | 'plantilla' } | null>;
  regenerar: (doc: DocumentoLegalVista, extra?: { confirmar?: boolean; texto?: string; origen?: 'ia' | 'plantilla' }) => Promise<ResultadoRegenerar | null>;
  organizacion: { nombre: string; correo: string | null };
  dataPolicyUrl?: string | null;
  deshabilitado?: boolean;
}

function etiquetaEstado(t: TraductorConfiguracion, doc: DocumentoLegalVista, fecha: string | null): string {
  if (doc.estado === 'publicado') return fecha ? t('legales.publicado', { fecha }) : t('legales.publicadoSinFecha');
  if (doc.estado === 'borrador') return t('legales.borrador');
  if (doc.estado === 'vacio') return t('legales.vacio');
  return t('legales.falta');
}

export function SeccionLegales({ t, legales, error, creando, crear, regenerar, organizacion, dataPolicyUrl, deshabilitado }: SeccionLegalesProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { formatDate } = useFormatDate();
  const [asistente, setAsistente] = useState<DocumentoLegalVista | null>(null);
  const [vista, setVista] = useState<VistaLegal | null>(null);
  const [confirmacion, setConfirmacion] = useState<{ doc: DocumentoLegalVista; datos: ConfirmacionLegal } | null>(null);

  useEffect(() => {
    if (!asistente) {
      setVista(null);
      return;
    }
    let vivo = true;
    void apiLegales
      .vista(asistente.clave)
      .then((v) => vivo && setVista(v))
      .catch(() => vivo && setVista(null));
    return () => {
      vivo = false;
    };
  }, [asistente]);

  const avisarCreado = (doc: DocumentoLegalVista, origen: 'ia' | 'plantilla', id: string) => {
    toast({ title: t('legales.creado', { titulo: doc.titulo, origen: origen === 'ia' ? t('legales.origenIa') : t('legales.origenPlantilla') }) });
    router.push(rutaEditorSitio(id));
  };

  const generar = async (doc: DocumentoLegalVista) => {
    const pagina = await crear(doc);
    setAsistente(null);
    if (!pagina) {
      toast({ title: t('legales.errorCrear'), variant: 'destructive' });
      return;
    }
    avisarCreado(doc, pagina.origen, pagina.id);
  };

  const pedirRegenerar = async (doc: DocumentoLegalVista, extra?: { confirmar?: boolean; texto?: string; origen?: 'ia' | 'plantilla' }) => {
    const r = await regenerar(doc, extra);
    if (!r) {
      toast({ title: t('legales.errorCrear'), variant: 'destructive' });
      return;
    }
    if (!r.ok) {
      setConfirmacion({ doc, datos: r.confirmacion });
      return;
    }
    setConfirmacion(null);
    avisarCreado(doc, r.origen, r.id);
  };

  const tratamiento = legales?.find((d) => d.clave === 'tratamiento') ?? null;
  const faltaTratamiento = legales ? faltaTratamientoDatos(legales, dataPolicyUrl) : false;

  return (
    <FormSection id="legales" icono={ICONOS_SECCION_CONFIGURACION.legales} titulo={t('secciones.legales')} descripcion={t('legales.descripcion')}>
      {legales === null && !error && (
        <div className="flex flex-col gap-2" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 rounded-lg" />
          ))}
        </div>
      )}
      {error && legales === null && <AvisoTonal tono="peligro" titulo={t('legales.errorCargar')} compacto />}
      {legales && (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {legales.map((doc) => {
            const esPrimerFaltante = doc.clave === legales.find((d) => d.estado === 'falta' || d.estado === 'vacio')?.clave;
            const IconoDoc = ICONOS_SECCION_CONFIGURACION.legales;
            const IconoAccion = ICONO_ACCION_LEGAL[doc.estado];
            const fecha = doc.fecha ? formatDate(doc.fecha) : null;
            return (
              <li key={doc.clave} className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2">
                <IconoDoc aria-hidden="true" className={`${CLASE_TAMANO_ICONO.base} shrink-0 text-fg-secondary`} strokeWidth={TRAZO_ICONO} />
                <span className="min-w-0 flex-1 basis-40 text-sm font-medium text-fg">{doc.titulo}</span>
                <StatusBadge
                  tamano="sm"
                  estado={doc.estado}
                  icono={ICONO_ESTADO_LEGAL[doc.estado]}
                  tono={doc.estado === 'borrador' || doc.estado === 'vacio' ? 'advertencia' : undefined}
                  etiqueta={etiquetaEstado(t, doc, fecha)}
                />
                {doc.estado === 'falta' || doc.estado === 'vacio' ? (
                  <button
                    type="button"
                    className={clasesBoton({ variante: esPrimerFaltante ? 'primario' : 'secundario', tamano: 'sm' })}
                    disabled={deshabilitado || creando !== null}
                    onClick={() => setAsistente(doc)}
                  >
                    <IconoAccion aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
                    {t('legales.generar')}
                  </button>
                ) : doc.estado === 'borrador' ? (
                  <button
                    type="button"
                    className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}
                    disabled={!doc.paginaId}
                    onClick={() => doc.paginaId && router.push(rutaEditorSitio(doc.paginaId))}
                  >
                    <IconoAccion aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
                    {t('legales.revisar')}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}
                      disabled={!doc.paginaId}
                      onClick={() => doc.paginaId && router.push(rutaEditorSitio(doc.paginaId))}
                    >
                      <IconoAccion aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
                      {t('legales.editar')}
                    </button>
                    <button
                      type="button"
                      className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}
                      disabled={deshabilitado || creando !== null}
                      onClick={() => void pedirRegenerar(doc)}
                    >
                      {t('legales.regenerar')}
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {faltaTratamiento && tratamiento && (
        <AvisoTonal
          tono="advertencia"
          titulo={t('legales.avisoTitulo')}
          descripcion={t('legales.avisoDescripcion')}
          accion={
            tratamiento.estado === 'falta' || tratamiento.estado === 'vacio'
              ? { etiqueta: t('legales.avisoAccion'), onClick: () => setAsistente(tratamiento), cargando: creando === 'tratamiento' }
              : tratamiento.paginaId
                ? { etiqueta: t('legales.revisar'), onClick: () => router.push(rutaEditorSitio(tratamiento.paginaId as string)) }
                : undefined
          }
        />
      )}

      <Dialogo
        abierto={asistente !== null}
        onAbiertoChange={(v) => !v && setAsistente(null)}
        titulo={asistente ? t('legales.asistenteTitulo', { titulo: asistente.titulo }) : ''}
        descripcion={t('legales.asistenteDescripcion')}
        icono={ICONO_ACCION_LEGAL.falta}
        ancho={520}
        primario={{
          etiqueta: creando ? t('legales.generando') : t('legales.asistenteCrear'),
          onClick: () => asistente && void generar(asistente),
          cargando: creando !== null,
          deshabilitada: deshabilitado,
        }}
      >
        <p className="mb-2 text-sm font-medium text-fg">{t('legales.asistenteDatos')}</p>
        <ListaDatos>
          {(vista?.usados ?? [
            { etiqueta: t('legales.asistenteRazon'), valor: organizacion.nombre || '—' },
            { etiqueta: t('legales.asistenteCorreo'), valor: organizacion.correo || '—' },
          ]).map((fila) => (
            <FilaDato key={fila.etiqueta} etiqueta={fila.etiqueta} valor={fila.valor || '—'} />
          ))}
        </ListaDatos>
        {vista && vista.faltantes.length > 0 && (
          <p className="mt-3 text-sm text-fg-secondary">
            {t('legales.asistenteFaltantes')} {vista.faltantes.join(', ')}.{' '}
            <a href="#datos" className="underline" onClick={() => setAsistente(null)}>
              {t('legales.asistenteEnlaceDatos')}
            </a>
          </p>
        )}
        <p className="mt-3 text-sm text-fg-secondary">
          {vista?.origenPrevisto === 'plantilla' ? t('legales.asistenteOrigenPlantilla') : t('legales.asistenteOrigenIa')}
        </p>
      </Dialogo>

      <Dialogo
        abierto={confirmacion !== null}
        onAbiertoChange={(v) => !v && setConfirmacion(null)}
        titulo={t('legales.diffTitulo')}
        descripcion={t('legales.diffDescripcion')}
        ancho={560}
        textoCancelar={t('legales.cancelar')}
        primario={{
          etiqueta: t('legales.reemplazar'),
          onClick: () =>
            confirmacion &&
            void pedirRegenerar(confirmacion.doc, {
              confirmar: true,
              texto: confirmacion.datos.propuesto,
              origen: confirmacion.datos.origen,
            }),
          cargando: creando !== null,
        }}
      >
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs text-fg-secondary">{confirmacion?.datos.diff}</pre>
      </Dialogo>
    </FormSection>
  );
}
