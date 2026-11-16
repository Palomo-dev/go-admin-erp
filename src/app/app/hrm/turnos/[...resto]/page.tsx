import { redirect } from 'next/navigation';

/**
 * Las páginas viejas de un turno (detalle, editar, nuevo, importar y tipos)
 * se reemplazaron por la programación semanal (Figma 20.8): cada turno se
 * edita desde su bloque. Cualquier enlace viejo llega a la programación.
 */
export default function Page() {
  redirect('/app/hrm/turnos');
}
