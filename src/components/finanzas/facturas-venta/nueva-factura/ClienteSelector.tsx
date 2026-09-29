'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { supabase } from '@/lib/supabase/config';
import { buscarClientes as buscarClientesServidor } from '@/lib/services/customers/busquedaClientesService';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { toastError } from '@/components/ui/use-toast';
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
  avatar_url?: string | null;
  primary_contact_name?: string | null;
  primary_contact_position?: string | null;
};

/** Vínculo empresa → persona de contacto (`customer_company_links`). */
type VinculoContacto = {
  company_id: string;
  position: string | null;
  person: { first_name: string | null; last_name: string | null } | null;
};

type ClienteSelectorProps = {
  selectedCustomerId: string | null;
  onCustomerChange: (customerId: string | null) => void;
};

export function ClienteSelector({ selectedCustomerId, onCustomerChange }: ClienteSelectorProps) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [searchResults, setSearchResults] = useState<Cliente[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const organizationId = getOrganizationId();
  const loadingSelectedRef = useRef<string | null>(null);
  const t = useTranslations('facturasVenta');
  
  // Cargar clientes al iniciar
  useEffect(() => {
    if (organizationId) {
      cargarClientes();
    }
    // Solo al cambiar de organización: cargarClientes se redefine en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  // Resultados derivados: si no hay búsqueda, mostrar todos; si hay, mostrar resultados de búsqueda
  const clientesFiltrados = useMemo(() => {
    if (searchTerm.trim() === '') return clientes;
    return searchResults;
  }, [searchTerm, clientes, searchResults]);

  // Buscar clientes en Supabase basado en término de búsqueda
  useEffect(() => {
    if (searchTerm.trim() === '') {
      setSearchResults([]);
      return;
    }

    const buscarClientes = async () => {
      if (!organizationId) return;
      
      setIsLoading(true);
      
      try {
        // Búsqueda única de clientes (RPC): sin tildes, todas las palabras, dígitos.
        const { filas: data } = await buscarClientesServidor(supabase, { organizationId, texto: searchTerm, limite: 50 });

        // Obtener contactos principales para empresas
        const companyResults = (data || []).filter((c: { customer_type?: string | null }) => c.customer_type === 'company');
        const contactMap = new Map<string, { name: string; position: string | null }>();
        if (companyResults.length > 0) {
          const companyIds = companyResults.map((c: { id: string }) => c.id);
          const { data: links } = await supabase
            .from('customer_company_links')
            .select(`
              company_id,
              is_primary,
              position,
              person:customers!customer_company_links_person_id_fkey(first_name, last_name)
            `)
            .in('company_id', companyIds)
            .order('is_primary', { ascending: false });

          if (links) {
            for (const link of links as unknown as VinculoContacto[]) {
              if (!contactMap.has(link.company_id)) {
                const person = link.person;
                if (person) {
                  contactMap.set(link.company_id, {
                    name: `${person.first_name || ''} ${person.last_name || ''}`.trim(),
                    position: link.position || null,
                  });
                }
              }
            }
          }
        }
        
        // Formatear los resultados
        const clientesFormateados: Cliente[] = (data || []).map(cliente => {
          const contact = contactMap.get(cliente.id);
          return {
            id: cliente.id,
            full_name: cliente.full_name ?? '',
            email: cliente.email ?? undefined,
            phone: cliente.phone ?? undefined,
            organization_id: cliente.organization_id || organizationId,
            customer_type: cliente.customer_type ?? undefined,
            avatar_url: cliente.avatar_url,
            primary_contact_name: contact?.name || null,
            primary_contact_position: contact?.position || null,
          };
        });
        
        setSearchResults(clientesFormateados);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, organizationId]);
  
  // Cargar un cliente específico si es necesario
  const cargarClienteSeleccionado = useCallback(async () => {
    if (!selectedCustomerId) return;
    
    // Prevenir llamadas duplicadas con ref
    if (loadingSelectedRef.current === selectedCustomerId) return;
    loadingSelectedRef.current = selectedCustomerId;
    
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('id, full_name, email, phone, organization_id, customer_type, first_name, last_name, avatar_url')
        .eq('id', selectedCustomerId)
        .single();
      
      if (error) throw error;
      
      if (data) {
        // Agregar a la lista sin duplicados
        setClientes(prev => {
          const clienteExiste = prev.some(c => c.id === data.id);
          if (clienteExiste) {
            return prev; // Misma referencia, React bail out
          }
          return [...prev, data];
        });
      }
    } catch (error) {
      console.error('Error al cargar cliente seleccionado:', error);
      toastError(t('comun.error'), t('clienteSelector.errorCliente'));
    } finally {
      loadingSelectedRef.current = null;
    }
  }, [selectedCustomerId, t]);

  // Función para cargar clientes
  const cargarClientes = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('customers')
        .select('id, full_name, email, phone, organization_id, customer_type, first_name, last_name, avatar_url')
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
        last_name: cliente.last_name,
        avatar_url: cliente.avatar_url
      }));
      
      setClientes(clientesFormateados);
    } catch (error) {
      console.error('Error al cargar clientes:', error);
      toastError(t('comun.error'), t('clienteSelector.errorClientes'));
    } finally {
      setIsLoading(false);
    }
  };
  
  // Cargar cliente seleccionado si no está en la lista
  useEffect(() => {
    if (selectedCustomerId) {
      cargarClienteSeleccionado();
    }
  }, [selectedCustomerId, cargarClienteSeleccionado]);

  // Cuando el diálogo compartido crea un cliente, refrescar lista y seleccionarlo
  const handleClienteCreado = async (customer: { id?: string } | null) => {
    await cargarClientes();
    if (customer?.id) onCustomerChange(customer.id);
  };
  
  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex gap-2">
        <div className="flex-grow">
          <Select
            value={selectedCustomerId?.toString() || undefined}
            onValueChange={(value) => onCustomerChange(value || null)}
            disabled={isLoading}
          >
            <SelectTrigger className="
              w-full text-sm
              bg-white dark:bg-gray-900
              border-gray-300 dark:border-gray-600
              text-gray-900 dark:text-gray-100
            ">
              <SelectValue placeholder={t('clienteSelector.buscar')} />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <div className="p-2 sticky top-0 bg-white dark:bg-gray-800 z-10">
                <Input
                  placeholder={t('clienteSelector.buscarPlaceholder')}
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
                    <span className="ml-2 text-xs text-gray-600 dark:text-gray-400">{t('clienteSelector.buscando')}</span>
                  </div>
                )}
              </div>
              
              <div className="max-h-[200px] overflow-y-auto">
                {clientesFiltrados.length === 0 ? (
                  <div className="px-2 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                    {isLoading ? t('clienteSelector.cargando') : t('clienteSelector.sinResultados')}
                  </div>
                ) : (
                  clientesFiltrados.map((cliente) => (
                    <SelectItem key={cliente.id} value={cliente.id.toString()} className="text-gray-900 dark:text-gray-100">
                      <div className="flex items-center gap-2">
                        <div className="flex-shrink-0">
                          {cliente.avatar_url ? (
                            // Avatar de Supabase Storage con tamaño fijo: next/image no aporta aquí.
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={cliente.avatar_url}
                              alt={cliente.full_name}
                              className="h-8 w-8 rounded-full object-cover border border-gray-200 dark:border-gray-600"
                            />
                          ) : (
                            <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center border border-blue-200 dark:border-blue-800">
                              <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                                {cliente.full_name?.charAt(0)?.toUpperCase() || '?'}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-sm">{cliente.full_name}</div>
                          {cliente.customer_type === 'company' && cliente.primary_contact_name && (
                            <div className="text-xs text-gray-500 dark:text-gray-400">{cliente.primary_contact_position ? t('clienteSelector.contactoCargo', { nombre: cliente.primary_contact_name, cargo: cliente.primary_contact_position }) : t('clienteSelector.contacto', { nombre: cliente.primary_contact_name })}</div>
                          )}
                          {cliente.email && <div className="text-xs text-gray-600 dark:text-gray-400">{cliente.email}</div>}
                        </div>
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
          aria-label={t('clienteSelector.nuevoCliente')}
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
            <div key={cliente.id} className="flex items-start gap-3">
              <div className="flex-shrink-0">
                {cliente.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={cliente.avatar_url}
                    alt={cliente.full_name}
                    className="h-10 w-10 rounded-full object-cover border-2 border-gray-200 dark:border-gray-600"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center border-2 border-blue-200 dark:border-blue-800">
                    <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                      {cliente.full_name?.charAt(0)?.toUpperCase() || '?'}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex flex-col min-w-0">
                <p className="font-medium">{cliente.full_name}</p>
                {cliente.email && <p className="text-gray-600 dark:text-gray-400">{t('clienteSelector.correo', { correo: cliente.email })}</p>}
                {cliente.phone && <p className="text-gray-600 dark:text-gray-400">{t('clienteSelector.telefono', { telefono: cliente.phone })}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
