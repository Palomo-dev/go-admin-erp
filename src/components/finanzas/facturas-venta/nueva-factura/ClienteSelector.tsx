'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { toast } from '@/components/ui/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ClienteFormDialog } from '@/components/shared/form-dialogs';

type Cliente = {
  id: string;
  full_name: string;
  email?: string;
  phone?: string;
  organization_id: number;
  customer_type?: string;
  first_name?: string;
  last_name?: string;
};

type ClienteSelectorProps = {
  selectedCustomerId: string | null;
  onCustomerChange: (customerId: string | null) => void;
};

export function ClienteSelector({ selectedCustomerId, onCustomerChange }: ClienteSelectorProps) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clientesFiltrados, setClientesFiltrados] = useState<Cliente[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isSelectOpen, setIsSelectOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const organizationId = getOrganizationId();
  
  // Cargar clientes al iniciar
  useEffect(() => {
    if (organizationId) {
      cargarClientes();
    }
  }, [organizationId]);

  // Buscar clientes en Supabase basado en término de búsqueda
  useEffect(() => {
    const buscarClientes = async () => {
      if (!organizationId) return;
      
      // Si no hay término de búsqueda, mostramos todos los clientes
      if (searchTerm.trim() === '') {
        setClientesFiltrados(clientes);
        return;
      }
      
      // Establecemos estado de carga
      setIsLoading(true);
      
      try {
        const termino = `%${searchTerm.toLowerCase()}%`;
        
        const { data, error } = await supabase
          .from('customers')
          .select('id, full_name, email, phone, organization_id, customer_type, first_name, last_name')
          .eq('organization_id', organizationId)
          .or(`full_name.ilike.${termino},email.ilike.${termino},phone.ilike.${termino}`)
          .order('full_name', { ascending: true })
          .limit(50); // Limitamos a 50 resultados para evitar sobrecarga
        
        if (error) throw error;
        
        // Formatear los resultados
        const clientesFormateados: Cliente[] = (data || []).map(cliente => ({
          id: cliente.id,
          full_name: cliente.full_name,
          email: cliente.email,
          phone: cliente.phone,
          organization_id: cliente.organization_id || organizationId
        }));
        
        setClientesFiltrados(clientesFormateados);
      } catch (error) {
        console.error('Error al buscar clientes:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    // Usamos debounce para evitar demasiadas consultas
    const timeoutId = setTimeout(() => {
      buscarClientes();
    }, 300);
    
    return () => clearTimeout(timeoutId);
  }, [searchTerm, organizationId]);
  
  // Cargar un cliente específico si es necesario
  const cargarClienteSeleccionado = async () => {
    if (!selectedCustomerId) return;
    
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('id, full_name, email, phone, organization_id, customer_type, first_name, last_name')
        .eq('id', selectedCustomerId)
        .single();
      
      if (error) throw error;
      
      if (data) {
        // Agregar a la lista sin duplicados
        setClientes(prev => {
          // Si ya existe, actualizar para asegurar datos frescos
          const clienteExiste = prev.some(c => c.id === data.id);
          if (clienteExiste) {
            return prev.map(c => c.id === data.id ? data : c);
          }
          // Si no existe, agregar a la lista
          return [...prev, data];
        });
      }
    } catch (error) {
      console.error('Error al cargar cliente seleccionado:', error);
      toast({
        title: "Error",
        description: "No se pudo cargar la información del cliente seleccionado.",
        variant: "destructive",
      });
    }
  };

  // Función para cargar clientes
  const cargarClientes = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('customers')
        .select('id, full_name, email, phone, organization_id, customer_type, first_name, last_name')
        .eq('organization_id', organizationId)
        .order('full_name', { ascending: true })
        .limit(100); // Limitamos la carga inicial a 100 clientes para mejor rendimiento
        
      if (error) throw error;
      
      // Aseguramos que todos los clientes tengan el campo organization_id
      const clientesFormateados: Cliente[] = (data || []).map(cliente => ({
        id: cliente.id,
        full_name: cliente.full_name,
        email: cliente.email,
        phone: cliente.phone,
        organization_id: cliente.organization_id || organizationId,
        customer_type: cliente.customer_type,
        first_name: cliente.first_name,
        last_name: cliente.last_name
      }));
      
      setClientes(clientesFormateados);
      setClientesFiltrados(clientesFormateados);
    } catch (error) {
      console.error('Error al cargar clientes:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los clientes. Intente nuevamente.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  // Cargar cliente seleccionado si no está en la lista
  useEffect(() => {
    if (selectedCustomerId && clientes.length > 0 && !clientes.some(c => c.id === selectedCustomerId)) {
      cargarClienteSeleccionado();
    }
  }, [selectedCustomerId, clientes]);

  // Asegurar que siempre se cargue el cliente seleccionado
  useEffect(() => {
    if (selectedCustomerId) {
      cargarClienteSeleccionado();
    }
  }, [selectedCustomerId]);

  // Cuando el diálogo compartido crea un cliente, refrescar lista y seleccionarlo
  const handleClienteCreado = async (customer: any) => {
    await cargarClientes();
    if (customer?.id) onCustomerChange(customer.id);
  };
  
  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex gap-2">
        <div className="flex-grow">
          <Select
            value={selectedCustomerId?.toString() || ''}
            onValueChange={(value) => onCustomerChange(value || null)}
            disabled={isLoading}
            open={isSelectOpen}
            onOpenChange={setIsSelectOpen}
          >
            <SelectTrigger className="
              w-full text-sm
              bg-white dark:bg-gray-900
              border-gray-300 dark:border-gray-600
              text-gray-900 dark:text-gray-100
            ">
              <SelectValue placeholder="Buscar cliente">
                {selectedCustomerId ? (
                  clientes.find(c => c.id === selectedCustomerId)?.full_name || 
                  <span className="italic text-gray-500 dark:text-gray-400">Cargando cliente...</span>
                ) : null}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <div className="p-2 sticky top-0 bg-white dark:bg-gray-800 z-10">
                <Input
                  placeholder="Buscar cliente por nombre, email o teléfono"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="
                    mb-2 text-sm
                    bg-white dark:bg-gray-900
                    border-gray-300 dark:border-gray-600
                    text-gray-900 dark:text-gray-100
                    placeholder:text-gray-500 dark:placeholder:text-gray-400
                  "
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
                {isLoading && (
                  <div className="flex items-center justify-center py-1">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 dark:border-blue-400 border-t-transparent"></div>
                    <span className="ml-2 text-xs text-gray-600 dark:text-gray-400">Buscando...</span>
                  </div>
                )}
              </div>
              
              <div className="max-h-[200px] overflow-y-auto">
                {clientesFiltrados.length === 0 ? (
                  <div className="px-2 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                    {isLoading ? 'Cargando clientes...' : 'No se encontraron clientes'}
                  </div>
                ) : (
                  clientesFiltrados.map((cliente) => (
                    <SelectItem key={cliente.id} value={cliente.id.toString()} className="text-gray-900 dark:text-gray-100">
                      <div>
                        <div className="font-medium text-sm">{cliente.full_name}</div>
                        {cliente.customer_type === 'company' && (cliente.first_name || cliente.last_name) && (
                          <div className="text-xs text-gray-500 dark:text-gray-400">Contacto: {`${cliente.first_name || ''} ${cliente.last_name || ''}`.trim()}</div>
                        )}
                        {cliente.email && <div className="text-xs text-gray-600 dark:text-gray-400">{cliente.email}</div>}
                      </div>
                    </SelectItem>
                  ))
                )}
              </div>
            </SelectContent>
          </Select>
        </div>
        
        <Button 
          type="button"
          variant="outline" 
          size="sm"
          onClick={() => setIsOpen(true)}
          className="
            flex-shrink-0 h-9 w-9 sm:h-10 sm:w-10 p-0
            bg-white dark:bg-gray-800
            border-gray-300 dark:border-gray-600
            hover:bg-gray-50 dark:hover:bg-gray-700
            text-gray-700 dark:text-gray-200
          "
        >
          <Plus className="h-4 w-4" />
        </Button>

        {/* Diálogo compartido: reutiliza el formulario COMPLETO de cliente */}
        {organizationId && (
          <ClienteFormDialog
            open={isOpen}
            onOpenChange={setIsOpen}
            organizationId={organizationId}
            onCreated={handleClienteCreado}
          />
        )}
      </div>
      
      {/* Mostrar información del cliente seleccionado */}
      {selectedCustomerId && (
        <div className="text-sm space-y-1">
          {clientes.filter(c => c.id === selectedCustomerId).map((cliente) => (
            <div key={cliente.id}>
              <p className="font-medium">{cliente.full_name}</p>
              {cliente.email && <p className="text-gray-600 dark:text-gray-400">Email: {cliente.email}</p>}
              {cliente.phone && <p className="text-gray-600 dark:text-gray-400">Teléfono: {cliente.phone}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
