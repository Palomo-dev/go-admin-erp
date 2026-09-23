'use client';

import { useRef, useState } from 'react';
import { AlertCircle, CheckCircle, Download, FileSpreadsheet, Loader2, Upload, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { StatusBadge, SegmentedControl } from '@/components/kit';
import { supabase } from '@/lib/supabase/config';

/**
 * Importar clientes desde CSV/XLS/XLSX. Se trasladó tal cual desde
 * `ClientesActions.tsx` (rediseño del listado, 2026-09-24): mismas columnas
 * reconocidas (plantilla propia y exportes de Siigo/Alegra), mismos tres modos
 * y la misma detección de duplicados por documento normalizado o correo.
 * Solo cambió la presentación (kit) y el tipado.
 */
interface FilaImportacion {
  row: number;
  customerType?: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  tradeName?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  docType?: string;
  docNumber?: string;
  dv?: string;
  address?: string;
  city?: string;
  notes?: string;
  tags?: string;
  roles?: string;
  preferences?: string;
  avatarUrl?: string;
  fiscalResponsibilities?: string;
  parentCustomerDoc?: string;
  status: 'pending' | 'success' | 'error';
  error?: string;
}

type ModoImportacion = 'create_and_update' | 'create_only' | 'update_only';
type Paso = 'upload' | 'preview' | 'importing' | 'complete';

interface ErrorSupabase {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

export interface ImportarClientesDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  organizationId: number | null;
  onImportado: () => void;
}

export function descargarPlantillaClientes(): void {
  const headers =
    'Tipo de Cliente,Nombre,Apellido,Razón Social,Nombre Comercial,Nombre Completo,Email,Teléfono,Tipo Documento,Número Documento,DV,Dirección,Ciudad,Notas,Etiquetas,Roles,Preferencias,URL Avatar,Responsabilidades Fiscales,Documento Empresa Padre';
  const example1 =
    'Persona,Juan,Pérez,,,Juan Pérez,juan@email.com,3001234567,Cédula,123456789,,Calle 123 #45-67,Bogotá,Cliente VIP,cliente;huesped,,,https://ejemplo.com/avatar.jpg,R-99-PN,';
  const example2 =
    'Empresa,,,Mi Empresa SA,Empresa Comercial,Mi Empresa SA,empresa@email.com,3109876543,NIT,900123456,8,Av. Principal 100,Medellín,Cliente corporativo,cliente,"{""credit_limit"":1000000}",,https://ejemplo.com/logo.png,R-99-PN,';
  const example3 =
    'Persona,María,Gómez,,,María Gómez,maria@email.com,3152345678,Cédula,987654321,,Carrera 50 #20-30,Cali,,,cliente;huesped,,,,R-99-PN,900123456';

  const blob = new Blob([`${headers}\n${example1}\n${example2}\n${example3}`], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'plantilla_clientes.csv';
  link.click();
}

const COLUMNAS_SOPORTADAS = [
  ['Tipo de Cliente', 'Persona o Empresa'],
  ['Nombre', 'Nombre (para personas)'],
  ['Apellido', 'Apellido (para personas)'],
  ['Razón Social', 'Nombre de la empresa (para empresas)'],
  ['Nombre Comercial', 'Nombre comercial'],
  ['Email', 'Correo electrónico'],
  ['Teléfono', 'Número de teléfono'],
  ['Tipo Documento', 'Cédula, NIT, Pasaporte, etc.'],
  ['Número Documento', 'Número de identificación'],
  ['DV', 'Dígito de verificación (para NIT)'],
  ['Dirección', 'Dirección física'],
  ['Ciudad', 'Ciudad'],
  ['Notas', 'Notas internas'],
  ['Etiquetas', 'Separadas por punto y coma (;)'],
  ['Roles', 'Separados por punto y coma (;)'],
  ['Preferencias', 'JSON con preferencias'],
  ['Responsabilidades Fiscales', 'Separadas por (;)'],
  ['Documento Empresa Padre', 'NIT de empresa vinculada'],
] as const;

const texto = (v: unknown) => String(v ?? '').trim();

export function ImportarClientesDialog({ abierto, onAbiertoChange, organizationId, onImportado }: ImportarClientesDialogProps) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [filas, setFilas] = useState<FilaImportacion[]>([]);
  const [paso, setPaso] = useState<Paso>('upload');
  const [stats, setStats] = useState({ total: 0, success: 0, errors: 0, pending: 0 });
  const [modo, setModo] = useState<ModoImportacion>('create_and_update');
  const [procesando, setProcesando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'success' | 'error' | 'info'; texto: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reiniciar = () => {
    setArchivo(null);
    setFilas([]);
    setPaso('upload');
    setStats({ total: 0, success: 0, errors: 0, pending: 0 });
    setMensaje(null);
  };

  const leerArchivo = async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawData = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });

      let headerRow = -1;
      for (let i = 0; i < Math.min(10, rawData.length); i++) {
        const row = rawData[i];
        if (
          row &&
          row.some((cell) => {
            const v = texto(cell).toLowerCase();
            return (
              v === 'nit' || v.includes('razon social') || v.includes('razón social') ||
              v === 'email' || v === 'correo' || v === 'nombre1' || v === 'nombre 1' ||
              v.includes('tipo de cliente') || v.includes('customer type') || v === 'nombre' || v === 'name'
            );
          })
        ) {
          headerRow = i;
          break;
        }
      }
      if (headerRow === -1) headerRow = 0;

      const headers = (rawData[headerRow] ?? []).map((h) => texto(h).toLowerCase());
      const idx = (pred: (h: string) => boolean) => headers.findIndex(pred);

      // Columnas con varios nombres posibles (plantilla + archivos reales de Siigo/Alegra)
      const typeIdx = idx((h) => h.includes('tipo de cliente') || h.includes('customer type') || h === 'tipo');
      const firstNameIdx = idx((h) => h === 'nombre' || h === 'first name' || h === 'first_name' || h === 'nombre1' || h === 'nombre 1' || h.includes('nombre '));
      const lastNameIdx = idx((h) => h === 'apellido' || h === 'last name' || h === 'last_name' || h === 'apellido1' || h === 'apellido 1' || h.includes('apellido'));
      const companyIdx = idx((h) => h.includes('razón social') || h.includes('razon social') || h.includes('company name') || h.includes('company_name'));
      const tradeIdx = idx((h) => h.includes('nombre comercial') || h.includes('trade name') || h.includes('trade_name'));
      const fullNameIdx = idx((h) => h.includes('nombre completo') || h.includes('full name') || h.includes('full_name'));
      const emailIdx = idx((h) => h === 'email' || h === 'correo' || h.includes('correo electrónico') || h.includes('correo electronico'));
      const phoneIdx = idx((h) => h === 'teléfono' || h === 'telefono' || h === 'phone' || h === 'tel' || h.includes('tel'));
      const celularIdx = idx((h) => h === 'celular' || h === 'cel' || h === 'móvil' || h === 'movil' || h === 'mobile');
      const docTypeIdx = idx((h) => h.includes('tipo documento') || h.includes('doc type') || h.includes('doc_type') || h.includes('tipo doc'));
      const docNumberIdx = idx(
        (h) =>
          h === 'nit' || h.includes('número documento') || h.includes('numero documento') || h.includes('doc number') ||
          h.includes('doc_number') || h.includes('identificación') || h.includes('identificacion') ||
          h.includes('número identificación') || h.includes('numero identificacion'),
      );
      const dvIdx = idx((h) => h === 'dv' || h === 'dig. ver.' || h === 'dig ver' || h.includes('dígito verificación') || h.includes('digito verificacion') || h.includes('digito ver'));
      const addressIdx = idx((h) => h === 'dirección' || h === 'direccion' || h === 'address' || h.includes('direc'));
      const cityIdx = idx((h) => h === 'ciudad' || h === 'city' || h.includes('ciudad') || h.includes('id ciudad'));
      const notesIdx = idx((h) => h === 'notas' || h === 'notes' || h.includes('nota') || h === 'contacto');
      const tagsIdx = idx((h) => h === 'etiquetas' || h === 'tags' || h.includes('etiqueta') || h === 'grupo');
      const rolesIdx = idx((h) => h === 'roles' || h === 'rol' || h.includes('role'));
      const preferencesIdx = idx((h) => h === 'preferencias' || h === 'preferences' || h.includes('preferencia'));
      const avatarIdx = idx((h) => h.includes('url avatar') || h.includes('avatar') || h.includes('foto'));
      const fiscalIdx = idx((h) => h.includes('responsabilidades fiscales') || h.includes('fiscal') || h.includes('fiscal_responsibilities'));
      const parentDocIdx = idx((h) => h.includes('documento empresa padre') || h.includes('parent') || h.includes('empresa padre'));
      const col = (row: unknown[], i: number) => (i !== -1 ? texto(row[i]) : undefined);

      const salida: FilaImportacion[] = [];
      for (let i = headerRow + 1; i < rawData.length; i++) {
        const row = rawData[i];
        if (!row || row.every((c) => !c && c !== 0)) continue;

        const firstName = col(row, firstNameIdx);
        const lastName = col(row, lastNameIdx);
        const companyName = col(row, companyIdx);
        const docNumber = col(row, docNumberIdx);
        const email = col(row, emailIdx);

        if (!firstName && !companyName && !docNumber && !email) continue;
        if (docNumber === '-' && !firstName && !companyName && !email) continue;

        const finalPhone = (col(row, phoneIdx) ?? '') || (col(row, celularIdx) ?? '') || undefined;

        // RS = Régimen Simplificado (persona), PJ = Persona Jurídica, GN = Gran Contribuyente, CC/CE = persona
        const typeValue = (col(row, typeIdx) ?? '').toUpperCase();
        const isCompanyByType = typeValue === 'PJ' || typeValue === 'GN' || typeValue.includes('EMPRESA') || typeValue === 'COMPANY';
        const isPersonByType = typeValue === 'RS' || typeValue === 'CC' || typeValue === 'CE' || typeValue === 'TI' || typeValue.includes('PERSONA');
        const isCompanyRow = isCompanyByType || (!isPersonByType && !!companyName && !firstName && !lastName);

        let finalFirstName = firstName || undefined;
        let finalLastName = lastName || undefined;
        let finalCompanyName = companyName || undefined;
        if (!isCompanyRow && companyName && !firstName && !lastName) {
          // «Bibiana patricia rojas» → nombre «Bibiana patricia», apellido «rojas»
          const parts = companyName.split(/\s+/);
          if (parts.length >= 2) {
            finalFirstName = parts.slice(0, -1).join(' ');
            finalLastName = parts[parts.length - 1];
          } else {
            finalFirstName = companyName;
          }
          finalCompanyName = undefined;
        }

        salida.push({
          row: i + 1,
          customerType: isCompanyRow ? 'Empresa' : 'Persona',
          firstName: finalFirstName,
          lastName: finalLastName,
          companyName: isCompanyRow ? finalCompanyName : undefined,
          tradeName: col(row, tradeIdx),
          fullName: col(row, fullNameIdx),
          email: email || undefined,
          phone: finalPhone,
          docType: docTypeIdx !== -1 ? col(row, docTypeIdx) : isCompanyRow ? 'NIT' : docNumber ? 'CC' : undefined,
          docNumber: docNumber || undefined,
          dv: col(row, dvIdx),
          address: col(row, addressIdx),
          city: col(row, cityIdx),
          notes: col(row, notesIdx),
          tags: col(row, tagsIdx),
          roles: col(row, rolesIdx),
          preferences: col(row, preferencesIdx),
          avatarUrl: col(row, avatarIdx),
          fiscalResponsibilities: col(row, fiscalIdx),
          parentCustomerDoc: col(row, parentDocIdx),
          status: 'pending',
        });
      }

      setFilas(salida);
      setStats({ total: salida.length, success: 0, errors: 0, pending: salida.length });
      setPaso('preview');
    } catch (error) {
      const e = error as Error;
      setMensaje({ tipo: 'error', texto: `Error al leer archivo: ${e.message}` });
    }
  };

  const importar = async () => {
    const orgId = organizationId;
    if (!orgId || filas.length === 0) return;

    setProcesando(true);
    setPaso('importing');

    const updatedRows = [...filas];
    let successCount = 0;
    let errorCount = 0;
    const publicar = () => {
      setFilas([...updatedRows]);
      setStats({ total: updatedRows.length, success: successCount, errors: errorCount, pending: updatedRows.length - successCount - errorCount });
    };

    const { data: branches } = await supabase
      .from('branches')
      .select('id, is_main')
      .eq('organization_id', orgId)
      .order('is_main', { ascending: false })
      .limit(1);
    const branchId = branches?.[0]?.id;

    // Clientes existentes por documento normalizado o correo (paginado: PostgREST corta en 1000)
    const existingByDoc = new Map<string, string>();
    const existingByEmail = new Map<string, string>();
    const normalizeDoc = (s: string) => s.replace(/\s+/g, '').trim();

    for (let offset = 0; ; offset += 1000) {
      const { data: page, error: pageError } = await supabase
        .from('customers')
        .select('id, identification_number, email')
        .eq('organization_id', orgId)
        .range(offset, offset + 999);
      if (pageError || !page || page.length === 0) break;
      for (const c of page) {
        if (c.identification_number) existingByDoc.set(normalizeDoc(c.identification_number), c.id);
        if (c.email) existingByEmail.set(c.email.toLowerCase(), c.id);
      }
      if (page.length < 1000) break;
    }

    const companyByDoc = new Map<string, string>();
    for (let offset = 0; ; offset += 1000) {
      const { data: page } = await supabase
        .from('customers')
        .select('id, identification_number')
        .eq('organization_id', orgId)
        .eq('customer_type', 'company')
        .range(offset, offset + 999);
      if (!page || page.length === 0) break;
      for (const c of page) {
        if (c.identification_number) companyByDoc.set(normalizeDoc(c.identification_number), c.id);
      }
      if (page.length < 1000) break;
    }

    for (let i = 0; i < updatedRows.length; i++) {
      const row = updatedRows[i];
      try {
        const typeLower = (row.customerType || '').toLowerCase().trim();
        const isCompany = typeLower.includes('empresa') || typeLower === 'company';
        const customerType = isCompany ? 'company' : 'person';

        const normalizedDoc = row.docNumber ? normalizeDoc(row.docNumber) : '';
        const existingId = (normalizedDoc && existingByDoc.get(normalizedDoc)) || (row.email && existingByEmail.get(row.email.toLowerCase()));

        if (existingId && modo === 'create_only') {
          updatedRows[i] = { ...row, status: 'error', error: 'Cliente ya existe (modo: solo crear)' };
          errorCount++;
          publicar();
          continue;
        }
        if (!existingId && modo === 'update_only') {
          updatedRows[i] = { ...row, status: 'error', error: 'Cliente no existe (modo: solo actualizar)' };
          errorCount++;
          publicar();
          continue;
        }

        // Marcar el documento en uso ANTES del insert (duplicados dentro del mismo archivo)
        if (normalizedDoc && !existingId) existingByDoc.set(normalizedDoc, 'pending');

        const tags = row.tags ? row.tags.split(';').map((t) => t.trim()).filter(Boolean) : [];
        const roles = row.roles ? row.roles.split(';').map((r) => r.trim()).filter(Boolean) : ['cliente', 'huesped'];
        let preferences: Record<string, unknown> = {};
        if (row.preferences) {
          try {
            preferences = JSON.parse(row.preferences) as Record<string, unknown>;
          } catch {
            preferences = {};
          }
        }
        const fiscalResp = row.fiscalResponsibilities
          ? row.fiscalResponsibilities.split(';').map((f) => f.trim()).filter(Boolean)
          : ['R-99-PN'];
        const parentCustomerId = row.parentCustomerDoc ? companyByDoc.get(normalizeDoc(row.parentCustomerDoc)) || null : null;

        // doc_type, doc_number y full_name son columnas GENERADAS: no se escriben.
        const customerData = {
          organization_id: orgId,
          branch_id: branchId || null,
          customer_type: customerType,
          first_name: isCompany ? row.companyName || '' : row.firstName || '',
          last_name: isCompany ? '' : row.lastName || '',
          company_name: isCompany ? row.companyName || null : null,
          email: row.email || null,
          phone: row.phone || null,
          identification_type: row.docType || null,
          identification_number: normalizedDoc || null,
          dv: row.dv ? parseInt(row.dv, 10) : null,
          trade_name: row.tradeName || null,
          address: row.address || null,
          city: row.city || null,
          notes: row.notes || null,
          tags,
          roles,
          preferences,
          fiscal_responsibilities: fiscalResp,
          parent_customer_id: parentCustomerId,
          avatar_url: row.avatarUrl || null,
        };

        let nuevoId: string | null = null;
        if (existingId && existingId !== 'pending') {
          // Sin documento, organización ni correo: evita choques con los únicos
          // cuando hay duplicados con espacios distintos.
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { identification_number, organization_id, email, ...updateData } = customerData;
          const { data: updated, error: updateError } = await supabase
            .from('customers')
            .update(updateData)
            .eq('id', existingId)
            .eq('organization_id', orgId)
            .select('id')
            .single();
          if (updateError) throw updateError;
          nuevoId = updated?.id ?? null;
        } else {
          const { data: inserted, error: insertError } = await supabase
            .from('customers')
            .insert([customerData])
            .select('id')
            .single();
          if (insertError) throw insertError;
          nuevoId = inserted?.id ?? null;
        }

        if (isCompany && nuevoId && normalizedDoc) companyByDoc.set(normalizedDoc, nuevoId);
        if (nuevoId) {
          if (normalizedDoc) existingByDoc.set(normalizedDoc, nuevoId);
          if (row.email) existingByEmail.set(row.email.toLowerCase(), nuevoId);
        }

        updatedRows[i] = { ...row, status: 'success' };
        successCount++;
      } catch (error) {
        const e = error as ErrorSupabase;
        const errMsg = e?.message || e?.details || e?.hint || 'Error desconocido';
        if (e?.code === '23505' || errMsg.includes('duplicate key') || errMsg.includes('unique constraint')) {
          updatedRows[i] = { ...row, status: 'error', error: 'Duplicado (constraint único violado)' };
        } else {
          updatedRows[i] = { ...row, status: 'error', error: errMsg };
        }
        errorCount++;
      }
      publicar();
    }

    setProcesando(false);
    setPaso('complete');
    onImportado();
  };

  const cerrar = (v: boolean) => {
    if (procesando) return;
    onAbiertoChange(v);
    if (!v) reiniciar();
  };

  return (
    <Dialog open={abierto} onOpenChange={cerrar}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-line bg-surface text-fg sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-fg">
            <Upload aria-hidden="true" className="size-5 text-brand" strokeWidth={1.5} />
            Importar clientes
          </DialogTitle>
          <DialogDescription className="text-fg-secondary">
            {paso === 'upload' && 'Selecciona un archivo CSV o Excel para importar clientes'}
            {paso === 'preview' && 'Revisa los datos antes de importar'}
            {paso === 'importing' && 'Importando clientes…'}
            {paso === 'complete' && 'Importación completada'}
          </DialogDescription>
        </DialogHeader>

        {paso === 'upload' && (
          <div className="flex flex-col gap-4">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="rounded-xl border-2 border-dashed border-line-strong p-8 text-center transition-colors hover:border-line-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <FileSpreadsheet aria-hidden="true" className="mx-auto mb-4 size-12 text-fg-muted" strokeWidth={1.5} />
              <p className="mb-2 text-base font-medium text-fg">
                {archivo ? archivo.name : 'Arrastra un archivo aquí o haz clic para seleccionar'}
              </p>
              <p className="text-sm text-fg-secondary">Formatos soportados: CSV, XLS, XLSX</p>
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xls,.xlsx"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setArchivo(file);
                void leerArchivo(file);
              }}
            />

            <div className="rounded-xl bg-brand-tint p-4">
              <h4 className="mb-2 text-sm font-medium text-brand-deep">Columnas soportadas</h4>
              <ul className="grid gap-1 text-[13px] text-brand-deep sm:grid-cols-2">
                {COLUMNAS_SOPORTADAS.map(([c, d]) => (
                  <li key={c}>
                    <strong>{c}</strong>: {d}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" onClick={descargarPlantillaClientes}>
                <Download aria-hidden="true" className="mr-2 size-4" />
                Descargar plantilla
              </Button>
              <Button variant="outline" onClick={() => cerrar(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {paso !== 'upload' && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ['Total', stats.total, 'text-fg'],
                ['OK', stats.success, 'text-success-text'],
                ['Errores', stats.errors, 'text-danger-text'],
                ['Pendientes', stats.pending, 'text-warning-text'],
              ].map(([etiqueta, valor, color]) => (
                <div key={etiqueta as string} className="rounded-lg border border-line p-3 text-center">
                  <div className={`text-xl font-semibold tabular-nums ${color as string}`}>{valor as number}</div>
                  <p className="text-xs text-fg-secondary">{etiqueta as string}</p>
                </div>
              ))}
            </div>

            {paso === 'preview' && (
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-fg">Modo de importación</span>
                <SegmentedControl<ModoImportacion>
                  etiqueta="Modo de importación"
                  valor={modo}
                  onValorChange={setModo}
                  anchoCompleto
                  opciones={[
                    { valor: 'create_and_update', etiqueta: 'Crear y actualizar' },
                    { valor: 'create_only', etiqueta: 'Solo crear nuevos' },
                    { valor: 'update_only', etiqueta: 'Solo actualizar' },
                  ]}
                />
              </div>
            )}
            <p className="text-xs text-fg-secondary">
              {modo === 'create_and_update' && 'Los clientes nuevos se crearán y los existentes se actualizarán.'}
              {modo === 'create_only' && 'Solo se crearán clientes con documento nuevo. Los existentes se omitirán.'}
              {modo === 'update_only' && 'Solo se actualizarán clientes que ya existan. Los nuevos se omitirán.'}
            </p>

            <div className="max-h-[300px] overflow-auto rounded-lg border border-line">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-subtle text-left text-xs text-fg-secondary">
                  <tr>
                    {['#', 'Tipo', 'Nombre', 'Doc', 'Email', 'Tel', 'Estado'].map((h) => (
                      <th key={h} scope="col" className="px-2 py-2 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filas.slice(0, 100).map((row) => (
                    <tr key={row.row} className="border-t border-line">
                      <td className="px-2 py-1.5 text-fg-muted">{row.row}</td>
                      <td className="px-2 py-1.5">{row.customerType || (row.companyName ? 'Empresa' : 'Persona')}</td>
                      <td className="break-words px-2 py-1.5">
                        {row.companyName || `${row.firstName || ''} ${row.lastName || ''}`.trim() || row.fullName || '-'}
                      </td>
                      <td className="px-2 py-1.5 text-fg-secondary">{row.docNumber || '-'}</td>
                      <td className="break-words px-2 py-1.5 text-fg-secondary">{row.email || '-'}</td>
                      <td className="px-2 py-1.5 text-fg-secondary">{row.phone || '-'}</td>
                      <td className="px-2 py-1.5" title={row.error}>
                        <StatusBadge
                          estado={row.status === 'pending' ? 'Pendiente' : row.status === 'success' ? 'Completado' : 'Error'}
                          etiqueta={row.status === 'pending' ? 'Pendiente' : row.status === 'success' ? 'OK' : 'Error'}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filas.length > 100 && (
              <p className="text-center text-sm text-fg-secondary">Mostrando 100 de {filas.length} filas</p>
            )}

            <div className="flex items-center justify-between">
              {paso === 'preview' && (
                <>
                  <Button variant="outline" onClick={reiniciar}>
                    <X aria-hidden="true" className="mr-2 size-4" />
                    Cancelar
                  </Button>
                  <Button onClick={() => void importar()} disabled={procesando}>
                    <Upload aria-hidden="true" className="mr-2 size-4" />
                    Importar {stats.total} clientes
                  </Button>
                </>
              )}
              {paso === 'importing' && (
                <p className="flex items-center gap-2 text-sm text-fg-secondary" role="status">
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" /> Importando…
                </p>
              )}
              {paso === 'complete' && (
                <>
                  <Button variant="outline" onClick={() => cerrar(false)}>
                    Cerrar
                  </Button>
                  <Button variant="outline" onClick={reiniciar}>
                    <Upload aria-hidden="true" className="mr-2 size-4" />
                    Importar otro archivo
                  </Button>
                </>
              )}
            </div>
          </div>
        )}

        {mensaje && (
          <p
            role={mensaje.tipo === 'error' ? 'alert' : 'status'}
            className={`flex items-center gap-2 rounded-lg p-3 text-sm ${
              mensaje.tipo === 'success'
                ? 'bg-success-subtle text-success-text'
                : mensaje.tipo === 'error'
                  ? 'bg-danger-subtle text-danger-text'
                  : 'bg-brand-tint text-brand-deep'
            }`}
          >
            {mensaje.tipo === 'success' ? (
              <CheckCircle aria-hidden="true" className="size-4" />
            ) : mensaje.tipo === 'error' ? (
              <AlertCircle aria-hidden="true" className="size-4" />
            ) : (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            )}
            {mensaje.texto}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
