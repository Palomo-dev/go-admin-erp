'use client';

import { useState, useEffect } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { GymClass, ClassReservation, getClasses, getClassTypeLabel } from '@/lib/services/gymService';

interface ReservationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservation?: ClassReservation | null;
  preselectedClass?: GymClass | null;
  onSave: (data: Partial<ClassReservation>) => Promise<void>;
}

interface Customer {
  id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
}

export function ReservationDialog({ open, onOpenChange, reservation, preselectedClass, onSave }: ReservationDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [classes, setClasses] = useState<GymClass[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [reservationSource, setReservationSource] = useState<string>('app');

  const isEditing = !!reservation;

  useEffect(() => {
    if (open) {
      loadClasses();
      if (reservation) {
        // Modo edición
        setSelectedClassId(reservation.gym_class_id.toString());
        setNotes(reservation.notes || '');
        setReservationSource(reservation.reservation_source || 'app');
        if (reservation.customers) {
          setSelectedCustomer({
            id: reservation.customer_id,
            first_name: reservation.customers.first_name || '',
            last_name: reservation.customers.last_name || '',
            email: reservation.customers.email,
            phone: reservation.customers.phone,
          });
        }
      } else if (preselectedClass) {
        setSelectedClassId(preselectedClass.id.toString());
      }
    } else {
      setSelectedCustomer(null);
      setSelectedClassId('');
      setNotes('');
      setReservationSource('app');
      setSearchTerm('');
      setCustomers([]);
    }
  }, [open, reservation, preselectedClass]);

  const loadClasses = async () => {
    try {
      const orgId = getOrganizationId();
      const now = new Date();
      const data = await getClasses(orgId, {
        status: 'scheduled',
        dateFrom: now.toISOString(),
      });
      setClasses(data);
    } catch (error) {
      console.error('Error cargando clases:', error);
    }
  };

  const searchCustomers = async (term: string) => {
    if (term.length < 2) {
      setCustomers([]);
      return;
    }

    try {
      const orgId = getOrganizationId();
      const { data, error } = await supabase
        .from('customers')
        .select('id, first_name, last_name, email, phone')
        .eq('organization_id', orgId)
        .or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`)
        .limit(10);

      if (error) throw error;
      setCustomers(data || []);
    } catch (error) {
      console.error('Error buscando clientes:', error);
    }
  };

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    searchCustomers(value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || !selectedClassId) return;

    setIsLoading(true);
    try {
      await onSave({
        ...(reservation && { id: reservation.id }),
        gym_class_id: parseInt(selectedClassId),
        customer_id: selectedCustomer.id,
        notes: notes || undefined,
        reservation_source: reservationSource,
      });
      onOpenChange(false);
    } finally {
      setIsLoading(false);
    }
  };

  const formatClassOption = (gymClass: GymClass) => {
    const date = new Date(gymClass.start_at);
    const time = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    const dateStr = date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
    return `${gymClass.title} - ${dateStr} ${time} (${getClassTypeLabel(gymClass.class_type)})`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar Reservación' : 'Nueva Reservación'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="class">Clase *</Label>
            <Select value={selectedClassId} onValueChange={setSelectedClassId} disabled={isEditing}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar clase" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((gymClass) => (
                  <SelectItem key={gymClass.id} value={gymClass.id.toString()}>
                    {formatClassOption(gymClass)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Cliente *</Label>
            {selectedCustomer ? (
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex justify-between items-center">
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {selectedCustomer.first_name} {selectedCustomer.last_name}
                  </p>
                  {selectedCustomer.email && (
                    <p className="text-sm text-gray-500">{selectedCustomer.email}</p>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedCustomer(null)}
                >
                  Cambiar
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Buscar cliente por nombre, email..."
                    value={searchTerm}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="pl-10"
                  />
                </div>
                {customers.length > 0 && (
                  <div className="border rounded-lg max-h-40 overflow-y-auto">
                    {customers.map((customer) => (
                      <div
                        key={customer.id}
                        onClick={() => {
                          setSelectedCustomer(customer);
                          setCustomers([]);
                          setSearchTerm('');
                        }}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                      >
                        <p className="font-medium text-sm">
                          {customer.first_name} {customer.last_name}
                        </p>
                        {customer.email && (
                          <p className="text-xs text-gray-500">{customer.email}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <Label htmlFor="notes">Notas</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notas adicionales..."
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isLoading || !selectedCustomer || !selectedClassId}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEditing ? 'Guardar Cambios' : 'Crear Reservación'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
