"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/config";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { CheckCircle, XCircle, ShoppingCart, Calendar, Zap, ArrowRight, DollarSign, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getOrganizationId } from "./utils/pipelineUtils";

interface OpportunityActionsProps {
  opportunity: {
    id: string;
    name: string;
    status: string;
    amount: number;
    currency: string;
    customer?: {
      id: string;
      first_name: string;
      last_name: string;
    };
  };
  onStatusChange: (newStatus: string, reason?: string) => void;
}

export default function OpportunityActions({ opportunity, onStatusChange }: OpportunityActionsProps) {
  const router = useRouter();
  const [isWinDialogOpen, setIsWinDialogOpen] = useState(false);
  const [isLoseDialogOpen, setIsLoseDialogOpen] = useState(false);
  const [lossReason, setLossReason] = useState('');
  const [winObservation, setWinObservation] = useState('');
  const [lossObservation, setLossObservation] = useState('');
  const [isConverting, setIsConverting] = useState(false);
  const [conversionType, setConversionType] = useState<'pos' | 'pms' | null>(null);


  const handleMarkAsWon = () => {
    if (!winObservation.trim()) {
      toast.error('La observación del motivo de victoria es requerida');
      return;
    }
    
    onStatusChange('won', winObservation);
    setIsWinDialogOpen(false);
    setWinObservation('');
    toast.success('¡Oportunidad marcada como ganada!');
  };

  const handleMarkAsLost = () => {
    if (!lossReason.trim()) {
      toast.error('El motivo de pérdida es requerido');
      return;
    }
    
    if (!lossObservation.trim()) {
      toast.error('La observación del motivo de pérdida es requerida');
      return;
    }
    
    const fullReason = lossReason === 'otro' ? lossObservation : `${lossReason}: ${lossObservation}`;
    onStatusChange('lost', fullReason);
    setIsLoseDialogOpen(false);
    setLossReason('');
    setLossObservation('');
    toast.success('Oportunidad marcada como perdida');
  };

  const handleConversion = async (type: 'pos' | 'pms') => {
    if (opportunity.status !== 'won') {
      toast.error('Solo se pueden convertir oportunidades ganadas');
      return;
    }

    setIsConverting(true);
    setConversionType(type);

    try {
      const organizationId = parseInt(getOrganizationId());
      
      if (type === 'pos') {
        await convertToPOSSale(organizationId);
      } else {
        await convertToPMSReservation(organizationId);
      }
    } catch (error) {
      console.error(`❌ [handleConversion] Error en conversión a ${type}:`, error);
      toast.error(`Error al convertir a ${type === 'pos' ? 'venta POS' : 'reserva PMS'}`);
    } finally {
      setIsConverting(false);
      setConversionType(null);
    }
  };

  const convertToPOSSale = async (organizationId: number) => {
    console.log('🛒 [convertToPOSSale] Iniciando conversión a venta POS');
    
    // Crear venta en tabla sales
    const saleData = {
      organization_id: organizationId,
      branch_id: 1, // Usar branch por defecto
      customer_id: opportunity.customer?.id || null,
      user_id: null, // Se podría obtener del usuario actual
      total: opportunity.amount,
      subtotal: opportunity.amount,
      balance: opportunity.amount,
      status: 'completed',
      payment_status: 'pending',
      notes: `Venta generada desde oportunidad CRM: ${opportunity.name}`,
      sale_date: new Date().toISOString(),
      tax_total: 0,
      discount_total: 0
    };

    const { data: sale, error: saleError } = await supabase
      .from('sales')
      .insert(saleData)
      .select()
      .single();

    if (saleError) {
      console.error('❌ [convertToPOSSale] Error creando venta:', saleError);
      throw new Error('Error al crear la venta POS');
    }

    console.log('✅ [convertToPOSSale] Venta creada:', sale);
    toast.success('¡Oportunidad convertida a venta POS exitosamente!');
    
    // Redirigir al módulo POS
    router.push(`/app/pos?sale_id=${sale.id}`);
  };

  const convertToPMSReservation = async (organizationId: number) => {
    console.log('🏨 [convertToPMSReservation] Iniciando conversión a reserva PMS');
    
    // Crear reserva en tabla reservations
    const reservationData = {
      organization_id: organizationId,
      branch_id: 1, // Usar branch por defecto
      customer_id: opportunity.customer?.id || null,
      resource_type: 'opportunity_conversion',
      start_date: new Date().toISOString(),
      end_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // +1 día
      notes: `Reserva generada desde oportunidad CRM: ${opportunity.name}`,
      total_estimated: opportunity.amount,
      occupant_count: 1,
      status: 'confirmed',
      channel: 'crm',
      metadata: {
        source: 'crm_opportunity',
        opportunity_id: opportunity.id,
        opportunity_name: opportunity.name,
        converted_at: new Date().toISOString()
      }
    };

    const { data: reservation, error: reservationError } = await supabase
      .from('reservations')
      .insert(reservationData)
      .select()
      .single();

    if (reservationError) {
      console.error('❌ [convertToPMSReservation] Error creando reserva:', reservationError);
      throw new Error('Error al crear la reserva PMS');
    }

    console.log('✅ [convertToPMSReservation] Reserva creada:', reservation);
    toast.success('¡Oportunidad convertida a reserva PMS exitosamente!');
    
    // Redirigir al módulo PMS
    router.push(`/app/pms?reservation_id=${reservation.id}`);
  };

  const isCompleted = opportunity.status === 'won' || opportunity.status === 'lost';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5" />
          Acciones Rápidas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Estado Actual */}
        <div className="text-center p-4 bg-muted/50 rounded-lg">
          <h4 className="font-medium mb-2">Estado Actual</h4>
          <div className="flex justify-center">
            {opportunity.status === 'won' && (
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                Ganada
              </Badge>
            )}
            {opportunity.status === 'lost' && (
              <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100">
                Perdida
              </Badge>
            )}
            {opportunity.status === 'open' && (
              <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100">
                Abierta
              </Badge>
            )}
          </div>
        </div>

        {/* Acciones de Estado */}
        {!isCompleted && (
          <div className="space-y-2">
            <h4 className="font-medium text-sm text-muted-foreground">Marcar como:</h4>
            
            <Dialog open={isWinDialogOpen} onOpenChange={setIsWinDialogOpen}>
              <DialogTrigger asChild>
                <Button className="w-full bg-green-600 hover:bg-green-700 text-white">
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Ganada
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Marcar Oportunidad como Ganada</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <CheckCircle className="h-12 w-12 mx-auto text-green-600 mb-2" />
                    <h3 className="font-medium">¡Felicitaciones!</h3>
                    <p className="text-sm text-muted-foreground">
                      Estás a punto de marcar esta oportunidad como ganada
                    </p>
                    <div className="mt-2">
                      <p className="font-medium">{opportunity.name}</p>
                      <p className="text-lg font-bold text-green-600">
                        ${opportunity.amount.toLocaleString()} {opportunity.currency}
                      </p>
                    </div>
                  </div>
                  
                  <div>
                    <Label htmlFor="win_observation">Observación del motivo de victoria *</Label>
                    <Textarea
                      id="win_observation"
                      placeholder="Describe el motivo por el cual se ganó esta oportunidad..."
                      value={winObservation}
                      onChange={(e) => setWinObservation(e.target.value)}
                      rows={3}
                      className="mt-1"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Ej: Cliente aceptó la propuesta, mejor precio que la competencia, etc.
                    </p>
                  </div>
                  
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => {
                      setIsWinDialogOpen(false);
                      setWinObservation('');
                    }}>
                      Cancelar
                    </Button>
                    <Button onClick={handleMarkAsWon} className="bg-green-600 hover:bg-green-700">
                      Confirmar Victoria
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={isLoseDialogOpen} onOpenChange={setIsLoseDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20">
                  <XCircle className="h-4 w-4 mr-2" />
                  Perdida
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Marcar Oportunidad como Perdida</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="text-center p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                    <XCircle className="h-12 w-12 mx-auto text-red-600 mb-2" />
                    <h3 className="font-medium">Oportunidad Perdida</h3>
                    <p className="text-sm text-muted-foreground">
                      Registra el motivo para futuras referencias
                    </p>
                  </div>
                  
                  <div>
                    <Label htmlFor="loss_reason">Motivo de Pérdida *</Label>
                    <Select value={lossReason} onValueChange={setLossReason}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar motivo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="precio_alto">Precio muy alto</SelectItem>
                        <SelectItem value="competencia">Eligió la competencia</SelectItem>
                        <SelectItem value="presupuesto">Sin presupuesto</SelectItem>
                        <SelectItem value="timing">Mal momento</SelectItem>
                        <SelectItem value="no_necesidad">Ya no necesita el servicio</SelectItem>
                        <SelectItem value="no_decision">No tomó decisión</SelectItem>
                        <SelectItem value="otro">Otro motivo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label htmlFor="loss_observation">Observación detallada *</Label>
                    <Textarea
                      id="loss_observation"
                      placeholder="Describe los detalles específicos del motivo de pérdida..."
                      value={lossObservation}
                      onChange={(e) => setLossObservation(e.target.value)}
                      rows={3}
                      className="mt-1"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Ej: Cliente mencionó que encontró mejor precio, no tenía presupuesto aprobado, etc.
                    </p>
                  </div>
                  
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => {
                      setIsLoseDialogOpen(false);
                      setLossReason('');
                      setLossObservation('');
                    }}>
                      Cancelar
                    </Button>
                    <Button 
                      onClick={handleMarkAsLost}
                      className="bg-red-600 hover:bg-red-700 text-white"
                    >
                      Confirmar Pérdida
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}

        <Separator />

        {/* Conversiones */}
        <div className="space-y-2">
          <h4 className="font-medium text-sm text-muted-foreground">Convertir a:</h4>
          
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button 
                variant="outline" 
                className="w-full"
                disabled={opportunity.status !== 'won' || isConverting}
              >
                {isConverting && conversionType === 'pos' ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <ShoppingCart className="h-4 w-4 mr-2" />
                )}
                {isConverting && conversionType === 'pos' ? 'Convirtiendo...' : 'Venta POS'}
                {!isConverting && <ArrowRight className="h-4 w-4 ml-auto" />}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 shadow-2xl">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-gray-900 dark:text-gray-100 font-semibold">Convertir a Venta POS</AlertDialogTitle>
                <AlertDialogDescription className="text-gray-700 dark:text-gray-300">
                  Esta acción creará una nueva venta en el módulo POS con los datos de la oportunidad.
                  <br /><br />
                  <strong className="text-gray-900 dark:text-gray-100">Detalles:</strong>
                  <br />• <span className="text-gray-800 dark:text-gray-200">Cliente:</span> {opportunity.customer ? `${opportunity.customer.first_name} ${opportunity.customer.last_name}` : 'Sin cliente asignado'}
                  <br />• <span className="text-gray-800 dark:text-gray-200">Monto:</span> ${opportunity.amount.toLocaleString()} {opportunity.currency}
                  <br />• <span className="text-gray-800 dark:text-gray-200">Oportunidad:</span> {opportunity.name}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleConversion('pos')}>
                  Confirmar Conversión
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button 
                variant="outline" 
                className="w-full"
                disabled={opportunity.status !== 'won' || isConverting}
              >
                {isConverting && conversionType === 'pms' ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Calendar className="h-4 w-4 mr-2" />
                )}
                {isConverting && conversionType === 'pms' ? 'Convirtiendo...' : 'Reserva PMS'}
                {!isConverting && <ArrowRight className="h-4 w-4 ml-auto" />}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 shadow-2xl">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-gray-900 dark:text-gray-100 font-semibold">Convertir a Reserva PMS</AlertDialogTitle>
                <AlertDialogDescription className="text-gray-700 dark:text-gray-300">
                  Esta acción creará una nueva reserva en el módulo PMS con los datos de la oportunidad.
                  <br /><br />
                  <strong className="text-gray-900 dark:text-gray-100">Detalles:</strong>
                  <br />• <span className="text-gray-800 dark:text-gray-200">Cliente:</span> {opportunity.customer ? `${opportunity.customer.first_name} ${opportunity.customer.last_name}` : 'Sin cliente asignado'}
                  <br />• <span className="text-gray-800 dark:text-gray-200">Monto estimado:</span> ${opportunity.amount.toLocaleString()} {opportunity.currency}
                  <br />• <span className="text-gray-800 dark:text-gray-200">Oportunidad:</span> {opportunity.name}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleConversion('pms')}>
                  Confirmar Conversión
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          
          {opportunity.status !== 'won' && (
            <p className="text-xs text-muted-foreground text-center mt-2">
              * Disponible solo para oportunidades ganadas
            </p>
          )}
        </div>

        <Separator />

        {/* Información Adicional */}
        <div className="space-y-2">
          <h4 className="font-medium text-sm text-muted-foreground">Información</h4>
          
          <div className="text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Valor:</span>
              <span className="font-medium">
                ${opportunity.amount.toLocaleString()} {opportunity.currency}
              </span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-muted-foreground">ID:</span>
              <span className="font-mono text-xs">{opportunity.id.slice(0, 8)}...</span>
            </div>
          </div>
        </div>

        {/* Acciones Adicionales */}
        <div className="space-y-2">
          <Button variant="ghost" size="sm" className="w-full justify-start">
            <DollarSign className="h-4 w-4 mr-2" />
            Generar Factura
          </Button>
          
          <Button variant="ghost" size="sm" className="w-full justify-start">
            <Calendar className="h-4 w-4 mr-2" />
            Agendar Seguimiento
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
