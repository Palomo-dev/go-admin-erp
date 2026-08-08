'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useBranch } from '@/lib/context/BranchContext';
import { useToast } from '@/components/ui/use-toast';
import TapeChartService, {
  type TapeChartData,
  type OccupancyData,
} from '@/lib/services/tapeChartService';
import {
  TapeChartHeader,
  TapeChartGrid,
  TapeChartLegend,
  OccupancyBar,
  ReservationDrawer,
  type ReservationDetails,
} from '@/components/pms/calendario';
import { NuevaReservaDialog } from '@/components/pms/reservas/nueva';
import { CheckinDialog, type CheckinData } from '@/components/pms/checkin/CheckinDialog';
import { CheckoutDialog, type CheckoutDialogData } from '@/components/pms/checkout/CheckoutDialog';
import CheckinService, { type CheckinReservation } from '@/lib/services/checkinService';
import CheckoutService, { type CheckoutReservation } from '@/lib/services/checkoutService';
import { supabase } from '@/lib/supabase/config';

export default function CalendarioPage() {
  const router = useRouter();
  const { organization } = useOrganization();
  const { branchFilter } = useBranch();
  const { toast } = useToast();

  const [startDate, setStartDate] = useState(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  });
  const [daysToShow, setDaysToShow] = useState(14);
  const [chartData, setChartData] = useState<TapeChartData>({
    spaces: [],
    reservations: [],
    blocks: [],
  });
  const [occupancyData, setOccupancyData] = useState<OccupancyData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState<ReservationDetails | null>(null);

  // Nueva reserva dialog state
  const [showNuevaReservaDialog, setShowNuevaReservaDialog] = useState(false);
  const [dialogSpaceId, setDialogSpaceId] = useState<string | null>(null);
  const [dialogCheckin, setDialogCheckin] = useState<string | null>(null);
  const [dialogCheckout, setDialogCheckout] = useState<string | null>(null);

  // Checkin/Checkout dialog state (compartido entre hover card y drawer)
  const [showCheckinDialog, setShowCheckinDialog] = useState(false);
  const [showCheckoutDialog, setShowCheckoutDialog] = useState(false);
  const [checkinReservation, setCheckinReservation] = useState<CheckinReservation | null>(null);
  const [checkoutReservation, setCheckoutReservation] = useState<CheckoutReservation | null>(null);

  const dates = useMemo(() => {
    return TapeChartService.generateDateRange(
      startDate.toISOString().split('T')[0],
      daysToShow
    );
  }, [startDate, daysToShow]);

  const endDateStr = dates[dates.length - 1];

  const loadData = async () => {
    if (!organization?.id) return;
    const branchId = branchFilter ?? undefined;

    try {
      const startDateStr = startDate.toISOString().split('T')[0];
      
      const [data, occupancy] = await Promise.all([
        TapeChartService.getTapeChartData(organization.id, startDateStr, endDateStr, branchId),
        TapeChartService.getOccupancyData(organization.id, startDateStr, endDateStr, branchId),
      ]);

      setChartData(data);
      setOccupancyData(occupancy);
    } catch (error) {
      console.error('Error loading tape chart data:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los datos del calendario',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (organization?.id) {
      setIsLoading(true);
      loadData();
    }
  }, [organization?.id, branchFilter, startDate, daysToShow]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    toast({
      title: 'Actualizado',
      description: 'El calendario ha sido actualizado',
    });
  };

  const handlePrevious = () => {
    const newDate = new Date(startDate);
    newDate.setDate(newDate.getDate() - daysToShow);
    setStartDate(newDate);
  };

  const handleNext = () => {
    const newDate = new Date(startDate);
    newDate.setDate(newDate.getDate() + daysToShow);
    setStartDate(newDate);
  };

  const handleToday = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    setStartDate(today);
  };

  const handleCellClick = (spaceId: string, date: string) => {
    const conflict = TapeChartService.checkConflicts(
      chartData.reservations,
      chartData.blocks,
      spaceId,
      date,
      date
    );

    if (!conflict.hasConflict) {
      setDialogSpaceId(spaceId);
      setDialogCheckin(date);
      setDialogCheckout(null);
      setShowNuevaReservaDialog(true);
    }
  };

  const handleCreateReservation = (spaceId: string, checkin: string, checkout: string) => {
    const conflict = TapeChartService.checkConflicts(
      chartData.reservations,
      chartData.blocks,
      spaceId,
      checkin,
      checkout
    );

    if (!conflict.hasConflict) {
      setDialogSpaceId(spaceId);
      setDialogCheckin(checkin);
      setDialogCheckout(checkout);
      setShowNuevaReservaDialog(true);
    }
  };

  const handleReservationClick = useCallback(async (reservationId: string) => {
    try {
      const details = await TapeChartService.getReservationDetails(reservationId);
      setSelectedReservation(details);
      setDrawerOpen(true);
    } catch (error) {
      console.error('Error loading reservation details:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los detalles de la reserva',
        variant: 'destructive',
      });
    }
  }, [toast]);

  const handleBlockClick = (blockId: string) => {
    router.push(`/app/pms/bloqueos?id=${blockId}`);
  };

  const handleNewReservation = () => {
    setDialogSpaceId(null);
    setDialogCheckin(null);
    setDialogCheckout(null);
    setShowNuevaReservaDialog(true);
  };

  const handleNewBlock = () => {
    router.push('/app/pms/bloqueos');
  };

  // Drawer handlers
  const handleUpdateReservation = useCallback(async (id: string, data: Partial<ReservationDetails>) => {
    try {
      await TapeChartService.updateReservation(id, {
        checkin: data.checkin,
        checkout: data.checkout,
        spaceId: data.spaceId,
        occupantCount: data.occupantCount,
        notes: data.notes,
        status: data.status,
      });
      await loadData();
      
      // Update selected reservation if still open
      if (selectedReservation?.id === id) {
        const details = await TapeChartService.getReservationDetails(id);
        setSelectedReservation(details);
      }
    } catch (error) {
      console.error('Error updating reservation:', error);
      throw error;
    }
  }, [selectedReservation?.id]);

  const handleDeleteReservation = useCallback(async (id: string) => {
    try {
      await TapeChartService.deleteReservation(id);
      await loadData();
      setDrawerOpen(false);
      setSelectedReservation(null);
    } catch (error) {
      console.error('Error deleting reservation:', error);
      throw error;
    }
  }, []);

  const handleCheckin = useCallback(async (id: string) => {
    try {
      const data = await CheckinService.getReservationForCheckin(id);
      setCheckinReservation(data);
      setShowCheckinDialog(true);
    } catch (error) {
      console.error('Error loading checkin data:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los datos del check-in',
        variant: 'destructive',
      });
    }
  }, [toast]);

  const handleConfirmCheckin = useCallback(async (data: CheckinData) => {
    const { data: { user } } = await supabase.auth.getUser();

    await CheckinService.performCheckin({
      reservationId: data.reservationId,
      userId: user?.id,
      notes: data.notes,
      depositAmount: data.depositAmount,
      signatureData: data.signatureData,
      identificationType: data.identificationType,
      identificationNumber: data.identificationNumber,
      nationality: data.nationality,
      originCity: data.originCity,
      originCountry: data.originCountry,
      destinationCity: data.destinationCity,
      destinationCountry: data.destinationCountry,
      updateCheckinDate: data.updateCheckinDate,
    });

    if (data.depositAmount > 0) {
      await CheckinService.registerDeposit({
        reservationId: data.reservationId,
        amount: data.depositAmount,
        method: data.depositMethod,
        reference: data.depositReference,
      });
    }

    await loadData();
    setShowCheckinDialog(false);
    toast({
      title: 'Check-in realizado',
      description: 'El huésped ha sido registrado correctamente',
    });
  }, [toast]);

  const handleCheckout = useCallback(async (id: string) => {
    try {
      const data = await CheckoutService.getReservationForCheckout(id);
      setCheckoutReservation(data);
      setShowCheckoutDialog(true);
    } catch (error) {
      console.error('Error loading checkout data:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los datos del check-out',
        variant: 'destructive',
      });
    }
  }, [toast]);

  const handleConfirmCheckout = useCallback(async (data: CheckoutDialogData) => {
    const { data: { user } } = await supabase.auth.getUser();

    await CheckoutService.performCheckout({
      reservationId: data.reservationId,
      userId: user?.id,
      notes: data.notes,
      generateInvoice: data.generateInvoice,
      generateReceipt: data.generateReceipt,
      updateCheckoutDate: data.updateCheckoutDate,
    });

    await loadData();
    setShowCheckoutDialog(false);
    toast({
      title: 'Check-out realizado',
      description: 'El huésped ha sido dado de baja correctamente',
    });
  }, [toast]);

  const handleCreateBlock = useCallback(async (
    spaceId: string,
    dateFrom: string,
    dateTo: string,
    blockType: string,
    reason: string
  ) => {
    if (!organization?.id) return;
    // organization.id se usa para organization_id en reservation_blocks
    
    try {
      await TapeChartService.createBlock(
        organization.id,
        spaceId,
        dateFrom,
        dateTo,
        blockType,
        reason
      );
      await loadData();
    } catch (error) {
      console.error('Error creating block:', error);
      throw error;
    }
  }, [organization?.id]);

  // Drag & drop handlers
  const handleReservationMove = useCallback(async (
    reservationId: string,
    newSpaceId: string,
    newCheckin: string,
    newCheckout: string
  ) => {
    try {
      // Check for conflicts
      const conflict = TapeChartService.checkConflicts(
        chartData.reservations.filter(r => r.id !== reservationId),
        chartData.blocks,
        newSpaceId,
        newCheckin,
        newCheckout
      );

      if (conflict.hasConflict) {
        toast({
          title: 'Conflicto',
          description: conflict.details || 'Existe un conflicto en las fechas seleccionadas',
          variant: 'destructive',
        });
        return;
      }

      await TapeChartService.moveReservation(reservationId, newSpaceId, newCheckin, newCheckout);
      await loadData();
      
      toast({
        title: 'Reserva movida',
        description: 'La reserva se ha actualizado correctamente',
      });
    } catch (error) {
      console.error('Error moving reservation:', error);
      toast({
        title: 'Error',
        description: 'No se pudo mover la reserva',
        variant: 'destructive',
      });
    }
  }, [chartData.reservations, chartData.blocks, toast]);

  const handleReservationResize = useCallback(async (
    reservationId: string,
    newCheckin: string,
    newCheckout: string
  ) => {
    const reservation = chartData.reservations.find(r => r.id === reservationId);
    if (!reservation) return;

    try {
      // Check for conflicts
      const conflict = TapeChartService.checkConflicts(
        chartData.reservations.filter(r => r.id !== reservationId),
        chartData.blocks,
        reservation.spaceId,
        newCheckin,
        newCheckout
      );

      if (conflict.hasConflict) {
        toast({
          title: 'Conflicto',
          description: conflict.details || 'Existe un conflicto en las fechas seleccionadas',
          variant: 'destructive',
        });
        return;
      }

      await TapeChartService.resizeReservation(reservationId, newCheckin, newCheckout);
      await loadData();
      
      toast({
        title: 'Reserva actualizada',
        description: 'Las fechas se han modificado correctamente',
      });
    } catch (error) {
      console.error('Error resizing reservation:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron modificar las fechas',
        variant: 'destructive',
      });
    }
  }, [chartData.reservations, chartData.blocks, toast]);

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      <TapeChartHeader
        startDate={startDate}
        daysToShow={daysToShow}
        onStartDateChange={setStartDate}
        onDaysToShowChange={setDaysToShow}
        onPrevious={handlePrevious}
        onNext={handleNext}
        onToday={handleToday}
        onRefresh={handleRefresh}
        onNewReservation={handleNewReservation}
        onNewBlock={handleNewBlock}
        isRefreshing={isRefreshing}
      />

      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-auto">
          <TapeChartGrid
            spaces={chartData.spaces}
            reservations={chartData.reservations}
            blocks={chartData.blocks}
            dates={dates}
            onCellClick={handleCellClick}
            onReservationClick={handleReservationClick}
            onBlockClick={handleBlockClick}
            onReservationMove={handleReservationMove}
            onReservationResize={handleReservationResize}
            onCreateReservation={handleCreateReservation}
            onCheckin={handleCheckin}
            onCheckout={handleCheckout}
            isLoading={isLoading}
          />
        </div>

        <OccupancyBar data={occupancyData} isLoading={isLoading} />
        <TapeChartLegend />
      </div>

      {/* Nueva Reserva Dialog */}
      <NuevaReservaDialog
        open={showNuevaReservaDialog}
        onOpenChange={setShowNuevaReservaDialog}
        preselectedSpaceId={dialogSpaceId}
        preselectedCheckin={dialogCheckin}
        preselectedCheckout={dialogCheckout}
        onSuccess={async () => {
          setShowNuevaReservaDialog(false);
          await loadData();
        }}
      />

      {/* Reservation Drawer */}
      <ReservationDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        reservation={selectedReservation}
        spaces={chartData.spaces}
        onUpdate={handleUpdateReservation}
        onDelete={handleDeleteReservation}
        onCheckin={handleCheckin}
        onCheckout={handleCheckout}
        onCreateBlock={handleCreateBlock}
      />

      {/* Check-in Dialog (compartido entre hover card y drawer) */}
      <CheckinDialog
        open={showCheckinDialog}
        onOpenChange={setShowCheckinDialog}
        reservation={checkinReservation}
        onConfirm={handleConfirmCheckin}
      />

      {/* Check-out Dialog (compartido entre hover card y drawer) */}
      <CheckoutDialog
        open={showCheckoutDialog}
        onOpenChange={setShowCheckoutDialog}
        reservation={checkoutReservation}
        onConfirm={handleConfirmCheckout}
      />
    </div>
  );
}
