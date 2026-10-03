'use client';

import { useTranslations } from 'next-intl';
import { Bot, ClipboardEdit, Globe, Phone, Smartphone, type LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { PanelAdaptable } from '@/components/kit/PanelAdaptable';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
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
  variante?: 'dialogo' | 'menu';
  ancla?: HTMLElement | null;
}

const ICONO: Record<ModoLlamada, LucideIcon> = { browser: Globe, mobile: Smartphone, ai: Bot, registrar: ClipboardEdit };

export function ModoLlamadaDialog({ abierto, onAbiertoChange, nombre, telefono, softphoneListo, predeterminado, onElegir, variante = 'dialogo', ancla }: ModoLlamadaDialogProps) {
  const t = useTranslations('crm.accionesRapidas.llamar');
  if (variante === 'menu' && ancla) return <Popover open={abierto} onOpenChange={onAbiertoChange}><PopoverAnchor virtualRef={{ current: ancla }} /><PopoverContent align="start" side="bottom" sideOffset={8} className="w-80 rounded-xl border-line bg-surface p-1.5 text-fg shadow-[0_8px_24px_rgba(15,23,42,0.12)]" aria-label={t('modos')} onCloseAutoFocus={event => { event.preventDefault(); ancla.focus(); }}>
    <ul className="space-y-1">{ordenModos(predeterminado).filter(mode => mode !== 'ai').map(mode => {
      const reason = motivoModo(mode, { telefono, softphoneListo });
      const Icon = ICONO[mode];
      return <li key={mode}><button type="button" aria-disabled={reason ? true : undefined} onClick={() => !reason && onElegir(mode)} className={cn('flex w-full items-start gap-3 rounded-lg p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand', reason ? 'cursor-not-allowed opacity-60' : 'hover:bg-hover', mode === predeterminado && 'bg-brand-tint')}><Icon size={18} strokeWidth={1.5} className="mt-0.5 shrink-0 text-fg-secondary" /><span className="min-w-0 flex-1"><span className="block text-[13px] font-medium leading-[18px]">{t(`modo.${mode}`)}{mode === predeterminado && <span className="ml-1 text-[10px] font-normal text-fg-muted">· {t('predeterminado')}</span>}</span><span className="mt-0.5 block text-xs leading-4 text-fg-secondary">{reason ? t(`motivo.${reason}`) : t(`detalle.${mode}`)}</span></span>{mode === 'browser' && !reason && <kbd className="shrink-0 rounded border border-line bg-subtle px-1 text-[10px] leading-4 text-fg-secondary">Ctrl⇧C</kbd>}</button></li>;
    })}</ul>
  </PopoverContent></Popover>;
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
