'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, PageHeader } from '@/components/kit';
import { ClientForm } from '@/components/clientes/new/ClientForm';
import { useSession } from '@/lib/hooks/useSession';
import { getUserOrganization } from '@/lib/supabase/config';

export default function EditarClientePage() {
  const params = useParams();
  const clientId = params?.id as string;
  
  const [organizationId, setOrganizationId] = useState<number | null>(null);
  const [branchId, setBranchId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  
  const { session, loading: sessionLoading } = useSession();
  
  useEffect(() => {
    async function loadUserOrganization() {
      if (sessionLoading) return;
      
      if (!session || !session.user?.id) {
        setError('No hay sesión activa. Por favor inicie sesión para continuar.');
        setIsLoading(false);
        return;
      }
      
      try {
        const userData = await getUserOrganization(session.user.id);
        
        if (userData.error) {
          setError(userData.error);
          setIsLoading(false);
          return;
        }
        
        if (!userData.organization?.id) {
          setError('No se encontró una organización asociada a tu cuenta.');
          setIsLoading(false);
          return;
        }
        
        setOrganizationId(userData.organization.id);
        
        // Si hay sucursales y hay una marcada como principal
        if (userData.branches && userData.branches.length > 0) {
          const mainBranch = userData.branches.find((branch: { is_main?: boolean }) => branch.is_main);
          if (mainBranch) {
            setBranchId(mainBranch.id);
          } else {
            setBranchId(userData.branches[0].id);
          }
        }
        
        setIsLoading(false);
      } catch (err) {
        console.error('Error cargando organización:', err);
        setError('Error al cargar la información de tu organización');
        setIsLoading(false);
      }
    }
    
    loadUserOrganization();
  }, [session, sessionLoading]);
  
  if (isLoading) {
    return (
      <div className="flex min-h-full flex-col gap-4 bg-canvas p-4 lg:gap-6 lg:p-6" aria-busy="true">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col gap-4 bg-canvas p-4 lg:gap-6 lg:p-6">
      <PageHeader
        titulo="Editar cliente"
        subtitulo="Modifica la información del cliente"
        variante="form"
        volverA={`/app/clientes/${clientId}`}
        migas={[
          { etiqueta: 'Inicio', href: '/app/inicio' },
          { etiqueta: 'Clientes', href: '/app/clientes' },
          { etiqueta: 'Cliente', href: `/app/clientes/${clientId}` },
          { etiqueta: 'Editar' },
        ]}
        acciones={
          <Button asChild variant="outline" className="h-10">
            <Link href="/app/clientes">Ver lista de clientes</Link>
          </Button>
        }
      />

      {error ? (
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState
            variante="error"
            titulo="No pudimos cargar tu organización"
            descripcion={error}
            accion={{ etiqueta: 'Volver a clientes', href: '/app/clientes' }}
          />
        </div>
      ) : organizationId ? (
        <ClientForm
          organizationId={organizationId}
          branchId={branchId || undefined}
          clientId={clientId}
          mode="edit"
        />
      ) : null}
    </div>
  );
}
