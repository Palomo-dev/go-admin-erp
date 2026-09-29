import { redirect } from 'next/navigation';

/** Ruta vieja: los tipos viven en la pestaña «Tipos» de /app/inventario/variantes. */
export default function InventarioVariantesTiposPage(): never {
  redirect('/app/inventario/variantes');
}
