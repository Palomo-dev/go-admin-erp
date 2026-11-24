'use client';

import { useParams } from 'next/navigation';
import { EditorListaPrecios } from '@/components/listasPrecios/EditorListaPrecios';

export default function Page() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === 'string' ? params.id : '';
  return <EditorListaPrecios key={id} id={id} />;
}
