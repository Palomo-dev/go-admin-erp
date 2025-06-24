'use client';

import React, { useState } from 'react';
import CreateOrganizationForm from '@/components/organization/CreateOrganizationForm';

interface FormData {
  joinType: 'create' | 'join';
  organizationName: string;
  organizationType: number | null;
  invitationCode: string;
  email?: string;
  logoUrl?: string | null;
}

interface OrganizationData {
  name: string;
  type_id: number;
  logo_url?: string | null;
}

type OrganizationStepProps = {
  formData: FormData;
  updateFormData: (data: Partial<FormData>) => void;
  onNext: () => void;
  onBack: () => void;
  loading: boolean;
};

export default function OrganizationStep({ 
  formData, 
  updateFormData, 
  onNext, 
  onBack,
  loading 
}: OrganizationStepProps) {
  const [error, setError] = useState<string>('');
  const [innerStep, setInnerStep] = useState<number>(1); // Track inner steps: 1 = selection, 2 = form

  // Handle inner step navigation
  const nextInnerStep = () => {
    setInnerStep(2);
  };

  const prevInnerStep = () => {
    setInnerStep(1);
  };

  // Handle form submission for join mode
  const handleJoinSubmit = () => {
    if (!formData.invitationCode) {
      setError('El código de invitación es requerido');
      return;
    }
    setError('');
    onNext(); // Proceed to the next main step
  };

  return (
    <div className="space-y-6">
      {innerStep === 1 ? (
        // Inner Step 1: Choose between create or join
        <div className="mt-8 space-y-6">
          <div className="text-center mb-6">
            <h3 className="text-lg font-medium text-gray-900">Elige una opción</h3>
            <p className="mt-1 text-sm text-gray-500">
              Puedes crear una nueva organización o unirte a una existente con un código de invitación.
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row justify-center gap-4 mt-6">
            <button
              type="button"
              className="flex-1 py-4 px-6 border rounded-md shadow-sm text-base font-medium bg-white text-gray-700 border-gray-300 hover:bg-gray-50 flex flex-col items-center gap-3"
              onClick={() => {
                updateFormData({ joinType: 'create' });
                nextInnerStep();
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              Crear nueva organización
            </button>
            <button
              type="button"
              className="flex-1 py-4 px-6 border rounded-md shadow-sm text-base font-medium bg-white text-gray-700 border-gray-300 hover:bg-gray-50 flex flex-col items-center gap-3"
              onClick={() => {
                updateFormData({ joinType: 'join' });
                nextInnerStep();
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
              Unirse con código
            </button>
          </div>

          <div className="flex justify-between mt-8">
            <button
              type="button"
              onClick={onBack}
              className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50"
              disabled={loading}
            >
              Atrás
            </button>
          </div>
        </div>
      ) : (
        // Inner Step 2: Form based on selection
        <div className="mt-8 space-y-6">
          {formData.joinType === 'create' ? (
            <div className="max-w-4xl mx-auto">
              <div className="mb-6">
                <button
                  type="button"
                  onClick={prevInnerStep}
                  className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Volver a opciones
                </button>
              </div>
              
              <CreateOrganizationForm 
                onSuccess={(data: OrganizationData) => {
                  updateFormData({
                    organizationName: data.name,
                    organizationType: data.type_id,
                    logoUrl: data.logo_url !== null ? data.logo_url : undefined
                  });
                  onNext();
                }}
                onCancel={prevInnerStep}
                defaultEmail={formData.email}
              />
            </div>
          ) : (
            <div className="max-w-4xl mx-auto">
              <div className="mb-6">
                <button
                  type="button"
                  onClick={prevInnerStep}
                  className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Volver a opciones
                </button>
              </div>
              
              <h3 className="text-lg font-medium text-gray-900 mb-4">Unirse con código de invitación</h3>
              
              <label htmlFor="invitationCode" className="block text-sm font-medium text-gray-700">
                Código de invitación
              </label>
              <input
                type="text"
                id="invitationCode"
                name="invitationCode"
                value={formData.invitationCode}
                onChange={(e) => updateFormData({ invitationCode: e.target.value })}
                className={`mt-1 block w-full rounded-md shadow-sm sm:text-sm ${
                  error ? 'border-red-300 focus:ring-red-500 focus:border-red-500' : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
                }`}
                placeholder="Ingresa el código de invitación"
              />
              {error && (
                <p className="mt-1 text-sm text-red-600">{error}</p>
              )}

              <div className="bg-blue-50 p-4 rounded-md mt-6">
                <h3 className="text-sm font-medium text-blue-800">Al unirte con un código:</h3>
                <ul className="mt-2 text-sm text-blue-700 list-disc pl-5 space-y-1">
                  <li>Serás asignado al rol definido en la invitación</li>
                  <li>Tendrás acceso a la organización inmediatamente</li>
                  <li>El código de invitación solo puede usarse una vez</li>
                </ul>
              </div>
              
              <div className="flex justify-between mt-6">
                <button
                  type="button"
                  onClick={prevInnerStep}
                  className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50"
                  disabled={loading}
                >
                  Atrás
                </button>
                <button
                  type="button"
                  onClick={handleJoinSubmit}
                  className="bg-blue-600 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  disabled={loading}
                >
                  {loading ? 'Cargando...' : 'Siguiente'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
