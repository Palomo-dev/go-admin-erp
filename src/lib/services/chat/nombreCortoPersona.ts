/**
 * «Laura Restrepo» → «Laura R.»: cómo el Chat nombra a una persona del equipo
 * en espacios cortos (quién atiende una visita del widget, quién editó un
 * fragmento). Sin nombre ni apellido, `null`: la pantalla no inventa uno.
 */
export function nombreCorto(nombre: string | null | undefined, apellido: string | null | undefined): string | null {
  const n = (nombre ?? '').trim();
  const a = (apellido ?? '').trim();
  if (!n && !a) return null;
  return a ? `${n} ${a.charAt(0).toUpperCase()}.`.trim() : n;
}
