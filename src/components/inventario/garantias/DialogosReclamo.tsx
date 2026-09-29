'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle, CheckCircle2, Eye, ScanBarcode, Truck, Wrench, XCircle } from 'lucide-react';
import { CampoNumero, Dialogo, DialogoMotivo, FormField, SupplierPicker, simboloMoneda, type AccionFila } from '@/components/kit';
import type { ProveedorPicker } from '@/components/kit/selectorEntidadLogica';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { supplierService } from '@/lib/services/supplierService';
import { ErrorPeticionSeriales, clienteGarantias } from '@/lib/services/seriales/cliente';
import { TIPOS_RESOLUCION, type PermisosSeriales, type SerialReemplazo, type TerceroRef, type TipoResolucion } from '@/lib/services/seriales/contrato';
import { useEtiquetaEstadoSerialB4 } from '@/components/inventario/seriales/piezas';
import { rutaReclamo, rutaSerial } from '@/components/inventario/seriales/logica';
import { accionesReclamo, estadoUnidadAlResolver, validarResolucion, validarRma } from './logica';

/** Lo mínimo de un reclamo para sus acciones (fila del listado o detalle). */
export interface ReclamoAccionable {
  id: string;
  codigo: string | null;
  estado: string;
  serial: { id: number; serial: string };
  producto: { nombre: string } | null;
  cliente: TerceroRef | null;
  proveedor: TerceroRef | null;
}

function useMensajeError() {
  const te = useTranslations('inventarioGarantias.errores');
  return useCallback(
    (e: unknown) => {
      const codigo = e instanceof ErrorPeticionSeriales ? e.codigo : 'error_desconocido';
      return te.has(codigo) ? te(codigo) : te('error_desconocido');
    },
    [te],
  );
}

// ── Enviar al proveedor (RMA) ────────────────────────────────────────────────

/** «Enviar al proveedor (RMA)» (Figma 973:186133): proveedor, número de RMA, transportadora, guía y notas. */
export function DialogoEnviarRma({
  reclamo,
  onCerrar,
  onHecho,
}: {
  reclamo: ReclamoAccionable | null;
  onCerrar: () => void;
  onHecho: () => void;
}) {
  const t = useTranslations('inventarioGarantias.rma');
  const mensajeError = useMensajeError();
  const { toast } = useToast();
  const [proveedor, setProveedor] = useState<ProveedorPicker | null>(null);
  const [rma, setRma] = useState('');
  const [transportadora, setTransportadora] = useState('');
  const [guia, setGuia] = useState('');
  const [notas, setNotas] = useState('');
  const [intento, setIntento] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!reclamo) return;
    setProveedor(reclamo.proveedor?.id ? { id: String(reclamo.proveedor.id), nombre: reclamo.proveedor.nombre ?? '' } : null);
    setRma('');
    setTransportadora('');
    setGuia('');
    setNotas('');
    setIntento(false);
    setError(null);
  }, [reclamo]);

  const buscarProveedores = useCallback(async (texto: string): Promise<ProveedorPicker[]> => {
    const { items } = await supplierService.listarProveedores(getOrganizationId(), { busqueda: texto, estado: 'activo', limite: 10 });
    return items.map((p) => ({ id: String(p.id), nombre: p.name, nit: p.nit ?? null, contacto: p.contact ?? null, telefono: p.phone ?? null }));
  }, []);

  const errorRma = validarRma({ rma });

  const enviar = async () => {
    setIntento(true);
    if (!reclamo || errorRma) return;
    setGuardando(true);
    setError(null);
    try {
      await clienteGarantias.enviarRma(reclamo.id, {
        rma: rma.trim(),
        proveedor: proveedor ? Number(proveedor.id) : null,
        transportadora: transportadora.trim() || null,
        guia: guia.trim() || null,
        notas: notas.trim() || null,
      });
      toast({ title: t('enviado', { codigo: reclamo.codigo ?? '' }) });
      onHecho();
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialogo
      abierto={reclamo !== null}
      onAbiertoChange={(v) => !v && onCerrar()}
      titulo={t('titulo')}
      descripcion={reclamo ? t('descripcion', { codigo: reclamo.codigo ?? '', serial: reclamo.serial.serial }) : undefined}
      ancho={560}
      primario={{ etiqueta: t('enviar'), onClick: enviar, cargando: guardando }}
    >
      <div className="flex flex-col gap-4">
        <FormField etiqueta={t('proveedor')}>
          {(c) => (
            <SupplierPicker
              id={c.id}
              proveedor={proveedor}
              buscar={(texto) => buscarProveedores(texto)}
              onCambiar={setProveedor}
              onQuitar={() => setProveedor(null)}
              etiqueta={t('proveedor')}
            />
          )}
        </FormField>
        <FormField etiqueta={t('numero')} obligatorio error={intento && errorRma ? t('errorNumero') : undefined}>
          <Input value={rma} onChange={(e) => setRma(e.target.value)} maxLength={80} placeholder={t('numeroPlaceholder')} className="h-10" autoFocus />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField etiqueta={t('transportadora')}>
            <Input value={transportadora} onChange={(e) => setTransportadora(e.target.value)} maxLength={120} className="h-10" />
          </FormField>
          <FormField etiqueta={t('guia')}>
            <Input value={guia} onChange={(e) => setGuia(e.target.value)} maxLength={120} className="h-10" />
          </FormField>
        </div>
        <FormField etiqueta={t('notas')}>
          <Input value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={1000} className="h-10" />
        </FormField>
        <p className="rounded-lg bg-info-subtle px-3 py-2.5 text-[13px] text-info-text">{t('nota')}</p>
        {error && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}
      </div>
    </Dialogo>
  );
}

// ── Resolver ─────────────────────────────────────────────────────────────────

/** «Resolver reclamo» (Figma 592:332635, 520 px): reparación, reemplazo por otra unidad o reembolso. */
export function DialogoResolverReclamo({
  reclamo,
  onCerrar,
  onHecho,
}: {
  reclamo: ReclamoAccionable | null;
  onCerrar: () => void;
  onHecho: () => void;
}) {
  const t = useTranslations('inventarioGarantias.resolver');
  const etiquetaEstado = useEtiquetaEstadoSerialB4();
  const mensajeError = useMensajeError();
  const { toast } = useToast();
  const moneda = useMonedaOrganizacion();
  const [tipo, setTipo] = useState<TipoResolucion | ''>('');
  const [reemplazos, setReemplazos] = useState<SerialReemplazo[] | null>(null);
  const [reemplazo, setReemplazo] = useState<string>('');
  const [monto, setMonto] = useState<number | null>(null);
  const [notas, setNotas] = useState('');
  const [intento, setIntento] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!reclamo) return;
    setTipo('');
    setReemplazos(null);
    setReemplazo('');
    setMonto(null);
    setNotas('');
    setIntento(false);
    setError(null);
  }, [reclamo]);

  useEffect(() => {
    if (!reclamo || tipo !== 'replacement' || reemplazos !== null) return;
    let vigente = true;
    clienteGarantias
      .reemplazos(reclamo.id)
      .then((s) => vigente && setReemplazos(s))
      .catch(() => vigente && setReemplazos([]));
    return () => {
      vigente = false;
    };
  }, [reclamo, tipo, reemplazos]);

  const errorForm = validarResolucion({ tipo, serialReemplazo: reemplazo ? Number(reemplazo) : null, monto });
  const elegido = reemplazos?.find((s) => String(s.id) === reemplazo) ?? null;

  const resolver = async () => {
    setIntento(true);
    if (!reclamo || errorForm || !tipo) return;
    setGuardando(true);
    setError(null);
    try {
      await clienteGarantias.resolver(reclamo.id, {
        tipo,
        serial_reemplazo: tipo === 'replacement' ? Number(reemplazo) : null,
        monto: tipo === 'refund' ? monto : null,
        notas: notas.trim() || null,
      });
      toast({ title: t('resuelto', { codigo: reclamo.codigo ?? '' }) });
      onHecho();
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setGuardando(false);
    }
  };

  const aviso = (() => {
    if (!reclamo || !tipo) return null;
    const unidad = etiquetaEstado(estadoUnidadAlResolver(tipo, reclamo.estado));
    if (tipo === 'replacement') {
      return elegido
        ? t('aviso.reemplazo', { nuevo: elegido.serial, cliente: reclamo.cliente?.nombre ?? t('elCliente'), serial: reclamo.serial.serial, estado: unidad })
        : null;
    }
    if (tipo === 'refund') return t('aviso.reembolso', { serial: reclamo.serial.serial, estado: unidad });
    return t('aviso.reparacion', { serial: reclamo.serial.serial });
  })();

  return (
    <Dialogo
      abierto={reclamo !== null}
      onAbiertoChange={(v) => !v && onCerrar()}
      titulo={t('titulo', { codigo: reclamo?.codigo ?? '' })}
      descripcion={reclamo ? [reclamo.serial.serial, reclamo.producto?.nombre, reclamo.cliente?.nombre].filter(Boolean).join(' · ') : undefined}
      ancho={520}
      primario={{ etiqueta: t('confirmar'), onClick: resolver, cargando: guardando }}
    >
      <div className="flex flex-col gap-4">
        <FormField etiqueta={t('tipo')} obligatorio error={intento && errorForm === 'tipo' ? t('errores.tipo') : undefined}>
          {(c) => (
            <Select value={tipo} onValueChange={(v) => setTipo(v as TipoResolucion)}>
              <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} aria-invalid={c['aria-invalid']} aria-describedby={c['aria-describedby']} className="h-10 border-line-strong bg-surface">
                <SelectValue placeholder={t('tipoPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_RESOLUCION.map((x) => (
                  <SelectItem key={x} value={x}>
                    {t(`tipos.${x}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>

        {tipo === 'replacement' && (
          <FormField
            etiqueta={t('reemplazo')}
            obligatorio
            ayuda={t('reemplazoAyuda')}
            error={intento && errorForm === 'reemplazo' ? t('errores.reemplazo') : reemplazos && reemplazos.length === 0 ? t('sinReemplazos') : undefined}
          >
            {(c) => (
              <Select value={reemplazo} onValueChange={setReemplazo} disabled={!reemplazos || reemplazos.length === 0}>
                <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} aria-invalid={c['aria-invalid']} aria-describedby={c['aria-describedby']} className="h-10 border-line-strong bg-surface">
                  <SelectValue placeholder={reemplazos === null ? t('cargandoReemplazos') : t('reemplazoPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {(reemplazos ?? []).map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.sucursal ? t('opcionReemplazo', { serial: s.serial, sucursal: s.sucursal.nombre }) : s.serial}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
        )}

        {tipo === 'refund' && (
          <FormField etiqueta={t('monto')} obligatorio error={intento && errorForm === 'monto' ? t('errores.monto') : undefined}>
            <CampoNumero valor={monto} onValorChange={setMonto} minimo={0} decimales={moneda.decimals} prefijo={simboloMoneda(moneda)} />
          </FormField>
        )}

        <FormField etiqueta={t('notas')}>
          <Input value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={1000} className="h-10" />
        </FormField>

        {aviso && (
          <p className="flex items-start gap-2 rounded-lg bg-warning-subtle px-3 py-2.5 text-[13px] text-warning-text">
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
            {aviso}
          </p>
        )}
        {tipo === 'replacement' && elegido && <p className="text-xs text-fg-secondary">{t('avisoStock')}</p>}
        {error && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}
      </div>
    </Dialogo>
  );
}

// ── Acciones de un reclamo ───────────────────────────────────────────────────

/**
 * Acciones de un reclamo según su estado y los permisos (menú de la fila,
 * cabecera del detalle y hoja móvil) y los diálogos que abren. La RPC vuelve
 * a exigir el permiso y la transición.
 */
export function useAccionesReclamo({ permisos, onCambio }: { permisos: PermisosSeriales; onCambio: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations('inventarioGarantias.acciones');
  const mensajeError = useMensajeError();
  const [paraRma, setParaRma] = useState<ReclamoAccionable | null>(null);
  const [paraResolver, setParaResolver] = useState<ReclamoAccionable | null>(null);
  const [paraRechazar, setParaRechazar] = useState<ReclamoAccionable | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [errorRechazo, setErrorRechazo] = useState<string | null>(null);

  const aprobar = useCallback(
    async (r: ReclamoAccionable) => {
      setTrabajando(true);
      try {
        await clienteGarantias.cambiarEstado(r.id, { accion: 'aprobar' });
        toast({ title: t('aprobado', { codigo: r.codigo ?? '' }) });
        onCambio();
      } catch (e) {
        toast({ variant: 'destructive', title: mensajeError(e) });
      } finally {
        setTrabajando(false);
      }
    },
    [t, toast, onCambio, mensajeError],
  );

  const rechazar = async (motivo: string) => {
    if (!paraRechazar) return;
    setTrabajando(true);
    setErrorRechazo(null);
    try {
      await clienteGarantias.cambiarEstado(paraRechazar.id, { accion: 'rechazar', motivo });
      toast({ title: t('rechazado', { codigo: paraRechazar.codigo ?? '' }) });
      setParaRechazar(null);
      onCambio();
    } catch (e) {
      setErrorRechazo(mensajeError(e));
    } finally {
      setTrabajando(false);
    }
  };

  const accionesDe = useCallback(
    (r: ReclamoAccionable, opciones: { enDetalle?: boolean } = {}): AccionFila[] => {
      const a = accionesReclamo(r.estado);
      const gestionar = permisos.gestionar;
      return [
        ...(!opciones.enDetalle ? [{ id: 'ver', etiqueta: t('verDetalle'), icono: Eye, onSelect: () => router.push(rutaReclamo(r.id)) }] : []),
        ...(gestionar && a.aprobar && !opciones.enDetalle ? [{ id: 'aprobar', etiqueta: t('aprobar'), icono: CheckCircle2, onSelect: () => void aprobar(r) }] : []),
        ...(gestionar && a.rma && !opciones.enDetalle ? [{ id: 'rma', etiqueta: t('enviarProveedor'), icono: Truck, onSelect: () => setParaRma(r) }] : []),
        ...(gestionar && a.resolver && !opciones.enDetalle ? [{ id: 'resolver', etiqueta: t('resolver'), icono: Wrench, onSelect: () => setParaResolver(r) }] : []),
        { id: 'serial', etiqueta: t('verSerial', { serial: r.serial.serial }), icono: ScanBarcode, onSelect: () => router.push(rutaSerial(r.serial.id)) },
        ...(gestionar && a.rechazar ? [{ id: 'rechazar', etiqueta: t('rechazar'), icono: XCircle, destructiva: true, onSelect: () => setParaRechazar(r) }] : []),
      ];
    },
    [permisos.gestionar, t, router, aprobar],
  );

  const alTerminar = () => {
    setParaRma(null);
    setParaResolver(null);
    onCambio();
  };

  const dialogos = (
    <>
      <DialogoEnviarRma reclamo={paraRma} onCerrar={() => setParaRma(null)} onHecho={alTerminar} />
      <DialogoResolverReclamo reclamo={paraResolver} onCerrar={() => setParaResolver(null)} onHecho={alTerminar} />
      <DialogoMotivo
        abierto={paraRechazar !== null}
        onAbiertoChange={(v) => {
          if (!v) {
            setParaRechazar(null);
            setErrorRechazo(null);
          }
        }}
        titulo={t('rechazarTitulo', { codigo: paraRechazar?.codigo ?? '' })}
        textoConfirmar={t('rechazar')}
        onConfirmar={rechazar}
        consecuencias={[t('rechazarConsecuencia')]}
        etiquetaMotivo={t('motivoRechazo')}
        minimo={3}
        maximo={500}
        cargando={trabajando}
        error={errorRechazo}
        icono={XCircle}
      />
    </>
  );

  return { accionesDe, aprobar, abrirRma: setParaRma, abrirResolver: setParaResolver, abrirRechazo: setParaRechazar, trabajando, dialogos };
}
