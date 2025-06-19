'use client';

import { Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import EditClientForm from '@/components/clientes/editar/EditClientForm';

export default function EditarClientePage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params?.id as string;
  
  // En un caso real deberíamos obtener estos valores de algún servicio o contexto
  const organizationId = 1; // ID de ejemplo
  
  return (
    <div className="container py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-4">
        <h1 className="text-2xl font-bold tracking-tight">Editar Cliente</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.back()}
            className="flex items-center gap-1"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Button>
          <Button
            variant="outline"
            size="sm"
            asChild
          >
            <Link href="/app/clientes" className="flex items-center gap-1">
              Lista de Clientes
            </Link>
          </Button>
        </div>
      </div>
      
      <Suspense fallback={
        <Card>
          <CardContent className="flex items-center justify-center min-h-[300px]">
            <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
            <span className="ml-2">Cargando...</span>
          </CardContent>
        </Card>
      }>
        <EditClientForm 
          clientId={clientId} 
          organizationId={organizationId}
        />
      </Suspense>
    </div>
  );
}
