'use client';

import React, { useState, useEffect } from 'react';
import { Branch } from '@/types/branch';
import BranchesMap from './BranchesMap';
import { GeocodingService, GeocodingError } from '@/lib/services/geocodingService';

interface BranchMapModalProps {
  isOpen: boolean;
  branches: Branch[];
  selectedBranchId?: number | null;
  onClose: () => void;
  onBranchSelect?: (branch: Branch) => void;
  onBranchesUpdate?: (branches: Branch[]) => void;
}

const BranchMapModal: React.FC<BranchMapModalProps> = ({
  isOpen,
  branches,
  selectedBranchId,
  onClose,
  onBranchSelect,
  onBranchesUpdate
}) => {
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [isGeocodingAll, setIsGeocodingAll] = useState(false);
  const [geocodingProgress, setGeocodingProgress] = useState({ current: 0, total: 0, name: '' });
  const [geocodingErrors, setGeocodingErrors] = useState<GeocodingError[]>([]);
  const [isGeocodingSingle, setIsGeocodingSingle] = useState(false);

  // Actualizar selección cuando cambia el prop
  useEffect(() => {
    if (selectedBranchId) {
      const branch = branches.find(b => b.id === selectedBranchId);
      setSelectedBranch(branch || null);
    }
  }, [selectedBranchId, branches]);

  if (!isOpen) return null;

  const handleBranchSelect = (branch: Branch) => {
    setSelectedBranch(branch);
    onBranchSelect?.(branch);
  };

  const branchesWithoutCoords = branches.filter(b => !b.latitude || !b.longitude);
  const branchesWithCoords = branches.filter(b => b.latitude && b.longitude);

  const handleGeocodeAll = async () => {
    if (branchesWithoutCoords.length === 0) {
      alert('Todas las sucursales ya tienen coordenadas');
      return;
    }

    setIsGeocodingAll(true);
    setGeocodingErrors([]);
    setGeocodingProgress({ current: 0, total: branchesWithoutCoords.length, name: '' });

    try {
      const { success, errors } = await GeocodingService.geocodeMultipleBranches(
        branchesWithoutCoords,
        (current, total, branchName) => {
          setGeocodingProgress({ current, total, name: branchName });
        }
      );

      setGeocodingErrors(errors);

      if (success.length > 0) {
        // Actualizar las sucursales con las nuevas coordenadas
        const updatedBranches = branches.map(branch => {
          const updated = success.find(s => s.id === branch.id);
          return updated || branch;
        });

        onBranchesUpdate?.(updatedBranches);
        
        alert(`✅ ${success.length} sucursal(es) geocodificada(s) exitosamente`);
      }

      if (errors.length > 0) {
        console.warn('Errores de geocodificación:', errors);
      }

    } catch (error) {
      console.error('Error en geocodificación masiva:', error);
      alert('Error durante la geocodificación. Ver consola para detalles.');
    } finally {
      setIsGeocodingAll(false);
      setGeocodingProgress({ current: 0, total: 0, name: '' });
    }
  };

  const handleGeocodeSingle = async (branch: Branch) => {
    setIsGeocodingSingle(true);
    
    try {
      const updatedBranch = await GeocodingService.geocodeBranch(branch);
      
      // Actualizar la lista de sucursales
      const updatedBranches = branches.map(b => 
        b.id === branch.id ? updatedBranch : b
      );
      
      onBranchesUpdate?.(updatedBranches);
      setSelectedBranch(updatedBranch);
      
      alert(`✅ Sucursal "${branch.name}" geocodificada exitosamente`);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      alert(`❌ Error geocodificando "${branch.name}": ${errorMessage}`);
    } finally {
      setIsGeocodingSingle(false);
    }
  };

  const handleFindMyLocation = async () => {
    try {
      const position = await GeocodingService.getCurrentPosition();
      const { latitude, longitude } = position.coords;
      
      const nearest = GeocodingService.findNearestBranch(latitude, longitude, branchesWithCoords);
      
      if (nearest) {
        setSelectedBranch(nearest.branch);
        onBranchSelect?.(nearest.branch);
        alert(`📍 Sucursal más cercana: "${nearest.branch.name}" (${nearest.distance.toFixed(1)} km)`);
      } else {
        alert('No se encontraron sucursales con ubicación cercanas');
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error obteniendo ubicación';
      alert(`❌ ${errorMessage}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-black bg-opacity-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-7xl max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Mapa de Sucursales</h2>
            <p className="text-sm text-gray-500 mt-1">
              {branchesWithCoords.length} de {branches.length} sucursales con ubicación
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Botón para geocodificar todas */}
            {branchesWithoutCoords.length > 0 && (
              <button
                onClick={handleGeocodeAll}
                disabled={isGeocodingAll}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
              >
                {isGeocodingAll ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Geocodificando...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Geocodificar Todas
                  </>
                )}
              </button>
            )}

            {/* Botón para encontrar mi ubicación */}
            <button
              onClick={handleFindMyLocation}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2 text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
              Mi Ubicación
            </button>

            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Progress Bar para geocodificación */}
        {isGeocodingAll && (
          <div className="px-6 py-3 bg-blue-50 border-b border-blue-200">
            <div className="flex items-center justify-between text-sm text-blue-700 mb-2">
              <span>Geocodificando: {geocodingProgress.name}</span>
              <span>{geocodingProgress.current} de {geocodingProgress.total}</span>
            </div>
            <div className="w-full bg-blue-200 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(geocodingProgress.current / geocodingProgress.total) * 100}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 flex min-h-0">
          {/* Mapa */}
          <div className="flex-1">
            <BranchesMap
              branches={branches}
              selectedBranchId={selectedBranch?.id}
              onBranchSelect={handleBranchSelect}
              height="100%"
              className="h-full"
            />
          </div>

          {/* Panel lateral */}
          <div className="w-80 border-l border-gray-200 flex flex-col">
            {/* Información de sucursal seleccionada */}
            {selectedBranch && (
              <div className="p-4 border-b border-gray-200">
                <h3 className="font-semibold text-lg mb-2 flex items-center gap-2">
                  {selectedBranch.name}
                  {selectedBranch.is_main && (
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                      Principal
                    </span>
                  )}
                </h3>
                
                {(selectedBranch.address || selectedBranch.city) && (
                  <div className="text-sm text-gray-600 mb-2 flex items-start gap-2">
                    <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span>
                      {[selectedBranch.address, selectedBranch.city, selectedBranch.state, selectedBranch.country]
                        .filter(Boolean).join(', ')}
                    </span>
                  </div>
                )}
                
                {selectedBranch.phone && (
                  <div className="text-sm text-gray-600 mb-2 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    {selectedBranch.phone}
                  </div>
                )}
                
                {selectedBranch.email && (
                  <div className="text-sm text-gray-600 mb-3 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    {selectedBranch.email}
                  </div>
                )}

                {/* Coordenadas */}
                {selectedBranch.latitude && selectedBranch.longitude ? (
                  <div className="text-xs text-gray-500 mb-3">
                    📍 {parseFloat(selectedBranch.latitude.toString()).toFixed(6)}, {parseFloat(selectedBranch.longitude.toString()).toFixed(6)}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 mb-3">
                    <div className="text-xs text-yellow-600 bg-yellow-50 px-2 py-1 rounded">
                      Sin coordenadas
                    </div>
                    {(selectedBranch.address || selectedBranch.city) && (
                      <button
                        onClick={() => handleGeocodeSingle(selectedBranch)}
                        disabled={isGeocodingSingle}
                        className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                      >
                        {isGeocodingSingle ? 'Geocodificando...' : 'Geocodificar'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Lista de sucursales */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-4">
                <h4 className="font-medium text-gray-900 mb-3">
                  Todas las Sucursales ({branches.length})
                </h4>
                
                <div className="space-y-2">
                  {branches.map((branch) => (
                    <div
                      key={branch.id}
                      onClick={() => handleBranchSelect(branch)}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedBranch?.id === branch.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-sm">{branch.name}</span>
                        <div className="flex items-center gap-1">
                          {branch.is_main && (
                            <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">
                              Principal
                            </span>
                          )}
                          <div className={`w-2 h-2 rounded-full ${
                            branch.latitude && branch.longitude 
                              ? 'bg-green-500' 
                              : 'bg-yellow-500'
                          }`}></div>
                        </div>
                      </div>
                      
                      {(branch.city || branch.address) && (
                        <div className="text-xs text-gray-600">
                          {[branch.city, branch.state].filter(Boolean).join(', ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Errores de geocodificación */}
            {geocodingErrors.length > 0 && (
              <div className="p-4 border-t border-gray-200 bg-red-50">
                <h4 className="font-medium text-red-800 mb-2 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Errores de Geocodificación
                </h4>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {geocodingErrors.map((error, index) => (
                    <div key={index} className="text-xs text-red-700">
                      <strong>{error.address}:</strong> {error.error}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BranchMapModal;
