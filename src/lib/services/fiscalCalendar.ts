// ============================================================
// Aritmética de día calendario para períodos contables y fiscales.
//
// Fase B, tanda 1. Estas funciones NO reciben zona horaria a propósito: el
// primer y el último día de un mes son los mismos en Bogotá, en Madrid y en
// Kiritimati. Lo que no da igual es CÓMO se calculan.
//
// Lo que había antes, y por qué estaba mal:
//
//     const start = new Date(year, i, 1);              // medianoche LOCAL
//     start.toISOString().split('T')[0]                // día en UTC
//
// `new Date(2026, 0, 1)` es medianoche del navegador. En Madrid (UTC+1) ese
// instante es `2025-12-31T23:00:00Z`, así que el período de enero se guardaba
// empezando el **31 de diciembre**. En Bogotá (UTC-5) salía bien, y por eso
// nadie lo vio: el error depende del signo del offset de quien pulsa el botón.
// Un período contable corrido un día es un cierre que no cuadra.
//
// La solución no es meter la zona de la organización: es no pasar nunca por un
// `Date` local. Las cadenas se construyen con aritmética entera, y el único
// `Date` que aparece es UTC puro (`Date.UTC`), para contar los días del mes.
//
// Para «hoy» sí hace falta la zona — eso es `todayInTz(tz)` / `getToday()` del
// contexto —, y estas funciones se aplican DESPUÉS, sobre ese día ya resuelto.
// ============================================================

function dosDigitos(valor: number): string {
  return String(valor).padStart(2, '0');
}

/** Días que tiene un mes (1–12). Sin `Date` local: `Date.UTC` y listo. */
export function diasDelMes(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Primer día calendario de un mes: `YYYY-MM-01`. */
export function primerDiaDelMes(year: number, month: number): string {
  return `${year}-${dosDigitos(month)}-01`;
}

/** Último día calendario de un mes, con los bisiestos bien. */
export function ultimoDiaDelMes(year: number, month: number): string {
  return `${year}-${dosDigitos(month)}-${dosDigitos(diasDelMes(year, month))}`;
}

/** Rango completo de un mes, como par de días calendario. */
export function rangoDelMes(year: number, month: number): { start: string; end: string } {
  return { start: primerDiaDelMes(year, month), end: ultimoDiaDelMes(year, month) };
}

/** Rango completo de un año, como par de días calendario. */
export function rangoDelAnio(year: number): { start: string; end: string } {
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

/** Año y mes (1–12) de un día calendario `YYYY-MM-DD`. */
export function partesDelDia(plainDate: string): { year: number; month: number; day: number } {
  const [year, month, day] = plainDate.split('-').map(Number);
  return { year, month, day };
}

/**
 * Primer día del mes al que pertenece un día calendario.
 * `primerDiaDelMesDe('2026-09-23')` → `'2026-09-01'`.
 */
export function primerDiaDelMesDe(plainDate: string): string {
  const { year, month } = partesDelDia(plainDate);
  return primerDiaDelMes(year, month);
}

/**
 * Primer día del año al que pertenece un día calendario.
 * `primerDiaDelAnioDe('2026-09-23')` → `'2026-01-01'`.
 */
export function primerDiaDelAnioDe(plainDate: string): string {
  return `${partesDelDia(plainDate).year}-01-01`;
}

/**
 * Suma meses a un día calendario, recortando al último día del mes destino.
 *
 * `sumarMesesAlDia('2026-01-31', 1)` → `'2026-02-28'`, no `'2026-03-03'`.
 * `Date.setMonth` desborda al mes siguiente, y en un plan de cuotas eso
 * significa que la cuota de febrero vence en marzo: dos cuotas el mismo mes y
 * ninguna en febrero. Aquí el día se recorta, que es lo que espera cualquiera
 * que firme un crédito «el 31 de cada mes».
 */
export function sumarMesesAlDia(plainDate: string, meses: number): string {
  const { year, month, day } = partesDelDia(plainDate);
  const indice = (year * 12 + (month - 1)) + meses;
  const anioDestino = Math.floor(indice / 12);
  const mesDestino = (indice % 12) + 1;
  const diaDestino = Math.min(day, diasDelMes(anioDestino, mesDestino));
  return `${anioDestino}-${dosDigitos(mesDestino)}-${dosDigitos(diaDestino)}`;
}

/**
 * Suma (o resta) días a un día calendario. Aritmética pura sobre `Date.UTC`,
 * sin zona horaria: sumar 30 días a un día no depende de dónde esté nadie.
 *
 * Reemplaza a `new Date(Date.now() + 30*24*60*60*1000).toISOString()`, que
 * además de dar el día UTC cuenta 30 × 24 h y por tanto se descuadra una hora
 * cuando el rango cruza un cambio de horario.
 */
export function sumarDiasAlDia(plainDate: string, dias: number): string {
  const { year, month, day } = partesDelDia(plainDate);
  const movido = new Date(Date.UTC(year, month - 1, day + dias));
  return `${movido.getUTCFullYear()}-${dosDigitos(movido.getUTCMonth() + 1)}-${dosDigitos(
    movido.getUTCDate(),
  )}`;
}

/**
 * Días calendario entre dos días (`hasta − desde`). Enteros, sin horas y sin
 * zona: entre el 1 y el 3 hay 2 días, se haya cambiado el reloj o no.
 *
 * Reemplaza a `differenceInDays(new Date(a), new Date(b))` sobre instantes,
 * que en un día de 23 o 25 horas devuelve un día de menos o de más.
 */
export function diasEntreDias(desde: string, hasta: string): number {
  const a = partesDelDia(desde);
  const b = partesDelDia(hasta);
  const MS_POR_DIA = 86_400_000;
  return Math.round(
    (Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / MS_POR_DIA,
  );
}
