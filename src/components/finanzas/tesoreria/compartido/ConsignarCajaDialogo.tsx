'use client';

/**
 * Consignar caja a banco (Tesorería v2, `1004:82448`): sale de la caja y entra
 * al banco en una sola operación (`POST /api/tesoreria/consignaciones` →
 * `fn_consignacion_caja_banco`). Lo abren Movimientos («Nuevo › Consignar caja
 * a banco») y la tarjeta de una caja en Cuentas de dinero.
 *
 * En caja, superar el esperado AVISA y no bloquea (decisión del dueño). Sin
 * caja abierta: estado «sin caja abierta» con el enlace a abrirla en el POS.
 * El id de la consignación (idempotencia) se genera al abrir el diálogo: un
 * doble clic o un reintento devuelve la misma operación.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { AvisoTonal, CampoFecha, CampoNumero, Dialogo, FormField } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { transferenciasService, type BankAccount } from '@/lib/services/transferenciasService';
import { efectoEnCuenta } from '@/lib/finanzas/tesoreria/efectoEnCuenta';
import { totalSaleDeCaja } from '@/lib/finanzas/tesoreria/consignacion';
import { EfectoEnCuentaTarjeta, SelectNativo } from './TesoreriaComun';
import { useCajasDinero } from './useCajasDinero';

export interface ConsignarCajaDialogoProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  onHecha: () => void;
  /** Caja elegida al abrir (desde su tarjeta). */
  sesionInicial?: number | null;
}

export function ConsignarCajaDialogo({ abierto, onAbiertoChange, onHecha, sesionInicial }: ConsignarCajaDialogoProps) {
  const t = useTranslations('finanzasTesoreriaR3.consignar');
  const te = useTranslations('tesoreria');
  const { formatear } = useMonedaOrganizacion();
  const { getToday } = useFormatDate();
  const { cajas, estado: estadoCajas, recargar } = useCajasDinero(abierto);
  const clave = useRef('');
  const [bancos, setBancos] = useState<BankAccount[]>([]);
  const [sesion, setSesion] = useState('');
  const [banco, setBanco] = useState('');
  const [monto, setMonto] = useState<number | null>(null);
  const [comision, setComision] = useState<number | null>(null);
  const [fecha, setFecha] = useState('');
  const [referencia, setReferencia] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto) return;
    clave.current = globalThis.crypto.randomUUID();
    setSesion(sesionInicial ? String(sesionInicial) : '');
    setBanco('');
    setMonto(null);
    setComision(null);
    setFecha(getToday());
    setReferencia('');
    setError(null);
    transferenciasService
      .getBankAccounts()
      .then(setBancos)
      .catch(() => toast.error(te('errorCarga.cuentasBancarias')));
  }, [abierto, sesionInicial, getToday, te]);

  // Una sola caja abierta: se elige sola.
  useEffect(() => {
    if (abierto && !sesion && cajas.length === 1) setSesion(String(cajas[0].sesion_id));
  }, [abierto, sesion, cajas]);

  const caja = cajas.find((c) => String(c.sesion_id) === sesion) ?? null;
  const cuentaBanco = bancos.find((b) => String(b.id) === banco) ?? null;
  const total = totalSaleDeCaja(monto, comision);
  const efecto = useMemo(
    () => efectoEnCuenta({ saldo: caja ? caja.saldo : null, importe: total, sentido: 'salida', cuenta: 'caja' }),
    [caja, total],
  );
  const nombreCaja = (c: (typeof cajas)[number]) =>
    [c.sucursal?.nombre ?? t('cajaGlobal'), c.responsable.nombre].filter(Boolean).join(' · ');

  const sinCaja = estadoCajas === 'listo' && cajas.length === 0;

  const guardar = async () => {
    setError(null);
    if (!sesion) return setError(t('errores.caja'));
    if (!banco) return setError(t('errores.banco'));
    if (!monto || monto <= 0) return setError(te('errores.monto_invalido'));
    setGuardando(true);
    try {
      const org = getOrganizationId();
      const r = await fetch('/api/tesoreria/consignaciones', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', ...(org ? { 'x-organization-id': String(org) } : {}) },
        body: JSON.stringify({
          id: clave.current,
          sesionId: Number(sesion),
          cuentaBancoId: Number(banco),
          monto,
          comision: comision ?? 0,
          fecha,
          referencia,
        }),
      });
      const d = (await r.json().catch(() => ({}))) as { codigo?: string; repetida?: boolean };
      if (!r.ok) {
        const codigo = d.codigo ?? 'desconocido';
        setError(
          t.has(`errores.${codigo}`) ? t(`errores.${codigo}`) : te.has(`errores.${codigo}`) ? te(`errores.${codigo}`) : te('errores.desconocido'),
        );
        return;
      }
      toast.success(t('exito', { monto: formatear(monto) }));
      void recargar();
      onHecha();
    } catch {
      setError(te('errores.desconocido'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(a) => !guardando && onAbiertoChange(a)}
      titulo={t('titulo')}
      descripcion={t('descripcion')}
      icono={ArrowLeftRight}
      ancho={880}
      primario={{
        etiqueta: total > 0 ? t('confirmarCon', { monto: formatear(total) }) : t('confirmar'),
        onClick: () => void guardar(),
        cargando: guardando,
        deshabilitada: sinCaja,
        motivo: sinCaja ? t('sinCaja.titulo') : undefined,
      }}
    >
      {sinCaja ? (
        <AvisoTonal
          tono="advertencia"
          titulo={t('sinCaja.titulo')}
          descripcion={t('sinCaja.descripcion')}
          accion={{ etiqueta: t('sinCaja.abrir'), href: '/app/pos/cajas' }}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <FormField etiqueta={t('desde')} obligatorio>
              {(c) => (
                <SelectNativo
                  id={c.id}
                  valor={sesion}
                  onCambiar={setSesion}
                  vacio={estadoCajas === 'cargando' ? t('cargando') : t('elegirCaja')}
                  opciones={cajas.map((x) => ({
                    valor: String(x.sesion_id),
                    etiqueta: `${nombreCaja(x)} · ${x.saldo === null ? t('saldoOculto') : t('disponible', { monto: formatear(x.saldo) })}`,
                  }))}
                />
              )}
            </FormField>
            <FormField etiqueta={t('hacia')} obligatorio>
              {(c) => (
                <SelectNativo
                  id={c.id}
                  valor={banco}
                  onCambiar={setBanco}
                  vacio={t('elegirBanco')}
                  opciones={bancos.map((b) => ({ valor: String(b.id), etiqueta: [b.name, b.bank_name].filter(Boolean).join(' · ') }))}
                />
              )}
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField etiqueta={t('monto')} obligatorio>
                {(c) => <CampoNumero id={c.id} valor={monto} onValorChange={setMonto} minimo={0} alinear="derecha" />}
              </FormField>
              <FormField etiqueta={t('comision')} ayuda={t('comisionAyuda')}>
                {(c) => <CampoNumero id={c.id} valor={comision} onValorChange={setComision} minimo={0} alinear="derecha" />}
              </FormField>
            </div>
            <FormField etiqueta={t('fecha')} obligatorio>
              {(c) => <CampoFecha id={c.id} valor={fecha} onValorChange={setFecha} limpiable={false} aria-labelledby={c.idEtiqueta} />}
            </FormField>
            <FormField etiqueta={t('referencia')}>
              <Input value={referencia} onChange={(e) => setReferencia(e.target.value)} maxLength={120} />
            </FormField>
            {error && (
              <p role="alert" className="text-sm font-medium text-danger-text">
                {error}
              </p>
            )}
          </div>
          <div className="space-y-3">
            <EfectoEnCuentaTarjeta
              cuenta={caja ? `${nombreCaja(caja)}${cuentaBanco ? ` → ${cuentaBanco.name}` : ''}` : t('sinCajaElegida')}
              efecto={efecto}
              formatear={formatear}
              nota={monto ? t('entraNota', { monto: formatear(monto), comision: formatear(comision ?? 0) }) : undefined}
            />
            <p className="text-xs text-fg-secondary">{t('asientoNota')}</p>
          </div>
        </div>
      )}
    </Dialogo>
  );
}
