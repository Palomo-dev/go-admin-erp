import React from "react";
import { Trash2, Minus, Plus } from "lucide-react";
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

interface CartItemProps {
  product: Product;
  quantity: number;
  unit_price: number;
  onIncrease: () => void;
  onDecrease: () => void;
  onRemove: () => void;
}

export function CartItem({
  product,
  quantity,
  unit_price,
  onIncrease,
  onDecrease,
  onRemove,
}: CartItemProps) {
  const itemTotal = quantity * unit_price;
  
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-200 dark:border-gray-700">
      <div className="flex-1">
        <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">{product.name}</h4>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {product.sku} - {unit_price.toFixed(2)}
        </p>
      </div>
      
      <div className="flex items-center space-x-2">
        <div className="flex items-center space-x-1">
          <Button 
            variant="outline" 
            size="icon" 
            className="h-6 w-6 p-0 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700"
            onClick={onDecrease}
          >
            <Minus className="h-3 w-3" />
          </Button>
          <span className="w-8 text-center text-sm font-medium text-gray-900 dark:text-gray-100">
            {quantity}
          </span>
          <Button 
            variant="outline" 
            size="icon" 
            className="h-6 w-6 p-0 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700"
            onClick={onIncrease}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
        <div className="w-20 text-right text-sm font-medium text-gray-900 dark:text-gray-100">
          ${itemTotal.toFixed(2)}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 p-0 text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400"
          onClick={onRemove}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
