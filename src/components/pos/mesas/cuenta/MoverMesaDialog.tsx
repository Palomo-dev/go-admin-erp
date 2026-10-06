'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { KbdButton, SegmentedControl } from '@/components/kit';
import { MesaTile } from '../plano/MesaTile';
import type { VistaMesaPlano } from '../plano/estadoMesaPlano';
import { DialogoMesa } from './DialogoMesa';
import type { LineaMesa } from './cuentaMesaLogica';
import type { ModoMover } from './cuentaMesaService';

/**
 * Mover, unir o transferir (Figma D7): un diálogo con tres modos sobre la
 * tarjeta compacta del plano (`MesaCard Densidad=compacta`):
 * - Toda la cuenta → una mesa libre.
 * - Algunos productos (solo los pendientes de pago) → cualquier otra mesa; una
 *   libre abre su cuenta al recibirlos.
 * - Unir mesas → una mesa con cuenta abierta.
 * Una transacción: `pos_mesa_mover`.
 */
export interface MoverMesaDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  mesaNombre: string;
  zona: string | null;
  mesaId: string;
  lineas: LineaMesa[];
  mesas: VistaMesaPlano[];
  formatear: (valor: number) => string;
  moviendo?: boolean;
  /** Modo con el que abre (el ⋯ de una línea abre «Algunos productos» con ella marcada). */
  modoInicial?: ModoMover;
  lineaInicial?: string | null;
  onMover: (destino: VistaMesaPlano, modo: ModoMover, lineaIds: string[]) => void;
}

export function MoverMesaDialog({
  abierto,
  onAbiertoChange,
  mesaNombre,
  zona,
  mesaId,
  lineas,
  mesas,
  formatear,
  moviendo,
  modoInicial = 'productos',
  lineaInicial,
  onMover,
}: MoverMesaDialogProps) {
  const t = useTranslations('posMesasFlujo.mover');
  const [modo, setModo] = useState<ModoMover>(modoInicial);
  const [elegidas, setElegidas] = useState<string[]>([]);
  const [destino, setDestino] = useState<string | null>(null);

  const movibles = useMemo(() => lineas.filter((l) => !l.pagada && l.abonado === 0 && l.cantidad > 0), [lineas]);

  useEffect(() => {
    if (!abierto) return;
    setModo(modoInicial);
    setElegidas(lineaInicial ? [lineaInicial] : []);
    setDestino(null);
  }, [abierto, modoInicial, lineaInicial]);

  const destinos = mesas.filter((m) => {
    if (m.id === mesaId) return false;
    if (modo === 'cuenta') return m.estado === 'libre' || m.estado === 'por_limpiar';
    if (modo === 'unir') return m.estado === 'ocupada' || m.estado === 'por_cobrar';
    return m.estado !== 'reservada';
  });
  const elegido = destinos.find((m) => m.id === destino) ?? null;
  const n = elegidas.length;
  const listo = !!elegido && (modo !== 'productos' || n > 0);

  const primario =
    modo === 'cuenta'
      ? t('moverCuenta', { mesa: elegido?.nombre ?? '' })
      : modo === 'unir'
        ? t('unirCon', { mesa: elegido?.nombre ?? '' })
        : t('moverProductos', { n, mesa: elegido?.nombre ?? '' });

  return (
    <DialogoMesa
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={zona ? t('tituloZona', { mesa: mesaNombre, zona }) : t('titulo', { mesa: mesaNombre })}
      textoCerrar={t('cerrar')}
      ocupado={moviendo}
      ancho={720}
      pie={
        <>
          <KbdButton variante="fantasma" tamano="md" onClick={() => onAbiertoChange(false)} disabled={moviendo}>
            {t('cancelar')}
          </KbdButton>
          <KbdButton
            variante="primario"
            tamano="md"
            cargando={moviendo}
            disabled={!listo}
            onClick={() => elegido && onMover(elegido, modo, modo === 'productos' ? elegidas : [])}
          >
            {elegido ? primario : t('eligeMesa')}
          </KbdButton>
        </>
      }
    >
      <SegmentedControl<ModoMover>
        etiqueta={t('modo')}
        valor={modo}
        onValorChange={(v) => {
          setModo(v);
          setDestino(null);
        }}
        className="self-start"
        opciones={[
          { valor: 'cuenta', etiqueta: t('modos.cuenta') },
          { valor: 'productos', etiqueta: t('modos.productos') },
          { valor: 'unir', etiqueta: t('modos.unir') },
        ]}
      />

      {modo === 'productos' && (
        <fieldset className="flex flex-col gap-2.5">
          <legend className="mb-2 text-sm text-fg-secondary">{t('productosAMover')}</legend>
          {movibles.length === 0 && <p className="text-sm text-fg-muted">{t('sinProductos')}</p>}
          {movibles.map((l) => (
            <label key={l.id} className="flex items-center gap-2 text-sm text-fg">
              <input
                type="checkbox"
                checked={elegidas.includes(l.id)}
                onChange={(e) => setElegidas((v) => (e.target.checked ? [...v, l.id] : v.filter((x) => x !== l.id)))}
                className="size-4 rounded accent-brand-action"
              />
              {[
                t('lineaCantidad', { n: l.cantidad, nombre: l.nombre }),
                l.comensal ? t('comensal', { n: l.comensal }) : null,
                l.estado === 'en_cocina' || l.estado === 'preparando' ? t('enCocina') : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </label>
          ))}
        </fieldset>
      )}
      {modo === 'cuenta' && <p className="text-sm text-fg-secondary">{t('ayudaCuenta')}</p>}
      {modo === 'unir' && <p className="text-sm text-fg-secondary">{t('ayudaUnir')}</p>}

      <div className="flex flex-col gap-2">
        <span className="text-sm text-fg-secondary">{t('mesaDestino')}</span>
        {destinos.length === 0 ? (
          <p className="text-sm text-fg-muted">{t('sinDestinos')}</p>
        ) : (
          <div role="radiogroup" aria-label={t('mesaDestino')} className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-3">
            {destinos.map((m) => (
              <MesaTile
                key={m.id}
                vista={m}
                densidad="compacta"
                formatear={formatear}
                seleccionada={destino === m.id}
                role="radio"
                aria-checked={destino === m.id}
                onClick={() => setDestino(m.id)}
              />
            ))}
          </div>
        )}
      </div>

      {elegido && (
        <p className="text-sm text-fg-secondary">
          {modo === 'productos' ? t('elegidaProductos', { mesa: elegido.nombre }) : modo === 'cuenta' ? t('elegidaCuenta', { mesa: elegido.nombre }) : t('elegidaUnir', { mesa: elegido.nombre })}
        </p>
      )}
    </DialogoMesa>
  );
}
