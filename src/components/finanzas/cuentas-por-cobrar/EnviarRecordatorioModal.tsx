'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Mail, User, Calendar, AlertTriangle, Clock } from 'lucide-react';
import { CuentaPorCobrar } from './types';
import { CuentasPorCobrarService } from './service';
import { formatCurrency } from '@/utils/Utils';
import { toast } from 'sonner';

interface EnviarRecordatorioModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cuenta: CuentaPorCobrar;
  onSuccess: () => void;
}

export function EnviarRecordatorioModal({ open, onOpenChange, cuenta, onSuccess }: EnviarRecordatorioModalProps) {
  const [mensaje, setMensaje] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const mensajePredeterminado = `Estimado(a) ${cuenta.customer_name},

Le recordamos que tiene una cuenta pendiente de pago con nosotros:

- Monto: ${formatCurrency(cuenta.balance)}
- Fecha de vencimiento: ${new Date(cuenta.due_date).toLocaleDateString('es-ES')}
- Días vencidos: ${cuenta.days_overdue}

Le solicitamos realizar el pago lo antes posible para evitar inconvenientes.

Para cualquier consulta o aclaración, no dude en contactarnos.

Saludos cordiales,
Equipo de Cobranzas`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!mensaje.trim()) {
      toast.error('Por favor ingrese un mensaje');
      return;
    }

    setIsSubmitting(true);

    try {
      // Actualizar la fecha de último recordatorio
      await CuentasPorCobrarService.actualizarFechaRecordatorio(cuenta.id);

      // Aquí se podría integrar con un servicio de email
      // Por ahora solo simulamos el envío
      console.log('Enviando recordatorio:', {
        cliente: cuenta.customer_name,
        email: cuenta.customer_email,
        mensaje: mensaje,
      });

      toast.success('Recordatorio enviado exitosamente');
      onSuccess();
      resetForm();
    } catch (error) {
      console.error('Error al enviar recordatorio:', error);
      toast.error('Error al enviar el recordatorio');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setMensaje('');
  };

  const usarMensajePredeterminado = () => {
    setMensaje(mensajePredeterminado);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-full sm:max-w-2xl lg:max-w-3xl max-h-[90vh] overflow-y-auto dark:bg-gray-800 dark:border-gray-700">
        <DialogHeader className="pb-3">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg text-gray-900 dark:text-white">
            <Mail className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400" />
            <span>Enviar Recordatorio de Pago</span>
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
          {/* Información de la cuenta */}
          <Card className="dark:bg-gray-900/50 dark:border-gray-600">
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-sm sm:text-base text-gray-900 dark:text-white flex items-center gap-2">
                <User className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span>Información del Cliente</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 sm:space-y-3 p-4 sm:p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <Label className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Cliente</Label>
                  <p className="text-sm sm:text-base font-medium text-gray-900 dark:text-white">{cuenta.customer_name}</p>
                </div>
                <div>
                  <Label className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Email</Label>
                  <p className="text-sm sm:text-base font-medium text-gray-900 dark:text-white truncate">
                    {cuenta.customer_email || 'No disponible'}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                <div>
                  <Label className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Balance Pendiente</Label>
                  <p className="text-base sm:text-lg font-medium text-red-600 dark:text-red-400">
                    {formatCurrency(cuenta.balance)}
                  </p>
                </div>
                <div>
                  <Label className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Días Vencidos</Label>
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-red-500 dark:text-red-400" />
                    <span className="text-sm sm:text-base font-medium text-red-600 dark:text-red-400">
                      {cuenta.days_overdue} días
                    </span>
                  </div>
                </div>
                <div>
                  <Label className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Último Recordatorio</Label>
                  <p className="text-sm sm:text-base font-medium text-gray-900 dark:text-white">
                    {cuenta.last_reminder_date 
                      ? new Date(cuenta.last_reminder_date).toLocaleDateString('es-ES')
                      : 'Nunca'
                    }
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Estado de la cuenta */}
          <Card className="dark:bg-gray-900/50 dark:border-gray-600">
            <CardContent className="p-4 sm:pt-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
                <div className="flex items-center gap-3 sm:gap-4">
                  <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-gray-500 dark:text-gray-400" />
                  <div>
                    <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Fecha de vencimiento</p>
                    <p className="text-sm sm:text-base font-medium text-gray-900 dark:text-white">
                      {new Date(cuenta.due_date).toLocaleDateString('es-ES')}
                    </p>
                  </div>
                </div>
                <Badge variant="destructive" className="text-[10px] sm:text-xs px-2 py-1 bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                  <Clock className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-1" />
                  <span>Vencida</span>
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Mensaje del recordatorio */}
          <Card className="dark:bg-gray-900/50 dark:border-gray-600">
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-sm sm:text-base text-gray-900 dark:text-white flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span>Mensaje del Recordatorio</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 sm:space-y-4 p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-0">
                <Label htmlFor="mensaje" className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">
                  Contenido del mensaje
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={usarMensajePredeterminado}
                  className="h-7 sm:h-8 text-[10px] sm:text-xs dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  Usar mensaje predeterminado
                </Button>
              </div>
              
              <Textarea
                id="mensaje"
                placeholder="Escriba aquí el mensaje del recordatorio..."
                value={mensaje}
                onChange={(e) => setMensaje(e.target.value)}
                rows={10}
                className="text-sm sm:text-base dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                required
              />
              
              <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                <p>El mensaje será enviado a: <strong className="text-gray-900 dark:text-white">{cuenta.customer_email || 'Email no disponible'}</strong></p>
              </div>
            </CardContent>
          </Card>

          {/* Advertencia si no hay email */}
          {!cuenta.customer_email && (
            <Card className="dark:bg-amber-900/20 dark:border-amber-700 bg-amber-50 border-amber-200">
              <CardContent className="p-4 sm:pt-6">
                <div className="flex items-start gap-2 sm:gap-3 text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm sm:text-base font-medium">Email no disponible</p>
                    <p className="text-xs sm:text-sm mt-1">
                      Este cliente no tiene un email registrado. El recordatorio se registrará pero no se enviará automáticamente.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="w-full sm:w-auto h-9 sm:h-10 text-sm sm:text-base dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !mensaje.trim()}
              className="w-full sm:w-auto h-9 sm:h-10 text-sm sm:text-base bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
            >
              {isSubmitting ? 'Enviando...' : 'Enviar Recordatorio'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
