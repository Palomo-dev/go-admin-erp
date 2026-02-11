'use client';

import { useState, useEffect } from 'react';
import { User, UserPlus, Search, Phone, Mail, X, MapPin, CreditCard, Building2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { UserAvatar } from '@/components/app-layout/Header/GlobalSearch/UserAvatar';
import { supabase } from '@/lib/supabase/config';
import { MunicipalitySearch } from '@/components/shared/MunicipalitySearch';
import { useOrganization } from '@/lib/hooks/useOrganization';

export interface CustomerGym {
  id: string;
  first_name: string;
  last_name: string;
  full_name?: string;
  email?: string;
  phone?: string;
  identification_number?: string;
  identification_type?: string;
  address?: string;
}

interface CustomerSelectorGymProps {
  selectedCustomer?: CustomerGym | null;
  onCustomerSelect: (customer: CustomerGym | null) => void;
  className?: string;
}

export function CustomerSelectorGym({ selectedCustomer, onCustomerSelect, className }: CustomerSelectorGymProps) {
  const { organization } = useOrganization();
  const [searchTerm, setSearchTerm] = useState('');
  const [customers, setCustomers] = useState<CustomerGym[]>([]);
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
    address: ''
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

  const searchCustomers = async (term: string) => {
    if (!term.trim()) {
      setCustomers([]);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('id, first_name, last_name, email, phone, identification_number')
        .or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,identification_number.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`)
        .limit(15);

      if (error) throw error;
      setCustomers(data || []);
    } catch (error) {
      console.error('Error buscando clientes:', error);
      setCustomers([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      searchCustomers(searchTerm);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  const handleCreateCustomer = async () => {
    if (!newCustomer.first_name.trim() || !newCustomer.last_name.trim()) {
      alert('El nombre y apellido son requeridos');
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
        address: ''
      });
      setSelectedRoles(['cliente', 'huesped']);
      setSelectedFiscal(['R-99-PN']);
      setMunicipalityId('aa4b6637-0060-41bb-9459-bc95f9789e08');
    } catch (error) {
      console.error('Error creando cliente:', error);
      alert('Error al crear el cliente');
    }
  };

  const handleSelectCustomer = (customer: CustomerGym) => {
    onCustomerSelect(customer);
    setShowCustomerList(false);
    setSearchTerm('');
  };

  const handleClearSelection = () => {
    onCustomerSelect(null);
  };

  const getDisplayName = (customer: CustomerGym) => {
    if (customer.full_name) return customer.full_name;
    return `${customer.first_name || ''} ${customer.last_name || ''}`.trim();
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {selectedCustomer ? (
        <Card className="dark:bg-gradient-to-r dark:from-blue-900/20 dark:to-purple-900/10 dark:border-blue-500/30 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200 border shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <UserAvatar 
                  name={getDisplayName(selectedCustomer)} 
                  size="md" 
                  className="shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-base dark:text-white text-gray-900 truncate">
                    {getDisplayName(selectedCustomer)}
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
                    
                    {selectedCustomer.identification_number && (
                      <div className="flex items-center gap-1.5 text-sm dark:text-gray-300 text-gray-600">
                        <CreditCard className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{selectedCustomer.identification_number}</span>
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
        <div className="space-y-2">
          <Popover open={showCustomerList} onOpenChange={setShowCustomerList}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-start text-left h-auto p-3 sm:p-4 dark:border-gray-700 dark:hover:bg-gray-800/50 dark:hover:border-blue-500/50 border-gray-300 hover:bg-blue-50 hover:border-blue-300 transition-all duration-200"
              >
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <div className="p-1.5 sm:p-2 rounded-full dark:bg-blue-500/20 bg-blue-100 shrink-0">
                    <User className="h-4 w-4 sm:h-5 sm:w-5 dark:text-blue-400 text-blue-600" />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <p className="font-medium dark:text-white text-gray-900 text-sm sm:text-base truncate">
                      Seleccionar cliente
                    </p>
                    <p className="text-xs sm:text-sm dark:text-gray-400 text-gray-600 truncate">
                      Buscar por nombre, documento o teléfono
                    </p>
                  </div>
                  
                  <Search className="h-3.5 w-3.5 sm:h-4 sm:w-4 dark:text-gray-400 text-gray-500 shrink-0" />
                </div>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-96 p-0 dark:bg-gray-900 dark:border-gray-800 bg-white border-gray-200" align="start">
              <div className="p-4 space-y-4">
                <div className="space-y-2">
                  <h4 className="font-semibold dark:text-white text-gray-900">Buscar Cliente</h4>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 dark:text-gray-400 text-gray-500" />
                    <Input
                      placeholder="Nombre, documento, email o teléfono..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 dark:bg-gray-800 dark:border-gray-700 bg-white border-gray-300 focus:ring-2 focus:ring-blue-500"
                      autoFocus
                    />
                  </div>
                </div>

                <Separator className="dark:bg-gray-800 bg-gray-200" />

                <ScrollArea className="h-64">
                  <div className="space-y-2 pr-4">
                    {isLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="flex items-center gap-2 text-sm dark:text-gray-400 text-gray-600">
                          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                          <span>Buscando...</span>
                        </div>
                      </div>
                    ) : customers.length === 0 && searchTerm ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <User className="h-12 w-12 dark:text-gray-600 text-gray-400 mb-2" />
                        <p className="text-sm font-medium dark:text-gray-400 text-gray-600 mb-1">No se encontraron resultados</p>
                        <p className="text-xs dark:text-gray-500 text-gray-500">Intenta con otro término de búsqueda</p>
                      </div>
                    ) : customers.length > 0 ? (
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
                              name={getDisplayName(customer)} 
                              size="sm" 
                              className="shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm dark:text-white text-gray-900 truncate">
                                {getDisplayName(customer)}
                              </p>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                {customer.identification_number && (
                                  <div className="flex items-center gap-1 text-xs dark:text-gray-400 text-gray-600">
                                    <CreditCard className="h-3 w-3" />
                                    <span>{customer.identification_number}</span>
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
                    ) : (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <Search className="h-12 w-12 dark:text-gray-600 text-gray-400 mb-2" />
                        <p className="text-sm font-medium dark:text-gray-400 text-gray-600 mb-1">Comienza a escribir</p>
                        <p className="text-xs dark:text-gray-500 text-gray-500">Busca clientes por nombre o documento</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>

                <Separator className="dark:bg-gray-800 bg-gray-200" />

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

      {/* Dialog para crear cliente */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto dark:bg-gray-900 dark:border-gray-800 bg-white border-gray-200">
          <DialogHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg dark:bg-blue-600/20 bg-blue-100">
                <UserPlus className="h-6 w-6 dark:text-blue-400 text-blue-600" />
              </div>
              <div>
                <DialogTitle className="text-xl font-semibold dark:text-white text-gray-900">
                  Crear Nuevo Cliente
                </DialogTitle>
                <p className="text-sm dark:text-gray-400 text-gray-600 mt-1">
                  Complete la información del cliente
                </p>
              </div>
            </div>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="first_name">Nombre *</Label>
                <Input
                  id="first_name"
                  value={newCustomer.first_name}
                  onChange={(e) => setNewCustomer({ ...newCustomer, first_name: e.target.value })}
                  placeholder="Nombre"
                  className="dark:bg-gray-800 dark:border-gray-700"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name">Apellido *</Label>
                <Input
                  id="last_name"
                  value={newCustomer.last_name}
                  onChange={(e) => setNewCustomer({ ...newCustomer, last_name: e.target.value })}
                  placeholder="Apellido"
                  className="dark:bg-gray-800 dark:border-gray-700"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="identification_type">Tipo Doc.</Label>
                <select
                  id="identification_type"
                  value={newCustomer.identification_type}
                  onChange={(e) => setNewCustomer({ ...newCustomer, identification_type: e.target.value })}
                  className="h-10 w-full rounded-md border dark:bg-gray-800 dark:border-gray-700 dark:text-white bg-white border-gray-300 text-gray-900 px-3 py-2 text-sm"
                >
                  <option value="CC">Cédula</option>
                  <option value="CE">Cédula Extranjería</option>
                  <option value="NIT">NIT</option>
                  <option value="PAS">Pasaporte</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="identification_number">Número Doc.</Label>
                <Input
                  id="identification_number"
                  value={newCustomer.identification_number}
                  onChange={(e) => setNewCustomer({ ...newCustomer, identification_number: e.target.value })}
                  placeholder="Número"
                  className="dark:bg-gray-800 dark:border-gray-700"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={newCustomer.email}
                  onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                  placeholder="correo@ejemplo.com"
                  className="dark:bg-gray-800 dark:border-gray-700"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Teléfono</Label>
                <Input
                  id="phone"
                  value={newCustomer.phone}
                  onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                  placeholder="300 123 4567"
                  className="dark:bg-gray-800 dark:border-gray-700"
                />
              </div>
            </div>
          </div>

          {/* Roles del Cliente */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium dark:text-gray-300 text-gray-700 flex items-center gap-2">
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
          <div className="space-y-3">
            <h3 className="text-sm font-medium dark:text-gray-300 text-gray-700 flex items-center gap-2">
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

          <DialogFooter className="border-t dark:border-gray-800 border-gray-200 pt-4 mt-4">
            <div className="flex gap-3 w-full sm:w-auto">
              <Button
                variant="outline"
                onClick={() => setShowCreateDialog(false)}
                className="flex-1 sm:flex-none dark:border-gray-700"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleCreateCustomer}
                className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700"
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
}

export default CustomerSelectorGym;
