'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useOrganization } from '@/lib/hooks/useOrganization';
import TimeClocksService from '@/lib/services/timeClocksService';
import type { TimeClock } from '@/lib/services/timeClocksService';
import { DeviceTable, QRCodeDialog } from '@/components/hrm/marcacion/dispositivos';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { useToast } from '@/components/ui/use-toast';
import {
  Plus,
  RefreshCw,
  Search,
  Cpu,
  CheckCircle,
  XCircle,
  QrCode,
  MapPin,
  ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';

export default function DispositivosPage() {
  const router = useRouter();
  const { organization, isLoading: orgLoading } = useOrganization();
  const { toast } = useToast();

  // Estados
  const [devices, setDevices] = useState<TimeClock[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  // Modal states
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [qrDevice, setQrDevice] = useState<TimeClock | null>(null);
  const [showQrDialog, setShowQrDialog] = useState(false);

  // Stats
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    inactive: 0,
    byType: {} as Record<string, number>,
  });

  // Servicio
  const getService = useCallback(() => {
    if (!organization?.id) return null;
    return new TimeClocksService(organization.id);
  }, [organization?.id]);

  // Cargar datos
  const loadData = useCallback(async () => {
    const service = getService();
    if (!service) return;

    setIsLoading(true);
    try {
      const [devicesData, statsData] = await Promise.all([
        service.getAll(true),
        service.getStats(),
      ]);

      setDevices(devicesData);
      setStats(statsData);
    } catch (error) {
      console.error('Error loading devices:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los dispositivos',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [getService, toast]);

  useEffect(() => {
    if (organization?.id && !orgLoading) {
      loadData();
    }
  }, [organization?.id, orgLoading, loadData]);

  // Filtrar
  const filteredDevices = devices.filter((d) => {
    const matchesSearch =
      d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (d.code?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && d.is_active) ||
      (statusFilter === 'inactive' && !d.is_active);

    const matchesType = typeFilter === 'all' || d.type === typeFilter;

    return matchesSearch && matchesStatus && matchesType;
  });

  // Handlers
  const handleEdit = (id: string) => {
    router.push(`/app/hrm/marcacion/dispositivos/${id}/editar`);
  };

  const handleDuplicate = async (id: string) => {
    const service = getService();
    if (!service) return;

    try {
      await service.duplicate(id);
      toast({ title: 'Dispositivo duplicado' });
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo duplicar',
        variant: 'destructive',
      });
    }
  };

  const handleToggleActive = async (id: string) => {
    const service = getService();
    if (!service) return;

    try {
      const updated = await service.toggleActive(id);
      toast({
        title: updated.is_active ? 'Dispositivo activado' : 'Dispositivo desactivado',
      });
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo cambiar el estado',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;

    const service = getService();
    if (!service) return;

    try {
      await service.delete(deleteId);
      toast({ title: 'Dispositivo eliminado' });
      setDeleteId(null);
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo eliminar',
        variant: 'destructive',
      });
    }
  };

  const handleShowQr = (id: string) => {
    const device = devices.find((d) => d.id === id);
    if (device) {
      setQrDevice(device);
      setShowQrDialog(true);
    }
  };

  const handleOpenFullscreen = (id: string) => {
    window.open(`/qr-display/${id}`, '_blank');
  };

  const handleRegenerateQr = async (id: string): Promise<TimeClock> => {
    const service = getService();
    if (!service) throw new Error('Servicio no disponible');

    try {
      const updated = await service.regenerateQrToken(id);
      toast({ title: 'Token QR regenerado' });
      await loadData();
      return updated;
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo regenerar el QR',
        variant: 'destructive',
      });
      throw error;
    }
  };

  if (orgLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Link href="/app/hrm/marcacion">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Cpu className="h-7 w-7 text-blue-600" />
              Dispositivos de Marcación
            </h1>
          </div>
          <p className="text-gray-500 dark:text-gray-400 ml-12">
            Gestiona los puntos de marcación (QR, biométrico, geolocalización)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadData} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <Link href="/app/hrm/marcacion/dispositivos/nuevo">
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Dispositivo
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Cpu className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {stats.total}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Total</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {stats.active}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Activos</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                <XCircle className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-500 dark:text-gray-400">
                  {stats.inactive}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Inactivos</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <QrCode className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                  {(stats.byType['qr_dynamic'] || 0) + (stats.byType['qr_static'] || 0)}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">QR</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                <MapPin className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                  {stats.byType['app'] || 0}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">App</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Buscar por nombre o código..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 bg-white dark:bg-gray-900"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[150px] bg-white dark:bg-gray-900">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                <SelectItem value="qr_dynamic">Código QR</SelectItem>
                <SelectItem value="qr_static">QR Estático</SelectItem>
                <SelectItem value="app">App Móvil</SelectItem>
                <SelectItem value="biometric">Biométrico</SelectItem>
                <SelectItem value="nfc">NFC</SelectItem>
                <SelectItem value="rfid">RFID</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px] bg-white dark:bg-gray-900">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Activos</SelectItem>
                <SelectItem value="inactive">Inactivos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-4">
          <DeviceTable
            devices={filteredDevices}
            onEdit={handleEdit}
            onDuplicate={handleDuplicate}
            onToggleActive={handleToggleActive}
            onDelete={(id) => setDeleteId(id)}
            onRegenerateQr={handleShowQr}
            onOpenFullscreen={handleOpenFullscreen}
            isLoading={isLoading}
          />
        </CardContent>
      </Card>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="bg-white dark:bg-gray-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-900 dark:text-white">
              ¿Eliminar dispositivo?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500 dark:text-gray-400">
              Esta acción no se puede deshacer. Las marcaciones existentes no se eliminarán.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* QR Code Dialog */}
      <QRCodeDialog
        device={qrDevice}
        open={showQrDialog}
        onOpenChange={setShowQrDialog}
        onRegenerate={handleRegenerateQr}
      />
    </div>
  );
}
