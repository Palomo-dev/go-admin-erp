export interface SharedImage {
  id: number;
  storage_path: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  dimensions: { width: number; height: number } | null;
  organization_id: number | null;
  is_public: boolean;
  tags: string[];
  created_at: string;
  updated_at: string;
  products_count?: number;
  public_url?: string;
}

export interface ImageFormData {
  file_name: string;
  is_public: boolean;
  tags: string[];
}

export interface ImagesStats {
  total: number;
  public: number;
  private: number;
  inUse: number;
  totalSize: number;
}

export interface ImageFilter {
  search?: string;
  isPublic?: boolean | null;
  tags?: string[];
}
