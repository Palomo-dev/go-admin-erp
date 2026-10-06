'use client';

/**
 * Aviso en pantalla de un dominio (Figma B/07-01 arriba de la tabla, B/07-24
 * «Avisos en pantalla», B/07-25 compacto en móvil). Uno por cada alerta que
 * calcula el servidor (`alertasDominios`): esta pieza solo la pinta.
 */
import { AvisoTonal } from '@/components/kit';
import type { AlertaDominio } from './tiposDominios';
import { useTextosDominios } from './textos';

export interface AvisoDominioProps {
  alerta: AlertaDominio;
  /** Versión móvil: «tumarca.co vence en 21 días / Renovación apagada.» con «Activar». */
  compacto?: boolean;
  /** Enciende la renovación automática (PATCH {autoRenovar:true}). */
  onActivarRenovacion?: (alerta: AlertaDominio) => void;
  activando?: boolean;
  /** Ruta del detalle del dominio, para las alertas sin acción directa. */
  hrefDetalle: string;
  className?: string;
}

export function AvisoDominio({ alerta, compacto, onActivarRenovacion, activando, hrefDetalle, className }: AvisoDominioProps) {
  const t = useTextosDominios();
  const n = alerta.dias ?? 0;
  if (alerta.tipo === 'vencido') {
    return (
      <AvisoTonal
        tono="peligro"
        rol="alert"
        compacto={compacto}
        titulo={t('alerta.vencidoTitulo', { host: alerta.host })}
        descripcion={compacto ? undefined : t('alerta.vencidoTexto')}
        accion={{ etiqueta: t('alerta.verDominio'), href: hrefDetalle }}
        className={className}
      />
    );
  }
  const titulo = compacto
    ? t('alerta.venceCorto', { host: alerta.host, n })
    : n <= 1
      ? t('alerta.venceUnoTitulo', { host: alerta.host })
      : t('alerta.venceTitulo', { host: alerta.host, n });
  const accion =
    alerta.puedeActivarRenovacion && onActivarRenovacion
      ? { etiqueta: compacto ? t('alerta.activar') : t('alerta.activarRenovacion'), onClick: () => onActivarRenovacion(alerta), cargando: activando }
      : { etiqueta: t('alerta.verDominio'), href: hrefDetalle };
  return (
    <AvisoTonal
      tono="advertencia"
      rol="status"
      compacto={compacto}
      titulo={titulo}
      descripcion={compacto ? t('alerta.renovacionApagada') : t('alerta.venceTexto')}
      accion={accion}
      className={className}
    />
  );
}
