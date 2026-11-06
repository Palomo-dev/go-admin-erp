const DIA = /^\d{4}-\d{2}-\d{2}$/;

function diaValido(valor: string): boolean {
  if (!DIA.test(valor)) return false;
  const [a, m, d] = valor.split('-').map(Number);
  const fecha = new Date(Date.UTC(a, m - 1, d));
  return fecha.getUTCFullYear() === a && fecha.getUTCMonth() === m - 1 && fecha.getUTCDate() === d;
}

/** Días calendario `AAAA-MM-DD`, en orden; `null` si el periodo no sirve. */
export function rangoDe(desde: string | null, hasta: string | null): { desde: string; hasta: string } | null {
  if (!desde || !hasta || !diaValido(desde) || !diaValido(hasta) || desde > hasta) return null;
  return { desde, hasta };
}
