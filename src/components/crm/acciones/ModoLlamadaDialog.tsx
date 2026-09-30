'use client';

import { useTranslations } from 'next-intl';
import { Bot, ClipboardEdit, Globe, Phone, Smartphone, type LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { PanelAdaptable } from '@/components/kit/PanelAdaptable';
import { motivoModo, ordenModos, type ModoLlamada } from './accionesRapidasLogica';

/**
 * «Llamar» (Figma 773:472975): menú de modos → llamar desde el navegador
 * (softphone), desde mi celular (puente), agente IA (deshabilitado con su
 * motivo) o solo registrar una llamada ya hecha. Cada modo deshabilitado dice
 * por qué. Al elegir, la barra abre el registro de la llamada.
 */
export interface ModoLlamadaDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  nombre: string;
  telefono: string | null;
  softphoneListo: boolean;
  predeterminado?: 'browser' | 'mobile' | null;
  onElegir: (modo: ModoLlamada) => void;
}

const ICONO: Record<ModoLlamada, LucideIcon> = { browser: Globe, mobile: Smartphone, ai: Bot, registrar: ClipboardEdit };

export function ModoLlamadaDialog({ abierto, onAbiertoChange, nombre, telefono, softphoneListo, predeterminado, onElegir }: ModoLlamadaDialogProps) {
  const t = useTranslations('crm.accionesRapidas.llamar');
  return (
    <PanelAdaptable abierto={abierto} onAbiertoChange={onAbiertoChange} titulo={t('titulo')} descripcion={[nombre, telefono].filter(Boolean).join(' · ')} icono={Phone} ancho={520}>
      <ul className="flex flex-col gap-1" aria-label={t('modos')}>
        {ordenModos(predeterminado).map((modo) => {
          const motivo = motivoModo(modo, { telefono, softphoneListo });
          const Icono = ICONO[modo];
          return (
            <li key={modo}>
              <button
                type="button"
                aria-disabled={motivo ? true : undefined}
                onClick={() => !motivo && onElegir(modo)}
                className={cn(
                  'flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                  motivo ? 'cursor-not-allowed opacity-60' : 'hover:bg-hover',
                )}
              >
                <Icono aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm font-medium text-fg">
                    {t(`modo.${modo}`)}
                    {modo === predeterminado && <span className="ml-1 text-xs font-normal text-fg-muted">· {t('predeterminado')}</span>}
                  </span>
                  <span className="text-xs text-fg-muted">{motivo ? t(`motivo.${motivo}`) : t(`detalle.${modo}`)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </PanelAdaptable>
  );
}
