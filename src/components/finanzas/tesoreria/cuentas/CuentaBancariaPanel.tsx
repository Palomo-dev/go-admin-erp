'use client';

/**
 * Nueva / editar cuenta bancaria en panel lateral (Tesorería v2, `1009:85183`).
 * Sustituye a la página `/bancos/cuentas/nuevo` (que redirige aquí con
 * `?nueva=1`) y da por fin «Editar» (`?edit=true` se generaba y nadie lo leía).
 *
 * Reglas del formulario viejo que se conservan: nombre, banco y cuenta
 * contable (PUC de bancos, `cuentasBancariasElegibles`) obligatorios; moneda
 * de las de la organización, por defecto la base (nunca COP supuesto); saldo
 * inicial ≥ 0. El saldo no se edita: lo mueven los movimientos.
 */
import { useEffect, useMemo, useState } from 'react';
import { Landmark } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { CampoNumero, FormField, PanelAdaptable, RelatedLinkCard, clasesBoton } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { BranchSelectorField } from '@/components/inventario/BranchSelectorField';
import { BancosService, type BankAccount } from '@/components/finanzas/bancos/BancosService';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { useBranch } from '@/lib/context/BranchContext';
import { cuentasBancariasElegibles } from '@/lib/finanzas/mapeoImpuesto';
import {
  BANCOS_COMUNES,
  TIPOS_CUENTA_BANCARIA,
  mascaraCuenta,
  validarCuentaBancaria,
  type ErrorFormCuenta,
  type FormCuentaBancaria,
} from '@/lib/finanzas/tesoreria/cuentasDinero';
import { SelectNativo } from '../compartido/TesoreriaComun';

type Plan = { account_code: string; name: string; type: string; parent_code: string | null; is_active?: boolean | null };

export interface CuentaBancariaPanelProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  /** Con cuenta: edición. */
  cuenta?: BankAccount | null;
  onGuardada: (id: number) => void;
}

export function CuentaBancariaPanel({ abierto, onAbiertoChange, cuenta, onGuardada }: CuentaBancariaPanelProps) {
  const t = useTranslations('finanzasTesoreriaR3.cuentaBancaria.form');
  const tc = useTranslations('finanzasTesoreriaR3.comun');
  const { code: monedaBase } = useMonedaOrganizacion();
  const { selectedBranchId } = useBranch();
  const edicion = !!cuenta;
  const [plan, setPlan] = useState<Plan[]>([]);
  const [monedas, setMonedas] = useState<{ code: string; name: string }[]>([]);
  const [form, setForm] = useState<FormCuentaBancaria>({ name: '', bank_name: '', account_number: '', account_type: 'savings', currency: '', account_code: '', initial_balance: null });
  const [sucursal, setSucursal] = useState<number | null>(selectedBranchId);
  const [errores, setErrores] = useState<ErrorFormCuenta[]>([]);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setErrores([]);
    setForm(
      cuenta
        ? {
            name: cuenta.name,
            bank_name: cuenta.bank_name ?? '',
            account_number: cuenta.account_number ?? '',
            account_type: cuenta.account_type ?? 'savings',
            currency: cuenta.currency ?? monedaBase,
            account_code: cuenta.account_code ?? '',
            initial_balance: cuenta.initial_balance,
          }
        : { name: '', bank_name: '', account_number: '', account_type: 'savings', currency: monedaBase, account_code: '', initial_balance: null },
    );
    setSucursal(cuenta?.branch_id ?? selectedBranchId);
    BancosService.obtenerPlanCuentas().then(setPlan).catch(() => setPlan([]));
    BancosService.obtenerMonedasOrganizacion().then(setMonedas).catch(() => setMonedas([]));
  }, [abierto, cuenta, monedaBase, selectedBranchId]);

  const elegibles = useMemo(() => cuentasBancariasElegibles(plan), [plan]);
  const cambiar = <K extends keyof FormCuentaBancaria>(k: K, v: FormCuentaBancaria[K]) => setForm((f) => ({ ...f, [k]: v }));
  const error = (k: ErrorFormCuenta) => (errores.includes(k) ? t(`errores.${k}`) : null);

  const guardar = async () => {
    const e = validarCuentaBancaria(form);
    setErrores(e);
    if (e.length > 0) return;
    setGuardando(true);
    try {
      if (cuenta) {
        await BancosService.actualizarCuentaBancaria(cuenta.id, {
          name: form.name.trim(),
          bank_name: form.bank_name,
          account_number: form.account_number.trim() || null,
          account_type: form.account_type,
          account_code: form.account_code,
        });
        toast.success(t('guardada'));
        onGuardada(cuenta.id);
      } else {
        const nueva = await BancosService.crearCuentaBancaria({
          name: form.name.trim(),
          bank_name: form.bank_name,
          account_number: form.account_number.trim() || null,
          account_type: form.account_type,
          currency: form.currency || null,
          initial_balance: form.initial_balance ?? 0,
          account_code: form.account_code,
          branch_id: sucursal ?? undefined,
        });
        toast.success(t('creada'));
        onGuardada(nueva.id);
      }
    } catch {
      toast.error(t('errorGuardar'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <PanelAdaptable
      abierto={abierto}
      onAbiertoChange={(a) => !guardando && onAbiertoChange(a)}
      titulo={edicion ? t('tituloEditar') : t('tituloNueva')}
      descripcion={t('descripcion')}
      icono={Landmark}
      ancho={560}
      ocupado={guardando}
      pie={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => onAbiertoChange(false)} className={clasesBoton({ variante: 'fantasma' })} disabled={guardando}>
            {tc('cancelar')}
          </button>
          <button type="button" onClick={() => void guardar()} className={clasesBoton({ variante: 'primario' })} disabled={guardando}>
            {guardando ? tc('guardando') : edicion ? t('guardar') : t('crear')}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <FormField etiqueta={t('nombre')} obligatorio error={error('nombre')}>
          <Input value={form.name} onChange={(e) => cambiar('name', e.target.value)} placeholder={t('nombreEjemplo')} maxLength={120} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField etiqueta={t('banco')} obligatorio error={error('banco')}>
            {(c) => (
              <SelectNativo
                id={c.id}
                valor={form.bank_name}
                onCambiar={(v) => cambiar('bank_name', v)}
                vacio={t('elegir')}
                opciones={[...new Set([...BANCOS_COMUNES, ...(form.bank_name ? [form.bank_name] : [])])].map((b) => ({ valor: b, etiqueta: b }))}
                aria-invalid={c['aria-invalid']}
              />
            )}
          </FormField>
          <FormField etiqueta={t('tipo')} obligatorio>
            {(c) => (
              <SelectNativo
                id={c.id}
                valor={form.account_type}
                onCambiar={(v) => cambiar('account_type', v)}
                opciones={[...new Set([...TIPOS_CUENTA_BANCARIA, form.account_type])].map((v) => ({ valor: v, etiqueta: t.has(`tipos.${v}`) ? t(`tipos.${v}`) : v }))}
              />
            )}
          </FormField>
          <FormField etiqueta={t('numero')} ayuda={form.account_number ? t('numeroAyuda', { mascara: mascaraCuenta(form.account_number) }) : undefined}>
            <Input value={form.account_number} onChange={(e) => cambiar('account_number', e.target.value)} inputMode="numeric" maxLength={40} />
          </FormField>
          <FormField etiqueta={t('moneda')} obligatorio ayuda={edicion ? t('monedaFija') : undefined}>
            {(c) => (
              <SelectNativo
                id={c.id}
                valor={form.currency}
                onCambiar={(v) => cambiar('currency', v)}
                deshabilitado={edicion}
                opciones={[...new Map([...monedas.map((m) => [m.code, m.name] as const), ...(form.currency ? [[form.currency, form.currency] as const] : [])]).entries()].map(([code, name]) => ({
                  valor: code,
                  etiqueta: code === name ? code : `${code} · ${name}`,
                }))}
              />
            )}
          </FormField>
        </div>
        <FormField etiqueta={t('cuentaContable')} obligatorio error={error('cuentaContable')} ayuda={t('cuentaContableAyuda')}>
          {(c) => (
            <SelectNativo
              id={c.id}
              valor={form.account_code}
              onCambiar={(v) => cambiar('account_code', v)}
              vacio={t('elegirCuenta')}
              opciones={elegibles.map((x) => ({ valor: x.account_code, etiqueta: `${x.account_code} · ${x.name}` }))}
              aria-invalid={c['aria-invalid']}
            />
          )}
        </FormField>
        {!edicion && (
          <div className="grid gap-4 sm:grid-cols-2">
            <BranchSelectorField value={sucursal} onChange={setSucursal} />
            <FormField etiqueta={t('saldoInicial')} error={error('saldoInicial')} ayuda={t('saldoInicialAyuda')}>
              {(c) => <CampoNumero id={c.id} valor={form.initial_balance} onValorChange={(v) => cambiar('initial_balance', v)} minimo={0} alinear="derecha" />}
            </FormField>
          </div>
        )}
        <RelatedLinkCard icono={Landmark} etiqueta={t('conectar.etiqueta')} valor={t('conectar.valor')} href="/app/finanzas/open-finance" textoAccion={t('conectar.accion')} />
      </div>
    </PanelAdaptable>
  );
}
