'use client';

/**
 * «Crear cliente» desde la reserva (Figma 489:243139, decisión 4): lo mínimo
 * para reservar por teléfono —nombre, apellido, teléfono y correo—. Antes de
 * crear busca por teléfono (`customers` no tiene único por teléfono) y ofrece
 * «Usar el existente». El alta es la misma de los documentos
 * (`crearClienteRapido`: `buildCustomerInsert` y su control de duplicado).
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/kit';
import { PhoneInput, esTelefonoValido } from '@/components/kit/PhoneInput';
import type { ClientePicker } from '@/components/kit/CustomerPicker';

export interface ClienteParecido {
  cliente: ClientePicker;
  visitas: number | null;
}

interface Props {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  /** Texto que se escribió en el buscador (va al nombre). */
  textoInicial?: string;
  /** Busca un cliente con ese teléfono (null si no hay). */
  buscarPorTelefono: (telefono: string) => Promise<ClienteParecido | null>;
  onCrear: (d: { nombres: string; apellidos: string; telefono: string; correo: string }) => Promise<ClientePicker>;
  onUsar: (cliente: ClientePicker) => void;
}

export function CrearClienteReservaDialog({ abierto, onAbiertoChange, textoInicial, buscarPorTelefono, onCrear, onUsar }: Props) {
  const t = useTranslations('posReservasMesas.crearCliente');
  const [nombres, setNombres] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [telefono, setTelefono] = useState('');
  const [correo, setCorreo] = useState('');
  const [parecido, setParecido] = useState<ClienteParecido | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto) return;
    const [n, ...resto] = (textoInicial ?? '').trim().split(/\s+/);
    setNombres(n ?? '');
    setApellidos(resto.join(' '));
    setTelefono('');
    setCorreo('');
    setParecido(null);
    setError(null);
  }, [abierto, textoInicial]);

  useEffect(() => {
    if (!abierto || !esTelefonoValido(telefono)) {
      setParecido(null);
      return;
    }
    let vivo = true;
    const id = setTimeout(() => {
      buscarPorTelefono(telefono)
        .then((p) => vivo && setParecido(p))
        .catch(() => vivo && setParecido(null));
    }, 300);
    return () => {
      vivo = false;
      clearTimeout(id);
    };
  }, [abierto, telefono, buscarPorTelefono]);

  const valido = nombres.trim() !== '' && apellidos.trim() !== '' && esTelefonoValido(telefono) && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo.trim());

  const crear = async () => {
    if (!valido) return;
    setGuardando(true);
    setError(null);
    try {
      const c = await onCrear({ nombres: nombres.trim(), apellidos: apellidos.trim(), telefono, correo: correo.trim() });
      onUsar(c);
      onAbiertoChange(false);
    } catch (e) {
      setError(e instanceof Error && e.message === 'cliente_duplicado' ? t('duplicado') : t('error'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={abierto} onOpenChange={(a) => !guardando && onAbiertoChange(a)}>
      <DialogContent className="max-w-[520px] gap-0 p-6">
        <DialogTitle className="text-xl font-semibold leading-7 text-fg">{t('titulo')}</DialogTitle>
        <DialogDescription className="mt-2 text-[13px] leading-[18px] text-fg-secondary">{t('descripcion')}</DialogDescription>
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField etiqueta={t('nombre')} obligatorio>
              <Input value={nombres} onChange={(e) => setNombres(e.target.value)} autoComplete="given-name" />
            </FormField>
            <FormField etiqueta={t('apellido')} obligatorio>
              <Input value={apellidos} onChange={(e) => setApellidos(e.target.value)} autoComplete="family-name" />
            </FormField>
          </div>
          <FormField etiqueta={t('telefono')} obligatorio ayuda={t('telefonoAyuda')}>
            <PhoneInput value={telefono} onChange={setTelefono} tamano="md" />
          </FormField>
          <FormField etiqueta={t('correo')} obligatorio>
            <Input type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} autoComplete="email" />
          </FormField>
          {parecido && (
            <p role="status" className="rounded-lg border border-line-warning bg-warning-subtle px-3 py-2.5 text-[13px] leading-[18px] text-warning-text">
              {parecido.visitas != null
                ? t('existe', { nombre: parecido.cliente.nombre, n: parecido.visitas })
                : t('existeSinVisitas', { nombre: parecido.cliente.nombre })}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-danger-text">
              {error}
            </p>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          {parecido ? (
            <Button
              variant="ghost"
              onClick={() => {
                onUsar(parecido.cliente);
                onAbiertoChange(false);
              }}
              disabled={guardando}
            >
              {t('usarExistente')}
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => onAbiertoChange(false)} disabled={guardando}>
              {t('cancelar')}
            </Button>
          )}
          <Button onClick={() => void crear()} disabled={!valido || guardando}>
            {t('crearYUsar')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
