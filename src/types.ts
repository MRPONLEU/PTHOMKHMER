export interface AdminUser {
  email: string;
  addedAt: string;
}

export interface DocumentItem {
  id: string;
  title: string;
  description?: string;
  coverUrl: string;
  fileSize?: string;
  fileType?: string;
  downloadUrl: string;
  uploadDate: string;
  downloads: number;
  type?: string;
  subType?: string;
  isHidden?: boolean;
  tags?: string[];
}
