'use client';

/**
 * Marcación › Métodos por sede › «PIN y carnés» (plan de Marcación D11, fase M1).
 * Pieza sin pantalla propia en Figma: se arma con el kit (diálogo, lista, insignias).
 *
 * - PIN: GO Admin lo genera al azar (6 dígitos, único en la organización) y lo
 *   muestra UNA vez para entregarlo a la persona; nunca se vuelve a ver. Bloqueado
 *   tras 5 intentos: se desbloquea aquí o en el kiosco con un supervisor.
 * - Carné NFC: se acerca al lector (USB que «teclea» o NFC del celular) o se escribe
 *   su código; se guarda solo su HMAC.
 * - Carné QR: GO Admin genera el código a imprimir en el carné.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';
import { KeyRound, Nfc, ScanQrCode, Unlock, X } from 'lucide-react';
import { AvisoTonal, Dialogo, EmptyState, SearchInput, Skeleton, clasesBoton } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { contenidoCarneQr, leerCarne } from '@/lib/hrm/kiosco/kiosco';
import { ErrorPersonas, pedir, useCarga } from '../personas/apiPersonas';

interface PersonaCredenciales {
  vinculo_id: string;
  nombre: string | null;
  sede: string | null;
  pin: { creado: string; bloqueado_hasta: string | null; fallos: number } | null;
  carnes: { id: string; tipo: 'carne_nfc' | 'carne_qr'; etiqueta: string | null }[];
  foto_autorizada: boolean;
}

interface RespuestaCredenciales {
  puede_gestionar: boolean;
  personas: PersonaCredenciales[];
}

const URL = '/api/hrm/marcacion/credenciales';

function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function DialogoCredenciales({ abierto, onAbiertoChange, sedeId, sedeNombre }: { abierto: boolean; onAbiertoChange: (a: boolean) => void; sedeId: number; sedeNombre: string }) {
  const t = useTranslations('hrmKiosco.credenciales');
  const { carga, recargar } = useCarga<RespuestaCredenciales>(abierto ? `${URL}?sede=${sedeId}` : null);
  const [texto, setTexto] = useState('');
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [pinNuevo, setPinNuevo] = useState<{ nombre: string; pin: string } | null>(null);
  const [carneQr, setCarneQr] = useState<{ nombre: string; codigo: string } | null>(null);
  const [leyendo, setLeyendo] = useState<PersonaCredenciales | null>(null);

  const datos = carga.estado === 'listo' ? carga.datos : null;
  const puede = !!datos?.puede_gestionar;
  const filas = (datos?.personas ?? []).filter((p) => !texto.trim() || normalizar(p.nombre ?? '').includes(normalizar(texto.trim())));

  const accion = async (clave: string, cuerpo: Record<string, unknown>) => {
    setOcupado(clave);
    try {
      return await pedir<Record<string, unknown>>(URL, { metodo: 'POST', cuerpo });
    } catch (e) {
      const c = e instanceof ErrorPersonas ? e.codigo : 'error';
      toast.error(t(`errores.${['sin_permiso', 'carne_en_uso', 'carne_invalido'].includes(c) ? c : 'generico'}`));
      return null;
    } finally {
      setOcupado(null);
      void recargar();
    }
  };

  return (
    <>
      <Dialogo
        abierto={abierto}
        onAbiertoChange={onAbiertoChange}
        titulo={t('titulo')}
        descripcion={t('descripcion', { sede: sedeNombre })}
        icono={KeyRound}
        ancho={880}
        primario={{ etiqueta: t('listo'), onClick: () => onAbiertoChange(false) }}
      >
        {carga.estado === 'cargando' && (
          <div className="flex flex-col gap-2" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
        )}
        {carga.estado === 'sinPermiso' && <EmptyState variante="forbidden" titulo={t('sinPermiso')} />}
        {carga.estado === 'error' && <EmptyState variante="error" titulo={t('error')} onReintentar={() => void recargar()} />}
        {datos && (
          <div className="flex flex-col gap-3">
            {!puede && <AvisoTonal compacto tono="neutro" titulo={t('soloLectura')} />}
            <SearchInput value={texto} onChange={setTexto} placeholder={t('buscar')} etiqueta={t('buscar')} />
            {filas.length === 0 ? (
              <p className="py-6 text-center text-sm text-fg-secondary">{t('vacio')}</p>
            ) : (
              <ul className="flex max-h-[52vh] flex-col divide-y divide-line overflow-y-auto rounded-lg border border-line">
                {filas.map((p) => {
                  const bloqueado = !!p.pin?.bloqueado_hasta;
                  return (
                    <li key={p.vinculo_id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-fg">{p.nombre ?? '—'}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <Badge tono={bloqueado ? 'peligro' : p.pin ? 'exito' : 'neutro'} apariencia="suave" tamano="sm">
                            {bloqueado ? t('pin.bloqueado') : p.pin ? t('pin.asignado') : t('pin.sinPin')}
                          </Badge>
                          {p.carnes.map((c) => (
                            <Badge key={c.id} tono="informacion" apariencia="suave" tamano="sm">
                              {t(`carne.${c.tipo}`)} {c.etiqueta}
                              {puede && (
                                <button
                                  type="button"
                                  aria-label={t('carne.quitar', { etiqueta: c.etiqueta ?? '' })}
                                  disabled={ocupado !== null}
                                  onClick={() => void accion(`rev-${c.id}`, { accion: 'revocar', id: c.id })}
                                  className="ml-1 rounded hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                                >
                                  <X className="size-3" aria-hidden="true" />
                                </button>
                              )}
                            </Badge>
                          ))}
                          <Badge tono={p.foto_autorizada ? 'marca' : 'neutro'} apariencia="contorno" tamano="sm">
                            {p.foto_autorizada ? t('foto.si') : t('foto.no')}
                          </Badge>
                        </div>
                      </div>
                      {puede && (
                        <div className="flex flex-wrap gap-2">
                          {bloqueado && (
                            <button
                              type="button"
                              className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}
                              disabled={ocupado !== null}
                              onClick={() => void accion(`desb-${p.vinculo_id}`, { accion: 'desbloquear', vinculo_id: p.vinculo_id }).then((r) => r && toast.success(t('pin.desbloqueado')))}
                            >
                              <Unlock className="size-4" aria-hidden="true" strokeWidth={1.5} />
                              {t('pin.desbloquear')}
                            </button>
                          )}
                          <button
                            type="button"
                            className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}
                            disabled={ocupado !== null}
                            onClick={() =>
                              void accion(`pin-${p.vinculo_id}`, { accion: 'pin', vinculo_id: p.vinculo_id }).then((r) => {
                                if (r && typeof r.pin === 'string') setPinNuevo({ nombre: p.nombre ?? '', pin: r.pin });
                              })
                            }
                          >
                            <KeyRound className="size-4" aria-hidden="true" strokeWidth={1.5} />
                            {p.pin ? t('pin.nuevo') : t('pin.generar')}
                          </button>
                          <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} disabled={ocupado !== null} onClick={() => setLeyendo(p)}>
                            <Nfc className="size-4" aria-hidden="true" strokeWidth={1.5} />
                            {t('carne.nfc')}
                          </button>
                          <button
                            type="button"
                            className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}
                            disabled={ocupado !== null}
                            onClick={() =>
                              void accion(`qr-${p.vinculo_id}`, { accion: 'carne', vinculo_id: p.vinculo_id, tipo: 'carne_qr' }).then((r) => {
                                if (r && typeof r.codigo === 'string') setCarneQr({ nombre: p.nombre ?? '', codigo: r.codigo });
                              })
                            }
                          >
                            <ScanQrCode className="size-4" aria-hidden="true" strokeWidth={1.5} />
                            {t('carne.qr')}
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </Dialogo>

      <Dialogo
        abierto={pinNuevo !== null}
        onAbiertoChange={(a) => !a && setPinNuevo(null)}
        titulo={t('pinNuevo.titulo', { nombre: pinNuevo?.nombre ?? '' })}
        descripcion={t('pinNuevo.descripcion')}
        icono={KeyRound}
        ancho={440}
        primario={{ etiqueta: t('pinNuevo.entregado'), onClick: () => setPinNuevo(null) }}
      >
        <p className="text-center font-mono text-4xl font-semibold tracking-[0.3em] text-fg">{pinNuevo?.pin}</p>
        <AvisoTonal tono="advertencia" titulo={t('pinNuevo.unaVez')} />
      </Dialogo>

      <Dialogo
        abierto={carneQr !== null}
        onAbiertoChange={(a) => !a && setCarneQr(null)}
        titulo={t('carneQr.titulo', { nombre: carneQr?.nombre ?? '' })}
        descripcion={t('carneQr.descripcion')}
        icono={ScanQrCode}
        ancho={440}
        primario={{ etiqueta: t('carneQr.listo'), onClick: () => setCarneQr(null) }}
      >
        {carneQr && (
          <div className="flex flex-col items-center gap-3">
            <div className="w-48 bg-white p-3">
              <QRCodeSVG value={contenidoCarneQr(carneQr.codigo)} size={256} level="M" marginSize={0} className="h-auto w-full" title={carneQr.codigo} />
            </div>
            <p className="font-mono text-sm text-fg-secondary">{carneQr.codigo}</p>
          </div>
        )}
        <AvisoTonal tono="advertencia" titulo={t('carneQr.unaVez')} />
      </Dialogo>

      <DialogoLeerCarne
        persona={leyendo}
        onCerrar={() => setLeyendo(null)}
        onLeido={async (valor) => {
          if (!leyendo) return;
          const r = await accion(`nfc-${leyendo.vinculo_id}`, { accion: 'carne', vinculo_id: leyendo.vinculo_id, tipo: 'carne_nfc', valor });
          if (r) {
            toast.success(t('carne.registrado', { nombre: leyendo.nombre ?? '' }));
            setLeyendo(null);
          }
        }}
      />
    </>
  );
}

/** Registrar un carné NFC: el lector USB escribe el código en el campo (o se escribe a mano); en Android, también Web NFC. */
function DialogoLeerCarne({ persona, onCerrar, onLeido }: { persona: PersonaCredenciales | null; onCerrar: () => void; onLeido: (valor: string) => Promise<void> }) {
  const t = useTranslations('hrmKiosco.credenciales.leer');
  const [valor, setValor] = useState('');
  const [enviando, setEnviando] = useState(false);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!persona) return;
    setValor('');
    setTimeout(() => campo.current?.focus(), 50);
    const Ctor = (window as unknown as { NDEFReader?: new () => EventTarget & { scan(o?: { signal?: AbortSignal }): Promise<void>; onreading: ((e: Event & { serialNumber?: string }) => void) | null } }).NDEFReader;
    if (!Ctor) return;
    const control = new AbortController();
    const lector = new Ctor();
    lector.onreading = (e) => e.serialNumber && setValor(e.serialNumber);
    lector.scan({ signal: control.signal }).catch(() => undefined);
    return () => control.abort();
  }, [persona]);

  const leido = leerCarne(valor, 'nfc');
  const enviar = async () => {
    if (!leido) return;
    setEnviando(true);
    try {
      await onLeido(leido.valor);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialogo
      abierto={persona !== null}
      onAbiertoChange={(a) => !a && onCerrar()}
      titulo={t('titulo', { nombre: persona?.nombre ?? '' })}
      descripcion={t('descripcion')}
      icono={Nfc}
      ancho={440}
      primario={{ etiqueta: t('registrar'), onClick: () => void enviar(), cargando: enviando, deshabilitada: !leido, motivo: t('motivo') }}
    >
      <Input
        ref={campo}
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void enviar();
          }
        }}
        placeholder={t('placeholder')}
        aria-label={t('campo')}
        autoComplete="off"
        className="font-mono"
      />
    </Dialogo>
  );
}
