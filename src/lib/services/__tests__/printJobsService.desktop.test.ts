/**
 * Impresión local-first en Go Admin Desktop (ROADMAP-DESKTOP §Fase 4, punto 1).
 *
 * Contrato que fijan estos tests:
 *   - Navegador: `enqueue*` inserta en `print_jobs` con `status: 'pending'`
 *     y nunca toca ningún bridge (comportamiento de siempre).
 *   - Desktop con red: imprime PRIMERO por `window.goAdminDesktop.printRaw`
 *     y registra la fila como auditoría (`status: 'printed'`, `printed_at`).
 *   - Desktop sin red: imprime igual; la cabecera del negocio y las impresoras
 *     salen de la caché local, y el registro de auditoría no bloquea aunque
 *     falle.
 *   - IPC caído: la fila cae al camino de siempre (`pending`) para que el
 *     agente la imprima; el `enqueue*` no lanza.
 *
 * Sin datos reales: organización 120, sucursal 7, impresoras inventadas.
 */

jest.mock('@/lib/supabase/config', () => ({ supabase: { from: jest.fn() } }));
jest.mock('@/lib/hooks/useOrganization', () => ({ getOrganizationId: () => 120 }));
jest.mock('../organizationTimezoneService', () => ({
  getOrganizationTimezone: jest.fn(async () => 'America/Bogota'),
}));
jest.mock('../logoRasterService', () => ({ rasterizeLogo: jest.fn() }));
jest.mock('../printService', () => ({
  PrintService: { getBusinessAndBranch: jest.fn() },
}));

jest.spyOn(console, 'warn').mockImplementation(() => {});
jest.spyOn(console, 'error').mockImplementation(() => {});

import { supabase } from '@/lib/supabase/config';
import { PrintService } from '../printService';
import { PrintersService, type Printer } from '@/components/pos/configuracion/printersService';
import { PrintJobsService } from '../printJobsService';
import { CashDrawerService } from '../cashDrawerService';
import type { GoAdminDesktopBridge } from '@/lib/utils/desktop';

// ── Entorno: window/localStorage de mentira (jest corre en `node`) ──────────

type InsertRow = Record<string, unknown>;

interface FakeDb {
  inserts: InsertRow[][];
  failNextInsert: boolean;
}

function makeLocalStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    key: (i: number) => Array.from(data.keys())[i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
  } as Storage;
}

const g = globalThis as unknown as { window?: unknown; localStorage?: Storage; navigator?: unknown };

function enterDesktop(bridge: GoAdminDesktopBridge) {
  g.window = { goAdminDesktop: bridge };
}

function enterBrowser() {
  g.window = {};
}

function leaveWindow() {
  delete g.window;
}

function makeBridge(overrides: Partial<GoAdminDesktopBridge> = {}): GoAdminDesktopBridge {
  return {
    printRaw: jest.fn(async () => ({ success: true })),
    isOnline: jest.fn(async () => true),
    status: jest.fn(async () => ({
      running: true,
      email: null,
      organizationName: null,
      branchNames: [],
      lastHeartbeatAt: null,
      jobsPrinted: 0,
      jobsFailed: 0,
    })),
    openCashDrawer: jest.fn(async () => ({ success: true })),
    ...overrides,
  };
}

function installDb(): FakeDb {
  const db: FakeDb = { inserts: [], failNextInsert: false };
  (supabase.from as jest.Mock).mockImplementation((table: string) => {
    if (table === 'print_jobs') {
      return {
        insert: jest.fn((rows: InsertRow[]) => {
          db.inserts.push(rows);
          if (db.failNextInsert) {
            db.failNextInsert = false;
            return Promise.resolve({ error: { message: 'sin red' } });
          }
          return Promise.resolve({ error: null });
        }),
      };
    }
    if (table === 'print_agents') {
      // Cadena de isAgentOnline(): nadie en línea por heartbeat.
      const chain: Record<string, jest.Mock> = {};
      for (const m of ['select', 'eq', 'order', 'limit']) chain[m] = jest.fn().mockReturnThis();
      chain.maybeSingle = jest.fn(async () => ({ data: null, error: null }));
      return chain;
    }
    throw new Error(`tabla no esperada en el test: ${table}`);
  });
  return db;
}

const impresoraCaja: Printer = {
  id: 'prn-caja-1',
  organization_id: 120,
  branch_id: 7,
  name: 'Caja principal',
  connection_type: 'usb',
  ip_address: null,
  port: null,
  vendor_id: '0x04b8',
  product_id: '0x0202',
  mac_address: null,
  driver: 'escpos',
  paper_width: '80mm',
  is_active: true,
  system_printer_name: 'POS-80C',
  notes: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const ventaBase = {
  saleId: 'sale-1',
  saleNumber: 'V-0001',
  createdAt: '2026-09-15T14:00:00Z',
  items: [{ productName: 'Café', quantity: 1, unitPrice: 3000, total: 3000 }],
  total: 3000,
  subtotal: 3000,
  taxTotal: 0,
  payments: [{ method: 'cash', amount: 3000 }],
};

const negocio = {
  business: { name: 'Una tienda de prueba', nit: '900000000-1', phone: '3000000000' },
  branch: { name: 'Sucursal 7', address: 'Calle 1', phone: null },
};

let db: FakeDb;
let getPrinters: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  g.localStorage = makeLocalStorage();
  db = installDb();
  (PrintService.getBusinessAndBranch as jest.Mock).mockResolvedValue(negocio);
  getPrinters = jest.spyOn(PrintersService, 'getPrintersByStation').mockResolvedValue([impresoraCaja]);
});

afterEach(() => {
  getPrinters.mockRestore();
  leaveWindow();
  delete g.localStorage;
});

// ── Navegador ───────────────────────────────────────────────────────────────

describe('navegador (sin bridge)', () => {
  it('encola en print_jobs como pending y no toca ningún IPC', async () => {
    enterBrowser();

    const result = await PrintJobsService.enqueueSaleTicket(7, ventaBase);

    expect(result).toEqual({ enqueued: 1, printedLocally: 0 });
    expect(db.inserts).toHaveLength(1);
    expect(db.inserts[0][0]).toMatchObject({
      organization_id: 120,
      branch_id: 7,
      printer_id: 'prn-caja-1',
      job_type: 'sale_ticket',
      status: 'pending',
    });
    expect(db.inserts[0][0].printed_at).toBeUndefined();
  });

  it('sigue lanzando si la inserción falla (contrato previo)', async () => {
    enterBrowser();
    db.failNextInsert = true;

    await expect(PrintJobsService.enqueueSaleTicket(7, ventaBase)).rejects.toEqual({ message: 'sin red' });
  });

  it('isAgentOnline consulta el heartbeat en print_agents', async () => {
    enterBrowser();
    await expect(PrintJobsService.isAgentOnline(7)).resolves.toBe(false);
    expect(supabase.from).toHaveBeenCalledWith('print_agents');
  });
});

// ── Desktop con red ─────────────────────────────────────────────────────────

describe('Desktop con internet', () => {
  it('imprime por printRaw con el sobre LocalPrintRequest y audita como printed', async () => {
    const bridge = makeBridge();
    enterDesktop(bridge);

    const result = await PrintJobsService.enqueueSaleTicket(7, ventaBase);

    expect(result).toEqual({ enqueued: 1, printedLocally: 1 });
    expect(bridge.printRaw).toHaveBeenCalledTimes(1);
    const [printerId, envelope] = (bridge.printRaw as jest.Mock).mock.calls[0];
    expect(printerId).toBe('prn-caja-1');
    expect(envelope).toMatchObject({
      jobType: 'sale_ticket',
      printer: { id: 'prn-caja-1', connection_type: 'usb', system_printer_name: 'POS-80C' },
      payload: { saleId: 'sale-1', businessName: 'Una tienda de prueba', timezone: 'America/Bogota' },
    });

    // Se espera al siguiente tick: la auditoría no bloquea la impresión.
    await new Promise((r) => setImmediate(r));
    expect(db.inserts).toHaveLength(1);
    expect(db.inserts[0][0]).toMatchObject({ status: 'printed', job_type: 'sale_ticket', printer_id: 'prn-caja-1' });
    expect(typeof db.inserts[0][0].printed_at).toBe('string');
  });

  it('guarda la cabecera del negocio en la caché local para usarla sin red', async () => {
    enterDesktop(makeBridge());

    await PrintJobsService.enqueueSaleTicket(7, ventaBase);

    const raw = g.localStorage!.getItem('goadmin:desktop-cache:print-business-header:120');
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string).value).toMatchObject({ businessName: 'Una tienda de prueba', branchName: 'Sucursal 7' });
  });

  it('isAgentOnline devuelve true por el agente embebido sin consultar print_agents', async () => {
    enterDesktop(makeBridge());
    await expect(PrintJobsService.isAgentOnline(7)).resolves.toBe(true);
    expect(supabase.from).not.toHaveBeenCalledWith('print_agents');
  });

  it('el cajón sale por la impresora cashier configurada vía printRaw, no por la default', async () => {
    const bridge = makeBridge();
    enterDesktop(bridge);

    const result = await CashDrawerService.open(7);

    expect(result).toEqual({ success: true, strategy: 'desktop_ipc' });
    expect(bridge.printRaw).toHaveBeenCalledTimes(1);
    expect((bridge.printRaw as jest.Mock).mock.calls[0][1]).toMatchObject({ jobType: 'open_cash_drawer', printer: { id: 'prn-caja-1' } });
    expect(bridge.openCashDrawer).not.toHaveBeenCalled();
  });
});

// ── Desktop sin red ─────────────────────────────────────────────────────────

describe('Desktop sin internet', () => {
  it('imprime con la cabecera cacheada sin consultar Supabase y no bloquea si la auditoría falla', async () => {
    // Primera venta con red: llena la caché.
    enterDesktop(makeBridge());
    await PrintJobsService.enqueueSaleTicket(7, ventaBase);
    await new Promise((r) => setImmediate(r));
    expect(PrintService.getBusinessAndBranch).toHaveBeenCalledTimes(1);

    // Se cae la red: el Desktop lo informa por isOnline().
    const bridge = makeBridge({ isOnline: jest.fn(async () => false) });
    enterDesktop(bridge);
    db.failNextInsert = true;

    const result = await PrintJobsService.enqueueSaleTicket(7, { ...ventaBase, saleId: 'sale-2', saleNumber: 'V-0002' });

    expect(result).toEqual({ enqueued: 1, printedLocally: 1 });
    expect(PrintService.getBusinessAndBranch).toHaveBeenCalledTimes(1); // no se volvió a consultar
    const envelope = (bridge.printRaw as jest.Mock).mock.calls[0][1];
    expect(envelope.payload).toMatchObject({ saleId: 'sale-2', businessName: 'Una tienda de prueba', businessNit: '900000000-1' });
    await new Promise((r) => setImmediate(r));
    expect(db.inserts).toHaveLength(2); // el intento de auditoría se hizo, y su fallo no rompió nada
  });

  it('las impresoras por estación salen de la caché de la sucursal cuando el Desktop está offline', async () => {
    getPrinters.mockRestore();
    const fetchReal = jest
      .spyOn(PrintersService as unknown as { fetchPrintersByStation: () => Promise<Printer[]> }, 'fetchPrintersByStation')
      .mockResolvedValue([impresoraCaja]);

    enterDesktop(makeBridge());
    await expect(PrintersService.getPrintersByStation(7, 'cashier')).resolves.toEqual([impresoraCaja]);
    expect(fetchReal).toHaveBeenCalledTimes(1);

    enterDesktop(makeBridge({ isOnline: jest.fn(async () => false) }));
    await expect(PrintersService.getPrintersByStation(7, 'cashier')).resolves.toEqual([impresoraCaja]);
    expect(fetchReal).toHaveBeenCalledTimes(1); // servido de caché

    // Con red "aparente" pero Supabase caído: también cae a la caché.
    enterDesktop(makeBridge());
    fetchReal.mockRejectedValueOnce(new Error('fetch failed'));
    await expect(PrintersService.getPrintersByStation(7, 'cashier')).resolves.toEqual([impresoraCaja]);

    // Otra sucursal/estación no hereda la caché.
    fetchReal.mockResolvedValueOnce([]);
    await expect(PrintersService.getPrintersByStation(8, 'cashier')).resolves.toEqual([]);
    fetchReal.mockRestore();
  });

  it('en el navegador la caché de impresoras no se usa nunca', async () => {
    getPrinters.mockRestore();
    const fetchReal = jest
      .spyOn(PrintersService as unknown as { fetchPrintersByStation: () => Promise<Printer[]> }, 'fetchPrintersByStation')
      .mockRejectedValue(new Error('fetch failed'));
    enterBrowser();
    await expect(PrintersService.getPrintersByStation(7, 'cashier')).rejects.toThrow('fetch failed');
    expect(g.localStorage!.length).toBe(0);
    fetchReal.mockRestore();
  });
});

// ── IPC caído ───────────────────────────────────────────────────────────────

describe('Desktop con el agente local caído', () => {
  it('printRaw devuelve success:false → la fila cae a pending para el agente y no se lanza', async () => {
    const bridge = makeBridge({ printRaw: jest.fn(async () => ({ success: false, error: 'ECONNREFUSED' })) });
    enterDesktop(bridge);

    const result = await PrintJobsService.enqueueSaleTicket(7, ventaBase);

    expect(result).toEqual({ enqueued: 1, printedLocally: 0 });
    expect(db.inserts).toHaveLength(1);
    expect(db.inserts[0][0]).toMatchObject({ status: 'pending', printer_id: 'prn-caja-1' });
    expect(db.inserts[0][0].printed_at).toBeUndefined();
  });

  it('printRaw lanza → mismo fallback a pending', async () => {
    const bridge = makeBridge({ printRaw: jest.fn(async () => { throw new Error('IPC roto'); }) });
    enterDesktop(bridge);

    const result = await PrintJobsService.enqueueSaleTicket(7, ventaBase);

    expect(result).toEqual({ enqueued: 1, printedLocally: 0 });
    expect(db.inserts[0][0]).toMatchObject({ status: 'pending' });
  });

  it('Desktop antiguo sin printRaw se comporta como el navegador', async () => {
    const bridge = makeBridge({ printRaw: undefined });
    enterDesktop(bridge);

    const result = await PrintJobsService.enqueueSaleTicket(7, ventaBase);

    expect(result).toEqual({ enqueued: 1, printedLocally: 0 });
    expect(db.inserts[0][0]).toMatchObject({ status: 'pending' });
  });

  it('con varias impresoras, cada fila decide por separado', async () => {
    const impresora2: Printer = { ...impresoraCaja, id: 'prn-caja-2', name: 'Caja 2', connection_type: 'network', ip_address: '192.168.0.50', port: 9100 };
    getPrinters.mockResolvedValue([impresoraCaja, impresora2]);
    const bridge = makeBridge({
      printRaw: jest.fn(async (printerId: string) => (printerId === 'prn-caja-1' ? { success: true } : { success: false, error: 'timeout' })),
    });
    enterDesktop(bridge);

    const result = await PrintJobsService.enqueueSaleTicket(7, ventaBase);

    expect(result).toEqual({ enqueued: 2, printedLocally: 1 });
    await new Promise((r) => setImmediate(r));
    const filas = db.inserts[0];
    expect(filas.find((f) => f.printer_id === 'prn-caja-1')).toMatchObject({ status: 'printed' });
    expect(filas.find((f) => f.printer_id === 'prn-caja-2')).toMatchObject({ status: 'pending' });
  });

  it('el cajón no encola dos open_cash_drawer: el pending de 1a cubre el fallback 3', async () => {
    const bridge = makeBridge({ printRaw: jest.fn(async () => ({ success: false, error: 'ECONNREFUSED' })) });
    bridge.openCashDrawer = jest.fn(async () => ({ success: false, error: 'ECONNREFUSED' }));
    enterDesktop(bridge);

    const result = await CashDrawerService.open(7);

    expect(result).toEqual({ success: true, strategy: 'print_job' });
    expect(bridge.openCashDrawer).toHaveBeenCalledTimes(1);
    expect(db.inserts).toHaveLength(1);
    expect(db.inserts[0]).toHaveLength(1);
    expect(db.inserts[0][0]).toMatchObject({ job_type: 'open_cash_drawer', status: 'pending' });
  });

  it('comanda de cocina: la estación sin impresora se omite y las demás caen a pending', async () => {
    getPrinters.mockImplementation(async (_branchId: number, station: string) =>
      station === 'hot_kitchen' ? [{ ...impresoraCaja, id: 'prn-cocina', name: 'Cocina' }] : [],
    );
    const bridge = makeBridge({ printRaw: jest.fn(async () => ({ success: false, error: 'caído' })) });
    enterDesktop(bridge);

    const result = await PrintJobsService.enqueueKitchenTicket(7, {
      ticketId: 55,
      createdAt: '2026-09-15T14:00:00Z',
      items: [
        { productName: 'Sopa', quantity: 1, station: 'hot_kitchen' },
        { productName: 'Ensalada', quantity: 1, station: 'cold_kitchen' },
      ],
    });

    expect(result).toEqual({ enqueued: 1, printedLocally: 0, skippedStations: ['cold_kitchen'] });
    expect(db.inserts[0][0]).toMatchObject({ job_type: 'kitchen_ticket', station: 'hot_kitchen', status: 'pending' });
  });
});
