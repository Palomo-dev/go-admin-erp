'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/lib/supabase/config';
import { formatCurrency } from '@/utils/Utils';

// Importamos los componentes del perfil del cliente
import ClienteHeader from '@/components/clientes/id/ClienteHeader';
import ResumenTab from '@/components/clientes/id/ResumenTab';
import TimelineTab from '@/components/clientes/id/TimelineTab';
import CuentasTab from '@/components/clientes/id/CuentasTab';
import NotasArchivosTab from '@/components/clientes/id/NotasArchivosTab';
import TareasSidebar from '@/components/clientes/id/TareasSidebar';
import InfoTab from '@/components/clientes/id/InfoTab';

// Interfaz para los datos del cliente
interface Cliente {
  id: string;
  organization_id: number;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  notes: string;
  tags: string[];
  preferences: any;
  created_at: string;
  updated_at: string;
  avatar_url?: string | null;
}

export default function PerfilCliente() {
  const { id } = useParams();
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Cargar datos del cliente
  useEffect(() => {
    const fetchCliente = async () => {
      try {
        setLoading(true);
        setError(null);
        
        if (!id) {
          setError('ID de cliente no encontrado');
          return;
        }
        
        const { data, error } = await supabase
          .from('customers')
          .select('*, avatar_url')
          .eq('id', id)
          .single();
          
        if (error) {
          throw error;
        }
        
        if (!data) {
          setError('Cliente no encontrado');
          return;
        }
        
        setCliente(data);
      } catch (err: any) {
        console.error('Error al cargar datos del cliente:', err);
        setError(err.message || 'Error al cargar datos del cliente');
      } finally {
        setLoading(false);
      }
    };
    
    fetchCliente();
  }, [id]);
  
  if (loading) {
    return (
      <div className="w-full h-96 flex justify-center items-center">
        <div className="flex flex-col items-center">
          <div className="loading loading-spinner loading-lg text-primary mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Cargando información del cliente...</p>
        </div>
      </div>
    );
  }
  
  if (error || !cliente) {
    return (
      <div className="w-full h-96 flex justify-center items-center">
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <p className="text-red-500 font-medium mb-2">Error al cargar el cliente</p>
          <p className="text-gray-600 dark:text-gray-400 text-center">{error || 'No se pudo encontrar el cliente solicitado'}</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto py-6 px-4">
      {/* Header del perfil del cliente */}
      <ClienteHeader cliente={cliente} />
      
      {/* Contenido principal con pestañas y barra lateral */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sección principal con pestañas */}
        <div className="col-span-1 lg:col-span-2">
          <Tabs defaultValue="resumen" className="w-full">
            <TabsList className="mb-6">
              <TabsTrigger value="resumen">Resumen</TabsTrigger>
              <TabsTrigger value="info">Información</TabsTrigger>
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
              <TabsTrigger value="cuentas">Cuentas por cobrar</TabsTrigger>
              <TabsTrigger value="notas">Notas y archivos</TabsTrigger>
            </TabsList>
            
            <TabsContent value="resumen">
              <ResumenTab clienteId={cliente.id} organizationId={cliente.organization_id} />
            </TabsContent>
            
            <TabsContent value="info">
              <InfoTab clienteId={cliente.id} organizationId={cliente.organization_id} />
            </TabsContent>
            
            <TabsContent value="timeline">
              <TimelineTab clienteId={cliente.id} organizationId={cliente.organization_id} />
            </TabsContent>
            
            <TabsContent value="cuentas">
              <CuentasTab clienteId={cliente.id} organizationId={cliente.organization_id} />
            </TabsContent>
            
            <TabsContent value="notas">
              <NotasArchivosTab clienteId={cliente.id} organizationId={cliente.organization_id} />
            </TabsContent>
          </Tabs>
        </div>
        
        {/* Barra lateral con tareas pendientes */}
        <div className="col-span-1 lg:col-span-1">
          <TareasSidebar clienteId={cliente.id} organizationId={cliente.organization_id} />
        </div>
      </div>
    </div>
  );
}
