'use client';

/**
 * «Agregar dispositivo» (Figma 20.28.3, paso 1 «¿Qué vas a conectar?»), en la
 * versión de M0: solo se agregan la **Pantalla de QR** y la **Etiqueta NFC de la
 * sede**. Las otras tarjetas del Figma (terminal de huella o rostro, kiosco en
 * tablet, lector de carné) se ven deshabilitadas con «Llega con …»: no se ofrecen
 * como si funcionaran (BRIEF M0). Los pasos 2 y 3 del Figma (conectar el equipo,
 * enlazar personas) son de los terminales (M2) y no aplican aquí; en su lugar,
 * el paso 2 pide nombre, sede y dónde está, y la etiqueta muestra su URL UNA vez.
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Copy, Fingerprint, Nfc, ScanQrCode, SquarePen, TabletSmartphone, type LucideIcon } from 'lucide-react';
import { AvisoTonal, ChipsOpcion, Dialogo, FormField, TarjetaSeleccionable } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { urlEtiqueta } from '@/lib/hrm/marcacion/metodos';
import { ErrorPersonas, pedir, useCarga } from '../personas/apiPersonas';
import { CHIPS_ETIQUETA, cuerpoAlta, validarAlta, type AltaPunto, type ChipEtiqueta, type ErrorAlta, type TipoAlta } from './marcacionVista';

interface SedeOpcion {
  id: number;
  nombre: string;
}

/** Tipos del paso 1: los dos de M0 y los que llegan después (deshabilitados). */
const TARJETAS: readonly { clave: TipoAlta | 'terminal' | 'kiosco' | 'lector'; icono: LucideIcon }[] = [
  { clave: 'pantalla_qr', icono: ScanQrCode },
  { clave: 'etiqueta_nfc', icono: Nfc },
  { clave: 'terminal', icono: Fingerprint },
  { clave: 'kiosco', icono: TabletSmartphone },
  { clave: 'lector', icono: Nfc },
];

const ALTA_VACIA: AltaPunto = { tipo: null, nombre: '', sedeId: null, descripcion: '', chip: 'ntag215' };

export function DialogoAgregarPunto({
  abierto,
  onAbiertoChange,
  tipoInicial,
  sedeInicial,
  onCreado,
}: {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  tipoInicial: TipoAlta | null;
  sedeInicial: number | null;
  onCreado: (r: { id: string; tipo: TipoAlta }) => void;
}) {
  const t = useTranslations('hrmMarcacionRrhh.alta');
  const [paso, setPaso] = useState<'tipo' | 'datos'>('tipo');
  const [alta, setAlta] = useState<AltaPunto>(ALTA_VACIA);
  const [error, setError] = useState<ErrorAlta | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [etiquetaCreada, setEtiquetaCreada] = useState<{ id: string; codigo: string; nombre: string } | null>(null);
  const { carga: cargaSedes } = useCarga<{ sedes: SedeOpcion[] }>(abierto ? '/api/hrm/marcacion/metodos' : null);
  const sedes = cargaSedes.estado === 'listo' ? cargaSedes.datos.sedes : [];

  // Cada apertura empieza limpia; con un tipo pedido desde la URL va directo al paso 2.
  useEffect(() => {
    if (!abierto) return;
    setAlta({ ...ALTA_VACIA, tipo: tipoInicial, sedeId: sedeInicial });
    setPaso(tipoInicial ? 'datos' : 'tipo');
    setError(null);
  }, [abierto, tipoInicial, sedeInicial]);

  // Con una sola sede, se elige sola.
  useEffect(() => {
    if (abierto && alta.sedeId === null && sedes.length === 1) setAlta((a) => ({ ...a, sedeId: sedes[0].id }));
  }, [abierto, alta.sedeId, sedes]);

  const cambiar = <K extends keyof AltaPunto>(k: K, v: AltaPunto[K]) => {
    setAlta((a) => ({ ...a, [k]: v }));
    setError(null);
  };

  const agregar = async () => {
    const e = validarAlta(alta);
    const cuerpo = cuerpoAlta(alta);
    if (e || !cuerpo) {
      setError(e ?? 'tipo');
      return;
    }
    setEnviando(true);
    try {
      const r = await pedir<{ id: string; tipo: TipoAlta; codigo: string | null }>('/api/hrm/marcacion/dispositivos', { metodo: 'POST', cuerpo });
      onAbiertoChange(false);
      onCreado({ id: r.id, tipo: r.tipo });
      if (r.tipo === 'etiqueta_nfc' && r.codigo) {
        setEtiquetaCreada({ id: r.id, codigo: r.codigo, nombre: cuerpo.nombre });
      } else {
        toast.success(t('creada', { nombre: cuerpo.nombre }), { description: t('creadaPantallaDesc') });
      }
    } catch (err) {
      const codigo = err instanceof ErrorPersonas ? err.codigo : 'error_hrm';
      const conocidos = ['nombre_invalido', 'sede_invalida', 'tipo_no_disponible', 'chip_invalido', 'descripcion_invalida', 'sin_permiso'];
      toast.error(t(`errores.${conocidos.includes(codigo) ? codigo : 'guardar'}`));
    } finally {
      setEnviando(false);
    }
  };



  return (
    <>
      {paso === 'tipo' ? (
        <Dialogo
          abierto={abierto}
          onAbiertoChange={onAbiertoChange}
          titulo={t('titulo')}
          descripcion={t('paso1')}
          ancho={880}
          primario={{ etiqueta: t('continuar'), onClick: () => setPaso('datos'), deshabilitada: !alta.tipo, motivo: t('eligeTipo') }}
        >
          <div role="radiogroup" aria-label={t('queConectar')} className="grid gap-3 sm:grid-cols-2">
            {TARJETAS.map(({ clave, icono }) => {
              const m0 = clave === 'pantalla_qr' || clave === 'etiqueta_nfc';
              return (
                <TarjetaSeleccionable
                  key={clave}
                  orientacion="horizontal"
                  icono={icono}
                  titulo={t(`tipos.${clave}.titulo`)}
                  descripcion={
                    <>
                      {t(`tipos.${clave}.descripcion`)}
                      <span className="mt-1 block text-xs text-fg-muted">{m0 ? t(`tipos.${clave}.necesitas`) : t(`tipos.${clave}.llega`)}</span>
                    </>
                  }
                  seleccionada={alta.tipo === clave}
                  deshabilitada={!m0}
                  onSeleccionar={() => m0 && cambiar('tipo', clave)}
                />
              );
            })}
          </div>
        </Dialogo>
      ) : (
        <Dialogo
          abierto={abierto}
          onAbiertoChange={onAbiertoChange}
          titulo={alta.tipo === 'etiqueta_nfc' ? t('tituloEtiqueta') : t('tituloPantalla')}
          descripcion={t('paso2')}
          icono={alta.tipo === 'etiqueta_nfc' ? Nfc : ScanQrCode}
          ancho={560}
          primario={{ etiqueta: t('agregar'), onClick: () => void agregar(), cargando: enviando }}
          secundarios={[{ etiqueta: t('atras'), onClick: () => setPaso('tipo') }]}
        >
          <FormField etiqueta={t('nombre')} obligatorio error={error === 'nombre' ? t('errores.nombre_invalido') : null}>
            {(c) => (
              <Input
                id={c.id}
                aria-describedby={c['aria-describedby']}
                aria-invalid={c['aria-invalid']}
                value={alta.nombre}
                maxLength={80}
                placeholder={alta.tipo === 'etiqueta_nfc' ? t('nombreEjemploEtiqueta') : t('nombreEjemploPantalla')}
                onChange={(e) => cambiar('nombre', e.target.value)}
              />
            )}
          </FormField>
          <FormField etiqueta={t('sede')} obligatorio error={error === 'sede' ? t('errores.sede_invalida') : null}>
            {(c) => (
              <Select value={alta.sedeId === null ? '' : String(alta.sedeId)} onValueChange={(v) => cambiar('sedeId', Number(v))}>
                <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                  <SelectValue placeholder={cargaSedes.estado === 'cargando' ? t('cargandoSedes') : t('eligeSede')} />
                </SelectTrigger>
                <SelectContent>
                  {sedes.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField etiqueta={t('donde')} ayuda={t('dondeAyuda')} error={error === 'descripcion' ? t('errores.descripcion_invalida') : null}>
            {(c) => (
              <Input
                id={c.id}
                aria-describedby={c['aria-describedby']}
                value={alta.descripcion}
                maxLength={200}
                placeholder={alta.tipo === 'etiqueta_nfc' ? t('dondeEjemploEtiqueta') : t('dondeEjemploPantalla')}
                onChange={(e) => cambiar('descripcion', e.target.value)}
              />
            )}
          </FormField>
          {alta.tipo === 'etiqueta_nfc' ? (
            <>
              <FormField etiqueta={t('chip')}>
                {(c) => (
                  <ChipsOpcion<ChipEtiqueta>
                    aria-labelledby={c.idEtiqueta}
                    opciones={CHIPS_ETIQUETA.map((ch) => ({ valor: ch, etiqueta: t(`chips.${ch}`) }))}
                    valor={alta.chip}
                    onValorChange={(v) => cambiar('chip', v)}
                  />
                )}
              </FormField>
              <AvisoTonal
                tono="informacion"
                titulo={t('avisoUbicacion.titulo')}
                descripcion={alta.chip === 'ntag424' ? t('avisoUbicacion.ntag424') : t('avisoUbicacion.ntag215')}
              />
            </>
          ) : (
            <AvisoTonal tono="informacion" titulo={t('avisoPantalla.titulo')} descripcion={t('avisoPantalla.descripcion')} />
          )}
        </Dialogo>
      )}

      <DialogoCodigoEtiqueta
        etiqueta={etiquetaCreada}
        onCerrar={() => setEtiquetaCreada(null)}
      />
    </>
  );
}

// ─── URL de la etiqueta: se muestra UNA vez (alta o «Regenerar código») ──────

interface NdefEscritor {
  write(mensaje: { records: { recordType: string; data: string }[] }): Promise<void>;
}
type ConstructorNdef = new () => NdefEscritor;

/** Web NFC (Android con Chrome). En iPhone y escritorio no existe. */
function ndefDisponible(): ConstructorNdef | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { NDEFReader?: ConstructorNdef };
  return typeof w.NDEFReader === 'function' ? w.NDEFReader : null;
}

export function DialogoCodigoEtiqueta({
  etiqueta,
  onCerrar,
}: {
  etiqueta: { id: string; codigo: string; nombre: string } | null;
  onCerrar: () => void;
}) {
  const t = useTranslations('hrmMarcacionRrhh.codigoEtiqueta');
  const [escribiendo, setEscribiendo] = useState(false);
  const [nfc, setNfc] = useState<ConstructorNdef | null>(null);
  useEffect(() => setNfc(() => ndefDisponible()), []);
  const url = etiqueta && typeof window !== 'undefined' ? urlEtiqueta(window.location.origin, etiqueta.id, etiqueta.codigo) : '';

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t('copiada'));
    } catch {
      toast.error(t('noCopiada'));
    }
  };

  const escribir = async () => {
    if (!nfc) return;
    setEscribiendo(true);
    try {
      await new nfc().write({ records: [{ recordType: 'url', data: url }] });
      toast.success(t('escrita'));
    } catch {
      toast.error(t('noEscrita'));
    } finally {
      setEscribiendo(false);
    }
  };

  return (
    <Dialogo
      abierto={etiqueta !== null}
      onAbiertoChange={(a) => !a && onCerrar()}
      titulo={t('titulo', { nombre: etiqueta?.nombre ?? '' })}
      descripcion={t('descripcion')}
      icono={Nfc}
      ancho={560}
      textoCancelar={t('cerrar')}
      primario={{ etiqueta: t('copiar'), onClick: () => void copiar() }}
      secundarios={nfc ? [{ etiqueta: t('escribir'), onClick: () => void escribir(), cargando: escribiendo }] : undefined}
    >
      <div className="flex items-start gap-2 rounded-lg border border-line bg-subtle p-3">
        <code className="min-w-0 flex-1 break-all font-mono text-xs leading-5 text-fg">{url}</code>
        <button
          type="button"
          onClick={() => void copiar()}
          aria-label={t('copiar')}
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Copy className="size-4" aria-hidden="true" />
        </button>
      </div>
      <AvisoTonal tono="advertencia" titulo={t('unaVez.titulo')} descripcion={t('unaVez.descripcion')} />
      {!nfc && <AvisoTonal tono="neutro" icono={SquarePen} titulo={t('sinNfc.titulo')} descripcion={t('sinNfc.descripcion')} />}
    </Dialogo>
  );
}
