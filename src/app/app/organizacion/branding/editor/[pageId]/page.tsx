'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

// Redirige a la nueva ruta del editor visual (fuera del AppLayout)
export default function PageEditorRedirect() {
  const params = useParams();
  const router = useRouter();
  const pageId = params.pageId as string;

  useEffect(() => {
    router.replace(`/organizacion/branding/editor/${pageId}`);
  }, [pageId, router]);

  return (
    <div className="flex items-center justify-center h-64">
      <p className="text-sm text-gray-500">Redirigiendo al editor...</p>
    </div>
  );
}
