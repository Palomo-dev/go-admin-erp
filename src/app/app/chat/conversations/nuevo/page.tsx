import { redirect } from 'next/navigation';

/** Ruta en inglés heredada: la vigente es /app/chat/conversaciones/nueva. */
export default function Page() {
  redirect('/app/chat/conversaciones/nueva');
}
