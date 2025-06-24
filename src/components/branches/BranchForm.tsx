import React, { useState, forwardRef, useImperativeHandle, FormEvent } from 'react';
import { Branch, BranchFormData, OpeningHours, BranchFeatures } from '@/types/branch';
import { MapPinIcon, PhoneIcon, EnvelopeIcon, BuildingOfficeIcon, IdentificationIcon } from '@heroicons/react/24/outline';

type BranchFormProps = {
  initialData?: Partial<Branch>;
  onSubmit: (data: BranchFormData) => Promise<void>;
  isLoading?: boolean;
  submitLabel?: string;
  hideSubmitButton?: boolean;
  noFormWrapper?: boolean;
};

export interface BranchFormRef {
  submitForm: () => void;
}

const defaultOpeningHours = JSON.stringify({
  monday: { open: '09:00', close: '18:00', closed: false },
  tuesday: { open: '09:00', close: '18:00', closed: false },
  wednesday: { open: '09:00', close: '18:00', closed: false },
  thursday: { open: '09:00', close: '18:00', closed: false },
  friday: { open: '09:00', close: '18:00', closed: false },
  saturday: { open: '10:00', close: '15:00', closed: false },
  sunday: { closed: true }
}, null, 2);

const defaultFeatures = JSON.stringify({
  has_wifi: false,
  has_parking: false,
  has_delivery: false,
  has_outdoor_seating: false,
  is_wheelchair_accessible: false,
  has_air_conditioning: false,
}, null, 2);

export const BranchForm = forwardRef<BranchFormRef, BranchFormProps>((
  {
    initialData = {},
    onSubmit,
    isLoading = false,
    submitLabel = 'Guardar Sucursal',
    hideSubmitButton = false,
    noFormWrapper = false,
  },
  ref
) => {
  // Parse JSON strings to objects for UI manipulation
  const parseOpeningHours = (json: string | undefined): OpeningHours => {
    try {
      return json ? JSON.parse(json) : JSON.parse(defaultOpeningHours);
    } catch (e) {
      return JSON.parse(defaultOpeningHours);
    }
  };

  const parseFeatures = (json: string | undefined): BranchFeatures => {
    try {
      return json ? JSON.parse(json) : JSON.parse(defaultFeatures);
    } catch (e) {
      return JSON.parse(defaultFeatures);
    }
  };

  // UI state for opening hours and features
  const [openingHoursObj, setOpeningHoursObj] = useState<OpeningHours>(
    parseOpeningHours(initialData.opening_hours ? JSON.stringify(initialData.opening_hours) : undefined)
  );
  
  const [featuresObj, setFeaturesObj] = useState<BranchFeatures>(
    parseFeatures(initialData.features ? JSON.stringify(initialData.features) : undefined)
  );

  const [form, setForm] = useState<BranchFormData>({
    name: initialData.name || '',
    address: initialData.address || '',
    city: initialData.city || '',
    state: initialData.state || '',
    country: initialData.country || '',
    postal_code: initialData.postal_code || '',
    latitude: initialData.latitude || undefined,
    longitude: initialData.longitude || undefined,
    phone: initialData.phone || '',
    email: initialData.email || '',
    manager_id: initialData.manager_id || '',
    status: initialData.status || 'active',
    is_main: initialData.is_main || false,
    tax_identification: initialData.tax_identification || '',
    opening_hours: initialData.opening_hours ? JSON.stringify(initialData.opening_hours, null, 2) : defaultOpeningHours,
    features: initialData.features ? JSON.stringify(initialData.features, null, 2) : defaultFeatures,
    capacity: initialData.capacity || undefined,
    branch_type: initialData.branch_type || '',
    zone: initialData.zone || '',
    branch_code: initialData.branch_code || '',
    is_active: initialData.is_active ?? true,
    metadata: initialData.metadata || {},
    organization_id: initialData.organization_id!,
  });

  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    const type = (e.target as HTMLInputElement).type;
    
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };
  
  // Handle opening hours changes
  const handleHoursChange = (day: string, field: string, value: string | boolean) => {
    setOpeningHoursObj(prev => ({
      ...prev,
      [day]: {
        ...prev[day as keyof OpeningHours],
        [field]: value
      }
    }));
  };
  
  // Handle features changes
  const handleFeatureChange = (feature: string, checked: boolean) => {
    setFeaturesObj(prev => ({
      ...prev,
      [feature]: checked
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      // Convert opening hours and features objects to JSON strings
      const formWithJson = {
        ...form,
        opening_hours: JSON.stringify(openingHoursObj),
        features: JSON.stringify(featuresObj)
      };
      await onSubmit(formWithJson);
    } catch (err: any) {
      setError(err.message || 'Error al guardar la sucursal');
    }
  };
  
  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    submitForm: () => {
      // Manually trigger form validation and submission
      const formWithJson = {
        ...form,
        opening_hours: JSON.stringify(openingHoursObj),
        features: JSON.stringify(featuresObj)
      };
      onSubmit(formWithJson).catch((err: any) => {
        setError(err.message || 'Error al guardar la sucursal');
      });
    }
  }));

  // Form content to be rendered inside or outside a form element
  const formContent = (
    <>
      {/* Toolbar */}
      <div className="sticky top-0 z-10 flex justify-between items-center p-4 sm:p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-b">
        <div className="flex items-center gap-3">
          <div className="bg-blue-100 p-2 rounded-lg">
            <BuildingOfficeIcon className="h-6 w-6 text-blue-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-800">
            {initialData.id ? 'Editar Sucursal' : 'Nueva Sucursal'}
          </h2>
        </div>
        {!hideSubmitButton && (
          <div className="flex space-x-2">
            <button
              type="submit"
              className="btn btn-primary btn-sm md:btn-md flex items-center gap-2 shadow-sm hover:shadow transition-all duration-200"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <span className="loading loading-spinner loading-xs"></span>
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>{submitLabel}</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
      {/* Contenido del formulario */}
      <div className="p-4 sm:p-6 space-y-8">
        {/* Información básica */}
        <div className="bg-white rounded-lg p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <IdentificationIcon className="h-5 w-5 text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-800">Información básica</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Nombre *</label>
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleChange}
                required
                placeholder="Nombre de la sucursal"
                className="input input-bordered w-full focus:ring-2 focus:ring-blue-500 transition-all duration-200 bg-gray-50 hover:bg-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Código de sucursal *</label>
              <input
                type="text"
                name="branch_code"
                value={form.branch_code}
                onChange={handleChange}
                required
                placeholder="Ej: SUC-001"
                className="input input-bordered w-full focus:ring-2 focus:ring-blue-500 transition-all duration-200 bg-gray-50 hover:bg-white"
              />
            </div>
          </div>
        </div>

        {/* Ubicación */}
        <div className="bg-white rounded-lg p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <MapPinIcon className="h-5 w-5 text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-800">Ubicación</h3>
          </div>
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Dirección</label>
              <input
                type="text"
                name="address"
                value={form.address}
                onChange={handleChange}
                placeholder="Dirección completa"
                className="input input-bordered w-full focus:ring-2 focus:ring-blue-500 transition-all duration-200 bg-gray-50 hover:bg-white"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Ciudad</label>
                <input
                  type="text"
                  name="city"
                  value={form.city}
                  onChange={handleChange}
                  placeholder="Ciudad"
                  className="input input-bordered w-full focus:ring-2 focus:ring-blue-500 transition-all duration-200 bg-gray-50 hover:bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Estado</label>
                <input
                  type="text"
                  name="state"
                  value={form.state}
                  onChange={handleChange}
                  placeholder="Estado o provincia"
                  className="input input-bordered w-full focus:ring-2 focus:ring-blue-500 transition-all duration-200 bg-gray-50 hover:bg-white"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">País</label>
                <input
                  type="text"
                  name="country"
                  value={form.country}
                  onChange={handleChange}
                  placeholder="País"
                  className="input input-bordered w-full focus:ring-2 focus:ring-blue-500 transition-all duration-200 bg-gray-50 hover:bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Código Postal</label>
                <input
                  type="text"
                  name="postal_code"
                  value={form.postal_code}
                  onChange={handleChange}
                  placeholder="Código postal"
                  className="input input-bordered w-full focus:ring-2 focus:ring-blue-500 transition-all duration-200 bg-gray-50 hover:bg-white"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Contacto */}
        <div className="bg-white rounded-lg p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <PhoneIcon className="h-5 w-5 text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-800">Información de contacto</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Teléfono</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500">
                  <PhoneIcon className="h-4 w-4" />
                </span>
                <input
                  type="tel"
                  name="phone"
                  value={form.phone}
                  onChange={handleChange}
                  placeholder="+57 300 123 4567"
                  className="input input-bordered w-full pl-10 focus:ring-2 focus:ring-blue-500 transition-all duration-200 bg-gray-50 hover:bg-white"
                />
              </div>
            </div>
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500">
                  <EnvelopeIcon className="h-4 w-4" />
                </span>
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="sucursal@empresa.com"
                  className="input input-bordered w-full pl-10 focus:ring-2 focus:ring-blue-500 transition-all duration-200 bg-gray-50 hover:bg-white"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Horarios */}
        <div className="bg-white rounded-lg p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-lg font-semibold text-gray-800">Horarios de apertura</h3>
          </div>
          <div className="overflow-x-auto">
            <div className="bg-gray-50 rounded-lg p-1">
              <table className="w-full min-w-[600px] border-collapse">
                <thead>
                  <tr className="bg-blue-50 rounded-t-lg">
                    <th className="p-3 text-left text-sm font-medium text-gray-700 rounded-tl-lg">Día</th>
                    <th className="p-3 text-left text-sm font-medium text-gray-700">Abierto</th>
                    <th className="p-3 text-left text-sm font-medium text-gray-700">Hora apertura</th>
                    <th className="p-3 text-left text-sm font-medium text-gray-700 rounded-tr-lg">Hora cierre</th>
                  </tr>
                </thead>
                <tbody>
                  {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day, index) => {
                    const dayLabel = {
                      monday: 'Lunes',
                      tuesday: 'Martes',
                      wednesday: 'Miércoles',
                      thursday: 'Jueves',
                      friday: 'Viernes',
                      saturday: 'Sábado',
                      sunday: 'Domingo'
                    }[day];
                    
                    const dayHours = openingHoursObj[day as keyof OpeningHours] || { open: '09:00', close: '18:00', closed: false };
                    const isLast = index === 6;
                    
                    return (
                      <tr key={day} className={`${isLast ? '' : 'border-b border-gray-200'} hover:bg-gray-50`}>
                        <td className={`p-3 text-sm font-medium ${isLast ? 'rounded-bl-lg' : ''}`}>{dayLabel}</td>
                        <td className="p-3">
                          <label className="flex items-center space-x-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!dayHours.closed}
                              onChange={(e) => handleHoursChange(day, 'closed', !e.target.checked)}
                              className="checkbox checkbox-sm checkbox-primary"
                            />
                            <span className="text-sm font-medium">{!dayHours.closed ? 'Sí' : 'No'}</span>
                          </label>
                        </td>
                        <td className="p-3">
                          <input
                            type="time"
                            value={dayHours.open || '09:00'}
                            onChange={(e) => handleHoursChange(day, 'open', e.target.value)}
                            disabled={dayHours.closed}
                            className="input input-bordered input-sm w-full max-w-[120px] bg-white disabled:bg-gray-100 disabled:text-gray-400"
                          />
                        </td>
                        <td className={`p-3 ${isLast ? 'rounded-br-lg' : ''}`}>
                          <input
                            type="time"
                            value={dayHours.close || '18:00'}
                            onChange={(e) => handleHoursChange(day, 'close', e.target.value)}
                            disabled={dayHours.closed}
                            className="input input-bordered input-sm w-full max-w-[120px] bg-white disabled:bg-gray-100 disabled:text-gray-400"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        {/* Características */}
        <div className="bg-white rounded-lg p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <h3 className="text-lg font-semibold text-gray-800">Características</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div className="bg-gray-50 hover:bg-blue-50 p-3 rounded-lg transition-all duration-200">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={featuresObj.has_wifi || false}
                  onChange={(e) => handleFeatureChange('has_wifi', e.target.checked)}
                  className="checkbox checkbox-sm checkbox-primary"
                />
                <span className="text-sm font-medium">WiFi</span>
              </label>
            </div>
            <div className="bg-gray-50 hover:bg-blue-50 p-3 rounded-lg transition-all duration-200">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={featuresObj.has_parking || false}
                  onChange={(e) => handleFeatureChange('has_parking', e.target.checked)}
                  className="checkbox checkbox-sm checkbox-primary"
                />
                <span className="text-sm font-medium">Estacionamiento</span>
              </label>
            </div>
            <div className="bg-gray-50 hover:bg-blue-50 p-3 rounded-lg transition-all duration-200">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={featuresObj.has_delivery || false}
                  onChange={(e) => handleFeatureChange('has_delivery', e.target.checked)}
                  className="checkbox checkbox-sm checkbox-primary"
                />
                <span className="text-sm font-medium">Delivery</span>
              </label>
            </div>
            <div className="bg-gray-50 hover:bg-blue-50 p-3 rounded-lg transition-all duration-200">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={featuresObj.has_outdoor_seating || false}
                  onChange={(e) => handleFeatureChange('has_outdoor_seating', e.target.checked)}
                  className="checkbox checkbox-sm checkbox-primary"
                />
                <span className="text-sm font-medium">Área exterior</span>
              </label>
            </div>
            <div className="bg-gray-50 hover:bg-blue-50 p-3 rounded-lg transition-all duration-200">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={featuresObj.is_wheelchair_accessible || false}
                  onChange={(e) => handleFeatureChange('is_wheelchair_accessible', e.target.checked)}
                  className="checkbox checkbox-sm checkbox-primary"
                />
                <span className="text-sm font-medium">Accesible para sillas de ruedas</span>
              </label>
            </div>
            <div className="bg-gray-50 hover:bg-blue-50 p-3 rounded-lg transition-all duration-200">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={featuresObj.has_air_conditioning || false}
                  onChange={(e) => handleFeatureChange('has_air_conditioning', e.target.checked)}
                  className="checkbox checkbox-sm checkbox-primary"
                />
                <span className="text-sm font-medium">Aire acondicionado</span>
              </label>
            </div>
          </div>
        </div>
      </div>

        {/* Estado */}
        <div className="bg-white rounded-lg p-5 border border-gray-100 shadow-sm mb-8">
          <div className="flex items-center gap-2 mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="text-lg font-semibold text-gray-800">Estado</h3>
        </div>
        <div className="flex flex-col sm:flex-row gap-4 sm:gap-8">
          <div className="bg-gray-50 hover:bg-blue-50 p-3 rounded-lg transition-all duration-200">
            <label className="flex items-center space-x-3 cursor-pointer">
              <input
                type="checkbox"
                name="is_main"
                checked={!!form.is_main}
                onChange={handleChange}
                className="checkbox checkbox-sm checkbox-primary"
              />
              <span className="text-sm font-medium">Sucursal principal</span>
            </label>
          </div>
          <div className="bg-gray-50 hover:bg-blue-50 p-3 rounded-lg transition-all duration-200">
            <label className="flex items-center space-x-3 cursor-pointer">
              <input
                type="checkbox"
                name="is_active"
                checked={!!form.is_active}
                onChange={handleChange}
                className="checkbox checkbox-sm checkbox-primary"
              />
              <span className="text-sm font-medium">Sucursal activa</span>
            </label>
          </div>
        </div>
      </div>

      {/* Error */}
      <div className="mt-6">
        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-md shadow-sm mb-4">
            <div className="flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        )}
      </div>
    </>
  );
  
  return noFormWrapper ? (
    <div className="branch-form">{formContent}</div>
  ) : (
    <form onSubmit={handleSubmit} className="branch-form">{formContent}</form>
  );
});

// Add display name for debugging
BranchForm.displayName = 'BranchForm';
