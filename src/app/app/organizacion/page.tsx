'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function OrganizacionPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the default organization route (miembros)
    router.replace('/app/organizacion/miembros');
  }, [router]);

  return (
    <div className="p-8">
      <div className="text-center py-10">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"></div>
        <p className="mt-2">Redirigiendo...</p>
      </div>
    </div>
  );
}
