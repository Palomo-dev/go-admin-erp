import { redirect } from 'next/navigation';

// Finanzas, ronda 2 (A1): las alertas son una pestaña de Cuentas de dinero.
// La ruta vieja sigue funcionando: lleva a esa pestaña.
export default function AnomaliasPage() {
  redirect('/app/finanzas/bancos?tab=alertas');
}
