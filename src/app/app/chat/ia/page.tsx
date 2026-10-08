import { redirect } from 'next/navigation';

/**
 * /app/chat/ia: la configuración de la IA del chat vive en Configuración ›
 * Chat › IA del chat desde 2026-10-07 (su ruta vieja redirige allí). Aquí
 * quedan las pantallas de trabajo de la IA: el laboratorio y los trabajos.
 */
export default function Page() {
  redirect('/app/chat/ia/laboratorio');
}
