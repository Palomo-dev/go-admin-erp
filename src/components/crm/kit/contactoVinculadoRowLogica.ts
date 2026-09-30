/**
 * Lógica de `ContactoVinculadoRow` (Figma 329:109310, sección Clientes; el
 * CRM la reutiliza al vincular persona ↔ empresa). `customer_company_links`:
 * `position` (cargo) e `is_primary` (un solo principal por empresa, M8b).
 * Sin React.
 */
export const MAX_CARGO = 100;

export function cargoNormalizado(texto: string | null | undefined): string | null {
  const t = (texto ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_CARGO);
  return t || null;
}

/** Guardar solo si el cargo cambió de verdad. */
export function cargoCambio(original: string | null | undefined, nuevo: string): boolean {
  return cargoNormalizado(original) !== cargoNormalizado(nuevo);
}

/** Tecla dentro de la edición en línea: Enter guarda y Escape cancela. */
export function accionTeclaCargo(tecla: string): 'guardar' | 'cancelar' | null {
  if (tecla === 'Enter') return 'guardar';
  if (tecla === 'Escape') return 'cancelar';
  return null;
}
