import { redirect } from 'next/navigation';

export default function Page() {
  redirect('/app/configuracion?modulo=chat&seccion=llaves-api');
}
