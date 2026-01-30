'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
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
import { Loader2, Plus, Package } from 'lucide-react';
import { getPlans, createMembership, MembershipPlan } from '@/lib/services/gymService';
import { CustomerSelectorGym, CustomerGym } from './CustomerSelectorGym';

interface MembershipDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: () => Promise<void>;
}

export function MembershipDialog({ open, onOpenChange, onSave }: MembershipDialogProps) {
  const router = useRouter();
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerGym | null>(null);
  
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    if (open) {
      loadPlans();
      resetForm();
    }
  }, [open]);

  const resetForm = () => {
    setSelectedCustomer(null);
    setSelectedPlanId('');
    setStartDate(new Date().toISOString().split('T')[0]);
  };

  const loadPlans = async () => {
    try {
      setIsLoading(true);
      const data = await getPlans();
      setPlans(data.filter(p => p.is_active));
    } catch (error) {
      console.error('Error cargando planes:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedCustomer) {
      toast.error('Selecciona un cliente');
      return;
    }
    if (!selectedPlanId) {
      toast.error('Selecciona un plan');
      return;
    }

    const plan = plans.find(p => p.id.toString() === selectedPlanId);
    if (!plan) return;

    try {
      setIsSaving(true);

      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + plan.duration_days);

      await createMembership({
        customer_id: selectedCustomer.id,
        membership_plan_id: plan.id,
        start_date: startDate,
        end_date: endDate.toISOString().split('T')[0],
        status: 'active',
      });

      toast.success('Membresía creada correctamente');
      await onSave();
      onOpenChange(false);
    } catch (error) {
      console.error('Error creando membresía:', error);
      toast.error('Error al crear la membresía');
    } finally {
      setIsSaving(false);
    }
  };

  const handleGoToPlans = () => {
    onOpenChange(false);
    router.push('/app/gym/planes');
  };

  const selectedPlan = plans.find(p => p.id.toString() === selectedPlanId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva Membresía</DialogTitle>
          <DialogDescription>
            Crea una nueva membresía para un cliente
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-4">
          {/* Selector de cliente mejorado */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Cliente</Label>
            <CustomerSelectorGym
              selectedCustomer={selectedCustomer}
              onCustomerSelect={setSelectedCustomer}
            />
          </div>

          {/* Plan de membresía */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Plan de Membresía</Label>
            
            {isLoading ? (
              <div className="flex items-center justify-center p-4 border rounded-lg dark:border-gray-700">
                <Loader2 className="h-5 w-5 animate-spin text-blue-600 mr-2" />
                <span className="text-sm dark:text-gray-400">Cargando planes...</span>
              </div>
            ) : plans.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-6 border rounded-lg dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <Package className="h-10 w-10 text-gray-400 mb-3" />
                <p className="text-sm font-medium dark:text-gray-300 text-center mb-1">
                  No hay planes activos
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 text-center mb-4">
                  Crea un plan de membresía primero
                </p>
                <Button
                  onClick={handleGoToPlans}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Crear Plan
                </Button>
              </div>
            ) : (
              <>
                <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                  <SelectTrigger className="dark:bg-gray-800 dark:border-gray-700">
                    <SelectValue placeholder="Selecciona un plan" />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.map((plan) => (
                      <SelectItem key={plan.id} value={plan.id.toString()}>
                        <div className="flex items-center justify-between w-full">
                          <span>{plan.name}</span>
                          <span className="ml-2 text-gray-500">
                            ${plan.price.toLocaleString()} • {plan.duration_days}d
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedPlan && (
                  <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                    <span>Duración: <strong>{selectedPlan.duration_days} días</strong></span>
                    <span>•</span>
                    <span>Precio: <strong>${selectedPlan.price.toLocaleString()}</strong></span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Fecha de inicio */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Fecha de Inicio</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="dark:bg-gray-800 dark:border-gray-700"
            />
            {selectedPlan && startDate && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Fecha de vencimiento:{' '}
                <strong>
                  {new Date(
                    new Date(startDate).setDate(
                      new Date(startDate).getDate() + selectedPlan.duration_days
                    )
                  ).toLocaleDateString('es-CO', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </strong>
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="border-t dark:border-gray-700 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="dark:border-gray-700">
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !selectedCustomer || !selectedPlanId || plans.length === 0}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Crear Membresía
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
