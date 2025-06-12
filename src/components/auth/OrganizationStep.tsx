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

  return (
    <div className="space-y-6">
      <div className="mt-8 space-y-6">
        <div className="flex justify-center space-x-4 mb-6">
          <button
            type="button"
            className={`flex-1 py-2 px-4 border rounded-md shadow-sm text-sm font-medium ${
              formData.joinType === 'create'
                ? 'bg-blue-600 text-white border-transparent'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
            onClick={() => updateFormData({ joinType: 'create' })}
          >
            Crear organización
          </button>
          <button
            type="button"
            className={`flex-1 py-2 px-4 border rounded-md shadow-sm text-sm font-medium ${
              formData.joinType === 'join'
                ? 'bg-blue-600 text-white border-transparent'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
            onClick={() => updateFormData({ joinType: 'join' })}
          >
            Unirse a organización
          </button>
        </div>
        
        {formData.joinType === 'create' ? (
          <div className="max-w-4xl mx-auto">
            <CreateOrganizationForm 
              onSuccess={(data: OrganizationData) => {
                updateFormData({
                  organizationName: data.name,
                  organizationType: data.type_id,
                  logoUrl: data.logo_url !== null ? data.logo_url : undefined
                });
                onNext();
              }}
              onCancel={onBack}
              defaultEmail={formData.email}
            />
          </div>
        ) : (
          <div className="max-w-4xl mx-auto">
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
                error ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="Ingresa el código de invitación"
            />
            {error && (
              <p className="mt-1 text-sm text-red-600">{error}</p>
            )}

            <div className="flex justify-between mt-6">
              <button
                type="button"
                onClick={onBack}
                className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50"
                disabled={loading}
              >
                Atrás
              </button>
              <button
                type="button"
                onClick={onNext}
                className="bg-blue-600 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                disabled={loading}
              >
                {loading ? 'Cargando...' : 'Siguiente'}
              </button>
            </div>
            
            <div className="bg-blue-50 p-4 rounded-md mt-6">
              <h3 className="text-sm font-medium text-blue-800">Al unirte con un código:</h3>
              <ul className="mt-2 text-sm text-blue-700 list-disc pl-5 space-y-1">
                <li>Serás asignado al rol definido en la invitación</li>
                <li>Tendrás acceso a la organización inmediatamente</li>
                <li>El código de invitación solo puede usarse una vez</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Remove duplicate buttons when in 'create' mode */}
      {formData.joinType !== 'create' && (
        <div className="flex space-x-4">
          <button
            type="button"
            onClick={onBack}
            className="flex-1 py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Atrás
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
          >
            {loading ? 'Procesando...' : 'Continuar'}
          </button>
        </div>
      )}
    </div>
  );
}
