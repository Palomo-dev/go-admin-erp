'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Ticket } from 'lucide-react';
import { toast } from 'sonner';
import {
  CampoFecha,
  CampoNumero,
  CustomerPicker,
  FormField,
  PanelAdaptable,
  SegmentedControl,
  clasesBoton,
  type ClientePicker,
} from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { buscarClientes } from '@/lib/services/customers/busquedaClientesService';
import { CouponsService } from './couponsService';
import { codigoAlAzar, codigoErrorCupon, datosDelFormulario, validarFormularioCupon, type FormularioCupon } from './cuponesVista';
import { simboloMoneda, useFormatoCupones } from './useFormatoCupones';
import type { Coupon } from './types';

const NINGUNA = 'ninguna';

async function buscarCliente(texto: string): Promise<ClientePicker[]> {
  const orgId = getOrganizationId();
  if (!orgId || orgId <= 0) return [];
  const { filas } = await buscarClientes(supabase, { organizationId: orgId, texto, limite: 20 });
  return filas.map((c) => ({ id: c.id, nombre: c.full_name ?? '—', correo: c.email, telefono: c.phone }));
}

interface CuponFormDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  /** null = nuevo cupón. */
  cupon: Coupon | null;
  promociones: readonly { id: string; name: string }[];
  onGuardado: (cupon: Coupon) => void;
}

/** «Nuevo cupón» / «Editar cupón» (Figma 458:83786). Diálogo en escritorio, hoja inferior en móvil. */
export function CuponFormDialog({ abierto, onAbiertoChange, cupon, promociones, onGuardado }: CuponFormDialogProps) {
  const t = useTranslations('posCupones.formulario');
  const tErr = useTranslations('posCupones.errores');
  const formato = useFormatoCupones();
  const simbolo = simboloMoneda(formato.moneda.code, formato.moneda.locale);

  const inicial = (): FormularioCupon => ({
    code: cupon?.code ?? '',
    name: cupon?.name ?? '',
    discount_type: cupon?.discount_type === 'fixed_amount' ? 'fixed_amount' : 'percentage',
    discount_value: cupon ? Number(cupon.discount_value) || null : null,
    max_discount_amount: cupon?.max_discount_amount ?? null,
    min_purchase_amount: cupon?.min_purchase_amount ?? null,
    start_date: formato.dia(cupon?.start_date ?? null),
    end_date: formato.dia(cupon?.end_date ?? null),
    usage_limit: cupon?.usage_limit ?? null,
    usage_limit_per_customer: cupon?.usage_limit_per_customer ?? null,
    applies_to_first_purchase: cupon?.applies_to_first_purchase ?? false,
    customer_id: cupon?.customer_id ?? null,
    promotion_id: cupon?.promotion_id ?? null,
    is_active: cupon?.is_active ?? true,
  });

  const [f, setF] = useState<FormularioCupon>(inicial);
  const [cliente, setCliente] = useState<ClientePicker | null>(null);
  const [intentado, setIntentado] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setF(inicial());
    setCliente(cupon?.customer ? { id: cupon.customer.id, nombre: cupon.customer.full_name } : null);
    setIntentado(false);
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, cupon]);

  const cambiar = <K extends keyof FormularioCupon>(clave: K, valor: FormularioCupon[K]) => setF((p) => ({ ...p, [clave]: valor }));
  const errores = validarFormularioCupon(f);
  const err = (campo: keyof typeof errores) => (intentado && errores[campo] ? t(`error.${errores[campo]}`) : null);

  const guardar = async () => {
    setIntentado(true);
    if (Object.keys(errores).length > 0) return;
    setGuardando(true);
    try {
      const datos = datosDelFormulario(f);
      const guardado = cupon ? await CouponsService.update(cupon.id, datos) : await CouponsService.create(datos);
      toast.success(cupon ? t('actualizado') : t('creado'));
      onGuardado(guardado);
      onAbiertoChange(false);
    } catch (e) {
      toast.error(tErr(codigoErrorCupon(e)));
    } finally {
      setGuardando(false);
    }
  };

  const pie = (
    <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => onAbiertoChange(false)} disabled={guardando}>
        {t('cancelar')}
      </button>
      <button type="button" className={clasesBoton({ variante: 'primario' })} onClick={() => void guardar()} disabled={guardando}>
        {guardando ? t('guardando') : cupon ? t('guardar') : t('crear')}
      </button>
    </div>
  );

  return (
    <PanelAdaptable
      abierto={abierto}
      onAbiertoChange={(v) => !guardando && onAbiertoChange(v)}
      titulo={cupon ? t('tituloEditar') : t('tituloNuevo')}
      descripcion={t('descripcion')}
      icono={Ticket}
      ancho={672}
      ocupado={guardando}
      pie={pie}
    >
      <form className="flex flex-col gap-4" noValidate onSubmit={(e) => { e.preventDefault(); void guardar(); }}>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            etiqueta={t('codigo')}
            obligatorio
            error={err('code')}
            extra={
              <button type="button" className="text-xs font-medium text-fg-link hover:underline" onClick={() => cambiar('code', codigoAlAzar())}>
                {t('generar')}
              </button>
            }
          >
            <Input
              value={f.code}
              maxLength={40}
              autoComplete="off"
              className="font-mono uppercase"
              onChange={(e) => cambiar('code', e.target.value.toUpperCase())}
            />
          </FormField>
          <FormField etiqueta={t('nombre')}>
            <Input value={f.name} maxLength={120} onChange={(e) => cambiar('name', e.target.value)} placeholder={t('nombrePlaceholder')} />
          </FormField>
        </div>

        <SegmentedControl
          etiqueta={t('tipo')}
          anchoCompleto
          valor={f.discount_type}
          onValorChange={(v) => cambiar('discount_type', v)}
          opciones={[
            { valor: 'percentage', etiqueta: t('porcentaje') },
            { valor: 'fixed_amount', etiqueta: t('montoFijo') },
          ]}
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <FormField etiqueta={t('valor')} obligatorio error={err('discount_value')}>
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
          <FormField etiqueta={t('tope')} ayuda={t('topeAyuda')}>
            <CampoNumero
              valor={f.discount_type === 'percentage' ? f.max_discount_amount : null}
              onValorChange={(v) => cambiar('max_discount_amount', v)}
              decimales={formato.moneda.decimals}
              minimo={0}
              prefijo={simbolo}
              disabled={f.discount_type !== 'percentage'}
            />
          </FormField>
          <FormField etiqueta={t('compraMinima')}>
            <CampoNumero valor={f.min_purchase_amount} onValorChange={(v) => cambiar('min_purchase_amount', v)} decimales={formato.moneda.decimals} minimo={0} prefijo={simbolo} />
          </FormField>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField etiqueta={t('desde')} ayuda={t('desdeAyuda')}>
            {(c) => (
              <CampoFecha
                id={c.id}
                aria-labelledby={c.idEtiqueta}
                valor={f.start_date}
                onValorChange={(d) => cambiar('start_date', d || null)}
                hoy={formato.getToday()}
                limpiable
                placeholder={t('sinFechaInicio')}
              />
            )}
          </FormField>
          <FormField etiqueta={t('hasta')} ayuda={t('hastaAyuda')} error={err('end_date')}>
            {(c) => (
              <CampoFecha
                id={c.id}
                aria-labelledby={c.idEtiqueta}
                valor={f.end_date}
                onValorChange={(d) => cambiar('end_date', d || null)}
                min={f.start_date}
                hoy={formato.getToday()}
                limpiable
                placeholder={t('sinFechaFin')}
              />
            )}
          </FormField>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField etiqueta={t('limiteUsos')} ayuda={t('vacioSinLimite')}>
            <CampoNumero valor={f.usage_limit} onValorChange={(v) => cambiar('usage_limit', v)} decimales={0} minimo={0} />
          </FormField>
          <FormField etiqueta={t('usosPorCliente')} ayuda={t('vacioSinLimite')} error={err('usage_limit_per_customer')}>
            <CampoNumero valor={f.usage_limit_per_customer} onValorChange={(v) => cambiar('usage_limit_per_customer', v)} decimales={0} minimo={0} />
          </FormField>
        </div>

        <FormField etiqueta={t('cliente')} ayuda={t('clienteAyuda')}>
          {(c) => (
            <CustomerPicker
              id={c.id}
              aria-describedby={c['aria-describedby']}
              layout="campo"
              etiqueta={t('cliente')}
              cliente={cliente}
              buscar={buscarCliente}
              onCambiar={(cl) => {
                setCliente(cl);
                cambiar('customer_id', cl.id);
              }}
              onQuitar={() => {
                setCliente(null);
                cambiar('customer_id', null);
              }}
            />
          )}
        </FormField>

        <FormField etiqueta={t('promocion')}>
          {(c) => (
            <Select value={f.promotion_id ?? NINGUNA} onValueChange={(v) => cambiar('promotion_id', v === NINGUNA ? null : v)}>
              <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NINGUNA}>{t('ninguna')}</SelectItem>
                {promociones.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>

        <label className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5">
          <span className="text-sm">
            <span className="block font-medium text-fg">{t('primeraCompra')}</span>
            <span className="block text-xs text-fg-secondary">{t('primeraCompraAyuda')}</span>
          </span>
          <Switch checked={f.applies_to_first_purchase} onCheckedChange={(v) => cambiar('applies_to_first_purchase', v)} />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5">
          <span className="text-sm">
            <span className="block font-medium text-fg">{t('activo')}</span>
            <span className="block text-xs text-fg-secondary">{t('activoAyuda')}</span>
          </span>
          <Switch checked={f.is_active} onCheckedChange={(v) => cambiar('is_active', v)} />
        </label>
      </form>
    </PanelAdaptable>
  );
}
