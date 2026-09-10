'use client';

/**
 * Selector de plantillas de email (Popover + Command): buscador, grupos por
 * tipo, enlace a "Gestionar plantillas". Carga GET /api/email/templates al
 * abrir (activas). `onPick` recibe la plantilla completa (GET /[id]).
 */

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { FileText, Loader2, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/components/ui/use-toast';
import type { Template, TemplateKind, TemplateSummary } from '@/lib/services/crm/email/types';
import { getTemplate, listTemplates } from './emailApi';

export const TEMPLATE_KIND_LABELS: Record<TemplateKind, string> = {
  transactional: 'Transaccional',
  marketing: 'Marketing',
  sequence: 'Secuencia',
  signature: 'Firma',
  hsm: 'WhatsApp (HSM)',
  onboarding: 'Onboarding',
};

interface Props {
  onPick: (template: Template) => void;
  kind?: TemplateKind;
  trigger?: ReactNode;
  disabled?: boolean;
}

export function TemplatePicker({ onPick, kind, trigger, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    listTemplates({ channel: 'email', active: true, kind, pageSize: 100 })
      .then((r) => { if (!cancelled) setItems(r.data); })
      .catch((err: Error) => toast({ title: 'No se pudieron cargar las plantillas', description: err.message, variant: 'destructive' }))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, kind, toast]);

  const groups = new Map<string, TemplateSummary[]>();
  for (const t of items) {
    const k = t.kind ?? 'transactional';
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }

  const pick = async (id: string) => {
    setPicking(id);
    try {
      const r = await getTemplate(id);
      onPick(r.data);
      setOpen(false);
    } catch (err) {
      toast({ title: 'No se pudo cargar la plantilla', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setPicking(null);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <Button type="button" variant="outline" size="sm" disabled={disabled} className="gap-1 dark:border-gray-600 dark:text-gray-200" aria-label="Elegir plantilla">
            <FileText className="h-3.5 w-3.5" aria-hidden="true" /> Plantilla
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0 dark:bg-gray-800" align="start">
        <Command className="dark:bg-gray-800">
          <CommandInput placeholder="Buscar plantilla…" />
          <CommandList className="max-h-80">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Cargando…</div>
            ) : (
              <>
                <CommandEmpty>No hay plantillas activas.</CommandEmpty>
                {Array.from(groups.entries()).map(([k, list]) => (
                  <CommandGroup key={k} heading={TEMPLATE_KIND_LABELS[k as TemplateKind] ?? k}>
                    {list.map((t) => (
                      <CommandItem key={t.id} value={`${t.name} ${t.subject ?? ''}`} onSelect={() => pick(t.id)} className="flex flex-col items-start gap-0.5">
                        <span className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-100">
                          {t.name}
                          {picking === t.id ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : null}
                        </span>
                        {t.subject ? <span className="truncate text-[11px] text-gray-500 dark:text-gray-400">{t.subject}</span> : null}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))}
              </>
            )}
          </CommandList>
        </Command>
        <div className="border-t border-gray-200 p-2 dark:border-gray-700">
          <Link href="/app/crm/plantillas" className="flex items-center gap-1 text-xs text-blue-600 hover:underline dark:text-blue-400">
            <Settings className="h-3 w-3" aria-hidden="true" /> Gestionar plantillas
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
