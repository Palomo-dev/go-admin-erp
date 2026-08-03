"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, Suspense } from "react";

export const dynamic = 'force-dynamic';

function EditOpportunityRedirect() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = searchParams.get("id");

  useEffect(() => {
    if (id) {
      router.replace(`/app/crm/oportunidades/${id}/editar`);
    } else {
      router.replace('/app/crm/pipeline');
    }
  }, [id, router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-gray-500 dark:text-gray-400">Redirigiendo...</p>
    </div>
  );
}

export default function EditOpportunityPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500 dark:text-gray-400">Cargando...</p>
      </div>
    }>
      <EditOpportunityRedirect />
    </Suspense>
  );
}
