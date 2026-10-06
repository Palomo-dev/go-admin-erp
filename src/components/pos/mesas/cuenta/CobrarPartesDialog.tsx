'use client';

import { useTranslations } from 'next-intl';
import { FilaDato, KbdButton, ListaDatos } from '@/components/kit';
import { DialogoMesa } from './DialogoMesa';
import { CuentaDividida } from './CuentaDividida';
import { resumenPartes, type ParteCobro } from './cuentaMesaLogica';

/**
 * Cobrar por partes (Figma D8b): cada parte se cobra con el mismo cobro del
 * POS; se ve cuál está pagada, cuál se está cobrando y cuáles faltan. La mesa
 * queda libre solo cuando el servidor dice saldo 0 (no un temporizador).
 */
export interface CobrarPartesDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  mesaNombre: string;
  partes: ParteCobro[];
  comensales: number;
  formatear: (valor: number) => string;
  /** Lo que el servidor dice que falta (manda sobre la suma de las partes). */
  saldoServidor?: number | null;
  onCobrar: (parte: ParteCobro) => void;
  onUnir: () => void;
  onVolver: () => void;
}

export function CobrarPartesDialog({
  abierto,
  onAbiertoChange,
  mesaNombre,
  partes,
  comensales,
  formatear,
  saldoServidor,
  onCobrar,
  onUnir,
  onVolver,
}: CobrarPartesDialogProps) {
  const t = useTranslations('posMesasFlujo.partes');
  const resumen = resumenPartes(partes);
  const falta = saldoServidor ?? resumen.falta;
  const siguiente = partes.find((p) => p.estado === 'cobrando') ?? partes.find((p) => p.estado === 'pendiente') ?? null;
  const pendientes = partes.filter((p) => p.estado !== 'pagada').length;
  const nombre = (p: ParteCobro) => (p.comensal ? t('comensal', { n: p.comensal }) : t('parte', { n: p.nombre }));
  const detalle = (p: ParteCobro) =>
    p.lineas.length > 0
      ? t('detalleProductos', { n: p.lineas.length, nombres: p.lineas.map((l) => l.nombre).join(', ') })
      : t('detalleMonto');

  return (
    <DialogoMesa
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo', { mesa: mesaNombre, n: comensales })}
      textoCerrar={t('cerrar')}
      ancho={700}
      pie={
        <>
          <KbdButton variante="fantasma" tamano="md" onClick={onVolver}>
            {t('volver')}
          </KbdButton>
          <KbdButton variante="secundario" tamano="md" onClick={onUnir} disabled={pendientes < 2}>
            {t('unir')}
          </KbdButton>
          <KbdButton variante="primario" tamano="md" disabled={!siguiente} onClick={() => siguiente && onCobrar(siguiente)}>
            {siguiente ? t('cobrarSiguiente', { parte: nombre(siguiente), importe: formatear(siguiente.importe) }) : t('todoPagado')}
          </KbdButton>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {partes.map((p) => (
          <CuentaDividida
            key={p.id}
            titulo={nombre(p)}
            detalle={detalle(p)}
            importe={formatear(p.importe)}
            estado={p.estado}
            pagadoCon={p.pagadaCon}
            onCobrar={() => onCobrar(p)}
          />
        ))}
      </div>
      <ListaDatos etiqueta={t('resumen')}>
        <FilaDato etiqueta={t('total')} valor={formatear(resumen.total)} tono="fuerte" />
        <FilaDato etiqueta={t('pagado')} valor={formatear(resumen.pagado)} />
        <FilaDato etiqueta={t('falta')} valor={formatear(falta)} tono={falta > 0 ? 'advertencia' : 'exito'} />
      </ListaDatos>
    </DialogoMesa>
  );
}
