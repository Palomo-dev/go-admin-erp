'use client';

/**
 * Configuración › «Legales» (Figma B/12-01): estado por documento (Publicado ·
 * fecha / Borrador / Falta) y el asistente para generarlos. Fuente única: las
 * páginas del sitio (Páginas › Legales solo las lista y abre el editor; aquí se
 * controlan). La política de tratamiento de datos (Ley 1581) es requisito del
 * agente de voz y de los formularios del CRM: si falta, se avisa.
 */
import { useState } from 'react';
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

export interface SeccionLegalesProps {
  t: TraductorConfiguracion;
  legales: DocumentoLegalVista[] | null;
  error: boolean;
  creando: string | null;
  crear: (doc: DocumentoLegalVista) => Promise<string | null>;
  organizacion: { nombre: string; correo: string | null };
  deshabilitado?: boolean;
}

export function SeccionLegales({ t, legales, error, creando, crear, organizacion, deshabilitado }: SeccionLegalesProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { formatDate } = useFormatDate();
  const [asistente, setAsistente] = useState<DocumentoLegalVista | null>(null);

  const generar = async (doc: DocumentoLegalVista) => {
    const paginaId = await crear(doc);
    setAsistente(null);
    if (!paginaId) {
      toast({ title: t('legales.errorCrear'), variant: 'destructive' });
      return;
    }
    toast({ title: t('legales.creado', { titulo: doc.titulo }) });
    router.push(rutaEditorSitio(paginaId));
  };

  const tratamiento = legales?.find((d) => d.clave === 'tratamiento') ?? null;

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
            const IconoDoc = ICONOS_SECCION_CONFIGURACION.legales;
            const IconoAccion = ICONO_ACCION_LEGAL[doc.estado];
            return (
            <li key={doc.clave} className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2">
              <IconoDoc aria-hidden="true" className={`${CLASE_TAMANO_ICONO.base} shrink-0 text-fg-secondary`} strokeWidth={TRAZO_ICONO} />
              <span className="min-w-0 flex-1 basis-40 text-sm font-medium text-fg">{doc.titulo}</span>
              <StatusBadge
                tamano="sm"
                estado={doc.estado}
                icono={ICONO_ESTADO_LEGAL[doc.estado]}
                // Excepción de la captura B/12-01: un legal en borrador es ámbar (le falta publicarse), no gris.
                tono={doc.estado === 'borrador' ? 'advertencia' : undefined}
                etiqueta={
                  doc.estado === 'publicado'
                    ? doc.fecha
                      ? t('legales.publicado', { fecha: formatDate(doc.fecha) })
                      : t('legales.publicadoSinFecha')
                    : doc.estado === 'borrador'
                      ? t('legales.borrador')
                      : t('legales.falta')
                }
              />
              {doc.estado === 'falta' ? (
                <button
                  type="button"
                  className={clasesBoton({ variante: 'primario', tamano: 'sm' })}
                  disabled={deshabilitado || creando !== null}
                  onClick={() => setAsistente(doc)}
                >
                  <IconoAccion aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
                  {t('legales.generar')}
                </button>
              ) : (
                <button
                  type="button"
                  className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}
                  disabled={!doc.paginaId}
                  onClick={() => doc.paginaId && router.push(rutaEditorSitio(doc.paginaId))}
                >
                  <IconoAccion aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
                  {doc.estado === 'borrador' ? t('legales.revisar') : t('legales.editar')}
                </button>
              )}
            </li>
            );
          })}
        </ul>
      )}
      {legales && faltaTratamientoDatos(legales) && tratamiento && (
        <AvisoTonal
          tono="advertencia"
          titulo={t('legales.avisoTitulo')}
          descripcion={t('legales.avisoDescripcion')}
          accion={
            tratamiento.estado === 'falta'
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
          <FilaDato etiqueta={t('legales.asistenteRazon')} valor={organizacion.nombre || '—'} />
          <FilaDato etiqueta={t('legales.asistenteCorreo')} valor={organizacion.correo || '—'} />
        </ListaDatos>
      </Dialogo>
    </FormSection>
  );
}
