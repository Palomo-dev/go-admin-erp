'use client';

/**
 * Plantillas probadas de regla (Figma CRM 1379:1336 «Listado — vacío» y el
 * botón «Desde plantilla» del encabezado). Cada una se crea PAUSADA con su
 * `template_key` y abre el constructor para revisarla y probarla en seco.
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Bot, ClipboardCheck, BellRing, type LucideIcon } from 'lucide-react';
import { Dialogo } from '@/components/kit/Dialogo';
import { TarjetaSeleccionable } from '@/components/kit/TarjetaSeleccionable';
import { clasesBoton } from '@/components/kit/botonClases';
import {
  PLANTILLAS_REGLA,
  construirPlantillaRegla,
  type ClavePlantillaRegla,
  type PayloadPlantilla,
} from '@/lib/services/crm/automation/ruleTemplates';

const ICONO: Record<ClavePlantillaRegla, LucideIcon> = {
  seguimiento_propuesta: ClipboardCheck,
  agente_ia_leads: Bot,
  aviso_tarea_vencida: BellRing,
};

/** Arma el payload de una plantilla con los textos en el idioma del usuario. */
export function usePayloadPlantilla(): (clave: ClavePlantillaRegla) => PayloadPlantilla {
  const t = useTranslations('crm.automatizaciones.plantillas');
  return (clave) =>
    construirPlantillaRegla(clave, {
      nombre: t(`${clave}.nombre`),
      descripcion: t(`${clave}.descripcion`),
      titulo: t(`${clave}.titulo`),
      detalle: t(`${clave}.detalle`),
    });
}

interface TarjetasProps {
  ocupada: ClavePlantillaRegla | null;
  deshabilitadas?: boolean;
  onUsar: (clave: ClavePlantillaRegla) => void;
}

/** Las tres tarjetas del estado vacío, cada una con «Usar plantilla». */
export function TarjetasPlantillaRegla({ ocupada, deshabilitadas, onUsar }: TarjetasProps) {
  const t = useTranslations('crm.automatizaciones.plantillas');
  return (
    <ul className="grid w-full max-w-[768px] gap-3 sm:grid-cols-3" aria-label={t('titulo')}>
      {PLANTILLAS_REGLA.map((clave) => (
        <li key={clave} className="flex min-w-0 flex-col gap-1 rounded-xl border border-line bg-surface p-4 text-left">
          <p className="text-sm font-medium text-fg">{t(`${clave}.nombre`)}</p>
          <p className="text-[13px] leading-[18px] text-fg-secondary">{t(`${clave}.resumen`)}</p>
          <div className="mt-2">
            <button
              type="button"
              className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}
              disabled={deshabilitadas || ocupada !== null}
              aria-busy={ocupada === clave || undefined}
              onClick={() => onUsar(clave)}
            >
              {ocupada === clave ? t('creando') : t('usar')}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

interface DialogoProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  ocupada: ClavePlantillaRegla | null;
  onUsar: (clave: ClavePlantillaRegla) => void;
}

/** «Desde plantilla»: elegir una y crearla pausada. */
export function DialogoPlantillasRegla({ abierto, onAbiertoChange, ocupada, onUsar }: DialogoProps) {
  const t = useTranslations('crm.automatizaciones.plantillas');
  const [elegida, setElegida] = useState<ClavePlantillaRegla>('seguimiento_propuesta');
  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('dialogoTitulo')}
      descripcion={t('dialogoDescripcion')}
      ancho={560}
      primario={{ etiqueta: ocupada ? t('creando') : t('usar'), cargando: ocupada !== null, onClick: () => onUsar(elegida) }}
    >
      <div role="radiogroup" aria-label={t('titulo')} className="flex flex-col gap-2">
        {PLANTILLAS_REGLA.map((clave) => (
          <TarjetaSeleccionable
            key={clave}
            orientacion="horizontal"
            icono={ICONO[clave]}
            titulo={t(`${clave}.nombre`)}
            descripcion={t(`${clave}.resumen`)}
            seleccionada={elegida === clave}
            onSeleccionar={() => setElegida(clave)}
          />
        ))}
      </div>
    </Dialogo>
  );
}
