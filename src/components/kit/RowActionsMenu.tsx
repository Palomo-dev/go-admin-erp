'use client';

import * as React from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { ChevronDown, Ellipsis, EllipsisVertical, type LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { ActionSheet } from './ActionSheet';
import { prepararMenu, type AccionFila } from './acciones';
import { useEsEscritorio } from './useEsEscritorio';
import { useKitT } from './useIdiomaKit';

/**
 * Menú «⋯» (PATRONES §6 y §11). Un icono lucide por acción; orden
 * ver/editar/duplicar → dominio → divisor → destructivas en rojo. Tope: 8.
 *
 * - Escritorio: menú alineado por el borde derecho del botón, 4 px por debajo
 *   (voltea hacia arriba si no cabe).
 * - Móvil: la misma lista en `ActionSheet` a ancho completo.
 *
 * El clic no llega a la fila ni a la tarjeta: abrir el menú no abre el detalle.
 *
 * Con `etiquetaBoton` el disparador deja de ser «⋯» y pasa a ser un botón
 * secundario de 40 px con texto y chevron («Importar ▾» del PageHeader); el
 * menú y la hoja móvil son los mismos.
 */
export interface RowActionsMenuProps {
  acciones: readonly AccionFila[];
  /** Título de la hoja móvil y parte del nombre accesible: el registro («Ferretería de ejemplo S.A.S.»). */
  titulo?: string;
  /** `vertical` (⋮) en filas y tarjetas; `horizontal` (⋯) en cabeceras. */
  orientacion?: 'vertical' | 'horizontal';
  /** `sm` 32 px (filas) · `md` 40 px (PageHeader, con borde). */
  tamano?: 'sm' | 'md';
  /** Lado preferido; la BulkActionBar abre hacia arriba. */
  lado?: 'top' | 'bottom';
  /** Disparador con texto y chevron en lugar de «⋯» (menús de cabecera: «Importar ▾»). */
  etiquetaBoton?: string;
  /** Icono a la izquierda del texto del disparador. */
  iconoBoton?: LucideIcon;
  className?: string;
}

export function RowActionsMenu({
  acciones,
  titulo,
  orientacion = 'vertical',
  tamano = 'sm',
  lado = 'bottom',
  etiquetaBoton,
  iconoBoton: IconoBoton,
  className,
}: RowActionsMenuProps) {
  const t = useKitT();
  const escritorio = useEsEscritorio();
  const [hojaAbierta, setHojaAbierta] = React.useState(false);
  const entradas = prepararMenu(acciones);
  if (entradas.length === 0) return null;

  const Icono = orientacion === 'vertical' ? EllipsisVertical : Ellipsis;
  const etiqueta = titulo ? t('menu.accionesDe', { titulo }) : t('menu.masAcciones');
  const clasesBoton = etiquetaBoton
    ? cn(
        'inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium text-fg transition-colors hover:bg-hover',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand data-[state=open]:bg-hover',
        className,
      )
    : cn(
        'flex shrink-0 items-center justify-center rounded-lg text-fg-secondary transition-colors hover:bg-hover hover:text-fg',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand data-[state=open]:bg-hover data-[state=open]:text-fg',
        tamano === 'sm' ? 'size-8' : 'size-10 border border-line-strong bg-surface',
        className,
      );
  const detener = (e: React.SyntheticEvent) => e.stopPropagation();
  // Con texto visible, el nombre accesible es el propio texto.
  const nombreAccesible = etiquetaBoton ? undefined : etiqueta;
  const contenidoBoton = etiquetaBoton ? (
    <>
      {IconoBoton && <IconoBoton aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.5} />}
      <span>{etiquetaBoton}</span>
      <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
    </>
  ) : (
    <Icono aria-hidden="true" className={tamano === 'sm' ? 'size-4' : 'size-5'} strokeWidth={1.5} />
  );

  if (!escritorio) {
    return (
      <>
        <button
          type="button"
          aria-label={nombreAccesible}
          aria-haspopup="menu"
          aria-expanded={hojaAbierta}
          className={clasesBoton}
          onClick={(e) => {
            e.stopPropagation();
            setHojaAbierta(true);
          }}
          onKeyDown={detener}
        >
          {contenidoBoton}
        </button>
        <ActionSheet
          abierto={hojaAbierta}
          onAbiertoChange={setHojaAbierta}
          titulo={titulo ?? etiquetaBoton ?? t('comun.acciones')}
          acciones={acciones}
        />
      </>
    );
  }

  return (
    <DropdownMenuPrimitive.Root modal={false}>
      <DropdownMenuPrimitive.Trigger asChild>
        <button type="button" aria-label={nombreAccesible} className={clasesBoton} onClick={detener} onKeyDown={detener}>
          {contenidoBoton}
        </button>
      </DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          align="end"
          side={lado}
          sideOffset={4}
          collisionPadding={8}
          onClick={detener}
          className="z-50 min-w-[180px] max-w-[320px] overflow-hidden rounded-xl border border-line bg-surface p-1 text-fg shadow-lg outline-none"
        >
          {entradas.map((e) =>
            e.tipo === 'separador' ? (
              <DropdownMenuPrimitive.Separator key={e.id} className="-mx-1 my-1 h-px bg-line" />
            ) : (
              <DropdownMenuPrimitive.Item
                key={e.accion.id}
                disabled={e.accion.deshabilitada}
                onSelect={() => e.accion.onSelect()}
                className={cn(
                  'flex min-h-9 cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm outline-none',
                  'data-[highlighted]:bg-hover data-[disabled]:cursor-not-allowed data-[disabled]:opacity-60',
                  e.accion.descripcion && 'items-start py-2',
                  e.accion.destructiva ? 'text-danger-text data-[highlighted]:bg-danger-subtle' : 'text-fg',
                )}
              >
                <e.accion.icono
                  aria-hidden="true"
                  className={cn(
                    'size-4 shrink-0',
                    e.accion.descripcion && 'mt-0.5',
                    e.accion.destructiva ? 'text-danger-text' : 'text-fg-secondary',
                  )}
                  strokeWidth={1.5}
                />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{e.accion.etiqueta}</span>
                  {e.accion.descripcion && (
                    <span className="text-xs leading-4 text-fg-secondary">{e.accion.descripcion}</span>
                  )}
                  {e.accion.deshabilitada && e.accion.motivo && (
                    <span className="text-xs text-fg-muted">{e.accion.motivo}</span>
                  )}
                </span>
              </DropdownMenuPrimitive.Item>
            ),
          )}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}
