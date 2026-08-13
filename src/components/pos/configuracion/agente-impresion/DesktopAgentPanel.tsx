'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Activity, Wifi, WifiOff, Printer, RefreshCw, Power, Monitor, Cpu, MapPin, Loader2, Usb, Bluetooth, Network } from 'lucide-react';
import { useDesktopAgent } from '@/hooks/useDesktopAgent';
import { getDesktopBridge, isDesktop, DesktopUsbDevice, DesktopBluetoothDevice, DesktopNetworkPrinter } from '@/lib/utils/desktop';
import { isMobile } from '@/lib/utils/mobile';
import { supabase } from '@/lib/supabase/config';
import { obtenerOrganizacionActiva } from '@/lib/hooks/useOrganization';

interface Branch {
  id: number;
  name: string;
}

/**
 * Sección de impresora Bluetooth para móvil (Capacitor).
 * Permite descubrir, conectar, imprimir prueba y abrir cajón.
 */
function MobilePrinterSection() {
  const [discovering, setDiscovering] = useState(false);
  const [connected, setConnected] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    // Cargar deviceId guardado
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('mobile_bluetooth_printer_id');
      if (saved) setDeviceId(saved);
      const savedName = localStorage.getItem('mobile_bluetooth_printer_name');
      if (savedName) setDeviceName(savedName);
    }
  }, []);

  const handleDiscover = async () => {
    setDiscovering(true);
    setMessage(null);
    try {
      const { discoverBluetoothPrinters } = await import('@/lib/services/mobilePrintService');
      const device = await discoverBluetoothPrinters();
      if (device) {
        setDeviceId(device.deviceId);
        setDeviceName(device.name || 'Impresora Bluetooth');
        if (typeof window !== 'undefined') {
          localStorage.setItem('mobile_bluetooth_printer_id', device.deviceId);
          localStorage.setItem('mobile_bluetooth_printer_name', device.name || 'Impresora Bluetooth');
        }
        setMessage(`Impresora seleccionada: ${device.name || device.deviceId}`);
      } else {
        setMessage('Selección cancelada');
      }
    } catch (err: any) {
      setMessage(err?.message || 'Error descubriendo impresoras');
    } finally {
      setDiscovering(false);
    }
  };

  const handlePrintTest = async () => {
    if (!deviceId) return;
    setPrinting(true);
    setMessage(null);
    try {
      const { printTestPage } = await import('@/lib/services/mobilePrintService');
      const result = await printTestPage(deviceId);
      if (result.success) {
        setConnected(true);
        setMessage('Página de prueba enviada correctamente');
      } else {
        setMessage(result.error || 'Error imprimiendo prueba');
      }
    } catch (err: any) {
      setMessage(err?.message || 'Error');
    } finally {
      setPrinting(false);
    }
  };

  const handleOpenDrawer = async () => {
    if (!deviceId) return;
    setPrinting(true);
    setMessage(null);
    try {
      const { openCashDrawerBluetooth } = await import('@/lib/services/mobilePrintService');
      const result = await openCashDrawerBluetooth(deviceId);
      if (result.success) {
        setMessage('Comando de apertura enviado');
      } else {
        setMessage(result.error || 'Error abriendo cajón');
      }
    } catch (err: any) {
      setMessage(err?.message || 'Error');
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="space-y-4">
      {deviceName && (
        <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <Bluetooth className="h-5 w-5 text-blue-600" />
          <div className="flex-1">
            <p className="font-medium text-gray-900 dark:text-white">{deviceName}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{deviceId}</p>
          </div>
          {connected && <Badge className="bg-green-500">Conectado</Badge>}
        </div>
      )}

      <Button onClick={handleDiscover} disabled={discovering} className="w-full">
        {discovering ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Bluetooth className="h-4 w-4 mr-2" />}
        {discovering ? 'Buscando...' : 'Descubrir impresora Bluetooth'}
      </Button>

      {deviceId && (
        <div className="flex gap-2">
          <Button onClick={handlePrintTest} disabled={printing} variant="outline" className="flex-1">
            {printing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Printer className="h-4 w-4 mr-2" />}
            Imprimir prueba
          </Button>
          <Button onClick={handleOpenDrawer} disabled={printing} variant="outline" className="flex-1">
            Abrir cajón
          </Button>
        </div>
      )}

      {message && (
        <p className="text-sm text-gray-600 dark:text-gray-400 p-2 bg-gray-50 dark:bg-gray-800 rounded">{message}</p>
      )}
    </div>
  );
}

export function DesktopAgentPanel({ embedded = false }: { embedded?: boolean }) {
  const { isDesktopApp, agentStatus, loading, error, startAgentForCurrentOrg, stopAgent, refreshStatus } =
    useDesktopAgent();
  const [autoStart, setAutoStart] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const [printers, setPrinters] = useState<{ name: string; isDefault: boolean }[]>([]);
  const [printersLoading, setPrintersLoading] = useState(false);
  const [usbDevices, setUsbDevices] = useState<DesktopUsbDevice[]>([]);
  const [usbLoading, setUsbLoading] = useState(false);
  const [bluetoothDevices, setBluetoothDevices] = useState<DesktopBluetoothDevice[]>([]);
  const [bluetoothLoading, setBluetoothLoading] = useState(false);
  const [networkPrinters, setNetworkPrinters] = useState<DesktopNetworkPrinter[]>([]);
  const [networkLoading, setNetworkLoading] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [selectedBranchIds, setSelectedBranchIds] = useState<number[]>([]);

  useEffect(() => {
    if (!isDesktopApp) return;
    const bridge = getDesktopBridge();
    bridge?.version?.().then(setVersion).catch(() => {});
    bridge?.getAutoStart?.().then(setAutoStart).catch(() => {});
    loadPrinters();
    loadUsbDevices();
    loadBluetoothDevices();
    loadBranches();
  }, [isDesktopApp]);

  const loadBranches = useCallback(async () => {
    const org = obtenerOrganizacionActiva();
    if (!org.id || org.id === 0) return;
    setBranchesLoading(true);
    try {
      const { data, error } = await supabase
        .from('branches')
        .select('id, name')
        .eq('organization_id', org.id)
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      const list = (data || []) as Branch[];
      setBranches(list);
      setSelectedBranchIds(list.map((b) => b.id));
    } catch (err) {
      console.error('[DesktopAgentPanel] Error cargando sucursales:', err);
    } finally {
      setBranchesLoading(false);
    }
  }, []);

  const loadPrinters = useCallback(async () => {
    const bridge = getDesktopBridge();
    if (!bridge?.listPrinters) return;
    setPrintersLoading(true);
    try {
      const result = await bridge.listPrinters();
      if (result.printers) setPrinters(result.printers);
    } catch (err) {
      console.error('[DesktopAgentPanel] Error listando impresoras:', err);
    } finally {
      setPrintersLoading(false);
    }
  }, []);

  const loadUsbDevices = useCallback(async () => {
    const bridge = getDesktopBridge();
    if (!bridge?.listUsbDevices) return;
    setUsbLoading(true);
    try {
      const result = await bridge.listUsbDevices();
      if (result.devices) setUsbDevices(result.devices);
    } catch (err) {
      console.error('[DesktopAgentPanel] Error listando USB:', err);
    } finally {
      setUsbLoading(false);
    }
  }, []);

  const loadBluetoothDevices = useCallback(async () => {
    const bridge = getDesktopBridge();
    if (!bridge?.listBluetoothDevices) return;
    setBluetoothLoading(true);
    try {
      const result = await bridge.listBluetoothDevices();
      if (result.devices) setBluetoothDevices(result.devices);
    } catch (err) {
      console.error('[DesktopAgentPanel] Error listando Bluetooth:', err);
    } finally {
      setBluetoothLoading(false);
    }
  }, []);

  const loadNetworkPrinters = useCallback(async () => {
    const bridge = getDesktopBridge();
    if (!bridge?.discoverNetwork) return;
    setNetworkLoading(true);
    try {
      const result = await bridge.discoverNetwork();
      if (result.printers) setNetworkPrinters(result.printers);
    } catch (err) {
      console.error('[DesktopAgentPanel] Error escaneando red:', err);
    } finally {
      setNetworkLoading(false);
    }
  }, []);

  const handleToggleAutoStart = async (enabled: boolean) => {
    const bridge = getDesktopBridge();
    if (!bridge?.setAutoStart) {
      console.error('[DesktopAgentPanel] Bridge no disponible o setAutoStart no existe');
      return;
    }
    try {
      const result = await bridge.setAutoStart(enabled);
      setAutoStart(result === true);
    } catch (err) {
      console.error('[DesktopAgentPanel] Error al cambiar auto-start:', err);
      setAutoStart(false);
    }
  };

  const handleToggleBranch = (branchId: number, checked: boolean) => {
    setSelectedBranchIds((prev) =>
      checked ? [...prev, branchId] : prev.filter((id) => id !== branchId),
    );
  };

  const handleSelectAllBranches = (checked: boolean) => {
    setSelectedBranchIds(checked ? branches.map((b) => b.id) : []);
  };

  const handleStartWithBranches = async () => {
    const selectedNames = branches
      .filter((b) => selectedBranchIds.includes(b.id))
      .map((b) => b.name);
    await startAgentForCurrentOrg(selectedBranchIds, selectedNames);
  };

  const running = agentStatus?.running ?? false;

  // Rama móvil (Capacitor): panel simplificado sin agente de escritorio
  if (isMobile()) {
    return (
      <div className={embedded ? "space-y-6" : "min-h-screen bg-gray-50 dark:bg-gray-900 p-6 space-y-6"}>
        {!embedded && (
          <div className="flex items-start sm:items-center gap-3 flex-wrap">
            <Link href="/app/pos/configuracion">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex flex-wrap items-center gap-3 min-w-0">
                <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl shrink-0">
                  <Printer className="h-6 w-6 text-indigo-600" />
                </div>
                Impresión Móvil
              </h1>
              <p className="text-gray-500 dark:text-gray-400">POS / Configuración / Impresión Móvil</p>
            </div>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bluetooth className="h-5 w-5 text-blue-600" />
              Impresora Bluetooth
            </CardTitle>
            <CardDescription>
              Configura una impresora térmica Bluetooth ESC/POS para imprimir tickets desde tu dispositivo móvil.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <MobilePrinterSection />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Network className="h-5 w-5 text-green-600" />
              Impresora de Red
            </CardTitle>
            <CardDescription>
              Las impresoras de red se configuran ingresando la IP manualmente desde el formulario de impresoras.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className={embedded ? "space-y-6" : "min-h-screen bg-gray-50 dark:bg-gray-900 p-6 space-y-6"}>
      {!embedded && (
        <div className="flex items-start sm:items-center gap-3 flex-wrap">
          <Link href="/app/pos/configuracion">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex flex-wrap items-center gap-3 min-w-0">
              <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl shrink-0">
                <Printer className="h-6 w-6 text-indigo-600" />
              </div>
              Agente de Impresión
            </h1>
            <p className="text-gray-500 dark:text-gray-400">POS / Configuración / Agente de Impresión</p>
          </div>
        </div>
      )}

      {!isDesktopApp ? (
        <Card className="bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800">
          <CardContent className="py-8 text-center">
            <Monitor className="h-10 w-10 mx-auto mb-3 text-gray-400" />
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              Este panel solo está disponible cuando usas Go Admin Desktop (app de escritorio).
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Estado del agente */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div
                    className={`p-2 rounded-xl shrink-0 ${running ? 'bg-green-100 dark:bg-green-900/30' : 'bg-gray-100 dark:bg-gray-800'}`}
                  >
                    {running ? (
                      <Wifi className="h-5 w-5 text-green-600" />
                    ) : (
                      <WifiOff className="h-5 w-5 text-gray-400" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="text-base font-semibold text-gray-900 dark:text-white break-words">
                      Estado del agente
                    </CardTitle>
                    <CardDescription className="text-xs text-gray-500 dark:text-gray-400 break-words">
                      Go Admin Desktop {version && `v${version}`}
                    </CardDescription>
                  </div>
                </div>
                <Badge variant={running ? 'default' : 'secondary'} className={`shrink-0 ${running ? 'bg-green-600' : ''}`}>
                  {running ? 'Conectado' : 'Desconectado'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {agentStatus?.organizationName && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Organización:</span>
                  <span className="font-medium text-gray-900 dark:text-white min-w-0 break-words">
                    {agentStatus.organizationName}
                  </span>
                </div>
              )}

              {agentStatus?.branchNames && agentStatus.branchNames.length > 0 && (
                <div className="flex items-center gap-2 text-sm flex-wrap">
                  <span className="text-gray-500 dark:text-gray-400">Sucursales:</span>
                  {agentStatus.branchNames.map((name, i) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      {name}
                    </Badge>
                  ))}
                </div>
              )}

              {(agentStatus?.jobsPrinted !== undefined || agentStatus?.jobsFailed !== undefined) && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-green-50 dark:bg-green-950/30 p-3 text-center">
                    <p className="text-2xl font-bold text-green-600">{agentStatus?.jobsPrinted ?? 0}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Trabajos impresos</p>
                  </div>
                  <div className="rounded-lg bg-red-50 dark:bg-red-950/30 p-3 text-center">
                    <p className="text-2xl font-bold text-red-600">{agentStatus?.jobsFailed ?? 0}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Errores</p>
                  </div>
                </div>
              )}

              {agentStatus?.lastHeartbeatAt && (
                <p className="text-xs text-gray-400">
                  Última actividad: {new Date(agentStatus.lastHeartbeatAt).toLocaleString()}
                </p>
              )}

              {error && (
                <div className="rounded-md bg-red-50 dark:bg-red-950/30 px-3 py-2 text-sm text-red-700 dark:text-red-400">
                  {error}
                </div>
              )}

              <div className="flex gap-2">
                {!running ? (
                  <Button onClick={handleStartWithBranches} disabled={loading || selectedBranchIds.length === 0} size="sm">
                    <Power className="h-4 w-4 mr-1" />
                    {loading ? 'Iniciando...' : 'Iniciar agente'}
                  </Button>
                ) : (
                  <Button onClick={stopAgent} variant="outline" size="sm">
                    <Power className="h-4 w-4 mr-1" />
                    Detener agente
                  </Button>
                )}
                <Button onClick={refreshStatus} variant="ghost" size="sm">
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Selector de sucursales */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-gray-900 dark:text-white flex flex-wrap items-center gap-2 min-w-0">
                <MapPin className="h-4 w-4 text-gray-400" />
                Sucursales a escuchar
              </CardTitle>
              <CardDescription className="text-xs text-gray-500 dark:text-gray-400">
                Selecciona qué sucursales atenderá el agente de impresión.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {branchesLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              ) : branches.length === 0 ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  No hay sucursales disponibles para esta organización.
                </p>
              ) : (
                <>
                  <div className="flex items-center gap-2 pb-2 border-b border-gray-100 dark:border-gray-700">
                    <Checkbox
                      id="select-all-branches"
                      checked={selectedBranchIds.length === branches.length}
                      onCheckedChange={(checked) => handleSelectAllBranches(checked === true)}
                    />
                    <label htmlFor="select-all-branches" className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                      Seleccionar todas ({branches.length})
                    </label>
                  </div>
                  {branches.map((branch) => (
                    <div key={branch.id} className="flex items-center gap-2 py-1">
                      <Checkbox
                        id={`branch-${branch.id}`}
                        checked={selectedBranchIds.includes(branch.id)}
                        onCheckedChange={(checked) => handleToggleBranch(branch.id, checked === true)}
                      />
                      <label htmlFor={`branch-${branch.id}`} className="text-sm text-gray-900 dark:text-white cursor-pointer">
                        {branch.name}
                      </label>
                    </div>
                  ))}
                </>
              )}
            </CardContent>
          </Card>

          {/* Auto-arranque */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-gray-900 dark:text-white flex flex-wrap items-center gap-2 min-w-0">
                <Cpu className="h-4 w-4 text-gray-400" />
                Arranque automático
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm text-gray-900 dark:text-white">Iniciar con Windows</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    El agente se activará en segundo plano al encender el equipo.
                  </p>
                </div>
                <Switch checked={autoStart} onCheckedChange={handleToggleAutoStart} />
              </div>
            </CardContent>
          </Card>

          {/* Impresoras del sistema */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2">
                <CardTitle className="text-sm font-semibold text-gray-900 dark:text-white flex flex-wrap items-center gap-2 min-w-0">
                  <Printer className="h-4 w-4 text-gray-400" />
                  Impresoras del sistema
                </CardTitle>
                <Button onClick={loadPrinters} variant="ghost" size="sm" disabled={printersLoading}>
                  {printersLoading ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <Activity className="h-3 w-3 mr-1" />
                  )}
                  Detectar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {printersLoading && printers.length === 0 ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              ) : printers.length === 0 ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  No se detectaron impresoras. Haz clic en "Detectar" para reintentar.
                </p>
              ) : (
                <ul className="space-y-1">
                  {printers.map((p, i) => (
                    <li
                      key={i}
                      className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 text-sm py-1 px-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700/50"
                    >
                      <span className="text-gray-900 dark:text-white flex items-center gap-2 min-w-0 break-words">
                        <Printer className="h-3 w-3 text-gray-400" />
                        {p.name}
                      </span>
                      {p.isDefault && <Badge variant="outline" className="text-xs shrink-0">Predeterminada</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Impresoras USB */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2">
                <CardTitle className="text-sm font-semibold text-gray-900 dark:text-white flex flex-wrap items-center gap-2 min-w-0">
                  <Usb className="h-4 w-4 text-gray-400" />
                  Impresoras USB
                </CardTitle>
                <Button onClick={loadUsbDevices} variant="ghost" size="sm" disabled={usbLoading}>
                  {usbLoading ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <Activity className="h-3 w-3 mr-1" />
                  )}
                  Detectar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {usbLoading && usbDevices.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Detectando dispositivos USB...
                </div>
              ) : usbDevices.length === 0 ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  No se detectaron dispositivos USB. Haz clic en "Detectar" para reintentar.
                </p>
              ) : (
                <ul className="space-y-1">
                  {usbDevices.map((d, i) => (
                    <li
                      key={i}
                      className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 text-sm py-1 px-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700/50"
                    >
                      <span className="text-gray-900 dark:text-white flex items-center gap-2 min-w-0 break-words">
                        <Usb className="h-3 w-3 text-gray-400" />
                        {d.name || `${d.vendorId}:${d.productId}`}
                      </span>
                      <div className="flex items-center gap-1">
                        {d.viaWmi && <Badge variant="outline" className="text-xs shrink-0">WMI</Badge>}
                        {d.isPrinter && <Badge variant="outline" className="text-xs bg-green-50 dark:bg-green-950/30">Impresora</Badge>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Impresoras Bluetooth */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2">
                <CardTitle className="text-sm font-semibold text-gray-900 dark:text-white flex flex-wrap items-center gap-2 min-w-0">
                  <Bluetooth className="h-4 w-4 text-gray-400" />
                  Dispositivos Bluetooth
                </CardTitle>
                <Button onClick={loadBluetoothDevices} variant="ghost" size="sm" disabled={bluetoothLoading}>
                  {bluetoothLoading ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <Activity className="h-3 w-3 mr-1" />
                  )}
                  Detectar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {bluetoothLoading && bluetoothDevices.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Detectando dispositivos Bluetooth...
                </div>
              ) : bluetoothDevices.length === 0 ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  No se detectaron dispositivos Bluetooth. Asegúrate de que estén emparejados con el SO.
                </p>
              ) : (
                <ul className="space-y-1">
                  {bluetoothDevices.map((d, i) => (
                    <li
                      key={i}
                      className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 text-sm py-1 px-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700/50"
                    >
                      <span className="text-gray-900 dark:text-white flex items-center gap-2 min-w-0 break-words">
                        <Bluetooth className="h-3 w-3 text-gray-400" />
                        {d.name}
                      </span>
                      <div className="flex items-center gap-1">
                        {d.macAddress && <Badge variant="outline" className="text-xs font-mono">{d.macAddress}</Badge>}
                        {d.isPrinter && <Badge variant="outline" className="text-xs bg-green-50 dark:bg-green-950/30">Impresora</Badge>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Impresoras de red */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2">
                <CardTitle className="text-sm font-semibold text-gray-900 dark:text-white flex flex-wrap items-center gap-2 min-w-0">
                  <Network className="h-4 w-4 text-gray-400" />
                  Impresoras de red
                </CardTitle>
                <Button onClick={loadNetworkPrinters} variant="ghost" size="sm" disabled={networkLoading}>
                  {networkLoading ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <Activity className="h-3 w-3 mr-1" />
                  )}
                  Escanear
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {networkLoading && networkPrinters.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Escaneando red local (puede tardar unos segundos)...
                </div>
              ) : networkPrinters.length === 0 ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  No se detectaron impresoras de red. Haz clic en "Escanear" para buscar.
                </p>
              ) : (
                <ul className="space-y-1">
                  {networkPrinters.map((p, i) => (
                    <li
                      key={i}
                      className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 text-sm py-1 px-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700/50"
                    >
                      <span className="text-gray-900 dark:text-white flex items-center gap-2 min-w-0 break-words">
                        <Network className="h-3 w-3 text-gray-400" />
                        {p.ip}:{p.port}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
