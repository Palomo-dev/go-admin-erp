/**
 * Servicio para abrir el cajón de dinero (cash drawer) tras una venta en efectivo.
 *
 * Estrategias en cascada:
 *   1. Desktop IPC directo — si la app corre en Electron, envía el comando
 *      ESC/POS inmediatamente vía IPC al proceso principal, que lo reenvía
 *      al agente local. Es la opción más rápida (sin round-trip a Supabase).
 *   2. WebUSB — si el navegador soporta WebUSB y hay una impresora USB
 *      conectada, envía el comando directamente desde el browser.
 *   3. Print Job (fallback) — encola un `open_cash_drawer` en `print_jobs`
 *      vía Supabase; el agente local lo procesa por Realtime.
 */

import { getDesktopBridge } from '@/lib/utils/desktop';
import { isMobile } from '@/lib/utils/mobile';
import { PrintJobsService } from './printJobsService';

export interface CashDrawerResult {
  success: boolean;
  strategy: 'mobile_bluetooth' | 'desktop_ipc' | 'webusb' | 'print_job' | 'none';
  error?: string;
}

/** Comando ESC/POS para abrir cajón: ESC p m t1 t2 (m=0, t1=100, t2=100) */
const CASH_DRAWER_CMD = new Uint8Array([0x1b, 0x70, 0x00, 0x64, 0x64]);

class CashDrawerService {
  /**
   * Intenta abrir el cajón de dinero probando las 3 estrategias en cascada.
   * Detiene al primer éxito.
   *
   * @param branchId ID de la sucursal (necesario para el fallback de print_jobs)
   */
  static async open(branchId: number): Promise<CashDrawerResult> {
    // 0. Móvil Bluetooth (Capacitor) — si es app móvil, intentar BLE primero
    if (isMobile()) {
      const mobileResult = await this.tryMobileBluetooth();
      if (mobileResult.success) return this.withHaptic(mobileResult);
    }

    // 1. Desktop IPC directo
    const desktopResult = await this.tryDesktopIPC();
    if (desktopResult.success) return this.withHaptic(desktopResult);

    // 2. WebUSB
    const webusbResult = await this.tryWebUSB();
    if (webusbResult.success) return this.withHaptic(webusbResult);

    // 3. Print Job fallback
    const printJobResult = await this.tryPrintJob(branchId);
    if (printJobResult.success) return this.withHaptic(printJobResult);

    // Ninguna estrategia funcionó
    return {
      success: false,
      strategy: 'none',
      error: 'No se pudo abrir el cajón: ninguna estrategia disponible',
    };
  }

  /**
   * Envuelve un resultado exitoso con haptic feedback (no-op en web).
   * Import dinámico de mobile.ts para mantener el servicio desacoplado de React.
   */
  private static async withHaptic(result: CashDrawerResult): Promise<CashDrawerResult> {
    try {
      const { getMobilePlugin } = await import('@/lib/utils/mobile');
      const haptics = getMobilePlugin('Haptics');
      if (haptics?.impact) {
        await haptics.impact({ style: 'light' }).catch(() => {});
      }
    } catch { /* no-op en web */ }
    return result;
  }

  /**
   * Estrategia 0: Móvil Bluetooth LE (Capacitor).
   * Busca impresora Bluetooth emparejada y envía comando ESC/POS de apertura.
   */
  private static async tryMobileBluetooth(): Promise<CashDrawerResult> {
    try {
      const { openCashDrawerBluetooth } = await import('./mobilePrintService');

      // Buscar deviceId de impresora Bluetooth configurada en localStorage
      const printerDeviceId = typeof window !== 'undefined'
        ? localStorage.getItem('mobile_bluetooth_printer_id')
        : null;

      if (!printerDeviceId) {
        return { success: false, strategy: 'mobile_bluetooth', error: 'Sin impresora BLE configurada' };
      }

      const result = await openCashDrawerBluetooth(printerDeviceId);
      return {
        success: result.success,
        strategy: 'mobile_bluetooth',
        error: result.error,
      };
    } catch (err: any) {
      return {
        success: false,
        strategy: 'mobile_bluetooth',
        error: err?.message || 'Error Bluetooth móvil',
      };
    }
  }

  /**
   * Estrategia 1: Electron Desktop IPC.
   * Envía el comando directamente al agente local vía IPC sin round-trip a Supabase.
   */
  private static async tryDesktopIPC(): Promise<CashDrawerResult> {
    try {
      const bridge = getDesktopBridge();
      if (!bridge?.openCashDrawer) {
        return { success: false, strategy: 'desktop_ipc', error: 'Bridge no disponible' };
      }

      const result = await bridge.openCashDrawer();
      if (result?.success) {
        return { success: true, strategy: 'desktop_ipc' };
      }
      return {
        success: false,
        strategy: 'desktop_ipc',
        error: result?.error || 'IPC falló',
      };
    } catch (err: any) {
      return {
        success: false,
        strategy: 'desktop_ipc',
        error: err.message || 'Error desconocido en IPC',
      };
    }
  }

  /**
   * Estrategia 2: WebUSB.
   * Usa la API WebUSB del navegador para enviar el comando ESC/POS directamente.
   * Requiere que el usuario haya autorizado el dispositivo USB previamente.
   */
  private static async tryWebUSB(): Promise<CashDrawerResult> {
    try {
      const nav = navigator as Navigator & { usb?: { getDevices: () => Promise<any[]>; open: () => Promise<void>; selectConfiguration: (n: number) => Promise<void>; claimInterface: (n: number) => Promise<void>; transferOut: (endpoint: number, data: Uint8Array) => Promise<any>; close: () => Promise<void> } };
      if (typeof navigator === 'undefined' || !nav.usb) {
        return { success: false, strategy: 'webusb', error: 'WebUSB no disponible' };
      }

      // Buscar impresoras USB ya autorizadas (vendorId comunes: 0x04b8 Epson, 0x0519 Star, 0x0fe6 ICS)
      const devices = await nav.usb.getDevices();
      if (devices.length === 0) {
        return { success: false, strategy: 'webusb', error: 'Sin dispositivos USB autorizados' };
      }

      // Intentar con el primer dispositivo USB disponible
      const device = devices[0];
      await device.open();
      if (device.configuration === null) {
        await device.selectConfiguration(1);
      }
      await device.claimInterface(0);

      // Endpoint de salida típicamente 1 (bulk out)
      await device.transferOut(1, CASH_DRAWER_CMD);

      try { await device.close(); } catch { /* ignore */ }

      return { success: true, strategy: 'webusb' };
    } catch (err: any) {
      return {
        success: false,
        strategy: 'webusb',
        error: err.message || 'Error WebUSB',
      };
    }
  }

  /**
   * Estrategia 3: Print Job fallback.
   * Encola un job `open_cash_drawer` en Supabase; el agente local lo procesa
   * por Realtime y envía el comando ESC/POS a la impresora.
   */
  private static async tryPrintJob(branchId: number): Promise<CashDrawerResult> {
    try {
      const { enqueued } = await PrintJobsService.enqueueOpenCashDrawer(branchId);
      if (enqueued > 0) {
        return { success: true, strategy: 'print_job' };
      }
      return {
        success: false,
        strategy: 'print_job',
        error: 'No hay impresoras cashier configuradas',
      };
    } catch (err: any) {
      return {
        success: false,
        strategy: 'print_job',
        error: err.message || 'Error encolando print job',
      };
    }
  }
}

export { CashDrawerService };
