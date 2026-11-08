'use client';

/**
 * Vincular un anticipo a una factura de compra en BORRADOR (ronda 2 del
 * Contador, ítem 5): la retención repetida se evita al reconocer la factura. Con
 * el vínculo, al causarla la base no deja retener otra vez sobre la base ya
 * retenida en el anticipo (solo sobre la restante); después se aplica el
 * anticipo sin nada que corregir.
 *
 * `GET/POST /api/anticipos-proveedor/[id]/vincular` → `fn_anticipo_proveedor_vincular_factura`.
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link2 } from 'lucide-react';
import { AvisoTonal, CampoNumero, Dialogo, FormField, simboloMoneda } from '@/components/kit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toastSuccess } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import type { FilaAnticipoProveedor } from '@/lib/finanzas/anticiposProveedor/contrato';
import { textoErrorSaldo } from '@/components/finanzas/saldos-a-favor/textosSaldo';
import { anticiposProveedorService, type FacturaVinculable } from './anticiposProveedorService';

const NS = 'finanzasTercerosR4.anticipos';

export interface VincularFacturaDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  anticipo: Pick<FilaAnticipoProveedor, 'id' | 'proveedor' | 'saldo' | 'retencion'> | null;
  onVinculado: () => void;
}

export function VincularFacturaDialog({ abierto, onAbiertoChange, anticipo, onVinculado }: VincularFacturaDialogProps) {
  const t = useTranslations(NS);
  const moneda = useMonedaOrganizacion();
  const { formatDate } = useFormatDate();
  const [facturas, setFacturas] = useState<FacturaVinculable[] | null>(null);
  const [facturaId, setFacturaId] = useState('');
  const [monto, setMonto] = useState<number | null>(null);
  const [tocado, setTocado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto || !anticipo) return;
    let vigente = true;
    setFacturas(null);
    setFacturaId('');
    setMonto(anticipo.saldo);
    setTocado(false);
    setError(null);
    anticiposProveedorService
      .facturasVinculables(anticipo.id)
      .then((r) => vigente && setFacturas(r.facturas))
      .catch((e) => {
        if (!vigente) return;
        setFacturas([]);
        setError(textoErrorSaldo(t, e));
      });
    return () => {
      vigente = false;
    };
  }, [abierto, anticipo, t]);

  const saldo = anticipo?.saldo ?? 0;
  const errorMonto = monto === null || monto <= 0 ? 'requerido' : monto > saldo ? 'excede' : null;

  const elegir = (id: string) => {
    setFacturaId(id);
    const f = facturas?.find((x) => x.id === id);
    if (f) setMonto(Math.min(saldo, f.total > 0 ? f.total : saldo));
  };

  const vincular = async () => {
    setTocado(true);
    if (!anticipo || !facturaId || errorMonto || monto === null) return;
    setEnviando(true);
    setError(null);
    try {
      await anticiposProveedorService.vincular(anticipo.id, { facturaId, monto });
      const f = facturas?.find((x) => x.id === facturaId);
      toastSuccess(t('vincular.exito', { factura: f?.numero || '—', monto: moneda.formatear(monto) }));
      onAbiertoChange(false);
      onVinculado();
    } catch (e) {
      setError(textoErrorSaldo(t, e));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(v) => !enviando && onAbiertoChange(v)}
      titulo={t('vincular.titulo')}
      descripcion={anticipo ? t('vincular.descripcion', { proveedor: anticipo.proveedor || t('sinProveedor'), saldo: moneda.formatear(saldo) }) : undefined}
      icono={Link2}
      ancho={520}
      primario={{
        etiqueta: t('vincular.confirmar'),
        onClick: () => void vincular(),
        cargando: enviando,
        deshabilitada: !facturaId,
        motivo: t('vincular.eligeFactura'),
      }}
    >
      <div className="flex flex-col gap-4">
        <AvisoTonal tono="informacion" titulo={t('vincular.porQueTitulo')} descripcion={t('vincular.porQue')} />
        <FormField etiqueta={t('vincular.factura')} obligatorio>
          {(c) => (
            <Select value={facturaId} onValueChange={elegir} disabled={!facturas || facturas.length === 0}>
              <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                <SelectValue placeholder={facturas === null ? t('cargando') : t('vincular.facturaPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {(facturas ?? []).map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {t('vincular.opcion', {
                      numero: f.numero || '—',
                      total: moneda.formatear(f.total),
                      fecha: f.fecha ? formatDate(f.fecha) : '—',
                    })}
                    {f.vinculado ? ` · ${t('vincular.yaVinculado', { monto: moneda.formatear(f.vinculado) })}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        {facturas !== null && facturas.length === 0 && !error && <p className="text-sm text-fg-muted">{t('vincular.sinBorradores')}</p>}
        <FormField
          etiqueta={t('vincular.monto')}
          obligatorio
          ayuda={t('vincular.hasta', { monto: moneda.formatear(saldo) })}
          error={tocado && errorMonto ? t(errorMonto === 'excede' ? 'validacion.excede' : 'validacion.requerido', { monto: moneda.formatear(saldo) }) : null}
        >
          {(c) => (
            <CampoNumero
              id={c.id}
              aria-describedby={c['aria-describedby']}
              aria-invalid={c['aria-invalid']}
              valor={monto}
              onValorChange={setMonto}
              minimo={0}
              prefijo={simboloMoneda(moneda.paraDocumento(null))}
            />
          )}
        </FormField>
        {error && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}
      </div>
    </Dialogo>
  );
}
