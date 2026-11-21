'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Layers } from 'lucide-react';
import { toast } from 'sonner';
import { CampoFecha, CampoNumero, FormField, PanelAdaptable, SegmentedControl, clasesBoton } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CouponsService } from './couponsService';
import { CodigoCupon } from './CodigoCupon';
import { MAXIMO_LOTE, codigoErrorCupon, ejemplosLote, normalizarPrefijo, validarLote } from './cuponesVista';
import { simboloMoneda, useFormatoCupones } from './useFormatoCupones';
import type { DatosLote, DiscountType, LoteCreado } from './types';

const NINGUNA = 'ninguna';

interface Formulario {
  prefijo: string;
  cantidad: number | null;
  discount_type: DiscountType;
  discount_value: number | null;
  max_discount_amount: number | null;
  min_purchase_amount: number | null;
  usage_limit: number | null;
  usage_limit_per_customer: number | null;
  start_date: string | null;
  end_date: string | null;
  promotion_id: string | null;
}

const INICIAL: Formulario = {
  prefijo: '',
  cantidad: 100,
  discount_type: 'percentage',
  discount_value: null,
  max_discount_amount: null,
  min_purchase_amount: null,
  usage_limit: 1,
  usage_limit_per_customer: 1,
  start_date: null,
  end_date: null,
  promotion_id: null,
};

interface CrearLoteDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  promociones: readonly { id: string; name: string }[];
  onCreado: (lote: LoteCreado, datos: DatosLote) => void;
}

/**
 * «Crear lote de cupones» (Figma 1088:720388). Los códigos los genera y guarda
 * `pos_cupones_crear_lote` en una sola transacción: únicos por organización,
 * sin distinguir mayúsculas. Aquí solo se muestran ejemplos del formato.
 */
export function CrearLoteDialog({ abierto, onAbiertoChange, promociones, onCreado }: CrearLoteDialogProps) {
  const t = useTranslations('posCupones.lote');
  const tForm = useTranslations('posCupones.formulario');
  const tErr = useTranslations('posCupones.errores');
  const formato = useFormatoCupones();
  const simbolo = simboloMoneda(formato.moneda.code, formato.moneda.locale);
  const [f, setF] = useState<Formulario>(INICIAL);
  const [intentado, setIntentado] = useState(false);
  const [creando, setCreando] = useState(false);

  useEffect(() => {
    if (abierto) {
      setF(INICIAL);
      setIntentado(false);
    }
  }, [abierto]);

  const cambiar = <K extends keyof Formulario>(k: K, v: Formulario[K]) => setF((p) => ({ ...p, [k]: v }));
  const errores = validarLote(f);
  const err = (campo: keyof typeof errores) => (intentado && errores[campo] ? t(`error.${errores[campo]}`) : null);
  // Ejemplos estables mientras no cambie el prefijo.
  const ejemplos = useMemo(() => ejemplosLote(f.prefijo), [f.prefijo]);

  const crear = async () => {
    setIntentado(true);
    if (Object.keys(errores).length > 0 || f.cantidad === null || f.discount_value === null) return;
    const datos: DatosLote = {
      prefijo: normalizarPrefijo(f.prefijo),
      cantidad: f.cantidad,
      discount_type: f.discount_type,
      discount_value: f.discount_value,
      max_discount_amount: f.discount_type === 'percentage' ? f.max_discount_amount : null,
      min_purchase_amount: f.min_purchase_amount,
      usage_limit: f.usage_limit && f.usage_limit > 0 ? f.usage_limit : null,
      usage_limit_per_customer: f.usage_limit_per_customer && f.usage_limit_per_customer > 0 ? f.usage_limit_per_customer : null,
      start_date: f.start_date,
      end_date: f.end_date,
      promotion_id: f.promotion_id,
    };
    setCreando(true);
    try {
      const lote = await CouponsService.crearLote(datos);
      onCreado(lote, datos);
      onAbiertoChange(false);
    } catch (e) {
      toast.error(tErr(codigoErrorCupon(e)));
    } finally {
      setCreando(false);
    }
  };

  const pie = (
    <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => onAbiertoChange(false)} disabled={creando}>
        {t('cancelar')}
      </button>
      <button type="button" className={clasesBoton({ variante: 'primario' })} onClick={() => void crear()} disabled={creando} aria-busy={creando || undefined}>
        <Layers aria-hidden="true" className="size-4" strokeWidth={1.5} />
        {creando ? t('creando') : t('crear', { n: f.cantidad ?? 0 })}
      </button>
    </div>
  );

  return (
    <PanelAdaptable
      abierto={abierto}
      onAbiertoChange={(v) => !creando && onAbiertoChange(v)}
      titulo={t('titulo')}
      descripcion={t('descripcion')}
      icono={Layers}
      ancho={672}
      ocupado={creando}
      pie={pie}
    >
      <form className="flex flex-col gap-4" noValidate onSubmit={(e) => { e.preventDefault(); void crear(); }}>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField etiqueta={t('prefijo')} obligatorio ayuda={t('prefijoAyuda')} error={err('prefijo')}>
            <Input
              value={f.prefijo}
              maxLength={12}
              autoComplete="off"
              className="font-mono uppercase"
              onChange={(e) => cambiar('prefijo', normalizarPrefijo(e.target.value))}
            />
          </FormField>
          <FormField etiqueta={t('cantidad')} obligatorio ayuda={t('cantidadAyuda', { max: formato.numero(MAXIMO_LOTE) })} error={err('cantidad')}>
            <CampoNumero valor={f.cantidad} onValorChange={(v) => cambiar('cantidad', v)} decimales={0} minimo={1} maximo={MAXIMO_LOTE} />
          </FormField>
        </div>

        <SegmentedControl
          etiqueta={tForm('tipo')}
          anchoCompleto
          valor={f.discount_type}
          onValorChange={(v) => cambiar('discount_type', v)}
          opciones={[
            { valor: 'percentage', etiqueta: tForm('porcentaje') },
            { valor: 'fixed_amount', etiqueta: tForm('montoFijo') },
          ]}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField etiqueta={t('descuento')} obligatorio error={err('discount_value')}>
            <CampoNumero
              valor={f.discount_value}
              onValorChange={(v) => cambiar('discount_value', v)}
              decimales={f.discount_type === 'percentage' ? 2 : formato.moneda.decimals}
              minimo={0}
              maximo={f.discount_type === 'percentage' ? 100 : undefined}
              sufijo={f.discount_type === 'percentage' ? '%' : undefined}
              prefijo={f.discount_type === 'fixed_amount' ? simbolo : undefined}
            />
          </FormField>
          <FormField etiqueta={tForm('tope')} ayuda={tForm('topeAyuda')}>
            <CampoNumero
              valor={f.discount_type === 'percentage' ? f.max_discount_amount : null}
              onValorChange={(v) => cambiar('max_discount_amount', v)}
              decimales={formato.moneda.decimals}
              minimo={0}
              prefijo={simbolo}
              disabled={f.discount_type !== 'percentage'}
            />
          </FormField>
          <FormField etiqueta={tForm('compraMinima')}>
            <CampoNumero valor={f.min_purchase_amount} onValorChange={(v) => cambiar('min_purchase_amount', v)} decimales={formato.moneda.decimals} minimo={0} prefijo={simbolo} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField etiqueta={t('usosPorCupon')}>
              <CampoNumero valor={f.usage_limit} onValorChange={(v) => cambiar('usage_limit', v)} decimales={0} minimo={0} />
            </FormField>
            <FormField etiqueta={t('porCliente')}>
              <CampoNumero valor={f.usage_limit_per_customer} onValorChange={(v) => cambiar('usage_limit_per_customer', v)} decimales={0} minimo={0} />
            </FormField>
          </div>
          <FormField etiqueta={tForm('desde')} ayuda={t('vigenciaAyuda')}>
            {(c) => (
              <CampoFecha id={c.id} aria-labelledby={c.idEtiqueta} valor={f.start_date} onValorChange={(d) => cambiar('start_date', d || null)} hoy={formato.getToday()} limpiable placeholder={tForm('sinFechaInicio')} />
            )}
          </FormField>
          <FormField etiqueta={tForm('hasta')} error={err('end_date')}>
            {(c) => (
              <CampoFecha id={c.id} aria-labelledby={c.idEtiqueta} valor={f.end_date} onValorChange={(d) => cambiar('end_date', d || null)} min={f.start_date} hoy={formato.getToday()} limpiable placeholder={tForm('sinFechaFin')} />
            )}
          </FormField>
        </div>

        <FormField etiqueta={t('promocion')}>
          {(c) => (
            <Select value={f.promotion_id ?? NINGUNA} onValueChange={(v) => cambiar('promotion_id', v === NINGUNA ? null : v)}>
              <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NINGUNA}>{tForm('ninguna')}</SelectItem>
                {promociones.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>

        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-fg-secondary">{t('asiSeVeran')}</p>
          <div className="flex flex-wrap gap-2" aria-hidden="true">
            {ejemplos.map((c, i) => (
              <CodigoCupon key={`${c}-${i}`} codigo={c} />
            ))}
          </div>
        </div>
      </form>
    </PanelAdaptable>
  );
}
