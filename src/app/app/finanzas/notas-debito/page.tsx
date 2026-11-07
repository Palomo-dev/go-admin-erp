import { redirect } from 'next/navigation';

/** Las notas débito viven en la pestaña «Débito» del listado único de notas. */
export default function NotasDebitoPage() {
  redirect('/app/finanzas/notas-credito?tipo=debito');
}
