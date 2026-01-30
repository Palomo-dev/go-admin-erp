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
import { Loader2, Search } from 'lucide-react';
import ParkingService, { type ParkingPass, type ParkingPassType } from '@/lib/services/parkingService';
import { addDays, format } from 'date-fns';

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

export function PassDialog({ 
  open, 
  onOpenChange, 
  pass, 
  passTypes, 
  organizationId,
  onSave 
}: PassDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [vehiclePlate, setVehiclePlate] = useState('');
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
        setVehiclePlate(pass.vehicle_plate);
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
        setVehiclePlate('');
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedCustomer || !vehiclePlate.trim() || !selectedPassTypeId) {
      return;
    }

    const passType = passTypes.find(pt => pt.id === selectedPassTypeId);

    setIsSubmitting(true);
    try {
      if (isEditMode && pass) {
        await ParkingService.updatePass(pass.id, {
          vehicle_plate: vehiclePlate.toUpperCase().trim(),
          pass_type_id: selectedPassTypeId,
          start_date: startDate,
          end_date: endDate,
          price: parseFloat(price),
          plan_name: passType?.name || '',
        });
      } else {
        await ParkingService.createPass({
          organization_id: organizationId,
          customer_id: selectedCustomer.id,
          vehicle_plate: vehiclePlate.toUpperCase().trim(),
          pass_type_id: selectedPassTypeId,
          start_date: startDate,
          end_date: endDate,
          price: parseFloat(price),
          plan_name: passType?.name || '',
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
            {isEditMode ? 'Editar Pase' : 'Nuevo Pase de Abonado'}
          </DialogTitle>
          <DialogDescription>
            {isEditMode 
              ? 'Modifica los datos del pase de estacionamiento'
              : 'Crea un nuevo pase de estacionamiento para un cliente'
            }
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Cliente */}
          <div className="space-y-2">
            <Label>Cliente *</Label>
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
                    className="p-0 h-auto text-blue-600"
                  >
                    Cambiar cliente
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    placeholder="Buscar por nombre, email o teléfono"
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
                        <p className="text-xs text-gray-500">{customer.email || customer.phone}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Placa */}
          <div className="space-y-2">
            <Label htmlFor="vehicle_plate">Placa del Vehículo *</Label>
            <Input
              id="vehicle_plate"
              placeholder="ABC123"
              value={vehiclePlate}
              onChange={(e) => setVehiclePlate(e.target.value)}
              className="uppercase"
              required
            />
          </div>

          {/* Tipo de Plan */}
          <div className="space-y-2">
            <Label>Tipo de Plan *</Label>
            <Select value={selectedPassTypeId} onValueChange={setSelectedPassTypeId} required>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar plan" />
              </SelectTrigger>
              <SelectContent>
                {passTypes.map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.name} - ${type.price.toLocaleString()} ({type.duration_days} días)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Fechas */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start_date">Fecha Inicio</Label>
              <Input
                id="start_date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end_date">Fecha Fin</Label>
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
            <Label htmlFor="price">Precio</Label>
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
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={isSubmitting || !selectedCustomer || !vehiclePlate.trim() || !selectedPassTypeId}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                isEditMode ? 'Guardar Cambios' : 'Crear Pase'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
