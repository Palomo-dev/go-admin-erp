/**
 * Lecturas y escrituras de la parte «personas» de RR. HH. desde el navegador,
 * SIEMPRE por las rutas del servidor (`/api/hrm/**`). La organización sale de
 * la sesión (cookie), nunca del body. Los grupos sensibles (identificación,
 * salario, banco) solo se piden por sus rutas, que dejan el registro de accesos.
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AlertaEmpleado, EmpleadoFila } from '@/lib/hrm/personas/logica';

export class ErrorPersonas extends Error {
  constructor(
    public readonly status: number,
    public readonly codigo: string
  ) {
    super(codigo);
  }
}

export async function pedir<T>(url: string, init?: { metodo?: 'GET' | 'POST' | 'PUT' | 'PATCH'; cuerpo?: unknown }): Promise<T> {
  const r = await fetch(url, {
    method: init?.metodo ?? 'GET',
    headers: init?.cuerpo === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: init?.cuerpo === undefined ? undefined : JSON.stringify(init.cuerpo),
    cache: 'no-store',
  });
  const datos = (await r.json().catch(() => null)) as (T & { code?: string; persona_id?: string }) | null;
  if (!r.ok) throw new ErrorPersonas(r.status, datos?.code ?? 'error_hrm');
  return datos as T;
}

export type Carga<T> =
  | { estado: 'cargando' }
  | { estado: 'error'; codigo: string }
  | { estado: 'sinPermiso' }
  | { estado: 'noExiste' }
  | { estado: 'listo'; datos: T };

/** Carga con reintento: 403 es «sin permiso» y 404 «no existe», no «error». */
export function useCarga<T>(url: string | null): { carga: Carga<T>; recargar: () => Promise<void> } {
  const [carga, setCarga] = useState<Carga<T>>({ estado: 'cargando' });
  const actual = useRef(url);
  actual.current = url;
  const recargar = useCallback(async () => {
    if (!url) return;
    try {
      const datos = await pedir<T>(url);
      if (actual.current === url) setCarga({ estado: 'listo', datos });
    } catch (e) {
      if (actual.current !== url) return;
      if (e instanceof ErrorPersonas && e.status === 403) setCarga({ estado: 'sinPermiso' });
      else if (e instanceof ErrorPersonas && e.status === 404) setCarga({ estado: 'noExiste' });
      else setCarga({ estado: 'error', codigo: e instanceof ErrorPersonas ? e.codigo : 'error_hrm' });
    }
  }, [url]);
  useEffect(() => {
    setCarga((c) => (c.estado === 'listo' ? c : { estado: 'cargando' }));
    void recargar();
  }, [recargar]);
  return { carga, recargar };
}

/* ── Tipos de las respuestas ─────────────────────────────────────────────── */

export interface ListaEmpleados {
  hoy: string;
  dias_aviso: number;
  alcance: 'organizacion' | 'equipo';
  empleados: EmpleadoFila[];
}

export interface PermisosFicha {
  grupos: Record<'identificacion' | 'salario_pago' | 'banco' | 'salud' | 'disciplinario' | 'sst', { ver: boolean; editar: boolean }>;
  editar_basico: boolean;
  crear: boolean;
  registrar_cambio: boolean;
  ver_contactos: boolean;
  ver_registro: boolean;
  es_propio: boolean | null;
}

export interface EventoFicha {
  id: string;
  campo: string;
  desde: string;
  anterior: unknown;
  nuevo: unknown;
  anterior_nombre: string | null;
  nuevo_nombre: string | null;
  motivo: string;
  estado: 'pendiente' | 'aprobado' | 'rechazado' | 'anulado';
  source: string;
  programado: boolean;
  registro: string | null;
  creado: string;
  aprobo: string | null;
  aprobado_en: string | null;
  instancia_id: string | null;
  nota: string | null;
  espera: string[] | null;
  rechazo: { por: string | null; en: string; comentario: string | null } | null;
}

export interface Ficha {
  hoy: string;
  dias_aviso: number;
  persona: {
    id: string;
    nombre: string;
    first_name: string;
    second_name: string | null;
    last_name: string | null;
    second_last_name: string | null;
    preferred_name: string | null;
    work_email: string | null;
    work_phone: string | null;
    tiene_usuario: boolean;
    invitacion_pendiente: boolean;
    actualizado: string | null;
    actualizado_por: string | null;
  };
  vinculo: {
    id: string;
    estado: EmpleadoFila['estado'];
    cargo_id: string | null;
    cargo: string | null;
    area_id: string | null;
    area: string | null;
    sede_id: number | null;
    sede: string | null;
    centro_costo_id: string | null;
    jefe_id: string | null;
    tipo_contrato: string | null;
    fin_contrato: string | null;
    tipo_vinculacion: string | null;
    ingreso: string;
    fin_prueba: string | null;
    retiro: string | null;
    motivo_retiro: string | null;
    jornada: number | null;
    periodo_salario: string | null;
    clase_arl: number | null;
  } | null;
  jefe: { persona_id: string | null; vinculo_id: string; nombre: string | null; cargo: string | null; sede: string | null } | null;
  laboral: { campo: string; valor: unknown; nombre: string | null; desde: string; motivo: string | null; source: string | null; aprobo: string | null }[];
  afiliaciones: { subsistema: string; entidad_id: string | null; entidad: string | null; desde: string | null; pendiente: boolean }[];
  historial: EventoFicha[];
  alertas: AlertaEmpleado[];
  expediente: { exigidos: string[]; subidos: string[] } | null;
  documentos_total: number;
  certificaciones: {
    id: string;
    nombre: string;
    entidad: string | null;
    expedicion: string | null;
    vence: string | null;
    documento_id: string | null;
    documento_nombre: string | null;
  }[];
  permisos: PermisosFicha;
}

export interface Catalogos {
  sedes: { id: number; name: string; is_main: boolean | null }[];
  areas: { id: string; name: string; parent_id: string | null; manager_employment_id: string | null; cost_center: string | null }[];
  cargos: { id: string; name: string; department_id: string | null }[];
  centros_costo: { id: string; code: string; name: string; branch_id: number | null }[];
  jefes: { id: string; persona_id: string | null; cargo_id: string | null; sede_id: number | null; nombre: string }[];
  entidades: { id: string; subsystem: string; name: string }[];
}

export interface DocumentoPersona {
  id: string;
  grupo: string;
  categoria: string;
  nombre?: string;
  tipo?: string;
  tamano?: number;
  vence?: string | null;
  creado?: string;
  subio?: string | null;
  restringido: boolean;
}

/* ── Acciones ─────────────────────────────────────────────────────────────── */

const persona = (id: string) => `/api/hrm/personas/${encodeURIComponent(id)}`;

export function invitarAlPortal(personaIds: string[]) {
  return pedir<{ enviadas: number; resultados: { persona_id: string; resultado: string }[] }>('/api/hrm/empleados/invitar', {
    metodo: 'POST',
    cuerpo: { persona_ids: personaIds, origin: window.location.origin },
  });
}

export function guardarIdentificacion(personaId: string, cuerpo: Record<string, unknown>) {
  return pedir<{ ok: boolean }>(`${persona(personaId)}/datos/identificacion`, { metodo: 'PUT', cuerpo });
}

export function guardarBasico(personaId: string, cuerpo: Record<string, unknown>) {
  return pedir<{ ok: boolean }>(`${persona(personaId)}/basico`, { metodo: 'PATCH', cuerpo });
}

export function urlDocumento(documentoId: string) {
  return pedir<{ url: string }>(`/api/hrm/documentos/${encodeURIComponent(documentoId)}`);
}

async function sha256(archivo: File): Promise<string | null> {
  try {
    const buf = await archivo.arrayBuffer();
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

/** Sube un archivo al bucket privado con URL firmada y registra sus metadatos. */
export async function subirDocumento(
  personaId: string,
  archivo: File,
  categoria: string,
  opciones: { venceEl?: string | null; vinculoId?: string | null } = {}
): Promise<{ id: string }> {
  const subida = await pedir<{ ruta: string; urlFirmada: string }>(`${persona(personaId)}/documentos`, {
    metodo: 'POST',
    cuerpo: { accion: 'subida', categoria, tipo: archivo.type, tamano: archivo.size },
  });
  const put = await fetch(subida.urlFirmada, {
    method: 'PUT',
    headers: { 'Content-Type': archivo.type, 'x-upsert': 'false' },
    body: archivo,
  });
  if (!put.ok) throw new ErrorPersonas(put.status, 'error_almacenamiento');
  return pedir<{ id: string }>(`${persona(personaId)}/documentos`, {
    metodo: 'POST',
    cuerpo: {
      accion: 'registrar',
      categoria,
      ruta: subida.ruta,
      nombre: archivo.name,
      tipo: archivo.type,
      tamano: archivo.size,
      sha256: await sha256(archivo),
      vence_el: opciones.venceEl ?? null,
      vinculo_id: opciones.vinculoId ?? null,
    },
  });
}

export function registrarCambios(
  vinculoId: string,
  cuerpo: { efectivo_desde: string; cambios: { campo: string; valor: unknown }[]; motivo: string; nota?: string | null; soporte_documento_id?: string | null }
) {
  return pedir<{ ids: string[]; status: 'pendiente' | 'aprobado'; approval_instance_id: string | null }>(
    `/api/hrm/vinculos/${encodeURIComponent(vinculoId)}/cambios`,
    { metodo: 'POST', cuerpo }
  );
}

export function consultarPeriodo(vinculoId: string, fecha: string) {
  return pedir<{ cerrado: boolean; primera_fecha_libre?: string | null; nombre?: string | null }>(
    `/api/hrm/vinculos/${encodeURIComponent(vinculoId)}/cambios?fecha=${encodeURIComponent(fecha)}`
  );
}

export function decidirAprobacion(instanciaId: string, accion: 'aprobar' | 'rechazar' | 'cancelar', comentario?: string | null) {
  return pedir<{ id: string; status: string }>(`/api/hrm/aprobaciones/${encodeURIComponent(instanciaId)}`, {
    metodo: 'POST',
    cuerpo: { accion, comentario: comentario ?? null },
  });
}
