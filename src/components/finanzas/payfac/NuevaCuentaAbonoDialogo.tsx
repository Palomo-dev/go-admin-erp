'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Dialogo, FormField } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/lib/supabase/config';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useBranch } from '@/lib/context/BranchContext';
import {
  TITULAR_NO_COINCIDE,
  titularCoincideConOrganizacion,
  type DatosOrganizacionTitular,
} from '@/lib/services/integrations/payfac/cuentaAbonoReglas';
import {
  camposFaltantesCuenta,
  cuerpoNuevaCuenta,
  ErrorApiCobros,
  pedirApi,
  ultimosDigitos,
  type CampoObligatorioCuenta,
  type FormularioCuentaAbono,
  type TipoCuentaBanco,
  type TipoDocumentoTitular,
} from './cobrosLogica';

interface CuentaBancaria {
  id: number;
  name: string;
  bank_name: string;
  account_number: string;
  account_type: string;
}

const VACIO: FormularioCuentaAbono = {
  bankAccountId: null,
  bankName: '',
  accountType: 'savings',
  accountNumber: '',
  accountHolderName: '',
  accountHolderIdType: 'NIT',
  accountHolderId: '',
  brebKeyValue: '',
};

const TIPOS_DOC: readonly TipoDocumentoTitular[] = ['NIT', 'CC', 'CE', 'PEP'];
const CLASE_CONTROL = 'h-10 border-line-strong bg-surface';

/**
 * «Nueva cuenta de abono» (A10, captura 82-finanzas-r2-10). Mismos campos que
 * antes; el titular sale de la organización y debe coincidir con ella (el
 * servidor lo vuelve a comprobar: 422 `titular_no_coincide`).
 */
export function NuevaCuentaAbonoDialogo({
  abierto,
  onAbiertoChange,
  onCreada,
}: {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  onCreada: () => void;
}) {
  const t = useTranslations('finanzasCobrosR2');
  const { organization } = useOrganization();
  const orgId = organization?.id;
  const { branchFilter } = useBranch();
  const [form, setForm] = useState<FormularioCuentaAbono>(VACIO);
  const [org, setOrg] = useState<DatosOrganizacionTitular | null>(null);
  const [cuentasBanco, setCuentasBanco] = useState<CuentaBancaria[]>([]);
  const [faltantes, setFaltantes] = useState<CampoObligatorioCuenta[]>([]);
  const [errorTitular, setErrorTitular] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  // Al abrir: datos de la organización (para el titular) y sus cuentas bancarias.
  useEffect(() => {
    if (!abierto || !orgId) return;
    let vigente = true;
    setFaltantes([]);
    setErrorTitular(null);
    void supabase
      .from('organizations')
      .select('name, legal_name, nit, tax_id')
      .eq('id', orgId)
      .maybeSingle()
      .then(({ data }) => {
        if (!vigente) return;
        const datos = (data ?? null) as DatosOrganizacionTitular | null;
        setOrg(datos);
        const nit = datos?.nit || datos?.tax_id || '';
        setForm({
          ...VACIO,
          accountHolderName: datos?.legal_name || datos?.name || '',
          accountHolderIdType: nit ? 'NIT' : 'CC',
          accountHolderId: nit,
        });
      });
    let consulta = supabase
      .from('bank_accounts')
      .select('id, name, bank_name, account_number, account_type')
      .eq('organization_id', orgId)
      .eq('is_active', true);
    if (branchFilter != null) consulta = consulta.eq('branch_id', branchFilter);
    void consulta.then(({ data, error }) => {
      if (error) console.error('Error cargando cuentas bancarias:', error);
      if (vigente) setCuentasBanco((data ?? []) as CuentaBancaria[]);
    });
    return () => {
      vigente = false;
    };
  }, [abierto, orgId, branchFilter]);

  const poner = <K extends keyof FormularioCuentaAbono>(campo: K, valor: FormularioCuentaAbono[K]) => {
    setForm((f) => ({ ...f, [campo]: valor }));
    setFaltantes((l) => l.filter((c) => c !== campo));
    if (campo === 'accountHolderName' || campo === 'accountHolderId') setErrorTitular(null);
  };

  const elegirCuentaBanco = (valor: string) => {
    if (valor === 'ninguna') {
      poner('bankAccountId', null);
      return;
    }
    const cuenta = cuentasBanco.find((c) => c.id === Number(valor));
    if (!cuenta) return;
    setForm((f) => ({
      ...f,
      bankAccountId: cuenta.id,
      bankName: cuenta.bank_name || f.bankName,
      accountNumber: cuenta.account_number || f.accountNumber,
      accountType: cuenta.account_type === 'checking' ? 'checking' : cuenta.account_type === 'savings' ? 'savings' : f.accountType,
    }));
    setFaltantes((l) => l.filter((c) => c !== 'bankName' && c !== 'accountNumber'));
  };

  const guardar = async () => {
    const faltan = camposFaltantesCuenta(form);
    setFaltantes(faltan);
    if (faltan.length > 0) return;
    if (org && !titularCoincideConOrganizacion({ nombre: form.accountHolderName, documento: form.accountHolderId }, org)) {
      setErrorTitular(t('nuevaCuenta.errores.titular'));
      return;
    }
    setGuardando(true);
    try {
      await pedirApi('/api/integrations/payfac/payout-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpoNuevaCuenta(form)),
      });
      toast.success(t('nuevaCuenta.creada'));
      onAbiertoChange(false);
      onCreada();
    } catch (e) {
      console.error('Error creando la cuenta de abono:', e);
      if (e instanceof ErrorApiCobros && e.codigo === TITULAR_NO_COINCIDE) {
        setErrorTitular(t('nuevaCuenta.errores.titular'));
      } else {
        toast.error(t('nuevaCuenta.errores.guardar'));
      }
    } finally {
      setGuardando(false);
    }
  };

  const error = (campo: CampoObligatorioCuenta) => (faltantes.includes(campo) ? t('nuevaCuenta.errores.obligatorio') : null);

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(a) => !guardando && onAbiertoChange(a)}
      titulo={t('nuevaCuenta.titulo')}
      descripcion={t('nuevaCuenta.descripcion')}
      ancho={560}
      primario={{ etiqueta: t('nuevaCuenta.guardar'), onClick: () => void guardar(), cargando: guardando }}
    >
      <div className="flex flex-col gap-4">
        <FormField etiqueta={t('nuevaCuenta.campos.cuentaGoAdmin')} ayuda={t('nuevaCuenta.ayudas.cuentaGoAdmin')}>
          {(c) => (
            <Select value={form.bankAccountId ? String(form.bankAccountId) : 'ninguna'} onValueChange={elegirCuentaBanco}>
              <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} aria-describedby={c['aria-describedby']} className={CLASE_CONTROL}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ninguna">{t('nuevaCuenta.sinVincular')}</SelectItem>
                {cuentasBanco.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {[`${b.bank_name || b.name} ${ultimosDigitos(b.account_number)}`, b.account_type === 'checking' || b.account_type === 'savings' ? t(`cuenta.tipos.${b.account_type}`) : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField etiqueta={t('nuevaCuenta.campos.banco')} obligatorio error={error('bankName')}>
            <Input value={form.bankName} onChange={(e) => poner('bankName', e.target.value)} className={CLASE_CONTROL} />
          </FormField>
          <FormField etiqueta={t('nuevaCuenta.campos.tipoCuenta')} obligatorio>
            {(c) => (
              <Select value={form.accountType} onValueChange={(v) => poner('accountType', v as TipoCuentaBanco)}>
                <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className={CLASE_CONTROL}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="savings">{t('cuenta.tipos.savings')}</SelectItem>
                  <SelectItem value="checking">{t('cuenta.tipos.checking')}</SelectItem>
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField etiqueta={t('nuevaCuenta.campos.numero')} obligatorio error={error('accountNumber')}>
            <Input value={form.accountNumber} onChange={(e) => poner('accountNumber', e.target.value)} inputMode="numeric" className={CLASE_CONTROL} />
          </FormField>
          <FormField etiqueta={t('nuevaCuenta.campos.titular')} obligatorio error={error('accountHolderName') ?? errorTitular}>
            <Input value={form.accountHolderName} onChange={(e) => poner('accountHolderName', e.target.value)} className={CLASE_CONTROL} />
          </FormField>
          <FormField etiqueta={t('nuevaCuenta.campos.tipoDocumento')} obligatorio>
            {(c) => (
              <Select value={form.accountHolderIdType} onValueChange={(v) => poner('accountHolderIdType', v as TipoDocumentoTitular)}>
                <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className={CLASE_CONTROL}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_DOC.map((d) => (
                    <SelectItem key={d} value={d}>
                      {t(`nuevaCuenta.tiposDocumento.${d}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField etiqueta={t('nuevaCuenta.campos.documento')} obligatorio error={error('accountHolderId')}>
            <Input value={form.accountHolderId} onChange={(e) => poner('accountHolderId', e.target.value)} className={CLASE_CONTROL} />
          </FormField>
        </div>

        <FormField etiqueta={t('nuevaCuenta.campos.llaveBreb')} ayuda={t('nuevaCuenta.ayudas.llaveBreb')}>
          <Input value={form.brebKeyValue} onChange={(e) => poner('brebKeyValue', e.target.value)} className={CLASE_CONTROL} />
        </FormField>
      </div>
    </Dialogo>
  );
}
