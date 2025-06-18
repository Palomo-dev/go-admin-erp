'use client';

import { useEffect, useState } from 'react';
import { useSession } from '@/lib/hooks/useSession';
import { getUserOrganization } from '@/lib/supabase/config';
import { ClientForm } from '@/components/clientes/new/ClientForm';
import LoadingSpinner from '@/components/ui/loading-spinner';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

export default function NewClientPage() {
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
          const mainBranch = userData.branches.find(branch => branch.is_main);
          if (mainBranch) {
            setBranchId(mainBranch.id);
          } else {
            // Si no hay sucursal principal, usamos la primera
            setBranchId(userData.branches[0].id);
          }
        }
        
        setIsLoading(false);
      } catch (err: any) {
        console.error('Error cargando datos de organización:', err);
        setError('Error al cargar la información de tu organización');
        setIsLoading(false);
      }
    }
    
    loadUserOrganization();
  }, [session, sessionLoading]);
  
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center mb-2">
            <Link href="/app/clientes" className="inline-flex items-center text-blue-500 hover:text-blue-700 mr-2">
              <ChevronLeft className="h-4 w-4 mr-1" />
              <span>Volver</span>
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Crear Nuevo Cliente</h1>
          <p className="text-gray-600 dark:text-gray-300 mt-1">
            Registra un nuevo cliente en el sistema con toda su información.
          </p>
        </div>
      </div>
      
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <LoadingSpinner />
          <span className="ml-2 text-gray-600 dark:text-gray-400">Cargando...</span>
        </div>
      ) : error ? (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 p-4 rounded-md">
          <h3 className="text-lg font-medium mb-2">Error</h3>
          <p>{error}</p>
          <div className="mt-4">
            <Link href="/app/clientes" className="text-red-700 dark:text-red-300 hover:underline">
              Volver a la lista de clientes
            </Link>
          </div>
        </div>
      ) : organizationId ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="p-6">
            <ClientForm organizationId={organizationId} branchId={branchId || undefined} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
