import { StockSinSerialesPage } from '@/components/inventario/seriales/StockSinSerialesPage';

/** Existencia de productos con serial que no tiene un serial por cada unidad. */
export default function Page() {
  return (
    <div className="min-h-full bg-canvas p-4 sm:p-6">
      <StockSinSerialesPage />
    </div>
  );
}
