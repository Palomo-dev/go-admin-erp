import { INICIALES_PASARELA, NOMBRE_PASARELA, type Pasarela } from '@/lib/pos/pedidosWeb/pagosDelPedido';

/** Chip con las iniciales de la pasarela (no hay logos en el repositorio). */
export function ChipPasarela({ pasarela }: { pasarela: Pasarela }) {
  return (
    <span
      aria-hidden="true"
      title={NOMBRE_PASARELA[pasarela]}
      className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md bg-brand-tint px-1 text-[10px] font-semibold leading-none text-brand-deep"
    >
      {INICIALES_PASARELA[pasarela]}
    </span>
  );
}
