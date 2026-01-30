'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2,
  Cpu,
  MapPin,
  QrCode,
  Fingerprint,
  CreditCard,
  Smartphone,
  AlertCircle,
  Save,
  Building2,
} from 'lucide-react';
import type { TimeClock, CreateTimeClockDTO, GeoFence } from '@/lib/services/timeClocksService';

interface BranchOption {
  id: number;
  name: string;
}

interface DeviceFormProps {
  device?: TimeClock | null;
  branches: BranchOption[];
  onSubmit: (data: CreateTimeClockDTO) => Promise<void>;
  onCancel: () => void;
  validateCode?: (code: string, excludeId?: string) => Promise<boolean>;
  isLoading?: boolean;
}

const DEVICE_TYPES = [
  { value: 'qr_dynamic', label: 'Código QR', icon: QrCode, description: 'Marcación por escaneo de QR dinámico' },
  { value: 'qr_static', label: 'QR Estático', icon: QrCode, description: 'Código QR fijo impreso' },
  { value: 'app', label: 'App Móvil', icon: Smartphone, description: 'Marcación desde aplicación móvil' },
  { value: 'biometric', label: 'Biométrico', icon: Fingerprint, description: 'Huella dactilar o reconocimiento facial' },
  { value: 'nfc', label: 'NFC', icon: CreditCard, description: 'Tarjeta de proximidad' },
  { value: 'rfid', label: 'RFID', icon: CreditCard, description: 'Tarjeta RFID' },
  { value: 'manual', label: 'Manual', icon: Smartphone, description: 'Entrada manual desde el sistema' },
];

export function DeviceForm({
  device,
  branches,
  onSubmit,
  onCancel,
  validateCode,
  isLoading,
}: DeviceFormProps) {
  const isEdit = !!device;

  const [formData, setFormData] = useState<CreateTimeClockDTO>({
    code: '',
    name: '',
    type: 'qr_dynamic',
    branch_id: undefined,
    location_description: '',
    geo_fence: undefined,
    require_geo_validation: false,
    is_active: true,
  });

  const [geoFence, setGeoFence] = useState<GeoFence>({
    lat: 0,
    lng: 0,
    radius: 100,
  });
  const [useGeoFence, setUseGeoFence] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codeValid, setCodeValid] = useState(true);

  // Initialize form
  useEffect(() => {
    if (device) {
      setFormData({
        code: device.code || '',
        name: device.name,
        type: device.type,
        branch_id: device.branch_id || undefined,
        location_description: device.location_description || '',
        require_geo_validation: device.require_geo_validation,
        is_active: device.is_active,
      });
      if (device.geo_fence) {
        setGeoFence(device.geo_fence);
        setUseGeoFence(true);
      }
    }
  }, [device]);

  // Validate code
  useEffect(() => {
    if (!formData.code || !validateCode) {
      setCodeValid(true);
      return;
    }

    const timer = setTimeout(async () => {
      const isValid = await validateCode(formData.code!, device?.id);
      setCodeValid(isValid);
    }, 300);

    return () => clearTimeout(timer);
  }, [formData.code, device?.id, validateCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.name.trim()) {
      setError('El nombre es requerido');
      return;
    }

    if (!codeValid) {
      setError('El código ya está en uso');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        ...formData,
        geo_fence: useGeoFence ? geoFence : undefined,
      });
    } catch (err: any) {
      setError(err.message || 'Error al guardar');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedType = DEVICE_TYPES.find((t) => t.value === formData.type);
  const TypeIcon = selectedType?.icon || Cpu;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Info Básica */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2 text-gray-900 dark:text-white">
            <Cpu className="h-5 w-5 text-blue-600" />
            Información del Dispositivo
          </CardTitle>
          <CardDescription className="text-gray-500 dark:text-gray-400">
            Datos básicos del punto de marcación
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">
                Nombre <span className="text-red-500">*</span>
              </Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Entrada Principal"
                className="bg-white dark:bg-gray-900"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">Código</Label>
              <Input
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                placeholder="ENT-001"
                className={`bg-white dark:bg-gray-900 ${!codeValid ? 'border-red-500' : ''}`}
              />
              {!codeValid && <p className="text-xs text-red-500">Código ya en uso</p>}
            </div>
          </div>

          {/* Tipo */}
          <div className="space-y-2">
            <Label className="text-gray-700 dark:text-gray-300">Tipo de Dispositivo</Label>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {DEVICE_TYPES.map((type) => {
                const Icon = type.icon;
                return (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, type: type.value })}
                    className={`p-3 rounded-lg border-2 transition-all text-center ${
                      formData.type === type.value
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <Icon
                      className={`h-6 w-6 mx-auto mb-1 ${
                        formData.type === type.value
                          ? 'text-blue-600'
                          : 'text-gray-400'
                      }`}
                    />
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      {type.label}
                    </p>
                  </button>
                );
              })}
            </div>
            {selectedType && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {selectedType.description}
              </p>
            )}
          </div>

          {/* Sede */}
          <div className="space-y-2">
            <Label className="text-gray-700 dark:text-gray-300">Sede</Label>
            <Select
              value={formData.branch_id?.toString() || 'none'}
              onValueChange={(value) =>
                setFormData({
                  ...formData,
                  branch_id: value === 'none' ? undefined : parseInt(value),
                })
              }
            >
              <SelectTrigger className="bg-white dark:bg-gray-900">
                <SelectValue placeholder="Seleccionar sede..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin asignar</SelectItem>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id.toString()}>
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-gray-400" />
                      {branch.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Ubicación */}
          <div className="space-y-2">
            <Label className="text-gray-700 dark:text-gray-300">Descripción de Ubicación</Label>
            <Textarea
              value={formData.location_description}
              onChange={(e) => setFormData({ ...formData, location_description: e.target.value })}
              placeholder="Ej: Puerta principal, junto a recepción"
              rows={2}
              className="bg-white dark:bg-gray-900"
            />
          </div>
        </CardContent>
      </Card>

      {/* Geofence */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2 text-gray-900 dark:text-white">
                <MapPin className="h-5 w-5 text-green-600" />
                Geofence
              </CardTitle>
              <CardDescription className="text-gray-500 dark:text-gray-400">
                Zona geográfica permitida para marcación
              </CardDescription>
            </div>
            <Switch checked={useGeoFence} onCheckedChange={setUseGeoFence} />
          </div>
        </CardHeader>
        {useGeoFence && (
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-gray-700 dark:text-gray-300">Latitud</Label>
                <Input
                  type="number"
                  step="0.000001"
                  value={geoFence.lat}
                  onChange={(e) =>
                    setGeoFence({ ...geoFence, lat: parseFloat(e.target.value) || 0 })
                  }
                  className="bg-white dark:bg-gray-900"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-700 dark:text-gray-300">Longitud</Label>
                <Input
                  type="number"
                  step="0.000001"
                  value={geoFence.lng}
                  onChange={(e) =>
                    setGeoFence({ ...geoFence, lng: parseFloat(e.target.value) || 0 })
                  }
                  className="bg-white dark:bg-gray-900"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-700 dark:text-gray-300">Radio (metros)</Label>
                <Input
                  type="number"
                  value={geoFence.radius}
                  onChange={(e) =>
                    setGeoFence({ ...geoFence, radius: parseInt(e.target.value) || 100 })
                  }
                  min="10"
                  max="5000"
                  className="bg-white dark:bg-gray-900"
                />
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div>
                <Label className="text-gray-700 dark:text-gray-300">Validación Requerida</Label>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Si está activo, solo se aceptan marcaciones dentro de la zona
                </p>
              </div>
              <Switch
                checked={formData.require_geo_validation}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, require_geo_validation: checked })
                }
              />
            </div>
          </CardContent>
        )}
      </Card>

      {/* Estado */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-gray-700 dark:text-gray-300">Estado Activo</Label>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Los dispositivos inactivos no aceptan marcaciones
              </p>
            </div>
            <Switch
              checked={formData.is_active}
              onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Acciones */}
      <div className="flex items-center justify-end gap-3 pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting || isLoading} className="min-w-[150px]">
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Guardando...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              {isEdit ? 'Guardar Cambios' : 'Crear Dispositivo'}
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

export default DeviceForm;
