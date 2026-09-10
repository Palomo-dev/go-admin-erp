'use client';

import { useEffect, useState } from 'react';
import { FileText, Loader2, Paperclip, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import type { MediaValue } from './useWhatsAppCompose';

interface DocRow { id: string; name?: string; file_name?: string; mime_type?: string; file_size?: number; file_path?: string }

const MAX_IMAGE = 5 * 1024 * 1024;
const MAX_DOC = 20 * 1024 * 1024;

/**
 * Adjunto: documento de la oportunidad (PDF ≤20 MB, URL firmada 24 h) o subir
 * una imagen (≤5 MB) al bucket `crm-documents` (path `{org}/whatsapp/…`).
 * Meta/Twilio descargan el archivo por URL, por eso se firma.
 */
export function MediaAttachment({ opportunityId, value, onChange, disabled }: { opportunityId?: string | null; value: MediaValue | null; onChange: (v: MediaValue | null) => void; disabled?: boolean }) {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || !opportunityId) return;
    fetch(`/api/crm/documents?related_type=opportunity&related_id=${opportunityId}&limit=20`, { credentials: 'include' })
      .then((r) => r.json()).then((j) => setDocs((j.data ?? []) as DocRow[])).catch(() => setDocs([]));
  }, [open, opportunityId]);

  const signed = async (path: string) => {
    const { data, error } = await supabase.storage.from('crm-documents').createSignedUrl(path, 24 * 3600);
    if (error || !data?.signedUrl) throw new Error(error?.message ?? 'No se pudo firmar la URL');
    return data.signedUrl;
  };

  const pickDoc = async (d: DocRow) => {
    if (!d.file_path) return;
    if ((d.file_size ?? 0) > MAX_DOC) { toast({ title: 'Documento demasiado grande', description: 'Máximo 20 MB para WhatsApp', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      onChange({ url: await signed(d.file_path), mime: d.mime_type ?? 'application/pdf', filename: d.file_name ?? d.name ?? 'documento.pdf' });
      setOpen(false);
    } catch (e) {
      toast({ title: 'No se pudo adjuntar', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const upload = async (file: File) => {
    if (!file.type.startsWith('image/')) { toast({ title: 'Solo imágenes', description: 'Para PDF usa los documentos de la oportunidad', variant: 'destructive' }); return; }
    if (file.size > MAX_IMAGE) { toast({ title: 'Imagen demasiado grande', description: 'Máximo 5 MB', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      const path = `${getOrganizationId()}/whatsapp/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`;
      const { error } = await supabase.storage.from('crm-documents').upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      onChange({ url: await signed(path), mime: file.type, filename: file.name });
      setOpen(false);
    } catch (e) {
      toast({ title: 'No se pudo subir la imagen', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' });
    } finally { setBusy(false); }
  };

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-gray-200 dark:border-gray-700 px-2 py-1 text-xs">
        <FileText className="h-3.5 w-3.5 text-gray-500" aria-hidden="true" />
        <span className="truncate flex-1">{value.filename ?? value.mime}</span>
        <button type="button" onClick={() => onChange(null)} aria-label="Quitar adjunto" className="text-gray-400 hover:text-red-600" disabled={disabled}><X className="h-3.5 w-3.5" /></button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setOpen((o) => !o)} disabled={disabled || busy} aria-expanded={open}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Paperclip className="h-3.5 w-3.5 mr-1" aria-hidden="true" />}Adjuntar
      </Button>
      {open && (
        <div className="absolute z-20 mt-1 w-72 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-lg p-2 text-xs space-y-2">
          <label className="block">
            <span className="font-medium">Subir imagen (≤5 MB)</span>
            <input type="file" accept="image/*" capture="environment" className="mt-1 block w-full text-[11px]" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
          </label>
          {opportunityId && (
            <div>
              <p className="font-medium">Documentos de la oportunidad</p>
              {docs.length === 0 ? <p className="text-gray-500 mt-1">Sin documentos</p> : (
                <ul className="mt-1 max-h-32 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
                  {docs.map((d) => (
                    <li key={d.id}><button type="button" className="w-full text-left py-1 hover:text-blue-600 truncate" onClick={() => void pickDoc(d)}>{d.file_name ?? d.name ?? d.id}</button></li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
