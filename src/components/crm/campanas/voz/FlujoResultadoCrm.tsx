'use client';

/**
 * «Qué pasa en el CRM después de cada llamada» (Figma 1680:859620, paso 1) y
 * su diagrama completo «Del resultado de la llamada al CRM» (Figma
 * 1685:132525), que se abre con «Ver flujo completo».
 *
 * Contenido fijo: describe lo que YA hacen las herramientas del agente
 * (`voiceAgentTools.ts`: book_meeting, schedule_callback, log_objection,
 * log_consent_opt_out, transfer_to_human) y la política de reintentos. Las
 * etiquetas «estado · herramienta» son los nombres reales, no se traducen.
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  ArrowRight,
  Ban,
  Bot,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  PhoneForwarded,
  Phone,
  Voicemail,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { clasesBadgeTono } from '@/components/ui/badge';
import type { TonoBadge } from '@/components/kit/estadoTono';
import { clasesBoton } from '@/components/kit/botonClases';
import { cn } from '@/utils/Utils';

const RESUMEN: { clave: 'reunion' | 'despues' | 'noInteresa' | 'noLlamar'; icono: LucideIcon }[] = [
  { clave: 'reunion', icono: CalendarDays },
  { clave: 'despues', icono: CalendarClock },
  { clave: 'noInteresa', icono: ClipboardList },
  { clave: 'noLlamar', icono: Ban },
];

const FLUJO: { clave: 'reunion' | 'despues' | 'noInteresa' | 'noLlamar' | 'buzon' | 'persona'; icono: LucideIcon; codigo: string; tono: TonoBadge }[] = [
  { clave: 'reunion', icono: CalendarDays, codigo: 'completed · book_meeting', tono: 'exito' },
  { clave: 'despues', icono: CalendarClock, codigo: 'completed · schedule_callback', tono: 'informacion' },
  { clave: 'noInteresa', icono: ClipboardList, codigo: 'completed · log_objection', tono: 'neutro' },
  { clave: 'noLlamar', icono: Ban, codigo: 'completed · log_consent_opt_out', tono: 'peligro' },
  { clave: 'buzon', icono: Voicemail, codigo: 'voicemail · no_answer · failed', tono: 'advertencia' },
  { clave: 'persona', icono: PhoneForwarded, codigo: 'transferred · transfer_to_human', tono: 'marca' },
];

export function QuePasaEnCrm() {
  const t = useTranslations('crm.campanaVozAsistente');
  const [abierto, setAbierto] = useState(false);
  return (
    <section aria-labelledby="que-pasa-crm" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="que-pasa-crm" className="text-base font-semibold leading-6 text-fg">
          {t('quePasa.titulo')}
        </h2>
        <button type="button" className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })} onClick={() => setAbierto(true)}>
          <Workflow aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('quePasa.verFlujo')}
        </button>
      </div>
      <ul className="flex flex-col gap-2">
        {RESUMEN.map(({ clave, icono: Icono }) => (
          <li key={clave} className="grid gap-1 sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)] sm:gap-4">
            <span className="flex items-center gap-2 text-sm font-medium text-fg">
              <Icono aria-hidden="true" className="size-4 shrink-0 text-brand" strokeWidth={1.5} />
              {t(`quePasa.filas.${clave}.titulo`)}
            </span>
            <span className="text-[13px] leading-[18px] text-fg-secondary">{t(`quePasa.filas.${clave}.texto`)}</span>
          </li>
        ))}
      </ul>
      <FlujoResultadoDialogo abierto={abierto} onAbiertoChange={setAbierto} />
    </section>
  );
}

export function FlujoResultadoDialogo({ abierto, onAbiertoChange }: { abierto: boolean; onAbiertoChange: (v: boolean) => void }) {
  const t = useTranslations('crm.campanaVozAsistente.flujo');
  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[1024px]">
        <DialogHeader>
          <DialogTitle>{t('titulo')}</DialogTitle>
          <DialogDescription>{t('descripcion')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="flex shrink-0 flex-col gap-1 rounded-xl border-2 border-line-brand bg-surface p-4 lg:w-[200px]">
            <span className="flex items-center gap-2 text-base font-semibold text-fg">
              <Phone aria-hidden="true" className="size-4 text-brand" strokeWidth={1.5} />
              {t('termina.titulo')}
            </span>
            <span className="text-xs leading-4 text-fg-muted">{t('termina.texto')}</span>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2 lg:border-l lg:border-line lg:pl-4">
            <div className="hidden grid-cols-[minmax(0,1fr)_16px_minmax(0,1.3fr)_16px_minmax(0,0.9fr)] gap-3 text-xs font-medium text-fg-secondary lg:grid">
              <span>{t('columnas.resultado')}</span>
              <span />
              <span>{t('columnas.crm')}</span>
              <span />
              <span>{t('columnas.donde')}</span>
            </div>
            <ol className="flex flex-col gap-2">
              {FLUJO.map(({ clave, icono: Icono, codigo, tono }) => (
                <li key={clave} className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_16px_minmax(0,1.3fr)_16px_minmax(0,0.9fr)] lg:items-center lg:gap-3">
                  <div className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface p-3">
                    <span className="flex items-center gap-2 text-sm font-medium text-fg">
                      <Icono aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.5} />
                      {t(`filas.${clave}.titulo`)}
                    </span>
                    <span className={cn(clasesBadgeTono(tono, 'contorno', 'sm'), 'w-fit font-mono')}>{codigo}</span>
                  </div>
                  <ArrowRight aria-hidden="true" className="hidden size-4 text-fg-muted lg:block" strokeWidth={1.5} />
                  <p className="rounded-lg border border-line bg-surface p-3 text-[13px] leading-[18px] text-fg">{t(`filas.${clave}.crm`)}</p>
                  <ArrowRight aria-hidden="true" className="hidden size-4 text-fg-muted lg:block" strokeWidth={1.5} />
                  <p className="rounded-lg border border-line-brand bg-brand-tint p-3 text-[13px] leading-[18px] text-brand-deep">{t(`filas.${clave}.donde`)}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <p className="flex items-start gap-2 text-xs leading-4 text-fg-muted">
          <Bot aria-hidden="true" className="mt-px size-3.5 shrink-0" strokeWidth={1.5} />
          {t('pie')}
        </p>
      </DialogContent>
    </Dialog>
  );
}
