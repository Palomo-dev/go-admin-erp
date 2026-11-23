'use client';

/**
 * Aviso de la zona bajo la dirección de entrega (Figma «21 Logística» 2830:73378 con zona y
 * 2830:74984 fuera de zona). Lo usan el cobro del POS y el pedido manual de Pedidos online.
 *
 * Solo pinta lo que devolvió el servidor (`logistica_cotizar_envio`): «Zona 2 · Chapinero ·
 * $ 7.000 · 45–60 min», el mínimo, el envío gratis y, fuera de zona, las dos salidas («Cobrar
 * tarifa general» o «Usar transportadora»).
 */
import { MapPin } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { AvisoTonal, type AccionAviso } from '@/components/kit';
import type { CotizacionEnvio } from '@/lib/logistica/cotizacion';
import { estadoCotizacion, nombreZona, tarifaGeneralDe, textoTiempoCotizacion } from '@/lib/logistica/presentacionEnvio';
import { formatPlainDate } from '@/lib/utils/dateDisplay';
import type { EstadoPeticion } from './useCotizacionDomicilio';

export interface AvisoCotizacionDomicilioProps {
  estado: EstadoPeticion;
  cotizacion: CotizacionEnvio | null;
  formatear: (n: number) => string;
  /** Fuera de zona con tarifa general: el cajero decide cobrarla. */
  onCobrarTarifaGeneral?: (valor: number) => void;
  /** Fuera de zona: pasar a «Transportadora». */
  onUsarTransportadora?: () => void;
  className?: string;
}

export function AvisoCotizacionDomicilio({ estado, cotizacion, formatear, onCobrarTarifaGeneral, onUsarTransportadora, className }: AvisoCotizacionDomicilioProps) {
  const t = useTranslations('logistica.cotizar');
  if (estado === 'inactivo') return null;
  if (estado === 'cargando' && !cotizacion) {
    return (
      <p role="status" className={className ? `text-xs text-fg-secondary ${className}` : 'text-xs text-fg-secondary'}>
        {t('buscando')}
      </p>
    );
  }
  if (estado === 'error') {
    return <AvisoTonal className={className} tono="advertencia" icono={MapPin} titulo={t('error.titulo')} descripcion={t('error.descripcion')} compacto />;
  }
  const e = estadoCotizacion(cotizacion);
  if (!cotizacion || !e || e === 'sin_zonas') return null;

  const zona = nombreZona(cotizacion) ?? '';
  const tiempo = textoTiempoCotizacion(cotizacion);
  const despacho = cotizacion.despacho && !cotizacion.despacho.hoy
    ? t('saleEl', { fecha: formatPlainDate(cotizacion.despacho.fecha, { weekday: 'short', day: 'numeric', month: 'short' }) })
    : null;

  if (e === 'en_zona') {
    const titulo = [zona, cotizacion.envio_gratis ? t('gratis') : formatear(cotizacion.precio ?? 0), tiempo].filter(Boolean).join(' · ');
    const detalle = [
      cotizacion.pedido_minimo > 0 ? t('minimo', { valor: formatear(cotizacion.pedido_minimo) }) : null,
      cotizacion.envio_gratis_desde != null && !cotizacion.envio_gratis ? t('gratisDesde', { valor: formatear(cotizacion.envio_gratis_desde) }) : null,
      despacho,
      t('origen'),
    ].filter(Boolean).join(' · ');
    return <AvisoTonal className={className} tono="exito" icono={MapPin} titulo={titulo} descripcion={detalle} rol="status" compacto />;
  }

  if (e === 'bajo_minimo') {
    return (
      <AvisoTonal
        className={className}
        tono="advertencia"
        icono={MapPin}
        titulo={t('bajoMinimo.titulo', { zona })}
        descripcion={t('bajoMinimo.descripcion', { minimo: formatear(cotizacion.pedido_minimo), falta: formatear(cotizacion.falta_para_minimo) })}
        rol="alert"
        compacto
      />
    );
  }

  const acciones: AccionAviso[] = [];
  const general = tarifaGeneralDe(cotizacion);
  if (general !== null && onCobrarTarifaGeneral) acciones.push({ etiqueta: t('fuera.cobrarGeneral', { valor: formatear(general) }), onClick: () => onCobrarTarifaGeneral(general) });
  if (onUsarTransportadora) acciones.push({ etiqueta: t('fuera.usarTransportadora'), onClick: onUsarTransportadora });

  const descripcion =
    e === 'fuera_tarifa_general' && general !== null
      ? t('fuera.conGeneral', { valor: formatear(general) })
      : e === 'fuera_transportadora'
        ? t('fuera.soloTransportadora')
        : t('fuera.sinCobertura');
  return (
    <AvisoTonal
      className={className}
      tono={e === 'sin_cobertura' ? 'peligro' : 'advertencia'}
      icono={MapPin}
      titulo={t('fuera.titulo')}
      descripcion={descripcion}
      acciones={acciones.length > 0 ? acciones : undefined}
      rol="alert"
      compacto
    />
  );
}
