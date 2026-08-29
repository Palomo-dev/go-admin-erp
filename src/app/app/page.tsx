import { redirect } from 'next/navigation';

/**
 * /app no tiene contenido propio (solo es el layout con sidebar + header).
 * Redirigir a /app/inicio para evitar pantalla en blanco.
 *
 * Esta redirección es server-side (308) para que sea inmediata y no renderice
 * el AppLayout con contenido vacío.
 */
export default function AppRootPage() {
  redirect('/app/inicio');
}
