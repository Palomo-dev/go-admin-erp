'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/config';

type OrganizationType = {
  id: number;
  name: string;
  description: string;
};

type OrganizationStepProps = {
  formData: {
    joinType: 'create' | 'join';
    organizationName: string;
    organizationType: number | null;
    invitationCode: string;
  };
  updateFormData: (data: Partial<typeof formData>) => void;
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
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [orgTypes, setOrgTypes] = useState<OrganizationType[]>([]);
  
  // Cargar tipos de organización
  useEffect(() => {
    const fetchOrgTypes = async () => {
      const { data, error } = await supabase
        .from('organization_types')
        .select('*')
        .order('name');
      
      if (!error && data) {
        setOrgTypes(data);
      }
    };
    
    fetchOrgTypes();
  }, []);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    if (formData.joinType === 'create') {
      // Validar nombre de organización
      if (!formData.organizationName.trim()) {
        newErrors.organizationName = 'El nombre de la organización es requerido';
      }
      
      // Validar tipo de organización
      if (!formData.organizationType) {
        newErrors.organizationType = 'Seleccione un tipo de organización';
      }
    } else {
      // Validar código de invitación
      if (!formData.invitationCode.trim()) {
        newErrors.invitationCode = 'El código de invitación es requerido';
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (validateForm()) {
      onNext();
    }
  };

  return (
    <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
      <div className="space-y-4">
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
            Unirme con código
          </button>
        </div>
        
        {formData.joinType === 'create' ? (
          <>
            <div>
              <label htmlFor="organizationName" className="block text-sm font-medium text-gray-700">
                Nombre de la organización
              </label>
              <input
                id="organizationName"
                name="organizationName"
                type="text"
                required
                className={`mt-1 block w-full px-3 py-2 border ${errors.organizationName ? 'border-red-300' : 'border-gray-300'} rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500`}
                value={formData.organizationName}
                onChange={(e) => updateFormData({ organizationName: e.target.value })}
              />
              {errors.organizationName && <p className="mt-1 text-sm text-red-600">{errors.organizationName}</p>}
            </div>
            
            <div>
              <label htmlFor="organizationType" className="block text-sm font-medium text-gray-700">
                Tipo de organización
              </label>
              <select
                id="organizationType"
                name="organizationType"
                required
                className={`mt-1 block w-full px-3 py-2 border ${errors.organizationType ? 'border-red-300' : 'border-gray-300'} rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500`}
                value={formData.organizationType || ''}
                onChange={(e) => updateFormData({ organizationType: Number(e.target.value) || null })}
              >
                <option value="">Seleccionar tipo</option>
                {orgTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name.charAt(0).toUpperCase() + type.name.slice(1)} - {type.description}
                  </option>
                ))}
              </select>
              {errors.organizationType && <p className="mt-1 text-sm text-red-600">{errors.organizationType}</p>}
            </div>
            
            <div className="bg-blue-50 p-4 rounded-md">
              <h3 className="text-sm font-medium text-blue-800">Al crear una organización:</h3>
              <ul className="mt-2 text-sm text-blue-700 list-disc pl-5 space-y-1">
                <li>Serás asignado como administrador</li>
                <li>Podrás invitar a otros usuarios</li>
                <li>Comenzarás con un plan de prueba gratuito</li>
                <li>Podrás personalizar tu organización en el siguiente paso</li>
              </ul>
            </div>
          </>
        ) : (
          <>
            <div>
              <label htmlFor="invitationCode" className="block text-sm font-medium text-gray-700">
                Código de invitación
              </label>
              <input
                id="invitationCode"
                name="invitationCode"
                type="text"
                required
                className={`mt-1 block w-full px-3 py-2 border ${errors.invitationCode ? 'border-red-300' : 'border-gray-300'} rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500`}
                value={formData.invitationCode}
                onChange={(e) => updateFormData({ invitationCode: e.target.value })}
              />
              {errors.invitationCode && <p className="mt-1 text-sm text-red-600">{errors.invitationCode}</p>}
            </div>
            
            <div className="bg-blue-50 p-4 rounded-md">
              <h3 className="text-sm font-medium text-blue-800">Al unirte con un código:</h3>
              <ul className="mt-2 text-sm text-blue-700 list-disc pl-5 space-y-1">
                <li>Serás asignado al rol definido en la invitación</li>
                <li>Tendrás acceso a la organización inmediatamente</li>
                <li>El código de invitación solo puede usarse una vez</li>
              </ul>
            </div>
          </>
        )}
      </div>

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
          className="flex-1 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          {loading ? 'Procesando...' : 'Registrarme'}
        </button>
      </div>
    </form>
  );
}
