'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  User,
  Mail,
  Phone,
  DoorOpen,
  CreditCard,
  FileText,
  Calendar,
  CheckCircle2,
  Loader2,
  IdCard,
  MapPin,
  Globe,
  PenTool,
  Eraser,
  AlertTriangle,
  XCircle,
  Info,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { CheckinReservation } from '@/lib/services/checkinService';
import { countries } from '@/lib/data/countries';
import { allCities, colombianCities } from '@/lib/data/cities';
import { useOrganization } from '@/lib/hooks/useOrganization';
import organizationService from '@/lib/services/organizationService';

interface CheckinDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservation: CheckinReservation | null;
  onConfirm: (data: CheckinData) => Promise<void>;
}

export interface CheckinData {
  reservationId: string;
  notes: string;
  depositAmount: number;
  depositMethod: string;
  depositReference: string;
  // Datos de documento
  identificationType: string;
  identificationNumber: string;
  // Procedencia y destino
  nationality: string;
  originCity: string;
  originCountry: string;
  destinationCity: string;
  destinationCountry: string;
  // Firma
  signatureData: string;
}

export function CheckinDialog({
  open,
  onOpenChange,
  reservation,
  onConfirm,
}: CheckinDialogProps) {
  const { organization } = useOrganization();

  // Estados básicos
  const [notes, setNotes] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [depositMethod, setDepositMethod] = useState('cash');
  const [depositReference, setDepositReference] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Estados de métodos de pago
  const [paymentMethods, setPaymentMethods] = useState<Array<{
    code: string;
    name: string;
    requires_reference: boolean;
  }>>([]);
  const [isLoadingPaymentMethods, setIsLoadingPaymentMethods] = useState(false);

  // Estados de documento
  const [identificationType, setIdentificationType] = useState('CC');
  const [identificationNumber, setIdentificationNumber] = useState('');
  
  // Estados de procedencia y destino
  const [nationality, setNationality] = useState('Colombiana');
  const [originCity, setOriginCity] = useState('');
  const [originCountry, setOriginCountry] = useState('Colombia');
  const [destinationCity, setDestinationCity] = useState('');
  const [destinationCountry, setDestinationCountry] = useState('Colombia');

  // Validación de fechas
  const [dateWarning, setDateWarning] = useState<{
    type: 'error' | 'warning' | 'info' | null;
    title: string;
    message: string;
  }>({ type: null, title: '', message: '' });

  // Cargar métodos de pago al abrir
  useEffect(() => {
    const loadPaymentMethods = async () => {
      if (!organization || !open) return;
      
      setIsLoadingPaymentMethods(true);
      try {
        const methods = await organizationService.getOrganizationPaymentMethods(organization.id);
        setPaymentMethods(methods);
        
        // Seleccionar el primer método por defecto si existe
        if (methods.length > 0 && !depositMethod) {
          setDepositMethod(methods[0].code);
        }
      } catch (error) {
        console.error('Error cargando métodos de pago:', error);
      } finally {
        setIsLoadingPaymentMethods(false);
      }
    };

    loadPaymentMethods();
  }, [organization, open]);

  // Validar fechas cuando se abre el dialog
  useEffect(() => {
    if (!reservation || !open) {
      setDateWarning({ type: null, title: '', message: '' });
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Parsear fecha correctamente evitando problemas de zona horaria
    const checkinParts = reservation.checkin.split('-');
    const checkinDate = new Date(
      parseInt(checkinParts[0]), 
      parseInt(checkinParts[1]) - 1, 
      parseInt(checkinParts[2])
    );
    checkinDate.setHours(0, 0, 0, 0);

    const diffDays = Math.floor((checkinDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    // Check-in antes de la fecha programada
    if (diffDays > 0) {
      setDateWarning({
        type: 'warning',
        title: 'Check-in Anticipado',
        message: `La fecha programada de check-in es el ${checkinDate.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })} (en ${diffDays} ${diffDays === 1 ? 'día' : 'días'}). ¿Deseas realizar el check-in ahora de todas formas?`,
      });
    }
    // Check-in después de la fecha programada
    else if (diffDays < 0) {
      setDateWarning({
        type: 'warning',
        title: 'Check-in Tardío',
        message: `La fecha programada de check-in era el ${checkinDate.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })} (hace ${Math.abs(diffDays)} ${Math.abs(diffDays) === 1 ? 'día' : 'días'}). Estás realizando un check-in tardío.`,
      });
    }
    // Check-in en la fecha correcta
    else {
      setDateWarning({
        type: 'info',
        title: 'Check-in en Fecha',
        message: 'El check-in se está realizando en la fecha programada.',
      });
    }

    // Verificar si algún espacio está ocupado
    const occupiedSpaces = reservation.spaces.filter(
      (space) => space.housekeeping_status === 'occupied' || !space.is_ready
    );

    if (occupiedSpaces.length > 0) {
      setDateWarning({
        type: 'error',
        title: 'Espacios No Disponibles',
        message: `Los siguientes espacios no están disponibles: ${occupiedSpaces
          .map((s) => s.label)
          .join(', ')}. No se puede realizar el check-in hasta que estén disponibles.`,
      });
    }
  }, [reservation, open]);

  // Canvas de firma
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [signatureData, setSignatureData] = useState('');

  // Inicializar canvas
  useEffect(() => {
    if (canvasRef.current && open) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
      }
    }
  }, [open]);

  // Handlers de firma
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
      setIsDrawing(true);
    }
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
      ctx.stroke();
    }
  };

  const stopDrawing = () => {
    if (isDrawing && canvasRef.current) {
      const dataUrl = canvasRef.current.toDataURL();
      setSignatureData(dataUrl);
      setIsDrawing(false);
    }
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        setSignatureData('');
      }
    }
  };

  const handleConfirm = async () => {
    if (!reservation) return;

    setIsSubmitting(true);
    try {
      await onConfirm({
        reservationId: reservation.id,
        notes,
        depositAmount: parseFloat(depositAmount) || 0,
        depositMethod,
        depositReference,
        identificationType,
        identificationNumber,
        nationality,
        originCity,
        originCountry,
        destinationCity,
        destinationCountry,
        signatureData,
      });

      // Reset form
      setNotes('');
      setDepositAmount('');
      setDepositMethod('cash');
      setDepositReference('');
      setIdentificationType('CC');
      setIdentificationNumber('');
      setNationality('Colombiana');
      setOriginCity('');
      setOriginCountry('Colombia');
      setDestinationCity('');
      setDestinationCountry('Colombia');
      clearSignature();
      onOpenChange(false);
    } catch (error) {
      console.error('Error al realizar check-in:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  };

  if (!reservation) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-2">
            <CheckCircle2 className="h-6 w-6 text-blue-600" />
            Realizar Check-in
          </DialogTitle>
          <DialogDescription>
            Confirma la identidad del huésped y registra el check-in
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Alerta de Validación de Fechas */}
          {dateWarning.type && (
            <Alert
              variant={dateWarning.type === 'error' ? 'destructive' : dateWarning.type === 'warning' ? 'default' : 'default'}
              className={
                dateWarning.type === 'error'
                  ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                  : dateWarning.type === 'warning'
                  ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20'
                  : 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
              }
            >
              {dateWarning.type === 'error' ? (
                <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
              ) : dateWarning.type === 'warning' ? (
                <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
              ) : (
                <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              )}
              <AlertTitle className={
                dateWarning.type === 'error'
                  ? 'text-red-800 dark:text-red-200'
                  : dateWarning.type === 'warning'
                  ? 'text-yellow-800 dark:text-yellow-200'
                  : 'text-blue-800 dark:text-blue-200'
              }>
                {dateWarning.title}
              </AlertTitle>
              <AlertDescription className={
                dateWarning.type === 'error'
                  ? 'text-red-700 dark:text-red-300'
                  : dateWarning.type === 'warning'
                  ? 'text-yellow-700 dark:text-yellow-300'
                  : 'text-blue-700 dark:text-blue-300'
              }>
                {dateWarning.message}
              </AlertDescription>
            </Alert>
          )}

          {/* Información del Huésped */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
              Información del Huésped
            </h3>
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg space-y-3">
              <div className="flex items-center gap-3">
                <User className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Nombre
                  </p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {reservation.customer_name}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Email
                  </p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {reservation.customer_email}
                  </p>
                </div>
              </div>
              {reservation.customer_phone && (
                <div className="flex items-center gap-3">
                  <Phone className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Teléfono
                    </p>
                    <p className="font-medium text-gray-900 dark:text-gray-100">
                      {reservation.customer_phone}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Detalles de la Reserva */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
              Detalles de la Reserva
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="h-4 w-4 text-gray-400" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Check-in
                  </p>
                </div>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {formatDate(reservation.checkin)}
                </p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="h-4 w-4 text-gray-400" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Check-out
                  </p>
                </div>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {formatDate(reservation.checkout)}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-2">
                <DoorOpen className="h-4 w-4 text-gray-400" />
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Espacios Asignados:
                </p>
              </div>
              {reservation.spaces.map((space) => (
                <div
                  key={space.id}
                  className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg flex justify-between items-center"
                >
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">
                      {space.label}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {space.space_type_name} • {space.floor_zone}
                    </p>
                  </div>
                  {space.is_ready ? (
                    <span className="text-green-600 dark:text-green-400 text-sm font-medium">
                      ✓ Lista
                    </span>
                  ) : (
                    <span className="text-orange-600 dark:text-orange-400 text-sm font-medium">
                      ⚠ Pendiente
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-4 bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Total Estimado
              </p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {formatCurrency(reservation.total_estimated)}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {reservation.nights}{' '}
                {reservation.nights === 1 ? 'noche' : 'noches'} •{' '}
                {reservation.occupant_count}{' '}
                {reservation.occupant_count === 1 ? 'ocupante' : 'ocupantes'}
              </p>
            </div>
          </div>

          <Separator />

          {/* Datos del Documento */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
              <IdCard className="h-5 w-5" />
              Datos del Documento
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="identificationType">Tipo de Documento</Label>
                <Select value={identificationType} onValueChange={setIdentificationType}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CC">Cédula de Ciudadanía</SelectItem>
                    <SelectItem value="CE">Cédula de Extranjería</SelectItem>
                    <SelectItem value="PA">Pasaporte</SelectItem>
                    <SelectItem value="TI">Tarjeta de Identidad</SelectItem>
                    <SelectItem value="NIT">NIT</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="identificationNumber">Número de Documento</Label>
                <Input
                  id="identificationNumber"
                  placeholder="Ej: 1234567890"
                  value={identificationNumber}
                  onChange={(e) => setIdentificationNumber(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Procedencia y Destino */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Procedencia y Destino
            </h3>
            <div className="space-y-4">
              <div>
                <Label htmlFor="nationality">Nacionalidad</Label>
                <Select value={nationality} onValueChange={(value) => {
                  setNationality(value);
                  if (value !== 'Colombiana') {
                    setOriginCountry('');
                    setDestinationCountry('');
                  } else {
                    setOriginCountry('Colombia');
                    setDestinationCountry('Colombia');
                  }
                }}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Colombiana">Colombiana</SelectItem>
                    <SelectItem value="Extranjera">Extranjera</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="originCity">Ciudad de Procedencia</Label>
                  <Select value={originCity} onValueChange={setOriginCity}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Seleccione ciudad" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      {(nationality === 'Colombiana' ? colombianCities : allCities).map((city) => (
                        <SelectItem key={city} value={city}>
                          {city}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="originCountry">País de Procedencia</Label>
                  <Select 
                    value={originCountry} 
                    onValueChange={setOriginCountry}
                    disabled={nationality === 'Colombiana'}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Seleccione país" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      {countries.map((country) => (
                        <SelectItem key={country} value={country}>
                          {country}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="destinationCity">Ciudad de Destino</Label>
                  <Select value={destinationCity} onValueChange={setDestinationCity}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Seleccione ciudad" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      {(nationality === 'Colombiana' ? colombianCities : allCities).map((city) => (
                        <SelectItem key={city} value={city}>
                          {city}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="destinationCountry">País de Destino</Label>
                  <Select 
                    value={destinationCountry} 
                    onValueChange={setDestinationCountry}
                    disabled={nationality === 'Colombiana'}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Seleccione país" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      {countries.map((country) => (
                        <SelectItem key={country} value={country}>
                          {country}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Firma Electrónica */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
              <PenTool className="h-5 w-5" />
              Firma del Huésped
            </h3>
            <div className="space-y-2">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Por favor firme en el recuadro a continuación
              </p>
              <div className="border-2 border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden bg-white">
                <canvas
                  ref={canvasRef}
                  width={600}
                  height={200}
                  className="w-full cursor-crosshair"
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                />
              </div>
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={clearSignature}
                  className="gap-2"
                >
                  <Eraser className="h-4 w-4" />
                  Limpiar Firma
                </Button>
              </div>
            </div>
          </div>

          <Separator />

          {/* Depósito de Seguridad */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Depósito de Seguridad (Opcional)
            </h3>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <Label htmlFor="depositAmount">Monto del Depósito</Label>
                <Input
                  id="depositAmount"
                  type="number"
                  placeholder="0"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="depositMethod">Método de Pago</Label>
                <Select 
                  value={depositMethod} 
                  onValueChange={setDepositMethod}
                  disabled={isLoadingPaymentMethods || paymentMethods.length === 0}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder={isLoadingPaymentMethods ? "Cargando..." : "Seleccionar método"} />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentMethods.map((method) => (
                      <SelectItem key={method.code} value={method.code}>
                        {method.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {paymentMethods.length === 0 && !isLoadingPaymentMethods && (
                  <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
                    No hay métodos de pago configurados
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="depositReference">Referencia (Opcional)</Label>
                <Input
                  id="depositReference"
                  placeholder="Ej: Autorización #12345"
                  value={depositReference}
                  onChange={(e) => setDepositReference(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Notas */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Notas del Check-in (Opcional)
            </h3>
            <Textarea
              placeholder="Observaciones, solicitudes especiales, condición de documentos, etc."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="resize-none"
            />
          </div>
        </div>

        <DialogFooter className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isSubmitting || dateWarning.type === 'error'}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Procesando...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Confirmar Check-in
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
