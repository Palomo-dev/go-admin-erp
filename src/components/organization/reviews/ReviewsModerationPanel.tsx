'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Check, X, MessageSquare, Star, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/utils/Utils';

interface Review {
  id: string;
  product_id: number;
  author_name: string;
  author_city: string | null;
  rating: number;
  title: string | null;
  content: string | null;
  images: string[] | null;
  is_verified_purchase: boolean;
  status: string;
  rejection_reason: string | null;
  reply_text: string | null;
  reply_at: string | null;
  helpful_count: number;
  created_at: string;
  products?: { id: number; name: string; uuid: string } | null;
}

interface ReviewsModerationPanelProps {
  organizationId: number;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pendiente', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  approved: { label: 'Aprobada', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  rejected: { label: 'Rechazada', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

export function ReviewsModerationPanel({ organizationId }: ReviewsModerationPanelProps) {
  const { toast } = useToast();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [productFilter, setProductFilter] = useState('all');
  const [products, setProducts] = useState<Array<{ id: number; name: string }>>([]);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  const loadReviews = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        organizationId: String(organizationId),
        status: statusFilter,
      });
      if (productFilter !== 'all') {
        params.set('productId', productFilter);
      }
      const res = await fetch(`/api/product-reviews?${params}`);
      const data = await res.json();
      if (data.reviews) {
        setReviews(data.reviews);
      }
    } catch {
      toast({ title: 'Error', description: 'No se pudieron cargar las reseñas', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, statusFilter, productFilter, toast]);

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  // Cargar lista de productos para el filtro
  useEffect(() => {
    if (!organizationId) return;
    fetch(`/api/products?organizationId=${organizationId}&limit=100`)
      .then(r => r.json())
      .then(data => {
        if (data.products) {
          setProducts(data.products.map((p: any) => ({ id: p.id, name: p.name })));
        }
      })
      .catch(() => {});
  }, [organizationId]);

  const handleUpdateStatus = async (reviewId: string, status: string, rejectionReason?: string) => {
    try {
      const res = await fetch('/api/product-reviews', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewId, status, rejectionReason }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: `Reseña ${status === 'approved' ? 'aprobada' : 'rechazada'}` });
        loadReviews();
      } else {
        toast({ title: 'Error', description: data.error || 'No se pudo actualizar', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Error de conexión', variant: 'destructive' });
    }
  };

  const handleReply = async (reviewId: string) => {
    if (!replyText.trim()) return;
    try {
      const res = await fetch('/api/product-reviews', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewId, replyText: replyText.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Respuesta enviada' });
        setReplyingTo(null);
        setReplyText('');
        loadReviews();
      }
    } catch {
      toast({ title: 'Error', description: 'No se pudo enviar la respuesta', variant: 'destructive' });
    }
  };

  const renderStars = (rating: number) => (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          className={cn('h-3.5 w-3.5', i <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300')}
        />
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-400" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-[140px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pendientes</SelectItem>
              <SelectItem value="approved">Aprobadas</SelectItem>
              <SelectItem value="rejected">Rechazadas</SelectItem>
              <SelectItem value="all">Todas</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {products.length > 0 && (
          <Select value={productFilter} onValueChange={setProductFilter}>
            <SelectTrigger className="h-8 w-[200px] text-sm">
              <SelectValue placeholder="Todos los productos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los productos</SelectItem>
              {products.map(p => (
                <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <span className="text-sm text-gray-500">{reviews.length} reseña(s)</span>
      </div>

      {/* Lista de reseñas */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : reviews.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed rounded-lg">
          <p className="text-gray-500">No hay reseñas con este filtro.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map((review) => (
            <div
              key={review.id}
              className="border rounded-lg p-4 space-y-3 dark:border-gray-700"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{review.author_name}</span>
                    {review.author_city && (
                      <span className="text-xs text-gray-500">{review.author_city}</span>
                    )}
                    {review.is_verified_purchase && (
                      <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-1.5 py-0.5 rounded">
                        Compra verificada
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {renderStars(review.rating)}
                    <span className="text-xs text-gray-400">
                      {new Date(review.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  {review.products && (
                    <p className="text-xs text-gray-500">
                      Producto: <span className="font-medium">{review.products.name}</span>
                    </p>
                  )}
                </div>
                <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', STATUS_LABELS[review.status]?.color)}>
                  {STATUS_LABELS[review.status]?.label || review.status}
                </span>
              </div>

              {/* Contenido */}
              {review.title && (
                <p className="text-sm font-medium">{review.title}</p>
              )}
              {review.content && (
                <p className="text-sm text-gray-600 dark:text-gray-400">{review.content}</p>
              )}

              {/* Respuesta existente */}
              {review.reply_text && (
                <div className="ml-4 pl-3 border-l-2 dark:border-gray-600 space-y-1">
                  <p className="text-xs font-medium text-gray-500">Respuesta del comercio:</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{review.reply_text}</p>
                </div>
              )}

              {/* Acciones */}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t dark:border-gray-700">
                {review.status === 'pending' && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs text-green-600 border-green-300 hover:bg-green-50"
                      onClick={() => handleUpdateStatus(review.id, 'approved')}
                    >
                      <Check className="h-3.5 w-3.5 mr-1" />
                      Aprobar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs text-red-600 border-red-300 hover:bg-red-50"
                      onClick={() => handleUpdateStatus(review.id, 'rejected', 'No cumple las políticas')}
                    >
                      <X className="h-3.5 w-3.5 mr-1" />
                      Rechazar
                    </Button>
                  </>
                )}
                {review.status === 'approved' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs text-red-600 border-red-300 hover:bg-red-50"
                    onClick={() => handleUpdateStatus(review.id, 'rejected', 'Desaprobada')}
                  >
                    <X className="h-3.5 w-3.5 mr-1" />
                    Desaprobar
                  </Button>
                )}
                {review.status === 'rejected' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs text-green-600 border-green-300 hover:bg-green-50"
                    onClick={() => handleUpdateStatus(review.id, 'approved')}
                  >
                    <Check className="h-3.5 w-3.5 mr-1" />
                    Aprobar
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => {
                    if (replyingTo === review.id) {
                      setReplyingTo(null);
                      setReplyText('');
                    } else {
                      setReplyingTo(review.id);
                      setReplyText(review.reply_text || '');
                    }
                  }}
                >
                  <MessageSquare className="h-3.5 w-3.5 mr-1" />
                  {review.reply_text ? 'Editar respuesta' : 'Responder'}
                </Button>
              </div>

              {/* Formulario de respuesta */}
              {replyingTo === review.id && (
                <div className="space-y-2 pt-2">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Escribe una respuesta pública a esta reseña..."
                    rows={3}
                    className="w-full text-sm rounded-md border dark:border-gray-600 bg-white dark:bg-white/5 p-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" className="h-7 text-xs" onClick={() => handleReply(review.id)}>
                      Enviar respuesta
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => { setReplyingTo(null); setReplyText(''); }}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
