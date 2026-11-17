import { redirect } from 'next/navigation';

/** En M0 los puntos no se editan: se activan, desactivan o regeneran desde Marcación › Dispositivos. */
export default function Page() {
  redirect('/app/hrm/marcacion?vista=dispositivos');
}
