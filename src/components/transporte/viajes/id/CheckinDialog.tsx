'use client';

import { useState } from 'react';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  QrCode,
  Keyboard,
  Search,
  Loader2,
  CheckCircle,
  XCircle,
  User,
  MapPin,
} from 'lucide-react';
import { tripsService, type TripTicket } from '@/lib/services/tripsService';

interface CheckinDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  onSuccess: () => void;
}

export function CheckinDialog({
  open,
  onOpenChange,
  tripId,
  onSuccess,
}: CheckinDialogProps) {
  const [activeTab, setActiveTab] = useState<'code' | 'qr'>('code');
  const [code, setCode] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isBoarding, setIsBoarding] = useState(false);
  const [foundTicket, setFoundTicket] = useState<TripTicket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const resetState = () => {
    setCode('');
    setFoundTicket(null);
    setError(null);
    setSuccess(false);
  };

  const handleSearch = async () => {
    if (!code.trim()) {
      setError('Ingresa un código de check-in o número de boleto');
      return;
    }

    setIsSearching(true);
    setError(null);
    setFoundTicket(null);

    try {
      const ticket = await tripsService.findTicketByCode(code.trim());

      if (!ticket) {
        setError('No se encontró un boleto con ese código');
        return;
      }

      if (ticket.trip_id !== tripId) {
        setError('Este boleto no corresponde a este viaje');
        return;
      }

      if (ticket.status === 'boarded') {
        setError('Este pasajero ya ha sido abordado');
        return;
      }

      if (ticket.status === 'cancelled') {
        setError('Este boleto ha sido cancelado');
        return;
      }

      if (ticket.status === 'no_show') {
        setError('Este pasajero fue marcado como No Show');
        return;
      }

      setFoundTicket(ticket);
    } catch (err) {
      console.error('Error searching ticket:', err);
      setError('Error al buscar el boleto');
    } finally {
      setIsSearching(false);
    }
  };

  const handleBoard = async () => {
    if (!foundTicket) return;

    setIsBoarding(true);
    try {
      await tripsService.boardPassenger(foundTicket.id);
      setSuccess(true);
      setTimeout(() => {
        onSuccess();
        resetState();
      }, 1500);
    } catch (err) {
      console.error('Error boarding passenger:', err);
      setError('Error al registrar el abordaje');
    } finally {
      setIsBoarding(false);
    }
  };

  const handleClose = () => {
    resetState();
    onOpenChange(false);
  };

  const STATUS_COLORS: Record<string, string> = {
    reserved: 'bg-blue-100 text-blue-800',
    confirmed: 'bg-green-100 text-green-800',
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-blue-600" />
            Check-in de Pasajero
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'code' | 'qr')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="code" className="flex items-center gap-2">
              <Keyboard className="h-4 w-4" />
              Por Código
            </TabsTrigger>
            <TabsTrigger value="qr" className="flex items-center gap-2">
              <QrCode className="h-4 w-4" />
              Escanear QR
            </TabsTrigger>
          </TabsList>

          <TabsContent value="code" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="checkin_code">Código de Check-in o Boleto</Label>
              <div className="flex gap-2">
                <Input
                  id="checkin_code"
                  placeholder="Ej: CHK-12345 o TKT-67890"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.toUpperCase());
                    setError(null);
                    setFoundTicket(null);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  disabled={isSearching || success}
                />
                <Button
                  onClick={handleSearch}
                  disabled={isSearching || !code.trim() || success}
                >
                  {isSearching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {success && (
              <Alert className="border-green-500 bg-green-50 dark:bg-green-900/20">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-700 dark:text-green-400">
                  ¡Pasajero abordado exitosamente!
                </AlertDescription>
              </Alert>
            )}

            {foundTicket && !success && (
              <div className="border rounded-lg p-4 space-y-3 bg-gray-50 dark:bg-gray-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User className="h-5 w-5 text-gray-500" />
                    <span className="font-medium">
                      {foundTicket.passenger_name || foundTicket.customers?.full_name || 'Pasajero'}
                    </span>
                  </div>
                  <Badge className={STATUS_COLORS[foundTicket.status] || 'bg-gray-100'}>
                    {foundTicket.status === 'reserved' ? 'Reservado' : 'Confirmado'}
                  </Badge>
                </div>

                {foundTicket.seat_number && (
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    <span className="font-medium">Asiento:</span> {foundTicket.seat_number}
                  </div>
                )}

                {foundTicket.passenger_doc && (
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    <span className="font-medium">Documento:</span> {foundTicket.passenger_doc}
                  </div>
                )}

                <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                  {foundTicket.boarding_stop && (
                    <div className="flex items-center gap-1">
                      <MapPin className="h-4 w-4 text-green-500" />
                      <span>{foundTicket.boarding_stop.name}</span>
                    </div>
                  )}
                  {foundTicket.alighting_stop && (
                    <div className="flex items-center gap-1">
                      <MapPin className="h-4 w-4 text-red-500" />
                      <span>{foundTicket.alighting_stop.name}</span>
                    </div>
                  )}
                </div>

                <Button
                  onClick={handleBoard}
                  disabled={isBoarding}
                  className="w-full bg-green-600 hover:bg-green-700"
                >
                  {isBoarding ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4 mr-2" />
                  )}
                  Confirmar Abordaje
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="qr" className="mt-4">
            <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center">
              <QrCode className="h-16 w-16 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-600 dark:text-gray-400 mb-2">
                Escanea el código QR del boleto
              </p>
              <p className="text-sm text-gray-500">
                Funcionalidad de cámara próximamente disponible.
                <br />
                Por ahora, usa el código manualmente.
              </p>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
