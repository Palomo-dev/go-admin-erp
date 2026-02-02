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
  Car,
  CircleCheck,
  Wrench,
  LogOut,
  Loader2,
  DollarSign,
  CreditCard,
  Banknote,
  Receipt,
  FileText,
  Calendar,
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import parkingMapService, {
  type ParkingSpace,
  type SpaceState,
} from '@/lib/services/parkingMapService';
import parkingRateService, {
  type ParkingRate,
  type CalculatedFee,
} from '@/lib/services/parkingRateService';
import parkingFinanceService from '@/lib/services/parkingFinanceService';
import parkingPaymentService, {
  type OrganizationPaymentMethod,
} from '@/lib/services/parkingPaymentService';
import { supabase } from '@/lib/supabase/config';

interface SpaceDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  space: ParkingSpace | null;
  branchId: number;
  onSuccess: () => void;
}

interface Customer {
  id: string;
  full_name: string;
}

const METHOD_ICONS: Record<string, React.ReactNode> = {
  cash: <Banknote className="h-4 w-4" />,
  card: <CreditCard className="h-4 w-4" />,
  transfer: <Receipt className="h-4 w-4" />,
  nequi: <CreditCard className="h-4 w-4" />,
  daviplata: <CreditCard className="h-4 w-4" />,
};

const STATE_LABELS: Record<SpaceState, string> = {
  free: 'Libre',
  occupied: 'Ocupado',
  reserved: 'Reservado',
  maintenance: 'Mantenimiento',
};

const STATE_COLORS: Record<SpaceState, string> = {
  free: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  occupied: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  reserved: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  maintenance: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
};

export function SpaceDetailDialog({
  open,
  onOpenChange,
  space,
  branchId,
  onSuccess,
}: SpaceDetailDialogProps) {
  const { toast } = useToast();
  const { organization } = useOrganization();
  const [isLoading, setIsLoading] = useState(false);
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [vehicleType, setVehicleType] = useState('car');
  
  // Estado para tarifas
  const [rate, setRate] = useState<ParkingRate | null>(null);
  const [calculatedFee, setCalculatedFee] = useState<CalculatedFee | null>(null);
  const [loadingRate, setLoadingRate] = useState(false);

  // Estado para pago integrado
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<OrganizationPaymentMethod[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [hasInvoicing, setHasInvoicing] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('cash');
  const [isCredit, setIsCredit] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [dueDays, setDueDays] = useState(30);
  const [generateInvoice, setGenerateInvoice] = useState(false);

  // Cargar tarifa y datos de pago cuando hay sesión activa
  useEffect(() => {
    const loadData = async () => {
      if (!organization?.id || !space?.active_session) {
        setRate(null);
        setCalculatedFee(null);
        return;
      }

      setLoadingRate(true);
      try {
        // Cargar tarifa
        const vehicleRate = await parkingRateService.getRateByVehicleType(
          organization.id,
          space.active_session.vehicle_type
        );
        setRate(vehicleRate);

        if (space.active_session.entry_at) {
          const entryTime = new Date(space.active_session.entry_at);
          const fee = parkingRateService.calculateFee(vehicleRate, entryTime);
          setCalculatedFee(fee);
        }

        // Cargar métodos de pago, clientes y verificar facturación
        const [methods, customersData, invoicingEnabled] = await Promise.all([
          parkingPaymentService.getPaymentMethods(organization.id),
          supabase
            .from('customers')
            .select('id, full_name')
            .eq('organization_id', organization.id)
            .order('full_name'),
          parkingFinanceService.hasInvoicingEnabled(organization.id, branchId),
        ]);

        setPaymentMethods(methods);
        setCustomers(customersData.data || []);
        setHasInvoicing(invoicingEnabled);
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoadingRate(false);
      }
    };

    if (open && space?.state === 'occupied') {
      loadData();
      setShowPaymentForm(false);
      setIsCredit(false);
      setSelectedCustomerId('');
      setGenerateInvoice(false);
      setSelectedPaymentMethod('cash');
      // Actualizar cada 60 segundos
      const interval = setInterval(loadData, 60000);
      return () => clearInterval(interval);
    }
  }, [open, space, organization?.id, branchId]);

  const handleChangeState = async (newState: SpaceState) => {
    if (!space) return;

    setIsLoading(true);
    try {
      await parkingMapService.updateSpaceState(space.id, newState);
      toast({
        title: 'Estado actualizado',
        description: `El espacio ${space.label} ahora está ${STATE_LABELS[newState].toLowerCase()}`,
      });
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Error updating state:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el estado',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAssignSpace = async () => {
    if (!space || !vehiclePlate.trim()) {
      toast({
        title: 'Error',
        description: 'Ingrese la placa del vehículo',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      await parkingMapService.assignSpaceToSession({
        space_id: space.id,
        vehicle_plate: vehiclePlate,
        vehicle_type: vehicleType,
        branch_id: branchId,
      });
      toast({
        title: 'Espacio asignado',
        description: `Vehículo ${vehiclePlate.toUpperCase()} asignado al espacio ${space.label}`,
      });
      setVehiclePlate('');
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Error assigning space:', error);
      toast({
        title: 'Error',
        description: 'No se pudo asignar el espacio',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleReleaseSpace = async () => {
    if (!space || !space.active_session) return;

    setIsLoading(true);
    try {
      await parkingMapService.releaseSpace(space.id, space.active_session.id);
      toast({
        title: 'Espacio liberado',
        description: `El espacio ${space.label} ha sido liberado`,
      });
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Error releasing space:', error);
      toast({
        title: 'Error',
        description: 'No se pudo liberar el espacio',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePayment = async () => {
    if (!space?.active_session || !organization?.id || !calculatedFee) return;

    setIsLoading(true);
    try {
      if (isCredit && selectedCustomerId) {
        // Registrar como crédito
        await parkingFinanceService.registerParkingExitOnCredit({
          organization_id: organization.id,
          branch_id: branchId,
          source_type: 'parking_session',
          source_id: space.active_session.id,
          amount: calculatedFee.amount,
          customer_id: selectedCustomerId,
          due_days: dueDays,
          vehicle_plate: space.active_session.vehicle_plate,
          generate_invoice: generateInvoice,
        });

        // Liberar espacio
        await parkingMapService.releaseSpace(space.id, space.active_session.id);

        toast({
          title: 'Salida registrada a crédito',
          description: `Vehículo ${space.active_session.vehicle_plate}. Cuenta por cobrar: $${calculatedFee.amount.toLocaleString()}`,
        });
      } else if (generateInvoice) {
        // Pago con factura
        await parkingFinanceService.registerParkingPaymentWithInvoice({
          organization_id: organization.id,
          branch_id: branchId,
          source_type: 'parking_session',
          source_id: space.active_session.id,
          amount: calculatedFee.amount,
          payment_method_code: selectedPaymentMethod,
          vehicle_plate: space.active_session.vehicle_plate,
          generate_invoice: true,
        });

        // Liberar espacio
        await parkingMapService.releaseSpace(space.id, space.active_session.id);

        toast({
          title: 'Pago registrado con factura',
          description: `Vehículo ${space.active_session.vehicle_plate}. Cobro: $${calculatedFee.amount.toLocaleString()}`,
        });
      } else {
        // Pago normal sin factura
        await supabase.from('payments').insert({
          organization_id: organization.id,
          branch_id: branchId,
          source: 'parking_session',
          source_id: space.active_session.id,
          method: selectedPaymentMethod,
          amount: calculatedFee.amount,
          currency: 'COP',
          status: 'completed',
        });

        // Liberar espacio
        await parkingMapService.releaseSpace(space.id, space.active_session.id);

        toast({
          title: 'Pago registrado',
          description: `Vehículo ${space.active_session.vehicle_plate}. Cobro: $${calculatedFee.amount.toLocaleString()}`,
        });
      }

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Error processing payment:', error);
      toast({
        title: 'Error',
        description: 'No se pudo procesar el pago',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!space) return null;

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('es-CO', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getDuration = (entryAt: string) => {
    const entry = new Date(entryAt);
    const now = new Date();
    const diffMs = now.getTime() - entry.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md dark:bg-gray-800 dark:border-gray-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-white">
            <Car className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            Espacio {space.label}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Estado actual */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500 dark:text-gray-400">Estado:</span>
            <Badge className={STATE_COLORS[space.state]}>
              {STATE_LABELS[space.state]}
            </Badge>
          </div>

          {/* Tipo */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500 dark:text-gray-400">Tipo:</span>
            <span className="text-gray-900 dark:text-white capitalize">{space.type}</span>
          </div>

          {/* Zona */}
          {space.parking_zone && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500 dark:text-gray-400">Zona:</span>
              <span className="text-gray-900 dark:text-white">{space.parking_zone.name}</span>
            </div>
          )}

          {/* Info de sesión activa */}
          {space.state === 'occupied' && space.active_session && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 space-y-3">
              <p className="font-semibold text-red-700 dark:text-red-400">
                Vehículo Estacionado
              </p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Placa:</span>
                  <p className="font-mono font-bold text-gray-900 dark:text-white">
                    {space.active_session.vehicle_plate}
                  </p>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Tipo:</span>
                  <p className="text-gray-900 dark:text-white capitalize">
                    {space.active_session.vehicle_type}
                  </p>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Entrada:</span>
                  <p className="text-gray-900 dark:text-white">
                    {formatTime(space.active_session.entry_at)}
                  </p>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Duración:</span>
                  <p className="font-semibold text-blue-600 dark:text-blue-400">
                    {getDuration(space.active_session.entry_at)}
                  </p>
                </div>
              </div>

              {/* Sección de Tarifa y Monto a Pagar */}
              <div className="pt-2 border-t border-red-200 dark:border-red-700">
                {loadingRate ? (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Calculando tarifa...
                  </div>
                ) : calculatedFee ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">Tarifa:</span>
                      <span className="text-gray-900 dark:text-white">
                        {rate?.rate_name || 'Sin tarifa'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">Cálculo:</span>
                      <span className="text-gray-700 dark:text-gray-300 text-xs">
                        {calculatedFee.breakdown}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-700 dark:text-gray-300">
                        Total a pagar:
                      </span>
                      <span className="text-xl font-bold text-green-600 dark:text-green-400">
                        ${calculatedFee.amount.toLocaleString()}
                      </span>
                    </div>
                    {calculatedFee.amount > 0 && !showPaymentForm && (
                      <Button
                        onClick={() => setShowPaymentForm(true)}
                        className="w-full bg-green-600 hover:bg-green-700 mt-2"
                      >
                        <CreditCard className="h-4 w-4 mr-2" />
                        Registrar Pago
                      </Button>
                    )}

                    {/* Formulario de pago integrado */}
                    {showPaymentForm && calculatedFee.amount > 0 && (
                      <div className="mt-3 pt-3 border-t border-red-200 dark:border-red-700 space-y-3">
                        {/* Opción de crédito */}
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="mapIsCredit"
                            checked={isCredit}
                            onChange={(e) => setIsCredit(e.target.checked)}
                            className="rounded border-gray-300 dark:border-gray-600"
                          />
                          <Label htmlFor="mapIsCredit" className="flex items-center gap-2 text-xs cursor-pointer">
                            <Calendar className="h-3 w-3 text-orange-500" />
                            Crédito (cuenta por cobrar)
                          </Label>
                        </div>

                        {isCredit ? (
                          <div className="space-y-2">
                            <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                              <SelectTrigger className="h-8 text-xs dark:bg-gray-700">
                                <SelectValue placeholder="Seleccionar cliente" />
                              </SelectTrigger>
                              <SelectContent>
                                {customers.map((c) => (
                                  <SelectItem key={c.id} value={c.id}>
                                    {c.full_name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Input
                              type="number"
                              min={1}
                              max={90}
                              value={dueDays}
                              onChange={(e) => setDueDays(Number(e.target.value))}
                              placeholder="Días de plazo"
                              className="h-8 text-xs dark:bg-gray-700"
                            />
                          </div>
                        ) : (
                          <Select value={selectedPaymentMethod} onValueChange={setSelectedPaymentMethod}>
                            <SelectTrigger className="h-8 text-xs dark:bg-gray-700">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {paymentMethods.length > 0 ? (
                                paymentMethods.map((pm) => (
                                  <SelectItem key={pm.payment_method_code} value={pm.payment_method_code}>
                                    <div className="flex items-center gap-2">
                                      {METHOD_ICONS[pm.payment_method_code] || <CreditCard className="h-3 w-3" />}
                                      {pm.payment_method?.name || pm.payment_method_code}
                                    </div>
                                  </SelectItem>
                                ))
                              ) : (
                                <>
                                  <SelectItem value="cash">Efectivo</SelectItem>
                                  <SelectItem value="card">Tarjeta</SelectItem>
                                  <SelectItem value="transfer">Transferencia</SelectItem>
                                </>
                              )}
                            </SelectContent>
                          </Select>
                        )}

                        {/* Opción de factura */}
                        {hasInvoicing && (
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id="mapGenerateInvoice"
                              checked={generateInvoice}
                              onChange={(e) => setGenerateInvoice(e.target.checked)}
                              className="rounded border-gray-300 dark:border-gray-600"
                            />
                            <Label htmlFor="mapGenerateInvoice" className="flex items-center gap-2 text-xs cursor-pointer">
                              <FileText className="h-3 w-3 text-blue-500" />
                              Generar factura
                            </Label>
                          </div>
                        )}

                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowPaymentForm(false)}
                            className="flex-1"
                          >
                            Cancelar
                          </Button>
                          <Button
                            size="sm"
                            onClick={handlePayment}
                            disabled={isLoading || (isCredit && !selectedCustomerId)}
                            className="flex-1 bg-green-600 hover:bg-green-700"
                          >
                            {isLoading ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : isCredit ? (
                              'Registrar Crédito'
                            ) : (
                              `Cobrar $${calculatedFee.amount.toLocaleString()}`
                            )}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                    <DollarSign className="h-4 w-4" />
                    Sin tarifa configurada para este tipo de vehículo
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Formulario para asignar espacio libre */}
          {space.state === 'free' && (
            <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 space-y-3">
              <p className="font-semibold text-green-700 dark:text-green-400">
                Asignar Vehículo
              </p>
              <div className="space-y-2">
                <Label className="dark:text-gray-300">Placa del vehículo</Label>
                <Input
                  value={vehiclePlate}
                  onChange={(e) => setVehiclePlate(e.target.value.toUpperCase())}
                  placeholder="ABC123"
                  className="font-mono uppercase dark:bg-gray-700 dark:border-gray-600"
                />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-gray-300">Tipo de vehículo</Label>
                <Select value={vehicleType} onValueChange={setVehicleType}>
                  <SelectTrigger className="dark:bg-gray-700 dark:border-gray-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                    <SelectItem value="car">Carro</SelectItem>
                    <SelectItem value="motorcycle">Moto</SelectItem>
                    <SelectItem value="bicycle">Bicicleta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleAssignSpace}
                disabled={isLoading || !vehiclePlate.trim()}
                className="w-full bg-green-600 hover:bg-green-700"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Car className="h-4 w-4 mr-2" />
                )}
                Asignar Espacio
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          {/* Botones de cambio de estado */}
          {space.state === 'occupied' && space.active_session && (
            <Button
              onClick={handleReleaseSpace}
              disabled={isLoading}
              variant="destructive"
              className="w-full sm:w-auto"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Liberar Espacio
            </Button>
          )}

          {space.state !== 'maintenance' && space.state !== 'occupied' && (
            <Button
              onClick={() => handleChangeState('maintenance')}
              disabled={isLoading}
              variant="outline"
              className="w-full sm:w-auto dark:border-gray-600"
            >
              <Wrench className="h-4 w-4 mr-2" />
              Mantenimiento
            </Button>
          )}

          {space.state === 'maintenance' && (
            <Button
              onClick={() => handleChangeState('free')}
              disabled={isLoading}
              className="w-full sm:w-auto bg-green-600 hover:bg-green-700"
            >
              <CircleCheck className="h-4 w-4 mr-2" />
              Marcar Disponible
            </Button>
          )}

          {space.state === 'reserved' && (
            <Button
              onClick={() => handleChangeState('free')}
              disabled={isLoading}
              variant="outline"
              className="w-full sm:w-auto dark:border-gray-600"
            >
              Cancelar Reserva
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SpaceDetailDialog;
