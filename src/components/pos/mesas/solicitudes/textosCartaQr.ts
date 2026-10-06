'use client';

/**
 * Textos del lado POS de la Carta QR (`posCartaQr.*`): solicitudes de la mesa,
 * pagos en línea, valoración y el ajuste de la sede. `TEXTOS_CARTA_QR` es el
 * español de Colombia canónico; mientras el integrador fusiona las claves en
 * messages/*.json, `useTextosCartaQr` lo muestra en vez de la clave cruda (el
 * mismo patrón que `useTextosEditor`).
 */
import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { interpolar } from '@/components/sitio-web/ui/textos';

export const TEXTOS_CARTA_QR = {
  solicitudes: {
    titulo: 'Solicitudes de las mesas',
    descripcion: 'Desde la Carta QR · llegan en tiempo real',
    vacio: 'Ninguna mesa está esperando.',
    tipo: {
      waiter: 'Llama al mesero',
      bill: 'Pide la cuenta',
      help: 'Pide ayuda',
    },
    mesaTipo: '{mesa} · {tipo}',
    hace: 'hace {n} min',
    ahora: 'ahora',
    voy: 'Voy',
    vista: 'En camino',
    atendida: 'Atendida',
    marcarAtendida: 'Marcar atendida',
    verMesa: 'Ver la mesa',
    nuevaTitulo: '{mesa}: {tipo}',
    nuevaDetalle: 'Desde la Carta QR',
    errorAtender: 'No se pudo marcar la solicitud. Inténtalo de nuevo.',
    sinMigracion: 'Las solicitudes de la Carta QR se activan cuando se aplique su migración.',
    avisoMesa: '{tipo} · {hace}',
    etiquetaAviso: '{mesa} tiene {n, plural, one {# solicitud} other {# solicitudes}} sin atender',
    contador: '{n} sin atender',
  },
  pagosEnLinea: {
    titulo: 'Pagado en línea',
    detalle: 'Carta QR · {metodo}',
    enTotales: 'Pagado en línea (Carta QR)',
    abonado: 'Pagado por partes',
    comensal: '{nombre}',
    propina: 'propina {importe}',
    total: 'Pagos en línea',
    enCurso: 'Pago en línea en curso',
    sinAplicar: 'Pagado en línea, sin aplicar a la cuenta: revísalo',
  },
  valoracion: {
    titulo: 'Valoración de la visita',
    estrellas: '{n} de 5',
    aspectos: 'Destacó: {lista}',
    sinComentario: 'Sin comentario',
  },
  etiquetas: {
    titulo: 'Dieta y alérgenos (Carta QR)',
    descripcion: 'La Carta QR filtra por dieta y picante, y avisa los alérgenos en la ficha del plato.',
    kind: {
      dieta: 'Dieta',
      alergeno: 'Alérgenos',
      picante: 'Picante',
    },
    error: 'No se pudo actualizar la etiqueta.',
  },
  pedido: {
    comensal: 'Pidió {nombre}',
  },
  sede: {
    titulo: 'Carta QR en la mesa',
    rondasSolas: 'Las rondas de la Carta QR entran solas a la mesa',
    rondasSolasAyuda:
      'Apagado: el equipo confirma cada ronda en POS › Pedidos online antes de que llegue a la cuenta y a cocina. Encendido: entra directo a la mesa y a cocina.',
    guardado: 'Ajuste de la Carta QR guardado',
    error: 'No se pudo guardar el ajuste de la Carta QR.',
    sinMigracion: 'Disponible cuando se aplique la migración de la Carta QR.',
  },
} as const;

type Arbol = { readonly [k: string]: string | Arbol };

export function textoCartaQr(clave: string): string | undefined {
  let nodo: string | Arbol | undefined = TEXTOS_CARTA_QR as Arbol;
  for (const parte of clave.split('.')) {
    if (typeof nodo !== 'object' || nodo === null) return undefined;
    nodo = (nodo as Arbol)[parte];
  }
  return typeof nodo === 'string' ? nodo : undefined;
}

/** `{n, plural, one {# x} other {# xs}}` mínimo para el respaldo en español. */
function plural(texto: string, valores?: Record<string, string | number>): string {
  return texto.replace(/\{(\w+), plural, one \{([^}]*)\} other \{([^}]*)\}\}/g, (_m, k: string, uno: string, otros: string) => {
    const n = Number(valores?.[k] ?? 0);
    return (n === 1 ? uno : otros).replace(/#/g, String(n));
  });
}

export type TraductorCartaQr = (clave: string, valores?: Record<string, string | number>) => string;

export function traducirCartaQrCanon(clave: string, valores?: Record<string, string | number>): string {
  const canon = textoCartaQr(clave);
  return canon !== undefined ? interpolar(plural(canon, valores), valores) : clave;
}

export function useTextosCartaQr(): TraductorCartaQr {
  const t = useTranslations('posCartaQr');
  return useCallback(
    (clave: string, valores?: Record<string, string | number>) => (t.has(clave) ? t(clave, valores) : traducirCartaQrCanon(clave, valores)),
    [t],
  );
}
