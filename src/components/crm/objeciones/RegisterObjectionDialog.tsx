'use client';

/**
 * Registrar una objeción del catálogo en la oportunidad en dos clics:
 * (1) «Registrar objeción» abre esta lista, (2) elegir una la registra.
 * Al recorrer la lista (ratón o flechas) se ve la respuesta recomendada y
 * las preguntas de la objeción resaltada. Las ya registradas y pendientes
 * aparecen deshabilitadas. Una nota opcional de una línea viaja con el
 * registro (`opportunity_objections.notes`), sin paso extra.
 */

import { useEffect, useId, useMemo, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
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

export function RegisterObjectionDialog({ open, catalog, pendingIds, registering, onOpenChange, onPick, returnFocusFallback }: Props) {
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState<string>('');
  const [notes, setNotes] = useState('');
  const notesId = useId();
  const onCloseAutoFocus = useReturnFocus(open, returnFocusFallback);

  useEffect(() => {
    if (open) { setQuery(''); setHighlighted(''); setNotes(''); }
  }, [open]);

  const shown = useMemo(() => filterObjections(catalog, { ...EMPTY_FILTERS, query }), [catalog, query]);
  const preview = shown.find((o) => o.id === highlighted) ?? shown[0] ?? null;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!registering) onOpenChange(next); }}>
      <DialogContent onCloseAutoFocus={onCloseAutoFocus} className="gap-0 overflow-hidden bg-white p-0 dark:bg-gray-900 sm:max-w-lg">
        <DialogHeader className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
          <DialogTitle className="text-gray-900 dark:text-gray-100">Registrar objeción</DialogTitle>
          <DialogDescription className="text-gray-600 dark:text-gray-400">
            Elige lo que dijo el cliente. Se registra al instante y verás cómo responder.
          </DialogDescription>
        </DialogHeader>
        <Command shouldFilter={false} value={highlighted} onValueChange={setHighlighted} className="bg-transparent dark:bg-transparent">
          <CommandInput value={query} onValueChange={setQuery} placeholder="Buscar por título o señal…" aria-label="Buscar objeción" />
          <CommandList className="max-h-56">
            <CommandEmpty>
              {catalog.length === 0 ? 'El catálogo está vacío: créalo en CRM › Objeciones.' : 'Ninguna objeción coincide.'}
            </CommandEmpty>
            {shown.map((o) => {
              const pending = pendingIds.has(o.id);
              const busy = registering === o.id;
              return (
                <CommandItem
                  key={o.id}
                  value={o.id}
                  disabled={pending || !!registering}
                  onSelect={() => onPick(o, notes)}
                  className="flex items-center justify-between gap-2 px-3 py-2 text-gray-900 dark:text-gray-100"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium">{o.title}</span>
                    <CategoryBadge value={o.category} />
                  </span>
                  {busy && <Loader2 className="h-4 w-4 shrink-0 motion-safe:animate-spin" aria-hidden="true" />}
                  {pending && !busy && (
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                      <Check className="h-3.5 w-3.5" aria-hidden="true" /> Ya registrada
                    </span>
                  )}
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
        <div className="border-t border-gray-200 px-4 py-2.5 dark:border-gray-800">
          <Label htmlFor={notesId} className="text-xs text-gray-700 dark:text-gray-300">Nota (opcional)</Label>
          <Input
            id={notesId}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={280}
            placeholder="Ej.: lo dijo al ver el precio anual"
            className="mt-1 h-8 text-sm"
            disabled={!!registering}
          />
        </div>
        {preview && (
          // Sin aria-live: cmdk ya anuncia la opción resaltada; anunciar el bloque entero a cada flecha era ruido.
          <div className="border-t border-gray-200 px-4 py-3 dark:border-gray-800">
            <p className="mb-2 text-xs text-gray-600 dark:text-gray-400">
              Vista previa: <span className="font-medium text-gray-900 dark:text-gray-100">{preview.title}</span>
            </p>
            <ObjectionGuidance key={preview.id} objection={preview} defaultOpen compact />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
