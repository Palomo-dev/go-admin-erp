'use client';

/**
 * Envíos dentro de «Ventas en línea» (decisión del dueño, 2026-10-06): las
 * tarifas de envío viven en Transporte y aquí se monta EL MISMO componente
 * (`TarifasEnvio`), tal cual: mismos filtros, tarjetas y diálogos sobre el
 * mismo servicio. Cambiarlas aquí las cambia en Transporte y en el costo que
 * calcula el sitio. Sin segundo formulario ni segunda tabla de zonas.
 *
 * Se abre en un panel lateral desde la tarjeta Envíos (pantalla completa en
 * móvil) para no romper la jerarquía del tablero de la captura B/10-01.
 * Si Transporte no está disponible, explica la alternativa (tarifa plana).
 */
import { Truck } from 'lucide-react';
import { AvisoTonal, PanelAdaptable } from '@/components/kit';
import { TarifasEnvio } from '@/components/transporte/tarifas-envio';
import { useTextosVentas } from './textos';

export interface SeccionEnviosProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  /** La persona ve Transporte › Tarifas de envío (módulo activo y acceso). */
  disponible: boolean;
  soloLectura?: boolean;
  /** Al cerrar, el tablero relee el conteo de tarifas por zona. */
  onCerrar?: () => void;
}

export function SeccionEnvios({ abierto, onAbiertoChange, disponible, soloLectura, onCerrar }: SeccionEnviosProps) {
  const t = useTextosVentas();
  return (
    <PanelAdaptable
      abierto={abierto}
      onAbiertoChange={(v) => {
        onAbiertoChange(v);
        if (!v) onCerrar?.();
      }}
      titulo={t('ventas.envios.titulo')}
      descripcion={t('ventas.envios.descripcion')}
      icono={Truck}
      ancho={1120}
      pantallaCompletaMovil
    >
      {disponible ? (
        <TarifasEnvio soloLectura={soloLectura} />
      ) : (
        <AvisoTonal tono="informacion" titulo={t('ventas.envios.alternativaTitulo')} descripcion={t('ventas.envios.alternativaDescripcion')} />
      )}
    </PanelAdaptable>
  );
}
