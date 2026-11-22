'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Coins } from 'lucide-react';
import { toast } from 'sonner';
import {
  AvisoTonal,
  CampoNumero,
  ChipsOpcion,
  FormField,
  PanelAdaptable,
  ResumenTotales,
  SegmentedControl,
  TarjetaSeleccionable,
  clasesBoton,
} from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { CargosServicioService } from './cargosServicioService';
import { codigoErrorCargo } from './cargosLogica';
import {
  pareceFlete,
  pareceUnaPropina,
  validarFormularioCargo,
  vistaPreviaCargo,
  type FormularioCargo,
} from './cargosVista';
import { APPLIES_TO_VALUES, type AppliesTo, type ImpuestoCargo, type ServiceCharge } from './types';

const SIN_IMPUESTO = 'ninguno';

/** Símbolo de la moneda de la organización para el prefijo de los montos («$», «€»). */
function simboloMoneda(code: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: code }).formatToParts(0).find((p) => p.type === 'currency')?.value ?? code;
  } catch {
    return code;
  }
}
const TODAS = 'todas';

interface CargoFormDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  /** null = nuevo cargo. */
  cargo: ServiceCharge | null;
  impuestos: readonly ImpuestoCargo[];
  sucursales: readonly { id: number; name: string }[];
  /** Sucursal del header: valor inicial de un cargo nuevo. */
  sucursalInicial: number | null;
  onGuardado: () => void;
}

function inicial(cargo: ServiceCharge | null, impuestos: readonly ImpuestoCargo[], sucursal: number | null): FormularioCargo {
  if (cargo) {
    return {
      name: cargo.name,
      charge_type: cargo.charge_type,
      charge_value: Number(cargo.charge_value) || null,
      tax_id: cargo.tax_id ?? null,
      applies_to: cargo.applies_to,
      min_guests: cargo.min_guests ?? null,
      min_amount: cargo.min_amount ?? null,
      branch_id: cargo.branch_id ?? null,
      is_optional: cargo.is_optional,
    };
  }
  return {
    name: '',
    charge_type: 'percentage',
    charge_value: null,
    // El primero es el impuesto por defecto de la organización (el servicio los ordena así).
    tax_id: impuestos[0]?.id ?? null,
    applies_to: 'dine_in',
    min_guests: null,
    min_amount: null,
    branch_id: sucursal,
    is_optional: false,
  };
}

/**
 * «Configurar cargo de servicio» v2 (Figma 1088:716994): impuesto del cargo,
 * «Obligatorio / Opcional» explicado y vista previa del recibo. Diálogo en
 * escritorio y hoja inferior en móvil (`PanelAdaptable`; la hoja móvil no se
 * dibujó en Figma).
 */
export function CargoFormDialog({
  abierto,
  onAbiertoChange,
  cargo,
  impuestos,
  sucursales,
  sucursalInicial,
  onGuardado,
}: CargoFormDialogProps) {
  const t = useTranslations('posCargos.formulario');
  const tAplica = useTranslations('posCargos.aplicaA');
  const tErr = useTranslations('posCargos.errores');
  const moneda = useMonedaOrganizacion();
  const [f, setF] = useState<FormularioCargo>(() => inicial(cargo, impuestos, sucursalInicial));
  const [intentado, setIntentado] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (abierto) {
      setF(inicial(cargo, impuestos, sucursalInicial));
      setIntentado(false);
    }
    // Solo al abrir: los impuestos pueden llegar después y no deben pisar lo escrito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, cargo]);

  const cambiar = <K extends keyof FormularioCargo>(clave: K, valor: FormularioCargo[K]) =>
    setF((prev) => ({ ...prev, [clave]: valor }));

  const errores = validarFormularioCargo(f);
  const impuesto = impuestos.find((i) => i.id === f.tax_id) ?? null;
  // Un cargo guardado con un impuesto que ya no está activo sigue mostrándose.
  const impuestoHuerfano = f.tax_id && !impuesto ? cargo?.tax ?? null : null;
  const tarifa = impuesto?.rate ?? impuestoHuerfano?.rate ?? null;
  const nombreImpuesto = impuesto?.name ?? impuestoHuerfano?.name ?? null;
  const previa = useMemo(() => vistaPreviaCargo(f, tarifa), [f, tarifa]);

  const guardar = async () => {
    setIntentado(true);
    if (Object.keys(errores).length > 0 || f.charge_value === null) return;
    setGuardando(true);
    const datos = {
      name: f.name,
      charge_type: f.charge_type,
      charge_value: f.charge_value,
      min_amount: f.min_amount,
      min_guests: f.min_guests,
      applies_to: f.applies_to,
      is_optional: f.is_optional,
      branch_id: f.branch_id,
      tax_id: f.tax_id,
    };
    try {
      if (cargo) await CargosServicioService.update(cargo.id, datos);
      else await CargosServicioService.create(datos);
      toast.success(cargo ? t('actualizado') : t('creado'));
      onGuardado();
      onAbiertoChange(false);
    } catch (e) {
      toast.error(tErr(codigoErrorCargo(e)));
    } finally {
      setGuardando(false);
    }
  };

  const nombreCargo = f.name.trim() || t('cargoSinNombre');
  const etiquetaCargo = f.charge_type === 'percentage' && f.charge_value ? `${nombreCargo} ${f.charge_value} %` : nombreCargo;
  const simbolo = simboloMoneda(moneda.code, moneda.locale);

  const pie = (
    <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => onAbiertoChange(false)} disabled={guardando}>
        {t('cancelar')}
      </button>
      <button type="button" className={clasesBoton({ variante: 'primario' })} onClick={() => void guardar()} disabled={guardando}>
        {guardando ? t('guardando') : t('guardar')}
      </button>
    </div>
  );

  const opcionesAplica = APPLIES_TO_VALUES.map((v) => ({ valor: v, etiqueta: tAplica(v) }));

  return (
    <PanelAdaptable
      abierto={abierto}
      onAbiertoChange={(v) => !guardando && onAbiertoChange(v)}
      titulo={cargo ? t('tituloEditar') : t('tituloNuevo')}
      descripcion={t('descripcion')}
      icono={Coins}
      ancho={672}
      ocupado={guardando}
      pie={pie}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void guardar();
        }}
        noValidate
      >
        <FormField etiqueta={t('nombre')} obligatorio error={intentado && errores.name ? t(`error.${errores.name}`) : null}>
          <Input value={f.name} maxLength={120} onChange={(e) => cambiar('name', e.target.value)} placeholder={t('nombrePlaceholder')} />
        </FormField>

        <SegmentedControl
          etiqueta={t('tipo')}
          anchoCompleto
          valor={f.charge_type}
          onValorChange={(v) => cambiar('charge_type', v)}
          opciones={[
            { valor: 'percentage', etiqueta: t('porcentaje') },
            { valor: 'fixed_amount', etiqueta: t('montoFijo') },
          ]}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField etiqueta={t('valor')} obligatorio error={intentado && errores.charge_value ? t(`error.${errores.charge_value}`) : null}>
            <CampoNumero
              valor={f.charge_value}
              onValorChange={(v) => cambiar('charge_value', v)}
              decimales={f.charge_type === 'percentage' ? 2 : moneda.decimals}
              minimo={0}
              maximo={f.charge_type === 'percentage' ? 100 : undefined}
              sufijo={f.charge_type === 'percentage' ? '%' : undefined}
              prefijo={f.charge_type === 'fixed_amount' ? simbolo : undefined}
            />
          </FormField>
          <FormField etiqueta={t('impuesto')} ayuda={impuestos.length === 0 ? t('impuestoSinConfigurar') : t('impuestoAyuda')}>
            {(c) => (
              <Select value={f.tax_id ?? SIN_IMPUESTO} onValueChange={(v) => cambiar('tax_id', v === SIN_IMPUESTO ? null : v)}>
                <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} aria-describedby={c['aria-describedby']}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_IMPUESTO}>{t('sinImpuesto')}</SelectItem>
                  {impuestoHuerfano && f.tax_id && (
                    <SelectItem value={f.tax_id}>{`${impuestoHuerfano.name} ${impuestoHuerfano.rate} %`}</SelectItem>
                  )}
                  {impuestos.map((i) => (
                    <SelectItem key={i.id} value={i.id}>{`${i.name} ${i.rate} %`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
        </div>

        <FormField etiqueta={t('aplicaA')}>
          {(c) => (
            <ChipsOpcion<AppliesTo>
              aria-labelledby={c.idEtiqueta}
              opciones={opcionesAplica}
              valor={f.applies_to}
              onValorChange={(v) => cambiar('applies_to', v)}
            />
          )}
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField etiqueta={t('comensalesMinimos')} ayuda={t('comensalesAyuda')}>
            <CampoNumero valor={f.min_guests} onValorChange={(v) => cambiar('min_guests', v)} decimales={0} minimo={0} />
          </FormField>
          <FormField etiqueta={t('compraMinima')} ayuda={t('compraMinimaAyuda')}>
            <CampoNumero
              valor={f.min_amount}
              onValorChange={(v) => cambiar('min_amount', v)}
              decimales={moneda.decimals}
              minimo={0}
              prefijo={simbolo}
            />
          </FormField>
        </div>

        <FormField etiqueta={t('sucursal')}>
          {(c) => (
            <Select
              value={f.branch_id === null ? TODAS : String(f.branch_id)}
              onValueChange={(v) => cambiar('branch_id', v === TODAS ? null : Number(v))}
            >
              <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAS}>{t('todasSucursales')}</SelectItem>
                {sucursales.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>

        <div role="radiogroup" aria-label={t('cobro')} className="flex flex-col gap-2">
          <TarjetaSeleccionable
            orientacion="horizontal"
            titulo={t('obligatorio')}
            descripcion={t('obligatorioDescripcion')}
            seleccionada={!f.is_optional}
            onSeleccionar={() => cambiar('is_optional', false)}
          />
          <TarjetaSeleccionable
            orientacion="horizontal"
            titulo={t('opcional')}
            descripcion={t('opcionalDescripcion')}
            seleccionada={f.is_optional}
            onSeleccionar={() => cambiar('is_optional', true)}
          />
        </div>

        {pareceUnaPropina(f) && (
          <AvisoTonal
            tono="advertencia"
            titulo={t('parecePropina')}
            descripcion={t('parecePropinaDescripcion')}
            accion={{ etiqueta: t('irAPropinas'), href: '/app/pos/propinas' }}
          />
        )}
        {pareceFlete(f) && (
          <AvisoTonal tono="advertencia" titulo={t('pareceFlete')} descripcion={t('pareceFleteDescripcion')} />
        )}

        <ResumenTotales
          etiqueta={t('vistaPrevia')}
          moneda={moneda}
          etiquetaSubtotal={previa.comensales ? t('subtotalComensales', { n: previa.comensales }) : t('subtotalEjemplo')}
          etiquetaTotal={t('totalFactura')}
          subtotal={previa.subtotal}
          cargos={previa.cargo > 0 ? [{ id: 'cargo', etiqueta: etiquetaCargo, importe: previa.cargo }] : []}
          impuestos={tarifa && nombreImpuesto ? [{ nombre: nombreImpuesto, tarifa, importe: previa.impuesto }] : []}
          total={previa.total}
          cabecera={<p className="text-xs font-medium text-fg-secondary">{t('vistaPrevia')}</p>}
          className="rounded-lg bg-subtle p-3"
        />
        <p className="-mt-2 text-xs text-fg-muted">{t('propinaFuera')}</p>
      </form>
    </PanelAdaptable>
  );
}
