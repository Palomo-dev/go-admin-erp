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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Loader2,
  Wallet,
  Car,
  CreditCard,
  Banknote,
  Receipt,
  CheckCircle,
  Search,
  FileText,
  Calendar,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { formatCurrency } from '@/utils/Utils';
import parkingPaymentService, {
  type OrganizationPaymentMethod,
  type CreatePaymentData,
} from '@/lib/services/parkingPaymentService';
import parkingRateService from '@/lib/services/parkingRateService';
import parkingFinanceService from '@/lib/services/parkingFinanceService';
import { supabase } from '@/lib/supabase/config';

interface PaymentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: number;
  branchId: number;
  paymentMethods: OrganizationPaymentMethod[];
  onSuccess: () => void;
}

interface Customer {
  id: string;
  full_name: string;
}

interface PendingItem {
  id: string;
  type: 'session' | 'pass';
  label: string;
  sublabel: string;
  amount: number;
  rateName?: string;
  breakdown?: string;
  entryAt?: string;
  vehicleType?: string;
  duration?: string;
}

const METHOD_ICONS: Record<string, React.ReactNode> = {
  cash: <Banknote className="h-5 w-5" />,
  card: <CreditCard className="h-5 w-5" />,
  transfer: <Receipt className="h-5 w-5" />,
  nequi: <CreditCard className="h-5 w-5" />,
  daviplata: <CreditCard className="h-5 w-5" />,
  credit_card: <CreditCard className="h-5 w-5" />,
  debit_card: <CreditCard className="h-5 w-5" />,
};

const METHOD_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  nequi: 'Nequi',
  daviplata: 'Daviplata',
  credit_card: 'Tarjeta Crédito',
  debit_card: 'Tarjeta Débito',
};

export function PaymentFormDialog({
  open,
  onOpenChange,
  organizationId,
  branchId,
  paymentMethods,
  onSuccess,
}: PaymentFormDialogProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [activeTab, setActiveTab] = useState<'session' | 'pass'>('session');

  // Pending items
  const [pendingSessions, setPendingSessions] = useState<PendingItem[]>([]);
  const [pendingPasses, setPendingPasses] = useState<PendingItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Selected item and payment
  const [selectedItem, setSelectedItem] = useState<PendingItem | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<string>('cash');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [amountReceived, setAmountReceived] = useState('');

  // Opciones de finanzas
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [hasInvoicing, setHasInvoicing] = useState(false);
  const [isCredit, setIsCredit] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [dueDays, setDueDays] = useState(30);
  const [generateInvoice, setGenerateInvoice] = useState(false);

  // Computed
  const change = Number(amountReceived) - Number(amount);
  const canComplete = selectedItem && (isCredit ? selectedCustomerId : selectedMethod) && Number(amount) > 0;

  useEffect(() => {
    if (open) {
      loadPendingItems();
      loadFinanceData();
      resetForm();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const loadFinanceData = async () => {
    try {
      const [customersData, invoicingEnabled] = await Promise.all([
        supabase
          .from('customers')
          .select('id, full_name')
          .eq('organization_id', organizationId)
          .order('full_name'),
        parkingFinanceService.hasInvoicingEnabled(organizationId, branchId),
      ]);
      setCustomers(customersData.data || []);
      setHasInvoicing(invoicingEnabled);
    } catch (error) {
      console.error('Error loading finance data:', error);
    }
  };

  const resetForm = () => {
    setSelectedItem(null);
    setSelectedMethod('cash');
    setAmount('');
    setReference('');
    setAmountReceived('');
    setSearchTerm('');
    setIsCredit(false);
    setSelectedCustomerId('');
    setDueDays(30);
    setGenerateInvoice(false);
  };

  const loadPendingItems = async () => {
    setIsLoadingItems(true);
    try {
      const [sessions, passes] = await Promise.all([
        parkingPaymentService.getPendingSessions(branchId),
        parkingPaymentService.getPendingPasses(organizationId),
      ]);

      // Calcular montos de sesiones usando las tarifas
      const sessionsWithRates = await Promise.all(
        sessions.map(async (s) => {
          // Obtener tarifa por tipo de vehículo
          const rate = await parkingRateService.getRateByVehicleType(
            organizationId,
            s.vehicle_type
          );
          const entryTime = new Date(s.entry_at);
          const calculatedFee = parkingRateService.calculateFee(rate, entryTime);
          const duration = parkingRateService.formatDuration(calculatedFee.duration_minutes);

          return {
            id: s.id,
            type: 'session' as const,
            label: s.vehicle_plate,
            sublabel: `${s.vehicle_type} - Entrada: ${new Date(s.entry_at).toLocaleString('es-CO')}`,
            amount: calculatedFee.amount,
            rateName: rate?.rate_name || 'Sin tarifa',
            breakdown: calculatedFee.breakdown,
            entryAt: s.entry_at,
            vehicleType: s.vehicle_type,
            duration,
          };
        })
      );

      setPendingSessions(sessionsWithRates);

      setPendingPasses(
        passes.map((p) => ({
          id: p.id,
          type: 'pass' as const,
          label: p.plan_name,
          sublabel: p.customer?.full_name || 'Cliente',
          amount: p.pass_type?.price || p.price || 0,
        }))
      );
    } catch (error) {
      console.error('Error loading pending items:', error);
    } finally {
      setIsLoadingItems(false);
    }
  };

  const handleSelectItem = (item: PendingItem) => {
    setSelectedItem(item);
    setAmount(String(item.amount));
    setAmountReceived(String(item.amount));
  };

  const handleMethodSelect = (methodCode: string) => {
    setSelectedMethod(methodCode);
    // Limpiar referencia si cambia a efectivo
    if (methodCode === 'cash') {
      setReference('');
    }
  };

  const handleSubmit = async () => {
    if (!canComplete || !selectedItem) return;

    setIsLoading(true);
    try {
      const sourceType = selectedItem.type === 'session' ? 'parking_session' : 'parking_pass';

      if (isCredit && selectedCustomerId) {
        // Registrar como crédito
        await parkingFinanceService.registerParkingExitOnCredit({
          organization_id: organizationId,
          branch_id: branchId,
          source_type: sourceType,
          source_id: selectedItem.id,
          amount: Number(amount),
          customer_id: selectedCustomerId,
          due_days: dueDays,
          vehicle_plate: selectedItem.label,
          generate_invoice: generateInvoice,
        });

        toast({
          title: 'Registrado a crédito',
          description: `Cuenta por cobrar de ${formatCurrency(Number(amount))} creada`,
        });
      } else if (generateInvoice) {
        // Pago con factura
        await parkingFinanceService.registerParkingPaymentWithInvoice({
          organization_id: organizationId,
          branch_id: branchId,
          source_type: sourceType,
          source_id: selectedItem.id,
          amount: Number(amount),
          payment_method_code: selectedMethod,
          vehicle_plate: selectedItem.label,
          generate_invoice: true,
        });

        toast({
          title: 'Pago con factura registrado',
          description: `Pago de ${formatCurrency(Number(amount))} con factura`,
        });
      } else {
        // Pago normal
        const paymentData: CreatePaymentData = {
          organization_id: organizationId,
          branch_id: branchId,
          source: sourceType,
          source_id: selectedItem.id,
          method: selectedMethod,
          amount: Number(amount),
          reference: reference || undefined,
        };

        await parkingPaymentService.createPayment(paymentData);

        toast({
          title: 'Pago registrado',
          description: `Pago de ${formatCurrency(Number(amount))} registrado correctamente`,
        });
      }

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Error creating payment:', error);
      toast({
        title: 'Error',
        description: 'No se pudo registrar el pago',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const filteredSessions = pendingSessions.filter(
    (s) =>
      s.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.sublabel.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredPasses = pendingPasses.filter(
    (p) =>
      p.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.sublabel.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const requiresReference = paymentMethods.find(
    (pm) => pm.payment_method_code === selectedMethod
  )?.payment_method?.requires_reference;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden dark:bg-gray-800 dark:border-gray-700">
        <DialogHeader>
          <DialogTitle className="dark:text-white flex items-center gap-2">
            <Wallet className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            Registrar Pago de Parking
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Step 1: Seleccionar item */}
          {!selectedItem ? (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Buscar por placa, cliente..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 dark:bg-gray-700 dark:border-gray-600"
                />
              </div>

              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'session' | 'pass')}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="session" className="flex items-center gap-2">
                    <Car className="h-4 w-4" />
                    Sesiones ({filteredSessions.length})
                  </TabsTrigger>
                  <TabsTrigger value="pass" className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    Abonados ({filteredPasses.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="session" className="mt-4">
                  <ScrollArea className="h-64">
                    {isLoadingItems ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                      </div>
                    ) : filteredSessions.length === 0 ? (
                      <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                        No hay sesiones pendientes
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {filteredSessions.map((item) => (
                          <Card
                            key={item.id}
                            className="cursor-pointer hover:border-blue-500 transition-colors dark:bg-gray-700 dark:border-gray-600"
                            onClick={() => handleSelectItem(item)}
                          >
                            <CardContent className="p-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <Car className="h-5 w-5 text-blue-500" />
                                  <div>
                                    <p className="font-semibold dark:text-white">{item.label}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                      {item.vehicleType} - Entrada: {new Date(item.entryAt || '').toLocaleString('es-CO')}
                                    </p>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <span className="font-bold text-green-600 dark:text-green-400 text-lg">
                                    {formatCurrency(item.amount)}
                                  </span>
                                  {item.duration && (
                                    <p className="text-xs text-blue-500 dark:text-blue-400">
                                      {item.duration}
                                    </p>
                                  )}
                                </div>
                              </div>
                              {item.breakdown && (
                                <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600 text-xs text-gray-500 dark:text-gray-400 flex justify-between">
                                  <span>{item.rateName}</span>
                                  <span>{item.breakdown}</span>
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="pass" className="mt-4">
                  <ScrollArea className="h-64">
                    {isLoadingItems ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                      </div>
                    ) : filteredPasses.length === 0 ? (
                      <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                        No hay pases pendientes
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {filteredPasses.map((item) => (
                          <Card
                            key={item.id}
                            className="cursor-pointer hover:border-blue-500 transition-colors dark:bg-gray-700 dark:border-gray-600"
                            onClick={() => handleSelectItem(item)}
                          >
                            <CardContent className="p-3 flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <CreditCard className="h-5 w-5 text-purple-500" />
                                <div>
                                  <p className="font-semibold dark:text-white">{item.label}</p>
                                  <p className="text-xs text-gray-500 dark:text-gray-400">
                                    {item.sublabel}
                                  </p>
                                </div>
                              </div>
                              <span className="font-bold text-green-600 dark:text-green-400">
                                {formatCurrency(item.amount)}
                              </span>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            </>
          ) : (
            /* Step 2: Completar pago */
            <>
              {/* Item seleccionado */}
              <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                <CardContent className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {selectedItem.type === 'session' ? (
                      <Car className="h-5 w-5 text-blue-500" />
                    ) : (
                      <CreditCard className="h-5 w-5 text-purple-500" />
                    )}
                    <div>
                      <p className="font-semibold dark:text-white">{selectedItem.label}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {selectedItem.sublabel}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedItem(null)}
                    className="text-blue-600"
                  >
                    Cambiar
                  </Button>
                </CardContent>
              </Card>

              {/* Métodos de pago */}
              <div className="space-y-2">
                <Label className="dark:text-gray-200">Método de pago</Label>
                <div className="grid grid-cols-3 gap-2">
                  {paymentMethods.map((pm) => {
                    const code = pm.payment_method_code;
                    const icon = METHOD_ICONS[code] || <CreditCard className="h-5 w-5" />;
                    const label = pm.payment_method?.name || METHOD_LABELS[code] || code;
                    const isSelected = selectedMethod === code;

                    return (
                      <Button
                        key={code}
                        type="button"
                        variant={isSelected ? 'default' : 'outline'}
                        className={`h-auto py-3 flex flex-col items-center gap-1 ${
                          isSelected
                            ? 'bg-blue-600 hover:bg-blue-700 text-white'
                            : 'dark:border-gray-600 dark:hover:bg-gray-700'
                        }`}
                        onClick={() => handleMethodSelect(code)}
                      >
                        {icon}
                        <span className="text-xs">{label}</span>
                      </Button>
                    );
                  })}
                </div>
              </div>

              {/* Monto y referencia */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="dark:text-gray-200">Monto a cobrar</Label>
                  <Input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="dark:bg-gray-700 dark:border-gray-600 text-lg font-bold"
                  />
                </div>
                {selectedMethod === 'cash' && (
                  <div className="space-y-2">
                    <Label className="dark:text-gray-200">Monto recibido</Label>
                    <Input
                      type="number"
                      value={amountReceived}
                      onChange={(e) => setAmountReceived(e.target.value)}
                      className="dark:bg-gray-700 dark:border-gray-600 text-lg"
                    />
                  </div>
                )}
              </div>

              {/* Referencia si es requerida */}
              {(requiresReference || selectedMethod !== 'cash') && (
                <div className="space-y-2">
                  <Label className="dark:text-gray-200">
                    Referencia / Nº de transacción {requiresReference && '*'}
                  </Label>
                  <Input
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="Ej: 123456"
                    className="dark:bg-gray-700 dark:border-gray-600"
                  />
                </div>
              )}

              {/* Cambio */}
              {selectedMethod === 'cash' && change > 0 && !isCredit && (
                <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                  <div className="flex items-center justify-between">
                    <span className="text-green-700 dark:text-green-400 font-medium">Cambio:</span>
                    <span className="text-2xl font-bold text-green-700 dark:text-green-400">
                      {formatCurrency(change)}
                    </span>
                  </div>
                </div>
              )}

              {/* Opciones de finanzas */}
              <div className="space-y-3 pt-2 border-t border-gray-200 dark:border-gray-700">
                {/* Opción de crédito */}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="pagosIsCredit"
                    checked={isCredit}
                    onChange={(e) => setIsCredit(e.target.checked)}
                    className="rounded border-gray-300 dark:border-gray-600"
                  />
                  <Label htmlFor="pagosIsCredit" className="flex items-center gap-2 text-sm cursor-pointer dark:text-gray-300">
                    <Calendar className="h-4 w-4 text-orange-500" />
                    Registrar como crédito (cuenta por cobrar)
                  </Label>
                </div>

                {isCredit && (
                  <div className="grid grid-cols-2 gap-3 pl-6">
                    <div className="space-y-1">
                      <Label className="text-xs dark:text-gray-400">Cliente</Label>
                      <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                        <SelectTrigger className="h-9 dark:bg-gray-700">
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
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs dark:text-gray-400">Días de plazo</Label>
                      <Input
                        type="number"
                        min={1}
                        max={90}
                        value={dueDays}
                        onChange={(e) => setDueDays(Number(e.target.value))}
                        className="h-9 dark:bg-gray-700"
                      />
                    </div>
                  </div>
                )}

                {/* Opción de factura */}
                {hasInvoicing && (
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="pagosGenerateInvoice"
                      checked={generateInvoice}
                      onChange={(e) => setGenerateInvoice(e.target.checked)}
                      className="rounded border-gray-300 dark:border-gray-600"
                    />
                    <Label htmlFor="pagosGenerateInvoice" className="flex items-center gap-2 text-sm cursor-pointer dark:text-gray-300">
                      <FileText className="h-4 w-4 text-blue-500" />
                      Generar factura de venta
                    </Label>
                  </div>
                )}
              </div>
            </>
          )}
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
          {selectedItem && (
            <Button
              onClick={handleSubmit}
              disabled={!canComplete || isLoading}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Procesando...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  {isCredit ? 'Registrar Crédito' : 'Confirmar Pago'}
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default PaymentFormDialog;
