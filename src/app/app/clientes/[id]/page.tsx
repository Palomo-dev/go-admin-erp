'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/lib/supabase/config';
import { formatCurrency } from '@/utils/Utils';
import { ArrowLeft, User, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
      <div className="flex flex-col items-center justify-center min-h-[400px] bg-gray-50 dark:bg-gray-900">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Cargando perfil del cliente...</p>
      </div>
    );
  }
  
  if (error || !cliente) {
    return (
      <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <div className="flex items-center gap-3">
          <Link href="/app/clientes">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Cliente no encontrado</h1>
        </div>
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 text-center">
          <p className="text-red-600 dark:text-red-400 mb-4">{error || 'No se pudo encontrar el cliente solicitado'}</p>
          <Link href="/app/clientes">
            <Button variant="outline" className="border-red-300 text-red-700">
              Volver a clientes
            </Button>
          </Link>
        </div>
      </div>
    );
  }
  
  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header con botón volver */}
      <div className="flex items-center gap-3">
        <Link href="/app/clientes">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <User className="h-7 w-7 text-blue-600" />
            {cliente.full_name}
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Clientes / Perfil
          </p>
        </div>
      </div>

      {/* Header del perfil del cliente */}
      <ClienteHeader cliente={cliente} />
      
      {/* Contenido principal con pestañas y barra lateral */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sección principal con pestañas */}
        <div className="col-span-1 lg:col-span-2">
          <Tabs defaultValue="resumen" className="w-full">
            <TabsList className="mb-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-1 rounded-lg">
              <TabsTrigger value="resumen" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">Resumen</TabsTrigger>
              <TabsTrigger value="info" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">Información</TabsTrigger>
              <TabsTrigger value="timeline" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">Timeline</TabsTrigger>
              <TabsTrigger value="cuentas" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">Cuentas por cobrar</TabsTrigger>
              <TabsTrigger value="notas" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">Notas y archivos</TabsTrigger>
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
