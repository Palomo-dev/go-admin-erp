'use client';

/**
 * Bloque de sesión del pie del sidebar (Figma `02 Componentes` › Sesión ›
 * UserBlock). Abre `SessionPopover` en escritorio y `SessionSheet` (hoja
 * inferior, «Mi cuenta») en el drawer móvil.
 *
 * - expanded / drawer: avatar con punto de estado, nombre, rol, chip del plan y ⇅.
 * - rail: solo el avatar con punto de estado.
 */
import { useState } from 'react';
import { ChevronsUpDown, Crown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { AvatarUsuario } from './AvatarUsuario';
import { PanelSesion, type UsuarioSesion } from './PanelSesion';
import { usePlanSesion } from './usePlanSesion';

interface BloqueSesionProps {
  modo: 'rail' | 'expanded' | 'drawer';
  usuario: UsuarioSesion | null;
  organizacion: string;
  tema: 'light' | 'dark';
  onAlternarTema: () => void;
  onCerrarSesion: () => void;
  cerrandoSesion: boolean;
}

export function BloqueSesion(props: BloqueSesionProps) {
  const { modo, usuario } = props;
  const t = useTranslations('session');
  const [abierto, setAbierto] = useState(false);
  const { datos } = usePlanSesion();
  const rail = modo === 'rail';
  const nombrePlan = datos?.plan?.nombre ?? null;

  const disparador = (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-expanded={abierto}
      aria-label={rail ? t('openAccountMenu', { name: usuario?.name || usuario?.email || '' }) : undefined}
      onClick={modo === 'drawer' ? () => setAbierto(true) : undefined}
      className={cn(
        'flex w-full items-center gap-3 border-t border-line bg-sidebar p-3 text-left outline-none transition-colors',
        'hover:bg-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand',
        rail && 'h-14 justify-center',
        abierto && 'bg-hover'
      )}
    >
      <AvatarUsuario nombre={usuario?.name} correo={usuario?.email} foto={usuario?.avatar} tamano={40} indicador />
      {!rail && (
        <>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-sm font-medium leading-5 text-fg">{usuario?.name || usuario?.email || '—'}</span>
            {usuario?.role && <span className="truncate text-xs font-medium leading-4 text-fg-secondary">{usuario.role}</span>}
            {nombrePlan && (
              <span className="pt-1">
                <span className="inline-flex items-center gap-1 rounded-full border border-line-brand bg-brand-tint px-2 py-0.5 text-xs font-semibold text-brand-deep">
                  <Crown size={12} aria-hidden="true" />
                  {nombrePlan}
                </span>
              </span>
            )}
          </span>
          <ChevronsUpDown size={16} aria-hidden="true" className="shrink-0 text-fg-muted" />
        </>
      )}
    </button>
  );

  const panel = <PanelSesion {...props} onCerrar={() => setAbierto(false)} />;

  if (modo === 'drawer') {
    return (
      <>
        {disparador}
        <Sheet open={abierto} onOpenChange={setAbierto}>
          <SheetContent side="bottom" className="max-h-[90dvh] rounded-t-2xl border-line bg-surface p-2 pb-[max(env(safe-area-inset-bottom),12px)]">
            <SheetHeader className="px-2 pb-1 pt-2 text-left">
              <SheetTitle className="text-base font-semibold text-fg">{t('myAccount')}</SheetTitle>
            </SheetHeader>
            {panel}
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>{disparador}</PopoverTrigger>
      <PopoverContent
        side={rail ? 'right' : 'top'}
        align={rail ? 'end' : 'start'}
        sideOffset={8}
        collisionPadding={12}
        className="max-h-[70vh] w-80 overflow-y-auto overscroll-contain rounded-xl border-line bg-surface p-2 text-fg shadow-[0_1px_3px_rgba(15,23,42,0.06),0_4px_12px_rgba(15,23,42,0.1)]"
      >
        {panel}
      </PopoverContent>
    </Popover>
  );
}
