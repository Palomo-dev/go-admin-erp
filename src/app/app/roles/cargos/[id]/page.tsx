'use client';

/** Editor de lo que suma un cargo (Figma «13. Equipo › Roles y permisos», «Editar cargo»). */
import { useParams } from 'next/navigation';
import { EditorCargo } from '@/components/roles/EditorCargo';

export default function CargoPermisosPage() {
  const params = useParams<{ id: string }>();
  return <EditorCargo id={String(params?.id ?? '')} />;
}
