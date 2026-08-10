import { redirect } from 'next/navigation';

export default function ConfiguracionPage() {
  redirect('/app/configuracion?modulo=crm');
}
