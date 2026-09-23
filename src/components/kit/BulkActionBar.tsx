'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { ChevronDown, Loader2, X } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { RowActionsMenu } from './RowActionsMenu';
import type { AccionFila } from './acciones';
import { formatearEntero, sustantivoPara, type Sustantivo } from './paginacion';
import { aplanarMenuMasivo, type AccionMasiva } from './menuMasivo';

export { aAccionFila, aplanarMenuMasivo, type AccionMasiva, type GrupoMenuMasivo } from './menuMasivo';

/**
 * Barra de acciones masivas (Figma `BulkActionBar`, PATRONES §1). Aparece
 * solo con selección y **siempre flota al pie**: nunca arriba de la tabla y
 * sin mover nada del layout.
 *
 * - Escritorio: 50 px de alto, 24 px sobre el borde inferior, centrada sobre
 *   la columna de contenido (se mide dónde se renderiza, así sigue al sidebar
 *   plegado o desplegado). Contador · acciones · «⋯» · «×».
 * - Móvil: ancho completo, **tapa el MobileTabBar** mientras hay selección.
 *   Contador, la primera acción, el resto en «⋯» (hoja) y «×».
 *
 * Las acciones son las del dominio y solo las que existen (en facturas,
 * «Anular», no «Eliminar»). Lo destructivo pasa por ConfirmDialog.
 */
export interface BulkActionBarProps {
  seleccionados: number;
  /** Total del listado (todas las páginas) para «Seleccionar los N». */
  total?: number;
  onSeleccionarTodos?: () => void;
  /** «miembro/miembros», «cliente/clientes». */
  sustantivo?: Sustantivo;
  acciones: readonly AccionMasiva[];
  /** Secundarias en «⋯» (abre hacia arriba). */
  accionesSecundarias?: readonly AccionFila[];
  onLimpiar: () => void;
}

const SUSTANTIVO: Sustantivo = { singular: 'elemento', plural: 'elementos' };

function BotonAccion({ accion, compacto }: { accion: AccionMasiva; compacto?: boolean }) {
  if (accion.menu && accion.menu.length > 0) return <BotonMenu accion={accion} compacto={compacto} />;
  const Icono = accion.cargando ? Loader2 : accion.icono;
  return (
    <button
      type="button"
      onClick={accion.onClick}
      disabled={accion.deshabilitada || accion.cargando}
      title={accion.deshabilitada ? accion.motivo : undefined}
      aria-busy={accion.cargando || undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50',
        compacto ? 'h-10 px-3 text-sm' : 'h-8 px-3 text-[13px]',
        accion.destructiva
          ? 'border-transparent bg-danger text-fg-on-brand hover:bg-danger-hover'
          : 'border-line-strong bg-surface text-fg hover:bg-hover',
      )}
    >
      <Icono aria-hidden="true" className={cn('size-4 shrink-0', accion.cargando && 'animate-spin')} strokeWidth={1.5} />
      <span className="truncate">{accion.etiqueta}</span>
      {accion.deshabilitada && accion.motivo && <span className="sr-only">({accion.motivo})</span>}
    </button>
  );
}

function BotonMenu({ accion, compacto }: { accion: AccionMasiva; compacto?: boolean }) {
  const Icono = accion.cargando ? Loader2 : accion.icono;
  return (
    <DropdownMenuPrimitive.Root modal={false}>
      <DropdownMenuPrimitive.Trigger asChild>
        <button
          type="button"
          disabled={accion.deshabilitada || accion.cargando}
          title={accion.deshabilitada ? accion.motivo : undefined}
          aria-busy={accion.cargando || undefined}
          className={cn(
            'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-line-strong bg-surface font-medium text-fg transition-colors hover:bg-hover',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 data-[state=open]:bg-hover',
            compacto ? 'h-10 px-3 text-sm' : 'h-8 px-3 text-[13px]',
          )}
        >
          <Icono aria-hidden="true" className={cn('size-4 shrink-0', accion.cargando && 'animate-spin')} strokeWidth={1.5} />
          <span className="truncate">{accion.etiqueta}</span>
          <ChevronDown aria-hidden="true" className="size-3.5 shrink-0 text-fg-secondary" strokeWidth={1.5} />
        </button>
      </DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          side="top"
          align="start"
          sideOffset={8}
          collisionPadding={8}
          className="z-50 max-h-[min(480px,var(--radix-dropdown-menu-content-available-height))] min-w-[200px] overflow-y-auto rounded-xl border border-line bg-surface p-1 text-fg shadow-lg outline-none"
        >
          {(accion.menu ?? []).map((grupo, i) => (
            <DropdownMenuPrimitive.Group key={grupo.titulo ?? i}>
              {i > 0 && <DropdownMenuPrimitive.Separator className="-mx-1 my-1 h-px bg-line" />}
              {grupo.titulo && (
                <DropdownMenuPrimitive.Label className="px-2.5 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-fg-muted">
                  {grupo.titulo}
                </DropdownMenuPrimitive.Label>
              )}
              {grupo.acciones
                .filter((a) => !a.oculta)
                .map((a) => (
                  <DropdownMenuPrimitive.Item
                    key={a.id}
                    disabled={a.deshabilitada}
                    onSelect={() => a.onSelect()}
                    className={cn(
                      'flex min-h-9 cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm outline-none',
                      'data-[highlighted]:bg-hover data-[disabled]:cursor-not-allowed data-[disabled]:opacity-60',
                      a.destructiva ? 'text-danger-text' : 'text-fg',
                    )}
                  >
                    <a.icono aria-hidden="true" className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
                    <span className="truncate">{a.etiqueta}</span>
                  </DropdownMenuPrimitive.Item>
                ))}
            </DropdownMenuPrimitive.Group>
          ))}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}

function BotonLimpiar({ onLimpiar, grande }: { onLimpiar: () => void; grande?: boolean }) {
  return (
    <button
      type="button"
      onClick={onLimpiar}
      aria-label="Limpiar selección"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        grande ? 'size-10' : 'size-8',
      )}
    >
      <X aria-hidden="true" className="size-4" strokeWidth={1.5} />
    </button>
  );
}

export function BulkActionBar({
  seleccionados,
  total,
  onSeleccionarTodos,
  sustantivo = SUSTANTIVO,
  acciones,
  accionesSecundarias = [],
  onLimpiar,
}: BulkActionBarProps) {
  const anclaRef = React.useRef<HTMLDivElement>(null);
  const [columna, setColumna] = React.useState<{ centro: number; ancho: number } | null>(null);
  const [montado, setMontado] = React.useState(false);
  const visible = seleccionados > 0;

  React.useEffect(() => setMontado(true), []);

  React.useLayoutEffect(() => {
    const el = anclaRef.current;
    if (!el || !visible) return;
    const medir = () => {
      const r = el.getBoundingClientRect();
      setColumna({ centro: r.left + r.width / 2, ancho: r.width });
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    window.addEventListener('resize', medir);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', medir);
    };
  }, [visible]);

  const texto = `${formatearEntero(seleccionados)} ${sustantivoPara(seleccionados, sustantivo)} ${
    seleccionados === 1 ? 'seleccionado' : 'seleccionados'
  }`;
  const puedeSeleccionarTodos = !!onSeleccionarTodos && total !== undefined && total > seleccionados;

  // Móvil: la primera acción visible, el resto a la hoja.
  const [primeraMovil, ...restoMovil] = acciones;
  const secundariasMovil = [...restoMovil.flatMap(aplanarMenuMasivo), ...accionesSecundarias];

  return (
    <>
      {/* Ancla de medida: ocupa el ancho de la columna y 0 de alto. */}
      <div ref={anclaRef} aria-hidden="true" className="h-0 w-full" />
      {montado &&
        visible &&
        createPortal(
          <>
            <div
              role="region"
              aria-label="Acciones masivas"
              style={columna ? { left: columna.centro, maxWidth: columna.ancho - 32 } : undefined}
              className={cn(
                'fixed bottom-6 z-40 hidden h-[50px] w-max -translate-x-1/2 items-center gap-2 rounded-xl border border-line bg-surface pl-4 pr-2 text-fg shadow-lg lg:flex',
                !columna && 'left-1/2',
              )}
            >
              <span className="whitespace-nowrap text-[13px] font-medium tabular-nums" aria-live="polite">
                {texto}
              </span>
              {puedeSeleccionarTodos && (
                <button
                  type="button"
                  onClick={onSeleccionarTodos}
                  className="whitespace-nowrap rounded-md px-1 text-[13px] font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  Seleccionar los {formatearEntero(total)}
                </button>
              )}
              <span aria-hidden="true" className="mx-1 h-6 w-px bg-line" />
              <div className="flex min-w-0 items-center gap-2 overflow-x-auto">
                {acciones.map((a) => (
                  <BotonAccion key={a.id} accion={a} />
                ))}
              </div>
              {accionesSecundarias.length > 0 && (
                <RowActionsMenu acciones={accionesSecundarias} orientacion="horizontal" lado="top" titulo={texto} />
              )}
              <BotonLimpiar onLimpiar={onLimpiar} />
            </div>

            <div
              role="region"
              aria-label="Acciones masivas"
              className="fixed inset-x-0 bottom-0 z-50 flex min-h-[calc(4.625rem+env(safe-area-inset-bottom))] items-center gap-2 border-t border-line bg-surface px-3 pb-[env(safe-area-inset-bottom)] text-fg shadow-[0_-4px_12px_rgb(15_23_42/0.08)] lg:hidden"
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium tabular-nums" aria-live="polite">
                  {texto}
                </span>
                {puedeSeleccionarTodos && (
                  <button
                    type="button"
                    onClick={onSeleccionarTodos}
                    className="self-start text-[13px] font-medium text-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    Seleccionar los {formatearEntero(total)}
                  </button>
                )}
              </div>
              {primeraMovil && <BotonAccion accion={primeraMovil} compacto />}
              {secundariasMovil.length > 0 && (
                <RowActionsMenu acciones={secundariasMovil} orientacion="horizontal" tamano="md" titulo={texto} />
              )}
              <BotonLimpiar onLimpiar={onLimpiar} grande />
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
