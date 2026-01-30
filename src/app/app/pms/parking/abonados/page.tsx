'use client';

import React, { useState, useEffect } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { Loader2 } from 'lucide-react';
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

export default function AbonadosPage() {
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
        title: 'Error',
        description: 'No se pudieron cargar los datos de abonados.',
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
        title: 'Sin tipos de plan',
        description: 'Primero debes crear al menos un tipo de plan de abonado.',
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
        title: 'Pase cancelado',
        description: `El pase de ${selectedPass.vehicle_plate} ha sido cancelado.`,
      });
      loadData();
    } catch (error) {
      console.error('Error cancelando pase:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cancelar el pase.',
        variant: 'destructive',
      });
    } finally {
      setShowCancelDialog(false);
      setSelectedPass(null);
    }
  };

  const handlePassSaved = () => {
    toast({
      title: selectedPass ? 'Pase actualizado' : 'Pase creado',
      description: 'Los cambios se han guardado correctamente.',
    });
    loadData();
  };

  const handleTypesUpdated = () => {
    toast({
      title: 'Tipo de plan actualizado',
      description: 'Los cambios se han guardado correctamente.',
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
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Cargando abonados...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <AbonadosHeader
        onRefresh={loadData}
        onNewPass={handleNewPass}
        onManageTypes={() => setShowTypesDialog(true)}
        isLoading={isLoading}
      />

      <div className="flex-1 overflow-y-auto p-6">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Total Abonados
            </p>
            <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-2">
              {stats.total}
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Activos
            </p>
            <p className="text-3xl font-bold text-green-600 dark:text-green-400 mt-2">
              {stats.active}
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Vencidos
            </p>
            <p className="text-3xl font-bold text-red-600 dark:text-red-400 mt-2">
              {stats.expired}
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Ingresos Activos
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
            <AlertDialogTitle>¿Cancelar este pase?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción cancelará el pase de {selectedPass?.vehicle_plate}. 
              El cliente ya no podrá usar este pase para acceder al estacionamiento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No, mantener</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmCancelPass}
              className="bg-red-600 hover:bg-red-700"
            >
              Sí, cancelar pase
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
