import { redirect } from 'next/navigation';

/** La lista de dispositivos vive en la pestaña Marcación (Figma 20.28). */
export default function Page() {
  redirect('/app/hrm/marcacion?vista=dispositivos');
}
