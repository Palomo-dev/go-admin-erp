'use client';

/**
 * Textos de la plantilla del sitio de sede (`sitioWeb.plantillaSede.*`). `TEXTOS_PLANTILLA_SEDE`
 * es el español de Colombia canónico y el respaldo mientras una clave no esté en messages/*.json
 * (mismo patrón que `useTextosEditor`). Marcadores: `{tipo}`, `{sede}`.
 */
import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { interpolar } from '@/components/sitio-web/ui/textos';

export const TEXTOS_PLANTILLA_SEDE = {
  tipos: {
    restaurant: 'Restaurante',
    hotel: 'Hotel',
    retail: 'Tienda',
    gym: 'Gimnasio',
    transport: 'Transporte',
    parking: 'Parqueadero',
    services: 'Servicios',
  },
  accion: 'Aplicar plantilla de {tipo} a esta sede',
  titulo: 'Aplicar la plantilla de {tipo} a {sede}',
  descripcion:
    'Reemplaza el borrador de la sede por la estructura de {tipo}: páginas, secciones y menús. El borrador actual queda en el historial como guardado automático y lo puedes restaurar. Nada cambia en línea hasta que publiques.',
  descripcionPendiente:
    'El sitio de {sede} tiene cambios propios, por eso no se reemplazó al cambiar el tipo de negocio. Si aplicas la plantilla de {tipo}, el borrador actual queda en el historial y lo puedes restaurar. Nada cambia en línea hasta que publiques.',
  confirmar: 'Aplicar plantilla',
  ahoraNo: 'Ahora no',
  aplicada: 'Plantilla de {tipo} aplicada a {sede}',
  creada: 'El sitio de {sede} se creó con la plantilla de {tipo}',
  enBorrador: 'Quedó en borrador. Publica la sede desde el editor cuando esté lista.',
  sinCambios: '{sede} ya tiene la plantilla de {tipo}',
  error: 'No se pudo aplicar la plantilla',
  noDisponible: 'Aplicar una plantilla a la sede se activa cuando se aplique su migración.',
  avisoFormulario: 'Tu sitio de sede se crea con la plantilla de {tipo}. Queda en borrador hasta que lo publiques.',
  avisoCambioTipo:
    'Al guardar, el sitio de la sede pasa a la plantilla de {tipo}. Si ya tiene cambios propios no se pisan: te preguntaremos antes de aplicarla.',
} as const;

type Hoja = string;
type Arbol = { readonly [k: string]: Hoja | Arbol };

function canon(clave: string): string | undefined {
  let nodo: Hoja | Arbol | undefined = TEXTOS_PLANTILLA_SEDE as unknown as Arbol;
  for (const parte of clave.split('.')) {
    if (!nodo || typeof nodo === 'string') return undefined;
    nodo = (nodo as Arbol)[parte];
  }
  return typeof nodo === 'string' ? nodo : undefined;
}

export type TraductorPlantillaSede = (clave: string, valores?: Record<string, string | number>) => string;

export function useTextosPlantillaSede(): TraductorPlantillaSede {
  const t = useTranslations('sitioWeb');
  return useCallback(
    (clave: string, valores?: Record<string, string | number>) => {
      const completa = `plantillaSede.${clave}`;
      if (t.has(completa)) return t(completa, valores);
      const c = canon(clave);
      return c !== undefined ? interpolar(c, valores) : clave;
    },
    [t],
  );
}
