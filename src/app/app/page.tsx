import { redirect } from 'next/navigation';

// La ruta raíz /app no tiene contenido propio: siempre debe redirigir
// al dashboard principal en /app/inicio.
export default function AppRootPage() {
  redirect('/app/inicio');
}
