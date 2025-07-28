'use client';

import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { LatLngExpression, Icon, DivIcon } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Branch } from '@/types/branch';

// Fix for default markers in react-leaflet
delete (Icon.Default.prototype as any)._getIconUrl;
Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface BranchWithCoords extends Branch {
  coordinates?: [number, number];
  isGeocoded?: boolean;
}

interface BranchesMapProps {
  branches: Branch[];
  selectedBranchId?: number | null;
  onBranchSelect?: (branch: Branch) => void;
  height?: string;
  className?: string;
}

// Componente interno para ajustar el mapa cuando se selecciona una sucursal
const MapController: React.FC<{ 
  selectedBranchId?: number | null;
  branches: BranchWithCoords[];
}> = ({ selectedBranchId, branches }) => {
  const map = useMap();

  useEffect(() => {
    if (selectedBranchId) {
      const selectedBranch = branches.find(b => b.id === selectedBranchId);
      if (selectedBranch?.coordinates) {
        map.flyTo(selectedBranch.coordinates, 15, {
          animate: true,
          duration: 1
        });
      }
    }
  }, [selectedBranchId, branches, map]);

  return null;
};

// Función para geocodificar direcciones usando Nominatim (OpenStreetMap)
const geocodeAddress = async (address: string, city?: string, state?: string, country?: string): Promise<[number, number] | null> => {
  const fullAddress = [address, city, state, country].filter(Boolean).join(', ');
  
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fullAddress)}&limit=1`
    );
    
    if (!response.ok) {
      throw new Error('Error en la geocodificación');
    }

    const data = await response.json();
    
    if (data && data.length > 0) {
      const lat = parseFloat(data[0].lat);
      const lon = parseFloat(data[0].lon);
      return [lat, lon];
    }
    
    return null;
  } catch (error) {
    console.warn('Error geocoding address:', fullAddress, error);
    return null;
  }
};

// Función para obtener coordenadas de una sucursal
const getBranchCoordinates = async (branch: Branch): Promise<[number, number] | null> => {
  // Si ya tiene coordenadas en la base de datos, usarlas
  if (branch.latitude && branch.longitude) {
    return [parseFloat(branch.latitude.toString()), parseFloat(branch.longitude.toString())];
  }

  // Si no tiene coordenadas pero tiene dirección, geocodificar
  if (branch.address || branch.city) {
    return await geocodeAddress(branch.address || '', branch.city, branch.state, branch.country);
  }

  return null;
};

// Crear icono personalizado para sucursales
const createBranchIcon = (isSelected: boolean, isMain: boolean) => {
  const color = isSelected ? '#ef4444' : isMain ? '#3b82f6' : '#10b981';
  const iconHtml = `
    <div style="
      background-color: ${color};
      width: 24px;
      height: 24px;
      border-radius: 50%;
      border: 3px solid white;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      justify-content: center;
    ">
      <div style="
        width: 8px;
        height: 8px;
        background-color: white;
        border-radius: 50%;
      "></div>
    </div>
  `;

  return new DivIcon({
    html: iconHtml,
    className: 'custom-branch-icon',
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });
};

const BranchesMap: React.FC<BranchesMapProps> = ({
  branches,
  selectedBranchId,
  onBranchSelect,
  height = '400px',
  className = ''
}) => {
  const [branchesWithCoords, setBranchesWithCoords] = useState<BranchWithCoords[]>([]);
  const [loading, setLoading] = useState(true);
  const [geocodingProgress, setGeocodingProgress] = useState(0);

  // Centro predeterminado (Colombia - Bogotá)
  const defaultCenter: LatLngExpression = [4.7110, -74.0721];
  const defaultZoom = 6;

  useEffect(() => {
    const loadBranchCoordinates = async () => {
      setLoading(true);
      setGeocodingProgress(0);
      
      const branchesWithCoordinates: BranchWithCoords[] = [];
      
      for (let i = 0; i < branches.length; i++) {
        const branch = branches[i];
        const coordinates = await getBranchCoordinates(branch);
        
        branchesWithCoordinates.push({
          ...branch,
          coordinates: coordinates || undefined,
          isGeocoded: coordinates !== null
        });

        setGeocodingProgress(((i + 1) / branches.length) * 100);
        
        // Pequeña pausa para evitar rate limiting
        if (i < branches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
      
      setBranchesWithCoords(branchesWithCoordinates);
      setLoading(false);
    };

    if (branches.length > 0) {
      loadBranchCoordinates();
    } else {
      setBranchesWithCoords([]);
      setLoading(false);
    }
  }, [branches]);

  // Calcular el centro del mapa basado en las sucursales
  const getMapCenter = (): LatLngExpression => {
    const validCoords = branchesWithCoords.filter(b => b.coordinates);
    
    if (validCoords.length === 0) {
      return defaultCenter;
    }

    if (validCoords.length === 1) {
      return validCoords[0].coordinates!;
    }

    const avgLat = validCoords.reduce((sum, b) => sum + b.coordinates![0], 0) / validCoords.length;
    const avgLng = validCoords.reduce((sum, b) => sum + b.coordinates![1], 0) / validCoords.length;
    
    return [avgLat, avgLng];
  };

  const mapCenter = getMapCenter();
  const hasValidCoordinates = branchesWithCoords.some(b => b.coordinates);

  if (loading) {
    return (
      <div className={`${className} flex flex-col items-center justify-center bg-gray-50 border border-gray-200 rounded-lg`} style={{ height }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-sm text-gray-600 mb-2">Geocodificando direcciones...</p>
          <div className="w-48 bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${geocodingProgress}%` }}
            ></div>
          </div>
          <p className="text-xs text-gray-500 mt-1">{Math.round(geocodingProgress)}%</p>
        </div>
      </div>
    );
  }

  if (branches.length === 0) {
    return (
      <div className={`${className} flex items-center justify-center bg-gray-50 border border-gray-200 rounded-lg`} style={{ height }}>
        <div className="text-center text-gray-500">
          <svg className="w-12 h-12 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p className="text-sm">No hay sucursales para mostrar</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`${className} relative border border-gray-200 rounded-lg overflow-hidden`} style={{ height }}>
      <MapContainer
        center={mapCenter}
        zoom={hasValidCoordinates ? (branchesWithCoords.filter(b => b.coordinates).length === 1 ? 15 : defaultZoom) : defaultZoom}
        style={{ height: '100%', width: '100%' }}
        className="z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        <MapController selectedBranchId={selectedBranchId} branches={branchesWithCoords} />
        
        {branchesWithCoords.map((branch) => {
          if (!branch.coordinates) return null;
          
          const isSelected = selectedBranchId === branch.id;
          
          return (
            <Marker
              key={branch.id}
              position={branch.coordinates}
              icon={createBranchIcon(isSelected, branch.is_main || false)}
              eventHandlers={{
                click: () => {
                  if (onBranchSelect) {
                    onBranchSelect(branch);
                  }
                }
              }}
            >
              <Popup>
                <div className="p-2 min-w-[200px]">
                  <h3 className="font-semibold text-lg mb-2 text-gray-800">
                    {branch.name}
                    {branch.is_main && (
                      <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                        Principal
                      </span>
                    )}
                  </h3>
                  
                  {(branch.address || branch.city) && (
                    <div className="text-sm text-gray-600 mb-2">
                      <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      {[branch.address, branch.city, branch.state, branch.country].filter(Boolean).join(', ')}
                    </div>
                  )}
                  
                  {branch.phone && (
                    <div className="text-sm text-gray-600 mb-2">
                      <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      {branch.phone}
                    </div>
                  )}
                  
                  {branch.email && (
                    <div className="text-sm text-gray-600">
                      <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      {branch.email}
                    </div>
                  )}
                  
                  {!branch.isGeocoded && (
                    <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-700">
                      <svg className="w-3 h-3 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Ubicación aproximada
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
      
      {/* Indicadores de estado */}
      <div className="absolute top-2 right-2 z-[1001] bg-white rounded-lg shadow-lg p-2">
        <div className="flex flex-col gap-1 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-blue-500 rounded-full border border-white shadow"></div>
            <span>Principal</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500 rounded-full border border-white shadow"></div>
            <span>Sucursal</span>
          </div>
          {selectedBranchId && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded-full border border-white shadow"></div>
              <span>Seleccionada</span>
            </div>
          )}
        </div>
      </div>

      {/* Contador de sucursales sin ubicación */}
      {branchesWithCoords.some(b => !b.coordinates) && (
        <div className="absolute bottom-2 left-2 z-[1001] bg-yellow-50 border border-yellow-200 rounded-lg shadow-lg p-2">
          <div className="flex items-center gap-2 text-xs text-yellow-700">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>
              {branchesWithCoords.filter(b => !b.coordinates).length} sucursal(es) sin ubicación
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default BranchesMap;
