/**
 * Borrador de la pestaña «Pedidos online»: lo que se edita (todo completo, para que la tabla
 * siempre muestre números) y su conversión a lo que se guarda. Puro: lo usan el panel y sus
 * pruebas.
 */
import {
  TIPOS_TIEMPO,
  tiemposDeSede,
  tiemposGenerales,
  type AjustesTiemposPedidos,
  type Tiempo,
  type TiemposPorTipo,
  type TiemposResueltos,
  type TipoTiempo,
  type VerticalTiempos,
} from '@/lib/pos/pedidosWeb/tiemposPedidos';

export type TiemposCompletos = Record<TipoTiempo, TiemposResueltos>;

export interface BorradorTiempos {
  por_tipo: TiemposCompletos;
  por_sede: Record<string, TiemposCompletos>;
  usar_en_confirmacion_automatica: boolean;
  contar_desde_apertura: boolean;
}

/** Lo guardado (o nada) → borrador. Sin fila: los valores de fábrica de la vertical. */
export function borradorDesde(ajustes: AjustesTiemposPedidos | null, vertical: VerticalTiempos): BorradorTiempos {
  const por_sede: Record<string, TiemposCompletos> = {};
  for (const clave of Object.keys(ajustes?.por_sede ?? {})) por_sede[clave] = tiemposDeSede(ajustes, clave, vertical);
  return {
    por_tipo: tiemposGenerales(ajustes, vertical),
    por_sede,
    usar_en_confirmacion_automatica: ajustes?.usar_en_confirmacion_automatica ?? false,
    contar_desde_apertura: ajustes?.contar_desde_apertura ?? false,
  };
}

function aGuardarTipos(v: TiemposCompletos): TiemposPorTipo {
  const salida: TiemposPorTipo = {};
  for (const tipo of TIPOS_TIEMPO) {
    salida[tipo] = { alistar: { ...v[tipo].alistar }, ...(v[tipo].entrega && tipo !== 'recoger' ? { entrega: { ...v[tipo].entrega } } : {}) };
  }
  return salida;
}

/** Borrador → `organization_settings.settings`. */
export function ajustesDesde(b: BorradorTiempos): AjustesTiemposPedidos {
  const por_sede: Record<string, TiemposPorTipo> = {};
  for (const [clave, v] of Object.entries(b.por_sede)) por_sede[clave] = aGuardarTipos(v);
  return {
    por_tipo: aGuardarTipos(b.por_tipo),
    por_sede,
    usar_en_confirmacion_automatica: b.usar_en_confirmacion_automatica,
    contar_desde_apertura: b.contar_desde_apertura,
  };
}

export function cambiarTiempo(v: TiemposCompletos, tipo: TipoTiempo, campo: 'alistar' | 'entrega', tiempo: Tiempo): TiemposCompletos {
  if (campo === 'entrega' && tipo === 'recoger') return v;
  return { ...v, [tipo]: { ...v[tipo], [campo]: { ...tiempo } } };
}

function igual(a: Tiempo | null, b: Tiempo | null): boolean {
  return (a?.valor ?? null) === (b?.valor ?? null) && (a?.unidad ?? null) === (b?.unidad ?? null);
}

/** Tipos en los que la sede difiere de los generales (para el resumen de la fila). */
export function tiposDistintos(sede: TiemposCompletos, generales: TiemposCompletos): TipoTiempo[] {
  return TIPOS_TIEMPO.filter((tipo) => !igual(sede[tipo].alistar, generales[tipo].alistar) || !igual(sede[tipo].entrega, generales[tipo].entrega));
}
