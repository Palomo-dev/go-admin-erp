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
import { 
  Dialog, 
  DialogContent, 
  DialogDescription,
  DialogFooter, 
  DialogHeader, 
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Cliente = {
  id: string;
  full_name: string;
  email?: string;
  phone?: string;
  organization_id: number;
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
  const [nuevoCliente, setNuevoCliente] = useState<{
    full_name: string;
    email: string;
    phone: string;
  }>({
    full_name: '',
    email: '',
    phone: '',
  });
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
          .select('id, full_name, email, phone, organization_id')
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
        .select('id, full_name, email, phone, organization_id')
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
        .select('id, full_name, email, phone, organization_id')
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
        organization_id: cliente.organization_id || organizationId
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

  // Función para guardar un nuevo cliente
  const handleGuardarCliente = async () => {
    if (!nuevoCliente.full_name.trim()) {
      toast({
        title: "Error",
        description: "El nombre del cliente es obligatorio.",
        variant: "destructive",
      });
      return;
    }
    
    try {
      setIsLoading(true);
      
      const nuevoClienteData = {
        ...nuevoCliente,
        organization_id: organizationId
      };
      
      const { data, error } = await supabase
        .from('customers')
        .insert(nuevoClienteData)
        .select()
        .single();
        
      if (error) throw error;
      
      toast({
        title: "Éxito",
        description: "Cliente creado correctamente.",
      });
      
      // Actualizar lista y seleccionar el nuevo cliente
      await cargarClientes();
      onCustomerChange(data.id);
      
      // Cerrar modal y resetear form
      setIsOpen(false);
      setNuevoCliente({
        full_name: '',
        email: '',
        phone: '',
      });
      
    } catch (error) {
      console.error('Error al crear cliente:', error);
      toast({
        title: "Error",
        description: "No se pudo crear el cliente. Intente nuevamente.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex-grow mr-2">
          <Select
            value={selectedCustomerId?.toString() || ''}
            onValueChange={(value) => onCustomerChange(value || null)}
            disabled={isLoading}
            open={isSelectOpen}
            onOpenChange={setIsSelectOpen}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Buscar cliente">
                {selectedCustomerId ? (
                  // Buscar el cliente en la lista y mostrar su nombre
                  clientes.find(c => c.id === selectedCustomerId)?.full_name || 
                  <span className="italic text-muted-foreground">Cargando cliente...</span>
                ) : null}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <div className="p-2 sticky top-0 bg-background z-10">
                <Input
                  placeholder="Buscar cliente por nombre, email o teléfono"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="mb-2"
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
                {isLoading && (
                  <div className="flex items-center justify-center py-1">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                    <span className="ml-2 text-xs text-muted-foreground">Buscando...</span>
                  </div>
                )}
              </div>
              
              <div className="max-h-[200px] overflow-y-auto">
                {clientesFiltrados.length === 0 ? (
                  <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                    {isLoading ? 'Cargando clientes...' : 'No se encontraron clientes'}
                  </div>
                ) : (
                  clientesFiltrados.map((cliente) => (
                    <SelectItem key={cliente.id} value={cliente.id.toString()}>
                      <div>
                        <div className="font-medium">{cliente.full_name}</div>
                        {cliente.email && <div className="text-xs text-muted-foreground">{cliente.email}</div>}
                      </div>
                    </SelectItem>
                  ))
                )}
              </div>
            </SelectContent>
          </Select>
        </div>
        
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="icon">
              <Plus className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuevo Cliente</DialogTitle>
              <DialogDescription>
                Agregue un nuevo cliente para la factura.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="full_name">Nombre completo</Label>
                <Input
                  id="full_name"
                  value={nuevoCliente.full_name}
                  onChange={(e) => setNuevoCliente({...nuevoCliente, full_name: e.target.value})}
                  placeholder="Nombre y apellido"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={nuevoCliente.email}
                  onChange={(e) => setNuevoCliente({...nuevoCliente, email: e.target.value})}
                  placeholder="correo@ejemplo.com"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="phone">Teléfono</Label>
                <Input
                  id="phone"
                  value={nuevoCliente.phone}
                  onChange={(e) => setNuevoCliente({...nuevoCliente, phone: e.target.value})}
                  placeholder="123456789"
                />
              </div>
            </div>
            
            <DialogFooter>
              <Button
                onClick={handleGuardarCliente}
                disabled={isLoading}
              >
                {isLoading ? 'Guardando...' : 'Guardar Cliente'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
