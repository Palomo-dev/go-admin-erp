'use client';

/**
 * Aviso para el bloque «Identidad web» del formulario de sucursal, junto a «Tipo de negocio»:
 * «Tu sitio de sede se crea con la plantilla de Restaurante…» (alta) o, al cambiar el tipo de una
 * sede existente, que el sitio pasará a la plantilla nueva sin pisar contenido propio.
 * Listo para que lo monte el formulario; sin tipo con plantilla no pinta nada.
 */
import { LayoutTemplate } from 'lucide-react';
import { esTipoSedePlantilla } from '@/lib/website/v2/plantillaSede';
import { useTextosPlantillaSede } from './textos';

export function AvisoPlantillaSede({ tipo, tipoAnterior, esNueva }: { tipo: string | null | undefined; tipoAnterior?: string | null; esNueva: boolean }) {
  const t = useTextosPlantillaSede();
  if (!esTipoSedePlantilla(tipo)) return null;
  if (!esNueva && tipoAnterior === tipo) return null;
  const valores = { tipo: t(`tipos.${tipo}`) };
  return (
    <p role="status" className="flex items-start gap-2 rounded-lg bg-brand-tint px-3 py-2 text-sm text-brand-deep">
      <LayoutTemplate aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
      <span>{t(esNueva ? 'avisoFormulario' : 'avisoCambioTipo', valores)}</span>
    </p>
  );
}
