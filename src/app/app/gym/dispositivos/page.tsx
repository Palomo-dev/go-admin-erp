'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { GymDevicesService, GymAccessDevice } from '@/lib/services/gymDevicesService';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import {
  Plus,
  RefreshCw,
  Search,
  Cpu,
  CheckCircle,
  XCircle,
  QrCode,
  Fingerprint,
  MoreVertical,
  Edit,
  Trash2,
  ExternalLink,
  Monitor,
  Tablet,
  DoorOpen,
  ScanLine,
  ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';

const deviceTypeConfig: Record<string, { label: string; icon: typeof Cpu; color: string }> = {
  turnstile: { label: 'Torniquete', icon: DoorOpen, color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' },
  scanner: { label: 'Escáner', icon: ScanLine, color: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' },
  tablet: { label: 'Tablet', icon: Tablet, color: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' },
  kiosk: { label: 'Kiosco', icon: Monitor, color: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400' },
  door_lock: { label: 'Cerradura', icon: DoorOpen, color: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' },
};

export default function GymDispositivosPage() {
  const router = useRouter();
  const { organization, isLoading: orgLoading } = useOrganization();
  const { toast } = useToast();

  const [devices, setDevices] = useState<GymAccessDevice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showQrDialog, setShowQrDialog] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<GymAccessDevice | null>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    device_name: '',
    device_type: 'tablet' as GymAccessDevice['device_type'],
    serial_number: '',
    location_description: '',
    ip_address: '',
    qr_enabled: true,
    fingerprint_enabled: false,
  });

  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    inactive: 0,
    byType: {} as Record<string, number>,
  });

  const getService = useCallback(() => {
    if (!organization?.id) return null;
    return new GymDevicesService(organization.id);
  }, [organization?.id]);

  const loadData = useCallback(async () => {
    const service = getService();
    if (!service) return;

    setIsLoading(true);
    try {
      const devicesData = await service.getDevices();
      setDevices(devicesData);

      // Calcular stats
      const active = devicesData.filter(d => d.is_active).length;
      const byType: Record<string, number> = {};
      devicesData.forEach(d => {
        byType[d.device_type] = (byType[d.device_type] || 0) + 1;
      });

      setStats({
        total: devicesData.length,
        active,
        inactive: devicesData.length - active,
        byType,
      });
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

  const filteredDevices = devices.filter((d) => {
    const matchesSearch =
      d.device_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (d.serial_number?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && d.is_active) ||
      (statusFilter === 'inactive' && !d.is_active);

    const matchesType = typeFilter === 'all' || d.device_type === typeFilter;

    return matchesSearch && matchesStatus && matchesType;
  });

  const handleToggleActive = async (device: GymAccessDevice) => {
    const service = getService();
    if (!service) return;

    try {
      await service.toggleDeviceStatus(device.id, !device.is_active);
      toast({
        title: device.is_active ? 'Dispositivo desactivado' : 'Dispositivo activado',
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
      await service.deleteDevice(deleteId);
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

  const handleShowQr = async (device: GymAccessDevice) => {
    const service = getService();
    if (!service) return;

    setSelectedDevice(device);
    
    // Generar nuevo token si no tiene o expiró
    if (!device.current_qr_token || new Date(device.qr_token_expires_at || '') < new Date()) {
      const result = await service.generateQRToken(device.id);
      if (result) {
        setSelectedDevice({
          ...device,
          current_qr_token: result.token,
          qr_token_expires_at: result.expires_at,
        });
      }
    }
    
    setShowQrDialog(true);
  };

  const handleOpenFullscreen = (deviceId: string) => {
    window.open(`/gym-display/${deviceId}`, '_blank');
  };

  const handleCreateDevice = async () => {
    const service = getService();
    if (!service || !organization?.id) return;

    try {
      // Necesitamos un branch_id - usar el primero disponible
      const { data: branches } = await (await import('@/lib/supabase/config')).supabase
        .from('branches')
        .select('id')
        .eq('organization_id', organization.id)
        .limit(1);

      if (!branches?.length) {
        toast({
          title: 'Error',
          description: 'Debes tener al menos una sede configurada',
          variant: 'destructive',
        });
        return;
      }

      await service.createDevice({
        branch_id: branches[0].id,
        device_name: formData.device_name,
        device_type: formData.device_type,
        serial_number: formData.serial_number || undefined,
        location_description: formData.location_description || undefined,
        ip_address: formData.ip_address || undefined,
        configuration: {
          qr_enabled: formData.qr_enabled,
          fingerprint_enabled: formData.fingerprint_enabled,
        },
      });

      toast({ title: 'Dispositivo creado' });
      setShowNewDialog(false);
      setFormData({
        device_name: '',
        device_type: 'tablet',
        serial_number: '',
        location_description: '',
        ip_address: '',
        qr_enabled: true,
        fingerprint_enabled: false,
      });
      await loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'No se pudo crear el dispositivo',
        variant: 'destructive',
      });
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
            <Link href="/app/gym/checkin">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Cpu className="h-7 w-7 text-blue-600" />
              Dispositivos de Acceso
            </h1>
          </div>
          <p className="text-gray-500 dark:text-gray-400 ml-12">
            Gestiona torniquetes, kioscos y lectores biométricos del gimnasio
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadData} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <Button size="sm" onClick={() => setShowNewDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Dispositivo
          </Button>
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
                <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</div>
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
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.active}</div>
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
                <div className="text-2xl font-bold text-gray-500 dark:text-gray-400">{stats.inactive}</div>
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
                  {(stats.byType['kiosk'] || 0) + (stats.byType['tablet'] || 0)}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">QR/Display</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                <Fingerprint className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                  {(stats.byType['turnstile'] || 0) + (stats.byType['scanner'] || 0)}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Biométricos</p>
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
                placeholder="Buscar por nombre o serie..."
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
                <SelectItem value="turnstile">Torniquete</SelectItem>
                <SelectItem value="scanner">Escáner</SelectItem>
                <SelectItem value="tablet">Tablet</SelectItem>
                <SelectItem value="kiosk">Kiosco</SelectItem>
                <SelectItem value="door_lock">Cerradura</SelectItem>
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
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : filteredDevices.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <Cpu className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No hay dispositivos configurados</p>
              <Button variant="outline" className="mt-4" onClick={() => setShowNewDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Crear primer dispositivo
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dispositivo</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Ubicación</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Última Sync</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDevices.map((device) => {
                  const typeConf = deviceTypeConfig[device.device_type] || deviceTypeConfig.tablet;
                  const TypeIcon = typeConf.icon;
                  
                  return (
                    <TableRow key={device.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${typeConf.color}`}>
                            <TypeIcon className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">{device.device_name}</p>
                            {device.serial_number && (
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                S/N: {device.serial_number}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={typeConf.color}>
                          {typeConf.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-gray-600 dark:text-gray-400">
                          {device.location_description || device.branches?.name || '-'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={device.is_active ? 'default' : 'secondary'}>
                          {device.is_active ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {device.last_sync_at 
                            ? new Date(device.last_sync_at).toLocaleString('es')
                            : 'Nunca'
                          }
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleShowQr(device)}>
                              <QrCode className="h-4 w-4 mr-2" />
                              Ver Código QR
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleOpenFullscreen(device.id)}>
                              <ExternalLink className="h-4 w-4 mr-2" />
                              Abrir Pantalla
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleToggleActive(device)}>
                              {device.is_active ? (
                                <>
                                  <XCircle className="h-4 w-4 mr-2" />
                                  Desactivar
                                </>
                              ) : (
                                <>
                                  <CheckCircle className="h-4 w-4 mr-2" />
                                  Activar
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={() => setDeleteId(device.id)}
                              className="text-red-600"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Eliminar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* New Device Dialog */}
      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent className="bg-white dark:bg-gray-800">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-white">Nuevo Dispositivo</DialogTitle>
            <DialogDescription className="text-gray-500 dark:text-gray-400">
              Configura un nuevo punto de acceso para el gimnasio
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nombre del dispositivo *</Label>
              <Input
                value={formData.device_name}
                onChange={(e) => setFormData({ ...formData, device_name: e.target.value })}
                placeholder="Ej: Torniquete Entrada Principal"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Tipo de dispositivo</Label>
              <Select
                value={formData.device_type}
                onValueChange={(v) => setFormData({ ...formData, device_type: v as any })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tablet">Tablet</SelectItem>
                  <SelectItem value="kiosk">Kiosco</SelectItem>
                  <SelectItem value="turnstile">Torniquete</SelectItem>
                  <SelectItem value="scanner">Escáner</SelectItem>
                  <SelectItem value="door_lock">Cerradura</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Número de serie</Label>
                <Input
                  value={formData.serial_number}
                  onChange={(e) => setFormData({ ...formData, serial_number: e.target.value })}
                  placeholder="Opcional"
                />
              </div>
              <div className="space-y-2">
                <Label>IP Address</Label>
                <Input
                  value={formData.ip_address}
                  onChange={(e) => setFormData({ ...formData, ip_address: e.target.value })}
                  placeholder="192.168.1.100"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Ubicación</Label>
              <Input
                value={formData.location_description}
                onChange={(e) => setFormData({ ...formData, location_description: e.target.value })}
                placeholder="Ej: Entrada principal, Piso 2"
              />
            </div>

            <div className="space-y-3 pt-2">
              <Label>Métodos de acceso</Label>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <QrCode className="h-4 w-4 text-purple-600" />
                  <span className="text-sm">Código QR</span>
                </div>
                <Switch
                  checked={formData.qr_enabled}
                  onCheckedChange={(v) => setFormData({ ...formData, qr_enabled: v })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Fingerprint className="h-4 w-4 text-orange-600" />
                  <span className="text-sm">Huella digital</span>
                </div>
                <Switch
                  checked={formData.fingerprint_enabled}
                  onCheckedChange={(v) => setFormData({ ...formData, fingerprint_enabled: v })}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateDevice} disabled={!formData.device_name}>
              Crear Dispositivo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="bg-white dark:bg-gray-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-900 dark:text-white">
              ¿Eliminar dispositivo?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500 dark:text-gray-400">
              Esta acción no se puede deshacer. Los check-ins existentes no se eliminarán.
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

      {/* QR Dialog */}
      <Dialog open={showQrDialog} onOpenChange={setShowQrDialog}>
        <DialogContent className="bg-white dark:bg-gray-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-white">
              Código QR del Dispositivo
            </DialogTitle>
            <DialogDescription className="text-gray-500 dark:text-gray-400">
              {selectedDevice?.device_name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex flex-col items-center py-6">
            {selectedDevice?.current_qr_token ? (
              <>
                <div className="p-4 bg-white rounded-lg">
                  <QRCodeSVG
                    value={`gym-checkin:${selectedDevice.id}:${selectedDevice.current_qr_token}`}
                    size={200}
                    level="H"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-4">
                  Expira: {new Date(selectedDevice.qr_token_expires_at || '').toLocaleString('es')}
                </p>
              </>
            ) : (
              <p className="text-gray-500">Generando token...</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => handleOpenFullscreen(selectedDevice?.id || '')}>
              <ExternalLink className="h-4 w-4 mr-2" />
              Pantalla Completa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
