'use client';

/**
 * Selector del evento para el disparador «Ocurre un evento del CRM» (juicio
 * del tester, ronda 2): antes había que escribir `opportunity.created` a
 * mano. Ahora ofrece los eventos conocidos (`KNOWN_EVENTS`, los que el motor
 * enruta a reglas de tipo `event`), «cualquier evento», y sigue admitiendo un
 * nombre libre `entidad.accion` para eventos que el catálogo no lista.
 */

import { useState } from 'react';
import { Check, ChevronsUpDown, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/utils/Utils';
import { KNOWN_EVENTS, isEngineRoutedEvent, knownEvent } from '@/lib/services/crm/automation/ruleCatalog';
import { useTranslations } from 'next-intl';

interface Props {
  id: string;
  value: string;
  describedBy?: string;
  onChange: (value: string) => void;
}

const FREE_TEXT = /^[a-z_]+\.[a-z_.]+$/;

export function currentEventLabel(value: string, cualquiera = 'Cualquier evento'): string {
  const trimmed = value.trim();
  if (!trimmed) return cualquiera;
  const known = knownEvent(trimmed);
  return known ? `${known.label} (${known.value})` : trimmed;
}

export function EventPicker({ id, value, describedBy, onChange }: Props) {
  const t = useTranslations('crm.automatizaciones');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const trimmedQuery = query.trim();
  const engineRouted = isEngineRoutedEvent(trimmedQuery);
  const canUseFreeText = FREE_TEXT.test(trimmedQuery) && !knownEvent(trimmedQuery) && !engineRouted;

  const pick = (next: string) => {
    onChange(next);
    setQuery('');
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery(''); }}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-describedby={describedBy}
          className="h-9 w-full justify-between font-normal"
        >
          <span className="truncate">{currentEventLabel(value, t('eventPicker.cualquierEvento'))}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-60" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-80 p-0">
        <Command>
          <CommandInput placeholder={t('eventPicker.buscarEscribirEntidadAccion')} value={query} onValueChange={setQuery} />
          {engineRouted && (
            <p role="alert" className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
              {t('eventPicker.eseEventoVaPropio')}
            </p>
          )}
          <CommandList>
            <CommandEmpty>
              {trimmedQuery && !canUseFreeText
                ? t('eventPicker.ningunEventoCoincideNombre')
                : t('eventPicker.ningunEventoCoincide')}
            </CommandEmpty>
            <CommandGroup heading={t('eventPicker.eventosConocidos')}>
              <CommandItem value="cualquier evento *" onSelect={() => pick('')}>
                <Check className={cn('mr-2 h-4 w-4', value.trim() ? 'opacity-0' : 'opacity-100')} aria-hidden="true" />
                <div>
                  <p className="text-sm">{t('eventPicker.cualquierEvento')}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">{t('eventPicker.reglaEvaluaCualquierEvento')}</p>
                </div>
              </CommandItem>
              {KNOWN_EVENTS.map((ev) => (
                <CommandItem key={ev.value} value={`${ev.label} ${ev.value}`} onSelect={() => pick(ev.value)}>
                  <Check className={cn('mr-2 h-4 w-4', value.trim() === ev.value ? 'opacity-100' : 'opacity-0')} aria-hidden="true" />
                  <div>
                    <p className="text-sm">{ev.label} <span className="font-mono text-xs text-gray-600 dark:text-gray-400">{ev.value}</span></p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">{ev.hint}</p>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
            {canUseFreeText && (
              <CommandGroup heading={t('eventPicker.nombreLibre')}>
                <CommandItem value={`usar ${trimmedQuery}`} onSelect={() => pick(trimmedQuery)}>
                  <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
                  <span className="text-sm">{t('eventPicker.usar', { trimmedQuery })}</span>
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
