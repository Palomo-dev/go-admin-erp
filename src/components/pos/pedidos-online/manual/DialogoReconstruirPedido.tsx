'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AvisoTonal, CampoNumero, Dialogo, FilaDato, FormField, ListaDatos } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/kit/PhoneInput';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useBranch } from '@/lib/context/BranchContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { formatInstantWithOffset, wallTimeToInstant } from '@/lib/utils/dateCore';
import { SelectorProductosPedido, type LineaSeleccionada } from './SelectorProductosPedido';

export interface PrecargaReconstruir {
  connection_id: string;
  transaccion?: string | null;
  referencia?: string | null;
  valor?: number | null;
  fecha?: string | null;
}

interface Pasarela {
  id: string;
  connectorCode: string;
  nombre: string;
  consultable: boolean;
}

interface Cobro {
  estado: string;
  proveedor: string;
  transaccionId: string | null;
  referencia: string | null;
  montoCentavos: number | null;
  fecha: string | null;
  metodo: string | null;
}

interface Verificacion {
  cobro: Cobro;
  decision: { tipo: 'ya_existe' | 'completar' | 'crear' | 'crear_nuevo' | 'rechazar'; code?: string };
  sede_sugerida: number | null;
}

interface Props {
  organizationId: number;
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  precarga?: PrecargaReconstruir | null;
  onReconstruido: (r: { pedido: { id: string; order_number: string }; estado: string }) => void;
}

/**
 * Reconstruir un pedido pagado: pasarela conectada, referencia o ID de la transacción, valor,
 * fecha, cliente e ítems (obligatorios: las pasarelas no traen líneas). «Verificar» consulta la
 * pasarela sin escribir; solo con el cobro aprobado y el monto exacto se habilita «Reconstruir».
 * Sin prefijo WO-… de la tienda hay que confirmar la tienda antes de crear.
 */
export function DialogoReconstruirPedido({ organizationId, abierto, onAbiertoChange, precarga, onReconstruido }: Props) {
  const t = useTranslations('pedidosManuales.reconstruir');
  const { formatear } = useMonedaOrganizacion();
  const { formatDateTime, timezone } = useFormatDate();
  const { branches: todas, selectedBranchId } = useBranch();
  const branches = useMemo(() => todas.filter((b): b is typeof b & { id: number } => typeof b.id === 'number'), [todas]);
  const [pasarelas, setPasarelas] = useState<Pasarela[]>([]);
  const [conexion, setConexion] = useState('');
  const [modo, setModo] = useState<'referencia' | 'transaccion'>('referencia');
  const [clave, setClave] = useState('');
  const [valor, setValor] = useState<number | null>(null);
  const [fecha, setFecha] = useState('');
  const [sede, setSede] = useState('');
  const [cliente, setCliente] = useState({ nombre: '', celular: '', correo: '', direccion: '' });
  const [lineas, setLineas] = useState<LineaSeleccionada[]>([]);
  const [envio, setEnvio] = useState<number | null>(null);
  const [verificacion, setVerificacion] = useState<Verificacion | null>(null);
  const [confirmaTienda, setConfirmaTienda] = useState(false);
  const [ocupado, setOcupado] = useState<'verificar' | 'crear' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const aLocal = (iso: string | null | undefined) => (iso ? formatInstantWithOffset(new Date(iso), timezone).slice(0, 16) : '');

  useEffect(() => {
    if (!abierto) return;
    setVerificacion(null);
    setConfirmaTienda(false);
    setError(null);
    setLineas([]);
    setEnvio(null);
    setCliente({ nombre: '', celular: '', correo: '', direccion: '' });
    setSede(selectedBranchId ? String(selectedBranchId) : branches[0] ? String(branches[0].id) : '');
    setConexion(precarga?.connection_id ?? '');
    setModo(precarga?.transaccion ? 'transaccion' : 'referencia');
    setClave(precarga?.transaccion ?? precarga?.referencia ?? '');
    setValor(precarga?.valor ?? null);
    setFecha(aLocal(precarga?.fecha));
    let vivo = true;
    void fetch('/api/web-orders/reconstruir')
      .then((r) => r.json())
      .then((j) => {
        if (!vivo) return;
        const lista = (j?.pasarelas ?? []) as Pasarela[];
        setPasarelas(lista);
        if (!precarga?.connection_id && lista.length === 1) setConexion(lista[0].id);
      })
      .catch(() => vivo && setPasarelas([]));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se reinicia al abrir con la precarga
  }, [abierto, precarga]);

  const cuerpo = useMemo(() => {
    const [dia, hora] = fecha.split('T');
    return {
      connection_id: conexion,
      ...(modo === 'transaccion' ? { transaccion: clave.trim() } : { referencia: clave.trim() }),
      valor: valor ?? 0,
      fecha: dia && hora ? wallTimeToInstant(dia, hora, timezone).toISOString() : null,
      branch_id: sede ? Number(sede) : null,
      cliente: { nombre: cliente.nombre, celular: cliente.celular, correo: cliente.correo, direccion: cliente.direccion },
      items: lineas.map((l) => ({ product_id: l.product_id, quantity: l.quantity, unit_price: l.unit_price ?? null })),
      envio: envio ?? 0,
      delivery_type: (envio ?? 0) > 0 ? 'delivery_own' : 'pickup',
      confirmar_tienda: confirmaTienda,
    };
  }, [conexion, modo, clave, valor, fecha, timezone, sede, cliente, lineas, envio, confirmaTienda]);

  // Cualquier cambio en los datos del cobro invalida la verificación.
  useEffect(() => {
    setVerificacion(null);
    setConfirmaTienda(false);
  }, [conexion, modo, clave, valor]);

  const llamar = async (ruta: string) => {
    const res = await fetch(ruta, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
    return { ok: res.ok, json: await res.json().catch(() => ({})) };
  };

  const verificar = async () => {
    setOcupado('verificar');
    setError(null);
    try {
      const { ok, json } = await llamar('/api/web-orders/reconstruir/verificar');
      if (!ok) {
        setError(json?.error ?? t('errorVerificar'));
        return;
      }
      const v = json as Verificacion;
      setVerificacion(v);
      if (!fecha && v.cobro.fecha) setFecha(aLocal(v.cobro.fecha));
      if (v.decision.tipo === 'crear_nuevo' && v.sede_sugerida) setSede(String(v.sede_sugerida));
    } catch {
      setError(t('errorVerificar'));
    } finally {
      setOcupado(null);
    }
  };

  const reconstruir = async () => {
    setOcupado('crear');
    setError(null);
    try {
      const { ok, json } = await llamar('/api/web-orders/reconstruir');
      if (!ok) {
        if (json?.code === 'TOTAL_NO_CUADRA') setError(t('totalNoCuadra', { total: formatear(Number(json.total ?? 0)), valor: formatear(Number(json.valor ?? 0)) }));
        else setError(json?.error ?? t('errorReconstruir'));
        return;
      }
      onReconstruido(json);
    } catch {
      setError(t('errorReconstruir'));
    } finally {
      setOcupado(null);
    }
  };

  const tipo = verificacion?.decision.tipo;
  const necesitaItems = tipo === 'crear' || tipo === 'crear_nuevo';
  const faltante = !verificacion
    ? t('primeroVerificar')
    : tipo === 'rechazar'
      ? t(`rechazo.${verificacion.decision.code === 'OTRA_ORGANIZACION' ? 'otraTienda' : 'otraOrganizacion'}`)
      : necesitaItems && !cliente.nombre.trim()
        ? t('faltaNombre')
        : necesitaItems && lineas.length === 0
          ? t('faltanProductos')
          : necesitaItems && !sede
            ? t('faltaSede')
            : tipo === 'crear_nuevo' && !confirmaTienda
              ? t('faltaConfirmar')
              : null;
  const etiquetaPrimario = tipo === 'ya_existe' ? t('verPedido') : tipo === 'completar' ? t('completar') : t('reconstruir');
  const pasarela = pasarelas.find((p) => p.id === conexion);

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo')}
      descripcion={t('descripcion')}
      ancho={672}
      secundarios={[{ etiqueta: t('verificar'), onClick: () => void verificar(), cargando: ocupado === 'verificar', deshabilitada: !conexion || !clave.trim() || !valor }]}
      primario={{
        etiqueta: etiquetaPrimario,
        onClick: () => void reconstruir(),
        cargando: ocupado === 'crear',
        deshabilitada: !!faltante,
        motivo: faltante ?? undefined,
      }}
    >
      <div className="space-y-4">
        {pasarelas.length === 0 && <AvisoTonal tono="advertencia" titulo={t('sinPasarelas')} />}
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField etiqueta={t('pasarela')} obligatorio>
            {(c) => (
              <Select value={conexion} onValueChange={setConexion}>
                <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10">
                  <SelectValue placeholder={t('elegirPasarela')} />
                </SelectTrigger>
                <SelectContent>
                  {pasarelas.map((p) => (
                    <SelectItem key={p.id} value={p.id} disabled={!p.consultable}>
                      {p.nombre}
                      {!p.consultable ? ` · ${t('proximamente')}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField etiqueta={t('buscarPor')}>
            {(c) => (
              <Select value={modo} onValueChange={(v) => setModo(v as 'referencia' | 'transaccion')}>
                <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="referencia">{t('referencia')}</SelectItem>
                  <SelectItem value="transaccion">{t('transaccion')}</SelectItem>
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField etiqueta={modo === 'referencia' ? t('referencia') : t('transaccion')} obligatorio ayuda={pasarela?.connectorCode?.startsWith('bold') ? t('boldSoloId') : undefined}>
            <Input value={clave} maxLength={120} placeholder={modo === 'referencia' ? 'WO-333-…' : ''} onChange={(e) => setClave(e.target.value)} />
          </FormField>
          <FormField etiqueta={t('valor')} obligatorio>
            <CampoNumero valor={valor} onValorChange={setValor} minimo={0} decimales={0} />
          </FormField>
          <FormField etiqueta={t('fecha')} ayuda={t('fechaAyuda')}>
            <Input type="datetime-local" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </FormField>
        </div>

        {verificacion && (
          <ListaDatos className="rounded-lg bg-subtle px-3 py-2">
            <FilaDato etiqueta={t('estadoCobro')} valor={t('aprobado')} tono="fuerte" />
            <FilaDato etiqueta={t('referencia')} valor={verificacion.cobro.referencia ?? '—'} />
            <FilaDato etiqueta={t('transaccion')} valor={verificacion.cobro.transaccionId ?? '—'} />
            <FilaDato etiqueta={t('valor')} valor={formatear((verificacion.cobro.montoCentavos ?? 0) / 100)} />
            {verificacion.cobro.fecha && <FilaDato etiqueta={t('fecha')} valor={formatDateTime(verificacion.cobro.fecha)} />}
            {verificacion.cobro.metodo && <FilaDato etiqueta={t('metodo')} valor={verificacion.cobro.metodo} />}
          </ListaDatos>
        )}
        {tipo && <AvisoTonal tono={tipo === 'rechazar' ? 'peligro' : tipo === 'crear_nuevo' ? 'advertencia' : 'informacion'} titulo={t(`decision.${tipo}`)} />}

        {(necesitaItems || !verificacion) && (
          <>
            <fieldset className="grid gap-3 sm:grid-cols-2">
              <legend className="mb-1 text-sm font-medium text-fg">{t('cliente')}</legend>
              <FormField etiqueta={t('nombre')} obligatorio>
                <Input value={cliente.nombre} maxLength={120} onChange={(e) => setCliente({ ...cliente, nombre: e.target.value })} />
              </FormField>
              <FormField etiqueta={t('celular')}>
                {(c) => <PhoneInput id={c.id} value={cliente.celular} autoComplete="off" onChange={(v) => setCliente({ ...cliente, celular: v })} />}
              </FormField>
              <FormField etiqueta={t('correo')}>
                <Input type="email" value={cliente.correo} maxLength={160} onChange={(e) => setCliente({ ...cliente, correo: e.target.value })} />
              </FormField>
              <FormField etiqueta={t('direccion')}>
                <Input value={cliente.direccion} maxLength={300} onChange={(e) => setCliente({ ...cliente, direccion: e.target.value })} />
              </FormField>
            </fieldset>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField etiqueta={t('tienda')} obligatorio>
                {(c) => (
                  <Select value={sede} onValueChange={setSede}>
                    <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10">
                      <SelectValue placeholder={t('elegirTienda')} />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map((b) => (
                        <SelectItem key={b.id} value={String(b.id)}>
                          {b.name}
                          {verificacion?.sede_sugerida === b.id ? ` · ${t('sugerida')}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
              <FormField etiqueta={t('envio')}>
                <CampoNumero valor={envio} onValorChange={setEnvio} minimo={0} decimales={0} />
              </FormField>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-fg">{t('productos')}</p>
              <SelectorProductosPedido organizationId={organizationId} lineas={lineas} onCambiar={setLineas} conPrecio />
              <p className="text-xs text-fg-secondary">{t('productosAyuda')}</p>
            </div>
          </>
        )}

        {tipo === 'crear_nuevo' && (
          <label className="flex items-start gap-2 rounded-lg border border-line-warning bg-warning-subtle p-3 text-sm text-fg">
            <Checkbox checked={confirmaTienda} onCheckedChange={(v) => setConfirmaTienda(v === true)} className="mt-0.5" />
            <span>
              {t('confirmarTienda', { tienda: branches.find((b) => String(b.id) === sede)?.name ?? '—' })}
              <span className="block text-xs text-fg-secondary">{t('confirmarTiendaAyuda')}</span>
            </span>
          </label>
        )}

        {error && <AvisoTonal tono="peligro" titulo={error} />}
        {!verificacion && <p className="text-xs text-fg-secondary">{t('soloLectura')}</p>}
      </div>
    </Dialogo>
  );
}
