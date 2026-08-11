'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
import SpaceTypesService from '@/lib/services/spaceTypesService';
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

export interface NuevaReservaWizardProps {
  preselectedSpaceId?: string | null;
  preselectedCheckin?: string | null;
  preselectedCheckout?: string | null;
  onSuccess?: () => void;
  onCancel?: () => void;
  showHeader?: boolean;
}

export function NuevaReservaWizard({
  preselectedSpaceId,
  preselectedCheckin,
  preselectedCheckout,
  onSuccess,
  onCancel,
  showHeader = true,
}: NuevaReservaWizardProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { organization } = useOrganization();

  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [preselectedSpaceData, setPreselectedSpaceData] = useState<any>(null);

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [checkin, setCheckin] = useState(preselectedCheckin || '');
  const [checkout, setCheckout] = useState(preselectedCheckout || '');
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
  const [spaceTypeRates, setSpaceTypeRates] = useState<Record<string, { dailyRate: number; rateSource: 'tarifa' | 'base_rate' }>>({});
  const [taxIncluded, setTaxIncluded] = useState(false);
  const [appliedTaxIds, setAppliedTaxIds] = useState<string[]>([]);

  useEffect(() => {
    loadCategoriesForOrg();
    loadPaymentMethods();
  }, [organization]);

  useEffect(() => {
    const loadPreselectedSpace = async () => {
      if (!preselectedSpaceId || !organization) return;

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
          .eq('id', preselectedSpaceId)
          .single();

        if (error) throw error;

        if (spaceData) {
          setPreselectedSpaceData(spaceData);
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
  }, [preselectedSpaceId, organization]);

  useEffect(() => {
    if (checkin && checkout && selectedCategory && organization) {
      loadAvailableSpaces();
    }
  }, [checkin, checkout, selectedCategory, organization]);

  useEffect(() => {
    if (preselectedSpaceId && availableSpaces.length > 0 && selectedSpaces.length === 0) {
      const spaceExists = availableSpaces.find((s) => s.id === preselectedSpaceId);
      if (spaceExists) {
        setSelectedSpaces([preselectedSpaceId]);
      }
    }
  }, [preselectedSpaceId, availableSpaces]);

  const loadCategoriesForOrg = async () => {
    if (!organization) return;
    try {
      const [allCategories, orgSpaceTypes] = await Promise.all([
        SpaceCategoriesService.getCategories(),
        SpaceTypesService.getSpaceTypes(organization.id),
      ]);
      const orgCategoryCodes = new Set(orgSpaceTypes.filter((t: any) => t.is_active).map((t: any) => t.category_code));
      setCategories(allCategories.filter((c) => c.is_bookable && orgCategoryCodes.has(c.code)));
    } catch (error) {
      console.error('Error cargando categorías:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los tipos de alojamiento',
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

  useEffect(() => {
    const loadRatesPerSpaceType = async () => {
      if (!organization || !checkin || availableSpaces.length === 0) {
        setSpaceTypeRates({});
        return;
      }

      const uniqueTypeIds = [...new Set(
        availableSpaces
          .map((s) => s.space_type_id || s.space_types?.id)
          .filter(Boolean)
      )] as string[];

      const ratesMap: Record<string, { dailyRate: number; rateSource: 'tarifa' | 'base_rate' }> = {};
      await Promise.all(
        uniqueTypeIds.map(async (typeId) => {
          try {
            const rateInfo = await RatesService.getRateForDate(
              organization.id,
              typeId,
              checkin
            );
            ratesMap[typeId] = {
              dailyRate: rateInfo.price,
              rateSource: rateInfo.isFromRates ? 'tarifa' : 'base_rate',
            };
          } catch {
            const space = availableSpaces.find((s) => (s.space_type_id || s.space_types?.id) === typeId);
            ratesMap[typeId] = {
              dailyRate: space?.space_types?.base_rate || 0,
              rateSource: 'base_rate',
            };
          }
        })
      );
      setSpaceTypeRates(ratesMap);
    };

    loadRatesPerSpaceType();
  }, [organization, checkin, availableSpaces]);

  const calculateTotalEstimated = () => {
    const nights = calculateNights();
    const selectedSpacesData = availableSpaces.filter((s) =>
      selectedSpaces.includes(s.id)
    );

    const groupedByType: Record<string, { count: number; rate: number }> = {};
    for (const space of selectedSpacesData) {
      const typeId = space.space_type_id || space.space_types?.id || 'unknown';
      if (!groupedByType[typeId]) {
        const rateInfo = spaceTypeRates[typeId];
        groupedByType[typeId] = {
          count: 0,
          rate: rateInfo?.dailyRate ?? space.space_types?.base_rate ?? 0,
        };
      }
      groupedByType[typeId].count++;
    }

    const roomsTotal = Object.values(groupedByType).reduce(
      (sum, { count, rate }) => sum + rate * nights * count,
      0
    );

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
          category: selectedCategory,
          tax_included: taxIncluded,
          applied_tax_ids: appliedTaxIds,
        },
        extras: extras.map((e: any) => ({
          organization_service_id: e.organization_service_id || null,
          name: e.name,
          description: e.description,
          unit_price: e.price,
          quantity: e.quantity,
        })),
        payment_method: paymentMethod,
        payment_amount: paymentAmount,
      });

      toast({
        title: 'Reserva creada',
        description: 'La reserva se ha creado exitosamente',
      });

      if (onSuccess) {
        onSuccess();
      } else {
        router.push('/app/pms/reservas');
      }
    } catch (error: any) {
      console.error('Error creando reserva:', error);
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
    if (onCancel) {
      onCancel();
    } else {
      router.push('/app/pms/reservas');
    }
  };

  const selectedSpacesData = availableSpaces.filter((s) =>
    selectedSpaces.includes(s.id)
  );

  const progress = (currentStep / STEPS.length) * 100;

  return (
    <div className="flex flex-col h-full">
      {showHeader && (
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
          <div className="flex flex-wrap items-center gap-4 mb-3">
            <Button variant="outline" onClick={handleBack} size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Volver
            </Button>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">
            Nueva Reserva
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Completa los pasos para crear una nueva reserva
          </p>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-3">
        <Progress value={progress} className="mb-3" />
        <div className="flex justify-between">
          {STEPS.map((step) => (
            <div
              key={step.id}
              className={`flex flex-col items-center ${
                step.id <= currentStep
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-gray-400 dark:text-gray-600'
              }`}
            >
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center mb-1 text-xs ${
                  step.id < currentStep
                    ? 'bg-blue-600 text-white'
                    : step.id === currentStep
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700'
                }`}
              >
                {step.id < currentStep ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  step.id
                )}
              </div>
              <span className="text-[10px] font-medium hidden sm:block">
                {step.name}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <Card className="p-6 max-w-4xl mx-auto">
          {currentStep === 1 && (
            <StepCustomer
              selectedCustomer={selectedCustomer}
              onCustomerSelect={setSelectedCustomer}
              onNext={goToNextStep}
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
              spaceTypeRates={spaceTypeRates}
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
              organizationId={organization?.id}
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
              taxIncluded={taxIncluded}
              onTaxIncludedChange={setTaxIncluded}
              appliedTaxIds={appliedTaxIds}
              onAppliedTaxIdsChange={setAppliedTaxIds}
              extras={extras}
              nights={calculateNights()}
              selectedSpacesData={availableSpaces.filter((s) => selectedSpaces.includes(s.id))}
              spaceTypeRates={spaceTypeRates}
              organizationId={organization?.id}
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
              taxIncluded={taxIncluded}
            />
          )}
        </Card>
      </div>
    </div>
  );
}
