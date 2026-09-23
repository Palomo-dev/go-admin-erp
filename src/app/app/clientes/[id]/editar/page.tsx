'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
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
  // Error de carga: clave traducible o texto que devuelve getUserOrganization.
  const [error, setError] = useState<{ clave?: 'sinSesion' | 'sinOrganizacion' | 'carga'; texto?: string } | null>(null);
  const t = useTranslations('clientes.formulario');
  
  const { session, loading: sessionLoading } = useSession();
  
  useEffect(() => {
    async function loadUserOrganization() {
      if (sessionLoading) return;
      
      if (!session || !session.user?.id) {
        setError({ clave: 'sinSesion' });
        setIsLoading(false);
        return;
      }
      
      try {
        const userData = await getUserOrganization(session.user.id);
        
        if (userData.error) {
          setError({ texto: userData.error });
          setIsLoading(false);
          return;
        }
        
        if (!userData.organization?.id) {
          setError({ clave: 'sinOrganizacion' });
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
        setError({ clave: 'carga' });
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
        titulo={t('paginas.editar.titulo')}
        subtitulo={t('paginas.editar.subtitulo')}
        variante="form"
        volverA={`/app/clientes/${clientId}`}
        migas={[
          { etiqueta: t('paginas.migaInicio'), href: '/app/inicio' },
          { etiqueta: t('paginas.migaClientes'), href: '/app/clientes' },
          { etiqueta: t('paginas.editar.migaCliente'), href: `/app/clientes/${clientId}` },
          { etiqueta: t('paginas.editar.migaEditar') },
        ]}
        acciones={
          <Button asChild variant="outline" className="h-10">
            <Link href="/app/clientes">{t('paginas.editar.verLista')}</Link>
          </Button>
        }
      />

      {error ? (
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState
            variante="error"
            titulo={t('paginas.errorOrganizacion.titulo')}
            descripcion={error.clave ? t(`paginas.errores.${error.clave}`) : error.texto}
            accion={{ etiqueta: t('paginas.errorOrganizacion.volver'), href: '/app/clientes' }}
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
