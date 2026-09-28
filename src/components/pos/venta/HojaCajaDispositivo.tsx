'use client';

import { Keyboard, Lock, LockOpen, MonitorSmartphone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { FilaDato, KbdButton, ListaDatos, PanelAdaptable } from '@/components/kit';
import { CustomerDisplayIndicator } from '@/components/pos/display/CustomerDisplayIndicator';
import { PendientesSinConexionDialog } from '@/components/pos/PendientesSinConexionDialog';
import { teclaAtajo } from '@/lib/pos/venta/atajos';
import { useHoraOrganizacion } from './CabeceraPos';

/**
 * «⋯ Caja y dispositivo» del `MobileHeader Mode=pos` (Figma `187:7933`,
 * POS-UX-V2 D1 y D3c): en celular y tableta vertical reúne lo que en
 * escritorio va en la cabecera — abrir o cerrar la caja (también sin caja,
 * J-06), la pantalla del cliente, los pendientes sin conexión, la hora y los
 * contadores de carritos — y el acceso al mapa de atajos.
 */
export interface HojaCajaDispositivoProps {
  abierta: boolean;
  onAbiertaChange: (abierta: boolean) => void;
  cajaAbierta: boolean;
  /** Texto de estado de la caja («Caja abierta · 8:02»), el mismo del chip del header. */
  estadoCaja: string;
  cierreBloqueado: boolean;
  onCaja: () => void;
  onAtajos: () => void;
  carritosActivos: number;
  carritosEnEspera: number;
}

export function HojaCajaDispositivo({
  abierta,
  onAbiertaChange,
  cajaAbierta,
  estadoCaja,
  cierreBloqueado,
  onCaja,
  onAtajos,
  carritosActivos,
  carritosEnEspera,
}: HojaCajaDispositivoProps) {
  const t = useTranslations('posVenta.cabecera');
  const hora = useHoraOrganizacion();
  return (
    <PanelAdaptable abierto={abierta} onAbiertoChange={onAbiertaChange} titulo={t('hojaTitulo')} icono={MonitorSmartphone} ancho={520}>
      <ListaDatos etiqueta={t('hojaTitulo')}>
        <FilaDato etiqueta={t('estadoCaja')} valor={estadoCaja} tono={cajaAbierta ? 'exito' : 'advertencia'} />
        <FilaDato etiqueta={t('horaEtiqueta')} valor={hora} />
        <FilaDato etiqueta={t('carritosEtiqueta')} valor={`${t('activos', { n: carritosActivos })} · ${t('enEspera', { n: carritosEnEspera })}`} />
      </ListaDatos>
      <KbdButton
        variante={cajaAbierta ? 'destructivo' : 'primario'}
        tamano="lg"
        anchoCompleto
        icono={cajaAbierta ? Lock : LockOpen}
        atajo={teclaAtajo('caja')}
        disabled={cajaAbierta && cierreBloqueado}
        onClick={() => {
          onAbiertaChange(false);
          onCaja();
        }}
      >
        {cajaAbierta ? t('cerrarCaja') : t('abrirCaja')}
      </KbdButton>
      {cajaAbierta && cierreBloqueado && <p className="text-sm text-fg-secondary">{t('cierreBloqueado')}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2">
        <span className="text-sm font-medium text-fg">{t('pantallaCliente')}</span>
        <CustomerDisplayIndicator />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PendientesSinConexionDialog />
        <KbdButton
          variante="fantasma"
          tamano="md"
          icono={Keyboard}
          atajo={teclaAtajo('mapa')}
          onClick={() => {
            onAbiertaChange(false);
            onAtajos();
          }}
        >
          {t('verAtajos')}
        </KbdButton>
      </div>
    </PanelAdaptable>
  );
}
