/**
 * «Ver la ruta de» — el supervisor de despacho mira la ruta de un domiciliario desde Mis envíos
 * (Figma «21 Logística» c 3216-110925 y celular «20/21»). Puro.
 *
 * Decisiones del dueño (2026-11-25): el supervisor NO entrega ni cobra (el código lo tiene el
 * domiciliario); puede Reasignar (la MISMA hoja «Asignar domiciliario» de la oficina, con la RPC de
 * asignación, la revisión de documentos de la Fase 1b y la excepción con PIN) y registrar Novedad.
 * El orden de la ruta se calcula igual que para el domiciliario; no se arrastra.
 *
 * Quién es supervisor lo decide el servidor con `fn_logistica_gestiona` (permiso `logistica.manage`).
 */
import { cargaDelDia, estadoDomiciliario, nombreDomiciliario, type EnvioDeCarga, type EstadoDomiciliario } from './domiciliarios';
import { peorVigencia, vigenciaDocumento, type VigenciaDocumento } from './misEnvios';
import { puedeAsignarse } from './estadosEnvio';
import type { EnvioApp } from '@/lib/services/logistica/misEnviosService';
import { aFilaDespacho, type EnvioCrudo } from '@/lib/services/logistica/despachoService';
import type { FilaDespacho } from './despacho';

export interface DomiciliarioParaSelector {
  id: string;
  full_name?: string | null;
  phone?: string | null;
  is_active?: boolean | null;
  branch_id?: number | null;
  vehicle_type?: string | null;
  default_vehicle_id?: string | null;
  license_category?: string | null;
  license_expiry?: string | null;
  metadata?: Record<string, unknown> | null;
  employee?: { first_name?: string | null; last_name?: string | null; phone?: string | null } | null;
  vehiculo?: { id: string; plate: string | null; vehicle_type: string; ownership?: string | null; soat_expiry?: string | null; techno_expiry?: string | null } | null;
}

export interface OpcionRutaDe {
  id: string;
  nombre: string;
  /** «Jhon R.» para el chip. */
  corto: string;
  telefono: string | null;
  estado: EstadoDomiciliario;
  /** Paradas del día (pendientes + entregadas hoy) y cuántas lleva entregadas. */
  paradas: number;
  entregados: number;
  placa: string | null;
  tipo: string | null;
  /** El peor documento del vehículo por defecto o de la licencia (SOAT vencido, etc.). */
  documento: (VigenciaDocumento & { clave: 'soat' | 'tecnomecanica' | 'licencia' }) | null;
}

/** «Jhon Ramírez» → «Jhon R.» */
export function nombreCorto(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length < 2) return partes[0] ?? '';
  return `${partes[0]} ${partes[1].charAt(0).toUpperCase()}.`;
}

/**
 * Opciones del selector «Ver la ruta de»: los domiciliarios activos con su carga del día, en
 * ruta primero y luego por más paradas. El documento que se marca es el peor (vencido antes que
 * por vencer) del vehículo por defecto y la licencia, con el mismo plazo de aviso que la base.
 */
export function opcionesRutaDe(
  domiciliarios: readonly DomiciliarioParaSelector[],
  envios: ReadonlyArray<EnvioDeCarga & { driver_id: string }>,
  hoy: string,
  zona: string,
): OpcionRutaDe[] {
  const porDriver = new Map<string, Array<EnvioDeCarga & { driver_id: string }>>();
  for (const e of envios) porDriver.set(e.driver_id, [...(porDriver.get(e.driver_id) ?? []), e]);
  const peso: Record<EstadoDomiciliario, number> = { en_ruta: 0, libre: 1, fuera_de_turno: 2, inactivo: 3 };
  return domiciliarios
    .filter((d) => d.is_active !== false)
    .map((d) => {
      const carga = cargaDelDia(porDriver.get(d.id) ?? [], hoy, zona);
      const nombre = nombreDomiciliario(d) || d.id.slice(0, 8);
      const v = d.vehiculo ?? null;
      const docs: Array<VigenciaDocumento & { clave: 'soat' | 'tecnomecanica' | 'licencia' }> = [];
      if (v && v.ownership !== 'third_party' && v.vehicle_type !== 'bicycle') {
        docs.push({ ...vigenciaDocumento(v.soat_expiry, hoy), clave: 'soat' }, { ...vigenciaDocumento(v.techno_expiry, hoy), clave: 'tecnomecanica' });
      }
      if (d.license_expiry) docs.push({ ...vigenciaDocumento(d.license_expiry, hoy), clave: 'licencia' });
      const peor = peorVigencia(docs);
      const documento = peor && (peor.estado === 'vencido' || peor.estado === 'por_vencer') ? docs.find((x) => x.estado === peor.estado && x.dias === peor.dias) ?? null : null;
      return {
        id: d.id,
        nombre,
        corto: nombreCorto(nombre),
        telefono: d.phone ?? d.employee?.phone ?? null,
        estado: estadoDomiciliario(d, carga, hoy, zona),
        paradas: carga.asignados + carga.entregadosHoy,
        entregados: carga.entregadosHoy,
        placa: v?.plate ?? null,
        tipo: v?.vehicle_type ?? d.vehicle_type ?? null,
        documento,
      };
    })
    .sort((a, b) => peso[a.estado] - peso[b.estado] || b.paradas - a.paradas || a.nombre.localeCompare(b.nombre));
}

/** ¿Se puede reasignar esta parada? La misma regla que la base (`ESTADO_NO_ASIGNABLE`). */
export function puedeReasignar(e: Pick<EnvioApp, 'status'>): boolean {
  return puedeAsignarse(String(e.status));
}

/**
 * La parada como fila de la bandeja para abrir la MISMA hoja «Asignar domiciliario» de Por
 * despachar (con su vehículo preseleccionado y la revisión de documentos de la Fase 1b).
 */
export function filaDespachoDeParada(e: EnvioApp, nombreDomiciliario: string | null): FilaDespacho {
  const crudo = {
    tracking_number: null,
    fulfillment_mode: (e as { fulfillment_mode?: string | null }).fulfillment_mode ?? 'own',
    delivery_department: null,
    declared_value: null,
    total_cost: null,
    currency: null,
    exception_detail: null,
    carrier_id: null,
    vehicle_id: null,
    metadata: null,
    ...e,
    created_at: e.created_at ?? '',
    updated_at: e.updated_at ?? null,
    source_type: e.source_type ?? '',
    status: String(e.status),
    driver: e.driver_id ? { id: e.driver_id, full_name: nombreDomiciliario, phone: null } : null,
  } as unknown as EnvioCrudo;
  return { ...aFilaDespacho(crudo, null), promesa: e.promesa ?? null };
}
