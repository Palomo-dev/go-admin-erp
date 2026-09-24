'use client';

/**
 * Conteo del efectivo por billetes y monedas (Figma `359:57136`, «Efectivo —
 * billetes» / «Efectivo — monedas»). Lo usan el nuevo arqueo y el cierre de
 * caja: una sola pieza para los dos.
 *
 * Las denominaciones salen de la moneda base de la organización
 * (`denominacionesDe`, D10); si la moneda no tiene lista se pide el total en un
 * solo campo. El total es `totalDenominaciones` (Σ cantidad × valor): la
 * pantalla no suma por su cuenta.
 */
import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { Banknote, Coins } from 'lucide-react';
import { Tarjeta } from '@/components/kit';
import { CampoNumero } from '@/components/kit/CampoNumero';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/Utils';
import { cantidadDenominacion, denominacionesDe, type ConteoDenominaciones } from '@/lib/pos/cajas/denominaciones';

export interface ConteoEfectivoProps {
  /** Código ISO de la moneda base (`useMonedaOrganizacion().code`). */
  moneda: string;
  valor: ConteoDenominaciones;
  onValorChange: (valor: ConteoDenominaciones) => void;
  /** Total escrito a mano cuando la moneda no tiene lista de denominaciones. */
  totalManual: number | null;
  onTotalManualChange: (valor: number | null) => void;
  formatear: (valor: number) => string;
  simbolo: string;
  deshabilitado?: boolean;
  /** Compacto: una sola tarjeta con billetes y monedas (diálogo de cierre). */
  compacto?: boolean;
}

interface GrupoProps {
  grupo: 'bills' | 'coins';
  denominaciones: number[];
  valor: ConteoDenominaciones;
  onValorChange: (valor: ConteoDenominaciones) => void;
  formatear: (valor: number) => string;
  deshabilitado?: boolean;
}

function GrupoDenominaciones({ grupo, denominaciones, valor, onValorChange, formatear, deshabilitado }: GrupoProps) {
  const t = useTranslations('cajas.conteo');
  const base = useId();
  const cantidades = valor[grupo] ?? {};
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {denominaciones.map((d) => {
        const clave = String(d);
        const cantidad = cantidades[clave] ?? 0;
        const id = `${base}-${grupo}-${clave}`;
        return (
          <div key={clave} className="flex min-w-0 flex-col gap-1">
            <label htmlFor={id} className="text-xs font-medium text-fg-secondary">
              {formatear(d)}
            </label>
            <CampoNumero
              id={id}
              valor={cantidad || null}
              decimales={0}
              minimo={0}
              maximo={1_000_000}
              alinear="derecha"
              placeholder="0"
              disabled={deshabilitado}
              aria-label={t(grupo === 'bills' ? 'etiquetaBillete' : 'etiquetaMoneda', { valor: formatear(d) })}
              onValorChange={(v) => {
                const siguiente = { ...cantidades, [clave]: cantidadDenominacion(v ?? 0) };
                onValorChange({ ...valor, [grupo]: siguiente });
              }}
            />
            <span className={cn('text-xs tabular-nums', cantidad > 0 ? 'text-success-text' : 'text-fg-muted')} aria-live="polite">
              {cantidad > 0 ? `= ${formatear(cantidad * d)}` : '—'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function ConteoEfectivo({
  moneda,
  valor,
  onValorChange,
  totalManual,
  onTotalManualChange,
  formatear,
  simbolo,
  deshabilitado,
  compacto,
}: ConteoEfectivoProps) {
  const t = useTranslations('cajas.conteo');
  const idTotal = useId();
  const denominaciones = denominacionesDe(moneda);

  if (!denominaciones) {
    return (
      <Tarjeta titulo={t('efectivo')} icono={Banknote} descripcion={t('sinDenominaciones', { moneda })}>
        <div className="flex max-w-xs flex-col gap-1">
          <label htmlFor={idTotal} className="text-sm font-medium text-fg">
            {t('efectivoContado')}
          </label>
          <CampoNumero
            id={idTotal}
            valor={totalManual}
            onValorChange={onTotalManualChange}
            prefijo={simbolo}
            minimo={0}
            alinear="derecha"
            disabled={deshabilitado}
          />
        </div>
      </Tarjeta>
    );
  }

  const limpiar = (
    <Button type="button" variant="ghost" size="sm" onClick={() => onValorChange({})} disabled={deshabilitado}>
      {t('limpiarTodo')}
    </Button>
  );

  if (compacto) {
    return (
      <Tarjeta titulo={t('efectivo')} icono={Banknote} accion={limpiar}>
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="mb-2 text-sm font-medium text-fg">{t('billetes')}</h3>
            <GrupoDenominaciones grupo="bills" denominaciones={denominaciones.billetes} valor={valor} onValorChange={onValorChange} formatear={formatear} deshabilitado={deshabilitado} />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium text-fg">{t('monedas')}</h3>
            <GrupoDenominaciones grupo="coins" denominaciones={denominaciones.monedas} valor={valor} onValorChange={onValorChange} formatear={formatear} deshabilitado={deshabilitado} />
          </div>
        </div>
      </Tarjeta>
    );
  }

  return (
    <>
      <Tarjeta titulo={t('efectivoBilletes')} icono={Banknote} accion={limpiar}>
        <GrupoDenominaciones grupo="bills" denominaciones={denominaciones.billetes} valor={valor} onValorChange={onValorChange} formatear={formatear} deshabilitado={deshabilitado} />
      </Tarjeta>
      <Tarjeta titulo={t('efectivoMonedas')} icono={Coins}>
        <GrupoDenominaciones grupo="coins" denominaciones={denominaciones.monedas} valor={valor} onValorChange={onValorChange} formatear={formatear} deshabilitado={deshabilitado} />
      </Tarjeta>
    </>
  );
}
