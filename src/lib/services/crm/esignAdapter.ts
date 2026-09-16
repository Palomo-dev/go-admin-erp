/**
 * F10 — adaptador de firma electrónica (Documenso). Única pieza que habla
 * con el proveedor; en pruebas se dobla. Nunca se invoca sin clave real
 * (`resolveEsignReadiness` decide antes).
 */

export interface EsignSignerInput {
  name: string;
  email: string;
}

export interface EsignCreateInput {
  title: string;
  document_url?: string;
  document_html?: string;
  signers: EsignSignerInput[];
  meta: { contract_id: string; organization_id: number };
}

export interface EsignCreateResult {
  providerDocumentId: string;
}

export interface EsignCredentials {
  apiKey: string;
  apiUrl: string;
}

export interface EsignAdapter {
  createDocument(input: EsignCreateInput, creds: EsignCredentials): Promise<EsignCreateResult>;
}

export class EsignProviderError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'EsignProviderError';
  }
}

/** Documenso v1: POST /documents → { documentId | id }. */
export const documensoAdapter: EsignAdapter = {
  async createDocument(input, creds) {
    const res = await fetch(`${creds.apiUrl.replace(/\/$/, '')}/documents`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${creds.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: input.title,
        document_url: input.document_url,
        document_html: input.document_html,
        recipients: input.signers.map((s) => ({ name: s.name, email: s.email, role: 'SIGNER' })),
        meta: input.meta,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new EsignProviderError(`El proveedor de firma respondió ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`, res.status);
    }
    const json = (await res.json().catch(() => ({}))) as { documentId?: unknown; document_id?: unknown; id?: unknown };
    const id = json.documentId ?? json.document_id ?? json.id;
    if (id === undefined || id === null || id === '') throw new EsignProviderError('El proveedor de firma no devolvió el id del documento');
    return { providerDocumentId: String(id) };
  },
};
