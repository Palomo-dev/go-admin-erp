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
import { CalendarIcon, Search, Plus, Loader2, X, DollarSign, User, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import Image from 'next/image';
import type { Space } from '@/lib/services/spacesService';
import ReservationsService, { type Customer } from '@/lib/services/reservationsService';
import organizationService from '@/lib/services/organizationService';
import { useOrganization } from '@/lib/hooks/useOrganization';

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
  const [searchTerm, setSearchTerm] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  
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
  
  // Extras
  const [extras, setExtras] = useState<Array<{ name: string; price: number }>>([]);
  const [extraName, setExtraName] = useState('');
  const [extraPrice, setExtraPrice] = useState('');
  
  // Depósito
  const [depositAmount, setDepositAmount] = useState('');
  const [depositMethod, setDepositMethod] = useState('');
  const [depositReference, setDepositReference] = useState('');

  // Cargar métodos de pago al abrir
  useEffect(() => {
    const loadPaymentMethods = async () => {
      if (!organization || !open) return;
      
      setIsLoadingPaymentMethods(true);
      try {
        const methods = await organizationService.getOrganizationPaymentMethods(organization.id);
        setPaymentMethods(methods);
        
        // Seleccionar el primer método por defecto si existe
        if (methods.length > 0 && !depositMethod) {
          setDepositMethod(methods[0].code);
        }
      } catch (error) {
        console.error('Error cargando métodos de pago:', error);
      } finally {
        setIsLoadingPaymentMethods(false);
      }
    };

    loadPaymentMethods();
  }, [organization, open]);

  // Buscar clientes en tiempo real
  useEffect(() => {
    const searchCustomers = async () => {
      if (!organization || !searchTerm.trim()) {
        setCustomers([]);
        return;
      }

      setIsSearching(true);
      try {
        const results = await ReservationsService.searchCustomers(organization.id, searchTerm);
        setCustomers(results);
      } catch (error: any) {
        console.error('Error buscando clientes:', error);
        setCustomers([]);
        toast({
          title: 'Error al buscar clientes',
          description: error?.message || 'No se pudo completar la búsqueda',
          variant: 'destructive',
        });
      } finally {
        setIsSearching(false);
      }
    };

    const debounce = setTimeout(() => {
      searchCustomers();
    }, 300);

    return () => clearTimeout(debounce);
  }, [searchTerm, organization]);
  
  // Agregar extra
  const handleAddExtra = () => {
    if (!extraName.trim() || !extraPrice) return;
    
    setExtras([...extras, { name: extraName, price: parseFloat(extraPrice) }]);
    setExtraName('');
    setExtraPrice('');
  };
  
  // Eliminar extra
  const handleRemoveExtra = (index: number) => {
    setExtras(extras.filter((_, i) => i !== index));
  };
  
  // Calcular total
  const calculateTotal = () => {
    const nights = calculateNights();
    const roomTotal = (space.space_types?.base_rate || 0) * nights;
    const extrasTotal = extras.reduce((sum, extra) => sum + extra.price, 0);
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
          extras: extras.length > 0 ? extras : undefined,
          deposit_reference: depositReference || undefined,
        },
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
      setSearchTerm('');
      setSelectedCustomer(null);
      setCustomers([]);
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

  const handleNewCustomer = () => {
    // TODO: Abrir dialog para crear nuevo cliente
    toast({
      title: 'Próximamente',
      description: 'Crear nuevo cliente estará disponible pronto',
    });
  };

  const calculateNights = () => {
    const diffTime = Math.abs(checkout.getTime() - checkin.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[500px] sm:w-[600px] overflow-y-auto bg-white dark:bg-gray-950">
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
            <Label htmlFor="customer">Cliente *</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="customer"
                  placeholder="Buscar por nombre, email o teléfono..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pr-8"
                />
                {isSearching && (
                  <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleNewCustomer}
                title="Nuevo Cliente"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* Lista de clientes */}
            {customers.length > 0 && (
              <div className="border rounded-lg max-h-40 overflow-y-auto">
                {customers.map((customer) => (
                  <button
                    key={customer.id}
                    type="button"
                    className={`w-full text-left p-3 hover:bg-gray-100 dark:hover:bg-gray-800 border-b last:border-b-0 ${
                      selectedCustomer?.id === customer.id
                        ? 'bg-blue-50 dark:bg-blue-900/20'
                        : ''
                    }`}
                    onClick={() => {
                      setSelectedCustomer(customer);
                      setSearchTerm(''); // Limpiar búsqueda
                      setCustomers([]); // Limpiar resultados
                    }}
                  >
                    <div className="flex items-center gap-3">
                      {/* Avatar del cliente */}
                      <div className="flex-shrink-0">
                        {customer.avatar_url ? (
                          <div className="relative w-10 h-10 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700">
                            <Image
                              src={customer.avatar_url}
                              alt={`${customer.first_name} ${customer.last_name}`}
                              fill
                              className="object-cover"
                            />
                          </div>
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                            <span className="text-white text-sm font-semibold">
                              {getInitials(customer.first_name, customer.last_name)}
                            </span>
                          </div>
                        )}
                      </div>
                      
                      {/* Información del cliente */}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{`${customer.first_name} ${customer.last_name}`}</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                          {customer.email || customer.phone}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {selectedCustomer && (
              <div className="p-3 border rounded-lg bg-blue-50 dark:bg-blue-900/20">
                <div className="flex items-center gap-3">
                  {/* Avatar del cliente seleccionado */}
                  <div className="flex-shrink-0">
                    {selectedCustomer.avatar_url ? (
                      <div className="relative w-12 h-12 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700 ring-2 ring-blue-500">
                        <Image
                          src={selectedCustomer.avatar_url}
                          alt={`${selectedCustomer.first_name} ${selectedCustomer.last_name}`}
                          fill
                          className="object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center ring-2 ring-blue-500">
                        <span className="text-white text-base font-semibold">
                          {getInitials(selectedCustomer.first_name, selectedCustomer.last_name)}
                        </span>
                      </div>
                    )}
                  </div>
                  
                  {/* Información del cliente */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">
                      {`${selectedCustomer.first_name} ${selectedCustomer.last_name}`}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {selectedCustomer.email || selectedCustomer.phone}
                    </p>
                  </div>
                </div>
              </div>
            )}
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
              <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
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

          {/* Extras */}
          <div className="space-y-2">
            <Label>Extras / Servicios Adicionales</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Nombre del servicio"
                value={extraName}
                onChange={(e) => setExtraName(e.target.value)}
                className="flex-1"
              />
              <Input
                type="number"
                placeholder="Precio"
                value={extraPrice}
                onChange={(e) => setExtraPrice(e.target.value)}
                className="w-32"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleAddExtra}
                disabled={!extraName.trim() || !extraPrice}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            
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
              <span className="text-gray-600 dark:text-gray-400">Habitación ({calculateNights()} noches)</span>
              <span className="font-medium">${((space.space_types?.base_rate || 0) * calculateNights()).toLocaleString()}</span>
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
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-blue-600" />
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
