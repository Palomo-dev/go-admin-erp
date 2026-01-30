'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import {
  StepCustomer,
  StepDates,
  StepSpaces,
  StepExtras,
  StepPayment,
  StepConfirm,
} from '@/components/pms/reservas/nueva';
import ReservationsService, { type Customer } from '@/lib/services/reservationsService';
import RatesService from '@/lib/services/ratesService';
import SpaceCategoriesService from '@/lib/services/spaceCategoriesService';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';

const STEPS = [
  { id: 1, name: 'Cliente' },
  { id: 2, name: 'Fechas' },
  { id: 3, name: 'Espacios' },
  { id: 4, name: 'Extras' },
  { id: 5, name: 'Pago' },
  { id: 6, name: 'Confirmar' },
];

export default function NuevaReservaPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { organization } = useOrganization();

  // Parámetros de URL (desde el calendario)
  const urlSpaceId = searchParams.get('space_id');
  const urlCheckin = searchParams.get('checkin');
  const urlCheckout = searchParams.get('checkout');

  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [preselectedSpaceData, setPreselectedSpaceData] = useState<any>(null);

  // Datos del wizard
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [checkin, setCheckin] = useState(urlCheckin || '');
  const [checkout, setCheckout] = useState(urlCheckout || '');
  const [occupantCount, setOccupantCount] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [availableSpaces, setAvailableSpaces] = useState<any[]>([]);
  const [selectedSpaces, setSelectedSpaces] = useState<string[]>([]);
  const [isLoadingSpaces, setIsLoadingSpaces] = useState(false);
  const [extras, setExtras] = useState<any[]>([]);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [notes, setNotes] = useState('');
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [dynamicPricing, setDynamicPricing] = useState<{
    dailyRate: number;
    rateSource: 'tarifa' | 'base_rate';
  } | null>(null);

  // Cargar categorías y métodos de pago al inicio
  useEffect(() => {
    loadCategories();
    loadPaymentMethods();
  }, []);

  // Cargar datos del espacio preseleccionado desde URL
  useEffect(() => {
    const loadPreselectedSpace = async () => {
      if (!urlSpaceId || !organization) return;

      try {
        const { data: spaceData, error } = await supabase
          .from('spaces')
          .select(`
            id,
            label,
            status,
            space_types (
              id,
              name,
              base_rate,
              space_categories (
                code
              )
            )
          `)
          .eq('id', urlSpaceId)
          .single();

        if (error) throw error;

        if (spaceData) {
          setPreselectedSpaceData(spaceData);
          // Pre-seleccionar la categoría del espacio
          const spaceType = spaceData.space_types as any;
          const categoryCode = spaceType?.space_categories?.code;
          if (categoryCode) {
            setSelectedCategory(categoryCode);
          }
        }
      } catch (error) {
        console.error('Error cargando espacio preseleccionado:', error);
      }
    };

    loadPreselectedSpace();
  }, [urlSpaceId, organization]);

  // Cargar espacios cuando cambian las fechas o categoría
  useEffect(() => {
    if (checkin && checkout && selectedCategory && organization) {
      loadAvailableSpaces();
    }
  }, [checkin, checkout, selectedCategory, organization]);

  // Pre-seleccionar el espacio de la URL cuando los espacios disponibles se cargan
  useEffect(() => {
    if (urlSpaceId && availableSpaces.length > 0 && selectedSpaces.length === 0) {
      const spaceExists = availableSpaces.find(s => s.id === urlSpaceId);
      if (spaceExists) {
        setSelectedSpaces([urlSpaceId]);
      }
    }
  }, [urlSpaceId, availableSpaces]);

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

  const loadPaymentMethods = async () => {
    if (!organization) return;
    
    try {
      const data = await ReservationsService.getPaymentMethods(organization.id);
      setPaymentMethods(data);
    } catch (error) {
      console.error('Error cargando métodos de pago:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los métodos de pago',
        variant: 'destructive',
      });
    }
  };

  const loadAvailableSpaces = async () => {
    if (!organization || !selectedCategory) return;

    setIsLoadingSpaces(true);
    try {
      const spaces = await ReservationsService.getAvailableSpaces(
        organization.id,
        selectedCategory,
        checkin,
        checkout
      );
      setAvailableSpaces(spaces);
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

  const handleSearchCustomers = async (searchTerm: string) => {
    if (!organization) return [];
    return await ReservationsService.searchCustomers(organization.id, searchTerm);
  };

  const handleCreateCustomer = async (customerData: Partial<Customer>) => {
    if (!organization) throw new Error('No organization');
    return await ReservationsService.createCustomer({
      ...customerData,
      organization_id: organization.id,
    } as any);
  };

  const handleSpaceToggle = (spaceId: string) => {
    setSelectedSpaces((prev) =>
      prev.includes(spaceId)
        ? prev.filter((id) => id !== spaceId)
        : [...prev, spaceId]
    );
  };

  const handleAddExtra = (extra: any) => {
    setExtras((prev) => [...prev, { ...extra, quantity: 1 }]);
  };

  const handleRemoveExtra = (extraId: string) => {
    setExtras((prev) => prev.filter((e) => e.id !== extraId));
  };

  const handleUpdateExtraQuantity = (extraId: string, quantity: number) => {
    setExtras((prev) =>
      prev.map((e) => (e.id === extraId ? { ...e, quantity } : e))
    );
  };

  const calculateNights = () => {
    if (!checkin || !checkout) return 0;
    return ReservationsService.calculateNights(checkin, checkout);
  };

  // Cargar tarifa dinámica cuando cambian espacios o fechas
  useEffect(() => {
    const loadDynamicPricing = async () => {
      if (!organization || !checkin || !checkout || selectedSpaces.length === 0) {
        setDynamicPricing(null);
        return;
      }

      const selectedSpacesData = availableSpaces.filter((s) =>
        selectedSpaces.includes(s.id)
      );
      
      if (selectedSpacesData.length === 0) return;

      try {
        // Usar el tipo del primer espacio seleccionado para obtener la tarifa
        const firstSpace = selectedSpacesData[0];
        const spaceTypeId = firstSpace.space_type_id || firstSpace.space_types?.id;
        
        if (spaceTypeId) {
          const rateInfo = await RatesService.getRateForDate(
            organization.id,
            spaceTypeId,
            checkin
          );
          setDynamicPricing({
            dailyRate: rateInfo.price,
            rateSource: rateInfo.isFromRates ? 'tarifa' : 'base_rate',
          });
        }
      } catch (error) {
        console.error('Error cargando tarifa dinámica:', error);
      }
    };

    loadDynamicPricing();
  }, [organization, checkin, checkout, selectedSpaces, availableSpaces]);

  const calculateTotalEstimated = () => {
    const nights = calculateNights();
    const selectedSpacesData = availableSpaces.filter((s) =>
      selectedSpaces.includes(s.id)
    );
    
    // Usar tarifa dinámica si está disponible, sino usar base_rate
    let roomsTotal = 0;
    if (dynamicPricing) {
      roomsTotal = dynamicPricing.dailyRate * nights * selectedSpacesData.length;
    } else {
      roomsTotal = selectedSpacesData.reduce(
        (sum, space) => sum + (space.space_types?.base_rate || 0) * nights,
        0
      );
    }
    
    const extrasTotal = extras.reduce(
      (sum, extra) => sum + extra.price * extra.quantity,
      0
    );
    return roomsTotal + extrasTotal;
  };

  const handleConfirmReservation = async () => {
    if (!organization || !selectedCustomer) return;

    setIsSubmitting(true);
    try {
      const totalEstimated = calculateTotalEstimated();
      
      await ReservationsService.createReservation({
        organization_id: organization.id,
        customer_id: selectedCustomer.id,
        checkin,
        checkout,
        occupant_count: occupantCount,
        spaces: selectedSpaces,
        total_estimated: totalEstimated,
        channel: 'direct',
        notes,
        metadata: {
          extras,
          category: selectedCategory,
        },
        payment_method: paymentMethod,
        payment_amount: paymentAmount,
      });

      toast({
        title: 'Reserva creada',
        description: 'La reserva se ha creado exitosamente',
      });

      router.push('/app/pms/reservas');
    } catch (error: any) {
      console.error('Error creando reserva:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      toast({
        title: 'Error',
        description: error.message || error.error_description || error.hint || 'No se pudo crear la reserva',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const goToNextStep = () => {
    if (currentStep < STEPS.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const goToPrevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleBack = () => {
    router.push('/app/pms/reservas');
  };

  const selectedSpacesData = availableSpaces.filter((s) =>
    selectedSpaces.includes(s.id)
  );

  const progress = (currentStep / STEPS.length) * 100;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="container mx-auto px-6 py-6">
          <div className="flex items-center gap-4 mb-4">
            <Button variant="outline" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Volver
            </Button>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Nueva Reserva
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Completa los pasos para crear una nueva reserva
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="container mx-auto px-6 py-4">
          <Progress value={progress} className="mb-4" />
          <div className="flex justify-between">
            {STEPS.map((step) => (
              <div
                key={step.id}
                className={`flex flex-col items-center ${
                  step.id < currentStep
                    ? 'text-blue-600 dark:text-blue-400'
                    : step.id === currentStep
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-gray-400 dark:text-gray-600'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center mb-2 ${
                    step.id < currentStep
                      ? 'bg-blue-600 text-white'
                      : step.id === currentStep
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                >
                  {step.id < currentStep ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    step.id
                  )}
                </div>
                <span className="text-xs font-medium hidden sm:block">
                  {step.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-6 py-8">
        <Card className="p-8 max-w-4xl mx-auto">
          {currentStep === 1 && (
            <StepCustomer
              selectedCustomer={selectedCustomer}
              onCustomerSelect={setSelectedCustomer}
              onNext={goToNextStep}
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
              onNext={goToNextStep}
              onBack={goToPrevStep}
            />
          )}

          {currentStep === 3 && (
            <StepSpaces
              availableSpaces={availableSpaces}
              selectedSpaces={selectedSpaces}
              isLoading={isLoadingSpaces}
              nights={calculateNights()}
              onSpaceToggle={handleSpaceToggle}
              onNext={goToNextStep}
              onBack={goToPrevStep}
            />
          )}

          {currentStep === 4 && (
            <StepExtras
              extras={extras}
              onAddExtra={handleAddExtra}
              onRemoveExtra={handleRemoveExtra}
              onUpdateQuantity={handleUpdateExtraQuantity}
              onNext={goToNextStep}
              onBack={goToPrevStep}
              onSkip={goToNextStep}
            />
          )}

          {currentStep === 5 && (
            <StepPayment
              paymentMethod={paymentMethod}
              paymentAmount={paymentAmount}
              totalEstimated={calculateTotalEstimated()}
              notes={notes}
              availablePaymentMethods={paymentMethods}
              onPaymentMethodChange={setPaymentMethod}
              onPaymentAmountChange={setPaymentAmount}
              onNotesChange={setNotes}
              onNext={goToNextStep}
              onBack={goToPrevStep}
            />
          )}

          {currentStep === 6 && selectedCustomer && (
            <StepConfirm
              customer={selectedCustomer}
              checkin={checkin}
              checkout={checkout}
              nights={calculateNights()}
              occupantCount={occupantCount}
              selectedSpaces={selectedSpacesData}
              extras={extras}
              paymentMethod={paymentMethod}
              paymentAmount={paymentAmount}
              totalEstimated={calculateTotalEstimated()}
              notes={notes}
              isSubmitting={isSubmitting}
              onConfirm={handleConfirmReservation}
              onBack={goToPrevStep}
            />
          )}
        </Card>
      </div>
    </div>
  );
}
