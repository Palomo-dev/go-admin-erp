'use client';

import { useState, useEffect } from 'react';
import { User, UserPlus, Search, Phone, Mail, X, CreditCard, Building2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { UserAvatar } from '@/components/app-layout/Header/GlobalSearch/UserAvatar';
import { POSService } from '@/lib/services/posService';
import { useOrganization, getCurrentBranchIdWithFallback } from '@/lib/hooks/useOrganization';
import { ClienteFormDialog } from '@/components/shared/form-dialogs';
import { Customer, CustomerFilter } from './types';
import { supabase } from '@/lib/supabase/config';

export interface OccupiedSpace {
  space_id: string;
  space_label: string;
  reservation_id: string;
  customer_id: string;
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
  checkin: string;
  checkout: string;
  folio_id?: string;
}

export interface CustomerWithRoom {
  customer: Customer;
  room?: OccupiedSpace;
}

interface CustomerSelectorProps {
  selectedCustomer?: Customer;
  selectedRoom?: OccupiedSpace;
  onCustomerSelect: (customer?: Customer, room?: OccupiedSpace) => void;
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function CustomerSelector({ selectedCustomer, selectedRoom, onCustomerSelect, className, open, onOpenChange }: CustomerSelectorProps) {
  const { organization } = useOrganization();
  const [searchTerm, setSearchTerm] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [occupiedSpaces, setOccupiedSpaces] = useState<OccupiedSpace[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showCustomerList, setShowCustomerList] = useState(false);

  // Buscar clientes Y espacios ocupados
  const searchCustomers = async (term: string) => {
    setIsLoading(true);
    try {
      // 1. Buscar espacios ocupados (solo de la organización actual)
      if (!organization?.id) {
        setOccupiedSpaces([]);
        setIsLoading(false);
        return;
      }

      const { data: reservations, error: roomsError } = await supabase
        .from('reservations')
        .select(`
          id,
          customer_id,
          checkin,
          checkout,
          customers!inner (
            id,
            full_name,
            email,
            phone
          ),
          reservation_spaces!inner (
            space_id,
            spaces!inner (
              id,
              label
            )
          ),
          folios (
            id
          )
        `)
        .eq('organization_id', organization.id)
        .in('status', ['confirmed', 'checked_in'])
        .order('checkin', { ascending: false })
        .limit(20);

      if (!roomsError && reservations) {
        const spaces: OccupiedSpace[] = [];
        
        reservations.forEach((reservation: any) => {
          const customer = reservation.customers;
          const reservationSpaces = Array.isArray(reservation.reservation_spaces) 
            ? reservation.reservation_spaces 
            : [reservation.reservation_spaces];

          reservationSpaces.forEach((rs: any) => {
            const space = rs.spaces;
            const customerName = customer.full_name || '';
            
            // Filtrar por término de búsqueda
            if (term && !space.label.toLowerCase().includes(term.toLowerCase()) && 
                !customerName.toLowerCase().includes(term.toLowerCase())) {
              return;
            }

            spaces.push({
              space_id: space.id,
              space_label: space.label,
              reservation_id: reservation.id,
              customer_id: customer.id,
              customer_name: customerName,
              customer_email: customer.email,
              customer_phone: customer.phone,
              checkin: reservation.checkin,
              checkout: reservation.checkout,
              folio_id: reservation.folios?.[0]?.id,
            });
          });
        });

        setOccupiedSpaces(spaces);
      }

      // 2. Buscar clientes regulares solo si hay término de búsqueda
      if (term.trim()) {
        const filter: CustomerFilter = {
          search: term.trim(),
          status: 'active'
        };
        
        const results = await POSService.searchCustomers(filter);
        
        // Obtener contactos principales para empresas
        const companyResults = results.filter((c: any) => c.customer_type === 'company');
        if (companyResults.length > 0) {
          const companyIds = companyResults.map((c: any) => c.id);
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
            const contactMap = new Map<string, { name: string; position: string | null }>();
            for (const link of links as any[]) {
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
            results.forEach((c: any) => {
              if (c.customer_type === 'company') {
                const contact = contactMap.get(c.id);
                if (contact) {
                  c.primary_contact_name = contact.name;
                  c.primary_contact_position = contact.position;
                }
              }
            });
          }
        }
        
        setCustomers(results);
      } else {
        setCustomers([]);
      }
    } catch (error) {
      console.error('Error searching:', error);
      setCustomers([]);
      setOccupiedSpaces([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Efecto para búsqueda con debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      searchCustomers(searchTerm);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Cuando el diálogo compartido crea un cliente, seleccionarlo
  const handleCustomerCreated = (customer: any) => {
    onCustomerSelect(customer);
  };

  // Seleccionar cliente
  const handleSelectCustomer = (customer: Customer, room?: OccupiedSpace) => {
    onCustomerSelect(customer, room);
    setShowCustomerList(false);
    setSearchTerm('');
    // Cerrar dialog si está en modo dialog
    if (onOpenChange) {
      onOpenChange(false);
    }
  };

  // Seleccionar espacio ocupado
  const handleSelectRoom = (room: OccupiedSpace) => {
    // Crear objeto Customer desde los datos del room
    const customer: Customer = {
      id: room.customer_id,
      organization_id: 0,
      full_name: room.customer_name,
      email: room.customer_email || '',
      phone: room.customer_phone || '',
      doc_type: 'CC',
      doc_number: '',
      address: '',
      country: 'Colombia',
      roles: [],
      tags: [],
      preferences: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    onCustomerSelect(customer, room);
    setShowCustomerList(false);
    setSearchTerm('');
    if (onOpenChange) {
      onOpenChange(false);
    }
  };

  // Limpiar selección
  const handleClearSelection = () => {
    onCustomerSelect(undefined, undefined);
  };

  const content = (
    <div className={`space-y-2 ${open ? '' : className}`}>
      {/* Cliente seleccionado */}
      {selectedCustomer ? (
        <Card className="dark:bg-gradient-to-r dark:from-blue-900/20 dark:to-purple-900/10 dark:border-blue-500/30 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200 border shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <UserAvatar 
                  name={selectedCustomer.full_name} 
                  avatarUrl={selectedCustomer.avatar_url} 
                  size="md" 
                  className="shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-base dark:text-white text-gray-900 truncate">
                    {selectedCustomer.full_name}
                  </h3>
                  
                  <div className="mt-1 space-y-1">
                    {selectedCustomer.email && (
                      <div className="flex items-center gap-1.5 text-sm dark:text-gray-300 text-gray-600">
                        <Mail className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{selectedCustomer.email}</span>
                      </div>
                    )}
                    
                    {selectedCustomer.phone && (
                      <div className="flex items-center gap-1.5 text-sm dark:text-gray-300 text-gray-600">
                        <Phone className="h-3.5 w-3.5 shrink-0" />
                        <span>{selectedCustomer.phone}</span>
                      </div>
                    )}
                    
                    {(selectedCustomer.doc_type && selectedCustomer.doc_number) && (
                      <div className="flex items-center gap-1.5 text-sm dark:text-gray-300 text-gray-600">
                        <CreditCard className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{selectedCustomer.doc_type}: {selectedCustomer.doc_number}</span>
                      </div>
                    )}
                    
                  </div>
                </div>
              </div>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearSelection}
                className="dark:hover:bg-red-500/20 dark:hover:text-red-400 hover:bg-red-50 hover:text-red-600 shrink-0 h-8 w-8 p-0"
                title="Quitar cliente"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        /* Selector de cliente */
        <div className="space-y-2">
          <Popover open={showCustomerList} onOpenChange={setShowCustomerList}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-start text-left h-auto p-3 sm:p-4 dark:border-gray-700 dark:hover:bg-gray-800/50 dark:hover:border-blue-500/50 border-gray-300 hover:bg-blue-50 hover:border-blue-300 transition-all duration-200"
              >
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  {/* Ícono responsive */}
                  <div className="p-1.5 sm:p-2 rounded-full dark:bg-blue-500/20 bg-blue-100 shrink-0">
                    <User className="h-4 w-4 sm:h-5 sm:w-5 dark:text-blue-400 text-blue-600" />
                  </div>
                  
                  {/* Contenido de texto responsive */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium dark:text-white text-gray-900 text-sm sm:text-base truncate">
                      Seleccionar cliente
                    </p>
                    <p className="text-xs sm:text-sm dark:text-gray-400 text-gray-600 truncate hidden xs:block">
                      Buscar por nombre, email o teléfono
                    </p>
                    {/* Versión móvil más corta */}
                    <p className="text-xs dark:text-gray-400 text-gray-600 truncate block xs:hidden">
                      Buscar cliente
                    </p>
                  </div>
                  
                  {/* Ícono de búsqueda responsive */}
                  <Search className="h-3.5 w-3.5 sm:h-4 sm:w-4 dark:text-gray-400 text-gray-500 shrink-0" />
                </div>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-96 p-0 dark:bg-gray-900 dark:border-gray-800 bg-white border-gray-200" align="start">
              <div className="p-4 space-y-4">
                {/* Header con campo de búsqueda */}
                <div className="space-y-2">
                  <h4 className="font-semibold dark:text-white text-gray-900">Buscar Cliente</h4>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 dark:text-gray-400 text-gray-500" />
                    <Input
                      placeholder="Nombre, email, teléfono o documento..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 dark:bg-gray-800 dark:border-gray-700 bg-white border-gray-300 focus:ring-2 focus:ring-blue-500"
                      autoFocus
                    />
                  </div>
                </div>

                <Separator className="dark:bg-gray-800 bg-gray-200" />

                {/* Resultados de búsqueda */}
                <ScrollArea className="h-64">
                  <div className="space-y-3 pr-4">
                    {isLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="flex items-center gap-2 text-sm dark:text-gray-400 text-gray-600">
                          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                          <span>Buscando...</span>
                        </div>
                      </div>
                    ) : occupiedSpaces.length === 0 && customers.length === 0 && searchTerm ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <User className="h-12 w-12 dark:text-gray-600 text-gray-400 mb-2" />
                        <p className="text-sm font-medium dark:text-gray-400 text-gray-600 mb-1">No se encontraron resultados</p>
                        <p className="text-xs dark:text-gray-500 text-gray-500">Intenta con otro término de búsqueda</p>
                      </div>
                    ) : (
                      <>
                        {/* Espacios Ocupados */}
                        {occupiedSpaces.length > 0 && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 px-1">
                              <Building2 className="h-3.5 w-3.5 text-green-600" />
                              <p className="text-xs font-semibold dark:text-gray-400 text-gray-600">
                                ESPACIOS OCUPADOS ({occupiedSpaces.length})
                              </p>
                            </div>
                            {occupiedSpaces.map((room) => (
                              <div
                                key={`${room.space_id}-${room.reservation_id}`}
                                className="flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-all duration-200 dark:hover:bg-green-900/20 hover:bg-green-50 dark:border-green-500/30 border-green-200 border"
                                onClick={() => handleSelectRoom(room)}
                              >
                                <div className="flex-shrink-0">
                                  <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                                    <Building2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                                  </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <p className="font-semibold text-sm dark:text-white text-gray-900">
                                      {room.space_label}
                                    </p>
                                    <Badge className="bg-green-600 text-xs">Ocupada</Badge>
                                  </div>
                                  <div className="flex items-center gap-1 text-xs dark:text-gray-400 text-gray-600 mb-0.5">
                                    <User className="h-3 w-3" />
                                    <span className="font-medium">{room.customer_name}</span>
                                  </div>
                                  {room.customer_email && (
                                    <div className="flex items-center gap-1 text-xs dark:text-gray-500 text-gray-500">
                                      <Mail className="h-3 w-3" />
                                      <span className="truncate">{room.customer_email}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Separador si hay ambos */}
                        {occupiedSpaces.length > 0 && customers.length > 0 && searchTerm && (
                          <Separator className="dark:bg-gray-800 bg-gray-200" />
                        )}

                        {/* Clientes Regulares */}
                        {customers.length > 0 && searchTerm && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 px-1">
                              <User className="h-3.5 w-3.5 text-blue-600" />
                              <p className="text-xs font-semibold dark:text-gray-400 text-gray-600">
                                CLIENTES ({customers.length})
                              </p>
                            </div>
                            {customers.map((customer) => (
                              <div
                                key={customer.id}
                                className="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all duration-200 dark:hover:bg-gray-800 hover:bg-gray-50 dark:hover:border-blue-500/30 hover:border-blue-200 border border-transparent"
                                onClick={() => handleSelectCustomer(customer)}
                              >
                                <UserAvatar 
                                  name={customer.full_name} 
                                  avatarUrl={customer.avatar_url} 
                                  size="sm" 
                                  className="shrink-0"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <p className="font-medium text-sm dark:text-white text-gray-900 truncate">
                                      {customer.full_name}
                                    </p>
                                    {customer.customer_type === 'company' && (
                                      <Building2 className="h-3 w-3 text-blue-500 dark:text-blue-400 shrink-0" />
                                    )}
                                  </div>
                                  {customer.customer_type === 'company' && (customer as any).primary_contact_name && (
                                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                      Contacto: {(customer as any).primary_contact_name}{(customer as any).primary_contact_position ? ` (${(customer as any).primary_contact_position})` : ''}
                                    </p>
                                  )}
                                  <div className="flex items-center gap-2 mt-1">
                                    {customer.email && (
                                      <div className="flex items-center gap-1 text-xs dark:text-gray-400 text-gray-600">
                                        <Mail className="h-3 w-3" />
                                        <span className="truncate max-w-[120px]">{customer.email}</span>
                                      </div>
                                    )}
                                    {customer.phone && (
                                      <div className="flex items-center gap-1 text-xs dark:text-gray-400 text-gray-600">
                                        <Phone className="h-3 w-3" />
                                        <span>{customer.phone}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Estado vacío inicial */}
                        {!searchTerm && occupiedSpaces.length === 0 && customers.length === 0 && (
                          <div className="flex flex-col items-center justify-center py-8 text-center">
                            <Search className="h-12 w-12 dark:text-gray-600 text-gray-400 mb-2" />
                            <p className="text-sm font-medium dark:text-gray-400 text-gray-600 mb-1">Comienza a escribir</p>
                            <p className="text-xs dark:text-gray-500 text-gray-500">Busca espacios ocupados o clientes</p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </ScrollArea>

                <Separator className="dark:bg-gray-800 bg-gray-200" />

                {/* Botón para crear nuevo cliente */}
                <Button
                  onClick={() => {
                    setShowCreateDialog(true);
                    setShowCustomerList(false);
                  }}
                  className="w-full justify-start dark:bg-blue-600 dark:hover:bg-blue-700 bg-blue-600 hover:bg-blue-700 transition-colors"
                  size="lg"
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  Crear nuevo cliente
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )}

      {/* Diálogo compartido: reutiliza el formulario COMPLETO de cliente */}
      {organization?.id && (
        <ClienteFormDialog
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
          organizationId={organization.id}
          branchId={getCurrentBranchIdWithFallback()}
          onCreated={handleCustomerCreated}
        />
      )}
    </div>
  );

  // Si se pasa open/onOpenChange, envolver en Dialog
  if (open !== undefined && onOpenChange) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[600px] max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>Seleccionar Cliente</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[calc(85vh-8rem)]">
            {content}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    );
  }

  // Modo inline
  return content;
}
