'use client';

/**
 * «Vista previa · usar plantilla» (Figma A/06c): a la izquierda, la plantilla
 * con tu nombre y tu menú en un marco de 1440 / 1024 / 390 (el selector de
 * ancho va en la cabecera, junto a la «×»; la barra del marco dice «Vista
 * previa con tu contenido», no una dirección); a la derecha, su
 * descripción, lo que incluye y su estilo; debajo, el aviso «Reemplaza el
 * diseño, conserva tu contenido». En móvil es una hoja a pantalla completa
 * (`PanelAdaptable`). «Usar esta plantilla» exige `website.sites.edit`.
 */
import { useState } from 'react';
import { CircleCheck, Loader2 } from 'lucide-react';
import { AvisoTonal, PanelAdaptable, clasesBoton, useEsEscritorio } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import type { DocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import type { PlantillaCatalogo } from '@/lib/website/contrato/catalogoPlantillas';
import { DevicePreviewFrame } from '../ui/DevicePreviewFrame';
import { StylePresetCard } from '../ui/StylePresetCard';
import type { DispositivoVista } from '../ui/dispositivos';
import { SelectorAnchoVista } from '../ui/SelectorAnchoVista';
import { CLASE_TAMANO_ICONO, ICONO_GIRO_PLANTILLA, TRAZO_ICONO } from '../ui/iconosSitio';
import { muestraDeEstilo, nombreFuentes, nombreSeccion, nombreVariante } from './catalogo';
import { VistaEsquematicaPlantilla } from './VistaEsquematicaPlantilla';
import { useFuentesSitio } from './useFuentesSitio';
import { useTextosDiseno } from './textos';

export interface DialogoVistaPreviaPlantillaProps {
  plantilla: PlantillaCatalogo | null;
  onCerrar: () => void;
  documento: DocumentoSitio | null;
  puedeUsar: boolean;
  usando: boolean;
  onUsar: (plantilla: PlantillaCatalogo) => void;
}

/** «Carta destacada · Pestañas» (o solo el nombre si la variante no tiene etiqueta). */
export function nombreSeccionPlantilla(tipo: string, variante: string, respaldo: string): string {
  const nombre = nombreSeccion(tipo) ?? respaldo;
  const v = nombreVariante(tipo, variante);
  return v ? `${nombre} · ${v.toLowerCase()}` : nombre;
}

export function DialogoVistaPreviaPlantilla({ plantilla, onCerrar, documento, puedeUsar, usando, onUsar }: DialogoVistaPreviaPlantillaProps) {
  const t = useTextosDiseno();
  const esEscritorio = useEsEscritorio();
  const [dispositivo, setDispositivo] = useState<DispositivoVista>('escritorio');
  useFuentesSitio(plantilla ? [plantilla.estilo.fuenteTitulos, plantilla.estilo.fuenteCuerpo] : []);
  if (!plantilla) return null;
  const celular = dispositivo === 'celular';
  const IconoGiro = ICONO_GIRO_PLANTILLA[plantilla.giro];

  return (
    <PanelAdaptable
      abierto
      onAbiertoChange={(v) => !v && onCerrar()}
      titulo={plantilla.nombre}
      ancho={1120}
      ocupado={usando}
      // A/06c: el selector de ancho va en la cabecera, a la derecha junto a la «×».
      // En móvil, solo iconos (con nombre accesible «1440 px»): el texto no cabe a 390 junto al título.
      accionesCabecera={
        <SelectorAnchoVista
          etiqueta={t('vista.anchos')}
          valor={dispositivo}
          onValorChange={setDispositivo}
          variante={esEscritorio ? 'texto' : 'icono'}
        />
      }
      descripcion={
        <span className="flex flex-wrap items-center gap-2">
          <Badge tono="neutro" apariencia="suave" tamano="sm">
            <IconoGiro aria-hidden="true" className="size-3 shrink-0" strokeWidth={2} />
            {t(`plantillas.giro.${plantilla.giro}`)}
          </Badge>
          {plantilla.subgiro && (
            <Badge tono="neutro" apariencia="suave" tamano="sm">
              {plantilla.subgiro}
            </Badge>
          )}
        </span>
      }
      pie={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCerrar} disabled={usando} className={clasesBoton({ variante: 'secundario', tamano: 'md' })}>
            {t('acciones.cancelar')}
          </button>
          <button
            type="button"
            onClick={() => onUsar(plantilla)}
            disabled={!puedeUsar || usando}
            title={puedeUsar ? undefined : t('dialogo.sinPermiso')}
            aria-busy={usando || undefined}
            className={clasesBoton({ variante: 'primario', tamano: 'md' })}
          >
            {usando && <Loader2 aria-hidden="true" className={`${CLASE_TAMANO_ICONO.base} animate-spin motion-reduce:animate-none`} strokeWidth={TRAZO_ICONO} />}
            {t('dialogo.usar')}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_260px] lg:gap-6">
          <div className="flex min-w-0 flex-col gap-2">
            <DevicePreviewFrame dispositivo={dispositivo} etiquetaBarra={t('dialogo.vistaPrevia')}>
              <div className={celular ? 'max-h-[520px] overflow-y-auto' : 'max-h-[440px] overflow-y-auto'}>
                <VistaEsquematicaPlantilla plantilla={plantilla} documento={documento} celular={celular} />
              </div>
            </DevicePreviewFrame>
            <p className="text-xs leading-4 text-fg-secondary">{t('dialogo.esquema')}</p>
          </div>
          <div className="flex flex-col gap-4">
            <p className="text-[13px] leading-[18px] text-fg-secondary">{t('dialogo.descripcion', { descripcion: plantilla.descripcion })}</p>
            <div className="flex flex-col gap-2">
              <h3 className="text-[13px] font-semibold leading-[18px] text-fg">{t('dialogo.incluye')}</h3>
              <ul className="flex flex-col gap-1.5">
                {plantilla.inicio.map(([tipo, variante], i) => (
                  <li key={`${tipo}-${i}`} className="flex items-start gap-2 text-[13px] leading-[18px] text-fg">
                    <CircleCheck aria-hidden="true" className={`mt-px ${CLASE_TAMANO_ICONO.base} shrink-0 text-success-text`} strokeWidth={TRAZO_ICONO} />
                    {nombreSeccionPlantilla(tipo, variante, t('dialogo.seccionDesconocida'))}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col gap-2">
              <h3 className="text-[13px] font-semibold leading-[18px] text-fg">{t('dialogo.estilo')}</h3>
              <StylePresetCard
                nombre={plantilla.estilo.nombre}
                fuentes={nombreFuentes(plantilla.estilo)}
                muestra={muestraDeEstilo(plantilla.estilo)}
                seleccionado
                onSeleccionar={() => undefined}
                textoMuestra={t(`muestra.${plantilla.giro}.texto`)}
                textoBoton={t(`muestra.${plantilla.giro}.boton`)}
              />
            </div>
          </div>
        </div>
        <AvisoTonal tono="advertencia" titulo={t('dialogo.avisoTitulo')} descripcion={t('dialogo.avisoDescripcion')} />
      </div>
    </PanelAdaptable>
  );
}
