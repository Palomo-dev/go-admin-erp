'use client';

/**
 * Paso 1 «Giro y objetivo» (Figma A/03a): seis tarjetas de giro (Restaurante,
 * Tienda, Hotel, Servicios, Gimnasio, Otro), los objetivos del sitio según el
 * giro y el aviso de qué se activa. El giro preseleccionado sale de la
 * organización; lo que se elige aquí es solo del sitio.
 */
import { useId } from 'react';
import { AvisoTonal, TarjetaSeleccionable } from '@/components/kit';
import { Checkbox } from '@/components/ui/checkbox';
import { GIROS_SITIO, objetivosDelGiro, type GiroSitio, type ObjetivoSitio } from '@/lib/website/onboardingSitio';
import { EncabezadoPaso } from './EncabezadoPaso';
import type { LucideIcon } from 'lucide-react';
import { ICONO_GIRO_SITIO } from '../../ui/iconosSitio';
import { useTextosResumen } from '../textos';

const ICONO_GIRO: Record<GiroSitio, LucideIcon> = ICONO_GIRO_SITIO;

export interface PasoGiroProps {
  giro: GiroSitio;
  objetivos: readonly ObjetivoSitio[];
  onGiro: (giro: GiroSitio) => void;
  onObjetivos: (objetivos: ObjetivoSitio[]) => void;
}

export function PasoGiro({ giro, objetivos, onGiro, onObjetivos }: PasoGiroProps) {
  const t = useTextosResumen();
  const idObjetivos = useId();
  const disponibles = objetivosDelGiro(giro);
  const alternar = (o: ObjetivoSitio, marcado: boolean) =>
    onObjetivos(marcado ? [...objetivos.filter((x) => x !== o), o] : objetivos.filter((x) => x !== o));
  const etiquetaObjetivo = (o: ObjetivoSitio) => (o === 'reservas' && giro === 'restaurante' ? t('asistente.giro.objetivos.reservasMesa') : t(`asistente.giro.objetivos.${o}`));
  const restaurante = giro === 'restaurante';

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoPaso paso="giro" titulo={t('asistente.giro.titulo')} descripcion={t('asistente.giro.descripcion')} />
      <div role="radiogroup" aria-label={t('asistente.giro.titulo')} className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {GIROS_SITIO.map((g) => (
          <TarjetaSeleccionable
            key={g}
            titulo={t(`asistente.giro.giros.${g}`)}
            icono={ICONO_GIRO[g]}
            seleccionada={giro === g}
            onSeleccionar={() => onGiro(g)}
            orientacion="vertical"
            rol="radio"
          />
        ))}
      </div>
      <fieldset className="flex flex-col gap-3" aria-labelledby={idObjetivos}>
        <legend id={idObjetivos} className="text-base font-semibold leading-6 text-fg">
          {t('asistente.giro.objetivosTitulo')}
        </legend>
        {disponibles.map((o) => {
          const id = `${idObjetivos}-${o}`;
          return (
            <label key={o} htmlFor={id} className="flex cursor-pointer items-center gap-2 text-sm text-fg">
              <Checkbox id={id} checked={objetivos.includes(o)} onCheckedChange={(v) => alternar(o, v === true)} />
              {etiquetaObjetivo(o)}
            </label>
          );
        })}
      </fieldset>
      <AvisoTonal
        tono="informacion"
        titulo={restaurante ? t('asistente.giro.avisoTitulo') : t('asistente.giro.avisoTituloGeneral')}
        descripcion={restaurante ? t('asistente.giro.avisoDescripcion') : t('asistente.giro.avisoDescripcionGeneral')}
      />
    </div>
  );
}
