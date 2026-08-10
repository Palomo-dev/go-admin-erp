import { redirect } from 'next/navigation';

export default function POSConfiguracionPage() {
  redirect('/app/configuracion?modulo=pos');
}
