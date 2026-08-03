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
import { PrintJobsService } from './printJobsService';

export interface CashDrawerResult {
  success: boolean;
  strategy: 'desktop_ipc' | 'webusb' | 'print_job' | 'none';
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
    // 1. Desktop IPC directo
    const desktopResult = await this.tryDesktopIPC();
    if (desktopResult.success) return desktopResult;

    // 2. WebUSB
    const webusbResult = await this.tryWebUSB();
    if (webusbResult.success) return webusbResult;

    // 3. Print Job fallback
    const printJobResult = await this.tryPrintJob(branchId);
    if (printJobResult.success) return printJobResult;

    // Ninguna estrategia funcionó
    return {
      success: false,
      strategy: 'none',
      error: 'No se pudo abrir el cajón: ninguna estrategia disponible',
    };
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
      if (typeof navigator === 'undefined' || !navigator.usb) {
        return { success: false, strategy: 'webusb', error: 'WebUSB no disponible' };
      }

      // Buscar impresoras USB ya autorizadas (vendorId comunes: 0x04b8 Epson, 0x0519 Star, 0x0fe6 ICS)
      const devices = await navigator.usb.getDevices();
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
