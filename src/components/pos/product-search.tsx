import React, { useState, useEffect } from "react";
import { Search, Loader2, Barcode } from "lucide-react";
import { Input } from "./input";
import { Button } from "./button";

interface Product {
  id: string;
  name: string;
  price: number;
  sku: string;
  image_url?: string;
  image_path?: string;
  image_type?: string;
  category_id?: number;
  description?: string;
  is_menu_item?: boolean;
  status?: string;
  organization_id: string;
  barcode?: string;
}

interface ProductSearchProps {
  products: Product[];
  onSearch: (searchTerm: string) => void;
  onScanBarcode: () => void;
  isScannerActive: boolean;
  loading: boolean;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
}

export function ProductSearch({
  products,
  onSearch,
  onScanBarcode,
  isScannerActive,
  loading,
  searchTerm,
  setSearchTerm
}: ProductSearchProps) {
  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const term = e.target.value;
    setSearchTerm(term);
    onSearch(term);
  };

  return (
    <div className="relative w-full">
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400 dark:text-gray-500" />
          <Input
            type="search"
            placeholder="Buscar productos por código, nombre o barcode..."
            value={searchTerm}
            onChange={handleSearch}
            className="pl-10 pr-10 w-full bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 focus:border-blue-500 dark:focus:border-blue-400"
            disabled={loading}
          />
          {loading && (
            <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-gray-400 dark:text-gray-500" />
          )}
        </div>
        <Button
          variant={isScannerActive ? "destructive" : "outline"}
          size="icon"
          onClick={onScanBarcode}
          className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 data-[state=active]:bg-blue-500 data-[state=active]:text-white"
        >
          <Barcode className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
