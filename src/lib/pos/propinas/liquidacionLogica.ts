/**
 * Asistente «Liquidar propinas» (Figma `1087:712124`, paso 1 `2695:190611`):
 * lógica pura de los tres pasos, sin React ni Supabase.
 *
 * Esto es la VISTA PREVIA. Quien decide es la base:
 * `fn_propinas_liquidacion_crear` vuelve a bloquear las propinas, recalcula el
 * reparto con las mismas reglas y rechaza lo que no cuadre (ajustes que no
 * suman cero, venta sin cobrar, propina ya liquidada…). Aquí solo se calcula
 * lo que la pantalla muestra antes de confirmar y se arma el cuerpo de la
 * petición.
 */
import type {
  DatosLiquidacion,
  FilaPropina,
  MedioLiquidacion,
  PersonaPropina,
  RepartoLiquidacion,
} from './tiposPropinas';

/** Redondeo a centavos (como `numeric(14,2)` de la base). */
export function centavos(valor: number): number {
  return Math.round((Number(valor) || 0) * 100) / 100;
}

/** Una propina entra en la liquidación si está por liquidar y su venta ya se cobró. */
export function liquidable(fila: FilaPropina): boolean {
  return fila.estado === 'por_liquidar' && !fila.venta?.abierta;
}

export interface ResumenSeleccion {
  cantidad: number;
  total: number;
  /** Propinas en efectivo: salen de la caja. */
  efectivo: number;
  /** Tarjeta, transferencia y pedidos web: el dinero entró al banco. */
  banco: number;
  personas: number;
  /** Seleccionadas que no se pueden liquidar (venta abierta). */
  bloqueadas: FilaPropina[];
}

/** Paso 1: separa lo que sale de la caja en efectivo de lo que entró al banco. */
export function resumirSeleccion(filas: readonly FilaPropina[], seleccion: ReadonlySet<string>): ResumenSeleccion {
  const r: ResumenSeleccion = { cantidad: 0, total: 0, efectivo: 0, banco: 0, personas: 0, bloqueadas: [] };
  const personas = new Set<string>();
  for (const f of filas) {
    if (!seleccion.has(f.id)) continue;
    if (!liquidable(f)) {
      r.bloqueadas.push(f);
      continue;
    }
    const monto = centavos(f.monto);
    r.cantidad += 1;
    r.total = centavos(r.total + monto);
    if (f.tipo === 'cash') r.efectivo = centavos(r.efectivo + monto);
    else r.banco = centavos(r.banco + monto);
    personas.add(f.persona.id);
  }
  r.personas = personas.size;
  return r;
}

/** Filtro «Medio» del paso 1. */
export type FiltroMedio = 'todos' | 'efectivo' | 'banco';

export function cumpleMedio(fila: FilaPropina, medio: FiltroMedio): boolean {
  if (medio === 'efectivo') return fila.tipo === 'cash';
  if (medio === 'banco') return fila.tipo !== 'cash';
  return true;
}

export interface LineaReparto {
  persona: PersonaPropina;
  /** Propinas que atendió esa persona en la selección. */
  base: number;
  /** Participación en %, con 4 decimales como la base. */
  pct: number;
  calculado: number;
  ajuste: number;
  monto: number;
}

/** Personas de la selección (las que atendieron), con su base. */
export function basesPorPersona(filas: readonly FilaPropina[]): Array<{ persona: PersonaPropina; base: number }> {
  const mapa = new Map<string, { persona: PersonaPropina; base: number }>();
  for (const f of filas) {
    const fila = mapa.get(f.persona.id) ?? { persona: f.persona, base: 0 };
    fila.base = centavos(fila.base + f.monto);
    mapa.set(f.persona.id, fila);
  }
  return [...mapa.values()].sort((a, b) => b.base - a.base || a.persona.id.localeCompare(b.persona.id));
}

/** Participaciones iguales que suman exactamente 100 (el resto va a la primera). */
export function participacionesIguales(personas: readonly string[]): Record<string, number> {
  if (personas.length === 0) return {};
  const parte = Math.floor((100 / personas.length) * 100) / 100;
  const salida: Record<string, number> = {};
  personas.forEach((p) => (salida[p] = parte));
  salida[personas[0]] = Math.round((100 - parte * (personas.length - 1)) * 100) / 100;
  return salida;
}

export function sumaParticipaciones(participaciones: Readonly<Record<string, number>>): number {
  return Math.round(Object.values(participaciones).reduce((a, b) => a + (Number(b) || 0), 0) * 10000) / 10000;
}

/**
 * Paso 2: reparto calculado (mismas reglas que la base).
 * - «A quien atendió»: cada persona recibe lo suyo.
 * - «Pozo por porcentaje»: total × % de cada una; el redondeo va a la de mayor
 *   participación.
 */
export function calcularReparto(
  filas: readonly FilaPropina[],
  reparto: RepartoLiquidacion,
  participaciones: Readonly<Record<string, number>> = {},
  personasPozo: readonly PersonaPropina[] = [],
  ajustes: Readonly<Record<string, number>> = {},
): LineaReparto[] {
  const bases = basesPorPersona(filas);
  const total = centavos(bases.reduce((a, b) => a + b.base, 0));
  let lineas: Omit<LineaReparto, 'ajuste' | 'monto'>[];
  if (reparto === 'porcentaje') {
    const baseDe = new Map(bases.map((b) => [b.persona.id, b.base]));
    const personas = new Map<string, PersonaPropina>();
    for (const b of bases) personas.set(b.persona.id, b.persona);
    for (const p of personasPozo) personas.set(p.id, p);
    lineas = [...personas.values()]
      .filter((p) => (participaciones[p.id] ?? 0) > 0 || baseDe.has(p.id))
      .map((p) => {
        const pct = Number(participaciones[p.id]) || 0;
        return { persona: p, base: baseDe.get(p.id) ?? 0, pct: Math.round(pct * 10000) / 10000, calculado: centavos((total * pct) / 100) };
      })
      .sort((a, b) => b.pct - a.pct || a.persona.id.localeCompare(b.persona.id));
    const suma = centavos(lineas.reduce((a, l) => a + l.calculado, 0));
    if (lineas.length > 0 && suma !== total && Math.abs(sumaParticipaciones(participaciones) - 100) <= 0.01) {
      lineas[0] = { ...lineas[0], calculado: centavos(lineas[0].calculado + (total - suma)) };
    }
  } else {
    lineas = bases.map((b) => ({
      persona: b.persona,
      base: b.base,
      pct: total > 0 ? Math.round(((b.base * 100) / total) * 10000) / 10000 : 0,
      calculado: b.base,
    }));
  }
  return lineas.map((l) => {
    const ajuste = centavos(ajustes[l.persona.id] ?? 0);
    return { ...l, ajuste, monto: centavos(l.calculado + ajuste) };
  });
}

export type ProblemaReparto =
  | 'porcentajes'
  | 'ajustesNoSumanCero'
  | 'motivoAjuste'
  | 'ajusteNegativo'
  | 'sinPropinas';

/** Lo que impide pasar del paso 2 (la base vuelve a comprobarlo). */
export function problemasReparto(
  lineas: readonly LineaReparto[],
  reparto: RepartoLiquidacion,
  participaciones: Readonly<Record<string, number>>,
  motivoAjuste: string,
): ProblemaReparto[] {
  const problemas: ProblemaReparto[] = [];
  if (lineas.length === 0) problemas.push('sinPropinas');
  if (reparto === 'porcentaje' && Math.abs(sumaParticipaciones(participaciones) - 100) > 0.01) problemas.push('porcentajes');
  const sumaAjustes = centavos(lineas.reduce((a, l) => a + l.ajuste, 0));
  if (sumaAjustes !== 0) problemas.push('ajustesNoSumanCero');
  if (lineas.some((l) => l.ajuste !== 0) && motivoAjuste.trim().length < 3) problemas.push('motivoAjuste');
  if (lineas.some((l) => l.monto < 0)) problemas.push('ajusteNegativo');
  return problemas;
}

export type ProblemaPago = 'sinCaja' | 'referencias' | 'motivo' | 'medioNoDisponible';

/** Lo que impide confirmar el paso 3. */
export function problemasPago(
  medio: MedioLiquidacion,
  lineas: readonly LineaReparto[],
  opciones: { cajaAbierta: boolean; referencias: Readonly<Record<string, string>>; motivo: string },
): ProblemaPago[] {
  if (medio === 'efectivo') return opciones.cajaAbierta ? [] : ['sinCaja'];
  if (medio === 'transferencia') {
    const falta = lineas.some((l) => l.monto > 0 && !(opciones.referencias[l.persona.id] ?? '').trim());
    return falta ? ['referencias'] : [];
  }
  if (medio === 'sin_pago') return opciones.motivo.trim().length < 3 ? ['motivo'] : [];
  return ['medioNoDisponible'];
}

/** Cuerpo de la petición. Solo viajan ids, porcentajes, ajustes y textos: los importes los calcula la base. */
export function armarDatosLiquidacion(entrada: {
  solicitud: string;
  sucursalId: number;
  propinas: readonly string[];
  reparto: RepartoLiquidacion;
  participaciones: Readonly<Record<string, number>>;
  lineas: readonly LineaReparto[];
  motivoAjuste: string;
  medio: MedioLiquidacion;
  referencias: Readonly<Record<string, string>>;
  motivo: string;
  desde?: string | null;
  hasta?: string | null;
}): DatosLiquidacion {
  const ajustes = entrada.lineas.filter((l) => l.ajuste !== 0).map((l) => ({ persona: l.persona.id, monto: l.ajuste }));
  return {
    solicitud: entrada.solicitud,
    sucursal_id: entrada.sucursalId,
    propinas: [...entrada.propinas],
    reparto: entrada.reparto,
    participaciones:
      entrada.reparto === 'porcentaje'
        ? Object.entries(entrada.participaciones)
            .filter(([, pct]) => Number(pct) > 0)
            .map(([persona, pct]) => ({ persona, pct: Number(pct) }))
        : undefined,
    ajustes: ajustes.length ? ajustes : undefined,
    motivo_ajuste: ajustes.length ? entrada.motivoAjuste.trim() : null,
    medio: entrada.medio,
    referencias:
      entrada.medio === 'transferencia'
        ? entrada.lineas
            .filter((l) => l.monto > 0)
            .map((l) => ({ persona: l.persona.id, referencia: (entrada.referencias[l.persona.id] ?? '').trim() }))
        : undefined,
    motivo: entrada.medio === 'sin_pago' ? entrada.motivo.trim() : null,
    desde: entrada.desde ?? null,
    hasta: entrada.hasta ?? null,
  };
}

/** «EGR-000318»: número visible del egreso de caja. */
export function numeroEgreso(id: number | null | undefined): string | null {
  return id ? `EGR-${String(id).padStart(6, '0')}` : null;
}

/** Porcentaje de ventas con propina (entero), o `null` sin ventas. */
export function porcentajeConPropina(ventas: { total: number; con_propina: number } | null | undefined): number | null {
  if (!ventas || !ventas.total) return null;
  return Math.round((ventas.con_propina * 100) / ventas.total);
}
