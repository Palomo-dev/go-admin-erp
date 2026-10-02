'use client';

/**
 * Registrar una objeción del catálogo en la oportunidad en dos clics:
 * (1) «Registrar objeción» abre esta lista, (2) elegir una la registra.
 * Al recorrer la lista (ratón o flechas) se ve la respuesta recomendada y
 * las preguntas de la objeción resaltada. Las ya registradas y pendientes
 * aparecen deshabilitadas. Una nota opcional de una línea viaja con el
 * registro (`opportunity_objections.notes`), sin paso extra.
 */

import { useTranslations } from 'next-intl';
import { useEffect, useId, useMemo, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useReturnFocus } from '@/lib/hooks/useReturnFocus';
import type { Objection } from '@/lib/services/crm/objectionService';
import { EMPTY_FILTERS, filterObjections } from '@/lib/services/crm/objectionModel';
import { CategoryBadge } from './categoryMeta';
import { ObjectionGuidance } from './ObjectionCard';

interface Props {
  open: boolean;
  catalog: Objection[];
  /** Ids de objeciones ya registradas y sin resolver. */
  pendingIds: Set<string>;
  registering: string | null;
  onOpenChange: (open: boolean) => void;
  onPick: (objection: Objection, notes: string) => void;
  returnFocusFallback: () => HTMLElement | null;
}

export function RegisterObjectionDialog({
  open,
  catalog,
  pendingIds,
  registering,
  onOpenChange,
  onPick,
  returnFocusFallback,
}: Props) {
  const t = useTranslations('crm.objecionesNuevo');
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState<string>('');
  const [notes, setNotes] = useState('');
  const notesId = useId();
  const onCloseAutoFocus = useReturnFocus(open, returnFocusFallback);

  useEffect(() => {
    if (open) {
      setQuery('');
      setHighlighted('');
      setNotes('');
    }
  }, [open]);

  const shown = useMemo(
    () => filterObjections(catalog, { ...EMPTY_FILTERS, query }),
    [catalog, query],
  );
  const preview = shown.find((o) => o.id === highlighted) ?? shown[0] ?? null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!registering) onOpenChange(next);
      }}
    >
      <DialogContent
        onCloseAutoFocus={onCloseAutoFocus}
        className="gap-0 overflow-hidden bg-surface p-0 sm:max-w-lg"
      >
        <DialogHeader className="border-b border-line px-4 py-3">
          <DialogTitle className="text-fg">{t('register')}</DialogTitle>
          <DialogDescription className="text-fg-secondary">{t('registerHint')}</DialogDescription>
        </DialogHeader>
        <Command
          shouldFilter={false}
          value={highlighted}
          onValueChange={setHighlighted}
          className="bg-transparent dark:bg-transparent"
        >
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={t('searchHint')}
            aria-label={t('search')}
          />
          <CommandList className="max-h-56">
            <CommandEmpty>{t(catalog.length === 0 ? 'catalogEmpty' : 'noResults')}</CommandEmpty>
            {shown.map((o) => {
              const pending = pendingIds.has(o.id);
              const busy = registering === o.id;
              return (
                <CommandItem
                  key={o.id}
                  value={o.id}
                  disabled={pending || !!registering}
                  onSelect={() => onPick(o, notes)}
                  className="flex items-center justify-between gap-2 px-3 py-2 text-fg"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium">{o.title}</span>
                    <CategoryBadge value={o.category} />
                  </span>
                  {busy && (
                    <Loader2
                      className="h-4 w-4 shrink-0 motion-safe:animate-spin"
                      aria-hidden="true"
                    />
                  )}
                  {pending && !busy && (
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs text-fg-secondary">
                      <Check className="h-3.5 w-3.5" aria-hidden="true" /> {t('alreadyRegistered')}
                    </span>
                  )}
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
        <div className="border-t border-line px-4 py-2.5">
          <Label htmlFor={notesId} className="text-xs text-fg-secondary">
            {t('notes')}
          </Label>
          <Input
            id={notesId}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={280}
            placeholder={t('notesHint')}
            className="mt-1 h-8 text-sm"
            disabled={!!registering}
          />
        </div>
        {preview && (
          // Sin aria-live: cmdk ya anuncia la opción resaltada; anunciar el bloque entero a cada flecha era ruido.
          <div className="border-t border-line px-4 py-3">
            <p className="mb-2 text-xs text-fg-secondary">
              {t('preview')}: <span className="font-medium text-fg">{preview.title}</span>
            </p>
            <ObjectionGuidance key={preview.id} objection={preview} defaultOpen compact />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
