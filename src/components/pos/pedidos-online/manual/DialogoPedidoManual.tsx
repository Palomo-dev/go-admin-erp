'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Copy, MessageCircle } from 'lucide-react';
import { AvisoTonal, CampoNumero, Dialogo, FormField, clasesBoton } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/kit/PhoneInput';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useBranch } from '@/lib/context/BranchContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { SelectorProductosPedido, type LineaSeleccionada } from './SelectorProductosPedido';

interface Props {
  organizationId: number;
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  onCreado: () => void;
}

interface Resultado {
  pedido: { id: string; order_number: string; total: number };
  link: { url: string; proveedor: string } | null;
  aviso: string | null;
}

/**
 * Pedido manual: tienda (sede), cliente y productos. Crea el pedido con el número de la tienda
 * (`WO-{org}-…`), pendiente, y el link de pago si la organización tiene Wompi o Bold.
 */
export function DialogoPedidoManual({ organizationId, abierto, onAbiertoChange, onCreado }: Props) {
  const t = useTranslations('pedidosManuales.manual');
  const { toast } = useToast();
  const { formatear } = useMonedaOrganizacion();
  const { branches: todas, selectedBranchId } = useBranch();
  const branches = useMemo(() => todas.filter((b): b is typeof b & { id: number } => typeof b.id === 'number'), [todas]);
  const [sede, setSede] = useState<string>('');
  const [canal, setCanal] = useState<'whatsapp' | 'phone'>('whatsapp');
  const [entrega, setEntrega] = useState<'pickup' | 'delivery_own'>('pickup');
  const [envio, setEnvio] = useState<number | null>(null);
  const [cliente, setCliente] = useState({ nombre: '', celular: '', correo: '', direccion: '', ciudad: '' });
  const [notas, setNotas] = useState('');
  const [lineas, setLineas] = useState<LineaSeleccionada[]>([]);
  const [generarLink, setGenerarLink] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  useEffect(() => {
    if (!abierto) return;
    setSede(selectedBranchId ? String(selectedBranchId) : branches[0] ? String(branches[0].id) : '');
    setCanal('whatsapp');
    setEntrega('pickup');
    setEnvio(null);
    setCliente({ nombre: '', celular: '', correo: '', direccion: '', ciudad: '' });
    setNotas('');
    setLineas([]);
    setGenerarLink(true);
    setError(null);
    setResultado(null);
    // Solo al abrir: si la lista de sedes se recarga, no se borra lo que se está escribiendo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  // Sedes que llegan después de abrir: la primera (o la elegida en el encabezado) si no hay.
  useEffect(() => {
    if (abierto && !sede && branches.length > 0) setSede(String(selectedBranchId ?? branches[0].id));
  }, [abierto, sede, branches, selectedBranchId]);

  const faltante = !sede ? t('faltaSede') : !cliente.nombre.trim() ? t('faltaNombre') : lineas.length === 0 ? t('faltanProductos') : null;

  const crear = async () => {
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch('/api/web-orders/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branch_id: Number(sede),
          canal,
          delivery_type: entrega,
          envio: entrega === 'delivery_own' ? envio ?? 0 : 0,
          cliente,
          notas,
          items: lineas.map((l) => ({ product_id: l.product_id, quantity: l.quantity })),
          generar_link: generarLink,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error ?? t('errorCrear'));
        return;
      }
      setResultado(json as Resultado);
      onCreado();
    } catch {
      setError(t('errorCrear'));
    } finally {
      setEnviando(false);
    }
  };

  const copiar = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: t('linkCopiado') });
    } catch {
      toast({ title: url });
    }
  };
  const whatsapp = (r: Resultado) => {
    const tel = cliente.celular.replace(/\D/g, '');
    const texto = t('mensajeWhatsapp', { pedido: r.pedido.order_number, total: formatear(r.pedido.total), url: r.link?.url ?? '' });
    return `https://wa.me/${tel}?text=${encodeURIComponent(texto)}`;
  };

  if (resultado) {
    return (
      <Dialogo
        abierto={abierto}
        onAbiertoChange={onAbiertoChange}
        titulo={t('creadoTitulo', { pedido: resultado.pedido.order_number })}
        descripcion={t('creadoDescripcion', { total: formatear(resultado.pedido.total) })}
        primario={{ etiqueta: t('listo'), onClick: () => onAbiertoChange(false) }}
        textoCancelar={t('cerrar')}
      >
        {resultado.link ? (
          <div className="space-y-3">
            <FormField etiqueta={t('linkDePago')}>
              <Input readOnly value={resultado.link.url} onFocus={(e) => e.currentTarget.select()} />
            </FormField>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'md' })} onClick={() => void copiar(resultado.link!.url)}>
                <Copy className="size-4" aria-hidden="true" />
                {t('copiarLink')}
              </button>
              {cliente.celular.replace(/\D/g, '').length >= 7 && (
                <a href={whatsapp(resultado)} target="_blank" rel="noopener noreferrer" className={clasesBoton({ variante: 'secundario', tamano: 'md' })}>
                  <MessageCircle className="size-4" aria-hidden="true" />
                  {t('enviarWhatsapp')}
                </a>
              )}
            </div>
            <AvisoTonal tono="informacion" compacto titulo={t('linkAviso')} />
          </div>
        ) : (
          <AvisoTonal
            tono={resultado.aviso ? 'advertencia' : 'informacion'}
            titulo={resultado.aviso === 'LINK_FALLO' ? t('linkFallo') : resultado.aviso === 'SIN_PASARELA_LINK' ? t('sinPasarela') : t('sinLink')}
          />
        )}
      </Dialogo>
    );
  }

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo')}
      descripcion={t('descripcion')}
      ancho={672}
      primario={{ etiqueta: t('crear'), onClick: () => void crear(), cargando: enviando, deshabilitada: !!faltante, motivo: faltante ?? undefined }}
    >
      <div className="space-y-4">
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
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField etiqueta={t('canal')}>
            {(c) => (
              <Select value={canal} onValueChange={(v) => setCanal(v as 'whatsapp' | 'phone')}>
                <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp">{t('canalWhatsapp')}</SelectItem>
                  <SelectItem value="phone">{t('canalTelefono')}</SelectItem>
                </SelectContent>
              </Select>
            )}
          </FormField>
        </div>

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
          <FormField etiqueta={t('entrega')}>
            {(c) => (
              <Select value={entrega} onValueChange={(v) => setEntrega(v as 'pickup' | 'delivery_own')}>
                <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pickup">{t('recoger')}</SelectItem>
                  <SelectItem value="delivery_own">{t('domicilio')}</SelectItem>
                </SelectContent>
              </Select>
            )}
          </FormField>
          {entrega === 'delivery_own' && (
            <FormField etiqueta={t('envio')}>
              <CampoNumero valor={envio} onValorChange={setEnvio} minimo={0} decimales={0} />
            </FormField>
          )}
        </div>

        <div className="space-y-1">
          <p className="text-sm font-medium text-fg">{t('productos')}</p>
          <SelectorProductosPedido organizationId={organizationId} lineas={lineas} onCambiar={setLineas} />
          <p className="text-xs text-fg-secondary">{t('preciosVigentes')}</p>
        </div>

        <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} placeholder={t('notas')} maxLength={1000} rows={2} />

        <label className="flex items-start gap-2 text-sm text-fg">
          <Checkbox checked={generarLink} onCheckedChange={(v) => setGenerarLink(v === true)} className="mt-0.5" />
          <span>
            {t('generarLink')}
            <span className="block text-xs text-fg-secondary">{t('generarLinkAyuda')}</span>
          </span>
        </label>

        {error && <AvisoTonal tono="peligro" titulo={error} />}
      </div>
    </Dialogo>
  );
}
