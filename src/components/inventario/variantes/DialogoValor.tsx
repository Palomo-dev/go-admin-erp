'use client';

import { useEffect, useMemo, useState } from 'react';
import { Tag } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Dialogo, FormField } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { IDIOMAS_TRADUCCION, type TipoVariante, type Traducciones, type ValorVariante } from './tipos';
import { HEX_VALIDO, SKU_VALIDO, codigoSkuSugerido, normalizarHex, normalizarNombre } from './logicaVariantes';
import { ErrorVariantes, variantesService } from './variantesService';

/** Muestras rápidas del Figma (negro, blanco, rojo, azul, verde, beige, naranja). */
const MUESTRAS = ['#111827', '#FFFFFF', '#DC2626', '#2563EB', '#16A34A', '#D6C7A1', '#F59E0B'];

export interface DialogoValorProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  /** null: nuevo valor. */
  valor: ValorVariante | null;
  /** Tipo propuesto al crear (el filtro activo). */
  tipoInicial: number | null;
  tipos: readonly TipoVariante[];
  valores: readonly ValorVariante[];
  onGuardado: (mensaje: string) => void;
}

/**
 * «Nuevo valor de «Color»» / «Editar valor» (Figma `972:607554`, hoja en
 * móvil `972:610426`): tipo, valor (avisa si ya existe sin mayúsculas),
 * muestra hex si el tipo se muestra como color, código para el SKU (único en
 * el tipo) y nombre en en/fr/pt. «Guardar y crear otro» deja el diálogo
 * abierto con el mismo tipo.
 */
export function DialogoValor({ abierto, onAbiertoChange, valor, tipoInicial, tipos, valores, onGuardado }: DialogoValorProps) {
  const t = useTranslations('inventarioVariantes');
  const [tipoId, setTipoId] = useState<number | null>(null);
  const [texto, setTexto] = useState('');
  const [hex, setHex] = useState('');
  const [sku, setSku] = useState('');
  const [skuTocado, setSkuTocado] = useState(false);
  const [traducciones, setTraducciones] = useState<Traducciones>({});
  const [errores, setErrores] = useState<{ valor?: string; hex?: string; sku?: string; general?: string }>({});
  const [guardando, setGuardando] = useState<'no' | 'cerrar' | 'otro'>('no');
  const [confirmarRenombre, setConfirmarRenombre] = useState(false);

  const reiniciar = (tipo: number | null) => {
    setTipoId(tipo);
    setTexto('');
    setHex('');
    setSku('');
    setSkuTocado(false);
    setTraducciones({});
    setErrores({});
  };

  useEffect(() => {
    if (!abierto) return;
    setConfirmarRenombre(false);
    if (valor) {
      setTipoId(valor.tipo_id);
      setTexto(valor.valor);
      setHex(valor.hex ?? '');
      setSku(valor.sku ?? '');
      setSkuTocado(true);
      setTraducciones(valor.traducciones);
      setErrores({});
    } else {
      reiniciar(tipoInicial ?? tipos[0]?.id ?? null);
    }
  }, [abierto, valor, tipoInicial, tipos]);

  const tipo = tipos.find((x) => x.id === tipoId) ?? null;
  const esColor = tipo?.estilo === 'color';
  const delTipo = useMemo(() => valores.filter((v) => v.tipo_id === tipoId && v.id !== valor?.id), [valores, tipoId, valor]);
  const parecido = delTipo.find((v) => normalizarNombre(v.valor) === normalizarNombre(texto)) ?? null;
  const cambiaTexto = !!valor && texto.trim() !== valor.valor;

  const cambiarTexto = (v: string) => {
    setTexto(v);
    setErrores((e) => ({ ...e, valor: undefined, general: undefined }));
    if (!skuTocado) setSku(codigoSkuSugerido(v));
  };

  const validar = (): boolean => {
    const e: typeof errores = {};
    if (!texto.trim()) e.valor = t('valor.errorValor');
    else if (parecido) e.valor = t('valor.errorRepetido', { nombre: parecido.valor });
    const h = normalizarHex(hex);
    if (h && !HEX_VALIDO.test(h)) e.hex = t('valor.errorHex');
    const s = sku.trim();
    if (s && !SKU_VALIDO.test(s)) e.sku = t('valor.errorSku');
    else if (s && delTipo.some((v) => (v.sku ?? '').toUpperCase() === s.toUpperCase())) e.sku = t('valor.errorSkuRepetido');
    if (!tipoId) e.general = t('valor.errorTipo');
    setErrores(e);
    return Object.keys(e).length === 0;
  };

  const guardar = async (otro: boolean) => {
    if (!tipoId) return;
    setGuardando(otro ? 'otro' : 'cerrar');
    try {
      const h = normalizarHex(hex);
      const r = await variantesService.guardarValor(valor?.id ?? null, {
        tipo_id: valor ? undefined : tipoId,
        valor: texto.trim(),
        hex: h || null,
        sku: sku.trim() ? sku.trim().toUpperCase() : null,
        traducciones,
      });
      const mensaje = valor
        ? r.variantes_actualizadas > 0
          ? t('toast.valorRenombrado', { n: r.variantes_actualizadas })
          : t('toast.valorActualizado')
        : t('toast.valorCreado', { valor: texto.trim(), tipo: tipo?.nombre ?? '' });
      onGuardado(mensaje);
      if (otro) reiniciar(tipoId);
      else onAbiertoChange(false);
    } catch (e) {
      const err = e instanceof ErrorVariantes ? e : null;
      if (err?.clave === 'nombreRepetido' || err?.clave === 'valorRepetido') setErrores({ valor: t('valor.errorRepetido', { nombre: texto.trim() }) });
      else if (err?.clave === 'skuRepetido') setErrores({ sku: t('valor.errorSkuRepetido') });
      else setErrores({ general: t(`errores.${err?.clave ?? 'desconocido'}`) });
    } finally {
      setGuardando('no');
      setConfirmarRenombre(false);
    }
  };

  const enviar = (otro: boolean) => {
    if (!validar()) return;
    if (cambiaTexto && (valor?.variantes ?? 0) > 0) {
      setConfirmarRenombre(true);
      return;
    }
    void guardar(otro);
  };

  const hexNormalizado = normalizarHex(hex);
  const titulo = valor ? t('valor.tituloEditar', { valor: valor.valor }) : tipo ? t('valor.tituloNuevoDe', { tipo: tipo.nombre }) : t('valor.tituloNuevo');

  return (
    <>
      <Dialogo
        abierto={abierto}
        onAbiertoChange={(v) => guardando === 'no' && onAbiertoChange(v)}
        titulo={titulo}
        descripcion={valor ? undefined : t('valor.descripcion')}
        icono={Tag}
        ancho={520}
        secundarios={
          valor
            ? undefined
            : [{ etiqueta: t('valor.guardarYOtro'), onClick: () => enviar(true), cargando: guardando === 'otro', deshabilitada: guardando === 'cerrar' }]
        }
        primario={{
          etiqueta: valor ? t('valor.guardar') : t('valor.crear'),
          onClick: () => enviar(false),
          cargando: guardando === 'cerrar',
          deshabilitada: guardando === 'otro',
        }}
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            enviar(false);
          }}
        >
          <FormField etiqueta={t('valor.tipo')} error={errores.general}>
            {(c) => (
              <Select value={tipoId ? String(tipoId) : undefined} onValueChange={(v) => setTipoId(Number(v))} disabled={!!valor}>
                <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10">
                  <SelectValue placeholder={t('valor.elegirTipo')} />
                </SelectTrigger>
                <SelectContent>
                  {tipos.map((x) => (
                    <SelectItem key={x.id} value={String(x.id)}>
                      {x.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField etiqueta={t('valor.valor')} obligatorio error={errores.valor} ayuda={t('valor.ayudaValor')}>
            <Input value={texto} onChange={(e) => cambiarTexto(e.target.value)} maxLength={80} autoFocus className="h-10" />
          </FormField>
          {esColor && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1.5 text-sm font-medium text-fg">{t('valor.muestra')}</legend>
              <div className="flex flex-wrap items-end gap-3">
                <span
                  aria-hidden
                  className="size-10 shrink-0 rounded-lg border border-line"
                  style={{ backgroundColor: HEX_VALIDO.test(hexNormalizado) ? hexNormalizado : 'transparent' }}
                />
                <FormField etiqueta={t('valor.hex')} error={errores.hex} className="w-36">
                  <Input
                    value={hex}
                    onChange={(e) => {
                      setHex(e.target.value);
                      setErrores((x) => ({ ...x, hex: undefined }));
                    }}
                    onBlur={() => setHex(normalizarHex(hex))}
                    placeholder="#6B7C3A"
                    maxLength={7}
                    className="h-10 font-mono uppercase"
                  />
                </FormField>
                <div className="flex flex-wrap items-center gap-2 pb-1.5" role="group" aria-label={t('valor.muestrasRapidas')}>
                  {MUESTRAS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setHex(m)}
                      aria-label={m}
                      aria-pressed={hexNormalizado === m}
                      className="size-7 rounded-full border border-line transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand aria-pressed:ring-2 aria-pressed:ring-brand"
                      style={{ backgroundColor: m }}
                    />
                  ))}
                  <input
                    type="color"
                    value={HEX_VALIDO.test(hexNormalizado) ? hexNormalizado : '#000000'}
                    onChange={(e) => setHex(e.target.value.toUpperCase())}
                    aria-label={t('valor.colorPersonalizado')}
                    className="h-7 w-10 cursor-pointer rounded border border-line bg-surface p-0.5"
                  />
                </div>
              </div>
            </fieldset>
          )}
          <FormField etiqueta={t('valor.sku')} error={errores.sku} ayuda={t('valor.ayudaSku')}>
            <Input
              value={sku}
              onChange={(e) => {
                setSku(e.target.value.toUpperCase());
                setSkuTocado(true);
                setErrores((x) => ({ ...x, sku: undefined }));
              }}
              maxLength={8}
              className="h-10 font-mono uppercase"
            />
          </FormField>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-sm font-medium text-fg">{t('valor.traducciones')}</legend>
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
        </form>
      </Dialogo>

      <ConfirmDialog
        open={confirmarRenombre}
        onOpenChange={(v) => guardando === 'no' && setConfirmarRenombre(v)}
        title={t('renombrar.titulo', { antes: valor?.valor ?? '', despues: texto.trim() })}
        description={t('renombrar.descripcionValor', { n: valor?.variantes ?? 0 })}
        confirmLabel={t('renombrar.confirmar')}
        loading={guardando !== 'no'}
        onConfirm={() => guardar(false)}
      />
    </>
  );
}
