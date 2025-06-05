import React, { useState } from 'react';
import { Branch, BranchFormData, OpeningHours, BranchFeatures } from '@/types/branch';

type BranchFormProps = {
  initialData?: Partial<Branch>;
  onSubmit: (data: BranchFormData) => Promise<void>;
  isLoading?: boolean;
  submitLabel?: string;
};

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

export const BranchForm: React.FC<BranchFormProps> = ({
  initialData = {},
  onSubmit,
  isLoading = false,
  submitLabel = 'Guardar Sucursal',
}) => {
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

  return (
    <div className="w-full max-w-5xl mx-auto bg-white rounded-lg shadow-sm overflow-hidden">
      <form onSubmit={handleSubmit} className="h-full max-h-[80vh] overflow-y-auto p-4 sm:p-6">
      {/* Toolbar */}
      <div className="sticky top-0 z-10 flex justify-between items-center mb-6 pb-3 border-b bg-white">
        <h2 className="text-xl font-bold text-gray-800">
          {initialData.id ? 'Editar Sucursal' : 'Nueva Sucursal'}
        </h2>
        <div className="flex space-x-2">
          <button
            type="submit"
            className="btn btn-primary btn-sm md:btn-md flex items-center gap-2"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <span className="loading loading-spinner loading-xs"></span>
                Guardando...
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {submitLabel}
              </>
            )}
          </button>
        </div>
      </div>
      {/* Información básica */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-4 pb-2 border-b">Información básica</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
            <input
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              required
              placeholder="Nombre de la sucursal"
              className="input input-bordered w-full focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Código de sucursal *</label>
            <input
              type="text"
              name="branch_code"
              value={form.branch_code}
              onChange={handleChange}
              required
              placeholder="Ej: SUC-001"
              className="input input-bordered w-full focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Ubicación */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-4 pb-2 border-b">Ubicación</h3>
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
            <input
              type="text"
              name="address"
              value={form.address}
              onChange={handleChange}
              placeholder="Dirección completa"
              className="input input-bordered w-full focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ciudad</label>
              <input
                type="text"
                name="city"
                value={form.city}
                onChange={handleChange}
                className="input input-bordered w-full focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
              <input
                type="text"
                name="state"
                value={form.state}
                onChange={handleChange}
                className="input input-bordered w-full focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">País</label>
              <input
                type="text"
                name="country"
                value={form.country}
                onChange={handleChange}
                className="input input-bordered w-full focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Código Postal</label>
              <input
                type="text"
                name="postal_code"
                value={form.postal_code}
                onChange={handleChange}
                className="input input-bordered w-full focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Contacto */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-4 pb-2 border-b">Información de contacto</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
            <input
              type="tel"
              name="phone"
              value={form.phone}
              onChange={handleChange}
              placeholder="+57 300 123 4567"
              className="input input-bordered w-full focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              placeholder="sucursal@empresa.com"
              className="input input-bordered w-full focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Horarios */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-4 pb-2 border-b">Horarios de apertura</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="p-2 text-left text-sm font-medium text-gray-700">Día</th>
                <th className="p-2 text-left text-sm font-medium text-gray-700">Abierto</th>
                <th className="p-2 text-left text-sm font-medium text-gray-700">Hora apertura</th>
                <th className="p-2 text-left text-sm font-medium text-gray-700">Hora cierre</th>
              </tr>
            </thead>
            <tbody>
              {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => {
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
                
                return (
                  <tr key={day} className="border-b border-gray-200">
                    <td className="p-2 text-sm">{dayLabel}</td>
                    <td className="p-2">
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!dayHours.closed}
                          onChange={(e) => handleHoursChange(day, 'closed', !e.target.checked)}
                          className="checkbox checkbox-sm checkbox-primary"
                        />
                        <span className="text-sm">{!dayHours.closed ? 'Sí' : 'No'}</span>
                      </label>
                    </td>
                    <td className="p-2">
                      <input
                        type="time"
                        value={dayHours.open || '09:00'}
                        onChange={(e) => handleHoursChange(day, 'open', e.target.value)}
                        disabled={dayHours.closed}
                        className="input input-bordered input-sm w-full max-w-[120px]"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="time"
                        value={dayHours.close || '18:00'}
                        onChange={(e) => handleHoursChange(day, 'close', e.target.value)}
                        disabled={dayHours.closed}
                        className="input input-bordered input-sm w-full max-w-[120px]"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Características */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-4 pb-2 border-b">Características</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={featuresObj.has_wifi || false}
              onChange={(e) => handleFeatureChange('has_wifi', e.target.checked)}
              className="checkbox checkbox-sm checkbox-primary"
            />
            <span className="text-sm">WiFi</span>
          </label>
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={featuresObj.has_parking || false}
              onChange={(e) => handleFeatureChange('has_parking', e.target.checked)}
              className="checkbox checkbox-sm checkbox-primary"
            />
            <span className="text-sm">Estacionamiento</span>
          </label>
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={featuresObj.has_delivery || false}
              onChange={(e) => handleFeatureChange('has_delivery', e.target.checked)}
              className="checkbox checkbox-sm checkbox-primary"
            />
            <span className="text-sm">Delivery</span>
          </label>
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={featuresObj.has_outdoor_seating || false}
              onChange={(e) => handleFeatureChange('has_outdoor_seating', e.target.checked)}
              className="checkbox checkbox-sm checkbox-primary"
            />
            <span className="text-sm">Área exterior</span>
          </label>
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={featuresObj.is_wheelchair_accessible || false}
              onChange={(e) => handleFeatureChange('is_wheelchair_accessible', e.target.checked)}
              className="checkbox checkbox-sm checkbox-primary"
            />
            <span className="text-sm">Accesible para sillas de ruedas</span>
          </label>
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={featuresObj.has_air_conditioning || false}
              onChange={(e) => handleFeatureChange('has_air_conditioning', e.target.checked)}
              className="checkbox checkbox-sm checkbox-primary"
            />
            <span className="text-sm">Aire acondicionado</span>
          </label>
        </div>
      </div>

      {/* Estado */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-4 pb-2 border-b">Estado</h3>
        <div className="flex items-center space-x-6">
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              name="is_main"
              checked={!!form.is_main}
              onChange={handleChange}
              className="checkbox checkbox-primary"
            />
            <span className="text-sm">Sucursal principal</span>
          </label>
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              name="is_active"
              checked={!!form.is_active}
              onChange={handleChange}
              className="checkbox checkbox-primary"
            />
            <span className="text-sm">Activa</span>
          </label>
        </div>
      </div>

      {/* Error */}
      <div className="mt-8 pt-4 border-t">
        {error && (
          <div className="mb-4 p-3 rounded bg-red-50 border border-red-200 text-red-600">
            {error}
          </div>
        )}
      </div>
      </form>
    </div>
  );
};
