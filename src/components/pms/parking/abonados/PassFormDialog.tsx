'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Loader2, Search, User, Plus, X, Car, Mail, Phone } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { formatCurrency } from '@/utils/Utils';
import parkingService, {
  type ParkingPass,
  type ParkingPassType,
} from '@/lib/services/parkingService';

interface PassFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: number;
  pass: ParkingPass | null;
  passTypes: ParkingPassType[];
  onSuccess: () => void;
}

interface VehicleInput {
  plate: string;
  brand: string;
  model: string;
  color: string;
  vehicle_type: string;
  is_primary: boolean;
}

interface CustomerOption {
  id: string;
  full_name: string;
  email?: string;
  phone?: string;
}

export function PassFormDialog({
  open,
  onOpenChange,
  organizationId,
  pass,
  passTypes,
  onSuccess,
}: PassFormDialogProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [showCustomerPopover, setShowCustomerPopover] = useState(false);

  // Form state
  const [customerId, setCustomerId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null);
  const [passTypeId, setPassTypeId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [price, setPrice] = useState('');
  const [planName, setPlanName] = useState('');
  const [vehicles, setVehicles] = useState<VehicleInput[]>([
    { plate: '', brand: '', model: '', color: '', vehicle_type: 'car', is_primary: true },
  ]);

  const isEditing = !!pass?.id;

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      if (pass) {
        setCustomerId(pass.customer_id || '');
        setSelectedCustomer(pass.customer ? {
          id: pass.customer.id,
          full_name: pass.customer.full_name,
          email: pass.customer.email,
          phone: pass.customer.phone,
        } : null);
        setPassTypeId(pass.pass_type_id || '');
        setStartDate(pass.start_date || '');
        setEndDate(pass.end_date || '');
        setPrice(String(pass.price) || '');
        setPlanName(pass.plan_name || '');
        setVehicles(
          pass.vehicles?.map(v => ({
            plate: v.vehicle?.plate || '',
            brand: v.vehicle?.brand || '',
            model: v.vehicle?.model || '',
            color: v.vehicle?.color || '',
            vehicle_type: v.vehicle?.vehicle_type || 'car',
            is_primary: v.is_primary,
          })) || [{ plate: '', brand: '', model: '', color: '', vehicle_type: 'car', is_primary: true }]
        );
      } else {
        resetForm();
      }
    }
  }, [open, pass]);

  // Search customers
  useEffect(() => {
    const searchCustomers = async () => {
      if (customerSearch.length < 2) {
        setCustomers([]);
        return;
      }

      setIsSearching(true);
      try {
        const results = await parkingService.searchCustomers(organizationId, customerSearch);
        setCustomers(results);
      } catch (error) {
        console.error('Error searching customers:', error);
      } finally {
        setIsSearching(false);
      }
    };

    const debounce = setTimeout(searchCustomers, 300);
    return () => clearTimeout(debounce);
  }, [customerSearch, organizationId]);

  // Update dates and price when pass type changes
  useEffect(() => {
    if (passTypeId && !isEditing) {
      const selectedType = passTypes.find(t => t.id === passTypeId);
      if (selectedType) {
        const start = new Date();
        const end = new Date(start.getTime() + selectedType.duration_days * 24 * 60 * 60 * 1000);
        setStartDate(start.toISOString().split('T')[0]);
        setEndDate(end.toISOString().split('T')[0]);
        setPrice(String(selectedType.price));
        setPlanName(selectedType.name);
      }
    }
  }, [passTypeId, passTypes, isEditing]);

  const resetForm = () => {
    setCustomerId('');
    setCustomerSearch('');
    setSelectedCustomer(null);
    setPassTypeId('');
    setStartDate(new Date().toISOString().split('T')[0]);
    setEndDate('');
    setPrice('');
    setPlanName('');
    setVehicles([{ plate: '', brand: '', model: '', color: '', vehicle_type: 'car', is_primary: true }]);
  };

  const handleSelectCustomer = (customer: CustomerOption) => {
    setCustomerId(customer.id);
    setSelectedCustomer(customer);
    setCustomerSearch('');
    setCustomers([]);
  };

  const handleAddVehicle = () => {
    setVehicles([
      ...vehicles,
      { plate: '', brand: '', model: '', color: '', vehicle_type: 'car', is_primary: false },
    ]);
  };

  const handleRemoveVehicle = (index: number) => {
    if (vehicles.length > 1) {
      const newVehicles = vehicles.filter((_, i) => i !== index);
      // Ensure at least one is primary
      if (!newVehicles.some(v => v.is_primary)) {
        newVehicles[0].is_primary = true;
      }
      setVehicles(newVehicles);
    }
  };

  const handleVehicleChange = (index: number, field: keyof VehicleInput, value: string | boolean) => {
    const newVehicles = [...vehicles];
    if (field === 'is_primary' && value === true) {
      // Only one can be primary
      newVehicles.forEach((v, i) => {
        v.is_primary = i === index;
      });
    } else {
      (newVehicles[index] as any)[field] = value;
    }
    setVehicles(newVehicles);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!customerId) {
      toast({ title: 'Error', description: 'Selecciona un cliente', variant: 'destructive' });
      return;
    }

    if (!passTypeId) {
      toast({ title: 'Error', description: 'Selecciona un tipo de plan', variant: 'destructive' });
      return;
    }

    const validVehicles = vehicles.filter(v => v.plate.trim());
    if (validVehicles.length === 0) {
      toast({ title: 'Error', description: 'Agrega al menos una placa', variant: 'destructive' });
      return;
    }

    setIsLoading(true);

    try {
      if (isEditing) {
        await parkingService.updatePass(pass!.id, {
          customer_id: customerId,
          pass_type_id: passTypeId,
          start_date: startDate,
          end_date: endDate,
          price: Number(price),
          plan_name: planName,
          vehicles: validVehicles,
        });
        toast({ title: 'Pase actualizado', description: 'El pase se ha actualizado correctamente' });
      } else {
        await parkingService.createPass({
          organization_id: organizationId,
          customer_id: customerId,
          pass_type_id: passTypeId,
          start_date: startDate,
          end_date: endDate,
          price: Number(price),
          plan_name: planName,
          vehicles: validVehicles,
        });
        toast({ title: 'Pase creado', description: 'El pase se ha creado correctamente' });
      }

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving pass:', error);
      toast({ title: 'Error', description: 'No se pudo guardar el pase', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto dark:bg-gray-800 dark:border-gray-700">
        <DialogHeader>
          <DialogTitle className="dark:text-white">
            {isEditing ? 'Editar Pase' : 'Nuevo Pase de Abonado'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Cliente - Estilo POS */}
          <div className="space-y-2">
            <Label className="dark:text-gray-200">Cliente *</Label>
            {selectedCustomer ? (
              <div className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/10 border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-blue-100 dark:bg-blue-900/30">
                    <User className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {selectedCustomer.full_name}
                    </p>
                    <div className="flex items-center gap-3 mt-0.5">
                      {selectedCustomer.email && (
                        <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                          <Mail className="h-3 w-3" />
                          {selectedCustomer.email}
                        </span>
                      )}
                      {selectedCustomer.phone && (
                        <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                          <Phone className="h-3 w-3" />
                          {selectedCustomer.phone}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                  onClick={() => {
                    setSelectedCustomer(null);
                    setCustomerId('');
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Popover open={showCustomerPopover} onOpenChange={setShowCustomerPopover}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start text-left h-auto p-3 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 rounded-full bg-blue-100 dark:bg-blue-900/30">
                        <User className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-gray-900 dark:text-white text-sm">
                          Seleccionar cliente
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Buscar por nombre, email o teléfono
                        </p>
                      </div>
                      <Search className="h-4 w-4 text-gray-400" />
                    </div>
                  </Button>
                </PopoverTrigger>
                <PopoverContent 
                  className="w-96 p-0 dark:bg-gray-900 dark:border-gray-700" 
                  align="start"
                >
                  <div className="p-4 space-y-3">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        placeholder="Nombre, email o teléfono..."
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                        className="pl-10 dark:bg-gray-800 dark:border-gray-700"
                        autoFocus
                      />
                      {isSearching && (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-blue-500" />
                      )}
                    </div>

                    <Separator className="dark:bg-gray-700" />

                    <ScrollArea className="h-52">
                      {isSearching ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-5 w-5 animate-spin text-blue-500 mr-2" />
                          <span className="text-sm text-gray-500">Buscando...</span>
                        </div>
                      ) : customers.length === 0 && customerSearch.length >= 2 ? (
                        <div className="flex flex-col items-center justify-center py-8 text-center">
                          <User className="h-10 w-10 text-gray-300 dark:text-gray-600 mb-2" />
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            No se encontraron clientes
                          </p>
                        </div>
                      ) : customers.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 text-center">
                          <Search className="h-10 w-10 text-gray-300 dark:text-gray-600 mb-2" />
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            Escribe para buscar clientes
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {customers.map((customer) => (
                            <button
                              key={customer.id}
                              type="button"
                              className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
                              onClick={() => {
                                handleSelectCustomer(customer);
                                setShowCustomerPopover(false);
                              }}
                            >
                              <div className="p-1.5 rounded-full bg-gray-100 dark:bg-gray-700">
                                <User className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm text-gray-900 dark:text-white truncate">
                                  {customer.full_name}
                                </p>
                                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                  {customer.email && (
                                    <span className="flex items-center gap-1 truncate">
                                      <Mail className="h-3 w-3" />
                                      {customer.email}
                                    </span>
                                  )}
                                  {customer.phone && (
                                    <span className="flex items-center gap-1">
                                      <Phone className="h-3 w-3" />
                                      {customer.phone}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>

          {/* Tipo de Plan */}
          <div className="space-y-2">
            <Label className="dark:text-gray-200">Tipo de Plan *</Label>
            <Select value={passTypeId} onValueChange={setPassTypeId}>
              <SelectTrigger className="dark:bg-gray-700 dark:border-gray-600">
                <SelectValue placeholder="Selecciona un plan" />
              </SelectTrigger>
              <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                {passTypes.map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    <div className="flex items-center justify-between w-full">
                      <span>{type.name}</span>
                      <span className="ml-2 text-sm text-gray-500">
                        {formatCurrency(type.price)} / {type.duration_days} días
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Fechas y Precio */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="dark:text-gray-200">Fecha Inicio *</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="dark:bg-gray-700 dark:border-gray-600"
              />
            </div>
            <div className="space-y-2">
              <Label className="dark:text-gray-200">Fecha Fin *</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="dark:bg-gray-700 dark:border-gray-600"
              />
            </div>
            <div className="space-y-2">
              <Label className="dark:text-gray-200">Precio (COP) *</Label>
              <Input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="dark:bg-gray-700 dark:border-gray-600"
              />
            </div>
          </div>

          {/* Vehículos */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="dark:text-gray-200">Vehículos / Placas *</Label>
              <Button type="button" variant="outline" size="sm" onClick={handleAddVehicle}>
                <Plus className="h-4 w-4 mr-1" />
                Agregar
              </Button>
            </div>

            {vehicles.map((vehicle, index) => (
              <div
                key={index}
                className="p-3 rounded-lg border dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50"
              >
                <div className="flex items-center gap-2 mb-3">
                  <Car className="h-4 w-4 text-gray-400" />
                  <span className="text-sm font-medium dark:text-gray-300">
                    Vehículo {index + 1}
                  </span>
                  {vehicle.is_primary && (
                    <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-xs">
                      Principal
                    </Badge>
                  )}
                  {vehicles.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="ml-auto h-6 w-6 p-0"
                      onClick={() => handleRemoveVehicle(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Input
                    placeholder="Placa *"
                    value={vehicle.plate}
                    onChange={(e) => handleVehicleChange(index, 'plate', e.target.value.toUpperCase())}
                    className="dark:bg-gray-700 dark:border-gray-600"
                  />
                  <Input
                    placeholder="Marca"
                    value={vehicle.brand}
                    onChange={(e) => handleVehicleChange(index, 'brand', e.target.value)}
                    className="dark:bg-gray-700 dark:border-gray-600"
                  />
                  <Input
                    placeholder="Modelo"
                    value={vehicle.model}
                    onChange={(e) => handleVehicleChange(index, 'model', e.target.value)}
                    className="dark:bg-gray-700 dark:border-gray-600"
                  />
                  <Select
                    value={vehicle.vehicle_type}
                    onValueChange={(v) => handleVehicleChange(index, 'vehicle_type', v)}
                  >
                    <SelectTrigger className="dark:bg-gray-700 dark:border-gray-600">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="dark:bg-gray-800">
                      <SelectItem value="car">Carro</SelectItem>
                      <SelectItem value="motorcycle">Moto</SelectItem>
                      <SelectItem value="truck">Camión</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {!vehicle.is_primary && vehicles.length > 1 && (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="mt-2 text-blue-600 dark:text-blue-400 p-0 h-auto"
                    onClick={() => handleVehicleChange(index, 'is_primary', true)}
                  >
                    Marcar como principal
                  </Button>
                )}
              </div>
            ))}
          </div>

          <DialogFooter className="gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
              className="dark:border-gray-600"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : isEditing ? (
                'Actualizar Pase'
              ) : (
                'Crear Pase'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default PassFormDialog;
