'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Loader2, Search, Plus, X, Car } from 'lucide-react';
import ParkingService, { type ParkingPass, type ParkingPassType } from '@/lib/services/parkingService';
import { addDays, format } from 'date-fns';
import { useTranslations } from 'next-intl';

interface VehicleInput {
  plate: string;
  brand: string;
  model: string;
  color: string;
  vehicle_type: string;
  is_primary: boolean;
}

interface PassDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pass?: ParkingPass | null;
  passTypes: ParkingPassType[];
  organizationId: number;
  onSave: () => void;
}

interface Customer {
  id: string;
  full_name: string;
  email?: string;
  phone?: string;
}

const emptyVehicle: VehicleInput = {
  plate: '',
  brand: '',
  model: '',
  color: '',
  vehicle_type: 'car',
  is_primary: false,
};

export function PassDialog({ 
  open, 
  onOpenChange, 
  pass, 
  passTypes, 
  organizationId,
  onSave 
}: PassDialogProps) {
  const t = useTranslations('pmsParking');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [vehicles, setVehicles] = useState<VehicleInput[]>([{ ...emptyVehicle, is_primary: true }]);
  const [selectedPassTypeId, setSelectedPassTypeId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [price, setPrice] = useState('');
  
  // Customer search
  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const isEditMode = !!pass;

  useEffect(() => {
    if (open) {
      if (pass) {
        // Cargar vehículos existentes
        const existingVehicles = pass.vehicles?.map(v => ({
          plate: v.vehicle?.plate || '',
          brand: v.vehicle?.brand || '',
          model: v.vehicle?.model || '',
          color: v.vehicle?.color || '',
          vehicle_type: v.vehicle?.vehicle_type || 'car',
          is_primary: v.is_primary,
        })) || [{ ...emptyVehicle, is_primary: true }];
        
        setVehicles(existingVehicles.length > 0 ? existingVehicles : [{ ...emptyVehicle, is_primary: true }]);
        setSelectedPassTypeId(pass.pass_type_id || '');
        setStartDate(pass.start_date);
        setEndDate(pass.end_date);
        setPrice(pass.price.toString());
        if (pass.customer) {
          setSelectedCustomer(pass.customer as Customer);
        }
      } else {
        // Default values for new pass
        const today = new Date();
        setVehicles([{ ...emptyVehicle, is_primary: true }]);
        setSelectedPassTypeId('');
        setStartDate(format(today, 'yyyy-MM-dd'));
        setEndDate(format(addDays(today, 30), 'yyyy-MM-dd'));
        setPrice('');
        setSelectedCustomer(null);
        setCustomerSearch('');
        setCustomers([]);
      }
    }
  }, [open, pass]);

  // Update end date and price when pass type changes
  useEffect(() => {
    if (selectedPassTypeId && !isEditMode) {
      const passType = passTypes.find(pt => pt.id === selectedPassTypeId);
      if (passType) {
        const start = startDate ? new Date(startDate) : new Date();
        setEndDate(format(addDays(start, passType.duration_days), 'yyyy-MM-dd'));
        setPrice(passType.price.toString());
      }
    }
  }, [selectedPassTypeId, startDate, passTypes, isEditMode]);

  const handleSearchCustomers = async () => {
    if (!customerSearch.trim() || customerSearch.length < 2) return;
    
    setIsSearching(true);
    try {
      const results = await ParkingService.searchCustomers(organizationId, customerSearch);
      setCustomers(results);
    } catch (error) {
      console.error('Error buscando clientes:', error);
    } finally {
      setIsSearching(false);
    }
  };

  // Funciones para gestionar vehículos
  const addVehicle = () => {
    setVehicles([...vehicles, { ...emptyVehicle }]);
  };

  const removeVehicle = (index: number) => {
    if (vehicles.length > 1) {
      const newVehicles = vehicles.filter((_, i) => i !== index);
      // Si eliminamos el primario, hacer primario al primero
      if (vehicles[index].is_primary && newVehicles.length > 0) {
        newVehicles[0].is_primary = true;
      }
      setVehicles(newVehicles);
    }
  };

  const updateVehicle = (index: number, field: keyof VehicleInput, value: string | boolean) => {
    const newVehicles = [...vehicles];
    if (field === 'is_primary' && value === true) {
      // Solo uno puede ser primario
      newVehicles.forEach((v, i) => {
        v.is_primary = i === index;
      });
    } else {
      (newVehicles[index] as any)[field] = value;
    }
    setVehicles(newVehicles);
  };

  const hasValidVehicles = vehicles.some(v => v.plate.trim() !== '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedCustomer || !hasValidVehicles || !selectedPassTypeId) {
      return;
    }

    const passType = passTypes.find(pt => pt.id === selectedPassTypeId);
    const validVehicles = vehicles.filter(v => v.plate.trim() !== '');

    setIsSubmitting(true);
    try {
      if (isEditMode && pass) {
        await ParkingService.updatePass(pass.id, {
          pass_type_id: selectedPassTypeId,
          start_date: startDate,
          end_date: endDate,
          price: parseFloat(price),
          plan_name: passType?.name || '',
          vehicles: validVehicles,
        });
      } else {
        await ParkingService.createPass({
          organization_id: organizationId,
          customer_id: selectedCustomer.id,
          pass_type_id: selectedPassTypeId,
          start_date: startDate,
          end_date: endDate,
          price: parseFloat(price),
          plan_name: passType?.name || '',
          vehicles: validVehicles,
        });
      }
      onSave();
      onOpenChange(false);
    } catch (error) {
      console.error('Error guardando pase:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? t('passFormDialog.editarPase') : t('passFormDialog.nuevoPaseAbonado')}
          </DialogTitle>
          <DialogDescription>
            {isEditMode 
              ? t('passDialog.modificaDatosPaseEstacionamiento')
              : t('passDialog.creaNuevoPaseEstacionamiento')
            }
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Cliente */}
          <div className="space-y-2">
            <Label>{t('passFormDialog.cliente')}</Label>
            {selectedCustomer ? (
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {selectedCustomer.full_name}
                </p>
                {selectedCustomer.email && (
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {selectedCustomer.email}
                  </p>
                )}
                {!isEditMode && (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    onClick={() => setSelectedCustomer(null)}
                    className="p-0 h-auto text-blue-600 dark:text-blue-400"
                  >
                    {t('passDialog.cambiarCliente')}
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    placeholder={t('passFormDialog.buscarNombreEmailTelefono')}
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleSearchCustomers())}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSearchCustomers}
                    disabled={isSearching}
                  >
                    {isSearching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                {customers.length > 0 && (
                  <div className="border rounded-lg max-h-40 overflow-y-auto">
                    {customers.map((customer) => (
                      <button
                        key={customer.id}
                        type="button"
                        onClick={() => {
                          setSelectedCustomer(customer);
                          setCustomers([]);
                        }}
                        className="w-full p-2 text-left hover:bg-gray-100 dark:hover:bg-gray-800 border-b last:border-b-0"
                      >
                        <p className="font-medium text-sm">{customer.full_name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{customer.email || customer.phone}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Vehículos */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>{t('passDialog.vehiculos')}</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addVehicle}
                className="h-7 text-xs"
              >
                <Plus className="h-3 w-3 mr-1" />
                {t('passFormDialog.agregar')}
              </Button>
            </div>
            
            <div className="space-y-3 max-h-48 overflow-y-auto">
              {vehicles.map((vehicle, index) => (
                <div 
                  key={index} 
                  className="p-3 border rounded-lg bg-gray-50 dark:bg-gray-800 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      <Car className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                      <span className="text-sm font-medium">{t('passFormDialog.vehiculo', { index: index + 1 })}</span>
                      {vehicle.is_primary && (
                        <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-0.5 rounded">
                          {t('passVehiclesDialog.principal')}
                        </span>
                      )}
                    </div>
                    {vehicles.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeVehicle(index)}
                        className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder={t('passVehiclesDialog.placa')}
                      value={vehicle.plate}
                      onChange={(e) => updateVehicle(index, 'plate', e.target.value.toUpperCase())}
                      className="uppercase text-sm"
                    />
                    <Select 
                      value={vehicle.vehicle_type} 
                      onValueChange={(val) => updateVehicle(index, 'vehicle_type', val)}
                    >
                      <SelectTrigger className="text-sm">
                        <SelectValue placeholder={t('passDialog.tipo')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="car">{t('passVehiclesDialog.carro')}</SelectItem>
                        <SelectItem value="motorcycle">{t('passVehiclesDialog.moto')}</SelectItem>
                        <SelectItem value="truck">{t('passDialog.camioneta')}</SelectItem>
                        <SelectItem value="other">{t('passDialog.otro')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-2">
                    <Input
                      placeholder={t('passVehiclesDialog.marca')}
                      value={vehicle.brand}
                      onChange={(e) => updateVehicle(index, 'brand', e.target.value)}
                      className="text-sm"
                    />
                    <Input
                      placeholder={t('passVehiclesDialog.modelo')}
                      value={vehicle.model}
                      onChange={(e) => updateVehicle(index, 'model', e.target.value)}
                      className="text-sm"
                    />
                    <Input
                      placeholder={t('passDialog.color')}
                      value={vehicle.color}
                      onChange={(e) => updateVehicle(index, 'color', e.target.value)}
                      className="text-sm"
                    />
                  </div>
                  
                  {!vehicle.is_primary && (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      onClick={() => updateVehicle(index, 'is_primary', true)}
                      className="h-6 p-0 text-xs text-blue-600 dark:text-blue-400"
                    >
                      {t('passVehiclesDialog.marcarComoPrincipal')}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Tipo de Plan */}
          <div className="space-y-2">
            <Label>{t('passFormDialog.tipoPlan')}</Label>
            <Select value={selectedPassTypeId} onValueChange={setSelectedPassTypeId} required>
              <SelectTrigger>
                <SelectValue placeholder={t('passDialog.seleccionarPlan')} />
              </SelectTrigger>
              <SelectContent>
                {passTypes.map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {t('passDialog.dias', { name: type.name, price: type.price.toLocaleString(), duration_days: type.duration_days })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Fechas */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start_date">{t('passDialog.fechaInicio')}</Label>
              <Input
                id="start_date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end_date">{t('passDialog.fechaFin')}</Label>
              <Input
                id="end_date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Precio */}
          <div className="space-y-2">
            <Label htmlFor="price">{t('passDialog.precio')}</Label>
            <Input
              id="price"
              type="number"
              min="0"
              step="100"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              {t('passVehiclesDialog.cancelar')}
            </Button>
            <Button 
              type="submit" 
              disabled={isSubmitting || !selectedCustomer || !hasValidVehicles || !selectedPassTypeId}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('passFormDialog.guardando')}
                </>
              ) : (
                isEditMode ? t('passDialog.guardarCambios') : t('passDialog.crearPase')
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
