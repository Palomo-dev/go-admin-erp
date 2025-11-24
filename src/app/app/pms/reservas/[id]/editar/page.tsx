'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  StepCustomer,
  StepDates,
  StepSpaces,
  StepExtras,
  StepPayment,
  StepConfirm,
} from '@/components/pms/reservas/nueva';
import ReservationEditService from '@/lib/services/reservationEditService';
import ReservationsService, { type Customer } from '@/lib/services/reservationsService';
import SpaceCategoriesService from '@/lib/services/spaceCategoriesService';
import { useOrganization } from '@/lib/hooks/useOrganization';

const STEPS = [
  { id: 1, name: 'Cliente' },
  { id: 2, name: 'Fechas' },
  { id: 3, name: 'Espacios' },
  { id: 4, name: 'Extras' },
  { id: 5, name: 'Pago' },
  { id: 6, name: 'Confirmar' },
];

export default function EditarReservaPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { organization } = useOrganization();

  const reservationId = params.id as string;

  const [isLoadingData, setIsLoadingData] = useState(true);
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Datos del wizard
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [checkin, setCheckin] = useState('');
  const [checkout, setCheckout] = useState('');
  const [occupantCount, setOccupantCount] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedSpaces, setSelectedSpaces] = useState<string[]>([]);
  const [availableSpaces, setAvailableSpaces] = useState<any[]>([]);
  const [isLoadingSpaces, setIsLoadingSpaces] = useState(false);
  const [originalSpaces, setOriginalSpaces] = useState<any[]>([]); // Espacios de la reserva original
  const [extras, setExtras] = useState<any[]>([]);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [notes, setNotes] = useState('');
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);

  // Cargar datos de la reserva al inicio
  useEffect(() => {
    if (reservationId) {
      loadReservationData();
    }
  }, [reservationId]);

  // Cargar categorías y métodos de pago
  useEffect(() => {
    loadCategories();
    loadPaymentMethods();
  }, []);

  // Cargar espacios cuando cambian las fechas o categoría
  useEffect(() => {
    if (checkin && checkout && selectedCategory && organization && !isLoadingData) {
      loadAvailableSpaces();
    }
  }, [checkin, checkout, selectedCategory, organization, isLoadingData]);

  const loadReservationData = async () => {
    try {
      setIsLoadingData(true);
      const data = await ReservationEditService.getReservationForEdit(reservationId);

      // Cargar datos del cliente
      setSelectedCustomer(data.customer);

      // Cargar fechas
      setCheckin(data.checkin);
      setCheckout(data.checkout);
      setOccupantCount(data.occupant_count);

      // Cargar categoría (del metadata o del primer espacio)
      const category = data.metadata?.category || data.spaces[0]?.category_id || null;
      setSelectedCategory(category);

      // Guardar espacios completos de la reserva original
      const originalSpacesData = data.spaces.map(s => ({
        id: s.space_id,
        label: s.label,
        space_type_id: s.space_type_id,
        space_type_name: s.space_type_name,
        base_rate: s.base_rate || 0,
        category_id: s.category_id,
        floor_zone: s.floor_zone || '',
        capacity: s.capacity || 0,
        isOriginal: true, // Marcar como espacio original
      }));
      setOriginalSpaces(originalSpacesData);

      // Cargar espacios seleccionados
      setSelectedSpaces(data.spaces.map(s => s.space_id));

      // Cargar extras
      setExtras(data.metadata?.extras || []);

      // Cargar notas
      setNotes(data.notes);

      // Cargar datos de pago si existen
      if (data.payments && data.payments.length > 0) {
        const lastPayment = data.payments[0]; // El más reciente
        setPaymentMethod(lastPayment.method || '');
        setPaymentAmount(lastPayment.amount || 0);
      }

      toast({
        title: 'Datos Cargados',
        description: 'Los datos de la reserva se han cargado correctamente',
      });
    } catch (error: any) {
      console.error('Error loading reservation:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los datos de la reserva',
        variant: 'destructive',
      });
      router.push('/app/pms/reservas');
    } finally {
      setIsLoadingData(false);
    }
  };

  const loadCategories = async () => {
    try {
      const data = await SpaceCategoriesService.getCategories();
      setCategories(data.filter(c => c.is_bookable));
    } catch (error) {
      console.error('Error cargando categorías:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las categorías',
        variant: 'destructive',
      });
    }
  };

  const loadPaymentMethods = () => {
    const methods = [
      { id: 1, payment_method_code: 'cash', is_active: true },
      { id: 2, payment_method_code: 'card', is_active: true },
      { id: 3, payment_method_code: 'transfer', is_active: true },
      { id: 4, payment_method_code: 'nequi', is_active: true },
      { id: 5, payment_method_code: 'daviplata', is_active: true },
      { id: 6, payment_method_code: 'pse', is_active: true },
      { id: 7, payment_method_code: 'credit', is_active: true },
    ];
    setPaymentMethods(methods);
  };

  const loadAvailableSpaces = async () => {
    if (!selectedCategory || !checkin || !checkout || !organization) return;

    try {
      setIsLoadingSpaces(true);

      const spaces = await ReservationsService.getAvailableSpaces(
        organization.id,
        selectedCategory,
        checkin,
        checkout
      );

      // Combinar espacios disponibles con espacios originales de la reserva
      // Los espacios originales deben estar disponibles para esta reserva
      const originalSpaceIds = originalSpaces.map(s => s.id);
      const spacesMap = new Map();

      // Agregar espacios disponibles
      spaces.forEach(space => {
        spacesMap.set(space.id, { ...space, isOriginal: false });
      });

      // Agregar/actualizar espacios originales (siempre disponibles para editar)
      originalSpaces.forEach(origSpace => {
        if (!spacesMap.has(origSpace.id)) {
          // Si el espacio original no está en disponibles, agregarlo
          // Convertir estructura plana a estructura anidada que espera StepSpaces
          spacesMap.set(origSpace.id, { 
            id: origSpace.id,
            label: origSpace.label,
            floor_zone: origSpace.floor_zone,
            capacity: origSpace.capacity,
            space_type_id: origSpace.space_type_id,
            space_types: {
              name: origSpace.space_type_name,
              base_rate: origSpace.base_rate,
            },
            isOriginal: true,
          });
        } else {
          // Si ya está, marcarlo como original también
          spacesMap.set(origSpace.id, {
            ...spacesMap.get(origSpace.id),
            isOriginal: true,
          });
        }
      });

      const allSpaces = Array.from(spacesMap.values());

      // Verificar disponibilidad excluyendo esta reserva
      const { conflicts } = await ReservationEditService.checkAvailabilityForEdit(
        reservationId,
        selectedSpaces,
        checkin,
        checkout
      );

      // Marcar espacios que tienen conflicto
      const spacesWithStatus = allSpaces.map(space => ({
        ...space,
        hasConflict: conflicts.includes(space.id),
      }));

      setAvailableSpaces(spacesWithStatus);
    } catch (error) {
      console.error('Error cargando espacios:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los espacios disponibles',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingSpaces(false);
    }
  };

  const calculateNights = () => {
    if (!checkin || !checkout) return 0;
    const checkinDate = new Date(checkin);
    const checkoutDate = new Date(checkout);
    return Math.ceil((checkoutDate.getTime() - checkinDate.getTime()) / (1000 * 60 * 60 * 24));
  };

  const calculateTotal = () => {
    if (!checkin || !checkout || selectedSpaces.length === 0) return 0;

    const nights = calculateNights();
    let total = 0;

    // Calcular precio de espacios
    // Buscar primero en availableSpaces, luego en originalSpaces
    selectedSpaces.forEach((spaceId) => {
      let space = availableSpaces.find((s) => s.id === spaceId);
      
      // Si no está en availableSpaces, buscar en originalSpaces
      if (!space) {
        const origSpace = originalSpaces.find((s) => s.id === spaceId);
        if (origSpace) {
          // Convertir estructura plana a la que espera el cálculo
          space = {
            id: origSpace.id,
            base_rate: origSpace.base_rate,
            space_types: {
              base_rate: origSpace.base_rate
            }
          };
        }
      }
      
      if (space) {
        const baseRate = space.space_types?.base_rate || space.base_rate || 0;
        total += baseRate * nights;
      }
    });

    // Agregar extras
    extras.forEach((extra) => {
      total += extra.price * (extra.quantity || 1);
    });

    return total;
  };

  const handleSubmit = async () => {
    if (!selectedCustomer || !organization) return;

    setIsSubmitting(true);

    try {
      const totalEstimated = calculateTotal();

      await ReservationEditService.updateReservation({
        reservationId,
        customerId: selectedCustomer.id,
        checkin,
        checkout,
        occupantCount,
        selectedSpaces,
        extras,
        notes,
        organizationId: organization.id,
        branchId: organization.branch_id || null,
        totalEstimated,
        category: selectedCategory || '',
      });

      toast({
        title: 'Reserva Actualizada',
        description: 'La reserva se ha actualizado correctamente',
      });

      router.push(`/app/pms/reservas/${reservationId}`);
    } catch (error: any) {
      console.error('Error actualizando reserva:', error);
      toast({
        title: 'Error',
        description: error.message || 'No se pudo actualizar la reserva',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBack = () => {
    router.push(`/app/pms/reservas/${reservationId}`);
  };

  const handleSearchCustomers = async (searchTerm: string) => {
    if (!organization) return [];
    return await ReservationsService.searchCustomers(organization.id, searchTerm);
  };

  const handleCreateCustomer = async (customerData: Partial<Customer>) => {
    if (!organization) throw new Error('No organization');
    return await ReservationsService.createCustomer({
      ...customerData,
      organization_id: organization.id,
    } as Customer);
  };

  const handleAddExtra = (extra: Omit<typeof extras[0], 'quantity'>) => {
    setExtras([...extras, { ...extra, quantity: 1 }]);
  };

  const handleRemoveExtra = (id: string) => {
    setExtras(extras.filter(e => e.id !== id));
  };

  const handleUpdateExtraQuantity = (id: string, quantity: number) => {
    setExtras(extras.map(e => e.id === id ? { ...e, quantity } : e));
  };

  const nextStep = () => {
    if (currentStep < STEPS.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  if (isLoadingData) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Cargando datos de la reserva...</p>
        </div>
      </div>
    );
  }

  const progress = (currentStep / STEPS.length) * 100;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Volver
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                Editar Reserva
              </h1>
              <p className="text-gray-500 dark:text-gray-400">
                Modifica los datos de la reserva existente
              </p>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex justify-between mb-2">
            {STEPS.map((step) => (
              <div
                key={step.id}
                className={`flex items-center gap-2 ${
                  step.id === currentStep
                    ? 'text-blue-600 dark:text-blue-400'
                    : step.id < currentStep
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-gray-400 dark:text-gray-600'
                }`}
              >
                {step.id < currentStep ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  <div
                    className={`h-5 w-5 rounded-full border-2 flex items-center justify-center text-xs font-bold ${
                      step.id === currentStep
                        ? 'border-blue-600 dark:border-blue-400 bg-blue-100 dark:bg-blue-900'
                        : 'border-gray-300 dark:border-gray-700'
                    }`}
                  >
                    {step.id}
                  </div>
                )}
                <span className="text-sm font-medium">{step.name}</span>
              </div>
            ))}
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Wizard content */}
        <Card className="p-6">
          {currentStep === 1 && (
            <StepCustomer
              selectedCustomer={selectedCustomer}
              onCustomerSelect={setSelectedCustomer}
              onNext={nextStep}
              onSearch={handleSearchCustomers}
              onCreate={handleCreateCustomer}
            />
          )}

          {currentStep === 2 && (
            <StepDates
              checkin={checkin}
              checkout={checkout}
              occupantCount={occupantCount}
              selectedCategory={selectedCategory}
              categories={categories}
              onCheckinChange={setCheckin}
              onCheckoutChange={setCheckout}
              onOccupantCountChange={setOccupantCount}
              onCategorySelect={setSelectedCategory}
              onNext={nextStep}
              onBack={prevStep}
            />
          )}

          {currentStep === 3 && (
            <StepSpaces
              availableSpaces={availableSpaces}
              selectedSpaces={selectedSpaces}
              isLoading={isLoadingSpaces}
              nights={calculateNights()}
              onSpaceToggle={(spaceId) => {
                setSelectedSpaces((prev) =>
                  prev.includes(spaceId)
                    ? prev.filter((id) => id !== spaceId)
                    : [...prev, spaceId]
                );
              }}
              onNext={nextStep}
              onBack={prevStep}
            />
          )}

          {currentStep === 4 && (
            <StepExtras
              extras={extras}
              onAddExtra={handleAddExtra}
              onRemoveExtra={handleRemoveExtra}
              onUpdateQuantity={handleUpdateExtraQuantity}
              onNext={nextStep}
              onBack={prevStep}
              onSkip={nextStep}
            />
          )}

          {currentStep === 5 && (
            <StepPayment
              paymentMethod={paymentMethod}
              paymentAmount={paymentAmount}
              totalEstimated={calculateTotal()}
              notes={notes}
              availablePaymentMethods={paymentMethods}
              onPaymentMethodChange={setPaymentMethod}
              onPaymentAmountChange={setPaymentAmount}
              onNotesChange={setNotes}
              onNext={nextStep}
              onBack={prevStep}
            />
          )}

          {currentStep === 6 && selectedCustomer && (
            <StepConfirm
              customer={selectedCustomer}
              checkin={checkin}
              checkout={checkout}
              nights={calculateNights()}
              occupantCount={occupantCount}
              selectedSpaces={availableSpaces.filter((s) => selectedSpaces.includes(s.id))}
              extras={extras}
              paymentMethod={paymentMethod}
              paymentAmount={paymentAmount}
              totalEstimated={calculateTotal()}
              notes={notes}
              isSubmitting={isSubmitting}
              onConfirm={handleSubmit}
              onBack={prevStep}
            />
          )}
        </Card>
      </div>
    </div>
  );
}
