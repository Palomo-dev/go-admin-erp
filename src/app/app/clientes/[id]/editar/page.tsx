'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, UserCog, User, Phone, Tag } from 'lucide-react';
import Link from 'next/link';
import { ClientForm } from '@/components/clientes/new/ClientForm';
import { useSession } from '@/lib/hooks/useSession';
import { getUserOrganization } from '@/lib/supabase/config';

export default function EditarClientePage() {
  const params = useParams();
  const router = useRouter();
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
          const mainBranch = userData.branches.find((branch: any) => branch.is_main);
          if (mainBranch) {
            setBranchId(mainBranch.id);
          } else {
            setBranchId(userData.branches[0].id);
          }
        }
        
        setIsLoading(false);
      } catch (err: any) {
        console.error('Error cargando organización:', err);
        setError('Error al cargar la información de tu organización');
        setIsLoading(false);
      }
    }
    
    loadUserOrganization();
  }, [session, sessionLoading]);
  
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] bg-gray-50 dark:bg-gray-900">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Cargando...</p>
      </div>
    );
  }
  
  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header mejorado */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href={`/app/clientes/${clientId}`}>
            <Button 
              variant="outline" 
              size="icon" 
              className="h-10 w-10 rounded-lg border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-lg">
                <UserCog className="h-6 w-6 text-amber-600 dark:text-amber-400" />
              </div>
              Editar Cliente
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Modifica la información del cliente
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          asChild
          className="border-gray-200 dark:border-gray-700"
        >
          <Link href="/app/clientes">
            Ver Lista de Clientes
          </Link>
        </Button>
      </div>
      
      {/* Indicadores de pasos - igual que en nuevo cliente */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/40 rounded-lg">
              <User className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Paso 1</p>
              <p className="text-sm font-medium text-gray-900 dark:text-white">Datos Personales</p>
            </div>
          </div>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-900/40 rounded-lg">
              <Phone className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Paso 2</p>
              <p className="text-sm font-medium text-gray-900 dark:text-white">Contacto y Dirección</p>
            </div>
          </div>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/40 rounded-lg">
              <Tag className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Paso 3</p>
              <p className="text-sm font-medium text-gray-900 dark:text-white">Info Adicional</p>
            </div>
          </div>
        </Card>
      </div>
      
      {/* Formulario */}
      {error ? (
        <Card className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 p-6">
          <p className="font-medium text-red-700 dark:text-red-300 mb-2">Error</p>
          <p className="text-sm text-red-600 dark:text-red-400 mb-4">{error}</p>
          <Link href="/app/clientes">
            <Button variant="outline" size="sm" className="border-red-300 text-red-700">
              Volver a clientes
            </Button>
          </Link>
        </Card>
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
