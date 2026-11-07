import { redirect } from 'next/navigation';

/**
 * «Pendientes contables» es la primera pestaña de Salud contable (decisión 3
 * del dueño, 2026-11-07). La ruta vieja se conserva para enlaces guardados y
 * redirige en el servidor; el detalle de cada pendiente
 * (`/contabilidad/pendientes/[id]`) sigue donde estaba.
 */
export default function Page() {
  redirect('/app/finanzas/contabilidad/salud?pestana=pendientes');
}
