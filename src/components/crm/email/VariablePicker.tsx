'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Braces } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { VARIABLE_CATALOG, getPath, type RenderContext, type VariableDef } from '@/lib/services/crm/email/variables';

const GROUP_LABELS: Record<VariableDef['group'], string> = {
  contact: 'Contacto',
  opportunity: 'Oportunidad',
  org: 'Organización',
  user: 'Vendedor',
  quote: 'Cotización',
  custom: 'Personalizadas',
};

interface Props {
  /** Contexto real/ejemplo para mostrar el valor actual. */
  values?: RenderContext | null;
  onInsert: (expression: string) => void;
  trigger?: ReactNode;
  /** Añade `|default` al insertar (p. ej. `{{contact.first_name|hola}}`). */
  withDefault?: boolean;
  catalog?: VariableDef[];
}

/** Popover con buscador de variables; inserta `{{ruta}}` (o `{{ruta|filtro}}` cuando aplica). */
export function VariablePicker({ values, onInsert, trigger, withDefault, catalog = VARIABLE_CATALOG }: Props) {
  const [open, setOpen] = useState(false);
  const groups = useMemo(() => {
    const map = new Map<VariableDef['group'], VariableDef[]>();
    for (const v of catalog) map.set(v.group, [...(map.get(v.group) ?? []), v]);
    return Array.from(map.entries());
  }, [catalog]);

  const expression = (v: VariableDef) => {
    const filter = v.format ? `|${v.format}` : '';
    const def = withDefault && v.group === 'contact' && v.path.endsWith('first_name') ? '|hola' : '';
    return `{{${v.path}${filter}${def}}}`;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <Button type="button" variant="outline" size="sm" className="gap-1 dark:border-gray-600 dark:text-gray-200" aria-label="Insertar variable">
            <Braces className="h-3.5 w-3.5" aria-hidden="true" /> Variables
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 dark:bg-gray-800" align="start">
        <Command className="dark:bg-gray-800">
          <CommandInput placeholder="Buscar variable…" />
          <CommandList className="max-h-72">
            <CommandEmpty>Sin resultados</CommandEmpty>
            {groups.map(([group, items]) => (
              <CommandGroup key={group} heading={GROUP_LABELS[group]}>
                {items.map((v) => {
                  const current = values ? getPath(values, v.path) : undefined;
                  const shown = current === undefined || current === null || current === '' ? v.example : String(current);
                  return (
                    <CommandItem
                      key={v.path}
                      value={`${v.path} ${v.label}`}
                      onSelect={() => {
                        onInsert(expression(v));
                        setOpen(false);
                      }}
                      className="flex flex-col items-start gap-0.5"
                    >
                      <span className="text-sm text-gray-800 dark:text-gray-100">{v.label}</span>
                      <span className="font-mono text-[11px] text-gray-500 dark:text-gray-400">{`{{${v.path}}}`} · <span className="italic">{shown.slice(0, 40)}</span></span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
