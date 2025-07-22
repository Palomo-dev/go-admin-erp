'use client';

import { useState, useEffect } from 'react';
import { User, UserPlus, Search, Phone, Mail, FileText, X, MapPin, CreditCard } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { UserAvatar } from '@/components/app-layout/Header/GlobalSearch/UserAvatar';
import { POSService } from '@/lib/services/posService';
import { Customer, CustomerFilter } from './types';

interface CustomerSelectorProps {
  selectedCustomer?: Customer;
  onCustomerSelect: (customer?: Customer) => void;
  className?: string;
}

export function CustomerSelector({ selectedCustomer, onCustomerSelect, className }: CustomerSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showCustomerList, setShowCustomerList] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    full_name: '',
    email: '',
    phone: '',
    doc_type: 'CC',
    doc_number: '',
    address: '',
    city: '',
    country: 'Colombia'
  });

  // Buscar clientes
  const searchCustomers = async (term: string) => {
    if (!term.trim()) {
      setCustomers([]);
      return;
    }

    setIsLoading(true);
    try {
      const filter: CustomerFilter = {
        search: term.trim(),
        status: 'active'
      };
      
      const results = await POSService.searchCustomers(filter);
      setCustomers(results);
    } catch (error) {
      console.error('Error searching customers:', error);
      setCustomers([]);
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
    if (!newCustomer.full_name.trim()) {
      alert('El nombre completo es requerido');
      return;
    }

    try {
      const customer = await POSService.createCustomer(newCustomer);
      onCustomerSelect(customer);
      setShowCreateDialog(false);
      setNewCustomer({
        full_name: '',
        email: '',
        phone: '',
        doc_type: 'CC',
        doc_number: '',
        address: '',
        city: '',
        country: 'Colombia'
      });
    } catch (error) {
      console.error('Error creating customer:', error);
      alert('Error al crear el cliente');
    }
  };

  // Seleccionar cliente
  const handleSelectCustomer = (customer: Customer) => {
    onCustomerSelect(customer);
    setShowCustomerList(false);
    setSearchTerm('');
  };

  // Limpiar selección
  const handleClearSelection = () => {
    onCustomerSelect(undefined);
  };

  return (
    <div className={`space-y-2 ${className}`}>
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
                    
                    {selectedCustomer.city && (
                      <div className="flex items-center gap-1.5 text-sm dark:text-gray-300 light:text-gray-600">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{selectedCustomer.city}</span>
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
                  <div className="space-y-2 pr-4">
                    {isLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="flex items-center gap-2 text-sm dark:text-gray-400 light:text-gray-600">
                          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                          <span>Buscando clientes...</span>
                        </div>
                      </div>
                    ) : customers.length === 0 && searchTerm ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <User className="h-12 w-12 dark:text-gray-600 light:text-gray-400 mb-2" />
                        <p className="text-sm font-medium dark:text-gray-400 light:text-gray-600 mb-1">No se encontraron clientes</p>
                        <p className="text-xs dark:text-gray-500 light:text-gray-500">Intenta con otro término de búsqueda</p>
                      </div>
                    ) : searchTerm ? (
                      customers.map((customer) => (
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
                      ))
                    ) : (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <Search className="h-12 w-12 dark:text-gray-600 light:text-gray-400 mb-2" />
                        <p className="text-sm font-medium dark:text-gray-400 light:text-gray-600 mb-1">Comienza a escribir</p>
                        <p className="text-xs dark:text-gray-500 light:text-gray-500">Busca clientes por nombre, email o teléfono</p>
                      </div>
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
                <div className="space-y-2">
                  <Label htmlFor="full_name" className="text-sm font-medium dark:text-gray-300 light:text-gray-700">
                    Nombre Completo *
                  </Label>
                  <Input
                    id="full_name"
                    value={newCustomer.full_name}
                    onChange={(e) => setNewCustomer({ ...newCustomer, full_name: e.target.value })}
                    placeholder="Ingrese el nombre completo"
                    className="dark:bg-gray-800 dark:border-gray-700 dark:text-white light:bg-white light:border-gray-300 light:text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="doc_type" className="text-sm font-medium dark:text-gray-300 light:text-gray-700">
                      Tipo Documento
                    </Label>
                    <Select
                      value={newCustomer.doc_type}
                      onValueChange={(value) => setNewCustomer({ ...newCustomer, doc_type: value })}
                    >
                      <SelectTrigger className="dark:bg-gray-800 dark:border-gray-700 dark:text-white light:bg-white light:border-gray-300 light:text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                        <SelectValue placeholder="Seleccione tipo" />
                      </SelectTrigger>
                      <SelectContent className="dark:bg-gray-900 dark:border-gray-800 light:bg-white light:border-gray-200">
                        <SelectItem value="CC">Cédula de Ciudadanía</SelectItem>
                        <SelectItem value="CE">Cédula de Extranjería</SelectItem>
                        <SelectItem value="NIT">NIT</SelectItem>
                        <SelectItem value="PAS">Pasaporte</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="doc_number" className="text-sm font-medium dark:text-gray-300 light:text-gray-700">
                      Número de Documento
                    </Label>
                    <Input
                      id="doc_number"
                      value={newCustomer.doc_number}
                      onChange={(e) => setNewCustomer({ ...newCustomer, doc_number: e.target.value })}
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
                    <Label htmlFor="city" className="text-sm font-medium dark:text-gray-300 light:text-gray-700">
                      Ciudad
                    </Label>
                    <Input
                      id="city"
                      value={newCustomer.city}
                      onChange={(e) => setNewCustomer({ ...newCustomer, city: e.target.value })}
                      placeholder="Ciudad"
                      className="dark:bg-gray-800 dark:border-gray-700 dark:text-white light:bg-white light:border-gray-300 light:text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
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
}
