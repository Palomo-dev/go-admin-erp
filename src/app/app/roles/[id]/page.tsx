'use client';

/**
 * Editor de un rol (Figma «13. Equipo › Roles y permisos», «Editar rol»). Un id
 * que no es un entero llega como 0 y el servidor responde 404 («no encontrado»).
 */
import { useParams } from 'next/navigation';
import { EditorRol } from '@/components/roles/EditorRol';

export default function RolPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params?.id);
  return <EditorRol id={Number.isInteger(id) && id > 0 ? id : 0} />;
}
