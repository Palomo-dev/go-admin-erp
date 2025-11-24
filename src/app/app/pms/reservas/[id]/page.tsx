'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ReservationDetailService, { type ReservationDetail } from '@/lib/services/reservationDetailService';
import ReservationListService from '@/lib/services/reservationListService';
import {
  ReservationHeader,
  ReservationActions,
  OverviewTab,
  PaymentsTab,
  NotesTab,
} from '@/components/pms/reservas/id';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function ReservationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { organization } = useOrganization();

  const reservationId = params.id as string;

  const [reservation, setReservation] = useState<ReservationDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  useEffect(() => {
    if (reservationId) {
      loadReservation();
    }
  }, [reservationId]);

  const loadReservation = async () => {
    try {
      setIsLoading(true);
      const data = await ReservationDetailService.getReservationDetail(reservationId);
      setReservation(data);
    } catch (error: any) {
      console.error('Error loading reservation:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar la reserva',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    router.push('/app/pms/reservas');
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDuplicate = () => {
    toast({
      title: 'Función en desarrollo',
      description: 'La duplicación de reservas estará disponible pronto',
    });
  };

  const handleCancel = async () => {
    try {
      await ReservationListService.cancelReservation(reservationId);
      toast({
        title: 'Reserva Cancelada',
        description: 'La reserva ha sido cancelada correctamente',
      });
      setShowCancelDialog(false);
      loadReservation();
    } catch (error) {
      console.error('Error canceling reservation:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cancelar la reserva',
        variant: 'destructive',
      });
    }
  };

  const handleInvoice = () => {
    toast({
      title: 'Función en desarrollo',
      description: 'La emisión de facturas estará disponible pronto',
    });
  };

  const handleReceipt = () => {
    toast({
      title: 'Función en desarrollo',
      description: 'La generación de recibos estará disponible pronto',
    });
  };

  const handleAddPayment = async (data: { amount: number; method: string; reference: string }) => {
    if (!organization || !reservation) return;

    try {
      // Obtener moneda base de la organización
      const baseCurrency = await ReservationDetailService.getBaseCurrency(organization.id);

      await ReservationDetailService.createPayment({
        organizationId: reservation.organization_id,
        branchId: reservation.branch_id,
        reservationId: reservation.id,
        amount: data.amount,
        method: data.method,
        reference: data.reference,
        currency: baseCurrency,
      });

      toast({
        title: 'Pago Registrado',
        description: 'El pago se ha registrado correctamente',
      });

      loadReservation();
    } catch (error) {
      console.error('Error adding payment:', error);
      toast({
        title: 'Error',
        description: 'No se pudo registrar el pago',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleSaveNotes = async (notes: string) => {
    if (!reservation) return;

    try {
      await ReservationDetailService.updateNotes(reservation.id, notes);
      toast({
        title: 'Notas Guardadas',
        description: 'Las notas se han actualizado correctamente',
      });
      loadReservation();
    } catch (error) {
      console.error('Error saving notes:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron guardar las notas',
        variant: 'destructive',
      });
      throw error;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!reservation) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <p className="text-gray-500 dark:text-gray-400">Reserva no encontrada</p>
      </div>
    );
  }

  const nights = ReservationDetailService.calculateNights(reservation.checkin, reservation.checkout);
  const financials = ReservationDetailService.calculateFinancials(reservation);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-6 py-6 space-y-6">
        {/* Acciones */}
        <ReservationActions
          reservationId={reservation.id}
          status={reservation.status}
          onBack={handleBack}
          onPrint={handlePrint}
          onDuplicate={handleDuplicate}
          onCancel={() => setShowCancelDialog(true)}
          onInvoice={handleInvoice}
          onReceipt={handleReceipt}
        />

        {/* Header */}
        <ReservationHeader
          reservation={reservation}
          nights={nights}
          financials={financials}
        />

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Vista General</TabsTrigger>
            <TabsTrigger value="payments">Pagos</TabsTrigger>
            <TabsTrigger value="notes">Notas</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6">
            <OverviewTab reservation={reservation} nights={nights} />
          </TabsContent>

          <TabsContent value="payments" className="mt-6">
            <PaymentsTab
              payments={reservation.payments}
              onAddPayment={handleAddPayment}
            />
          </TabsContent>

          <TabsContent value="notes" className="mt-6">
            <NotesTab
              initialNotes={reservation.notes}
              onSave={handleSaveNotes}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialog de confirmación de cancelación */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar Reserva</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas cancelar esta reserva? Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No, mantener</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel} className="bg-red-600 hover:bg-red-700">
              Sí, cancelar reserva
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
