'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/config';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import {
  SessionDetailHeader,
  SessionInfoCard,
  SessionTimeline,
  SessionPayments,
  SessionNotes,
  RegisterPaymentDialog,
  IncidentDialog,
  type TimelineEvent,
  type Payment,
  type SessionNote,
} from '@/components/parking/sesiones/id';
import { Loader2 } from 'lucide-react';

interface ParkingSession {
  id: string;
  branch_id: number;
  parking_space_id: string | null;
  vehicle_plate: string;
  vehicle_type: string;
  entry_at: string;
  exit_at: string | null;
  duration_min: number | null;
  rate_id: string | null;
  amount: number | null;
  status: string;
  created_at: string;
  updated_at: string;
  parking_spaces?: {
    id: string;
    label: string;
    zone: string | null;
    type: string;
  } | null;
}

export default function SessionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;
  const { organization } = useOrganization();
  const { toast } = useToast();

  const [session, setSession] = useState<ParkingSession | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [notes, setNotes] = useState<SessionNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showIncidentDialog, setShowIncidentDialog] = useState(false);

  const loadSession = useCallback(async () => {
    if (!sessionId) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('parking_sessions')
        .select(`
          *,
          parking_spaces (
            id,
            label,
            zone,
            type
          )
        `)
        .eq('id', sessionId)
        .single();

      if (error) throw error;
      setSession(data);

      // Generar eventos de timeline basados en la sesión
      const timelineEvents: TimelineEvent[] = [
        {
          id: `entry-${data.id}`,
          type: 'entry',
          description: `Vehículo ${data.vehicle_plate} ingresó al parqueadero`,
          timestamp: data.entry_at,
        },
      ];

      if (data.exit_at) {
        timelineEvents.push({
          id: `exit-${data.id}`,
          type: 'exit',
          description: `Vehículo ${data.vehicle_plate} salió del parqueadero`,
          timestamp: data.exit_at,
        });
      }

      if (data.status === 'cancelled') {
        timelineEvents.push({
          id: `cancelled-${data.id}`,
          type: 'status_change',
          description: 'Sesión cancelada',
          timestamp: data.updated_at,
        });
      }

      setEvents(timelineEvents.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      ));
    } catch (err) {
      console.error('Error loading session:', err);
      toast({
        title: 'Error',
        description: 'No se pudo cargar la sesión',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, toast]);

  const loadPayments = useCallback(async () => {
    if (!sessionId) return;

    try {
      const { data, error } = await supabase
        .from('parking_payments')
        .select(`
          id,
          created_at,
          payment_id,
          payments (
            id,
            amount,
            method,
            status,
            reference,
            created_at
          )
        `)
        .eq('parking_session_id', sessionId);

      if (error) throw error;

      const formattedPayments: Payment[] = (data || [])
        .filter((p) => p.payments)
        .map((p) => {
          const pay = p.payments as unknown as {
            id: string;
            amount: string | number;
            method: string;
            status: string;
            reference: string | null;
            created_at: string;
          };
          return {
            id: pay.id,
            amount: parseFloat(String(pay.amount)) || 0,
            method: pay.method || 'cash',
            status: pay.status || 'completed',
            reference: pay.reference,
            created_at: pay.created_at,
          };
        });

      setPayments(formattedPayments);

      // Agregar eventos de pago a la timeline
      formattedPayments.forEach((payment) => {
        setEvents((prev) => {
          const exists = prev.some((e) => e.id === `payment-${payment.id}`);
          if (exists) return prev;
          return [
            ...prev,
            {
              id: `payment-${payment.id}`,
              type: 'payment' as const,
              description: `Pago registrado: $${payment.amount.toLocaleString('es-CO')}`,
              timestamp: payment.created_at,
            },
          ].sort((a, b) => 
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
        });
      });
    } catch (err) {
      console.error('Error loading payments:', err);
    }
  }, [sessionId]);

  useEffect(() => {
    loadSession();
    loadPayments();
  }, [loadSession, loadPayments]);

  const handleRefresh = () => {
    loadSession();
    loadPayments();
  };

  const handlePrint = () => {
    if (!session) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const receiptHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Detalle Sesión Parking</title>
        <style>
          body { font-family: monospace; max-width: 400px; margin: 0 auto; padding: 20px; }
          .header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 10px; }
          .row { display: flex; justify-content: space-between; margin: 5px 0; }
          .total { font-size: 1.2em; font-weight: bold; border-top: 1px dashed #000; padding-top: 10px; margin-top: 10px; }
          .footer { text-align: center; margin-top: 20px; font-size: 0.8em; }
        </style>
      </head>
      <body>
        <div class="header">
          <h2>DETALLE SESIÓN PARKING</h2>
          <p>${new Date().toLocaleString('es-ES')}</p>
        </div>
        <div class="row"><span>Placa:</span><span>${session.vehicle_plate}</span></div>
        <div class="row"><span>Tipo:</span><span>${session.vehicle_type}</span></div>
        <div class="row"><span>Espacio:</span><span>${session.parking_spaces?.label || 'N/A'}</span></div>
        <div class="row"><span>Entrada:</span><span>${new Date(session.entry_at).toLocaleString('es-ES')}</span></div>
        <div class="row"><span>Salida:</span><span>${session.exit_at ? new Date(session.exit_at).toLocaleString('es-ES') : 'En curso'}</span></div>
        <div class="row"><span>Duración:</span><span>${session.duration_min || 0} min</span></div>
        <div class="row"><span>Estado:</span><span>${session.status}</span></div>
        <div class="row total"><span>TOTAL:</span><span>$${session.amount?.toLocaleString('es-CO') || 0}</span></div>
        <div class="footer">
          <p>ID: ${session.id.substring(0, 8)}</p>
        </div>
        <script>window.print(); window.close();</script>
      </body>
      </html>
    `;

    printWindow.document.write(receiptHtml);
    printWindow.document.close();
  };

  const handleRegisterPayment = async (data: {
    amount: number;
    method: string;
    reference?: string;
  }) => {
    if (!session || !organization?.id) return;

    try {
      // Crear payment
      const { data: payment, error: paymentError } = await supabase
        .from('payments')
        .insert({
          organization_id: organization.id,
          branch_id: session.branch_id,
          source: 'parking',
          source_id: session.id,
          method: data.method,
          amount: data.amount,
          currency: 'COP',
          reference: data.reference,
          status: 'completed',
        })
        .select()
        .single();

      if (paymentError) throw paymentError;

      // Vincular con parking_payments
      const { error: linkError } = await supabase
        .from('parking_payments')
        .insert({
          parking_session_id: session.id,
          payment_id: payment.id,
        });

      if (linkError) throw linkError;

      toast({
        title: 'Pago registrado',
        description: `Se registró un pago de $${data.amount.toLocaleString('es-CO')}`,
      });

      loadPayments();
      loadSession();
    } catch (err) {
      console.error('Error registering payment:', err);
      toast({
        title: 'Error',
        description: 'No se pudo registrar el pago',
        variant: 'destructive',
      });
    }
  };

  const handleMarkIncident = async (data: {
    type: string;
    description: string;
    severity: string;
  }) => {
    if (!session) return;

    try {
      // Agregar nota de incidente (usando metadata de la sesión o tabla de notas)
      const incidentNote: SessionNote = {
        id: `incident-${Date.now()}`,
        content: `[INCIDENTE - ${data.type.toUpperCase()} - ${data.severity.toUpperCase()}]\n${data.description}`,
        created_at: new Date().toISOString(),
      };

      setNotes((prev) => [incidentNote, ...prev]);

      // Agregar evento a timeline
      setEvents((prev) => [
        {
          id: `incident-${Date.now()}`,
          type: 'incident',
          description: `Incidente reportado: ${data.type}`,
          timestamp: new Date().toISOString(),
        },
        ...prev,
      ]);

      toast({
        title: 'Incidente reportado',
        description: 'El incidente ha sido registrado correctamente',
      });
    } catch (err) {
      console.error('Error reporting incident:', err);
      toast({
        title: 'Error',
        description: 'No se pudo reportar el incidente',
        variant: 'destructive',
      });
    }
  };

  const handleAddNote = async (content: string) => {
    const newNote: SessionNote = {
      id: `note-${Date.now()}`,
      content,
      created_at: new Date().toISOString(),
    };

    setNotes((prev) => [newNote, ...prev]);

    setEvents((prev) => [
      {
        id: `note-${Date.now()}`,
        type: 'note',
        description: 'Nota agregada',
        timestamp: new Date().toISOString(),
      },
      ...prev,
    ]);

    toast({
      title: 'Nota agregada',
      description: 'La nota se guardó correctamente',
    });
  };

  if (!organization?.id) {
    return (
      <div className="p-6">
        <div className="flex flex-col items-center justify-center min-h-[400px]">
          <p className="text-gray-500 dark:text-gray-400">
            Selecciona una organización para continuar
          </p>
        </div>
      </div>
    );
  }

  if (isLoading && !session) {
    return (
      <div className="p-6">
        <div className="flex flex-col items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="mt-2 text-gray-500 dark:text-gray-400">Cargando sesión...</p>
        </div>
      </div>
    );
  }

  const pendingAmount = (session?.amount || 0) - 
    payments.filter((p) => p.status === 'completed').reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="p-6 space-y-6">
      <SessionDetailHeader
        session={session}
        isLoading={isLoading}
        onRefresh={handleRefresh}
        onPrint={handlePrint}
        onMarkIncident={() => setShowIncidentDialog(true)}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <SessionInfoCard session={session} isLoading={isLoading} />
          <SessionTimeline events={events} isLoading={isLoading} />
        </div>

        <div className="space-y-6">
          <SessionPayments
            payments={payments}
            totalAmount={session?.amount || null}
            sessionStatus={session?.status || 'open'}
            isLoading={isLoading}
            onRegisterPayment={() => setShowPaymentDialog(true)}
          />
          <SessionNotes
            notes={notes}
            isLoading={isLoading}
            onAddNote={handleAddNote}
          />
        </div>
      </div>

      <RegisterPaymentDialog
        open={showPaymentDialog}
        onOpenChange={setShowPaymentDialog}
        pendingAmount={pendingAmount > 0 ? pendingAmount : 0}
        onSubmit={handleRegisterPayment}
      />

      {session && (
        <IncidentDialog
          open={showIncidentDialog}
          onOpenChange={setShowIncidentDialog}
          sessionId={session.id}
          vehiclePlate={session.vehicle_plate}
          onSubmit={handleMarkIncident}
        />
      )}
    </div>
  );
}
