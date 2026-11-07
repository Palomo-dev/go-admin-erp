'use client';

/**
 * Aplicar un saldo a favor a una factura del cliente (Figma `1020:91650`).
 *
 * Facturas abiertas del cliente leídas en el servidor con la regla del pago
 * único (`GET /api/saldos-a-favor/contexto?cliente=`) y aplicación en UNA RPC
 * (`POST /api/saldos-a-favor/[id]/aplicar` → `fn_apply_customer_credit`), con
 * clave de idempotencia por apertura. El saldo de la factura lo recalcula la
 * base; aquí nunca se escribe.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { FileText } from 'lucide-react';
import { AvisoTonal, CampoNumero, Dialogo, FormField, simboloMoneda } from '@/components/kit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toastSuccess } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { montoPropuesto, validarMonto, type FilaListadoSaldo } from '@/lib/finanzas/saldosAFavor/listadoLogica';
import { nuevaClaveIdempotencia, saldosAFavorService, type FacturaPendiente } from './saldosAFavorService';
import { textoErrorSaldo } from './textosSaldo';

export interface AplicarSaldoDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  saldo: Pick<FilaListadoSaldo, 'id' | 'clienteId' | 'cliente' | 'disponible'> | null;
  onAplicado: () => void;
}

export function AplicarSaldoDialog({ abierto, onAbiertoChange, saldo, onAplicado }: AplicarSaldoDialogProps) {
  const t = useTranslations('finanzasDocumentosR3.saldos');
  const moneda = useMonedaOrganizacion();
  const { formatDate } = useFormatDate();
  const [facturas, setFacturas] = useState<FacturaPendiente[] | null>(null);
  const [errorFacturas, setErrorFacturas] = useState(false);
  const [facturaId, setFacturaId] = useState('');
  const [monto, setMonto] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tocado, setTocado] = useState(false);
  const clave = useRef('');

  useEffect(() => {
    if (!abierto || !saldo) return;
    let vigente = true;
    setFacturas(null);
    setErrorFacturas(false);
    setFacturaId('');
    setMonto(null);
    setError(null);
    setTocado(false);
    clave.current = nuevaClaveIdempotencia('aplicar');
    saldosAFavorService
      .listarFacturasPendientes(saldo.clienteId)
      .then((f) => vigente && setFacturas(f))
      .catch(() => {
        if (!vigente) return;
        setFacturas([]);
        setErrorFacturas(true);
      });
    return () => {
      vigente = false;
    };
  }, [abierto, saldo]);

  const factura = useMemo(() => facturas?.find((f) => f.id === facturaId) ?? null, [facturas, facturaId]);
  const disponible = saldo?.disponible ?? 0;
  const errorMonto = validarMonto(monto, disponible, factura ? Number(factura.balance) : null);
  const textoErrorMonto =
    tocado && errorMonto ? t(`validacion.${errorMonto}`, { monto: moneda.formatear(errorMonto === 'excede_factura' && factura ? Number(factura.balance) : disponible) }) : null;

  const elegir = (id: string) => {
    setFacturaId(id);
    const f = facturas?.find((x) => x.id === id);
    if (f) setMonto(montoPropuesto(disponible, Number(f.balance)));
  };

  const aplicar = async () => {
    setTocado(true);
    if (!saldo || !factura || errorMonto || monto === null) return;
    setEnviando(true);
    setError(null);
    try {
      await saldosAFavorService.aplicar({ creditId: saldo.id, invoiceId: factura.id, amount: monto, claveIdempotencia: clave.current });
      toastSuccess(t('aplicar.exito', { monto: moneda.formatear(monto), factura: factura.number }));
      onAbiertoChange(false);
      onAplicado();
    } catch (e) {
      setError(textoErrorSaldo(t, e));
    } finally {
      setEnviando(false);
    }
  };

  const restante = factura && monto ? Math.max(0, Number(factura.balance) - monto) : null;

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(v) => !enviando && onAbiertoChange(v)}
      titulo={t('aplicar.titulo')}
      descripcion={saldo ? t('aplicar.descripcion', { cliente: saldo.cliente ?? t('sinCliente'), disponible: moneda.formatear(disponible) }) : undefined}
      icono={FileText}
      ancho={520}
      primario={{
        etiqueta: monto && !errorMonto ? t('aplicar.confirmarMonto', { monto: moneda.formatear(monto) }) : t('aplicar.confirmar'),
        onClick: () => void aplicar(),
        cargando: enviando,
        deshabilitada: !factura,
        motivo: t('aplicar.eligeFactura'),
      }}
    >
      <div className="flex flex-col gap-4">
        <FormField etiqueta={t('aplicar.factura')} obligatorio error={errorFacturas ? t('aplicar.errorFacturas') : null}>
          {(c) => (
            <Select value={facturaId} onValueChange={elegir} disabled={!facturas || facturas.length === 0}>
              <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                <SelectValue placeholder={facturas === null ? t('cargando') : t('aplicar.facturaPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {(facturas ?? []).map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {t('aplicar.opcionFactura', {
                      numero: f.number,
                      saldo: moneda.formatear(Number(f.balance)),
                      fecha: f.issue_date ? formatDate(f.issue_date) : '—',
                    })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        {facturas !== null && facturas.length === 0 && !errorFacturas && <p className="text-sm text-fg-muted">{t('aplicar.sinFacturas')}</p>}

        <FormField
          etiqueta={t('aplicar.monto')}
          obligatorio
          error={textoErrorMonto}
          ayuda={t('aplicar.hasta', { monto: moneda.formatear(factura ? Math.min(disponible, Number(factura.balance)) : disponible) })}
        >
          {(c) => (
            <CampoNumero
              id={c.id}
              aria-describedby={c['aria-describedby']}
              aria-invalid={c['aria-invalid']}
              valor={monto}
              onValorChange={(v) => {
                setTocado(true);
                setMonto(v);
              }}
              minimo={0}
              prefijo={simboloMoneda(moneda.paraDocumento(null))}
            />
          )}
        </FormField>

        {factura && monto !== null && !errorMonto && (
          <AvisoTonal
            tono="informacion"
            titulo={t('aplicar.quePasaTitulo')}
            descripcion={t('aplicar.quePasa', {
              monto: moneda.formatear(monto),
              factura: factura.number,
              restante: moneda.formatear(restante ?? 0),
              disponible: moneda.formatear(Math.max(0, disponible - monto)),
            })}
          />
        )}
        {error && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}
      </div>
    </Dialogo>
  );
}
