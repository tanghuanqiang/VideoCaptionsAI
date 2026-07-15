export interface VideoEditHistoryItem {
  id: number;
  file_uuid: string;
  original_filename: string;
  thumbnail_path?: string;
  subtitle_file?: string;
  output_file?: string;
  status: 'processing' | 'completed' | 'failed';
  created_at: string;
  updated_at: string;
  metadata?: Record<string, any>;
}

export interface VideoEditHistoryResponse {
  total: number;
  skip: number;
  limit: number;
  items: VideoEditHistoryItem[];
}
