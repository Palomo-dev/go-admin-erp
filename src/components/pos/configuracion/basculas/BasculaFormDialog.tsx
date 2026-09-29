'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Plug, RefreshCw, Scale } from 'lucide-react';
import { CampoNumero, Dialogo, FormField, SegmentedControl, clasesBoton } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { PROTOCOLOS_PENDIENTES, BAUDIOS, PROTOCOLOS_BASCULA, type ProtocoloBascula } from '@/lib/pos/bascula/tipos';
import { elegirPuertoWebSerial, type EntornoBascula } from '@/lib/pos/bascula/transportes';
import type { DesktopSerialPortInfo } from '@/lib/utils/desktop';
import type { BasculaConfigurada, BasculaPayload } from '@/lib/services/basculasService';
import { cn } from '@/utils/Utils';
import {
  configDesdeFormulario,
  formularioInicial,
  payloadDesdeFormulario,
  validarFormulario,
  type FormularioBascula,
} from './basculaFormLogica';
import { ProbarLectura } from './ProbarLectura';

/**
 * «Nueva báscula» / «Editar báscula» (Figma K2 Desktop · K3 Web Serial · K4
 * trama no reconocida): transporte, puerto, protocolo, parámetros del puerto y
 * de la lectura, y «Probar lectura».
 */
export interface BasculaFormDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  bascula: BasculaConfigurada | null;
  sucursales: { id: number; name: string }[];
  sucursalPorDefecto: number | null;
  /** Cajas (pos_terminals) de una sucursal; opcional. */
  cargarCajas?: (sucursalId: number) => Promise<{ id: string; name: string }[]>;
  entorno: EntornoBascula;
  guardando: boolean;
  /** Error del servidor ya traducido. */
  errorServidor: string | null;
  onGuardar: (payload: BasculaPayload, resultadoPrueba: boolean | null) => void;
}

const selectClase =
  'h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60';

export function BasculaFormDialog(props: BasculaFormDialogProps) {
  const t = useTranslations('posBascula.config');
  const tf = useTranslations('posBascula.config.form');
  const { entorno } = props;
  const transportePorDefecto = entorno.desktop ? 'desktop_serial' : 'web_serial';
  const [f, setF] = useState<FormularioBascula>(() =>
    formularioInicial({ bascula: props.bascula, sucursalId: props.sucursalPorDefecto, transportePorDefecto }),
  );
  const [intentado, setIntentado] = useState(false);
  const [puertos, setPuertos] = useState<DesktopSerialPortInfo[] | null>(null);
  const [cargandoPuertos, setCargandoPuertos] = useState(false);
  const [cajas, setCajas] = useState<{ id: string; name: string }[]>([]);
  const [resultadoPrueba, setResultadoPrueba] = useState<boolean | null>(null);
  const [errorPuerto, setErrorPuerto] = useState<string | null>(null);

  // Al abrir: los datos de la báscula (o los por defecto).
  useEffect(() => {
    if (!props.abierto) return;
    setF(formularioInicial({ bascula: props.bascula, sucursalId: props.sucursalPorDefecto, transportePorDefecto }));
    setIntentado(false);
    setResultadoPrueba(null);
    setErrorPuerto(null);
  }, [props.abierto, props.bascula, props.sucursalPorDefecto, transportePorDefecto]);

  const cambiar = <K extends keyof FormularioBascula>(campo: K, valor: FormularioBascula[K]) => setF((prev) => ({ ...prev, [campo]: valor }));

  const listarPuertos = useCallback(async () => {
    if (!entorno.desktop) return;
    setCargandoPuertos(true);
    setErrorPuerto(null);
    try {
      setPuertos(await entorno.desktop.listPorts());
    } catch {
      setPuertos([]);
      setErrorPuerto(tf('errorListarPuertos'));
    } finally {
      setCargandoPuertos(false);
    }
  }, [entorno.desktop, tf]);

  useEffect(() => {
    if (props.abierto && f.transporte === 'desktop_serial' && entorno.desktop && puertos === null) void listarPuertos();
  }, [props.abierto, f.transporte, entorno.desktop, puertos, listarPuertos]);

  const { cargarCajas } = props;
  useEffect(() => {
    if (!props.abierto || !f.sucursalId || !cargarCajas) {
      setCajas([]);
      return;
    }
    let cancelado = false;
    cargarCajas(f.sucursalId)
      .then((lista) => !cancelado && setCajas(lista))
      .catch(() => !cancelado && setCajas([]));
    return () => {
      cancelado = true;
    };
  }, [props.abierto, f.sucursalId, cargarCajas]);

  const elegirPuerto = async () => {
    if (!entorno.serial) return;
    setErrorPuerto(null);
    try {
      const elegido = await elegirPuertoWebSerial(entorno.serial);
      if (elegido) cambiar('dispositivo', elegido.pista);
    } catch {
      setErrorPuerto(tf('errorElegirPuerto'));
    }
  };

  const errores = validarFormulario(f);
  const hayErrores = Object.keys(errores).length > 0;
  const errorDe = (campo: keyof typeof errores) => (intentado && errores[campo] ? tf(`errores.${errores[campo]}`) : null);
  const configPrueba = useMemo(() => configDesdeFormulario(f), [f]);

  const puedeLeerAqui =
    (f.transporte === 'desktop_serial' && !!entorno.desktop) || (f.transporte === 'web_serial' && !entorno.enDesktop && !!entorno.serial);

  const guardar = () => {
    setIntentado(true);
    if (hayErrores) return;
    props.onGuardar(payloadDesdeFormulario(f), resultadoPrueba);
  };

  const unidad = f.unidad === 'LB' ? 'lb' : 'kg';

  return (
    <Dialogo
      abierto={props.abierto}
      onAbiertoChange={props.onAbiertoChange}
      titulo={props.bascula ? tf('tituloEditar', { nombre: props.bascula.name }) : tf('tituloNueva')}
      descripcion={tf('descripcion')}
      icono={Scale}
      ancho={672}
      textoCancelar={tf('cancelar')}
      primario={{
        etiqueta: props.bascula ? tf('guardar') : tf('crear'),
        onClick: guardar,
        cargando: props.guardando,
        deshabilitada: intentado && hayErrores,
      }}
    >
      <div className="flex flex-col gap-4">
        {props.errorServidor && (
          <p role="alert" className="rounded-lg border border-line-danger bg-danger-subtle px-3 py-2 text-sm text-danger-text">
            {props.errorServidor}
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField etiqueta={tf('nombre')} obligatorio error={errorDe('nombre')} ayuda={tf('nombreAyuda')}>
            <Input value={f.nombre} maxLength={80} onChange={(e) => cambiar('nombre', e.target.value)} />
          </FormField>
          <FormField etiqueta={tf('sucursal')} obligatorio error={errorDe('sucursal')}>
            {(campo) => (
              <select
                {...campo}
                className={selectClase}
                value={f.sucursalId ?? ''}
                onChange={(e) => setF((prev) => ({ ...prev, sucursalId: e.target.value ? Number(e.target.value) : null, cajaId: null }))}
              >
                <option value="">{tf('elegirSucursal')}</option>
                {props.sucursales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </FormField>
        </div>

        {cajas.length > 0 && (
          <FormField etiqueta={tf('caja')} ayuda={tf('cajaAyuda')}>
            {(campo) => (
              <select {...campo} className={selectClase} value={f.cajaId ?? ''} onChange={(e) => cambiar('cajaId', e.target.value || null)}>
                <option value="">{tf('cajaCualquiera')}</option>
                {cajas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </FormField>
        )}

        <FormField etiqueta={tf('transporte')}>
          {(campo) => (
            <SegmentedControl
              aria-labelledby={campo.idEtiqueta}
              anchoCompleto
              opciones={[
                { valor: 'desktop_serial' as const, etiqueta: t('transportes.desktop_serial') },
                { valor: 'web_serial' as const, etiqueta: t('transportes.web_serial') },
              ]}
              valor={f.transporte}
              onValorChange={(v) => setF((prev) => ({ ...prev, transporte: v, dispositivo: '' }))}
            />
          )}
        </FormField>

        {f.transporte === 'web_serial' && (entorno.enDesktop || !entorno.serial) && (
          <div role="note" className="flex items-start gap-3 rounded-lg border border-line bg-warning-subtle px-3 py-2 text-sm text-warning-text">
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
            <p>{entorno.enDesktop ? tf('webSerialEnDesktop') : tf('webSerialNoSoportado')}</p>
          </div>
        )}
        {f.transporte === 'desktop_serial' && !entorno.desktop && (
          <div role="note" className="flex items-start gap-3 rounded-lg border border-line bg-warning-subtle px-3 py-2 text-sm text-warning-text">
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
            <p>{tf('desktopNoDisponible')}</p>
          </div>
        )}

        {/* Puerto */}
        {f.transporte === 'desktop_serial' ? (
          <FormField
            etiqueta={tf('puerto')}
            obligatorio
            error={errorDe('dispositivo') ?? errorPuerto}
            ayuda={tf('puertoAyudaDesktop')}
            extra={
              entorno.desktop ? (
                <button type="button" onClick={() => void listarPuertos()} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })} disabled={cargandoPuertos}>
                  <RefreshCw aria-hidden="true" className={cn('size-4', cargandoPuertos && 'animate-spin')} strokeWidth={1.5} />
                  {tf('actualizarPuertos')}
                </button>
              ) : undefined
            }
          >
            {entorno.desktop && puertos && puertos.length > 0 ? (
              (campo) => (
                <select {...campo} className={selectClase} value={f.dispositivo} onChange={(e) => cambiar('dispositivo', e.target.value)}>
                  <option value="">{tf('elegirPuerto')}</option>
                  {f.dispositivo && !puertos.some((p) => p.path === f.dispositivo) && <option value={f.dispositivo}>{f.dispositivo}</option>}
                  {puertos.map((p) => (
                    <option key={p.path} value={p.path}>
                      {[p.path, p.manufacturer].filter(Boolean).join(' · ')}
                    </option>
                  ))}
                </select>
              )
            ) : (
              <Input value={f.dispositivo} maxLength={200} placeholder="COM3" onChange={(e) => cambiar('dispositivo', e.target.value)} />
            )}
          </FormField>
        ) : (
          <FormField etiqueta={tf('puerto')} error={errorPuerto} ayuda={tf('puertoAyudaWeb')}>
            {(campo) => (
              <div className="flex flex-wrap items-center gap-2" id={campo.id}>
                <button
                  type="button"
                  onClick={() => void elegirPuerto()}
                  disabled={!entorno.serial || entorno.enDesktop}
                  className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}
                >
                  <Plug aria-hidden="true" className="size-4" strokeWidth={1.5} />
                  {tf('elegirPuertoWeb')}
                </button>
                <span className="text-sm text-fg-secondary">{f.dispositivo ? tf('puertoElegido', { pista: f.dispositivo }) : tf('sinPuertoElegido')}</span>
              </div>
            )}
          </FormField>
        )}

        {/* Protocolo */}
        <FormField etiqueta={tf('protocolo')} ayuda={PROTOCOLOS_PENDIENTES.includes(f.protocolo) ? tf('protocoloPendiente') : undefined}>
          {(campo) => (
            <select {...campo} className={selectClase} value={f.protocolo} onChange={(e) => cambiar('protocolo', e.target.value as ProtocoloBascula)}>
              {PROTOCOLOS_BASCULA.map((p) => (
                <option key={p} value={p}>
                  {t(`protocolos.${p}`)}
                </option>
              ))}
            </select>
          )}
        </FormField>
        {f.protocolo === 'custom_regex' && (
          <FormField etiqueta={tf('patron')} obligatorio error={errorDe('patron')} ayuda={tf('patronAyuda')}>
            <Input value={f.patron} maxLength={300} className="font-mono" onChange={(e) => cambiar('patron', e.target.value)} />
          </FormField>
        )}

        {/* Parámetros del puerto */}
        <fieldset className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <legend className="col-span-full mb-1 text-sm font-semibold text-fg">{tf('parametros')}</legend>
          <FormField etiqueta={tf('baudios')}>
            {(campo) => (
              <select {...campo} className={selectClase} value={f.baudios} onChange={(e) => cambiar('baudios', Number(e.target.value))}>
                {BAUDIOS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          <FormField etiqueta={tf('bitsDatos')}>
            {(campo) => (
              <select {...campo} className={selectClase} value={f.bitsDatos} onChange={(e) => cambiar('bitsDatos', e.target.value === '7' ? 7 : 8)}>
                <option value={8}>8</option>
                <option value={7}>7</option>
              </select>
            )}
          </FormField>
          <FormField etiqueta={tf('paridad')}>
            {(campo) => (
              <select
                {...campo}
                className={selectClase}
                value={f.paridad}
                onChange={(e) => cambiar('paridad', e.target.value === 'even' || e.target.value === 'odd' ? e.target.value : 'none')}
              >
                <option value="none">{t('paridad.none')}</option>
                <option value="even">{t('paridad.even')}</option>
                <option value="odd">{t('paridad.odd')}</option>
              </select>
            )}
          </FormField>
          <FormField etiqueta={tf('bitsParada')}>
            {(campo) => (
              <select {...campo} className={selectClase} value={f.bitsParada} onChange={(e) => cambiar('bitsParada', e.target.value === '2' ? 2 : 1)}>
                <option value={1}>1</option>
                <option value={2}>2</option>
              </select>
            )}
          </FormField>
        </fieldset>

        {/* Lectura */}
        <fieldset className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <legend className="col-span-full mb-1 text-sm font-semibold text-fg">{tf('lectura')}</legend>
          <FormField etiqueta={tf('unidad')}>
            {(campo) => (
              <SegmentedControl
                aria-labelledby={campo.idEtiqueta}
                anchoCompleto
                opciones={[
                  { valor: 'KG' as const, etiqueta: 'kg' },
                  { valor: 'LB' as const, etiqueta: 'lb' },
                ]}
                valor={f.unidad}
                onValorChange={(v) => cambiar('unidad', v)}
              />
            )}
          </FormField>
          <FormField etiqueta={tf('decimales')} error={errorDe('decimales')}>
            <CampoNumero valor={f.decimales} decimales={0} minimo={0} maximo={4} onValorChange={(v) => cambiar('decimales', v ?? 3)} />
          </FormField>
          <FormField etiqueta={tf('capacidad')} error={errorDe('capacidad')}>
            <CampoNumero valor={f.capacidad} decimales={3} sufijo={unidad} onValorChange={(v) => cambiar('capacidad', v)} />
          </FormField>
          <FormField etiqueta={tf('division')} error={errorDe('division')} ayuda={tf('divisionAyuda')}>
            <CampoNumero valor={f.division} decimales={4} sufijo={unidad} onValorChange={(v) => cambiar('division', v)} />
          </FormField>
          <FormField etiqueta={tf('estabilidad')} error={errorDe('estableMs')} ayuda={tf('estabilidadAyuda')}>
            <CampoNumero valor={f.estableMs} decimales={0} minimo={0} maximo={5000} sufijo="ms" onValorChange={(v) => cambiar('estableMs', v ?? 500)} />
          </FormField>
        </fieldset>

        <ProbarLectura
          config={configPrueba}
          entorno={entorno}
          deshabilitado={!puedeLeerAqui}
          onResultado={setResultadoPrueba}
          onUsarProtocolo={(p) => cambiar('protocolo', p)}
        />
      </div>
    </Dialogo>
  );
}
