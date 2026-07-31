'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/config';
import CreateOrganizationForm from './CreateOrganizationForm';
import BranchStep from '@/components/auth/BranchStep';
import SubscriptionStep from '@/components/auth/SubscriptionStep';
import PaymentMethodStep from '@/components/auth/PaymentMethodStep';
import { guardarOrganizacionActiva } from '@/lib/hooks/useOrganization';

interface WizardData {
  // Organización
  organizationName: string;
  organizationLegalName?: string;
  organizationType: number | null;
  organizationDescription?: string;
  organizationEmail?: string;
  organizationPhone?: string;
  organizationAddress?: string;
  organizationCity?: string;
  organizationState?: string;
  organizationCountry?: string;
  organizationCountryCode?: string;
  organizationMunicipalityId?: string;
  organizationPostalCode?: string;
  organizationTaxId?: string;
  organizationNit?: string;
  organizationWebsite?: string;
  organizationSubdomain?: string;
  organizationPrimaryColor?: string;
  organizationSecondaryColor?: string;
  logoUrl?: string;
  // Sucursal principal
  branchName: string;
  branchCode: string;
  branchAddress?: string;
  branchCity?: string;
  branchState?: string;
  branchCountry?: string;
  branchCountryCode?: string;
  branchStateCode?: string;
  branchMunicipalityId?: string;
  branchPostalCode?: string;
  branchPhone?: string;
  branchEmail?: string;
  branchTaxIdentification?: string;
  branchOpeningHours?: string;
  branchFeatures?: string;
  // Suscripción / plan
  subscriptionPlan: string;
  billingPeriod: 'monthly' | 'yearly';
  skipTrial: boolean;
  couponCode?: string;
  validatedCoupon?: any;
  // Método de pago
  stripeCustomerId?: string;
  stripePaymentMethodId?: string;
}

interface CreatedOrganization {
  id: number;
  name: string;
  logo_url?: string | null;
}

interface CreateOrganizationWizardProps {
  onSuccess: (org: CreatedOrganization) => void;
  onCancel: () => void;
}

const DEFAULT_WIZARD_DATA: WizardData = {
  organizationName: '',
  organizationType: null,
  branchName: 'Sucursal Principal',
  branchCode: 'MAIN-001',
  subscriptionPlan: 'pro',
  billingPeriod: 'monthly',
  skipTrial: false,
};

export default function CreateOrganizationWizard({ onSuccess, onCancel }: CreateOrganizationWizardProps) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userInfo, setUserInfo] = useState<{ id: string; email: string; firstName: string; lastName: string } | null>(null);
  const [wizardData, setWizardData] = useState<WizardData>(DEFAULT_WIZARD_DATA);

  useEffect(() => {
    const loadUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('first_name, last_name, email')
        .eq('id', user.id)
        .single();

      setUserInfo({
        id: user.id,
        email: profile?.email || user.email || '',
        firstName: profile?.first_name || '',
        lastName: profile?.last_name || '',
      });
    };
    loadUser();
  }, []);

  const updateFormData = (data: Partial<WizardData>) => {
    setWizardData((prev) => ({ ...prev, ...data }));
  };

  const nextStep = () => setStep((s) => s + 1);
  const prevStep = () => setStep((s) => s - 1);

  // Crea la organización, sucursal principal y suscripción para el usuario ya autenticado
  const finalizeCreation = async () => {
    if (!userInfo) return;
    setLoading(true);
    setError(null);

    try {
      const userId = userInfo.id;
      const email = userInfo.email;

      // 1. Crear organización
      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .insert({
          name: wizardData.organizationName,
          legal_name: wizardData.organizationLegalName || wizardData.organizationName,
          type_id: wizardData.organizationType || 2,
          description: wizardData.organizationDescription || null,
          email: wizardData.organizationEmail || email,
          phone: wizardData.organizationPhone || null,
          website: wizardData.organizationWebsite || null,
          tax_id: wizardData.organizationTaxId || null,
          nit: wizardData.organizationNit || null,
          address: wizardData.organizationAddress || null,
          city: wizardData.organizationCity || null,
          state: wizardData.organizationState || null,
          country: wizardData.organizationCountry || 'Colombia',
          country_code: wizardData.organizationCountryCode || 'COL',
          municipality_id: wizardData.organizationMunicipalityId || null,
          postal_code: wizardData.organizationPostalCode || null,
          primary_color: wizardData.organizationPrimaryColor || '#3B82F6',
          secondary_color: wizardData.organizationSecondaryColor || '#F59E0B',
          subdomain: wizardData.organizationSubdomain || null,
          logo_url: wizardData.logoUrl || null,
          owner_user_id: userId,
          created_by: userId,
          status: 'active',
        })
        .select('id')
        .single();

      if (orgError) throw orgError;
      const orgId = orgData.id;

      // 2. Membresía del usuario como admin de la nueva organización
      const { error: memberError } = await supabase
        .from('organization_members')
        .insert({
          organization_id: orgId,
          user_id: userId,
          role_id: 2, // Admin de organización
          is_super_admin: true,
          is_active: true,
        });
      if (memberError) throw memberError;

      guardarOrganizacionActiva({ id: orgId, name: wizardData.organizationName });
      await supabase.from('profiles').update({ last_org_id: orgId }).eq('id', userId);

      // 3. Actualizar la sucursal principal (creada automáticamente por el trigger de BD)
      const openingHours = wizardData.branchOpeningHours
        ? JSON.parse(wizardData.branchOpeningHours)
        : {
            monday: { open: '09:00', close: '18:00', closed: false },
            tuesday: { open: '09:00', close: '18:00', closed: false },
            wednesday: { open: '09:00', close: '18:00', closed: false },
            thursday: { open: '09:00', close: '18:00', closed: false },
            friday: { open: '09:00', close: '18:00', closed: false },
            saturday: { open: '10:00', close: '15:00', closed: false },
            sunday: { closed: true },
          };
      const features = wizardData.branchFeatures ? JSON.parse(wizardData.branchFeatures) : {};

      const { data: updatedBranches, error: branchError } = await supabase
        .from('branches')
        .update({
          name: wizardData.branchName || 'Sucursal Principal',
          branch_code: wizardData.branchCode || 'MAIN-001',
          address: wizardData.branchAddress || wizardData.organizationAddress || null,
          city: wizardData.branchCity || wizardData.organizationCity || null,
          state: wizardData.branchState || wizardData.organizationState || null,
          country: wizardData.branchCountry || wizardData.organizationCountry || 'Colombia',
          country_code: wizardData.branchCountryCode || wizardData.organizationCountryCode || null,
          state_code: wizardData.branchStateCode || null,
          municipality_id: wizardData.branchMunicipalityId || wizardData.organizationMunicipalityId || null,
          postal_code: wizardData.branchPostalCode || wizardData.organizationPostalCode || null,
          phone: wizardData.branchPhone || wizardData.organizationPhone || null,
          email: wizardData.branchEmail || wizardData.organizationEmail || email,
          tax_identification: wizardData.branchTaxIdentification || null,
          opening_hours: openingHours,
          features,
          manager_id: userId,
          is_main: true,
          is_active: true,
        })
        .eq('organization_id', orgId)
        .eq('is_main', true)
        .select();

      if (branchError) throw branchError;

      const branchId = updatedBranches?.[0]?.id;
      if (branchId) {
        const { data: memberRecord } = await supabase
          .from('organization_members')
          .select('id')
          .eq('organization_id', orgId)
          .eq('user_id', userId)
          .single();

        if (memberRecord) {
          await supabase.from('member_branches').insert({
            organization_member_id: memberRecord.id,
            branch_id: branchId,
          });
        }
      }

      // 4. Configurar suscripción (plan seleccionado + Stripe si hay tarjeta verificada)
      let planCode: string;
      let planId: number;
      if (wizardData.subscriptionPlan.includes('ultimate')) {
        planCode = 'ultimate';
        planId = 5;
      } else if (wizardData.subscriptionPlan.includes('business')) {
        planCode = 'business';
        planId = 3;
      } else {
        planCode = 'pro';
        planId = 2;
      }

      const { data: planData } = await supabase
        .from('plans')
        .select('trial_days')
        .eq('code', planCode)
        .single();
      const trialDays = planData?.trial_days || 15;

      let stripeSubscriptionId: string | null = null;
      let stripeCustomerId: string | null = null;
      let stripeTrialEnd: string | null = null;

      try {
        const stripeResponse = await fetch('/api/stripe/create-subscription', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            organizationId: orgId,
            planCode,
            billingPeriod: wizardData.billingPeriod || 'monthly',
            useTrial: !wizardData.skipTrial,
            userId,
            email,
            customerName: `${userInfo.firstName} ${userInfo.lastName || ''}`.trim(),
            ...(wizardData.stripeCustomerId ? { existingCustomerId: wizardData.stripeCustomerId } : {}),
            ...(wizardData.stripePaymentMethodId ? { paymentMethodId: wizardData.stripePaymentMethodId } : {}),
            ...(wizardData.couponCode ? { couponCode: wizardData.couponCode } : {}),
          }),
        });
        const stripeResult = await stripeResponse.json();
        if (stripeResponse.ok && stripeResult.success) {
          stripeSubscriptionId = stripeResult.subscriptionId;
          stripeCustomerId = stripeResult.customerId;
          stripeTrialEnd = stripeResult.trialEnd || null;
        }
      } catch (stripeErr) {
        console.error('Error creando suscripción en Stripe (no bloqueante):', stripeErr);
      }

      const now = new Date();
      const trialEnd = stripeTrialEnd
        ? new Date(stripeTrialEnd).toISOString()
        : new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000).toISOString();

      const updatePayload: any = {
        plan_id: planId,
        billing_period: wizardData.billingPeriod || 'monthly',
        ...(wizardData.skipTrial
          ? { trial_start: null, trial_end: null, status: 'active' }
          : { trial_start: now.toISOString(), trial_end: trialEnd, status: 'trialing' }),
      };
      if (stripeSubscriptionId) updatePayload.stripe_subscription_id = stripeSubscriptionId;
      if (stripeCustomerId) updatePayload.stripe_customer_id = stripeCustomerId;

      await supabase.from('subscriptions').update(updatePayload).eq('organization_id', orgId);

      onSuccess({ id: orgId, name: wizardData.organizationName, logo_url: wizardData.logoUrl });
    } catch (err: any) {
      console.error('Error creando organización:', err);
      setError(err.message || 'Error al crear la organización');
      setLoading(false);
    }
  };

  const stepLabels = ['Organización', 'Sucursal', 'Plan', 'Pago'];

  return (
    <div className="space-y-6">
      {/* Indicador de pasos */}
      <div className="flex justify-center">
        <div className="flex items-start">
          {stepLabels.map((label, index) => (
            <div key={index} className="flex items-start">
              <div className="flex flex-col items-center w-16 sm:w-20">
                <div
                  className={`flex items-center justify-center w-9 h-9 rounded-full text-sm font-medium ${
                    step >= index + 1 ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300'
                  }`}
                >
                  {index + 1}
                </div>
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-1.5 text-center">
                  {label}
                </span>
              </div>
              {index < stepLabels.length - 1 && (
                <div className={`h-1 w-6 sm:w-10 mt-4 ${step >= index + 2 ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-600'}`}></div>
              )}
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {step === 1 && (
        <CreateOrganizationForm
          onSuccess={(data: any) => {
            updateFormData({
              organizationName: data.name,
              organizationLegalName: data.legal_name,
              organizationType: data.type_id,
              organizationDescription: data.description,
              organizationEmail: data.email,
              organizationPhone: data.phone,
              organizationAddress: data.address,
              organizationCity: data.city,
              organizationState: data.state,
              organizationCountry: data.country,
              organizationCountryCode: data.country_code,
              organizationMunicipalityId: data.municipality_id,
              organizationPostalCode: data.postal_code,
              organizationTaxId: data.tax_id,
              organizationNit: data.nit,
              organizationWebsite: data.website,
              organizationSubdomain: data.subdomain,
              organizationPrimaryColor: data.primary_color,
              organizationSecondaryColor: data.secondary_color,
              logoUrl: data.logo_url || undefined,
            });
            nextStep();
          }}
          onCancel={onCancel}
          defaultEmail={userInfo?.email || ''}
          isSignupMode={true}
        />
      )}

      {step === 2 && (
        <BranchStep
          formData={wizardData}
          updateFormData={updateFormData}
          onNext={nextStep}
          onBack={prevStep}
          loading={loading}
        />
      )}

      {step === 3 && (
        <SubscriptionStep
          formData={wizardData}
          updateFormData={updateFormData}
          onNext={nextStep}
          onBack={prevStep}
          loading={loading}
        />
      )}

      {step === 4 && userInfo && (
        <PaymentMethodStep
          formData={{
            email: userInfo.email,
            firstName: userInfo.firstName,
            lastName: userInfo.lastName,
            subscriptionPlan: wizardData.subscriptionPlan,
            billingPeriod: wizardData.billingPeriod,
            skipTrial: wizardData.skipTrial,
            validatedCoupon: wizardData.validatedCoupon,
          }}
          updateFormData={updateFormData}
          onNext={finalizeCreation}
          onBack={prevStep}
          onSkip={finalizeCreation}
          loading={loading}
        />
      )}
    </div>
  );
}
