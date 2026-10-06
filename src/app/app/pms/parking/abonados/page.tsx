'use client';

import React, { useState, useEffect } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { PageHeaderSkeleton, StatsSkeleton, CardListSkeleton } from '@/components/common/PageSkeletons';
import ParkingService, { type ParkingPass, type ParkingPassType } from '@/lib/services/parkingService';
import {
  AbonadosHeader,
  AbonadosList,
  PassDialog,
  PassTypesDialog,
} from '@/components/pms/parking/abonados';
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
import { useTranslations } from 'next-intl';

export default function AbonadosPage() {
  const t = useTranslations('pmsParking');
  const { toast } = useToast();
  const { organization } = useOrganization();

  const [passes, setPasses] = useState<ParkingPass[]>([]);
  const [passTypes, setPassTypes] = useState<ParkingPassType[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Dialogs
  const [showPassDialog, setShowPassDialog] = useState(false);
  const [showTypesDialog, setShowTypesDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [selectedPass, setSelectedPass] = useState<ParkingPass | null>(null);

  const loadData = async () => {
    if (!organization?.id) return;

    setIsLoading(true);
    try {
      const [passesData, typesData] = await Promise.all([
        ParkingService.getPasses(organization.id),
        ParkingService.getPassTypes(organization.id),
      ]);
      setPasses(passesData);
      setPassTypes(typesData);
    } catch (error) {
      console.error('Error cargando datos:', error);
      toast({
        title: t('passVehiclesDialog.error'),
        description: t('page.noPudieronCargarDatos'),
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (organization) {
      loadData();
    }
  }, [organization]);

  const handleNewPass = () => {
    if (passTypes.length === 0) {
      toast({
        title: t('page.sinTiposPlan'),
        description: t('page.primeroDebesCrearMenos'),
        variant: 'destructive',
      });
      setShowTypesDialog(true);
      return;
    }
    setSelectedPass(null);
    setShowPassDialog(true);
  };

  const handleEditPass = (pass: ParkingPass) => {
    setSelectedPass(pass);
    setShowPassDialog(true);
  };

  const handleCancelPass = (pass: ParkingPass) => {
    setSelectedPass(pass);
    setShowCancelDialog(true);
  };

  const confirmCancelPass = async () => {
    if (!selectedPass) return;

    try {
      await ParkingService.cancelPass(selectedPass.id);
      toast({
        title: t('page.paseCancelado'),
        description: t('page.paseHaSidoCancelado', { vehicle_plate: selectedPass.vehicle_plate ?? '' }),
      });
      loadData();
    } catch (error) {
      console.error('Error cancelando pase:', error);
      toast({
        title: t('passVehiclesDialog.error'),
        description: t('page.noPudoCancelarPase'),
        variant: 'destructive',
      });
    } finally {
      setShowCancelDialog(false);
      setSelectedPass(null);
    }
  };

  const handlePassSaved = () => {
    toast({
      title: selectedPass ? t('passFormDialog.paseActualizado') : t('passFormDialog.paseCreado'),
      description: t('page.cambiosHanGuardadoCorrectamente'),
    });
    loadData();
  };

  const handleTypesUpdated = () => {
    toast({
      title: t('page.tipoPlanActualizado'),
      description: t('page.cambiosHanGuardadoCorrectamente'),
    });
    loadData();
  };

  // Stats
  const stats = {
    total: passes.length,
    active: passes.filter(p => p.status === 'active').length,
    expired: passes.filter(p => p.status === 'expired').length,
    revenue: passes.filter(p => p.status === 'active').reduce((sum, p) => sum + p.price, 0),
  };

  if (isLoading) {
    return (
      <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
          <PageHeaderSkeleton />
          <StatsSkeleton count={4} />
          <CardListSkeleton cards={5} columns="1" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      <AbonadosHeader
        onRefresh={loadData}
        onNewPass={handleNewPass}
        onManageTypes={() => setShowTypesDialog(true)}
        isLoading={isLoading}
      />

      <div className="flex-1 overflow-y-auto p-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
              {t('page.totalAbonados')}
            </p>
            <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-2">
              {stats.total}
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
              {t('page.activos')}
            </p>
            <p className="text-3xl font-bold text-green-600 dark:text-green-400 mt-2">
              {stats.active}
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
              {t('page.vencidos')}
            </p>
            <p className="text-3xl font-bold text-red-600 dark:text-red-400 mt-2">
              {stats.expired}
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
              {t('page.ingresosActivos')}
            </p>
            <p className="text-3xl font-bold text-blue-600 dark:text-blue-400 mt-2">
              ${stats.revenue.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Lista de Abonados */}
        <AbonadosList
          passes={passes}
          onEdit={handleEditPass}
          onCancel={handleCancelPass}
        />
      </div>

      {/* Diálogos */}
      {organization && (
        <>
          <PassDialog
            open={showPassDialog}
            onOpenChange={setShowPassDialog}
            pass={selectedPass}
            passTypes={passTypes}
            organizationId={organization.id}
            onSave={handlePassSaved}
          />

          <PassTypesDialog
            open={showTypesDialog}
            onOpenChange={setShowTypesDialog}
            passTypes={passTypes}
            organizationId={organization.id}
            onUpdate={handleTypesUpdated}
          />
        </>
      )}

      {/* Confirmar Cancelación */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('page.cancelarEstePase')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('page.estaAccionCancelaraPase', { vehicle_plate: selectedPass?.vehicle_plate ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('page.noMantener')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmCancelPass}
              className="bg-red-600 hover:bg-red-700"
            >
              {t('page.siCancelarPase')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
