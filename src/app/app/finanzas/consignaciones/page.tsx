import { permanentRedirect } from 'next/navigation';

/** Consignaciones se mudó a Inventario (decisión del dueño 2026-11-07): la ruta vieja redirige. */
export default function Page() {
  permanentRedirect('/app/inventario/consignaciones');
}
