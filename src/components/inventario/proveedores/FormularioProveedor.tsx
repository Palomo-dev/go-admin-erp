"use client"

import React, { useState, useEffect } from 'react'
import { useOrganization } from '@/lib/hooks/useOrganization'
import { Proveedor } from './types'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import ImageUploader from '@/components/common/ImageUploader'
import IconSelector from '@/components/common/IconSelector'
import ColorPicker from '@/components/common/ColorPicker'
import RatingSelector from '@/components/common/RatingSelector'

interface FormularioProveedorProps {
  proveedor?: Proveedor
  onSubmit: (proveedor: Proveedor | Partial<Proveedor>) => void
  onCancel: () => void
}

const FormularioProveedor: React.FC<FormularioProveedorProps> = ({
  proveedor,
  onSubmit,
  onCancel
}) => {
  const { organization } = useOrganization()
  
  const [formData, setFormData] = useState({
    // Básico
    name: '',
    contact: '',
    phone: '',
    email: '',
    website: '',
    description: '',
    is_active: true,
    rating: 0,
    
    // Visual
    icon: 'Truck',
    color: '#10b981',
    logo_url: '',
    
    // Dirección
    address: '',
    city: '',
    state: '',
    country: 'Colombia',
    postal_code: '',
    
    // Fiscal
    nit: '',
    tax_id: '',
    tax_regime: '',
    fiscal_responsibilities: [] as string[],
    
    // Comercial
    payment_terms: '30 días',
    credit_days: 30,
    
    // Bancario
    bank_name: '',
    bank_account: '',
    account_type: 'checking' as 'savings' | 'checking' | 'other',
    
    // Notas
    notes: ''
  })
  
  const [errors, setErrors] = useState<{[key: string]: string}>({})

  useEffect(() => {
    if (proveedor) {
      setFormData({
        name: proveedor.name || '',
        contact: proveedor.contact || '',
        phone: proveedor.phone || '',
        email: proveedor.email || '',
        website: (proveedor as any).website || '',
        description: (proveedor as any).description || '',
        is_active: (proveedor as any).is_active !== undefined ? (proveedor as any).is_active : true,
        rating: (proveedor as any).rating || 0,
        
        icon: (proveedor as any).icon || 'Truck',
        color: (proveedor as any).color || '#10b981',
        logo_url: (proveedor as any).logo_url || '',
        
        address: (proveedor as any).address || '',
        city: (proveedor as any).city || '',
        state: (proveedor as any).state || '',
        country: (proveedor as any).country || 'Colombia',
        postal_code: (proveedor as any).postal_code || '',
        
        nit: proveedor.nit || '',
        tax_id: (proveedor as any).tax_id || '',
        tax_regime: (proveedor as any).tax_regime || '',
        fiscal_responsibilities: (proveedor as any).fiscal_responsibilities || [],
        
        payment_terms: (proveedor as any).payment_terms || '30 días',
        credit_days: (proveedor as any).credit_days || 30,
        
        bank_name: (proveedor as any).bank_name || '',
        bank_account: (proveedor as any).bank_account || '',
        account_type: (proveedor as any).account_type || 'checking',
        
        notes: proveedor.notes || ''
      })
    }
  }, [proveedor])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }))
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    const newErrors: {[key: string]: string} = {}
    
    if (!formData.name.trim()) {
      newErrors.name = "El nombre es obligatorio"
    }
    
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Email inválido"
    }
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }
    
    onSubmit({
      ...proveedor,
      organization_id: organization?.id,
      ...formData
    } as any)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Tabs defaultValue="basico" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="basico">Básico</TabsTrigger>
          <TabsTrigger value="visual">Visual</TabsTrigger>
          <TabsTrigger value="direccion">Dirección</TabsTrigger>
          <TabsTrigger value="fiscal">Fiscal</TabsTrigger>
          <TabsTrigger value="bancario">Bancario</TabsTrigger>
        </TabsList>

        {/* Tab Básico */}
        <TabsContent value="basico" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Nombre */}
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="name">
                Nombre del Proveedor <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Ej: ACME Corporation"
                className={errors.name ? "border-red-400" : ""}
              />
              {errors.name && <p className="text-sm text-red-500">{errors.name}</p>}
            </div>

            {/* Contacto */}
            <div className="space-y-2">
              <Label htmlFor="contact">Persona de Contacto</Label>
              <Input
                id="contact"
                name="contact"
                value={formData.contact}
                onChange={handleChange}
                placeholder="Ej: Juan Pérez"
              />
            </div>

            {/* Teléfono */}
            <div className="space-y-2">
              <Label htmlFor="phone">Teléfono</Label>
              <Input
                id="phone"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="Ej: +57 300 123 4567"
              />
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="ventas@proveedor.com"
                className={errors.email ? "border-red-400" : ""}
              />
              {errors.email && <p className="text-sm text-red-500">{errors.email}</p>}
            </div>

            {/* Website */}
            <div className="space-y-2">
              <Label htmlFor="website">Sitio Web</Label>
              <Input
                id="website"
                name="website"
                value={formData.website}
                onChange={handleChange}
                placeholder="https://proveedor.com"
              />
            </div>

            {/* Descripción */}
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="description">Descripción</Label>
              <Textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                placeholder="Descripción del proveedor y sus servicios"
                rows={3}
                className="resize-none"
              />
            </div>

            {/* Calificación */}
            <div className="space-y-2">
              <RatingSelector
                value={formData.rating}
                onChange={(rating) => setFormData(prev => ({ ...prev, rating }))}
                label="Calificación"
              />
            </div>

            {/* Estado */}
            <div className="space-y-2">
              <Label>Estado</Label>
              <div className="flex items-center gap-3 h-10">
                <Switch
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
                />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {formData.is_active ? 'Activo' : 'Inactivo'}
                </span>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Tab Visual */}
        <TabsContent value="visual" className="space-y-4 mt-4">
          <IconSelector
            value={formData.icon}
            onChange={(icon) => setFormData(prev => ({ ...prev, icon }))}
            label="Icono"
          />

          <ColorPicker
            value={formData.color}
            onChange={(color) => setFormData(prev => ({ ...prev, color }))}
            label="Color"
          />

          <ImageUploader
            currentImageUrl={formData.logo_url}
            onImageUploaded={(url) => setFormData(prev => ({ ...prev, logo_url: url }))}
            onImageRemoved={() => setFormData(prev => ({ ...prev, logo_url: '' }))}
            bucket="suppliers"
            folder="logos"
            label="Logo del Proveedor"
          />
        </TabsContent>

        {/* Tab Dirección */}
        <TabsContent value="direccion" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Dirección */}
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="address">Dirección</Label>
              <Input
                id="address"
                name="address"
                value={formData.address}
                onChange={handleChange}
                placeholder="Calle 100 #15-20"
              />
            </div>

            {/* Ciudad */}
            <div className="space-y-2">
              <Label htmlFor="city">Ciudad</Label>
              <Input
                id="city"
                name="city"
                value={formData.city}
                onChange={handleChange}
                placeholder="Bogotá"
              />
            </div>

            {/* Estado/Departamento */}
            <div className="space-y-2">
              <Label htmlFor="state">Estado/Departamento</Label>
              <Input
                id="state"
                name="state"
                value={formData.state}
                onChange={handleChange}
                placeholder="Cundinamarca"
              />
            </div>

            {/* País */}
            <div className="space-y-2">
              <Label htmlFor="country">País</Label>
              <Input
                id="country"
                name="country"
                value={formData.country}
                onChange={handleChange}
                placeholder="Colombia"
              />
            </div>

            {/* Código Postal */}
            <div className="space-y-2">
              <Label htmlFor="postal_code">Código Postal</Label>
              <Input
                id="postal_code"
                name="postal_code"
                value={formData.postal_code}
                onChange={handleChange}
                placeholder="110111"
              />
            </div>
          </div>
        </TabsContent>

        {/* Tab Fiscal */}
        <TabsContent value="fiscal" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* NIT */}
            <div className="space-y-2">
              <Label htmlFor="nit">NIT</Label>
              <Input
                id="nit"
                name="nit"
                value={formData.nit}
                onChange={handleChange}
                placeholder="900123456-7"
              />
            </div>

            {/* Tax ID */}
            <div className="space-y-2">
              <Label htmlFor="tax_id">Tax ID / RUT</Label>
              <Input
                id="tax_id"
                name="tax_id"
                value={formData.tax_id}
                onChange={handleChange}
                placeholder="900123456-7"
              />
            </div>

            {/* Régimen Fiscal */}
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="tax_regime">Régimen Fiscal</Label>
              <Select
                value={formData.tax_regime}
                onValueChange={(value) => setFormData(prev => ({ ...prev, tax_regime: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar régimen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Responsable de IVA">Responsable de IVA</SelectItem>
                  <SelectItem value="Régimen Simplificado">Régimen Simplificado</SelectItem>
                  <SelectItem value="Régimen Común">Régimen Común</SelectItem>
                  <SelectItem value="Gran Contribuyente">Gran Contribuyente</SelectItem>
                  <SelectItem value="No Responsable">No Responsable</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Términos de Pago */}
            <div className="space-y-2">
              <Label htmlFor="payment_terms">Términos de Pago</Label>
              <Select
                value={formData.payment_terms}
                onValueChange={(value) => setFormData(prev => ({ ...prev, payment_terms: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Contado">Contado</SelectItem>
                  <SelectItem value="15 días">15 días</SelectItem>
                  <SelectItem value="30 días">30 días</SelectItem>
                  <SelectItem value="45 días">45 días</SelectItem>
                  <SelectItem value="60 días">60 días</SelectItem>
                  <SelectItem value="90 días">90 días</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Días de Crédito */}
            <div className="space-y-2">
              <Label htmlFor="credit_days">Días de Crédito</Label>
              <Input
                id="credit_days"
                name="credit_days"
                type="number"
                value={formData.credit_days}
                onChange={handleChange}
                min="0"
              />
            </div>
          </div>
        </TabsContent>

        {/* Tab Bancario */}
        <TabsContent value="bancario" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Banco */}
            <div className="space-y-2">
              <Label htmlFor="bank_name">Banco</Label>
              <Input
                id="bank_name"
                name="bank_name"
                value={formData.bank_name}
                onChange={handleChange}
                placeholder="Bancolombia"
              />
            </div>

            {/* Número de Cuenta */}
            <div className="space-y-2">
              <Label htmlFor="bank_account">Número de Cuenta</Label>
              <Input
                id="bank_account"
                name="bank_account"
                value={formData.bank_account}
                onChange={handleChange}
                placeholder="12345678901"
              />
            </div>

            {/* Tipo de Cuenta */}
            <div className="space-y-2">
              <Label htmlFor="account_type">Tipo de Cuenta</Label>
              <Select
                value={formData.account_type}
                onValueChange={(value: any) => setFormData(prev => ({ ...prev, account_type: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="savings">Ahorros</SelectItem>
                  <SelectItem value="checking">Corriente</SelectItem>
                  <SelectItem value="other">Otra</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Notas */}
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="notes">Notas Adicionales</Label>
              <Textarea
                id="notes"
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                placeholder="Notas internas sobre el proveedor"
                rows={4}
                className="resize-none"
              />
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Botones */}
      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white">
          {proveedor ? "Actualizar" : "Crear"}
        </Button>
      </div>
    </form>
  )
}

export default FormularioProveedor
