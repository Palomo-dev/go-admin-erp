const DOC_CORTO: Record<string, string> = { cc: 'CC', nit: 'NIT', ce: 'CE', passport: 'PP', ti: 'TI', pep: 'PEP' };

/** «NIT 900.123.456-7», «CC 1.020.304.050». */
export function documentoTexto(tipo: string | null | undefined, numero: string | null | undefined, dv?: string | number | null): string | null {
  const n = (numero ?? '').trim();
  if (!n) return null;
  const miles = /^\d+$/.test(n) ? Number(n).toLocaleString('es-CO') : n;
  const t = DOC_CORTO[(tipo ?? '').toLowerCase()] ?? (tipo ? tipo.toUpperCase() : '');
  const d = dv !== null && dv !== undefined && String(dv).trim() !== '' ? `-${dv}` : '';
  return `${t ? `${t} ` : ''}${miles}${d}`;
}
