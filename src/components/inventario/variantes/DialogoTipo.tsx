'use client';

import { useEffect, useState } from 'react';
import { Layers, Merge } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Dialogo, FormField, SegmentedControl } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ATRIBUTOS_META, ESTILOS_TIPO, IDIOMAS_TRADUCCION, type AtributoMeta, type EstiloTipo, type TipoVariante, type Traducciones } from './tipos';
import { metaSugerido, normalizarNombre } from './logicaVariantes';
import { ErrorVariantes, variantesService } from './variantesService';

const SIN_META = 'ninguno';

export interface DialogoTipoProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  /** null: nuevo tipo. */
  tipo: TipoVariante | null;
  tipos: readonly TipoVariante[];
  onGuardado: (mensaje: string) => void;
  /** Nombre repetido: la pantalla ofrece fusionar con el existente. */
  onFusionarCon: (existente: TipoVariante, actual: TipoVariante | null) => void;
}

/**
 * «Nuevo tipo de variante» / «Editar tipo» (Figma `972:607461`): nombre (sin
 * distinguir mayúsculas, tildes ni espacios), cómo se muestra en el POS y la
 * tienda, campo del catálogo de Facebook, nombre en en/fr/pt y activo.
 * Renombrar pide confirmación con el impacto («se actualiza en N variantes;
 * los SKU no cambian», Figma `972:607716`).
 */
export function DialogoTipo({ abierto, onAbiertoChange, tipo, tipos, onGuardado, onFusionarCon }: DialogoTipoProps) {
  const t = useTranslations('inventarioVariantes');
  const [nombre, setNombre] = useState('');
  const [estilo, setEstilo] = useState<EstiloTipo>('texto');
  const [meta, setMeta] = useState<AtributoMeta | null>(null);
  const [metaTocado, setMetaTocado] = useState(false);
  const [traducciones, setTraducciones] = useState<Traducciones>({});
  const [activo, setActivo] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [repetido, setRepetido] = useState<TipoVariante | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [confirmarRenombre, setConfirmarRenombre] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setNombre(tipo?.nombre ?? '');
    setEstilo(tipo?.estilo ?? 'texto');
    setMeta(tipo?.meta ?? null);
    setMetaTocado(!!tipo);
    setTraducciones(tipo?.traducciones ?? {});
    setActivo(tipo?.activo ?? true);
    setError(null);
    setRepetido(null);
    setConfirmarRenombre(false);
  }, [abierto, tipo]);

  const cambiaNombre = !!tipo && nombre.trim() !== tipo.nombre;

  const cambiarNombre = (valor: string) => {
    setNombre(valor);
    setError(null);
    setRepetido(null);
    if (!metaTocado) setMeta(metaSugerido(valor));
  };

  const validar = (): boolean => {
    const limpio = nombre.trim();
    if (!limpio) {
      setError(t('tipo.errorNombre'));
      return false;
    }
    const otro = tipos.find((x) => x.id !== tipo?.id && normalizarNombre(x.nombre) === normalizarNombre(limpio));
    if (otro) {
      setError(t('tipo.errorRepetido', { nombre: otro.nombre }));
      setRepetido(otro);
      return false;
    }
    return true;
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      const r = await variantesService.guardarTipo(tipo?.id ?? null, {
        nombre: nombre.trim(),
        estilo,
        meta,
        traducciones,
        activo,
      });
      onGuardado(
        tipo
          ? r.variantes_actualizadas > 0
            ? t('toast.tipoRenombrado', { n: r.variantes_actualizadas })
            : t('toast.tipoActualizado')
          : t('toast.tipoCreado', { nombre: nombre.trim() }),
      );
      onAbiertoChange(false);
    } catch (e) {
      const err = e instanceof ErrorVariantes ? e : null;
      if (err?.clave === 'nombreRepetido') {
        const otro = tipos.find((x) => x.id === err.relacionado) ?? null;
        setRepetido(otro);
        setError(t('tipo.errorRepetido', { nombre: otro?.nombre ?? nombre.trim() }));
      } else {
        setError(t(`errores.${err?.clave ?? 'desconocido'}`));
      }
    } finally {
      setGuardando(false);
      setConfirmarRenombre(false);
    }
  };

  const enviar = () => {
    if (!validar()) return;
    if (cambiaNombre && (tipo?.variantes ?? 0) > 0) {
      setConfirmarRenombre(true);
      return;
    }
    void guardar();
  };

  return (
    <>
      <Dialogo
        abierto={abierto}
        onAbiertoChange={(v) => !guardando && onAbiertoChange(v)}
        titulo={tipo ? t('tipo.tituloEditar', { nombre: tipo.nombre }) : t('tipo.tituloNuevo')}
        descripcion={t('tipo.descripcion')}
        icono={Layers}
        ancho={520}
        primario={{ etiqueta: tipo ? t('tipo.guardar') : t('tipo.crear'), onClick: enviar, cargando: guardando }}
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            enviar();
          }}
        >
          <FormField etiqueta={t('tipo.nombre')} obligatorio error={error} ayuda={t('tipo.ayudaNombre')}>
            <Input value={nombre} onChange={(e) => cambiarNombre(e.target.value)} maxLength={60} autoFocus className="h-10" />
          </FormField>
          {repetido && (
            <button
              type="button"
              onClick={() => {
                onAbiertoChange(false);
                onFusionarCon(repetido, tipo);
              }}
              className="-mt-2 inline-flex items-center gap-1.5 self-start text-sm font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Merge aria-hidden className="size-4" strokeWidth={1.5} />
              {t('tipo.fusionarCon', { nombre: repetido.nombre })}
            </button>
          )}
          <FormField etiqueta={t('tipo.estilo')}>
            {(c) => (
              <SegmentedControl
                aria-labelledby={c.idEtiqueta}
                anchoCompleto
                valor={estilo}
                onValorChange={setEstilo}
                opciones={ESTILOS_TIPO.map((e) => ({ valor: e, etiqueta: t(`estilos.${e}`) }))}
              />
            )}
          </FormField>
          <FormField etiqueta={t('tipo.meta')} ayuda={t('tipo.ayudaMeta')}>
            {(c) => (
              <Select
                value={meta ?? SIN_META}
                onValueChange={(v) => {
                  setMetaTocado(true);
                  setMeta(v === SIN_META ? null : (v as AtributoMeta));
                }}
              >
                <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_META}>{t('meta.ninguno')}</SelectItem>
                  {ATRIBUTOS_META.map((m) => (
                    <SelectItem key={m} value={m}>
                      {t(`meta.${m}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-sm font-medium text-fg">{t('tipo.traducciones')}</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {IDIOMAS_TRADUCCION.map((idioma) => (
                <FormField key={idioma} etiqueta={t(`idiomas.${idioma}`)}>
                  <Input
                    value={traducciones[idioma] ?? ''}
                    onChange={(e) => setTraducciones((prev) => ({ ...prev, [idioma]: e.target.value }))}
                    maxLength={80}
                    className="h-10"
                  />
                </FormField>
              ))}
            </div>
          </fieldset>
          <label className="flex cursor-pointer items-center gap-3 text-sm text-fg">
            <Switch checked={activo} onCheckedChange={setActivo} />
            {t('tipo.activo')}
          </label>
        </form>
      </Dialogo>

      <ConfirmDialog
        open={confirmarRenombre}
        onOpenChange={(v) => !guardando && setConfirmarRenombre(v)}
        title={t('renombrar.titulo', { antes: tipo?.nombre ?? '', despues: nombre.trim() })}
        description={t('renombrar.descripcionTipo', { n: tipo?.variantes ?? 0 })}
        confirmLabel={t('renombrar.confirmar')}
        loading={guardando}
        onConfirm={guardar}
      />
    </>
  );
}
