'use client';

/**
 * Nueva conciliación bancaria (Figma `2328:130897`), con el kit. Ruta nueva
 * `/app/finanzas/tesoreria/conciliacion/nueva` (la vieja `/conciliacion-bancaria/nuevo`
 * redirige). `?cuenta=<id>` llega elegida desde el detalle de una cuenta.
 *
 * Lógica de siempre: cuenta activa, periodo (inicio ≤ fin), saldo de apertura
 * = saldo actual en sistema, saldo del extracto opcional y extracto CSV/Excel
 * opcional que se importa al crear (`matrizDesdeArchivo` → `importarExtracto`).
 */
import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ListChecks, Upload } from 'lucide-react';
import { AvisoTonal, CampoFecha, CampoNumero, FormField, PageHeader, clasesBoton } from '@/components/kit';
import { ConciliacionService } from './ConciliacionService';
import { BankAccount } from '../bancos/BancosService';
import { LineaExtracto, matrizDesdeArchivo, parsearMatrizExtracto } from '@/lib/finanzas/conciliacion/extracto';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { formatMoneda } from '@/lib/utils/moneda';
import { RUTAS_TESORERIA, rutaConciliacion } from '@/lib/finanzas/tesoreria/rutas';
import { periodoAntesDelCorte } from '@/lib/finanzas/tesoreria/cuentasDinero';
import { formatPlainDate } from '@/lib/utils/dateDisplay';
import { SelectNativo } from '@/components/finanzas/tesoreria/compartido/TesoreriaComun';

export function NuevaConciliacionForm() {
  const t = useTranslations('finanzasTesoreriaR3.conciliacion.nuevaForm');
  const tc = useTranslations('finanzasTesoreriaR3.comun');
  const router = useRouter();
  const params = useSearchParams();
  const { paraDocumento } = useMonedaOrganizacion();
  const [isLoading, setIsLoading] = useState(false);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [formData, setFormData] = useState({ bank_account_id: '', period_start: '', period_end: '' });
  const [saldoExtracto, setSaldoExtracto] = useState<number | null>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [lineasExtracto, setLineasExtracto] = useState<LineaExtracto[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ConciliacionService.obtenerCuentasBancarias()
      .then((data) => {
        const activas = data.filter((a) => a.is_active);
        setAccounts(activas);
        const pedida = params?.get('cuenta');
        if (pedida && activas.some((a) => String(a.id) === pedida)) setFormData((f) => ({ ...f, bank_account_id: pedida }));
      })
      .catch(() => toast.error(t('errorCuentas')));
  }, [params, t]);

  const selectedAccount = accounts.find((a) => a.id.toString() === formData.bank_account_id) ?? null;
  const ctxMoneda = paraDocumento(selectedAccount?.currency);
  const moneda = { formatear: (v: number) => formatMoneda(v, ctxMoneda) };

  const elegirExtracto = async (file: File | null) => {
    setArchivo(file);
    setLineasExtracto([]);
    if (!file) return;
    try {
      const parseadas = parsearMatrizExtracto(await matrizDesdeArchivo(file));
      if (parseadas.length === 0) {
        toast.error(t('extractoVacio'));
        return;
      }
      setLineasExtracto(parseadas);
    } catch {
      toast.error(t('extractoIlegible'));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!formData.bank_account_id) return setError(t('errores.cuenta'));
    if (!formData.period_start || !formData.period_end) return setError(t('errores.periodo'));
    // Días `YYYY-MM-DD`: se comparan como texto (sin pasar por la zona del navegador).
    if (formData.period_start > formData.period_end) return setError(t('errores.orden'));
    if (archivo && lineasExtracto.length === 0) return setError(t('extractoVacio'));

    try {
      setIsLoading(true);
      const reconciliation = await ConciliacionService.crearConciliacion({
        bank_account_id: parseInt(formData.bank_account_id),
        period_start: formData.period_start,
        period_end: formData.period_end,
        opening_balance: selectedAccount?.balance || 0,
        statement_balance: saldoExtracto ?? undefined,
      });

      if (archivo && lineasExtracto.length > 0) {
        try {
          const formato = archivo.name.toLowerCase().endsWith('.csv') || archivo.name.toLowerCase().endsWith('.txt') ? 'csv' : 'excel';
          const resultado = await ConciliacionService.importarExtracto({
            bankAccountId: parseInt(formData.bank_account_id),
            reconciliationId: reconciliation.id,
            nombre: archivo.name,
            formato,
            lineas: lineasExtracto,
          });
          toast.success(t('creadaConExtracto', { emparejadas: resultado.emparejadas, lineas: resultado.lineas }));
        } catch {
          toast.error(t('creadaSinExtracto'));
        }
      } else {
        toast.success(t('creada'));
      }
      router.push(rutaConciliacion(reconciliation.id));
    } catch {
      setError(t('errores.crear'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        variante="form"
        titulo={t('titulo')}
        subtitulo={t('subtitulo')}
        icono={ListChecks}
        volverA={RUTAS_TESORERIA.conciliacion}
        migas={[
          { etiqueta: tc('migas.tesoreria'), href: RUTAS_TESORERIA.movimientos },
          { etiqueta: t('miga'), href: RUTAS_TESORERIA.conciliacion },
          { etiqueta: t('titulo') },
        ]}
      />
      <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-4 rounded-xl border border-line bg-surface p-4 sm:p-6">
        <FormField etiqueta={t('cuenta')} obligatorio>
          {(c) => (
            <SelectNativo
              id={c.id}
              valor={formData.bank_account_id}
              onCambiar={(v) => setFormData((f) => ({ ...f, bank_account_id: v }))}
              vacio={t('elegirCuenta')}
              opciones={accounts.map((a) => ({ valor: String(a.id), etiqueta: [a.name, a.bank_name].filter(Boolean).join(' · ') }))}
            />
          )}
        </FormField>
        <FormField
          etiqueta={t('saldoSistema')}
          ayuda={
            selectedAccount?.initial_balance_date
              ? t('saldoInicialCorte', {
                  saldo: moneda.formatear(selectedAccount.initial_balance ?? 0),
                  fecha: formatPlainDate(selectedAccount.initial_balance_date),
                })
              : t('saldoSistemaAyuda')
          }
        >
          {(c) => (
            <p id={c.id} className="flex h-10 items-center rounded-lg border border-line bg-subtle px-3 text-sm tabular-nums text-fg">
              {selectedAccount ? moneda.formatear(selectedAccount.balance) : '—'}
            </p>
          )}
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField etiqueta={t('inicio')} obligatorio>
            {(c) => (
              <CampoFecha id={c.id} valor={formData.period_start} onValorChange={(d) => setFormData((f) => ({ ...f, period_start: d }))} aria-labelledby={c.idEtiqueta} />
            )}
          </FormField>
          <FormField etiqueta={t('fin')} obligatorio>
            {(c) => (
              <CampoFecha id={c.id} valor={formData.period_end} onValorChange={(d) => setFormData((f) => ({ ...f, period_end: d }))} aria-labelledby={c.idEtiqueta} />
            )}
          </FormField>
        </div>
        {periodoAntesDelCorte(formData.period_start, selectedAccount?.initial_balance_date) && selectedAccount?.initial_balance_date && (
          <AvisoTonal
            tono="advertencia"
            compacto
            titulo={t('antesDelCorte', { fecha: formatPlainDate(selectedAccount.initial_balance_date) })}
          />
        )}
        <FormField etiqueta={t('saldoExtracto')} ayuda={t('saldoExtractoAyuda')}>
          {(c) => <CampoNumero id={c.id} valor={saldoExtracto} onValorChange={setSaldoExtracto} alinear="derecha" />}
        </FormField>
        <FormField etiqueta={t('extracto')} ayuda={archivo ? t('extractoLeido', { lineas: lineasExtracto.length, nombre: archivo.name }) : t('extractoAyuda')}>
          {(c) => (
            <label
              htmlFor={c.id}
              className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-dashed border-line-strong p-6 text-center text-sm text-fg hover:bg-subtle"
            >
              <Upload className="h-5 w-5 text-fg-secondary" aria-hidden />
              <span>{archivo ? archivo.name : t('extractoElegir')}</span>
              <span className="text-xs text-fg-tertiary">{t('extractoFormatos')}</span>
              <input
                id={c.id}
                type="file"
                accept=".csv,.txt,.xlsx,.xls"
                className="sr-only"
                onChange={(e) => void elegirExtracto(e.target.files?.[0] ?? null)}
              />
            </label>
          )}
        </FormField>
        {error && (
          <p role="alert" className="text-sm font-medium text-danger-text">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <button type="button" onClick={() => router.push(RUTAS_TESORERIA.conciliacion)} className={clasesBoton({ variante: 'secundario' })}>
            {tc('cancelar')}
          </button>
          <button type="submit" disabled={isLoading} className={clasesBoton({ variante: 'primario' })}>
            {isLoading ? tc('guardando') : t('crear')}
          </button>
        </div>
      </form>
    </div>
  );
}
