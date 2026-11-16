import { redirect } from 'next/navigation';

/** Ruta vieja (fase 2, Figma 20.13 y 20.14): los saldos se ven al solicitar y en «Saldo después» de Solicitudes. */
export default function Page() {
  redirect('/app/hrm/ausencias?vista=solicitudes');
}
