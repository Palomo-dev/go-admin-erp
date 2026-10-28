/**
 * Columnas nuevas cuya migración puede no estar aplicada todavía. Si PostgREST responde que no
 * existe (PGRST204 / 42703), el guardado se repite sin ellas: el resto de cambios no se pierde.
 */
export const COLUMNAS_OPCIONALES_AJUSTES = ['countdown_style'] as const;

export function quitarColumnasOpcionalesAusentes(
  cambios: Record<string, unknown>,
  error: { code?: string; message?: string } | null,
): Record<string, unknown> | null {
  if (!error) return null;
  const msg = String(error.message ?? '');
  const faltan = COLUMNAS_OPCIONALES_AJUSTES.filter(
    (c) => c in cambios && (error.code === 'PGRST204' || error.code === '42703') && msg.includes(c),
  );
  if (faltan.length === 0) return null;
  const resto = { ...cambios };
  for (const c of faltan) delete resto[c];
  return resto;
}
