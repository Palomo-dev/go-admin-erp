'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { ArrowLeft, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { 
  MembershipHeader, 
  MembershipActions, 
  MembershipTimeline,
  MembershipSummary,
  MembershipPayments,
  MembershipCheckins,
  MembershipFreezes,
  Payment
} from '@/components/gym/membresias/id';
import { MembershipQRDialog } from '@/components/gym/membresias';
import { 
  getMembershipById, 
  getMembershipEvents,
  freezeMembership,
  unfreezeMembership,
  cancelMembership,
  renewMembership,
  Membership,
  MembershipEvent,
  MemberCheckin,
  MembershipFreeze
} from '@/lib/services/gymService';
import { supabase } from '@/lib/supabase/config';

export default function MembershipDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const membershipId = Number(params.id);

  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [events, setEvents] = useState<MembershipEvent[]>([]);
  const [checkins, setCheckins] = useState<MemberCheckin[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [freezes, setFreezes] = useState<MembershipFreeze[]>([]);
  
  const [showFreezeDialog, setShowFreezeDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showQRDialog, setShowQRDialog] = useState(false);
  const [freezeReason, setFreezeReason] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [activeTab, setActiveTab] = useState('resumen');

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      
      const [membershipData, eventsData] = await Promise.all([
        getMembershipById(membershipId),
        getMembershipEvents(membershipId)
      ]);

      if (!membershipData) {
        toast({
          title: 'Error',
          description: 'Membresía no encontrada',
          variant: 'destructive'
        });
        router.push('/app/gym/membresias');
        return;
      }

      setMembership(membershipData);
      setEvents(eventsData);

      // Cargar check-ins
      const { data: checkinsData } = await supabase
        .from('member_checkins')
        .select('*, customers (id, first_name, last_name)')
        .eq('membership_id', membershipId)
        .order('checkin_at', { ascending: false })
        .limit(50);

      setCheckins(checkinsData || []);

      // Cargar congelamientos
      const { data: freezesData } = await supabase
        .from('membership_freezes')
        .select('*')
        .eq('membership_id', membershipId)
        .order('created_at', { ascending: false });

      setFreezes(freezesData || []);

      // Cargar pagos si hay sale_id
      if (membershipData.sale_id) {
        const { data: paymentsData } = await supabase
          .from('payments')
          .select('*')
          .eq('source', 'sale')
          .eq('source_id', membershipData.sale_id)
          .order('created_at', { ascending: false });

        setPayments(paymentsData || []);
      }

      if (searchParams.get('action') === 'renew') {
        handleRenew();
      }
    } catch (error) {
      console.error('Error cargando datos:', error);
      toast({
        title: 'Error',
        description: 'Error al cargar datos de la membresía',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  }, [membershipId, router, toast, searchParams]);

  useEffect(() => {
    if (membershipId) {
      loadData();
    }
  }, [membershipId, loadData]);

  const handleRenew = async () => {
    if (!membership) return;
    
    try {
      setIsProcessing(true);
      await renewMembership(membership.id);
      toast({
        title: 'Membresía renovada',
        description: 'La membresía ha sido renovada exitosamente'
      });
      loadData();
    } catch (error) {
      console.error('Error renovando:', error);
      toast({
        title: 'Error',
        description: 'Error al renovar la membresía',
        variant: 'destructive'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFreeze = async () => {
    if (!membership || !freezeReason.trim()) return;
    
    try {
      setIsProcessing(true);
      await freezeMembership(membership.id, freezeReason);
      toast({
        title: 'Membresía congelada',
        description: 'La membresía ha sido congelada'
      });
      setShowFreezeDialog(false);
      setFreezeReason('');
      loadData();
    } catch (error) {
      console.error('Error congelando:', error);
      toast({
        title: 'Error',
        description: 'Error al congelar la membresía',
        variant: 'destructive'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUnfreeze = async () => {
    if (!membership) return;
    
    try {
      setIsProcessing(true);
      await unfreezeMembership(membership.id);
      toast({
        title: 'Membresía descongelada',
        description: 'La membresía ha sido reactivada'
      });
      loadData();
    } catch (error) {
      console.error('Error descongelando:', error);
      toast({
        title: 'Error',
        description: 'Error al descongelar la membresía',
        variant: 'destructive'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = async () => {
    if (!membership) return;
    
    try {
      setIsProcessing(true);
      await cancelMembership(membership.id, cancelReason);
      toast({
        title: 'Membresía cancelada',
        description: 'La membresía ha sido cancelada',
        variant: 'destructive'
      });
      setShowCancelDialog(false);
      setCancelReason('');
      loadData();
    } catch (error) {
      console.error('Error cancelando:', error);
      toast({
        title: 'Error',
        description: 'Error al cancelar la membresía',
        variant: 'destructive'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleShowQR = () => {
    setShowQRDialog(true);
  };

  const handleViewSale = (saleId: string) => {
    router.push(`/app/finanzas/ventas/${saleId}`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!membership) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/app/gym/membresias')}
              className="text-gray-600 dark:text-gray-400"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Volver
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Detalle de Membresía
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                #{membership.id}
              </p>
            </div>
          </div>
          
          <Button
            variant="outline"
            onClick={loadData}
            disabled={isLoading}
            className="border-gray-300 dark:border-gray-600"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </div>

        {/* Info principal del cliente */}
        <MembershipHeader membership={membership} />

        {/* Acciones */}
        <MembershipActions
          membership={membership}
          onRenew={handleRenew}
          onFreeze={() => setShowFreezeDialog(true)}
          onUnfreeze={handleUnfreeze}
          onCancel={() => setShowCancelDialog(true)}
          onShowQR={handleShowQR}
          isProcessing={isProcessing}
        />

        {/* Resumen de membresía */}
        <MembershipSummary 
          membership={membership}
          totalCheckins={checkins.length}
          totalFreezes={freezes.length}
          totalPayments={payments.length}
          isLoading={isLoading}
        />

        {/* Tabs con contenido detallado */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
            <TabsTrigger value="resumen">Historial</TabsTrigger>
            <TabsTrigger value="checkins">Check-ins ({checkins.length})</TabsTrigger>
            <TabsTrigger value="pagos">Pagos ({payments.length})</TabsTrigger>
            <TabsTrigger value="congelamientos">Congelamientos ({freezes.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="resumen" className="mt-4">
            <MembershipTimeline events={events} isLoading={isLoading} />
          </TabsContent>

          <TabsContent value="checkins" className="mt-4">
            <MembershipCheckins checkins={checkins} isLoading={isLoading} />
          </TabsContent>

          <TabsContent value="pagos" className="mt-4">
            <MembershipPayments 
              payments={payments} 
              saleId={membership.sale_id}
              isLoading={isLoading}
              onViewSale={handleViewSale}
            />
          </TabsContent>

          <TabsContent value="congelamientos" className="mt-4">
            <MembershipFreezes freezes={freezes} isLoading={isLoading} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialog Congelar */}
      <Dialog open={showFreezeDialog} onOpenChange={setShowFreezeDialog}>
        <DialogContent className="bg-white dark:bg-gray-800">
          <DialogHeader>
            <DialogTitle>Congelar Membresía</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="freeze-reason">Motivo del congelamiento *</Label>
              <Textarea
                id="freeze-reason"
                value={freezeReason}
                onChange={(e) => setFreezeReason(e.target.value)}
                placeholder="Ej: Viaje, lesión, etc."
                rows={3}
                className="bg-gray-50 dark:bg-gray-900"
              />
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Los días congelados se agregarán al vencimiento cuando se descongele.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFreezeDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleFreeze}
              disabled={isProcessing || !freezeReason.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Congelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Cancelar */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent className="bg-white dark:bg-gray-800">
          <DialogHeader>
            <DialogTitle className="text-red-600">Cancelar Membresía</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-gray-600 dark:text-gray-400">
              Esta acción no se puede deshacer. La membresía quedará cancelada permanentemente.
            </p>
            <div className="space-y-2">
              <Label htmlFor="cancel-reason">Motivo de cancelación (opcional)</Label>
              <Textarea
                id="cancel-reason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Motivo de la cancelación..."
                rows={3}
                className="bg-gray-50 dark:bg-gray-900"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancelDialog(false)}>
              Volver
            </Button>
            <Button
              onClick={handleCancel}
              disabled={isProcessing}
              variant="destructive"
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirmar Cancelación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog QR */}
      <MembershipQRDialog
        open={showQRDialog}
        onOpenChange={setShowQRDialog}
        membership={membership}
      />
    </div>
  );
}
