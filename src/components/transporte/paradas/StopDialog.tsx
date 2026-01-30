'use client';

import { useEffect, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Loader2, Search, MapPin } from 'lucide-react';
import { TransportStop } from '@/lib/services/transportService';
import { googleMapsService, PlaceAutocompleteResult } from '@/lib/services/googleMapsService';

const stopSchema = z.object({
  code: z.string().min(1, 'El código es requerido'),
  name: z.string().min(1, 'El nombre es requerido'),
  stop_type: z.enum(['terminal', 'station', 'warehouse', 'stop', 'branch', 'customer']),
  address: z.string().optional(),
  city: z.string().optional(),
  department: z.string().optional(),
  country: z.string().optional(),
  postal_code: z.string().optional(),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  contact_name: z.string().optional(),
  contact_phone: z.string().optional(),
  branch_id: z.coerce.number().optional(),
  is_active: z.boolean(),
});

type StopFormData = z.infer<typeof stopSchema>;

interface StopDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stop?: TransportStop | null;
  branches: { id: number; name: string }[];
  onSave: (data: Partial<TransportStop>) => Promise<void>;
  isSaving?: boolean;
}

export function StopDialog({
  open,
  onOpenChange,
  stop,
  branches,
  onSave,
  isSaving,
}: StopDialogProps) {
  const isEditing = !!stop;
  
  // Estados para autocompletado de Google Places
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceAutocompleteResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [googlePlaceId, setGooglePlaceId] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<StopFormData>({
    resolver: zodResolver(stopSchema),
    defaultValues: {
      code: '',
      name: '',
      stop_type: 'stop',
      address: '',
      city: '',
      department: '',
      country: 'Colombia',
      postal_code: '',
      latitude: undefined,
      longitude: undefined,
      contact_name: '',
      contact_phone: '',
      branch_id: undefined,
      is_active: true,
    },
  });

  useEffect(() => {
    if (stop) {
      reset({
        code: stop.code,
        name: stop.name,
        stop_type: stop.stop_type,
        address: stop.address || '',
        city: stop.city || '',
        department: stop.department || '',
        country: stop.country || 'Colombia',
        postal_code: stop.postal_code || '',
        latitude: stop.latitude,
        longitude: stop.longitude,
        contact_name: stop.contact_name || '',
        contact_phone: stop.contact_phone || '',
        branch_id: stop.branch_id,
        is_active: stop.is_active,
      });
    } else {
      reset({
        code: '',
        name: '',
        stop_type: 'stop',
        address: '',
        city: '',
        department: '',
        country: 'Colombia',
        postal_code: '',
        latitude: undefined,
        longitude: undefined,
        contact_name: '',
        contact_phone: '',
        branch_id: undefined,
        is_active: true,
      });
    }
  }, [stop, reset]);

  // Buscar sugerencias de lugares
  const searchPlaces = useCallback(async (query: string) => {
    if (query.length < 3) {
      setSuggestions([]);
      return;
    }

    setIsSearching(true);
    try {
      const results = await googleMapsService.placesAutocomplete(query);
      setSuggestions(results);
      setShowSuggestions(true);
    } catch (error) {
      console.error('Error buscando lugares:', error);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Debounce para la búsqueda
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery) {
        searchPlaces(searchQuery);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, searchPlaces]);

  // Seleccionar un lugar de las sugerencias
  const handleSelectPlace = async (place: PlaceAutocompleteResult) => {
    setShowSuggestions(false);
    setSearchQuery('');
    
    const details = await googleMapsService.getPlaceDetails(place.placeId);
    if (details) {
      setValue('address', details.formattedAddress);
      setValue('latitude', details.location.lat);
      setValue('longitude', details.location.lng);
      setGooglePlaceId(place.placeId);

      // Extraer ciudad y departamento de address_components
      const cityComponent = details.addressComponents.find(c => 
        c.types.includes('locality') || c.types.includes('administrative_area_level_2')
      );
      const deptComponent = details.addressComponents.find(c => 
        c.types.includes('administrative_area_level_1')
      );
      const postalComponent = details.addressComponents.find(c => 
        c.types.includes('postal_code')
      );

      if (cityComponent) setValue('city', cityComponent.longName);
      if (deptComponent) setValue('department', deptComponent.longName);
      if (postalComponent) setValue('postal_code', postalComponent.longName);
    }
  };

  // Geocodificar dirección manual
  const handleGeocodeAddress = async () => {
    const address = watch('address');
    const city = watch('city');
    const fullAddress = [address, city, 'Colombia'].filter(Boolean).join(', ');
    
    if (!fullAddress) return;

    const result = await googleMapsService.geocode(fullAddress);
    if (result) {
      setValue('latitude', result.location.lat);
      setValue('longitude', result.location.lng);
      setGooglePlaceId(result.placeId);
    }
  };

  const onSubmit = async (data: StopFormData) => {
    const cleanData = {
      ...data,
      branch_id: data.branch_id || undefined,
      latitude: data.latitude || undefined,
      longitude: data.longitude || undefined,
    };
    await onSave(cleanData);
  };

  const stopType = watch('stop_type');
  const branchId = watch('branch_id');
  const isActive = watch('is_active');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Editar Parada' : 'Nueva Parada'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="code">Código *</Label>
              <Input
                id="code"
                {...register('code')}
                placeholder="TER-001"
              />
              {errors.code && (
                <p className="text-sm text-red-500">{errors.code.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Nombre *</Label>
              <Input
                id="name"
                {...register('name')}
                placeholder="Terminal Norte"
              />
              {errors.name && (
                <p className="text-sm text-red-500">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="stop_type">Tipo de Parada</Label>
              <Select
                value={stopType}
                onValueChange={(v) => setValue('stop_type', v as 'terminal' | 'station' | 'warehouse' | 'stop' | 'branch' | 'customer')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="terminal">Terminal</SelectItem>
                  <SelectItem value="station">Estación</SelectItem>
                  <SelectItem value="warehouse">Bodega</SelectItem>
                  <SelectItem value="stop">Parada</SelectItem>
                  <SelectItem value="branch">Sucursal</SelectItem>
                  <SelectItem value="customer">Cliente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="branch_id">Sucursal Asociada</Label>
              <Select
                value={branchId?.toString() || 'none'}
                onValueChange={(v) => setValue('branch_id', v === 'none' ? undefined : Number(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sin asociar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin asociar</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id.toString()}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Búsqueda de Google Places */}
          {googleMapsService.isConfigured() && (
            <div className="space-y-2 relative">
              <Label>Buscar Ubicación (Google Maps)</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Buscar dirección, lugar o establecimiento..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                  className="pl-10"
                />
                {isSearching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
                )}
              </div>
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-50 w-full bg-white dark:bg-gray-800 border rounded-md shadow-lg max-h-48 overflow-auto">
                  {suggestions.map((place) => (
                    <button
                      key={place.placeId}
                      type="button"
                      className="w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-start gap-2"
                      onClick={() => handleSelectPlace(place)}
                    >
                      <MapPin className="h-4 w-4 mt-0.5 text-gray-400 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium">{place.mainText}</p>
                        <p className="text-xs text-gray-500">{place.secondaryText}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {googlePlaceId && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  Ubicación vinculada a Google Maps
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="address">Dirección</Label>
            <div className="flex gap-2">
              <Textarea
                id="address"
                {...register('address')}
                placeholder="Calle 100 #15-20"
                rows={2}
                className="flex-1"
              />
              {googleMapsService.isConfigured() && (
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm"
                  onClick={handleGeocodeAddress}
                  title="Obtener coordenadas de esta dirección"
                >
                  <MapPin className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">Ciudad</Label>
              <Input id="city" {...register('city')} placeholder="Bogotá" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="department">Departamento</Label>
              <Input id="department" {...register('department')} placeholder="Cundinamarca" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="postal_code">Código Postal</Label>
              <Input id="postal_code" {...register('postal_code')} placeholder="110111" />
            </div>
          </div>

          <div className="border-t pt-4">
            <h4 className="font-medium mb-3">Coordenadas (opcional)</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="latitude">Latitud</Label>
                <Input
                  id="latitude"
                  type="number"
                  step="0.000001"
                  {...register('latitude')}
                  placeholder="4.710989"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="longitude">Longitud</Label>
                <Input
                  id="longitude"
                  type="number"
                  step="0.000001"
                  {...register('longitude')}
                  placeholder="-74.072090"
                />
              </div>
            </div>
          </div>

          <div className="border-t pt-4">
            <h4 className="font-medium mb-3">Contacto</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="contact_name">Nombre de Contacto</Label>
                <Input id="contact_name" {...register('contact_name')} placeholder="Juan Pérez" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact_phone">Teléfono</Label>
                <Input id="contact_phone" {...register('contact_phone')} placeholder="+57 300 123 4567" />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between border-t pt-4">
            <div className="flex items-center gap-2">
              <Switch
                id="is_active"
                checked={isActive}
                onCheckedChange={(v) => setValue('is_active', v)}
              />
              <Label htmlFor="is_active">Parada activa</Label>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSaving}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEditing ? 'Guardar Cambios' : 'Crear Parada'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
