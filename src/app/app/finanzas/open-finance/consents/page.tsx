import { redirect } from 'next/navigation';

// Finanzas, ronda 2 (A5): las autorizaciones son una pestaña de Conectar banco
// (con regreso a «Bancos»). La ruta vieja sigue funcionando: lleva a esa pestaña.
export default function ConsentsPage() {
  redirect('/app/finanzas/open-finance?tab=autorizaciones');
}
