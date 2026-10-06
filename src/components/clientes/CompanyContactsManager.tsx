'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { supabase } from '@/lib/supabase/config';
import { buscarClientes } from '@/lib/services/customers/busquedaClientesService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { CardListSkeleton } from '@/components/common/PageSkeletons';
import { Skeleton } from '@/components/ui/skeleton';
import { PhoneInput, mensajeErrorTelefono } from '@/components/kit/PhoneInput';
import { toast } from 'sonner';
import {
  User,
  Mail,
  Phone,
  Plus,
  Trash2,
  Star,
  Search,
  Loader2,
  Building2,
  X,
  Check,
  UserPlus,
} from 'lucide-react';
import { UserAvatar } from '@/components/app-layout/Header/GlobalSearch/UserAvatar';
import LocationSelector, { type LocationData } from '@/components/common/LocationSelector';
import { useKitT } from '@/components/kit/useIdiomaKit';

interface CompanyContactsManagerProps {
  companyId?: string;
  organizationId: number;
  branchId?: number;
  onContactsChange?: (contacts: PendingContact[]) => void;
}

interface ContactLink {
  link_id: string;
  person_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  position: string | null;
  is_primary: boolean;
  avatar_url: string | null;
}

export interface PendingContact {
  person_id?: string;
  isNew?: boolean;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  document_type?: string;
  document_number?: string;
  country_code?: string;
  state_code?: string;
  municipality_id?: string;
  position: string | null;
  is_primary: boolean;
  avatar_url: string | null;
}

/** Fila de `customer_company_links` con la persona embebida. */
interface FilaVinculo {
  link_id: string;
  person_id: string;
  position: string | null;
  is_primary: boolean | null;
  person: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    avatar_url: string | null;
  } | null;
}

interface SearchResult {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
}

export function CompanyContactsManager({ companyId, organizationId, branchId, onContactsChange }: CompanyContactsManagerProps) {
  const t = useTranslations('clientes.formulario');
  const isPersisted = !!companyId;
  const [contacts, setContacts] = useState<(ContactLink | PendingContact)[]>([]);
  const [loading, setLoading] = useState(isPersisted);
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<SearchResult | null>(null);
  const [newPosition, setNewPosition] = useState('');
  const [adding, setAdding] = useState(false);
  const [addMode, setAddMode] = useState<'search' | 'create'>('search');
  const [newPersonData, setNewPersonData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    document_type: 'national_id',
    document_number: '',
  });
  const [newPersonLocation, setNewPersonLocation] = useState<LocationData>({
    country: '',
    countryCode: '',
    state: '',
    stateCode: '',
    city: '',
    municipalityId: '',
  });

  const notifyChange = useCallback((updated: PendingContact[]) => {
    onContactsChange?.(updated);
  }, [onContactsChange]);

  const loadContacts = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('customer_company_links')
      .select(
        `link_id:id, person_id, position, is_primary,
         person:customers!customer_company_links_person_id_fkey(
           first_name, last_name, email, phone, avatar_url
         )`
      )
      .eq('company_id', companyId)
      .eq('organization_id', organizationId)
      .order('is_primary', { ascending: false });

    if (error) {
      toast.error(t('contactos.avisos.errorCargar'));
      console.error(error);
    } else if (data) {
      const mapped: ContactLink[] = (data as unknown as FilaVinculo[]).map((row) => ({
        link_id: row.link_id,
        person_id: row.person_id,
        first_name: row.person?.first_name ?? '',
        last_name: row.person?.last_name ?? '',
        email: row.person?.email ?? null,
        phone: row.person?.phone ?? null,
        position: row.position,
        is_primary: row.is_primary ?? false,
        avatar_url: row.person?.avatar_url ?? null,
      }));
      setContacts(mapped);
    }
    setLoading(false);
  }, [companyId, organizationId, t]);

  useEffect(() => {
    if (isPersisted) {
      loadContacts();
    } else {
      setLoading(false);
    }
  }, [loadContacts, isPersisted]);

  const handleSearch = async (term: string) => {
    setSearchTerm(term);
    if (term.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      // Búsqueda única de clientes (solo personas): sin tildes, todas las palabras.
      const { filas } = await buscarClientes(supabase, { organizationId, texto: term, limite: 10, tipo: 'person' });
      const existingIds = new Set(contacts.map((c) => c.person_id));
      setSearchResults(
        filas
          .filter((r) => !existingIds.has(r.id))
          .map((r) => ({ id: r.id, first_name: r.first_name ?? '', last_name: r.last_name ?? '', email: r.email, phone: r.phone, avatar_url: r.avatar_url })),
      );
    } catch (error) {
      console.error(error);
    }
    setSearching(false);
  };

  const handleAddExistingContact = async () => {
    if (!selectedPerson) return;
    setAdding(true);

    if (isPersisted && companyId) {
      const { error } = await supabase.from('customer_company_links').insert({
        organization_id: organizationId,
        person_id: selectedPerson.id,
        company_id: companyId,
        position: newPosition.trim() || null,
        is_primary: contacts.length === 0,
      });

      if (error) {
        toast.error(t('contactos.avisos.errorVincular'));
        console.error(error);
      } else {
        toast.success(t('contactos.avisos.vinculado'));
        resetModal();
        loadContacts();
      }
    } else {
      const newContact: PendingContact = {
        person_id: selectedPerson.id,
        first_name: selectedPerson.first_name,
        last_name: selectedPerson.last_name,
        email: selectedPerson.email,
        phone: selectedPerson.phone,
        avatar_url: selectedPerson.avatar_url,
        position: newPosition.trim() || null,
        is_primary: contacts.length === 0,
      };
      const updated = [...contacts, newContact] as PendingContact[];
      setContacts(updated);
      notifyChange(updated);
      toast.success(t('contactos.avisos.agregado'));
      resetModal();
    }
    setAdding(false);
  };

  const handleAddNewContact = async () => {
    if (!newPersonData.first_name.trim() || !newPersonData.last_name.trim()) {
      toast.error(t('contactos.avisos.nombreObligatorio'));
      return;
    }
    const errorTelefono = mensajeErrorTelefono(newPersonData.phone);
    if (errorTelefono) {
      toast.error(errorTelefono);
      return;
    }
    setAdding(true);

    if (isPersisted && companyId) {
      const { data: newPerson, error: personError } = await supabase
        .from('customers')
        .insert({
          organization_id: organizationId,
          branch_id: branchId || null,
          first_name: newPersonData.first_name.trim(),
          last_name: newPersonData.last_name.trim(),
          email: newPersonData.email || null,
          phone: newPersonData.phone || null,
          identification_type: newPersonData.document_type,
          identification_number: newPersonData.document_number || null,
          fiscal_municipality_id: newPersonLocation.municipalityId || null,
          customer_type: 'person',
          roles: ['cliente'],
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (personError) {
        toast.error(t('contactos.avisos.errorCrearPersona'));
        console.error(personError);
        setAdding(false);
        return;
      }

      const { error: linkError } = await supabase.from('customer_company_links').insert({
        organization_id: organizationId,
        person_id: newPerson.id,
        company_id: companyId,
        position: newPosition.trim() || null,
        is_primary: contacts.length === 0,
      });

      if (linkError) {
        toast.error(t('contactos.avisos.errorVincular'));
        console.error(linkError);
      } else {
        toast.success(t('contactos.avisos.personaCreada'));
        resetModal();
        loadContacts();
      }
    } else {
      const newContact: PendingContact = {
        isNew: true,
        first_name: newPersonData.first_name.trim(),
        last_name: newPersonData.last_name.trim(),
        email: newPersonData.email || null,
        phone: newPersonData.phone || null,
        document_type: newPersonData.document_type,
        document_number: newPersonData.document_number || undefined,
        country_code: newPersonLocation.countryCode || undefined,
        state_code: newPersonLocation.stateCode || undefined,
        municipality_id: newPersonLocation.municipalityId || undefined,
        position: newPosition.trim() || null,
        is_primary: contacts.length === 0,
        avatar_url: null,
      };
      const updated = [...contacts, newContact] as PendingContact[];
      setContacts(updated);
      notifyChange(updated);
      toast.success(t('contactos.avisos.agregado'));
      resetModal();
    }
    setAdding(false);
  };

  const resetModal = () => {
    setShowAddModal(false);
    setSelectedPerson(null);
    setSearchTerm('');
    setNewPosition('');
    setSearchResults([]);
    setAddMode('search');
    setNewPersonData({
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      document_type: 'national_id',
      document_number: '',
    });
    setNewPersonLocation({
      country: '',
      countryCode: '',
      state: '',
      stateCode: '',
      city: '',
      municipalityId: '',
    });
  };

  const handleRemoveContact = async (linkId: string, personName: string) => {
    if (isPersisted && companyId) {
      const { error } = await supabase
        .from('customer_company_links')
        .delete()
        .eq('id', linkId);

      if (error) {
        toast.error(t('contactos.avisos.errorDesvincular'));
        console.error(error);
      } else {
        toast.success(t('contactos.avisos.desvinculado', { nombre: personName }));
        loadContacts();
      }
    } else {
      const updated = contacts.filter((c) =>
        'link_id' in c ? c.link_id !== linkId : `${c.person_id}-${c.first_name}` !== linkId
      ) as PendingContact[];
      setContacts(updated);
      notifyChange(updated);
      toast.success(t('contactos.avisos.removido', { nombre: personName }));
    }
  };

  const handleTogglePrimary = async (linkId: string, currentPrimary: boolean) => {
    if (currentPrimary) return;

    if (isPersisted && companyId) {
      const { error: resetError } = await supabase
        .from('customer_company_links')
        .update({ is_primary: false })
        .eq('company_id', companyId)
        .eq('is_primary', true);

      if (resetError) {
        toast.error(t('contactos.avisos.errorActualizarPrincipal'));
        return;
      }

      const { error } = await supabase
        .from('customer_company_links')
        .update({ is_primary: true })
        .eq('id', linkId);

      if (error) {
        toast.error(t('contactos.avisos.errorEstablecerPrincipal'));
      } else {
        toast.success(t('contactos.avisos.principalActualizado'));
        loadContacts();
      }
    } else {
      const updated = contacts.map((c) => {
        const id = 'link_id' in c ? c.link_id : `${c.person_id}-${c.first_name}`;
        return { ...c, is_primary: id === linkId };
      }) as PendingContact[];
      setContacts(updated);
      notifyChange(updated);
    }
  };

  const handleUpdatePosition = async (linkId: string, position: string) => {
    if (isPersisted && companyId) {
      const { error } = await supabase
        .from('customer_company_links')
        .update({ position: position.trim() || null })
        .eq('id', linkId);

      if (error) {
        toast.error(t('contactos.avisos.errorCargo'));
      } else {
        toast.success(t('contactos.avisos.cargoActualizado'));
        loadContacts();
      }
    } else {
      const updated = contacts.map((c) => {
        const id = 'link_id' in c ? c.link_id : `${c.person_id}-${c.first_name}`;
        if (id === linkId) return { ...c, position: position.trim() || null };
        return c;
      }) as PendingContact[];
      setContacts(updated);
      notifyChange(updated);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Building2 className="h-5 w-5 text-gray-400 dark:text-gray-500" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('contactos.titulo')}</h3>
          {contacts.length > 0 && (
            <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-full">
              {contacts.length}
            </span>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowAddModal(true)}
          className="border-gray-200 dark:border-gray-700"
        >
          <Plus className="h-4 w-4 mr-1" />
          {t('contactos.vincular')}
        </Button>
      </div>

      {loading ? (
        <div className="py-4">
          <CardListSkeleton cards={3} columns="1" />
        </div>
      ) : contacts.length === 0 ? (
        <Card className="bg-gray-50 dark:bg-gray-800/50 border-dashed border-gray-300 dark:border-gray-600">
          <CardContent className="py-8 text-center">
            <User className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('contactos.vacio')}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowAddModal(true)}
              className="mt-3 border-gray-200 dark:border-gray-700"
            >
              <Plus className="h-4 w-4 mr-1" />
              {t('contactos.vincularPrimero')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {contacts.map((contact) => {
            const rowId = 'link_id' in contact ? contact.link_id : `${contact.person_id}-${contact.first_name}`;
            return (
              <ContactRow
                key={rowId}
                contact={contact}
                rowId={rowId}
                onRemove={handleRemoveContact}
                onTogglePrimary={handleTogglePrimary}
                onUpdatePosition={handleUpdatePosition}
              />
            );
          })}
        </div>
      )}

      {showAddModal && (
        <AddContactModal
          searchTerm={searchTerm}
          searchResults={searchResults}
          searching={searching}
          selectedPerson={selectedPerson}
          newPosition={newPosition}
          adding={adding}
          addMode={addMode}
          newPersonData={newPersonData}
          newPersonLocation={newPersonLocation}
          onSearch={handleSearch}
          onSelectPerson={setSelectedPerson}
          onPositionChange={setNewPosition}
          onAddModeChange={setAddMode}
          onNewPersonChange={setNewPersonData}
          onNewPersonLocationChange={setNewPersonLocation}
          onAddExisting={handleAddExistingContact}
          onAddNew={handleAddNewContact}
          onClose={resetModal}
        />
      )}
    </div>
  );
}

function ContactRow({
  contact,
  rowId,
  onRemove,
  onTogglePrimary,
  onUpdatePosition,
}: {
  contact: ContactLink | PendingContact;
  rowId: string;
  onRemove: (linkId: string, personName: string) => void;
  onTogglePrimary: (linkId: string, currentPrimary: boolean) => void;
  onUpdatePosition: (linkId: string, position: string) => void;
}) {
  const t = useTranslations('clientes.formulario');
  const [editingPosition, setEditingPosition] = useState(false);
  const [positionValue, setPositionValue] = useState(contact.position || '');

  const fullName = `${contact.first_name} ${contact.last_name}`.trim();
  const isNew = 'isNew' in contact && contact.isNew;

  return (
    <div className="flex flex-wrap items-center gap-3 p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
      <UserAvatar
        name={fullName}
        avatarUrl={contact.avatar_url}
        size="sm"
        className="w-10 h-10 shrink-0"
      />

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-gray-900 dark:text-white break-words whitespace-normal">
            {fullName}
          </p>
          {isNew && (
            <span className="px-1.5 py-0.5 text-xs font-medium bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 rounded">
              {t('contactos.nuevo')}
            </span>
          )}
          {contact.is_primary && (
            <span className="flex flex-wrap items-center gap-1 px-1.5 py-0.5 text-xs font-medium bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 rounded">
              <Star className="h-3 w-3 fill-current" />
              {t('contactos.principal')}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          {contact.email && (
            <span className="flex flex-wrap items-center gap-1 break-words whitespace-normal">
              <Mail className="h-3 w-3" />
              {contact.email}
            </span>
          )}
          {contact.phone && (
            <span className="flex flex-wrap items-center gap-1">
              <Phone className="h-3 w-3" />
              {contact.phone}
            </span>
          )}
        </div>
        {editingPosition ? (
          <div className="flex flex-wrap items-center gap-1 mt-1">
            <Input
              value={positionValue}
              onChange={(e) => setPositionValue(e.target.value)}
              placeholder={t('contactos.cargoPlaceholderCorto')}
              className="h-7 text-xs max-w-[200px]"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onUpdatePosition(rowId, positionValue);
                  setEditingPosition(false);
                }
                if (e.key === 'Escape') {
                  setEditingPosition(false);
                  setPositionValue(contact.position || '');
                }
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              onClick={() => {
                onUpdatePosition(rowId, positionValue);
                setEditingPosition(false);
              }}
            >
              <Check className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditingPosition(true)}
            className="text-xs text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 mt-0.5"
          >
            {contact.position || t('contactos.sinCargo')}
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1 shrink-0">
        {!contact.is_primary && (
          <button
            type="button"
            onClick={() => onTogglePrimary(rowId, contact.is_primary)}
            title={t('contactos.marcarPrincipal')}
            className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-amber-500 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <Star className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => onRemove(rowId, fullName)}
          title={t('contactos.desvincular')}
          className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-red-500 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function AddContactModal({
  searchTerm,
  searchResults,
  searching,
  selectedPerson,
  newPosition,
  adding,
  addMode,
  newPersonData,
  newPersonLocation,
  onSearch,
  onSelectPerson,
  onPositionChange,
  onAddModeChange,
  onNewPersonChange,
  onNewPersonLocationChange,
  onAddExisting,
  onAddNew,
  onClose,
}: {
  searchTerm: string;
  searchResults: SearchResult[];
  searching: boolean;
  selectedPerson: SearchResult | null;
  newPosition: string;
  adding: boolean;
  addMode: 'search' | 'create';
  newPersonData: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    document_type: string;
    document_number: string;
  };
  newPersonLocation: LocationData;
  onSearch: (term: string) => void;
  onSelectPerson: (person: SearchResult | null) => void;
  onPositionChange: (value: string) => void;
  onAddModeChange: (mode: 'search' | 'create') => void;
  onNewPersonChange: (data: typeof newPersonData) => void;
  onNewPersonLocationChange: (data: LocationData) => void;
  onAddExisting: () => void;
  onAddNew: () => void;
  onClose: () => void;
}) {
  const t = useTranslations('clientes.formulario');
  const tk = useKitT();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('contactos.agregar')}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={tk('comun.cerrar')}
            className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 rounded"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Tabs: Buscar / Crear */}
          {addMode === 'search' && !selectedPerson && (
            <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-900 rounded-lg">
              <button
                type="button"
                onClick={() => onAddModeChange('search')}
                className="flex-1 py-2 px-3 text-sm font-medium rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm"
              >
                <Search className="h-4 w-4 inline mr-1" />
                {t('contactos.buscarExistente')}
              </button>
              <button
                type="button"
                onClick={() => onAddModeChange('create')}
                className="flex-1 py-2 px-3 text-sm font-medium rounded-md text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              >
                <UserPlus className="h-4 w-4 inline mr-1" />
                {t('contactos.crearPersona')}
              </button>
            </div>
          )}

          {/* === MODO BUSCAR === */}
          {addMode === 'search' && (
            !selectedPerson ? (
              <>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">{t('contactos.buscarPersona')}</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
                    <Input
                      value={searchTerm}
                      onChange={(e) => onSearch(e.target.value)}
                      placeholder={t('contactos.buscarPlaceholder')}
                      className="pl-9"
                      autoFocus
                    />
                    {searching && (
                      <Skeleton className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 rounded-full" />
                    )}
                  </div>
                </div>

                {searchResults.length > 0 && (
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {searchResults.map((person) => {
                      const name = `${person.first_name} ${person.last_name}`.trim();
                      return (
                        <button
                          key={person.id}
                          type="button"
                          onClick={() => onSelectPerson(person)}
                          className="w-full flex flex-wrap items-center gap-3 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
                        >
                          <UserAvatar
                            name={name}
                            avatarUrl={person.avatar_url}
                            size="sm"
                            className="w-8 h-8 shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-white break-words whitespace-normal">
                              {name}
                            </p>
                            {person.email && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 break-words whitespace-normal">
                                {person.email}
                              </p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {searchTerm.length >= 2 && !searching && searchResults.length === 0 && (
                  <div className="text-center py-4 space-y-2">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {t('contactos.sinResultados')}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onAddModeChange('create')}
                      className="border-gray-200 dark:border-gray-700"
                    >
                      <UserPlus className="h-4 w-4 mr-1" />
                      {t('contactos.crearPersona')}
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <UserAvatar
                    name={`${selectedPerson.first_name} ${selectedPerson.last_name}`.trim()}
                    avatarUrl={selectedPerson.avatar_url}
                    size="sm"
                    className="w-10 h-10 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {selectedPerson.first_name} {selectedPerson.last_name}
                    </p>
                    {selectedPerson.email && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">{selectedPerson.email}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelectPerson(null)}
                    className="p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="position" className="text-sm font-medium">
                    {t('contactos.cargo')}
                  </Label>
                  <Input
                    id="position"
                    value={newPosition}
                    onChange={(e) => onPositionChange(e.target.value)}
                    placeholder={t('contactos.cargoPlaceholder')}
                    autoFocus
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onClose}
                    className="flex-1"
                    disabled={adding}
                  >
                    {tk('comun.cancelar')}
                  </Button>
                  <Button
                    type="button"
                    onClick={onAddExisting}
                    disabled={adding}
                    className="flex-1 bg-blue-600 hover:bg-blue-700"
                  >
                    {adding ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <Plus className="h-4 w-4 mr-1" />
                    )}
                    {t('contactos.vincularBoton')}
                  </Button>
                </div>
              </>
            )
          )}

          {/* === MODO CREAR === */}
          {addMode === 'create' && (
            <>
              <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-900 rounded-lg">
                <button
                  type="button"
                  onClick={() => onAddModeChange('search')}
                  className="flex-1 py-2 px-3 text-sm font-medium rounded-md text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                >
                  <Search className="h-4 w-4 inline mr-1" />
                  {t('contactos.buscarExistente')}
                </button>
                <button
                  type="button"
                  onClick={() => onAddModeChange('create')}
                  className="flex-1 py-2 px-3 text-sm font-medium rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm"
                >
                  <UserPlus className="h-4 w-4 inline mr-1" />
                  {t('contactos.crearPersona')}
                </button>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">
                      {t('contactos.nombre')} <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      value={newPersonData.first_name}
                      onChange={(e) => onNewPersonChange({ ...newPersonData, first_name: e.target.value })}
                      placeholder={t('contactos.nombrePlaceholder')}
                      autoFocus
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">
                      {t('contactos.apellido')} <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      value={newPersonData.last_name}
                      onChange={(e) => onNewPersonChange({ ...newPersonData, last_name: e.target.value })}
                      placeholder={t('contactos.apellidoPlaceholder')}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">{t('contactos.email')}</Label>
                    <Input
                      type="email"
                      value={newPersonData.email}
                      onChange={(e) => onNewPersonChange({ ...newPersonData, email: e.target.value })}
                      placeholder={t('contactos.emailPlaceholder')}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="new-contact-phone" className="text-sm font-medium">{t('contactos.telefono')}</Label>
                    <PhoneInput
                      id="new-contact-phone"
                      value={newPersonData.phone}
                      onChange={(v) => onNewPersonChange({ ...newPersonData, phone: v })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">{t('contactos.tipoDocumento')}</Label>
                    <select
                      value={newPersonData.document_type}
                      onChange={(e) => onNewPersonChange({ ...newPersonData, document_type: e.target.value })}
                      className="h-10 w-full rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-3 py-2 text-sm"
                    >
                      <option value="national_id">{t('contactos.tiposDocumento.cedula')}</option>
                      <option value="tax_id">NIT</option>
                      <option value="passport">{t('contactos.tiposDocumento.pasaporte')}</option>
                      <option value="foreign_id">{t('contactos.tiposDocumento.extranjero')}</option>
                      <option value="other">{t('contactos.tiposDocumento.otro')}</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">{t('contactos.numeroDocumento')}</Label>
                    <Input
                      value={newPersonData.document_number}
                      onChange={(e) => onNewPersonChange({ ...newPersonData, document_number: e.target.value })}
                      placeholder={t('contactos.numeroDocumentoPlaceholder')}
                    />
                  </div>
                </div>

                {/* Ubicación: País, Departamento, Municipio */}
                <div className="space-y-1">
                  <Label className="text-sm font-medium">{t('contactos.ubicacion')}</Label>
                  <div className="grid grid-cols-1 gap-2">
                    <LocationSelector
                      value={newPersonLocation}
                      onChange={onNewPersonLocationChange}
                      layout="stacked"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-sm font-medium">{t('contactos.cargo')}</Label>
                  <Input
                    value={newPosition}
                    onChange={(e) => onPositionChange(e.target.value)}
                    placeholder={t('contactos.cargoPlaceholder')}
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  className="flex-1"
                  disabled={adding}
                >
                  {tk('comun.cancelar')}
                </Button>
                <Button
                  type="button"
                  onClick={onAddNew}
                  disabled={adding}
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                >
                  {adding ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <UserPlus className="h-4 w-4 mr-1" />
                  )}
                  {t('contactos.crearVincular')}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
