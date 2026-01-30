'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Loader2, MapPin, Navigation, Search as SearchIcon, User, Mail, Phone, X } from 'lucide-react';
import { CustomerAddress, CustomerAddressInput, customerAddressesService } from '@/lib/services/customerAddressesService';
import { googleMapsService } from '@/lib/services/googleMapsService';

interface Customer {
  id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
}

interface AddressDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  address?: CustomerAddress | null;
  organizationId: number;
  onSave: (data: CustomerAddressInput) => Promise<void>;
}

export function AddressDialog({
  open,
  onOpenChange,
  address,
  organizationId,
  onSave,
}: AddressDialogProps) {
  const isEditing = !!address;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerPopoverOpen, setCustomerPopoverOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  
  // Google Places states
  const [placeSearch, setPlaceSearch] = useState('');
  const [placeSuggestions, setPlaceSuggestions] = useState<Array<{ place_id: string; description: string }>>([]);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);
  const [isGeocodifying, setIsGeocodifying] = useState(false);

  const [formData, setFormData] = useState<CustomerAddressInput>({
    customer_id: '',
    label: 'Principal',
    recipient_name: '',
    recipient_phone: '',
    address_line1: '',
    address_line2: '',
    city: '',
    department: '',
    country_code: 'CO',
    postal_code: '',
    latitude: undefined,
    longitude: undefined,
    google_place_id: '',
    delivery_instructions: '',
    is_default: false,
  });

  useEffect(() => {
    if (address) {
      setFormData({
        customer_id: address.customer_id,
        label: address.label,
        recipient_name: address.recipient_name || '',
        recipient_phone: address.recipient_phone || '',
        address_line1: address.address_line1,
        address_line2: address.address_line2 || '',
        city: address.city,
        department: address.department || '',
        country_code: address.country_code || 'CO',
        postal_code: address.postal_code || '',
        latitude: address.latitude,
        longitude: address.longitude,
        google_place_id: address.google_place_id || '',
        delivery_instructions: address.delivery_instructions || '',
        is_default: address.is_default,
      });
      if (address.customers) {
        setSelectedCustomer(address.customers);
      }
    } else {
      setFormData({
        customer_id: '',
        label: 'Principal',
        recipient_name: '',
        recipient_phone: '',
        address_line1: '',
        address_line2: '',
        city: '',
        department: '',
        country_code: 'CO',
        postal_code: '',
        latitude: undefined,
        longitude: undefined,
        google_place_id: '',
        delivery_instructions: '',
        is_default: false,
      });
      setSelectedCustomer(null);
    }
  }, [address, open]);

  useEffect(() => {
    const searchCustomers = async () => {
      if (customerSearch.length < 2) {
        setCustomers([]);
        return;
      }
      setIsSearching(true);
      try {
        const results = await customerAddressesService.searchCustomers(organizationId, customerSearch);
        setCustomers(results);
      } catch (error) {
        console.error('Error searching customers:', error);
      } finally {
        setIsSearching(false);
      }
    };

    const debounce = setTimeout(searchCustomers, 300);
    return () => clearTimeout(debounce);
  }, [customerSearch, organizationId]);

  // Buscar lugares con Google Places
  const searchPlaces = useCallback(async (query: string) => {
    if (query.length < 3) {
      setPlaceSuggestions([]);
      return;
    }
    setIsSearchingPlaces(true);
    try {
      const results = await googleMapsService.placesAutocomplete(query, { 
        componentRestrictions: { country: 'co' } 
      });
      setPlaceSuggestions(results.map(r => ({ 
        place_id: r.placeId, 
        description: r.description 
      })));
    } catch (error) {
      console.error('Error searching places:', error);
      setPlaceSuggestions([]);
    } finally {
      setIsSearchingPlaces(false);
    }
  }, []);

  useEffect(() => {
    const debounce = setTimeout(() => searchPlaces(placeSearch), 300);
    return () => clearTimeout(debounce);
  }, [placeSearch, searchPlaces]);

  // Extraer componentes de dirección
  const extractAddressComponent = (components: { longName: string; shortName: string; types: string[] }[], type: string) => {
    const component = components.find(c => c.types.includes(type));
    return component?.longName || '';
  };

  // Seleccionar un lugar de Google Places
  const handleSelectPlace = async (placeId: string, description: string) => {
    setIsGeocodifying(true);
    try {
      const details = await googleMapsService.getPlaceDetails(placeId);
      if (details) {
        const city = extractAddressComponent(details.addressComponents, 'locality') || 
                     extractAddressComponent(details.addressComponents, 'administrative_area_level_2');
        const department = extractAddressComponent(details.addressComponents, 'administrative_area_level_1');
        const postalCode = extractAddressComponent(details.addressComponents, 'postal_code');
        const countryCode = extractAddressComponent(details.addressComponents, 'country');
        
        setFormData(prev => ({
          ...prev,
          address_line1: details.formattedAddress || description,
          city: city || prev.city,
          department: department || prev.department,
          postal_code: postalCode || prev.postal_code,
          country_code: countryCode === 'Colombia' ? 'CO' : (countryCode || 'CO'),
          latitude: details.location?.lat,
          longitude: details.location?.lng,
          google_place_id: placeId,
        }));
      }
      setPlaceSearch('');
      setPlaceSuggestions([]);
    } catch (error) {
      console.error('Error getting place details:', error);
    } finally {
      setIsGeocodifying(false);
    }
  };

  // Geocodificar dirección manual
  const handleGeocode = async () => {
    if (!formData.address_line1 || !formData.city) return;
    
    setIsGeocodifying(true);
    try {
      const fullAddress = `${formData.address_line1}, ${formData.city}, ${formData.department || ''}, Colombia`;
      const result = await googleMapsService.geocode(fullAddress);
      if (result) {
        setFormData(prev => ({
          ...prev,
          latitude: result.location.lat,
          longitude: result.location.lng,
          google_place_id: result.placeId || prev.google_place_id,
        }));
      }
    } catch (error) {
      console.error('Error geocoding address:', error);
    } finally {
      setIsGeocodifying(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.customer_id || !formData.address_line1 || !formData.city) return;

    setIsSubmitting(true);
    try {
      await onSave(formData);
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving address:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setFormData({ ...formData, customer_id: customer.id });
    setCustomerPopoverOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-blue-600" />
            {isEditing ? 'Editar Dirección' : 'Nueva Dirección'}
          </DialogTitle>
          <DialogDescription>
            {isEditing ? 'Modifica los datos de la dirección' : 'Agrega una nueva dirección de cliente para envíos'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Cliente - Selector estilo POS */}
          <div className="space-y-2">
            <Label>Cliente *</Label>
            {selectedCustomer && !isEditing ? (
              <div className="p-3 rounded-lg border dark:bg-blue-900/20 dark:border-blue-500/30 light:bg-blue-50 light:border-blue-200">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="p-2 rounded-full dark:bg-blue-500/20 light:bg-blue-100 shrink-0">
                      <User className="h-5 w-5 dark:text-blue-400 light:text-blue-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold dark:text-white light:text-gray-900">
                        {selectedCustomer.first_name} {selectedCustomer.last_name}
                      </p>
                      <div className="mt-1 space-y-0.5">
                        {selectedCustomer.email && (
                          <div className="flex items-center gap-1.5 text-xs dark:text-gray-300 light:text-gray-600">
                            <Mail className="h-3 w-3" />
                            <span className="truncate">{selectedCustomer.email}</span>
                          </div>
                        )}
                        {selectedCustomer.phone && (
                          <div className="flex items-center gap-1.5 text-xs dark:text-gray-300 light:text-gray-600">
                            <Phone className="h-3 w-3" />
                            <span>{selectedCustomer.phone}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedCustomer(null);
                      setFormData({ ...formData, customer_id: '' });
                    }}
                    className="h-8 w-8 p-0 dark:hover:bg-red-500/20 dark:hover:text-red-400 light:hover:bg-red-50 light:hover:text-red-600"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : isEditing && selectedCustomer ? (
              <div className="p-3 rounded-lg border bg-gray-50 dark:bg-gray-800 dark:border-gray-700">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full dark:bg-gray-700 light:bg-gray-200">
                    <User className="h-5 w-5 text-gray-500" />
                  </div>
                  <div>
                    <p className="font-medium dark:text-white light:text-gray-900">
                      {selectedCustomer.first_name} {selectedCustomer.last_name}
                    </p>
                    <p className="text-xs text-gray-500">Cliente no editable</p>
                  </div>
                </div>
              </div>
            ) : (
              <Popover open={customerPopoverOpen} onOpenChange={setCustomerPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start text-left h-auto p-3 dark:border-gray-700 dark:hover:bg-gray-800/50 dark:hover:border-blue-500/50 light:border-gray-300 light:hover:bg-blue-50 light:hover:border-blue-300 transition-all"
                  >
                    <div className="flex items-center gap-3 min-w-0 w-full">
                      <div className="p-2 rounded-full dark:bg-blue-500/20 light:bg-blue-100 shrink-0">
                        <User className="h-5 w-5 dark:text-blue-400 light:text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium dark:text-white light:text-gray-900">
                          Seleccionar cliente
                        </p>
                        <p className="text-xs dark:text-gray-400 light:text-gray-600">
                          Buscar por nombre, email o teléfono
                        </p>
                      </div>
                      <SearchIcon className="h-4 w-4 dark:text-gray-400 light:text-gray-500 shrink-0" />
                    </div>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-96 p-0 dark:bg-gray-900 dark:border-gray-800" align="start">
                  <div className="p-4 space-y-4">
                    <div className="space-y-2">
                      <h4 className="font-semibold dark:text-white light:text-gray-900">Buscar Cliente</h4>
                      <div className="relative">
                        <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 dark:text-gray-400 light:text-gray-500" />
                        <Input
                          placeholder="Nombre, email o teléfono..."
                          value={customerSearch}
                          onChange={(e) => setCustomerSearch(e.target.value)}
                          className="pl-10 dark:bg-gray-800 dark:border-gray-700"
                          autoFocus
                        />
                      </div>
                    </div>

                    <Separator className="dark:bg-gray-800" />

                    <ScrollArea className="h-48">
                      <div className="space-y-2 pr-4">
                        {isSearching ? (
                          <div className="flex items-center justify-center py-6">
                            <Loader2 className="h-5 w-5 animate-spin text-blue-500 mr-2" />
                            <span className="text-sm dark:text-gray-400">Buscando...</span>
                          </div>
                        ) : customers.length === 0 && customerSearch.length >= 2 ? (
                          <div className="flex flex-col items-center justify-center py-6 text-center">
                            <User className="h-10 w-10 dark:text-gray-600 light:text-gray-400 mb-2" />
                            <p className="text-sm dark:text-gray-400">No se encontraron clientes</p>
                          </div>
                        ) : customers.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-6 text-center">
                            <SearchIcon className="h-10 w-10 dark:text-gray-600 light:text-gray-400 mb-2" />
                            <p className="text-sm dark:text-gray-400">Escribe para buscar clientes</p>
                          </div>
                        ) : (
                          customers.map((customer) => (
                            <div
                              key={customer.id}
                              className="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all dark:hover:bg-gray-800 light:hover:bg-gray-50 border border-transparent dark:hover:border-blue-500/30 light:hover:border-blue-200"
                              onClick={() => handleSelectCustomer(customer)}
                            >
                              <div className="p-1.5 rounded-full dark:bg-blue-500/20 light:bg-blue-100">
                                <User className="h-4 w-4 dark:text-blue-400 light:text-blue-600" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm dark:text-white light:text-gray-900 truncate">
                                  {customer.first_name} {customer.last_name}
                                </p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  {customer.email && (
                                    <span className="text-xs dark:text-gray-400 light:text-gray-600 truncate max-w-[150px]">
                                      {customer.email}
                                    </span>
                                  )}
                                  {customer.phone && (
                                    <span className="text-xs dark:text-gray-400 light:text-gray-600">
                                      {customer.phone}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>

          {/* Etiqueta y Default */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="label">Etiqueta *</Label>
              <Input
                id="label"
                value={formData.label}
                onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                placeholder="Casa, Oficina, Bodega..."
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Dirección por defecto</Label>
              <div className="flex items-center gap-2 h-10">
                <Switch
                  checked={formData.is_default}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_default: checked })}
                />
                <span className="text-sm text-gray-500">
                  {formData.is_default ? 'Sí' : 'No'}
                </span>
              </div>
            </div>
          </div>

          {/* Destinatario */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="recipient_name">Nombre del destinatario</Label>
              <Input
                id="recipient_name"
                value={formData.recipient_name}
                onChange={(e) => setFormData({ ...formData, recipient_name: e.target.value })}
                placeholder="Nombre de quien recibe"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recipient_phone">Teléfono del destinatario</Label>
              <Input
                id="recipient_phone"
                value={formData.recipient_phone}
                onChange={(e) => setFormData({ ...formData, recipient_phone: e.target.value })}
                placeholder="+57 300 1234567"
              />
            </div>
          </div>

          {/* Búsqueda con Google Places */}
          <div className="space-y-2">
            <Label>Buscar dirección con Google</Label>
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                value={placeSearch}
                onChange={(e) => setPlaceSearch(e.target.value)}
                placeholder="Buscar dirección en Google Maps..."
                className="pl-10"
              />
              {isSearchingPlaces && (
                <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
              )}
            </div>
            {placeSuggestions.length > 0 && (
              <div className="border rounded-md bg-white dark:bg-gray-800 shadow-lg max-h-48 overflow-y-auto">
                {placeSuggestions.map((place) => (
                  <button
                    key={place.place_id}
                    type="button"
                    onClick={() => handleSelectPlace(place.place_id, place.description)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                  >
                    <MapPin className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    <span className="truncate">{place.description}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Dirección */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="address_line1">Dirección línea 1 *</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleGeocode}
                disabled={isGeocodifying || !formData.address_line1 || !formData.city}
                className="h-6 text-xs"
              >
                {isGeocodifying ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <Navigation className="h-3 w-3 mr-1" />
                )}
                Geocodificar
              </Button>
            </div>
            <Input
              id="address_line1"
              value={formData.address_line1}
              onChange={(e) => setFormData({ ...formData, address_line1: e.target.value })}
              placeholder="Calle 123 # 45-67"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="address_line2">Dirección línea 2</Label>
            <Input
              id="address_line2"
              value={formData.address_line2}
              onChange={(e) => setFormData({ ...formData, address_line2: e.target.value })}
              placeholder="Apartamento, edificio, etc."
            />
          </div>

          {/* Ciudad y Departamento */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">Ciudad *</Label>
              <Input
                id="city"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                placeholder="Bogotá"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="department">Departamento</Label>
              <Input
                id="department"
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                placeholder="Cundinamarca"
              />
            </div>
          </div>

          {/* Código postal y País */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="postal_code">Código postal</Label>
              <Input
                id="postal_code"
                value={formData.postal_code}
                onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                placeholder="110111"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="country_code">País</Label>
              <Input
                id="country_code"
                value={formData.country_code}
                onChange={(e) => setFormData({ ...formData, country_code: e.target.value })}
                placeholder="CO"
              />
            </div>
          </div>

          {/* Geolocalización */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="latitude">Latitud</Label>
              <Input
                id="latitude"
                type="number"
                step="any"
                value={formData.latitude || ''}
                onChange={(e) => setFormData({ ...formData, latitude: e.target.value ? parseFloat(e.target.value) : undefined })}
                placeholder="4.7110"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="longitude">Longitud</Label>
              <Input
                id="longitude"
                type="number"
                step="any"
                value={formData.longitude || ''}
                onChange={(e) => setFormData({ ...formData, longitude: e.target.value ? parseFloat(e.target.value) : undefined })}
                placeholder="-74.0721"
              />
            </div>
          </div>

          {/* Google Place ID */}
          <div className="space-y-2">
            <Label htmlFor="google_place_id">Google Place ID</Label>
            <Input
              id="google_place_id"
              value={formData.google_place_id}
              onChange={(e) => setFormData({ ...formData, google_place_id: e.target.value })}
              placeholder="ChIJgUbEo..."
            />
          </div>

          {/* Instrucciones */}
          <div className="space-y-2">
            <Label htmlFor="delivery_instructions">Instrucciones de entrega</Label>
            <Textarea
              id="delivery_instructions"
              value={formData.delivery_instructions}
              onChange={(e) => setFormData({ ...formData, delivery_instructions: e.target.value })}
              placeholder="Notas especiales para la entrega..."
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !formData.customer_id || !formData.address_line1 || !formData.city}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEditing ? 'Guardar Cambios' : 'Crear Dirección'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
