'use client';

/**
 * Vista previa de una plantilla AÚN NO aplicada (Figma A/06c y «Plantillas · encabezado y pie en
 * la galería, la vista previa y «Usar»», tarjeta 2): el encabezado y el pie de LA PLANTILLA en
 * grande —los de `shellPorPlantilla.ts`, por el modelo `dibujoShell.ts`— con tu nombre, y en
 * medio la portada y, en una franja, el orden de las demás secciones de Inicio, pintado con su
 * estilo. En celular, con la barra fija.
 *
 * Es un esquema: el sitio público solo sabe pintar el borrador guardado, y aplicar la plantilla
 * para verla crearía un borrador (A/06h). Los colores y fuentes del cliente solo viven aquí dentro.
 */
import type { CSSProperties } from 'react';
import type { DocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import type { PlantillaCatalogo } from '@/lib/website/contrato/catalogoPlantillas';
import { valorCampo } from '@/lib/website/v2/valorCampo';
import type { EnlaceVista } from '../ui/SiteHeaderPreview';
import { estilosTema } from '../ui/temaVistaSitio';
import { familiaCss, mezclar, nombreSeccion, temaVistaDeEstilo } from './catalogo';
import { EsquemaShell } from './EsquemaShell';
import { useShellDePlantilla } from './MiniaturaPlantilla';
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
  const shell = useShellDePlantilla(plantilla);
  const tema = temaVistaDeEstilo(plantilla.estilo);
  const e = estilosTema(tema);
  const nombre = valorCampo(documento?.identidad.nombre) || t('dialogo.tuMarca');
  const [portada, ...resto] = plantilla.inicio;
  const franja: CSSProperties = { backgroundColor: mezclar(tema.fondo, tema.texto, 0.05), color: tema.texto };

  const secciones = (
    <span data-zona="contenido" className="flex flex-col" style={{ ...e.base, fontFamily: familiaCss(plantilla.estilo.fuenteCuerpo) }}>
      {portada && (
        <span className="flex flex-col items-center gap-3 px-6 py-8 text-center" style={e.secundario}>
          <span className="text-[11px] font-medium uppercase tracking-wider" style={e.acento}>
            {nombreSeccion(portada[0]) ?? t('dialogo.seccionDesconocida')}
          </span>
          <span className={celular ? 'text-xl' : 'text-3xl'} style={e.titulo}>
            {nombre}
          </span>
          <span className="px-4 py-2 text-xs font-medium" style={e.boton}>
            {t(`muestra.${plantilla.giro}.boton`)}
          </span>
        </span>
      )}
      {resto.length > 0 && (
        // Compacto (Figma): el resto de Inicio en una franja con sus nombres, para que el
        // encabezado y el pie de la plantilla se vean juntos en la vista previa.
        <span data-secciones={resto.length} className="flex flex-wrap justify-center gap-2 px-6 py-5" style={franja}>
          {resto.map(([tipo], i) => (
            <span key={`${tipo}-${i}`} className="rounded-full px-3 py-1 text-xs" style={{ backgroundColor: mezclar(tema.fondo, tema.texto, 0.1), color: tema.texto }}>
              {nombreSeccion(tipo) ?? t('dialogo.seccionDesconocida')}
            </span>
          ))}
        </span>
      )}
    </span>
  );

  return (
    <EsquemaShell
      dibujo={shell.dibujo}
      enlaces={shell.enlaces}
      menusPie={shell.menusPie}
      celular={celular}
      marca={nombre}
      contenido={secciones}
    />
  );
}
