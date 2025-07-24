'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Branch, BranchFormData } from '@/types/branch';
import { BranchForm, BranchFormRef } from '@/components/branches/BranchForm';

interface FormData {
  // Branch data
  branchName: string;
  branchCode: string;
  branchAddress?: string;
  branchCity?: string;
  branchState?: string;
  branchCountry?: string;
  branchPostalCode?: string;
  branchPhone?: string;
  branchEmail?: string;
  // Organization data (for reference)
  organizationId?: number;
}

type BranchStepProps = {
  formData: FormData;
  updateFormData: (data: Partial<FormData>) => void;
  onNext: () => void;
  onBack: () => void;
  loading: boolean;
  organizationId?: number;
};

export default function BranchStep({
  formData,
  updateFormData,
  onNext,
  onBack,
  loading,
  organizationId
}: BranchStepProps) {
  const [error, setError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState<boolean>(false);
  const formRef = useRef<BranchFormRef>(null);

  // Handle form submission
  const handleSubmit = async (branchData: BranchFormData) => {
    setFormLoading(true);
    setError(null);
    
    try {
      // Extract relevant data from the branch form
      const { name, branch_code, address, city, state, country, postal_code, phone, email } = branchData;
      
      // Update the form data in the parent component
      updateFormData({
        branchName: name,
        branchCode: branch_code,
        branchAddress: address,
        branchCity: city,
        branchState: state,
        branchCountry: country,
        branchPostalCode: postal_code,
        branchPhone: phone,
        branchEmail: email,
        organizationId: organizationId
      });
      
      // Move to the next step
      onNext();
    } catch (err: any) {
      setError(err.message || 'Error al configurar la sucursal principal');
    } finally {
      setFormLoading(false);
    }
  };

  // Create initial data for the branch form
  const initialBranchData: Partial<Branch> = {
    name: formData.branchName || 'Sucursal Principal',
    branch_code: formData.branchCode || 'MAIN-001',
    address: formData.branchAddress,
    city: formData.branchCity,
    state: formData.branchState,
    country: formData.branchCountry,
    postal_code: formData.branchPostalCode,
    phone: formData.branchPhone,
    email: formData.branchEmail,
    is_main: true,
    is_active: true,
    organization_id: organizationId || 0
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h3 className="text-lg font-medium text-gray-900">Configura tu sucursal principal</h3>
        <p className="mt-1 text-sm text-gray-500">
          Esta será la sucursal principal de tu organización. Podrás añadir más sucursales después.
        </p>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
          <span className="block sm:inline">{error}</span>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <BranchForm
          ref={formRef}
          initialData={initialBranchData}
          onSubmit={handleSubmit}
          isLoading={loading || formLoading}
          submitLabel="Continuar"
          hideSubmitButton={true}
          noFormWrapper={true}
          hideStatusSection={true}
        />
      </div>

      <div className="flex justify-between mt-6">
        <button
          type="button"
          onClick={onBack}
          className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50"
          disabled={loading || formLoading}
        >
          Atrás
        </button>
        
        <button
          type="button"
          onClick={() => {
            // Submit the form using the ref
            if (formRef.current) {
              formRef.current.submitForm();
            }
          }}
          className="btn btn-primary flex items-center gap-2 shadow-sm hover:shadow transition-all duration-200"
          disabled={loading || formLoading}
        >
          {loading || formLoading ? (
            <>
              <span className="loading loading-spinner loading-xs"></span>
              <span>Guardando...</span>
            </>
          ) : (
            <>
              <span>Continuar</span>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
