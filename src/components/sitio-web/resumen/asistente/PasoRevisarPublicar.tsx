'use client';

/**
 * Paso 6 «Revisar y publicar» (Figma A/03f): resumen de lo elegido (giro,
 * plantilla, estilo, páginas del borrador, dirección y pagos), el aviso «Aún no
 * cobras en línea» si no hay pasarela y la vista previa Escritorio / Móvil. La
 * barra inferior lleva «Guardar como borrador» y «Publicar sitio».
 */
import { AvisoTonal, FilaDato, ListaDatos } from '@/components/kit';
import type { DocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import { RAIZ_SITIO_WEB } from '../../rutasSitioWeb';
import type { LucideIcon } from 'lucide-react';
import { CLASE_TAMANO_ICONO, ICONO_TAREA_SITIO, TRAZO_ICONO } from '../../ui/iconosSitio';
import { EncabezadoPaso } from './EncabezadoPaso';
import { useTextosResumen } from '../textos';

/** Tipos de página legales en el documento (los cuenta aparte: «y 3 legales»). */
const TIPOS_LEGALES = new Set(['policy', 'legal', 'privacy', 'terms']);

export function resumenPaginas(documento: DocumentoSitio | null): { titulos: string[]; legales: number; seccionesInicio: number | null } {
  if (!documento) return { titulos: [], legales: 0, seccionesInicio: null };
  const legales = documento.paginas.filter((p) => TIPOS_LEGALES.has(p.tipo)).length;
  const titulos = documento.paginas.filter((p) => !TIPOS_LEGALES.has(p.tipo)).map((p) => p.titulo);
  const inicio = documento.paginas.find((p) => p.slug === 'home');
  return { titulos, legales, seccionesInicio: inicio ? inicio.secciones.length : null };
}

/** Etiqueta con el icono de 14 px de su tarea: el resumen se recorre con la vista. */
function Etiqueta({ icono: Icono, texto }: { icono: LucideIcon; texto: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Icono aria-hidden="true" className={`${CLASE_TAMANO_ICONO.meta} shrink-0 text-fg-muted`} strokeWidth={TRAZO_ICONO} />
      {texto}
    </span>
  );
}

export interface PasoRevisarPublicarProps {
  giro: string;
  plantilla: string | null;
  estilo: string | null;
  documento: DocumentoSitio | null;
  host: string | null;
  pasarela: boolean;
}

export function PasoRevisarPublicar({ giro, plantilla, estilo, documento, host, pasarela }: PasoRevisarPublicarProps) {
  const t = useTextosResumen();
  const vacio = t('asistente.publicar.sinDato');
  const { titulos, legales, seccionesInicio } = resumenPaginas(documento);
  const textoLegales = legales > 0 ? t('asistente.publicar.legalesN', { n: legales }) : '';
  const lista = titulos.join(', ');
  const paginas = lista && textoLegales ? t('resumen.areas.y', { lista, ultimo: textoLegales }) : lista || textoLegales;
  const textoPlantilla = plantilla
    ? [plantilla, seccionesInicio !== null ? t('asistente.publicar.seccionesN', { n: seccionesInicio }) : null].filter(Boolean).join(' · ')
    : vacio;

  return (
    <div className="flex flex-col gap-5">
      <EncabezadoPaso paso="publicar" titulo={t('asistente.publicar.titulo')} descripcion={t('asistente.publicar.descripcion')} />
      <div className="rounded-xl border border-line bg-surface p-4">
        <ListaDatos>
          <FilaDato etiqueta={<Etiqueta icono={ICONO_TAREA_SITIO.giro} texto={t('asistente.publicar.giro')} />} valor={giro} />
          <FilaDato etiqueta={<Etiqueta icono={ICONO_TAREA_SITIO.plantilla} texto={t('asistente.publicar.plantilla')} />} valor={textoPlantilla} />
          <FilaDato etiqueta={<Etiqueta icono={ICONO_TAREA_SITIO.estilo} texto={t('asistente.publicar.estilo')} />} valor={estilo ?? vacio} />
          <FilaDato etiqueta={<Etiqueta icono={ICONO_TAREA_SITIO.paginas} texto={t('asistente.publicar.paginas')} />} valor={paginas || vacio} />
          <FilaDato etiqueta={<Etiqueta icono={ICONO_TAREA_SITIO.dominio} texto={t('asistente.publicar.direccion')} />} valor={host ?? vacio} />
          <FilaDato
            etiqueta={<Etiqueta icono={ICONO_TAREA_SITIO.pagos} texto={t('asistente.publicar.pagos')} />}
            valor={pasarela ? t('asistente.publicar.pagosPasarela') : t('asistente.publicar.pagosAlRecibir')}
          />
        </ListaDatos>
      </div>
      {!pasarela && (
        <AvisoTonal
          tono="advertencia"
          titulo={t('asistente.publicar.sinPasarelaTitulo')}
          descripcion={t('asistente.publicar.sinPasarelaDescripcion')}
          accion={{ etiqueta: t('asistente.publicar.conectarAhora'), href: `${RAIZ_SITIO_WEB}/ventas` }}
        />
      )}
    </div>
  );
}
