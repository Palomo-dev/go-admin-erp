"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { CheckCircle, XCircle, ShoppingCart, Calendar, Zap, ArrowRight, DollarSign } from "lucide-react";
import { toast } from "sonner";

interface OpportunityActionsProps {
  opportunity: {
    id: string;
    name: string;
    status: string;
    amount: number;
    currency: string;
  };
  onStatusChange: (newStatus: string, reason?: string) => void;
}

export default function OpportunityActions({ opportunity, onStatusChange }: OpportunityActionsProps) {
  const [isWinDialogOpen, setIsWinDialogOpen] = useState(false);
  const [isLoseDialogOpen, setIsLoseDialogOpen] = useState(false);
  const [lossReason, setLossReason] = useState('');


  const handleMarkAsWon = () => {
    onStatusChange('won');
    setIsWinDialogOpen(false);
    toast.success('¡Oportunidad marcada como ganada!');
  };

  const handleMarkAsLost = () => {
    if (!lossReason.trim()) {
      toast.error('El motivo de pérdida es requerido');
      return;
    }
    
    onStatusChange('lost', lossReason);
    setIsLoseDialogOpen(false);
    setLossReason('');
    toast.success('Oportunidad marcada como perdida');
  };

  const handleConversion = (type: string) => {
    // Aquí implementaríamos la lógica de conversión
    // Por ahora solo mostramos un mensaje
    toast.success(`Redirigiendo a ${type === 'pos' ? 'POS' : 'PMS'}...`);
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
                  
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setIsWinDialogOpen(false)}>
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
                  
                  {lossReason === 'otro' && (
                    <div>
                      <Label htmlFor="custom_reason">Especificar motivo</Label>
                      <Textarea
                        id="custom_reason"
                        placeholder="Describe el motivo específico..."
                        rows={3}
                        onChange={(e) => setLossReason(e.target.value)}
                      />
                    </div>
                  )}
                  
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => {
                      setIsLoseDialogOpen(false);
                      setLossReason('');
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
          
          <Button 
            variant="outline" 
            className="w-full"
            onClick={() => handleConversion('pos')}
            disabled={opportunity.status !== 'won'}
          >
            <ShoppingCart className="h-4 w-4 mr-2" />
            Venta POS
            <ArrowRight className="h-4 w-4 ml-auto" />
          </Button>
          
          <Button 
            variant="outline" 
            className="w-full"
            onClick={() => handleConversion('pms')}
            disabled={opportunity.status !== 'won'}
          >
            <Calendar className="h-4 w-4 mr-2" />
            Reserva PMS
            <ArrowRight className="h-4 w-4 ml-auto" />
          </Button>
          
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
