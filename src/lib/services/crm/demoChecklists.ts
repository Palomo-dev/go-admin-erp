/**
 * F10 — checklist de demo por vertical (puro). Va a `demo_sessions.checklist`
 * (jsonb `[{label, done}]`). Método: demo guiada de 25–40 min (punto 8).
 */

export interface ChecklistItem {
  label: string;
  done: boolean;
}

const COMMON_OPEN: string[] = [
  'Confirmar asistentes y quién decide',
  'Recordar el problema principal del discovery en la primera frase',
];

const COMMON_CLOSE: string[] = [
  'Mostrar el reporte que el cliente miraría cada lunes',
  'Acordar el siguiente paso con fecha (propuesta el mismo día)',
];

const BY_VERTICAL: Record<string, string[]> = {
  restaurantes: ['Toma de pedido y cocina (comanda)', 'Inventario de insumos y merma', 'Cierre de caja del día'],
  retail: ['Venta rápida en POS con código de barras', 'Stock por sucursal y quiebres', 'Promociones y fidelización'],
  hoteleria: ['Reserva, check-in y folio', 'Tarifas y disponibilidad', 'Facturación de la estancia'],
  servicios: ['Cotización y contrato', 'Horas y facturación recurrente', 'Cartera y recordatorios de cobro'],
  salud: ['Agenda y recordatorios al paciente', 'Historia y facturación de la cita', 'Reporte de ausentismo'],
  educacion: ['Matrícula y grupos', 'Cobro de mensualidades y mora', 'Comunicación con acudientes'],
  saas: ['Pipeline y actividades del equipo', 'Secuencias y automatizaciones', 'Panel de ingresos'],
  otros: ['Flujo principal del negocio de punta a punta', 'Un reporte clave', 'Usuarios y permisos'],
};

export function buildDemoChecklist(verticalSlug: string | null | undefined): ChecklistItem[] {
  const slug = (verticalSlug ?? '').toLowerCase();
  const specific = BY_VERTICAL[slug] ?? BY_VERTICAL.otros;
  return [...COMMON_OPEN, ...specific, ...COMMON_CLOSE].map((label) => ({ label, done: false }));
}

/** Sanea un checklist que viene del cliente: solo `{label:string, done:boolean}`, acotado. */
export function sanitizeChecklist(raw: unknown): ChecklistItem[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length > 50) return null;
  const out: ChecklistItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const r = item as Record<string, unknown>;
    if (typeof r.label !== 'string' || typeof r.done !== 'boolean') return null;
    const label = r.label.trim();
    if (!label || label.length > 200) return null;
    out.push({ label, done: r.done });
  }
  return out;
}

export function checklistProgress(items: ChecklistItem[]): { done: number; total: number; percent: number } {
  const total = items.length;
  const done = items.filter((i) => i.done).length;
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0 };
}
