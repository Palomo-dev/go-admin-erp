'use client';
import { Loader2, Plus, UserPlus } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PhoneInput } from '@/components/ui/phone-input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CustomerSearchSelect } from '@/components/crm/oportunidades/CustomerSearchSelect';
import { PipelineSearchSelect } from '@/components/crm/oportunidades/PipelineSearchSelect';
import type { Customer, Pipeline } from '@/components/crm/oportunidades/types';
type CustomerMode = 'existing' | 'new';
/** Orígenes de lead que se ofrecen en el alta manual. */
const LEAD_SOURCES: { value: string; label: string }[] = [
  { value: 'manual_erp', label: 'Alta manual (ERP)' },
  { value: 'llamada_entrante', label: 'Llamada entrante' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'referido', label: 'Referido' },
  { value: 'evento', label: 'Evento / feria' },
  { value: 'redes_sociales', label: 'Redes sociales' },
  { value: 'otro', label: 'Otro' },
];
interface Props {
  open: boolean;
  handleOpenChange: (open: boolean) => void;
  handleSubmit: () => Promise<void>;
  isSaving: boolean;
  formError: string | null;
  name: string;
  setName: (value: string) => void;
  customerMode: CustomerMode;
  setCustomerMode: (value: CustomerMode) => void;
  customerResults: Customer[];
  customerId: string;
  setCustomerId: (value: string) => void;
  handleCustomerSearchChange: (value: string) => void;
  isSearchingCustomers: boolean;
  customerSearchError: string | null;
  newFirstName: string;
  setNewFirstName: (value: string) => void;
  newLastName: string;
  setNewLastName: (value: string) => void;
  newEmail: string;
  setNewEmail: (value: string) => void;
  newPhone: string;
  setNewPhone: (value: string) => void;
  newCompany: string;
  setNewCompany: (value: string) => void;
  source: string;
  setSource: (value: string) => void;
  pipelines: Pipeline[];
  pipelineId: string;
  setPipelineId: (value: string) => void;
  amount: string;
  setAmount: (value: string) => void;
  currency: string;
  setCurrency: (value: string) => void;
  opcionesMoneda: string[];
  expectedCloseDate: string;
  setExpectedCloseDate: (value: string) => void;
}
export function NewLeadDialogView(props: Props) {
  const { open, handleOpenChange, handleSubmit, isSaving, formError, name, setName, customerMode, setCustomerMode, customerResults, customerId, setCustomerId, handleCustomerSearchChange, isSearchingCustomers, customerSearchError, newFirstName, setNewFirstName, newLastName, setNewLastName, newEmail, setNewEmail, newPhone, setNewPhone, newCompany, setNewCompany, source, setSource, pipelines, pipelineId, setPipelineId, amount, setAmount, currency, setCurrency, opcionesMoneda, expectedCloseDate, setExpectedCloseDate } = props;
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-gray-900 dark:text-white">Nuevo lead</DialogTitle>
          <DialogDescription className="text-gray-500 dark:text-gray-400">
            Un lead siempre nace con ficha de cliente: es lo que permite llamarlo,
            escribirle o mandarle WhatsApp más adelante.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="lead-name" className="text-gray-700 dark:text-gray-300">
              Nombre del lead *
            </Label>
            <Input
              id="lead-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Restaurante La Playa — punto de venta"
              className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
            />
          </div>
          <Tabs value={customerMode} onValueChange={(v) => setCustomerMode(v as CustomerMode)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="existing">Cliente existente</TabsTrigger>
              <TabsTrigger value="new">
                <UserPlus className="h-3.5 w-3.5 mr-1" />
                Cliente nuevo
              </TabsTrigger>
            </TabsList>
            <TabsContent value="existing" className="pt-3">
              <CustomerSearchSelect
                customers={customerResults}
                selectedCustomerId={customerId}
                onSelect={setCustomerId}
                onSearchChange={handleCustomerSearchChange}
                isSearching={isSearchingCustomers}
                searchError={customerSearchError}
                allowEmpty={false}
                label="Cliente *"
              />
            </TabsContent>
            <TabsContent value="new" className="pt-3 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="lead-customer-first" className="text-gray-700 dark:text-gray-300">
                    Nombre *
                  </Label>
                  <Input
                    id="lead-customer-first"
                    value={newFirstName}
                    onChange={(e) => setNewFirstName(e.target.value)}
                    placeholder="Nombre"
                    className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lead-customer-last" className="text-gray-700 dark:text-gray-300">
                    Apellidos
                  </Label>
                  <Input
                    id="lead-customer-last"
                    value={newLastName}
                    onChange={(e) => setNewLastName(e.target.value)}
                    placeholder="Apellidos"
                    className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="lead-customer-email" className="text-gray-700 dark:text-gray-300">
                    Correo
                  </Label>
                  <Input
                    id="lead-customer-email"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="correo@ejemplo.com"
                    className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lead-customer-phone" className="text-gray-700 dark:text-gray-300">
                    Teléfono
                  </Label>
                  <PhoneInput
                    id="lead-customer-phone"
                    value={newPhone}
                    onChange={setNewPhone}
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Hace falta al menos correo o teléfono.
              </p>
              <div className="space-y-2">
                <Label htmlFor="lead-customer-company" className="text-gray-700 dark:text-gray-300">
                  Empresa
                </Label>
                <Input
                  id="lead-customer-company"
                  value={newCompany}
                  onChange={(e) => setNewCompany(e.target.value)}
                  placeholder="Razón social (opcional)"
                  className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
                />
              </div>
            </TabsContent>
          </Tabs>
          <div className="space-y-2">
            <Label className="text-gray-700 dark:text-gray-300">Origen</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEAD_SOURCES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {pipelines.length > 1 && (
            <PipelineSearchSelect
              pipelines={pipelines}
              selectedPipelineId={pipelineId}
              onSelect={setPipelineId}
              label="Pipeline"
            />
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="lead-amount" className="text-gray-700 dark:text-gray-300">
                Valor estimado
              </Label>
              <Input
                id="lead-amount"
                type="number"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">Moneda</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {opcionesMoneda.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="lead-close-date" className="text-gray-700 dark:text-gray-300">
              Cierre estimado
            </Label>
            <Input
              id="lead-close-date"
              type="date"
              value={expectedCloseDate}
              onChange={(e) => setExpectedCloseDate(e.target.value)}
              className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
            />
          </div>
          {formError && (
            <p
              role="alert"
              className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md px-3 py-2"
            >
              {formError}
            </p>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isSaving}
            className="border-gray-200 dark:border-gray-700"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSaving}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                Creando...
              </>
            ) : (
              <>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Crear lead
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
