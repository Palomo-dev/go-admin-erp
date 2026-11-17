'use client';

/**
 * «Agregar dispositivo › Kiosco en una tablet / Lector de carné o QR en un
 * computador» (Figma 20.28.3 y 20.29.7; plan de Marcación M1). RR. HH. escribe el
 * código de 6 caracteres que muestra el equipo en `/marcacion/kiosco`; el equipo se
 * vincula a una sede y desde ese momento marca con su propia clave (que GO Admin
 * nunca ve: solo guarda su hash).
 *
 * Con `relojId` es «Vincular de nuevo»: el mismo punto, con la clave de la tablet
 * nueva (la anterior deja de servir).
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Nfc, TabletSmartphone } from 'lucide-react';
import { AvisoTonal, Dialogo, FormField } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { normalizarCodigo } from '@/lib/hrm/kiosco/kiosco';
import { ErrorPersonas, pedir, useCarga } from '../personas/apiPersonas';

export type TipoEquipo = 'kiosco' | 'lector_escritorio';

const ERRORES = ['codigo_invalido', 'nombre_invalido', 'sede_invalida', 'descripcion_invalida', 'sin_permiso', 'no_existe'] as const;

export function DialogoVincularEquipo({
  abierto,
  onAbiertoChange,
  tipo,
  sedeInicial,
  relojId,
  nombreActual,
  onVinculado,
}: {
  abierto: boolean;
  onAbiertoChange: (a: boolean) => void;
  tipo: TipoEquipo;
  sedeInicial: number | null;
  /** Vincular de nuevo un equipo existente. */
  relojId?: string | null;
  nombreActual?: string | null;
  onVinculado: () => void;
}) {
  const t = useTranslations('hrmKiosco.vincular');
  const deNuevo = !!relojId;
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [sedeId, setSedeId] = useState<number | null>(sedeInicial);
  const [descripcion, setDescripcion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const { carga } = useCarga<{ sedes: { id: number; nombre: string }[] }>(abierto && !deNuevo ? '/api/hrm/marcacion/metodos' : null);
  const sedes = useMemo(() => (carga.estado === 'listo' ? carga.datos.sedes : []), [carga]);

  useEffect(() => {
    if (!abierto) return;
    setCodigo('');
    setNombre('');
    setDescripcion('');
    setSedeId(sedeInicial);
    setError(null);
  }, [abierto, sedeInicial]);

  useEffect(() => {
    if (abierto && sedeId === null && sedes.length === 1) setSedeId(sedes[0].id);
  }, [abierto, sedeId, sedes]);

  const vincular = async () => {
    const c = normalizarCodigo(codigo);
    if (!c) return setError('codigo_invalido');
    if (!deNuevo) {
      if (nombre.trim().length < 2 || nombre.trim().length > 80) return setError('nombre_invalido');
      if (sedeId === null) return setError('sede_invalida');
    }
    setEnviando(true);
    try {
      const r = await pedir<{ nombre: string }>('/api/hrm/marcacion/dispositivos/vincular', {
        metodo: 'POST',
        cuerpo: deNuevo ? { codigo: c, reloj_id: relojId } : { codigo: c, tipo, nombre: nombre.trim(), sede_id: sedeId, descripcion: descripcion.trim() || undefined },
      });
      toast.success(t('vinculado', { nombre: r.nombre }), { description: t('vinculadoDesc') });
      onAbiertoChange(false);
      onVinculado();
    } catch (e) {
      const cod = e instanceof ErrorPersonas ? e.codigo : 'error';
      setError((ERRORES as readonly string[]).includes(cod) ? cod : 'error');
    } finally {
      setEnviando(false);
    }
  };

  const errorDe = (campo: string) => (error === campo ? t(`errores.${campo}`) : null);

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={deNuevo ? t('tituloDeNuevo', { nombre: nombreActual ?? '' }) : tipo === 'kiosco' ? t('tituloKiosco') : t('tituloLector')}
      descripcion={deNuevo ? t('descripcionDeNuevo') : t('descripcion')}
      icono={tipo === 'kiosco' ? TabletSmartphone : Nfc}
      ancho={560}
      primario={{ etiqueta: t('vincular'), onClick: () => void vincular(), cargando: enviando }}
    >
      <AvisoTonal
        tono="informacion"
        titulo={tipo === 'kiosco' ? t('paso.kiosco.titulo') : t('paso.lector.titulo')}
        descripcion={tipo === 'kiosco' ? t('paso.kiosco.descripcion') : t('paso.lector.descripcion')}
      />
      <FormField etiqueta={t('codigo')} ayuda={t('codigoAyuda')} obligatorio error={errorDe('codigo_invalido')}>
        {(c) => (
          <Input
            id={c.id}
            aria-describedby={c['aria-describedby']}
            aria-invalid={c['aria-invalid']}
            value={codigo}
            maxLength={12}
            autoComplete="off"
            autoCapitalize="characters"
            placeholder="K7Q · 4M2"
            className="font-mono text-lg tracking-widest"
            onChange={(e) => {
              setCodigo(e.target.value.toUpperCase());
              setError(null);
            }}
          />
        )}
      </FormField>
      {!deNuevo && (
        <>
          <FormField etiqueta={t('nombre')} obligatorio error={errorDe('nombre_invalido')}>
            {(c) => (
              <Input
                id={c.id}
                aria-describedby={c['aria-describedby']}
                aria-invalid={c['aria-invalid']}
                value={nombre}
                maxLength={80}
                placeholder={tipo === 'kiosco' ? t('nombreEjemploKiosco') : t('nombreEjemploLector')}
                onChange={(e) => {
                  setNombre(e.target.value);
                  setError(null);
                }}
              />
            )}
          </FormField>
          <FormField etiqueta={t('sede')} obligatorio error={errorDe('sede_invalida')}>
            {(c) => (
              <Select value={sedeId === null ? '' : String(sedeId)} onValueChange={(v) => setSedeId(Number(v))}>
                <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                  <SelectValue placeholder={t('eligeSede')} />
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
          <FormField etiqueta={t('donde')} ayuda={t('dondeAyuda')} error={errorDe('descripcion_invalida')}>
            {(c) => (
              <Input id={c.id} aria-describedby={c['aria-describedby']} value={descripcion} maxLength={200} onChange={(e) => setDescripcion(e.target.value)} />
            )}
          </FormField>
        </>
      )}
      {error && !['codigo_invalido', 'nombre_invalido', 'sede_invalida', 'descripcion_invalida'].includes(error) && (
        <AvisoTonal tono="peligro" rol="alert" titulo={t(`errores.${error === 'sin_permiso' || error === 'no_existe' ? error : 'error'}`)} />
      )}
    </Dialogo>
  );
}
