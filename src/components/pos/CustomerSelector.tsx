'use client';

import { useState, useEffect } from 'react';
import { User, UserPlus, Search, Phone, Mail, FileText, X, MapPin, CreditCard, Building2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { UserAvatar } from '@/components/app-layout/Header/GlobalSearch/UserAvatar';
import { POSService } from '@/lib/services/posService';
import { MunicipalitySearch } from '@/components/shared/MunicipalitySearch';
import { useOrganization } from '@/lib/hooks/useOrganization';
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
  const [newCustomer, setNewCustomer] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    identification_type: 'CC',
    identification_number: '',
    address: '',
    country: 'Colombia'
  });
  const [selectedRoles, setSelectedRoles] = useState<string[]>(['cliente', 'huesped']);
  const [selectedFiscal, setSelectedFiscal] = useState<string[]>(['R-99-PN']);
  const [municipalityId, setMunicipalityId] = useState('aa4b6637-0060-41bb-9459-bc95f9789e08');
  const [customerRoles, setCustomerRoles] = useState<{code: string; label: string}[]>([]);
  const [fiscalOptions, setFiscalOptions] = useState<{code: string; description: string}[]>([]);

  useEffect(() => {
    async function loadCatalogs() {
      const [rolesRes, fiscalRes] = await Promise.all([
        supabase.from('customer_roles').select('code, label').order('sort_order'),
        supabase.from('dian_fiscal_responsibilities').select('code, description').order('sort_order'),
      ]);
      if (rolesRes.data) setCustomerRoles(rolesRes.data);
      if (fiscalRes.data) setFiscalOptions(fiscalRes.data);
    }
    loadCatalogs();
  }, []);

  // Buscar clientes Y espacios ocupados
  const searchCustomers = async (term: string) => {
    setIsLoading(true);
    try {
      // 1. Buscar espacios ocupados
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

  // Crear nuevo cliente
  const handleCreateCustomer = async () => {
    if (!newCustomer.first_name.trim()) {
      alert('El nombre es requerido');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('customers')
        .insert({
          organization_id: organization?.id,
          first_name: newCustomer.first_name,
          last_name: newCustomer.last_name,
          email: newCustomer.email || null,
          phone: newCustomer.phone || null,
          identification_type: newCustomer.identification_type,
          identification_number: newCustomer.identification_number || null,
          address: newCustomer.address || null,
          roles: selectedRoles,
          fiscal_responsibilities: selectedFiscal,
          fiscal_municipality_id: municipalityId,
          metadata: { country: newCustomer.country },
        })
        .select()
        .single();

      if (error) throw error;

      onCustomerSelect(data);
      setShowCreateDialog(false);
      setNewCustomer({
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        identification_type: 'CC',
        identification_number: '',
        address: '',
        country: 'Colombia'
      });
      setSelectedRoles(['cliente', 'huesped']);
      setSelectedFiscal(['R-99-PN']);
      setMunicipalityId('aa4b6637-0060-41bb-9459-bc95f9789e08');
    } catch (error) {
      console.error('Error creating customer:', error);
      alert('Error al crear el cliente');
    }
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
        <Card className="dark:bg-gradient-to-r dark:from-blue-900/20 dark:to-purple-900/10 dark:border-blue-500/30 light:bg-gradient-to-r light:from-blue-50 light:to-indigo-50 light:border-blue-200 border shadow-sm">
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
                  <h3 className="font-semibold text-base dark:text-white light:text-gray-900 truncate">
                    {selectedCustomer.full_name}
                  </h3>
                  
                  <div className="mt-1 space-y-1">
                    {selectedCustomer.email && (
                      <div className="flex items-center gap-1.5 text-sm dark:text-gray-300 light:text-gray-600">
                        <Mail className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{selectedCustomer.email}</span>
                      </div>
                    )}
                    
                    {selectedCustomer.phone && (
                      <div className="flex items-center gap-1.5 text-sm dark:text-gray-300 light:text-gray-600">
                        <Phone className="h-3.5 w-3.5 shrink-0" />
                        <span>{selectedCustomer.phone}</span>
                      </div>
                    )}
                    
                    {(selectedCustomer.doc_type && selectedCustomer.doc_number) && (
                      <div className="flex items-center gap-1.5 text-sm dark:text-gray-300 light:text-gray-600">
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
                className="dark:hover:bg-red-500/20 dark:hover:text-red-400 light:hover:bg-red-50 light:hover:text-red-600 shrink-0 h-8 w-8 p-0"
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
                className="w-full justify-start text-left h-auto p-3 sm:p-4 dark:border-gray-700 dark:hover:bg-gray-800/50 dark:hover:border-blue-500/50 light:border-gray-300 light:hover:bg-blue-50 light:hover:border-blue-300 transition-all duration-200"
              >
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  {/* Ícono responsive */}
                  <div className="p-1.5 sm:p-2 rounded-full dark:bg-blue-500/20 light:bg-blue-100 shrink-0">
                    <User className="h-4 w-4 sm:h-5 sm:w-5 dark:text-blue-400 light:text-blue-600" />
                  </div>
                  
                  {/* Contenido de texto responsive */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium dark:text-white light:text-gray-900 text-sm sm:text-base truncate">
                      Seleccionar cliente
                    </p>
                    <p className="text-xs sm:text-sm dark:text-gray-400 light:text-gray-600 truncate hidden xs:block">
                      Buscar por nombre, email o teléfono
                    </p>
                    {/* Versión móvil más corta */}
                    <p className="text-xs dark:text-gray-400 light:text-gray-600 truncate block xs:hidden">
                      Buscar cliente
                    </p>
                  </div>
                  
                  {/* Ícono de búsqueda responsive */}
                  <Search className="h-3.5 w-3.5 sm:h-4 sm:w-4 dark:text-gray-400 light:text-gray-500 shrink-0" />
                </div>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-96 p-0 dark:bg-gray-900 dark:border-gray-800 light:bg-white light:border-gray-200" align="start">
              <div className="p-4 space-y-4">
                {/* Header con campo de búsqueda */}
                <div className="space-y-2">
                  <h4 className="font-semibold dark:text-white light:text-gray-900">Buscar Cliente</h4>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 dark:text-gray-400 light:text-gray-500" />
                    <Input
                      placeholder="Nombre, email, teléfono o documento..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 dark:bg-gray-800 dark:border-gray-700 light:bg-white light:border-gray-300 focus:ring-2 focus:ring-blue-500"
                      autoFocus
                    />
                  </div>
                </div>

                <Separator className="dark:bg-gray-800 light:bg-gray-200" />

                {/* Resultados de búsqueda */}
                <ScrollArea className="h-64">
                  <div className="space-y-3 pr-4">
                    {isLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="flex items-center gap-2 text-sm dark:text-gray-400 light:text-gray-600">
                          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                          <span>Buscando...</span>
                        </div>
                      </div>
                    ) : occupiedSpaces.length === 0 && customers.length === 0 && searchTerm ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <User className="h-12 w-12 dark:text-gray-600 light:text-gray-400 mb-2" />
                        <p className="text-sm font-medium dark:text-gray-400 light:text-gray-600 mb-1">No se encontraron resultados</p>
                        <p className="text-xs dark:text-gray-500 light:text-gray-500">Intenta con otro término de búsqueda</p>
                      </div>
                    ) : (
                      <>
                        {/* Espacios Ocupados */}
                        {occupiedSpaces.length > 0 && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 px-1">
                              <Building2 className="h-3.5 w-3.5 text-green-600" />
                              <p className="text-xs font-semibold dark:text-gray-400 light:text-gray-600">
                                ESPACIOS OCUPADOS ({occupiedSpaces.length})
                              </p>
                            </div>
                            {occupiedSpaces.map((room) => (
                              <div
                                key={`${room.space_id}-${room.reservation_id}`}
                                className="flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-all duration-200 dark:hover:bg-green-900/20 light:hover:bg-green-50 dark:border-green-500/30 light:border-green-200 border"
                                onClick={() => handleSelectRoom(room)}
                              >
                                <div className="flex-shrink-0">
                                  <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                                    <Building2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                                  </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <p className="font-semibold text-sm dark:text-white light:text-gray-900">
                                      {room.space_label}
                                    </p>
                                    <Badge className="bg-green-600 text-xs">Ocupada</Badge>
                                  </div>
                                  <div className="flex items-center gap-1 text-xs dark:text-gray-400 light:text-gray-600 mb-0.5">
                                    <User className="h-3 w-3" />
                                    <span className="font-medium">{room.customer_name}</span>
                                  </div>
                                  {room.customer_email && (
                                    <div className="flex items-center gap-1 text-xs dark:text-gray-500 light:text-gray-500">
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
                          <Separator className="dark:bg-gray-800 light:bg-gray-200" />
                        )}

                        {/* Clientes Regulares */}
                        {customers.length > 0 && searchTerm && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 px-1">
                              <User className="h-3.5 w-3.5 text-blue-600" />
                              <p className="text-xs font-semibold dark:text-gray-400 light:text-gray-600">
                                CLIENTES ({customers.length})
                              </p>
                            </div>
                            {customers.map((customer) => (
                              <div
                                key={customer.id}
                                className="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all duration-200 dark:hover:bg-gray-800 light:hover:bg-gray-50 dark:hover:border-blue-500/30 light:hover:border-blue-200 border border-transparent"
                                onClick={() => handleSelectCustomer(customer)}
                              >
                                <UserAvatar 
                                  name={customer.full_name} 
                                  avatarUrl={customer.avatar_url} 
                                  size="sm" 
                                  className="shrink-0"
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-sm dark:text-white light:text-gray-900 truncate">
                                    {customer.full_name}
                                  </p>
                                  <div className="flex items-center gap-2 mt-1">
                                    {customer.email && (
                                      <div className="flex items-center gap-1 text-xs dark:text-gray-400 light:text-gray-600">
                                        <Mail className="h-3 w-3" />
                                        <span className="truncate max-w-[120px]">{customer.email}</span>
                                      </div>
                                    )}
                                    {customer.phone && (
                                      <div className="flex items-center gap-1 text-xs dark:text-gray-400 light:text-gray-600">
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
                            <Search className="h-12 w-12 dark:text-gray-600 light:text-gray-400 mb-2" />
                            <p className="text-sm font-medium dark:text-gray-400 light:text-gray-600 mb-1">Comienza a escribir</p>
                            <p className="text-xs dark:text-gray-500 light:text-gray-500">Busca espacios ocupados o clientes</p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </ScrollArea>

                <Separator className="dark:bg-gray-800 light:bg-gray-200" />

                {/* Botón para crear nuevo cliente */}
                <Button
                  onClick={() => {
                    setShowCreateDialog(true);
                    setShowCustomerList(false);
                  }}
                  className="w-full justify-start dark:bg-blue-600 dark:hover:bg-blue-700 light:bg-blue-600 light:hover:bg-blue-700 transition-colors"
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

      {/* Dialog para crear cliente */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto dark:bg-gray-900 dark:border-gray-800 light:bg-white light:border-gray-200">
          <DialogHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg dark:bg-blue-600/20 light:bg-blue-100">
                <UserPlus className="h-6 w-6 dark:text-blue-400 light:text-blue-600" />
              </div>
              <div>
                <DialogTitle className="text-xl font-semibold dark:text-white light:text-gray-900">
                  Crear Nuevo Cliente
                </DialogTitle>
                <p className="text-sm dark:text-gray-400 light:text-gray-600 mt-1">
                  Complete la información del cliente
                </p>
              </div>
            </div>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Información básica */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium dark:text-gray-300 light:text-gray-700 flex items-center gap-2">
                <User className="h-4 w-4" />
                Información Básica
              </h3>
              
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="first_name" className="text-sm font-medium dark:text-gray-300 light:text-gray-700">
                      Nombre *
                    </Label>
                    <Input
                      id="first_name"
                      value={newCustomer.first_name}
                      onChange={(e) => setNewCustomer({ ...newCustomer, first_name: e.target.value })}
                      placeholder="Nombre"
                      className="dark:bg-gray-800 dark:border-gray-700 dark:text-white light:bg-white light:border-gray-300 light:text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="last_name" className="text-sm font-medium dark:text-gray-300 light:text-gray-700">
                      Apellido
                    </Label>
                    <Input
                      id="last_name"
                      value={newCustomer.last_name}
                      onChange={(e) => setNewCustomer({ ...newCustomer, last_name: e.target.value })}
                      placeholder="Apellido"
                      className="dark:bg-gray-800 dark:border-gray-700 dark:text-white light:bg-white light:border-gray-300 light:text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="identification_type" className="text-sm font-medium dark:text-gray-300 light:text-gray-700">
                      Tipo Documento
                    </Label>
                    <select
                      id="identification_type"
                      value={newCustomer.identification_type}
                      onChange={(e) => setNewCustomer({ ...newCustomer, identification_type: e.target.value })}
                      className="h-10 w-full rounded-md border dark:bg-gray-800 dark:border-gray-700 dark:text-white light:bg-white light:border-gray-300 light:text-gray-900 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="CC">Cédula de Ciudadanía</option>
                      <option value="CE">Cédula de Extranjería</option>
                      <option value="NIT">NIT</option>
                      <option value="PAS">Pasaporte</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="identification_number" className="text-sm font-medium dark:text-gray-300 light:text-gray-700">
                      Número de Documento
                    </Label>
                    <Input
                      id="identification_number"
                      value={newCustomer.identification_number}
                      onChange={(e) => setNewCustomer({ ...newCustomer, identification_number: e.target.value })}
                      placeholder="Número documento"
                      className="dark:bg-gray-800 dark:border-gray-700 dark:text-white light:bg-white light:border-gray-300 light:text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Información de contacto */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium dark:text-gray-300 light:text-gray-700 flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Información de Contacto
              </h3>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-medium dark:text-gray-300 light:text-gray-700 flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      Email
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={newCustomer.email}
                      onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                      placeholder="correo@ejemplo.com"
                      className="dark:bg-gray-800 dark:border-gray-700 dark:text-white light:bg-white light:border-gray-300 light:text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-sm font-medium dark:text-gray-300 light:text-gray-700 flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      Teléfono
                    </Label>
                    <Input
                      id="phone"
                      value={newCustomer.phone}
                      onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                      placeholder="300 123 4567"
                      className="dark:bg-gray-800 dark:border-gray-700 dark:text-white light:bg-white light:border-gray-300 light:text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Información de ubicación */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium dark:text-gray-300 light:text-gray-700 flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Información de Ubicación
              </h3>
              
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="address" className="text-sm font-medium dark:text-gray-300 light:text-gray-700">
                    Dirección
                  </Label>
                  <Textarea
                    id="address"
                    value={newCustomer.address}
                    onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
                    placeholder="Dirección completa (calle, carrera, número)"
                    rows={2}
                    className="dark:bg-gray-800 dark:border-gray-700 dark:text-white light:bg-white light:border-gray-300 light:text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="country" className="text-sm font-medium dark:text-gray-300 light:text-gray-700">
                      País
                    </Label>
                    <Input
                      id="country"
                      value={newCustomer.country}
                      onChange={(e) => setNewCustomer({ ...newCustomer, country: e.target.value })}
                      placeholder="Colombia"
                      className="dark:bg-gray-800 dark:border-gray-700 dark:text-white light:bg-white light:border-gray-300 light:text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Roles del Cliente */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium dark:text-gray-300 light:text-gray-700 flex items-center gap-2">
                <User className="h-4 w-4" />
                Roles del Cliente
              </h3>
              <div className="flex flex-wrap gap-2">
                {customerRoles.map((role) => (
                  <div
                    key={role.code}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer transition-all text-sm ${
                      selectedRoles.includes(role.code)
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300'
                    }`}
                    onClick={() => setSelectedRoles(prev =>
                      prev.includes(role.code) ? prev.filter(r => r !== role.code) : [...prev, role.code]
                    )}
                  >
                    <Checkbox checked={selectedRoles.includes(role.code)} className="pointer-events-none h-3.5 w-3.5" />
                    <span>{role.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Responsabilidad Fiscal DIAN */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium dark:text-gray-300 light:text-gray-700 flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Responsabilidad Fiscal (DIAN)
              </h3>
              <div className="flex flex-wrap gap-2">
                {fiscalOptions.map((fiscal) => (
                  <div
                    key={fiscal.code}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer transition-all text-xs ${
                      selectedFiscal.includes(fiscal.code)
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300'
                    }`}
                    onClick={() => setSelectedFiscal(prev =>
                      prev.includes(fiscal.code) ? prev.filter(f => f !== fiscal.code) : [...prev, fiscal.code]
                    )}
                  >
                    <Checkbox checked={selectedFiscal.includes(fiscal.code)} className="pointer-events-none h-3.5 w-3.5" />
                    <span className="font-medium">{fiscal.code}</span>
                    <span className="text-gray-500 dark:text-gray-400">- {fiscal.description}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Municipio */}
            <MunicipalitySearch
              value={municipalityId}
              onChange={setMunicipalityId}
            />
          </div>

          <DialogFooter className="border-t dark:border-gray-800 light:border-gray-200 pt-6 mt-6">
            <div className="flex gap-3 w-full sm:w-auto">
              <Button
                variant="outline"
                onClick={() => setShowCreateDialog(false)}
                className="flex-1 sm:flex-none dark:border-gray-700 dark:hover:bg-gray-800 dark:text-gray-300 light:border-gray-300 light:hover:bg-gray-50 light:text-gray-700"
                size="lg"
              >
                <X className="h-4 w-4 mr-2" />
                Cancelar
              </Button>
              <Button
                onClick={handleCreateCustomer}
                className="flex-1 sm:flex-none dark:bg-blue-600 dark:hover:bg-blue-700 light:bg-blue-600 light:hover:bg-blue-700 shadow-lg"
                size="lg"
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Crear Cliente
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
