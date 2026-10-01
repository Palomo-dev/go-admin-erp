export interface CifrasSegmento {
  total: number;
  base: number;
  with_phone: number;
  with_email: number;
  whatsapp_opt_in: number;
  rne_excluded: number;
  voice_contactable: number;
  email_contactable: number;
  whatsapp_contactable: number;
}

export function cifrasSegmentoVacias(): CifrasSegmento {
  return {
    total: 0,
    base: 0,
    with_phone: 0,
    with_email: 0,
    whatsapp_opt_in: 0,
    rne_excluded: 0,
    voice_contactable: 0,
    email_contactable: 0,
    whatsapp_contactable: 0,
  };
}
export function sumarCifrasSegmento(
  a: CifrasSegmento,
  b: CifrasSegmento,
): CifrasSegmento {
  const result = { ...a };
  for (const key of Object.keys(result) as Array<keyof CifrasSegmento>)
    result[key] += b[key];
  return result;
}
