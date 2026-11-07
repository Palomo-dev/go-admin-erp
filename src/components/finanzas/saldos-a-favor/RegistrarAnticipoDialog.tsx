'use client';

/**
 * Registrar un anticipo del cliente (Figma `1021:91385`). Sustituye a
 * `NuevoSaldoFavorDialog` con el mismo flujo de servidor: el dinero entra como
 * un pago real con recibo (payments + caja abierta si es efectivo) y queda como
 * saldo a favor, en UNA RPC (`POST /api/saldos-a-favor` → `fn_saldo_favor_crear`)
 * con clave de idempotencia por apertura. Nunca una cuenta PUC escrita a mano.
 *
 * Cliente con `CustomerPicker` (búsqueda en el servidor, nunca la lista
 * completa); sucursal de la sesión por defecto; métodos de la organización.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { HandCoins } from 'lucide-react';
import {
  CampoFecha,
  CampoNumero,
  CustomerPicker,
  Dialogo,
  FormField,
  SelectorMetodoPago,
  simboloMoneda,
  type ClientePicker,
} from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toastSuccess } from '@/components/ui/use-toast';
import { useBranch } from '@/lib/context/BranchContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { listarClientes } from '@/lib/services/clientesListadoService';
import type { ContextoSaldoFavor, ResultadoCrearSaldo } from '@/lib/finanzas/saldosAFavor/contrato';
import { nuevaClaveIdempotencia, saldosAFavorService } from './saldosAFavorService';
import { metodoInicial, opcionesMetodoSaldo, requiereReferencia } from './metodosSaldo';
import { textoErrorSaldo } from './textosSaldo';

export interface RegistrarAnticipoDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  /** Cliente ya elegido (desde el filtro del listado). */
  clienteInicial?: ClientePicker | null;
  onRegistrado: (r: ResultadoCrearSaldo) => void;
}

export function RegistrarAnticipoDialog({ abierto, onAbiertoChange, clienteInicial, onRegistrado }: RegistrarAnticipoDialogProps) {
  const t = useTranslations('finanzasDocumentosR3.saldos');
  const moneda = useMonedaOrganizacion();
  const { branches, selectedBranchId, branchFilter } = useBranch();
  const [sucursal, setSucursal] = useState<number | null>(null);
  const [cliente, setCliente] = useState<ClientePicker | null>(null);
  const [contexto, setContexto] = useState<ContextoSaldoFavor | null>(null);
  const [monto, setMonto] = useState<number | null>(null);
  const [metodo, setMetodo] = useState<string | null>(null);
  const [cuenta, setCuenta] = useState('');
  const [referencia, setReferencia] = useState('');
  const [vence, setVence] = useState('');
  const [notas, setNotas] = useState('');
  const [tocado, setTocado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clave = useRef('');

  useEffect(() => {
    if (!abierto) return;
    setSucursal(branchFilter ?? selectedBranchId ?? branches[0]?.id ?? null);
    setCliente(clienteInicial ?? null);
    setMonto(null);
    setMetodo(null);
    setCuenta('');
    setReferencia('');
    setVence('');
    setNotas('');
    setTocado(false);
    setError(null);
    clave.current = nuevaClaveIdempotencia('anticipo');
    // Solo al abrir: la sucursal elegida en el diálogo no se pisa con la del contexto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  // Métodos de la organización y caja abierta de la sucursal elegida.
  useEffect(() => {
    if (!abierto || sucursal === null) return;
    let vigente = true;
    setContexto(null);
    setMetodo(null);
    saldosAFavorService
      .contexto(sucursal)
      .then((c) => vigente && setContexto(c))
      .catch((e) => vigente && setError(textoErrorSaldo(t, e)));
    return () => {
      vigente = false;
    };
  }, [abierto, sucursal, t]);

  const opciones = useMemo(() => opcionesMetodoSaldo(contexto, t('anticipo.sinCaja')), [contexto, t]);
  useEffect(() => {
    if (contexto && metodo === null) setMetodo(metodoInicial(opciones));
  }, [contexto, metodo, opciones]);

  const buscarClientes = useCallback(async (texto: string, _senal: AbortSignal, _filtros: readonly string[], desde: number) => {
    const r = await listarClientes({
      organizationId: getOrganizationId(),
      branchId: null,
      criterios: { busqueda: texto },
      orden: null,
      desde,
      tamano: 10,
    });
    const items: ClientePicker[] = r.filas.map((c) => ({
      id: c.id,
      nombre: c.full_name ?? c.company_name ?? '',
      documento: c.identification_number,
      correo: c.email,
      telefono: c.phone,
    }));
    return { items, total: r.total };
  }, []);

  const esEfectivo = metodo === 'cash';
  const sinCaja = esEfectivo && !!contexto && !contexto.caja.abierta;
  const conReferencia = requiereReferencia(contexto, metodo);
  const cuentas = contexto?.cuentasBancarias ?? [];
  const errores = {
    sucursal: sucursal === null ? t('validacion.sucursal') : null,
    cliente: !cliente ? t('validacion.cliente') : null,
    monto: !(monto !== null && monto > 0) ? t('validacion.vacio') : null,
    metodo: !metodo ? t('validacion.metodo') : null,
    referencia: conReferencia && !referencia.trim() ? t('validacion.referencia') : null,
  };
  const hayErrores = Object.values(errores).some(Boolean);

  const registrar = async () => {
    setTocado(true);
    if (hayErrores || sinCaja || !cliente || !metodo || monto === null || sucursal === null) return;
    setEnviando(true);
    setError(null);
    try {
      const r = await saldosAFavorService.crear({
        customerId: cliente.id,
        amount: monto,
        metodo,
        cuentaBancaria: !esEfectivo && cuenta ? Number(cuenta) : null,
        referencia,
        notes: notas,
        expiry: vence || null,
        branchId: sucursal,
        claveIdempotencia: clave.current,
      });
      toastSuccess(t('anticipo.exito', { recibo: r.recibo, monto: moneda.formatear(monto) }));
      onAbiertoChange(false);
      onRegistrado(r);
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
      titulo={t('anticipo.titulo')}
      descripcion={t('anticipo.descripcion')}
      icono={HandCoins}
      ancho={560}
      primario={{
        etiqueta: monto && monto > 0 ? t('anticipo.confirmarMonto', { monto: moneda.formatear(monto) }) : t('anticipo.confirmar'),
        onClick: () => void registrar(),
        cargando: enviando,
        deshabilitada: sinCaja || !contexto,
        motivo: sinCaja ? t('anticipo.sinCaja') : t('cargando'),
      }}
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField etiqueta={t('anticipo.sucursal')} obligatorio error={tocado ? errores.sucursal : null}>
            {(c) => (
              <Select value={sucursal !== null ? String(sucursal) : ''} onValueChange={(v) => setSucursal(Number(v))}>
                <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                  <SelectValue placeholder={t('anticipo.sucursalPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField etiqueta={t('anticipo.monto')} obligatorio error={tocado ? errores.monto : null}>
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
        </div>

        <div className="flex flex-col gap-1">
          <CustomerPicker
            layout="campo"
            cliente={cliente}
            etiqueta={t('anticipo.cliente')}
            buscar={buscarClientes}
            onCambiar={setCliente}
            onQuitar={() => setCliente(null)}
          />
          {tocado && errores.cliente && (
            <p role="alert" className="text-xs text-danger-text">
              {errores.cliente}
            </p>
          )}
        </div>

        <FormField etiqueta={t('anticipo.metodo')} obligatorio error={tocado ? errores.metodo : null}>
          {(c) =>
            contexto ? (
              <SelectorMetodoPago metodos={opciones} valor={metodo} onValorChange={setMetodo} etiqueta={t('anticipo.metodo')} />
            ) : (
              <p id={c.id} className="text-sm text-fg-muted">
                {t('cargando')}
              </p>
            )
          }
        </FormField>
        {sinCaja && <p className="text-sm text-danger-text">{t('anticipo.sinCaja')}</p>}

        {!esEfectivo && metodo && cuentas.length > 0 && (
          <FormField etiqueta={t('anticipo.cuenta')}>
            {(c) => (
              <Select value={cuenta} onValueChange={setCuenta}>
                <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                  <SelectValue placeholder={t('anticipo.cuentaPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {cuentas.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.name}
                      {b.ultimos ? ` ··${b.ultimos}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
        )}

        {conReferencia && (
          <FormField etiqueta={t('anticipo.referencia')} obligatorio error={tocado ? errores.referencia : null}>
            <Input value={referencia} onChange={(e) => setReferencia(e.target.value)} maxLength={200} />
          </FormField>
        )}

        <FormField etiqueta={t('anticipo.vence')} ayuda={t('anticipo.venceAyuda')}>
          {(c) => <CampoFecha id={c.id} min={contexto?.hoy || undefined} hoy={contexto?.hoy || undefined} valor={vence} onValorChange={setVence} />}
        </FormField>

        <FormField etiqueta={t('anticipo.notas')}>
          <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} maxLength={2000} placeholder={t('anticipo.notasPlaceholder')} />
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
