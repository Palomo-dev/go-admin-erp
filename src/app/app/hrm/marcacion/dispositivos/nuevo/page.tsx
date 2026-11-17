import { redirect } from 'next/navigation';

/** El alta de un punto se abre desde Marcación › Dispositivos (Figma 20.28.3). */
export default function Page() {
  redirect('/app/hrm/marcacion?vista=dispositivos&agregar=pantalla_qr');
}
