'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Plus, Loader2, X, DollarSign, AlertTriangle, Link2 } from 'lucide-react';
import { format } from 'date-fns';
import type { Space } from '@/lib/services/spacesService';
import ReservationsService from '@/lib/services/reservationsService';
import RatesService from '@/lib/services/ratesService';
import spaceServicesService, { type OrgServiceView } from '@/lib/services/spaceServicesService';
import organizationService from '@/lib/services/organizationService';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { CustomerSelector } from '@/components/pos/CustomerSelector';
import type { Customer as POSCustomer } from '@/components/pos/types';
import { Badge } from '@/components/ui/badge';

interface QuickReservationDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  space: Space;
}

export function QuickReservationDrawer({
  open,
  onOpenChange,
  space,
}: QuickReservationDrawerProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { organization } = useOrganization();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<POSCustomer | null>(null);
  
  // Métodos de pago
  const [paymentMethods, setPaymentMethods] = useState<Array<{
    code: string;
    name: string;
    requires_reference: boolean;
  }>>([]);
  const [isLoadingPaymentMethods, setIsLoadingPaymentMethods] = useState(false);
  
  const [checkin, setCheckin] = useState<Date>(new Date());
  const [checkout, setCheckout] = useState<Date>(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  });
  const [occupantCount, setOccupantCount] = useState(1);
  const [notes, setNotes] = useState('');
  
  // Extras (ahora servicios de la organización)
  const [extras, setExtras] = useState<Array<{ name: string; price: number; organization_service_id?: string | null; quantity: number }>>([]);
  const [availableServices, setAvailableServices] = useState<OrgServiceView[]>([]);
  const [isLoadingServices, setIsLoadingServices] = useState(false);

  // Tarifa dinámica
  const [dynamicRate, setDynamicRate] = useState<{ dailyRate: number; rateSource: 'tarifa' | 'base_rate' } | null>(null);
  
  // Depósito
  const [depositAmount, setDepositAmount] = useState('');
  const [depositMethod, setDepositMethod] = useState('');
  const [depositReference, setDepositReference] = useState('');

  // Cargar métodos de pago y servicios al abrir
  useEffect(() => {
    const loadPaymentMethods = async () => {
      if (!organization || !open) return;
      
      setIsLoadingPaymentMethods(true);
      try {
        const methods = await organizationService.getOrganizationPaymentMethods(organization.id);
        setPaymentMethods(methods);
        
        if (methods.length > 0 && !depositMethod) {
          setDepositMethod(methods[0].code);
        }
      } catch (error) {
        console.error('Error cargando métodos de pago:', error);
      } finally {
        setIsLoadingPaymentMethods(false);
      }
    };

    const loadServices = async () => {
      if (!organization || !open) return;
      setIsLoadingServices(true);
      try {
        const services = await spaceServicesService.getActiveServicesForExtras(organization.id);
        setAvailableServices(services);
      } catch (error) {
        console.error('Error cargando servicios:', error);
      } finally {
        setIsLoadingServices(false);
      }
    };

    loadPaymentMethods();
    loadServices();
  }, [organization, open]);

  // Cargar tarifa dinámica cuando cambian las fechas
  useEffect(() => {
    const loadRate = async () => {
      if (!organization || !open) return;
      const spaceTypeId = space.space_type_id || space.space_types?.id;
      if (!spaceTypeId) return;

      try {
        const rateInfo = await RatesService.getRateForDate(
          organization.id,
          spaceTypeId,
          format(checkin, 'yyyy-MM-dd')
        );
        setDynamicRate({
          dailyRate: rateInfo.price,
          rateSource: rateInfo.isFromRates ? 'tarifa' : 'base_rate',
        });
      } catch {
        setDynamicRate({
          dailyRate: space.space_types?.base_rate || 0,
          rateSource: 'base_rate',
        });
      }
    };

    loadRate();
  }, [organization, open, checkin, space]);

  
  // Agregar servicio como extra
  const handleAddService = (svc: OrgServiceView) => {
    const existing = extras.find((e) => e.organization_service_id === svc.org_service_id);
    if (existing) return;
    setExtras([...extras, {
      name: svc.name,
      price: svc.price,
      organization_service_id: svc.org_service_id,
      quantity: 1,
    }]);
  };

  // Eliminar extra
  const handleRemoveExtra = (index: number) => {
    setExtras(extras.filter((_, i) => i !== index));
  };

  // Calcular total con tarifa dinámica
  const calculateTotal = () => {
    const nights = calculateNights();
    const dailyRate = dynamicRate?.dailyRate ?? space.space_types?.base_rate ?? 0;
    const roomTotal = dailyRate * nights;
    const extrasTotal = extras.reduce((sum, extra) => sum + extra.price * extra.quantity, 0);
    return roomTotal + extrasTotal;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedCustomer) {
      toast({
        title: 'Cliente Requerido',
        description: 'Por favor selecciona un cliente',
        variant: 'destructive',
      });
      return;
    }

    // Validar referencia si el método de pago lo requiere
    const hasDeposit = depositAmount && parseFloat(depositAmount) > 0;
    if (hasDeposit && depositMethod) {
      const selectedMethod = paymentMethods.find(m => m.code === depositMethod);
      if (selectedMethod?.requires_reference && !depositReference.trim()) {
        toast({
          title: 'Referencia Requerida',
          description: `El método de pago ${selectedMethod.name} requiere una referencia`,
          variant: 'destructive',
        });
        return;
      }
    }

    if (!organization) return;

    setIsSubmitting(true);

    try {
      const total = calculateTotal();
      const dailyRate = dynamicRate?.dailyRate ?? space.space_types?.base_rate ?? 0;
      
      const reservationData = {
        customer_id: selectedCustomer.id,
        organization_id: organization.id,
        branch_id: organization.branch_id,
        checkin: format(checkin, 'yyyy-MM-dd'),
        checkout: format(checkout, 'yyyy-MM-dd'),
        occupant_count: occupantCount,
        spaces: [space.id],
        total_estimated: total,
        notes,
        metadata: {
          deposit_reference: depositReference || undefined,
        },
        extras: extras.map((e) => ({
          organization_service_id: e.organization_service_id || null,
          name: e.name,
          unit_price: e.price,
          quantity: e.quantity,
        })),
        payment_method: depositAmount && parseFloat(depositAmount) > 0 ? depositMethod : undefined,
        payment_amount: depositAmount && parseFloat(depositAmount) > 0 ? parseFloat(depositAmount) : undefined,
      };

      await ReservationsService.createReservation(reservationData);

      toast({
        title: 'Reserva Creada',
        description: `Reserva creada exitosamente para ${space.label}`,
      });

      onOpenChange(false);
      
      // Reset form
      setSelectedCustomer(null);
      setExtras([]);
      setDepositAmount('');
      setDepositMethod(paymentMethods.length > 0 ? paymentMethods[0].code : '');
      setDepositReference('');
      setNotes('');
      setCheckin(new Date());
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setCheckout(tomorrow);
      setOccupantCount(1);
      
      router.push('/app/pms/reservas');
    } catch (error: any) {
      console.error('Error creando reserva:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo crear la reserva',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const calculateNights = () => {
    const diffTime = Math.abs(checkout.getTime() - checkin.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-1/2 min-w-[400px] sm:max-w-none overflow-y-auto bg-white dark:bg-gray-900">
        <SheetHeader>
          <SheetTitle>Nueva Reserva Rápida</SheetTitle>
          <SheetDescription>
            Crear reserva para {space.label}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-6">
          {/* Espacio (solo info, no editable) */}
          <div className="space-y-2">
            <Label>Espacio</Label>
            <div className="p-3 border rounded-lg bg-gray-50 dark:bg-gray-900">
              <p className="font-medium">{space.label}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {space.space_types?.name}
              </p>
            </div>
          </div>

          {/* Cliente */}
          <div className="space-y-2">
            <Label>Cliente *</Label>
            <CustomerSelector
              selectedCustomer={selectedCustomer || undefined}
              onCustomerSelect={(customer) => setSelectedCustomer(customer || null)}
            />
          </div>

          {/* Fechas */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Check-in *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(checkin, 'dd/MM/yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={checkin}
                    onSelect={(date) => date && setCheckin(date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Check-out *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(checkout, 'dd/MM/yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={checkout}
                    onSelect={(date) => date && setCheckout(date)}
                    initialFocus
                    disabled={(date) => date < checkin}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Noches calculadas */}
          <div className="p-3 border rounded-lg bg-gray-50 dark:bg-gray-900">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {calculateNights()} {calculateNights() === 1 ? 'noche' : 'noches'}
            </p>
          </div>

          {/* Ocupantes */}
          <div className="space-y-2">
            <Label htmlFor="occupants">Número de Ocupantes *</Label>
            <Input
              id="occupants"
              type="number"
              min="1"
              value={occupantCount}
              onChange={(e) => setOccupantCount(parseInt(e.target.value) || 1)}
              required
              className={occupantCount > (space.space_types?.capacity || 0) ? 'border-amber-500 focus:ring-amber-500' : ''}
            />
            
            {/* Alerta de capacidad excedida */}
            {occupantCount > (space.space_types?.capacity || 0) && (
              <div className="flex flex-wrap items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                    Capacidad excedida
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                    Este espacio tiene capacidad para {space.space_types?.capacity} {space.space_types?.capacity === 1 ? 'persona' : 'personas'}. 
                    Has indicado {occupantCount} ocupantes.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Extras / Servicios de la organización */}
          <div className="space-y-2">
            <Label>Extras / Servicios Adicionales</Label>
            {isLoadingServices ? (
              <div className="flex items-center gap-2 py-2">
                <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />
                <span className="text-sm text-gray-500 dark:text-gray-400">Cargando servicios...</span>
              </div>
            ) : availableServices.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500">
                No hay servicios activos. Configúralos en PMS &gt; Servicios.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {availableServices.map((svc) => {
                  const added = extras.some((e) => e.organization_service_id === svc.org_service_id);
                  return (
                    <Button
                      key={svc.org_service_id}
                      type="button"
                      variant={added ? 'default' : 'outline'}
                      size="sm"
                      className="justify-start text-xs h-auto py-2"
                      onClick={() => !added && handleAddService(svc)}
                      disabled={added}
                    >
                      <div className="flex flex-col items-start gap-0.5">
                        <span className="font-medium">{svc.name}</span>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] opacity-70">
                            {svc.price > 0 ? `$${svc.price.toFixed(2)}` : 'Cortesía'}
                          </span>
                          {svc.linked_product_id && (
                            <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 gap-0.5">
                              <Link2 className="h-2 w-2" /> POS
                            </Badge>
                          )}
                        </div>
                      </div>
                    </Button>
                  );
                })}
              </div>
            )}
            
            {extras.length > 0 && (
              <div className="border rounded-lg divide-y">
                {extras.map((extra, index) => (
                  <div key={index} className="flex items-center justify-between p-3">
                    <div>
                      <p className="font-medium">{extra.name}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        ${extra.price.toLocaleString()}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveExtra(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {/* Resumen de Costos */}
          <div className="p-4 border rounded-lg bg-blue-50 dark:bg-blue-900/20 space-y-2">
            <div className="flex justify-between text-sm">
              <div className="flex items-center gap-1.5">
                <span className="text-gray-600 dark:text-gray-400">Habitación ({calculateNights()} noches)</span>
                {dynamicRate?.rateSource === 'tarifa' && (
                  <Badge variant="outline" className="text-[9px] px-1 py-0 border-green-300 dark:border-green-700 text-green-600 dark:text-green-400">
                    Tarifa especial
                  </Badge>
                )}
              </div>
              <span className="font-medium">${((dynamicRate?.dailyRate ?? space.space_types?.base_rate ?? 0) * calculateNights()).toLocaleString()}</span>
            </div>
            {extras.length > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Extras</span>
                <span className="font-medium">${extras.reduce((sum, e) => sum + e.price, 0).toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold border-t pt-2">
              <span>Total</span>
              <span>${calculateTotal().toLocaleString()}</span>
            </div>
          </div>
          
          {/* Depósito / Pago Inicial */}
          <div className="space-y-4 border rounded-lg p-4">
            <div className="flex flex-wrap items-center gap-2">
              <DollarSign className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <Label className="text-base font-semibold">Depósito / Pago Inicial</Label>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="depositAmount">Monto del Depósito</Label>
              <Input
                id="depositAmount"
                type="number"
                placeholder="0.00"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="depositMethod">Método de Pago</Label>
              <Select 
                value={depositMethod} 
                onValueChange={setDepositMethod}
                disabled={isLoadingPaymentMethods || paymentMethods.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder={isLoadingPaymentMethods ? "Cargando..." : "Seleccionar método"} />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods.map((method) => (
                    <SelectItem key={method.code} value={method.code}>
                      {method.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {paymentMethods.length === 0 && !isLoadingPaymentMethods && (
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  No hay métodos de pago configurados. Contacte al administrador.
                </p>
              )}
            </div>
            
            {depositMethod && paymentMethods.find(m => m.code === depositMethod)?.requires_reference && (
              <div className="space-y-2">
                <Label htmlFor="depositReference">Referencia *</Label>
                <Input
                  id="depositReference"
                  placeholder="Número de referencia o autorización"
                  value={depositReference}
                  onChange={(e) => setDepositReference(e.target.value)}
                  required
                />
              </div>
            )}
          </div>

          {/* Notas */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notas</Label>
            <Textarea
              id="notes"
              placeholder="Notas adicionales sobre la reserva..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          {/* Botones */}
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !selectedCustomer}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creando...
                </>
              ) : (
                'Confirmar Reserva'
              )}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
