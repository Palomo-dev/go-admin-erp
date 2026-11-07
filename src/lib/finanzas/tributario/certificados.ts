/**
 * Certificados de retención por tercero y periodo (Figma 2335:138003).
 * Todo existe ya: las retenciones salen de `fn_reporte_retenciones_practicadas`
 * (el mismo cálculo del reporte de Reportes) y los certificados expedidos de
 * `withholding_certificates` (serie CR, `fn_certificado_retenciones_expedir`).
 * Aquí se cruzan para saber el estado de cada tercero. Sin React ni Supabase.
 */

export type EstadoCertificado = 'expedido' | 'desactualizado' | 'sin_expedir' | 'falta_tercero';

export interface FilaRetencionTercero {
  proveedorId: number;
  proveedor: string | null;
  nit: string | null;
  facturas: number;
  retefuente: number;
  reteiva: number;
  reteica: number;
  retenido: number;
}

export interface CertificadoGuardado {
  id: string;
  proveedorId: number;
  numero: string;
  desde: string;
  hasta: string;
  totalRetenido: number;
  expedidoEn: string | null;
}

export interface FilaCertificado extends FilaRetencionTercero {
  estado: EstadoCertificado;
  certificado: CertificadoGuardado | null;
}

export interface ResumenCertificados {
  terceros: number;
  retenido: number;
  expedidos: number;
  pendientes: number;
  faltaTercero: number;
}

const n = (v: unknown) => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};

/** `por_proveedor` del jsonb del reporte → filas. */
export function leerRetencionesPorTercero(data: unknown): FilaRetencionTercero[] {
  const d = (data && typeof data === 'object' ? data : {}) as { por_proveedor?: unknown };
  const lista = Array.isArray(d.por_proveedor) ? d.por_proveedor : [];
  return lista
    .map((x) => (x && typeof x === 'object' ? (x as Record<string, unknown>) : null))
    .filter((x): x is Record<string, unknown> => x !== null && Number.isInteger(Number(x.proveedor_id)))
    .map((x) => ({
      proveedorId: Number(x.proveedor_id),
      proveedor: typeof x.proveedor === 'string' ? x.proveedor : null,
      nit: typeof x.nit === 'string' && x.nit.trim() ? x.nit.trim() : null,
      facturas: n(x.facturas),
      retefuente: n(x.retefuente),
      reteiva: n(x.reteiva),
      reteica: n(x.reteica),
      retenido: n(x.retenido),
    }));
}

/** El NIT sirve para el certificado si tiene al menos un dígito. */
export function tieneNit(nit: string | null): boolean {
  return !!nit && /\d/.test(nit);
}

/**
 * Estado de cada tercero en el periodo. Un certificado del mismo tercero y del
 * mismo periodo cuenta como expedido; si lo retenido cambió desde entonces, está
 * «desactualizado» (se reexpide con número nuevo: la RPC lo decide).
 */
export function cruzarCertificados(
  filas: readonly FilaRetencionTercero[],
  certificados: readonly CertificadoGuardado[],
  periodo: { desde: string; hasta: string },
): FilaCertificado[] {
  return filas.map((f) => {
    const delTercero = certificados
      .filter((c) => c.proveedorId === f.proveedorId && c.desde === periodo.desde && c.hasta === periodo.hasta)
      .sort((a, b) => (b.expedidoEn ?? '').localeCompare(a.expedidoEn ?? ''));
    const ultimo = delTercero[0] ?? null;
    let estado: EstadoCertificado;
    if (!tieneNit(f.nit)) estado = 'falta_tercero';
    else if (!ultimo) estado = 'sin_expedir';
    else estado = Math.abs(ultimo.totalRetenido - f.retenido) < 0.5 ? 'expedido' : 'desactualizado';
    return { ...f, estado, certificado: ultimo };
  });
}

export function resumirCertificados(filas: readonly FilaCertificado[]): ResumenCertificados {
  return {
    terceros: filas.length,
    retenido: filas.reduce((s, f) => s + f.retenido, 0),
    expedidos: filas.filter((f) => f.estado === 'expedido').length,
    pendientes: filas.filter((f) => f.estado === 'sin_expedir' || f.estado === 'desactualizado').length,
    faltaTercero: filas.filter((f) => f.estado === 'falta_tercero').length,
  };
}

/** Terceros a los que «Expedir certificados» les expide: con NIT y sin certificado al día. */
export function porExpedir(filas: readonly FilaCertificado[]): FilaCertificado[] {
  return filas.filter((f) => f.estado === 'sin_expedir' || f.estado === 'desactualizado');
}

/** Búsqueda por nombre o NIT (sin tildes ni mayúsculas). */
export function filtrarCertificados(filas: readonly FilaCertificado[], q: string): FilaCertificado[] {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const t = norm(q.trim());
  if (!t) return [...filas];
  const digitos = t.replace(/\D/g, '');
  return filas.filter(
    (f) =>
      norm(f.proveedor ?? '').includes(t) ||
      norm(f.nit ?? '').includes(t) ||
      (digitos.length > 0 && (f.nit ?? '').replace(/\D/g, '').includes(digitos)),
  );
}
