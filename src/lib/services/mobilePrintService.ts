/**
 * Servicio de impresión móvil para Go Admin ERP.
 *
 * Permite imprimir tickets POS desde la app móvil (Capacitor) vía:
 * 1. Bluetooth LE (impresoras térmicas ESC/POS inalámbricas)
 * 2. Red TCP/IP (impresoras con IP y puerto, ej. 9100)
 *
 * En web/desktop, todas las funciones son no-ops (retornan null/false).
 *
 * Flujo Bluetooth LE:
 * 1. discoverBluetoothPrinters() → BluetoothLe.requestDevice() con filtro de servicios
 * 2. connectToPrinter(deviceId) → BluetoothLe.connect()
 * 3. printEscPos(deviceId, data) → BluetoothLe.write() al characteristic de impresión
 * 4. disconnectFromPrinter(deviceId) → BluetoothLe.disconnect()
 *
 * UUIDs estándar de impresoras Bluetooth ESC/POS:
 * - Servicio: 000018f0-0000-1000-8000-00805f9b34fb (común en impresoras genéricas)
 * - Characteristic: 00002af1-0000-1000-8000-00805f9b34fb (canal de datos)
 * - Alternativa: 0000ff00-0000-1000-8000-00805f9b34fb (algunas Epson)
 */

import {
  isMobile,
  getMobilePlugin,
  type MobileBluetoothDevice,
} from '@/lib/utils/mobile';
import {
  buildSaleTicket,
  buildKitchenTicket,
  buildPreCuenta,
  buildCashDrawerCommand,
} from './mobileEscposAdapter';
import type {
  SaleTicketPrintPayload,
  KitchenTicketPrintPayload,
} from '@printing/types';
import type { PaperWidth } from '@printing/paper';

// ============================================================================
// Constantes
// ============================================================================

/** UUIDs estándar de impresoras Bluetooth ESC/POS genéricas */
const PRINTER_SERVICE_UUID = '000018f0-0000-1000-8000-00805f9b34fb';
const PRINTER_CHAR_UUID = '00002af1-0000-1000-8000-00805f9b34fb';

/** UUIDs alternativos (algunas Epson y Star) */
const PRINTER_SERVICE_UUID_ALT = '0000ff00-0000-1000-8000-00805f9b34fb';
const PRINTER_CHAR_UUID_ALT = '0000ff02-0000-1000-8000-00805f9b34fb';

/** Tamaño máximo de chunk para BLE (MTU típico ~20-512 bytes, usamos 180 seguro) */
const BLE_CHUNK_SIZE = 180;

// ============================================================================
// Tipos
// ============================================================================

export interface MobilePrinter {
  deviceId: string;
  name: string;
  type: 'bluetooth' | 'network';
  ip?: string;
  port?: number;
}

export interface PrintResult {
  success: boolean;
  error?: string;
  strategy: 'bluetooth' | 'network' | 'none';
}

// ============================================================================
// Descubrimiento de impresoras
// ============================================================================

/**
 * Descubre impresoras Bluetooth LE disponibles.
 * Usa BluetoothLe.requestDevice() que muestra el selector nativo del SO.
 *
 * @returns Dispositivo seleccionado o null si se canceló/no hay móvil
 */
export async function discoverBluetoothPrinters(): Promise<MobileBluetoothDevice | null> {
  if (!isMobile()) return null;

  const ble = getMobilePlugin('BluetoothLe');
  if (!ble?.requestDevice) {
    console.warn('[mobilePrint] Plugin BluetoothLe no disponible');
    return null;
  }

  try {
    // Solicitar permisos en Android si es necesario
    if (ble.initialize) {
      await ble.initialize();
    }

    // requestDevice con filtro de servicio de impresora
    const device = await ble.requestDevice({
      services: [PRINTER_SERVICE_UUID, PRINTER_SERVICE_UUID_ALT],
      name: undefined, // cualquier nombre
    });

    console.log('[mobilePrint] Impresora Bluetooth seleccionada:', device.name || device.deviceId);
    return device;
  } catch (err: any) {
    if (err?.message?.includes('cancelled') || err?.message?.includes('canceled')) {
      console.log('[mobilePrint] Usuario canceló selección Bluetooth');
      return null;
    }
    console.error('[mobilePrint] Error discoverBluetoothPrinters:', err);
    return null;
  }
}

/**
 * Escanea impresoras de red en el rango local.
 * En móvil, usa fetch a un endpoint de discovery o mDNS si está disponible.
 * Por ahora retorna array vacío (el discovery de red requiere plugin nativo).
 */
export async function discoverNetworkPrinters(): Promise<MobilePrinter[]> {
  if (!isMobile()) return [];

  // El discovery de red en móvil requiere un plugin nativo (mDNS/NSD).
  // Por ahora, el usuario debe ingresar la IP manualmente.
  // Futuro: usar @capacitor-community/mdns o similar.
  console.log('[mobilePrint] Discovery de red no implementado en móvil (ingresar IP manualmente)');
  return [];
}

// ============================================================================
// Impresión vía Bluetooth LE
// ============================================================================

/**
 * Conecta a una impresora Bluetooth LE.
 *
 * @param deviceId ID del dispositivo (de discoverBluetoothPrinters)
 */
export async function connectToPrinter(deviceId: string): Promise<boolean> {
  if (!isMobile()) return false;

  const ble = getMobilePlugin('BluetoothLe');
  if (!ble?.connect) {
    console.warn('[mobilePrint] Plugin BluetoothLe.connect no disponible');
    return false;
  }

  try {
    await ble.connect({ deviceId });
    console.log(`[mobilePrint] Conectado a ${deviceId}`);
    return true;
  } catch (err: any) {
    console.error('[mobilePrint] Error connectToPrinter:', err);
    return false;
  }
}

/**
 * Desconecta de una impresora Bluetooth LE.
 */
export async function disconnectFromPrinter(deviceId: string): Promise<void> {
  if (!isMobile()) return;

  const ble = getMobilePlugin('BluetoothLe');
  if (!ble?.disconnect) return;

  try {
    await ble.disconnect({ deviceId });
    console.log(`[mobilePrint] Desconectado de ${deviceId}`);
  } catch (err) {
    console.error('[mobilePrint] Error disconnectFromPrinter:', err);
  }
}

/**
 * Envía datos raw (Uint8Array) a una impresora Bluetooth LE.
 * Divide en chunks para no exceder el MTU del BLE.
 *
 * @param deviceId ID del dispositivo
 * @param data Comandos ESC/POS como Uint8Array
 */
export async function printEscPosBluetooth(
  deviceId: string,
  data: Uint8Array,
): Promise<PrintResult> {
  if (!isMobile()) {
    return { success: false, strategy: 'none', error: 'No es móvil' };
  }

  const ble = getMobilePlugin('BluetoothLe');
  if (!ble?.write) {
    return { success: false, strategy: 'bluetooth', error: 'Plugin BluetoothLe.write no disponible' };
  }

  try {
    // Convertir Uint8Array a base64 para BluetoothLe.write
    const base64Data = uint8ArrayToBase64(data);

    // Dividir en chunks y enviar secuencialmente
    for (let offset = 0; offset < base64Data.length; offset += BLE_CHUNK_SIZE) {
      const chunk = base64Data.substring(offset, offset + BLE_CHUNK_SIZE);
      await ble.write({
        deviceId,
        service: PRINTER_SERVICE_UUID,
        characteristic: PRINTER_CHAR_UUID,
        value: chunk,
      });
    }

    console.log(`[mobilePrint] Enviados ${data.length} bytes a ${deviceId}`);
    return { success: true, strategy: 'bluetooth' };
  } catch (err: any) {
    // Intentar con UUIDs alternativos
    try {
      const base64Data = uint8ArrayToBase64(data);
      for (let offset = 0; offset < base64Data.length; offset += BLE_CHUNK_SIZE) {
        const chunk = base64Data.substring(offset, offset + BLE_CHUNK_SIZE);
        await ble.write({
          deviceId,
          service: PRINTER_SERVICE_UUID_ALT,
          characteristic: PRINTER_CHAR_UUID_ALT,
          value: chunk,
        });
      }
      console.log(`[mobilePrint] Enviados ${data.length} bytes (UUID alt) a ${deviceId}`);
      return { success: true, strategy: 'bluetooth' };
    } catch (err2: any) {
      console.error('[mobilePrint] Error printEscPosBluetooth:', err2);
      return {
        success: false,
        strategy: 'bluetooth',
        error: err2?.message || 'Error enviando datos BLE',
      };
    }
  }
}

// ============================================================================
// Impresión vía Red TCP/IP
// ============================================================================

/**
 * Envía datos ESC/POS a una impresora de red vía TCP.
 * Usa fetch a un endpoint proxy o WebSocket si está disponible.
 *
 * En móvil, la conexión TCP directa requiere un plugin nativo.
 * Por ahora usa el sistema de print jobs de Supabase como fallback.
 *
 * @param ip IP de la impresora
 * @param port Puerto (default 9100)
 * @param data Comandos ESC/POS como Uint8Array
 */
export async function printEscPosNetwork(
  ip: string,
  port: number,
  data: Uint8Array,
): Promise<PrintResult> {
  if (!isMobile()) {
    return { success: false, strategy: 'none', error: 'No es móvil' };
  }

  // En móvil, la conexión TCP directa no está disponible sin plugin nativo.
  // Opciones:
  // 1. Usar @capacitor-community/tcp-socket (plugin futuro)
  // 2. Usar el agente de escritorio como intermediario (print jobs)
  // 3. HTTP si la impresora soporta interfaz web

  console.warn('[mobilePrint] Impresión por red TCP no implementada en móvil aún');
  return {
    success: false,
    strategy: 'network',
    error: 'Impresión por red requiere plugin TCP nativo (futuro). Use Bluetooth.',
  };
}

// ============================================================================
// Funciones de alto nivel - impresión de tickets
// ============================================================================

/**
 * Imprime un ticket de venta vía Bluetooth.
 *
 * @param deviceId ID del dispositivo Bluetooth
 * @param payload Datos del ticket
 * @param paperWidth Ancho del papel (default 80mm)
 */
export async function printSaleTicket(
  deviceId: string,
  payload: SaleTicketPrintPayload,
  paperWidth: PaperWidth = '80mm',
): Promise<PrintResult> {
  if (!isMobile()) {
    return { success: false, strategy: 'none', error: 'No es móvil' };
  }

  try {
    const data = buildSaleTicket(payload, paperWidth);
    return await printEscPosBluetooth(deviceId, data);
  } catch (err: any) {
    return {
      success: false,
      strategy: 'bluetooth',
      error: err?.message || 'Error generando ticket de venta',
    };
  }
}

/**
 * Imprime un ticket de cocina vía Bluetooth.
 */
export async function printKitchenTicket(
  deviceId: string,
  payload: KitchenTicketPrintPayload,
  paperWidth: PaperWidth = '80mm',
): Promise<PrintResult> {
  if (!isMobile()) {
    return { success: false, strategy: 'none', error: 'No es móvil' };
  }

  try {
    const data = buildKitchenTicket(payload, paperWidth);
    return await printEscPosBluetooth(deviceId, data);
  } catch (err: any) {
    return {
      success: false,
      strategy: 'bluetooth',
      error: err?.message || 'Error generando ticket de cocina',
    };
  }
}

/**
 * Imprime una pre-cuenta vía Bluetooth.
 */
export async function printPreCuenta(
  deviceId: string,
  payload: SaleTicketPrintPayload,
  paperWidth: PaperWidth = '80mm',
): Promise<PrintResult> {
  if (!isMobile()) {
    return { success: false, strategy: 'none', error: 'No es móvil' };
  }

  try {
    const data = buildPreCuenta(payload, paperWidth);
    return await printEscPosBluetooth(deviceId, data);
  } catch (err: any) {
    return {
      success: false,
      strategy: 'bluetooth',
      error: err?.message || 'Error generando pre-cuenta',
    };
  }
}

/**
 * Abre el cajón de dinero vía Bluetooth.
 */
export async function openCashDrawerBluetooth(deviceId: string): Promise<PrintResult> {
  if (!isMobile()) {
    return { success: false, strategy: 'none', error: 'No es móvil' };
  }

  try {
    const data = buildCashDrawerCommand();
    return await printEscPosBluetooth(deviceId, data);
  } catch (err: any) {
    return {
      success: false,
      strategy: 'bluetooth',
      error: err?.message || 'Error abriendo cajón',
    };
  }
}

/**
 * Imprime una página de prueba vía Bluetooth.
 */
export async function printTestPage(deviceId: string): Promise<PrintResult> {
  if (!isMobile()) {
    return { success: false, strategy: 'none', error: 'No es móvil' };
  }

  try {
    const testPayload: SaleTicketPrintPayload = {
      saleId: 'test',
      saleNumber: 'PRUEBA-001',
      title: 'PAGINA DE PRUEBA',
      createdAt: new Date().toISOString(),
      items: [
        { productName: 'Producto de prueba 1', quantity: 1, unitPrice: 1000, total: 1000 },
        { productName: 'Producto de prueba 2', quantity: 2, unitPrice: 2500, total: 5000 },
      ],
      subtotal: 6000,
      taxTotal: 0,
      total: 6000,
      businessName: 'Go Admin ERP',
      payments: [{ method: 'efectivo', amount: 6000 }],
      totalPaid: 6000,
      changeAmount: 0,
    };
    return await printSaleTicket(deviceId, testPayload);
  } catch (err: any) {
    return {
      success: false,
      strategy: 'bluetooth',
      error: err?.message || 'Error imprimiendo página de prueba',
    };
  }
}

// ============================================================================
// Utilidades
// ============================================================================

/**
 * Convierte un Uint8Array a string base64.
 * Usa btoa del navegador (disponible en WebView de Capacitor).
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
