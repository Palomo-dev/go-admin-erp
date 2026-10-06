import { redirect } from 'next/navigation';

/**
 * /app/plan era una segunda pantalla de Plan con su propia carga de
 * organización y su propio «¿es admin?» por `role_id` (auditoría 2026-10, P1-2
 * y P3-2). Queda una sola: Organización › Plan y facturación › Plan. Facturas
 * (/app/plan/billing) y Compras (/app/plan/historial) siguen donde estaban.
 */
export default function PlanPage() {
  redirect('/app/organizacion/plan');
}
