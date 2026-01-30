'use client';

import { useState } from 'react';
import Link from 'next/link';
import { 
  Plus, 
  Upload, 
  Search, 
  Ticket,
  RefreshCw,
  Sparkles
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { CouponFilters, DISCOUNT_TYPE_LABELS } from './types';
import { CouponForm } from './CouponForm';

interface CouponsHeaderProps {
  filters: CouponFilters;
  onFiltersChange: (filters: CouponFilters) => void;
  onRefresh: () => void;
  totalCoupons: number;
  activeCoupons: number;
  loading: boolean;
}

export function CouponsHeader({
  filters,
  onFiltersChange,
  onRefresh,
  totalCoupons,
  activeCoupons,
  loading
}: CouponsHeaderProps) {
  const [showNewCouponDialog, setShowNewCouponDialog] = useState(false);

  const handleSearchChange = (value: string) => {
    onFiltersChange({ ...filters, search: value });
  };

  const handleStatusChange = (value: string) => {
    const newFilter = value === 'all' 
      ? { ...filters, is_active: undefined }
      : { ...filters, is_active: value === 'active' };
    onFiltersChange(newFilter);
  };

  const handleTypeChange = (value: string) => {
    const newFilter = value === 'all'
      ? { ...filters, discount_type: undefined }
      : { ...filters, discount_type: value as any };
    onFiltersChange(newFilter);
  };

  const handleCouponCreated = () => {
    setShowNewCouponDialog(false);
    onRefresh();
  };

  return (
    <>
      <div className="space-y-4">
        {/* Header Principal */}
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardHeader className="pb-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-center space-x-4">
                <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
                  <Ticket className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <CardTitle className="dark:text-white">
                    Cupones
                  </CardTitle>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Administra códigos de descuento para tus clientes
                  </p>
                </div>
              </div>
              
              <div className="flex flex-wrap items-center gap-2">
                <Link href="/app/pos/promociones">
                  <Button variant="outline" size="sm" className="dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:hover:bg-gray-600">
                    Promociones
                  </Button>
                </Link>
                <Button 
                  size="sm" 
                  onClick={() => setShowNewCouponDialog(true)}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Nuevo Cupón
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Métricas y Filtros */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Total */}
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Total Cupones</p>
                  <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                    {totalCoupons}
                  </p>
                </div>
                <Ticket className="h-8 w-8 text-purple-600 dark:text-purple-400" />
              </div>
            </CardContent>
          </Card>

          {/* Activos */}
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Activos</p>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {activeCoupons}
                  </p>
                </div>
                <Sparkles className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
            </CardContent>
          </Card>

          {/* Filtros */}
          <Card className="md:col-span-2 dark:bg-gray-800 dark:border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    value={filters.search || ''}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    placeholder="Buscar por código o nombre..."
                    className="pl-10 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                </div>
                <Select 
                  value={filters.is_active === undefined ? 'all' : filters.is_active ? 'active' : 'inactive'}
                  onValueChange={handleStatusChange}
                >
                  <SelectTrigger className="w-[130px] dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                    <SelectValue placeholder="Estado" />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="active">Activos</SelectItem>
                    <SelectItem value="inactive">Inactivos</SelectItem>
                  </SelectContent>
                </Select>
                <Select 
                  value={filters.discount_type || 'all'}
                  onValueChange={handleTypeChange}
                >
                  <SelectTrigger className="w-[140px] dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                    <SelectItem value="all">Todos</SelectItem>
                    {Object.entries(DISCOUNT_TYPE_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={onRefresh}
                  disabled={loading}
                  className="dark:bg-gray-700 dark:border-gray-600 dark:hover:bg-gray-600"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Dialog para nuevo cupón */}
      <CouponForm
        open={showNewCouponDialog}
        onOpenChange={setShowNewCouponDialog}
        onSuccess={handleCouponCreated}
      />
    </>
  );
}
