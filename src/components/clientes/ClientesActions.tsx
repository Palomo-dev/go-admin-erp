import React, { useState, useRef } from 'react';
import { 
  Download, Tag, Users, Plus, Upload, FileSpreadsheet,
  Loader2, CheckCircle, AlertCircle, X
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from '@/lib/supabase/config';
import { useOrganization } from '@/lib/hooks/useOrganization';
import * as XLSX from 'xlsx';

interface ClientesActionsProps {
  onExportCSV: () => void;
  selectedCustomers: string[];
  onRefresh?: () => void;
}

interface ImportClientRow {
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

const ClientesActions: React.FC<ClientesActionsProps> = ({
  onExportCSV,
  selectedCustomers,
  onRefresh
}) => {
  const [isTagDialogOpen, setIsTagDialogOpen] = useState(false);
  const [isMergeDialogOpen, setIsMergeDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [tagName, setTagName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Estados de importación
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ImportClientRow[]>([]);
  const [importStep, setImportStep] = useState<'upload' | 'preview' | 'importing' | 'complete'>('upload');
  const [importStats, setImportStats] = useState({ total: 0, success: 0, errors: 0, pending: 0 });
  const [importMode, setImportMode] = useState<'create_only' | 'update_only' | 'create_and_update'>('create_and_update');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const organizationData = useOrganization();

  // Función para aplicar etiqueta a clientes seleccionados
  const handleApplyTag = async () => {
    if (!tagName.trim() || !selectedCustomers.length) {
      setStatusMessage({ type: 'error', message: 'Ingresa una etiqueta y selecciona al menos un cliente' });
      return;
    }

    setIsProcessing(true);
    setStatusMessage({ type: 'info', message: 'Aplicando etiqueta...' });

    try {
      for (const customerId of selectedCustomers) {
        // Primero obtenemos el cliente y sus etiquetas actuales
        const { data: customerData, error: customerError } = await supabase
          .from('customers')
          .select('tags')
          .eq('id', customerId)
          .single();

        if (customerError) throw customerError;

        // Añadimos la nueva etiqueta si no existe
        const currentTags = customerData.tags || [];
        if (!currentTags.includes(tagName)) {
          const updatedTags = [...currentTags, tagName];

          const { error: updateError } = await supabase
            .from('customers')
            .update({ tags: updatedTags })
            .eq('id', customerId);

          if (updateError) throw updateError;
        }
      }

      setStatusMessage({ type: 'success', message: `Etiqueta "${tagName}" aplicada a ${selectedCustomers.length} clientes` });
      
      // Cerrar el diálogo después de 2 segundos
      setTimeout(() => {
        setIsTagDialogOpen(false);
        setTagName('');
        setStatusMessage(null);
        onRefresh?.();
      }, 2000);
    } catch (error: any) {
      console.error('Error al aplicar etiqueta:', error);
      setStatusMessage({ type: 'error', message: `Error: ${error.message}` });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleNewCustomerClick = () => {
    window.location.href = '/app/clientes/nuevo';
  };

  const downloadClientTemplate = () => {
    const headers = 'Tipo de Cliente,Nombre,Apellido,Razón Social,Nombre Comercial,Nombre Completo,Email,Teléfono,Tipo Documento,Número Documento,DV,Dirección,Ciudad,Notas,Etiquetas,Roles,Preferencias,URL Avatar,Responsabilidades Fiscales,Documento Empresa Padre';

    const example1 = 'Persona,Juan,Pérez,,,Juan Pérez,juan@email.com,3001234567,Cédula,123456789,,Calle 123 #45-67,Bogotá,Cliente VIP,cliente;huesped,,,https://ejemplo.com/avatar.jpg,R-99-PN,';
    const example2 = 'Empresa,,,Mi Empresa SA,Empresa Comercial,Mi Empresa SA,empresa@email.com,3109876543,NIT,900123456,8,Av. Principal 100,Medellín,Cliente corporativo,cliente,"{""credit_limit"":1000000}",,https://ejemplo.com/logo.png,R-99-PN,';
    const example3 = 'Persona,María,Gómez,,,María Gómez,maria@email.com,3152345678,Cédula,987654321,,Carrera 50 #20-30,Cali,,,cliente;huesped,,,,R-99-PN,900123456';

    const csvContent = `${headers}\n${example1}\n${example2}\n${example3}`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'plantilla_clientes.csv';
    link.click();
  };

  const parseClientFile = async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawData: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

      let headerRow = -1;
      for (let i = 0; i < Math.min(10, rawData.length); i++) {
        const row = rawData[i];
        if (row && row.some(cell => {
          const v = String(cell || '').toLowerCase().trim();
          return v === 'nit' || v.includes('razon social') || v.includes('razón social') ||
            v === 'email' || v === 'correo' || v === 'nombre1' || v === 'nombre 1' ||
            v.includes('tipo de cliente') || v.includes('customer type') || v === 'nombre' || v === 'name';
        })) {
          headerRow = i;
          break;
        }
      }

      if (headerRow === -1) {
        headerRow = 0;
      }

      const headers = rawData[headerRow].map((h: any) => String(h || '').toLowerCase().trim());

      // Detectar columnas con múltiples nombres posibles (plantilla + archivo real Siigo/Alegra)
      const typeIdx = headers.findIndex(h => h.includes('tipo de cliente') || h.includes('customer type') || h === 'tipo');
      const firstNameIdx = headers.findIndex(h => h === 'nombre' || h === 'first name' || h === 'first_name' || h === 'nombre1' || h === 'nombre 1' || h.includes('nombre '));
      const lastNameIdx = headers.findIndex(h => h === 'apellido' || h === 'last name' || h === 'last_name' || h === 'apellido1' || h === 'apellido 1' || h.includes('apellido'));
      const companyIdx = headers.findIndex(h => h.includes('razón social') || h.includes('razon social') || h.includes('company name') || h.includes('company_name'));
      const tradeIdx = headers.findIndex(h => h.includes('nombre comercial') || h.includes('trade name') || h.includes('trade_name'));
      const fullNameIdx = headers.findIndex(h => h.includes('nombre completo') || h.includes('full name') || h.includes('full_name'));
      const emailIdx = headers.findIndex(h => h === 'email' || h === 'correo' || h.includes('correo electrónico') || h.includes('correo electronico'));
      const phoneIdx = headers.findIndex(h => h === 'teléfono' || h === 'telefono' || h === 'phone' || h === 'tel' || h === 'telefono' || h.includes('tel'));
      const celularIdx = headers.findIndex(h => h === 'celular' || h === 'cel' || h === 'móvil' || h === 'movil' || h === 'mobile');
      const docTypeIdx = headers.findIndex(h => h.includes('tipo documento') || h.includes('doc type') || h.includes('doc_type') || h.includes('tipo doc'));
      const docNumberIdx = headers.findIndex(h => h === 'nit' || h.includes('número documento') || h.includes('numero documento') || h.includes('doc number') || h.includes('doc_number') || h.includes('identificación') || h.includes('identificacion') || h.includes('número identificación') || h.includes('numero identificacion'));
      const dvIdx = headers.findIndex(h => h === 'dv' || h === 'dig. ver.' || h === 'dig ver' || h.includes('dígito verificación') || h.includes('digito verificacion') || h.includes('digito ver'));
      const addressIdx = headers.findIndex(h => h === 'dirección' || h === 'direccion' || h === 'address' || h.includes('direc'));
      const cityIdx = headers.findIndex(h => h === 'ciudad' || h === 'city' || h.includes('ciudad') || h.includes('id ciudad'));
      const notesIdx = headers.findIndex(h => h === 'notas' || h === 'notes' || h.includes('nota') || h === 'contacto');
      const tagsIdx = headers.findIndex(h => h === 'etiquetas' || h === 'tags' || h.includes('etiqueta') || h === 'grupo');
      const rolesIdx = headers.findIndex(h => h === 'roles' || h === 'rol' || h.includes('role'));
      const preferencesIdx = headers.findIndex(h => h === 'preferencias' || h === 'preferences' || h.includes('preferencia'));
      const avatarIdx = headers.findIndex(h => h.includes('url avatar') || h.includes('avatar') || h.includes('foto'));
      const fiscalIdx = headers.findIndex(h => h.includes('responsabilidades fiscales') || h.includes('fiscal') || h.includes('fiscal_responsibilities'));
      const parentDocIdx = headers.findIndex(h => h.includes('documento empresa padre') || h.includes('parent') || h.includes('empresa padre'));

      const rows: ImportClientRow[] = [];
      for (let i = headerRow + 1; i < rawData.length; i++) {
        const row = rawData[i];
        if (!row || row.every(c => !c && c !== 0)) continue;

        const firstName = firstNameIdx !== -1 ? String(row[firstNameIdx] || '').trim() : undefined;
        const lastName = lastNameIdx !== -1 ? String(row[lastNameIdx] || '').trim() : undefined;
        const companyName = companyIdx !== -1 ? String(row[companyIdx] || '').trim() : undefined;
        const docNumber = docNumberIdx !== -1 ? String(row[docNumberIdx] || '').trim() : undefined;
        const email = emailIdx !== -1 ? String(row[emailIdx] || '').trim() : undefined;

        // Skip rows that have no useful data at all
        if (!firstName && !companyName && !docNumber && !email) continue;
        // Skip rows where the only value is "-" or empty placeholder
        if (docNumber === '-' && !firstName && !companyName && !email) continue;

        // Determinar teléfono: usar celular si no hay telefono, o viceversa
        const phone = phoneIdx !== -1 ? String(row[phoneIdx] || '').trim() : '';
        const celular = celularIdx !== -1 ? String(row[celularIdx] || '').trim() : '';
        const finalPhone = phone || celular || undefined;

        // Determinar tipo de cliente basado en columna Tipo
        // RS = Régimen Simplificado (persona natural), PJ = Persona Jurídica (empresa),
        // GN = Gran Contribuyente (empresa), CC/CE = persona
        const typeValue = typeIdx !== -1 ? String(row[typeIdx] || '').trim().toUpperCase() : '';
        const isCompanyByType = typeValue === 'PJ' || typeValue === 'GN' || typeValue.includes('EMPRESA') || typeValue === 'COMPANY';
        const isPersonByType = typeValue === 'RS' || typeValue === 'CC' || typeValue === 'CE' || typeValue === 'TI' || typeValue.includes('PERSONA');
        
        // Es empresa solo si el tipo lo indica explícitamente, o si hay Razon Social sin Nombre1 Y sin indicador de persona
        const isCompanyRow = isCompanyByType || (!isPersonByType && companyName && !firstName && !lastName);

        // Si es persona pero no hay Nombre1, dividir Razon Social en nombres
        let finalFirstName = firstName || undefined;
        let finalLastName = lastName || undefined;
        let finalCompanyName = companyName || undefined;
        
        if (!isCompanyRow && companyName && !firstName && !lastName) {
          // Dividir "Bibiana patricia rojas" → first_name: "Bibiana Patricia", last_name: "Rojas"
          const parts = companyName.trim().split(/\s+/);
          if (parts.length >= 2) {
            finalFirstName = parts.slice(0, -1).join(' ');
            finalLastName = parts[parts.length - 1];
          } else {
            finalFirstName = companyName.trim();
          }
          finalCompanyName = undefined; // No es empresa, no guardar como company_name
        }

        rows.push({
          row: i + 1,
          customerType: isCompanyRow ? 'Empresa' : 'Persona',
          firstName: finalFirstName,
          lastName: finalLastName,
          companyName: isCompanyRow ? finalCompanyName : undefined,
          tradeName: tradeIdx !== -1 ? String(row[tradeIdx] || '').trim() : undefined,
          fullName: fullNameIdx !== -1 ? String(row[fullNameIdx] || '').trim() : undefined,
          email: email || undefined,
          phone: finalPhone,
          docType: docTypeIdx !== -1 ? String(row[docTypeIdx] || '').trim() : (isCompanyRow ? 'NIT' : (docNumber ? 'CC' : undefined)),
          docNumber: docNumber || undefined,
          dv: dvIdx !== -1 ? String(row[dvIdx] || '').trim() : undefined,
          address: addressIdx !== -1 ? String(row[addressIdx] || '').trim() : undefined,
          city: cityIdx !== -1 ? String(row[cityIdx] || '').trim() : undefined,
          notes: notesIdx !== -1 ? String(row[notesIdx] || '').trim() : undefined,
          tags: tagsIdx !== -1 ? String(row[tagsIdx] || '').trim() : undefined,
          roles: rolesIdx !== -1 ? String(row[rolesIdx] || '').trim() : undefined,
          preferences: preferencesIdx !== -1 ? String(row[preferencesIdx] || '').trim() : undefined,
          avatarUrl: avatarIdx !== -1 ? String(row[avatarIdx] || '').trim() : undefined,
          fiscalResponsibilities: fiscalIdx !== -1 ? String(row[fiscalIdx] || '').trim() : undefined,
          parentCustomerDoc: parentDocIdx !== -1 ? String(row[parentDocIdx] || '').trim() : undefined,
          status: 'pending',
        });
      }

      setImportPreview(rows);
      setImportStats({ total: rows.length, success: 0, errors: 0, pending: rows.length });
      setImportStep('preview');
    } catch (error: any) {
      console.error('Error parsing file:', error);
      setStatusMessage({ type: 'error', message: `Error al leer archivo: ${error.message}` });
    }
  };

  const handleImportClients = async () => {
    const orgId = organizationData.organization?.id;
    if (!orgId || importPreview.length === 0) return;

    setIsProcessing(true);
    setImportStep('importing');

    const updatedRows = [...importPreview];
    let successCount = 0;
    let errorCount = 0;

    // Obtener branch principal
    const { data: branches } = await supabase
      .from('branches')
      .select('id, is_main')
      .eq('organization_id', orgId)
      .order('is_main', { ascending: false })
      .limit(1);

    const branchId = branches?.[0]?.id;

    // Obtener clientes existentes por identification_number o email
    // Usar paginación para traer todos (Supabase limita a ~1000 por defecto)
    const existingByDoc = new Map<string, string>();
    const existingByEmail = new Map<string, string>();
    const normalizeDoc = (s: string) => s.replace(/\s+/g, '').trim();
    
    let offset = 0;
    while (true) {
      const { data: page, error: pageError } = await supabase
        .from('customers')
        .select('id, identification_number, email')
        .eq('organization_id', orgId)
        .range(offset, offset + 999);
      if (pageError) {
        console.error('Error cargando clientes existentes:', pageError);
        break;
      }
      if (!page || page.length === 0) break;
      for (const c of page) {
        if (c.identification_number) existingByDoc.set(normalizeDoc(c.identification_number), c.id);
        if (c.email) existingByEmail.set(c.email.toLowerCase(), c.id);
      }
      if (page.length < 1000) break;
      offset += 1000;
    }
    console.log(`Import: ${existingByDoc.size} clientes existentes cargados en mapa de duplicados`);

    // Mapear empresas padre por identification_number (paginado)
    const companyByDoc = new Map<string, string>();
    offset = 0;
    while (true) {
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
      offset += 1000;
    }

    for (let i = 0; i < updatedRows.length; i++) {
      const row = updatedRows[i];

      try {
        // Determinar tipo de cliente
        const typeLower = (row.customerType || '').toLowerCase().trim();
        const isCompany = typeLower.includes('empresa') || typeLower === 'company';
        const customerType = isCompany ? 'company' : 'person';

        // Verificar duplicado (normalizar docNumber: quitar espacios internos)
        const normalizedDoc = row.docNumber ? row.docNumber.replace(/\s+/g, '').trim() : '';
        const existingId = (normalizedDoc && existingByDoc.get(normalizedDoc)) ||
          (row.email && existingByEmail.get(row.email.toLowerCase()));

        // Aplicar modo de importación
        if (existingId && importMode === 'create_only') {
          updatedRows[i] = { ...row, status: 'error', error: 'Cliente ya existe (modo: solo crear)' };
          errorCount++;
          setImportPreview([...updatedRows]);
          setImportStats({ total: updatedRows.length, success: successCount, errors: errorCount, pending: updatedRows.length - successCount - errorCount });
          continue;
        }

        if (!existingId && importMode === 'update_only') {
          updatedRows[i] = { ...row, status: 'error', error: 'Cliente no existe (modo: solo actualizar)' };
          errorCount++;
          setImportPreview([...updatedRows]);
          setImportStats({ total: updatedRows.length, success: successCount, errors: errorCount, pending: updatedRows.length - successCount - errorCount });
          continue;
        }

        // Marcar este doc como en uso ANTES del insert para evitar duplicados dentro del mismo archivo
        if (normalizedDoc && !existingId) existingByDoc.set(normalizedDoc, 'pending');

        // Parsear tags
        const tags = row.tags ? row.tags.split(';').map(t => t.trim()).filter(Boolean) : [];

        // Parsear roles
        const roles = row.roles ? row.roles.split(';').map(r => r.trim()).filter(Boolean) : ['cliente', 'huesped'];

        // Parsear preferencias (JSON)
        let preferences: Record<string, any> = {};
        if (row.preferences) {
          try {
            preferences = JSON.parse(row.preferences);
          } catch {
            preferences = {};
          }
        }

        // Parsear responsabilidades fiscales
        const fiscalResp = row.fiscalResponsibilities
          ? row.fiscalResponsibilities.split(';').map(f => f.trim()).filter(Boolean)
          : ['R-99-PN'];

        // Buscar empresa padre
        let parentCustomerId: string | null = null;
        if (row.parentCustomerDoc) {
          parentCustomerId = companyByDoc.get(row.parentCustomerDoc.replace(/\s+/g, '').trim()) || null;
        }

        // Construir datos del cliente
        // doc_type, doc_number y full_name son columnas GENERADAS (no se pueden insertar)
        // doc_type = identification_type, doc_number = identification_number
        // full_name = CASE según customer_type
        const customerData: any = {
          organization_id: orgId,
          branch_id: branchId || null,
          customer_type: customerType,
          first_name: isCompany ? (row.companyName || '') : (row.firstName || ''),
          last_name: isCompany ? '' : (row.lastName || ''),
          company_name: isCompany ? (row.companyName || null) : null,
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

        let newCustomer: any = null;

        if (existingId && existingId !== 'pending') {
          // Actualizar cliente existente
          // Excluir identification_number, organization_id y email del update para evitar
          // conflictos con constraints únicos cuando hay duplicados con espacios distintos
          const { identification_number, organization_id, email, ...updateData } = customerData;
          const { data: updated, error: updateError } = await supabase
            .from('customers')
            .update(updateData)
            .eq('id', existingId)
            .select()
            .single();
          if (updateError) throw updateError;
          newCustomer = updated;
        } else {
          // Insertar nuevo cliente
          const { data: inserted, error: insertError } = await supabase
            .from('customers')
            .insert([customerData])
            .select()
            .single();
          if (insertError) throw insertError;
          newCustomer = inserted;
        }

        // Si es empresa, añadir al mapa de empresas padre
        if (isCompany && newCustomer && normalizedDoc) {
          companyByDoc.set(normalizedDoc, newCustomer.id);
        }

        // Registrar en el mapa de existentes
        if (newCustomer) {
          if (normalizedDoc) existingByDoc.set(normalizedDoc, newCustomer.id);
          if (row.email) existingByEmail.set(row.email.toLowerCase(), newCustomer.id);
        }

        updatedRows[i] = { ...row, status: 'success' };
        successCount++;
      } catch (error: any) {
        const errMsg = error?.message || error?.details || error?.hint || 'Error desconocido';
        console.error(`Error importando fila ${row.row} doc=${row.docNumber}:`, { code: error?.code, message: errMsg });
        // Error 409 o 23505 = duplicado por constraint único
        if (error?.code === '23505' || errMsg.includes('duplicate key') || errMsg.includes('unique constraint')) {
          updatedRows[i] = { ...row, status: 'error', error: 'Duplicado (constraint único violado)' };
        } else {
          updatedRows[i] = { ...row, status: 'error', error: errMsg };
        }
        errorCount++;
      }

      setImportPreview([...updatedRows]);
      setImportStats({ total: updatedRows.length, success: successCount, errors: errorCount, pending: updatedRows.length - successCount - errorCount });
    }

    setIsProcessing(false);
    setImportStep('complete');
    onRefresh?.();
  };

  const resetImport = () => {
    setImportFile(null);
    setImportPreview([]);
    setImportStep('upload');
    setImportStats({ total: 0, success: 0, errors: 0, pending: 0 });
    setStatusMessage(null);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file);
    parseClientFile(file);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <TooltipProvider>
        {/* Nuevo cliente */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="default"
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white min-h-[40px] text-sm"
              onClick={() => window.location.href = '/app/clientes/new'}
            >
              <Plus className="w-4 h-4 mr-1.5" />
              <span>Nuevo cliente</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Crear un nuevo cliente</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={!selectedCustomers.length}
              onClick={() => setIsTagDialogOpen(true)}
              className="text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 active:bg-gray-100 dark:active:bg-gray-600 min-h-[40px] text-sm"
            >
              <Tag className="w-4 h-4 mr-1.5" />
              <span>Etiquetar</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Aplicar etiquetas a clientes seleccionados</TooltipContent>
        </Tooltip>
        
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={!selectedCustomers.length}
              onClick={() => setIsMergeDialogOpen(true)}
              className="text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 active:bg-gray-100 dark:active:bg-gray-600 min-h-[40px] text-sm"
            >
              <Users className="w-4 h-4 mr-1.5" />
              <span>Unificar</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Unificar clientes duplicados</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={onExportCSV}
              className="text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 active:bg-gray-100 dark:active:bg-gray-600 min-h-[40px] text-sm"
            >
              <Download className="w-4 h-4 mr-1.5" />
              <span>Exportar</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Exportar a CSV</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { resetImport(); setIsImportDialogOpen(true); }}
              className="text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 active:bg-gray-100 dark:active:bg-gray-600 min-h-[40px] text-sm"
            >
              <Upload className="w-4 h-4 mr-1.5" />
              <span>Importar</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Importar clientes desde CSV/Excel</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Dialog open={isTagDialogOpen} onOpenChange={setIsTagDialogOpen}>
        <DialogContent className="sm:max-w-[425px] mx-4">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-gray-100">Etiquetar clientes</DialogTitle>
            <DialogDescription className="text-gray-600 dark:text-gray-400">
              Aplica una etiqueta a los {selectedCustomers.length} clientes seleccionados.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="tag" className="text-gray-900 dark:text-gray-100">Etiqueta</Label>
              <Input 
                id="tag" 
                value={tagName} 
                onChange={(e) => setTagName(e.target.value)} 
                placeholder="Nombre de etiqueta" 
                disabled={isProcessing}
                className="min-h-[44px] bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
              />
            </div>
          </div>
          
          {statusMessage && (
            <div className={`
              flex items-center p-3 rounded-md text-sm
              ${statusMessage.type === 'success' ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 
                statusMessage.type === 'error' ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'}
            `}>
              {statusMessage.type === 'success' ? (
                <CheckCircle className="h-4 w-4 mr-2" />
              ) : statusMessage.type === 'error' ? (
                <AlertCircle className="h-4 w-4 mr-2" />
              ) : (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {statusMessage.message}
            </div>
          )}
          
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button 
              variant="outline" 
              onClick={() => setIsTagDialogOpen(false)}
              disabled={isProcessing}
              className="w-full sm:w-auto min-h-[44px] border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancelar
            </Button>
            <Button 
              onClick={handleApplyTag}
              disabled={!tagName.trim() || isProcessing}
              className="w-full sm:w-auto min-h-[44px] bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Procesando...
                </>
              ) : 'Aplicar etiqueta'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fusionar duplicados */}
      <Dialog open={isMergeDialogOpen} onOpenChange={setIsMergeDialogOpen}>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                disabled={selectedCustomers.length < 2}
                onClick={() => setIsMergeDialogOpen(true)}
              >
                <Users className="h-4 w-4" />
                <span className="sr-only">Fusionar duplicados</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Fusionar duplicados</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <DialogContent className="sm:max-w-[500px] mx-4">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-gray-100">Fusionar clientes duplicados</DialogTitle>
            <DialogDescription className="text-gray-600 dark:text-gray-400">
              Fusiona {selectedCustomers.length} clientes seleccionados. Selecciona el cliente principal que conservará toda la información.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 mb-4">
              Funcionalidad de fusión de clientes en desarrollo. Esta función permitirá combinar
              datos de clientes duplicados preservando el historial de transacciones.
            </p>

            <div className="p-3 bg-yellow-50 dark:bg-yellow-900/30 rounded-md text-xs sm:text-sm text-yellow-700 dark:text-yellow-300 flex items-start">
              <AlertCircle className="h-4 w-4 mr-2 flex-shrink-0 mt-0.5" />
              <span>La fusión de clientes es una operación que no se puede deshacer</span>
            </div>
          </div>
          
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button 
              variant="outline" 
              onClick={() => setIsMergeDialogOpen(false)}
              className="w-full sm:w-auto min-h-[44px] border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancelar
            </Button>
            <Button 
              disabled
              className="w-full sm:w-auto min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white opacity-50 cursor-not-allowed"
            >
              Fusionar clientes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de Importación */}
      <Dialog open={isImportDialogOpen} onOpenChange={(open) => { if (!isProcessing) { setIsImportDialogOpen(open); if (!open) resetImport(); } }}>
        <DialogContent className="sm:max-w-[700px] mx-4 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Upload className="h-5 w-5 text-blue-600" />
              Importar Clientes
            </DialogTitle>
            <DialogDescription className="text-gray-600 dark:text-gray-400">
              {importStep === 'upload' && 'Selecciona un archivo CSV o Excel para importar clientes'}
              {importStep === 'preview' && 'Revisa los datos antes de importar'}
              {importStep === 'importing' && 'Importando clientes...'}
              {importStep === 'complete' && 'Importación completada'}
            </DialogDescription>
          </DialogHeader>

          {/* Step: Upload */}
          {importStep === 'upload' && (
            <div className="space-y-4">
              <div
                className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center hover:border-blue-500 dark:hover:border-blue-400 transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileSpreadsheet className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <p className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {importFile ? importFile.name : 'Arrastra un archivo aquí o haz clic para seleccionar'}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Formatos soportados: CSV, XLS, XLSX
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xls,.xlsx"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>

              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <h4 className="font-medium text-blue-800 dark:text-blue-300 mb-2">Columnas soportadas:</h4>
                <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-1">
                  <li>• <strong>Tipo de Cliente</strong> - Persona o Empresa</li>
                  <li>• <strong>Nombre</strong> - Nombre (para personas)</li>
                  <li>• <strong>Apellido</strong> - Apellido (para personas)</li>
                  <li>• <strong>Razón Social</strong> - Nombre de la empresa (para empresas)</li>
                  <li>• <strong>Nombre Comercial</strong> - Nombre comercial</li>
                  <li>• <strong>Email</strong> - Correo electrónico</li>
                  <li>• <strong>Teléfono</strong> - Número de teléfono</li>
                  <li>• <strong>Tipo Documento</strong> - Cédula, NIT, Pasaporte, etc.</li>
                  <li>• <strong>Número Documento</strong> - Número de identificación</li>
                  <li>• <strong>DV</strong> - Dígito de verificación (para NIT)</li>
                  <li>• <strong>Dirección</strong> - Dirección física</li>
                  <li>• <strong>Ciudad</strong> - Ciudad</li>
                  <li>• <strong>Notas</strong> - Notas internas</li>
                  <li>• <strong>Etiquetas</strong> - Separadas por punto y coma (;)</li>
                  <li>• <strong>Roles</strong> - Separados por punto y coma (;)</li>
                  <li>• <strong>Preferencias</strong> - JSON con preferencias</li>
                  <li>• <strong>Responsabilidades Fiscales</strong> - Separadas por (;)</li>
                  <li>• <strong>Documento Empresa Padre</strong> - NIT de empresa vinculada</li>
                </ul>
              </div>

              <div className="flex justify-between items-center">
                <Button variant="outline" size="sm" onClick={downloadClientTemplate}>
                  <Download className="h-4 w-4 mr-2" />
                  Descargar Plantilla
                </Button>
                <Button variant="outline" onClick={() => setIsImportDialogOpen(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          {/* Step: Preview / Importing / Complete */}
          {(importStep === 'preview' || importStep === 'importing' || importStep === 'complete') && (
            <div className="space-y-4">
              {/* Stats */}
              <div className="grid grid-cols-4 gap-3">
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-center">
                  <div className="text-xl font-bold text-gray-900 dark:text-white">{importStats.total}</div>
                  <p className="text-xs text-gray-500">Total</p>
                </div>
                <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg text-center">
                  <div className="text-xl font-bold text-green-600">{importStats.success}</div>
                  <p className="text-xs text-gray-500">OK</p>
                </div>
                <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-center">
                  <div className="text-xl font-bold text-red-600">{importStats.errors}</div>
                  <p className="text-xs text-gray-500">Errores</p>
                </div>
                <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg text-center">
                  <div className="text-xl font-bold text-yellow-600">{importStats.pending}</div>
                  <p className="text-xs text-gray-500">Pendientes</p>
                </div>
              </div>

              {/* Modo de importación */}
              {importStep === 'preview' && (
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-medium text-gray-900 dark:text-white">Modo de importación:</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setImportMode('create_and_update')}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                        importMode === 'create_and_update'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      Crear y actualizar
                    </button>
                    <button
                      onClick={() => setImportMode('create_only')}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                        importMode === 'create_only'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      Solo crear nuevos
                    </button>
                    <button
                      onClick={() => setImportMode('update_only')}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                        importMode === 'update_only'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      Solo actualizar existentes
                    </button>
                  </div>
                </div>
              )}
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {importMode === 'create_and_update' && 'Los clientes nuevos se crearán y los existentes se actualizarán.'}
                {importMode === 'create_only' && 'Solo se crearán clientes con documento nuevo. Los existentes se omitirán.'}
                {importMode === 'update_only' && 'Solo se actualizarán clientes que ya existan. Los nuevos se omitirán.'}
              </p>

              {/* Tabla preview */}
              <div className="max-h-[300px] overflow-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                    <tr>
                      <th className="px-2 py-2 text-left text-gray-600 dark:text-gray-300">#</th>
                      <th className="px-2 py-2 text-left text-gray-600 dark:text-gray-300">Tipo</th>
                      <th className="px-2 py-2 text-left text-gray-600 dark:text-gray-300">Nombre</th>
                      <th className="px-2 py-2 text-left text-gray-600 dark:text-gray-300">Doc</th>
                      <th className="px-2 py-2 text-left text-gray-600 dark:text-gray-300">Email</th>
                      <th className="px-2 py-2 text-left text-gray-600 dark:text-gray-300">Tel</th>
                      <th className="px-2 py-2 text-left text-gray-600 dark:text-gray-300">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.slice(0, 100).map((row, idx) => (
                      <tr key={idx} className="border-t border-gray-200 dark:border-gray-700">
                        <td className="px-2 py-1.5 text-gray-500">{row.row}</td>
                        <td className="px-2 py-1.5">{row.customerType || (row.companyName ? 'Empresa' : 'Persona')}</td>
                        <td className="px-2 py-1.5 max-w-[150px] truncate" title={row.companyName || `${row.firstName || ''} ${row.lastName || ''}`}>
                          {row.companyName || `${row.firstName || ''} ${row.lastName || ''}`.trim() || row.fullName || '-'}
                        </td>
                        <td className="px-2 py-1.5 text-gray-500">{row.docNumber || '-'}</td>
                        <td className="px-2 py-1.5 text-gray-500 max-w-[120px] truncate" title={row.email || ''}>{row.email || '-'}</td>
                        <td className="px-2 py-1.5 text-gray-500">{row.phone || '-'}</td>
                        <td className="px-2 py-1.5">
                          {row.status === 'pending' && <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 rounded">Pendiente</span>}
                          {row.status === 'success' && <span className="text-xs px-2 py-0.5 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 rounded">OK</span>}
                          {row.status === 'error' && <span className="text-xs px-2 py-0.5 bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 rounded" title={row.error}>Error</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {importPreview.length > 100 && (
                <p className="text-sm text-gray-500 text-center">Mostrando 100 de {importPreview.length} filas</p>
              )}

              {/* Botones */}
              <div className="flex justify-between items-center">
                {importStep === 'preview' && (
                  <>
                    <Button variant="outline" onClick={resetImport}>
                      <X className="h-4 w-4 mr-2" />
                      Cancelar
                    </Button>
                    <Button onClick={handleImportClients} disabled={isProcessing} className="bg-blue-600 hover:bg-blue-700 text-white">
                      {isProcessing ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Importando...
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4 mr-2" />
                          Importar {importStats.total} clientes
                        </>
                      )}
                    </Button>
                  </>
                )}
                {importStep === 'complete' && (
                  <>
                    <Button variant="outline" onClick={() => { resetImport(); setIsImportDialogOpen(false); }}>
                      Cerrar
                    </Button>
                    <Button variant="outline" onClick={resetImport}>
                      <Upload className="h-4 w-4 mr-2" />
                      Importar otro archivo
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}

          {statusMessage && (
            <div className={`flex items-center p-3 rounded-md text-sm ${
              statusMessage.type === 'success' ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
              statusMessage.type === 'error' ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
              'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
            }`}>
              {statusMessage.type === 'success' ? <CheckCircle className="h-4 w-4 mr-2" /> :
               statusMessage.type === 'error' ? <AlertCircle className="h-4 w-4 mr-2" /> :
               <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {statusMessage.message}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClientesActions;
