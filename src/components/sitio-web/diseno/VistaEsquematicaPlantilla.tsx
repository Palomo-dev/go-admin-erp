'use client';

/**
 * Vista previa de una plantilla AÚN NO aplicada (Figma A/06c): con tu nombre,
 * tu logo y los enlaces de tu menú principal, el orden de secciones de Inicio
 * de la plantilla pintado con su estilo. Es un esquema: el sitio público solo
 * sabe pintar el borrador guardado, y aplicar la plantilla para verla crearía un
 * borrador (A/06h). Los colores y fuentes del cliente solo viven aquí dentro.
 */
import type { CSSProperties } from 'react';
import type { DocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import type { PlantillaCatalogo } from '@/lib/website/contrato/catalogoPlantillas';
import { valorCampo } from '@/lib/website/v2/valorCampo';
import { SiteHeaderPreview, type EnlaceVista } from '../ui/SiteHeaderPreview';
import { estilosTema } from '../ui/temaVistaSitio';
import { familiaCss, mezclar, nombreSeccion, temaVistaDeEstilo } from './catalogo';
import { useTextosDiseno } from './textos';

/** Enlaces del menú principal del encabezado (máximo 5), o los títulos de las páginas. */
export function enlacesDelDocumento(documento: DocumentoSitio | null, maximo = 5): EnlaceVista[] {
  if (!documento) return [];
  const menu = documento.menus.find((m) => m.id === documento.shell.header.menuPrincipalId);
  const etiquetas = menu ? menu.items.map((i) => i.etiqueta) : documento.paginas.filter((p) => p.publicada).map((p) => p.titulo);
  return etiquetas.slice(0, maximo).map((etiqueta, i) => ({ etiqueta, activo: i === 0 }));
}

export interface VistaEsquematicaPlantillaProps {
  plantilla: PlantillaCatalogo;
  documento: DocumentoSitio | null;
  celular?: boolean;
}

export function VistaEsquematicaPlantilla({ plantilla, documento, celular }: VistaEsquematicaPlantillaProps) {
  const t = useTextosDiseno();
  const tema = temaVistaDeEstilo(plantilla.estilo);
  const e = estilosTema(tema);
  const nombre = valorCampo(documento?.identidad.nombre) || t('dialogo.tuMarca');
  const logoUrl = valorCampo(documento?.identidad.logoUrl);
  const enlaces = enlacesDelDocumento(documento);
  const [portada, ...resto] = plantilla.inicio;
  const banda = (i: number): CSSProperties => ({
    backgroundColor: i % 2 === 0 ? tema.fondo : mezclar(tema.fondo, tema.texto, 0.05),
    color: tema.texto,
  });

  return (
    <div className="flex flex-col" style={{ ...e.base, fontFamily: familiaCss(plantilla.estilo.fuenteCuerpo) }}>
      <SiteHeaderPreview
        disposicion="clasico"
        marca={{ nombre, logoUrl }}
        enlaces={enlaces.length ? enlaces : [{ etiqueta: t('dialogo.inicio'), activo: true }]}
        iconos={{}}
        tema={tema}
        celular={celular}
      />
      {portada && (
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center" style={e.secundario}>
          <span className="text-[11px] font-medium uppercase tracking-wider" style={e.acento}>
            {nombreSeccion(portada[0]) ?? t('dialogo.seccionDesconocida')}
          </span>
          <span className={celular ? 'text-xl' : 'text-3xl'} style={e.titulo}>
            {nombre}
          </span>
          <span className="px-4 py-2 text-xs font-medium" style={e.boton}>
            {t(`muestra.${plantilla.giro}.boton`)}
          </span>
        </div>
      )}
      {resto.map(([tipo], i) => (
        <div key={`${tipo}-${i}`} className="flex flex-col items-center gap-3 px-6 py-8" style={banda(i)}>
          <span className={celular ? 'text-base' : 'text-xl'} style={e.titulo}>
            {nombreSeccion(tipo) ?? t('dialogo.seccionDesconocida')}
          </span>
          <span className="grid w-full max-w-xl grid-cols-3 gap-3">
            {[0, 1, 2].map((k) => (
              <span key={k} className="h-10 rounded-md" style={{ backgroundColor: mezclar(tema.fondo, tema.texto, 0.1), borderRadius: Math.min(plantilla.estilo.radio, 12) }} />
            ))}
          </span>
        </div>
      ))}
      <div className="flex items-center justify-between px-6 py-4 text-xs" style={{ ...e.secundario, ...e.suave }}>
        <span style={e.titulo}>{nombre}</span>
      </div>
    </div>
  );
}
