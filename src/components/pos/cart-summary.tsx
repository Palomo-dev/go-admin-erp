import React from "react";
import { ShoppingCart } from "lucide-react";
import { Button } from "./button";
import { CartItem } from "./cart-item";

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

interface CartItemType {
  product_id: string;
  product: Product;
  quantity: number;
  unit_price: number;
  notes?: string;
  tax_amount?: number;
  discount_amount?: number;
}

interface Cart {
  id?: string;
  items: CartItemType[];
  customer_id?: string;
  customer_name?: string;
  organization_id?: string;
  branch_id?: string;
  user_id?: string;
}

interface CartSummaryProps {
  cart: Cart;
  onIncreaseQuantity: (productId: string) => void;
  onDecreaseQuantity: (productId: string) => void;
  onRemoveItem: (productId: string) => void;
  onHoldCart: () => void;
  onCheckout: () => void;
  customerName?: string;
}

export function CartSummary({
  cart,
  onIncreaseQuantity,
  onDecreaseQuantity,
  onRemoveItem,
  onHoldCart,
  onCheckout,
  customerName,
}: CartSummaryProps) {
  // Calcular el total del carrito
  const cartTotal = cart.items.reduce(
    (sum, item) => sum + item.unit_price * item.quantity,
    0
  );
  
  // Contar total de artículos en el carrito
  const itemCount = cart.items.reduce((count, item) => count + item.quantity, 0);

  return (
    <div className="bg-white dark:bg-gray-850 rounded-lg border border-gray-200 dark:border-gray-700 h-full flex flex-col">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-50 flex items-center">
            <ShoppingCart className="mr-2 h-5 w-5 text-blue-500 dark:text-blue-400" />
            Carrito
          </h3>
          <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-md text-sm font-medium">
            {itemCount} artículos
          </span>
        </div>
        {customerName && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Cliente: <span className="font-medium text-gray-700 dark:text-gray-300">{customerName}</span>
          </p>
        )}
      </div>
      
      <div className="flex-1 overflow-y-auto p-4">
        {cart.items.length === 0 ? (
          <div className="text-center py-8">
            <ShoppingCart className="mx-auto h-12 w-12 text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              El carrito está vacío
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Agrega productos para comenzar
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {cart.items.map((item) => (
              <CartItem
                key={item.product_id}
                product={item.product}
                quantity={item.quantity}
                unit_price={item.unit_price}
                onIncrease={() => onIncreaseQuantity(item.product_id)}
                onDecrease={() => onDecreaseQuantity(item.product_id)}
                onRemove={() => onRemoveItem(item.product_id)}
              />
            ))}
          </div>
        )}
      </div>
      
      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
        <div className="flex justify-between mb-2">
          <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Subtotal</span>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">${cartTotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between mb-4">
          <span className="text-base font-medium text-gray-900 dark:text-gray-50">Total</span>
          <span className="text-base font-bold text-gray-900 dark:text-gray-50">${cartTotal.toFixed(2)}</span>
        </div>
        
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            className="w-full bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
            disabled={cart.items.length === 0}
            onClick={onHoldCart}
          >
            Poner en espera
          </Button>
          <Button
            className="w-full bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white"
            disabled={cart.items.length === 0}
            onClick={onCheckout}
          >
            Cobrar
          </Button>
        </div>
      </div>
    </div>
  );
}
