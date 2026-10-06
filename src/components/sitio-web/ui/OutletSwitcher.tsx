'use client';

import { ChevronDown, Globe, Store } from 'lucide-react';
import { cn } from '@/utils/Utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTextosComun } from './textos';

/**
 * Qué sitio se está editando (Figma D/02 OutletSwitcher; editor D/05-13 y
 * D/05-22, Páginas › Menú D/04-10): «Editando: Sitio principal ⌄» con el globo
 * o «Editando: Sede Norte ⌄» con la tienda. Neutro como los demás selectores del
 * ERP (decisión del dueño: sin ámbar; el nombre y el icono ya distinguen la sede).
 * Sustituye a `editor/v2/SelectorSitio`.
 */
export interface SedeEditable {
  /** id del sitio V2 de la sede o de la sucursal, según quien lo use. */
  id: string;
  nombre: string;
}

export interface OutletSwitcherProps {
  /** `null` = sitio principal. */
  valor: string | null;
  onCambiar: (id: string | null) => void;
  sedes: readonly SedeEditable[];
  /** Nombre del sitio principal; por defecto «Sitio principal». */
  nombrePrincipal?: string;
  deshabilitado?: boolean;
  className?: string;
}

const PRINCIPAL = '__principal__';

export function OutletSwitcher({ valor, onCambiar, sedes, nombrePrincipal, deshabilitado, className }: OutletSwitcherProps) {
  const tx = useTextosComun();
  const principal = nombrePrincipal ?? tx('sede.principal');
  const sede = valor ? sedes.find((s) => s.id === valor) : undefined;
  const esSede = !!sede;
  const Icono = esSede ? Store : Globe;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={deshabilitado}
        aria-label={tx('sede.cambiar')}
        className={cn(
          'inline-flex h-10 max-w-full items-center gap-2 rounded-lg border px-3 text-sm transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand data-[state=open]:border-brand data-[state=open]:ring-1 data-[state=open]:ring-brand',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'border-line bg-surface hover:bg-hover',
          className,
        )}
      >
        <Icono aria-hidden="true" className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
        <span className="shrink-0 text-fg-muted">{tx('sede.editando')}</span>
        <span className="truncate font-medium text-fg">{sede?.nombre ?? principal}</span>
        <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[240px]">
        <DropdownMenuRadioGroup value={valor ?? PRINCIPAL} onValueChange={(v) => onCambiar(v === PRINCIPAL ? null : v)}>
          <DropdownMenuRadioItem value={PRINCIPAL}>
            <Globe aria-hidden="true" className="mr-2 size-4 text-fg-secondary" strokeWidth={1.5} />
            {principal}
          </DropdownMenuRadioItem>
          {sedes.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs font-medium text-fg-muted">{tx('sede.sedes')}</DropdownMenuLabel>
              {sedes.map((s) => (
                <DropdownMenuRadioItem key={s.id} value={s.id}>
                  <Store aria-hidden="true" className="mr-2 size-4 text-fg-secondary" strokeWidth={1.5} />
                  {s.nombre}
                </DropdownMenuRadioItem>
              ))}
            </>
          )}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
