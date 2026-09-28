/**
 * Plan de cuotas de una cuenta (CxC; mismo contrato que CxP): reparte el saldo
 * en N cuotas iguales (la última absorbe el redondeo) con vencimientos
 * mensuales, quincenales o semanales desde la primera fecha. Solo arma la
 * propuesta: la valida y la guarda `fn_cxc_crear_plan_cuotas` (el capital debe
 * sumar el saldo). Módulo hoja, días calendario `YYYY-MM-DD` sin zona.
 */

export type FrecuenciaCuotas = 'mensual' | 'quincenal' | 'semanal';

export interface CuotaPropuesta {
  numero: number;
  vence: string;
  capital: number;
  valor: number;
}

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/** Aritmética de calendario pura (UTC como calendario, no como instante). */
function aDia(f: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${f.getUTCFullYear()}-${p(f.getUTCMonth() + 1)}-${p(f.getUTCDate())}`;
}

function sumarDias(dia: string, dias: number): string {
  const [a, m, d] = dia.split('-').map(Number);
  return aDia(new Date(Date.UTC(a, m - 1, d + dias)));
}

/** Mismo día del mes `n` meses después; si el mes es más corto, su último día. */
function sumarMeses(dia: string, meses: number): string {
  const [a, m, d] = dia.split('-').map(Number);
  const ultimo = new Date(Date.UTC(a, m - 1 + meses + 1, 0)).getUTCDate();
  return aDia(new Date(Date.UTC(a, m - 1 + meses, Math.min(d, ultimo))));
}

export function generarPlanCuotas(
  saldo: number,
  numero: number,
  primera: string,
  frecuencia: FrecuenciaCuotas,
  decimales = 0,
): CuotaPropuesta[] {
  if (!Number.isFinite(saldo) || saldo <= 0 || !Number.isInteger(numero) || numero < 1 || numero > 120 || !DIA.test(primera)) return [];
  const f = 10 ** Math.max(0, decimales);
  const totalUnidades = Math.round(saldo * f);
  const base = Math.floor(totalUnidades / numero);
  const cuotas: CuotaPropuesta[] = [];
  for (let i = 0; i < numero; i++) {
    const unidades = i === numero - 1 ? totalUnidades - base * (numero - 1) : base;
    const valor = unidades / f;
    const vence = frecuencia === 'mensual' ? sumarMeses(primera, i) : sumarDias(primera, i * (frecuencia === 'quincenal' ? 15 : 7));
    cuotas.push({ numero: i + 1, vence, capital: valor, valor });
  }
  return cuotas;
}
