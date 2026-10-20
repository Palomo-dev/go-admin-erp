'use client';

import { useEffect, useState } from 'react';
import { Percent } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CampoNumero, CartTag, KbdButton, PanelAdaptable, SegmentedControl } from '@/components/kit';
import type { CartItem } from '@/components/pos/types';

/**
 * «Descuento · D» del carrito (paso 10; Figma `290:35370`, POS-UX-V2 §7.3):
 * pestaña «A un producto» con las líneas del carrito, el descuento actual de
 * cada una, un campo para cambiarlo y los descuentos frecuentes del producto.
 * Aplica con el mismo flujo de la línea (`POSService.updateCartItemDiscount`,
 * que acota el descuento a cantidad × precio; L8) y el servidor lo valida al
 * cobrar (`descuento_excede_linea`).
 *
 * «A toda la venta» reparte el monto o el porcentaje entre las líneas como
 * descuento manual. El servidor lo valida al cobrar (`descuento_excede_linea`).
 */
export interface DialogoDescuentoProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  items: CartItem[];
  formatear: (valor: number) => string;
  frecuentes: Record<number, number[]>;
  onCargarFrecuentes: (productId: number) => void;
  onAplicar: (itemId: string, monto: number) => Promise<void> | void;
  /** Descuento (monto o %) repartido entre todas las líneas. */
  onAplicarVenta?: (modo: 'monto' | 'porcentaje', valor: number) => Promise<void> | void;
}

type Pestana = 'producto' | 'venta';

export function DialogoDescuento({ abierto, onAbiertoChange, items, formatear, frecuentes, onCargarFrecuentes, onAplicar, onAplicarVenta }: DialogoDescuentoProps) {
  const t = useTranslations('posVenta.descuento');
  const [pestana, setPestana] = useState<Pestana>('producto');
  const [valores, setValores] = useState<Record<string, string>>({});
  const [aplicando, setAplicando] = useState<string | null>(null);
  const [modoVenta, setModoVenta] = useState<'monto' | 'porcentaje'>('porcentaje');
  const [valorVenta, setValorVenta] = useState<number | null>(null);
  const [aplicandoVenta, setAplicandoVenta] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setValores(Object.fromEntries(items.map((i) => [i.id, i.discount_amount ? String(i.discount_amount) : ''])));
    items.forEach((i) => onCargarFrecuentes(i.product_id));
    // Solo al abrir: los valores se editan libremente mientras está abierto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  const aplicar = async (item: CartItem, monto: number) => {
    setAplicando(item.id);
    try {
      await onAplicar(item.id, monto);
      setValores((v) => ({ ...v, [item.id]: monto ? String(monto) : '' }));
    } finally {
      setAplicando(null);
    }
  };

  return (
    <PanelAdaptable
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo')}
      descripcion={t('descripcion')}
      icono={Percent}
      ancho={560}
      debajoCabecera={
        <div className="py-2">
          <SegmentedControl<Pestana>
            etiqueta={t('tipo')}
            valor={pestana}
            onValorChange={setPestana}
            opciones={[
              { valor: 'producto', etiqueta: t('aUnProducto') },
              { valor: 'venta', etiqueta: t('aTodaLaVenta'), deshabilitada: !onAplicarVenta },
            ]}
          />
          {pestana === 'venta' && (
            <p className="mt-1 text-xs text-fg-muted">{t('ventaAyuda')}</p>
          )}
        </div>
      }
      pie={
        <KbdButton variante="secundario" onClick={() => onAbiertoChange(false)}>
          {t('listo')}
        </KbdButton>
      }
    >
      {pestana === 'venta' ? (
        <div className="flex flex-col gap-3 py-2">
          <SegmentedControl<'monto' | 'porcentaje'>
            etiqueta={t('modoVenta')}
            valor={modoVenta}
            onValorChange={setModoVenta}
            opciones={[
              { valor: 'porcentaje', etiqueta: t('porcentaje') },
              { valor: 'monto', etiqueta: t('monto') },
            ]}
          />
          <CampoNumero
            tamano="sm"
            valor={valorVenta}
            onValorChange={setValorVenta}
            minimo={0}
            maximo={modoVenta === 'porcentaje' ? 100 : undefined}
            aria-label={t('valorVenta')}
            placeholder={modoVenta === 'porcentaje' ? t('porcentaje') : t('monto')}
            className="w-40"
          />
          <KbdButton
            variante="primario"
            tamano="sm"
            cargando={aplicandoVenta}
            disabled={!onAplicarVenta}
            onClick={() => {
              if (!onAplicarVenta) return;
              setAplicandoVenta(true);
              Promise.resolve(onAplicarVenta(modoVenta, valorVenta ?? 0))
                .finally(() => setAplicandoVenta(false));
            }}
          >
            {t('aplicar')}
          </KbdButton>
        </div>
      ) : (
      <ul className="flex flex-col divide-y divide-line" aria-label={t('lineas')}>
        {items.map((item) => {
          const texto = valores[item.id] ?? '';
          const monto = parseFloat(texto) || 0;
          const tope = item.quantity * item.unit_price;
          const excede = monto > tope;
          return (
            <li key={item.id} className="flex flex-col gap-2 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-fg">{item.product.name}</p>
                  <p className="text-xs tabular-nums text-fg-secondary">
                    {t('cantidadPorPrecio', { cantidad: item.quantity, precio: formatear(item.unit_price) })}
                  </p>
                </div>
                {item.discount_amount ? (
                  <CartTag origen="manual" icono={null}>
                    -{formatear(item.discount_amount)}
                  </CartTag>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {/* Figma `290:35435`: NumberInput (sin tope: si excede, se avisa abajo). */}
                <CampoNumero
                  tamano="sm"
                  valor={texto === '' ? null : parseFloat(texto) || 0}
                  onValorChange={(n) => setValores((v) => ({ ...v, [item.id]: n == null ? '' : String(n) }))}
                  minimo={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void aplicar(item, monto);
                    }
                  }}
                  aria-label={t('montoDe', { nombre: item.product.name })}
                  aria-invalid={excede || undefined}
                  placeholder={t('monto')}
                  className="w-32"
                />
                <KbdButton variante="primario" tamano="sm" cargando={aplicando === item.id} onClick={() => void aplicar(item, monto)}>
                  {t('aplicar')}
                </KbdButton>
                {item.discount_amount ? (
                  <KbdButton variante="fantasma" tamano="sm" disabled={aplicando === item.id} onClick={() => void aplicar(item, 0)}>
                    {t('quitar')}
                  </KbdButton>
                ) : null}
                {(frecuentes[item.product_id] ?? []).map((f) => (
                  <CartTag key={f} origen="manual" icono={null} onClick={() => void aplicar(item, f)} etiquetaAccesible={t('frecuente', { monto: formatear(f) })}>
                    -{formatear(f)}
                  </CartTag>
                ))}
              </div>
              {excede && <p className="text-xs text-danger-text">{t('excede', { tope: formatear(tope) })}</p>}
            </li>
          );
        })}
      </ul>
      )}
    </PanelAdaptable>
  );
}
