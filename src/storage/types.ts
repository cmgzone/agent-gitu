import type { Readable } from 'node:stream';
export type StorageOperation = 'list' | 'read' | 'upload' | 'mkdir' | 'move' | 'delete' | 'link';
export interface StorageConnection {
  id: string;
  companyId: string;
  name: string;
  provider: 'local' | 's3' | 'google-drive' | 'onedrive' | 'dropbox' | 'api' | 'mcp';
  config: Record<string, string>;
  permissions: StorageOperation[];
  createdAt: string;
}
export interface StorageItem {
  id: string;
  name: string;
  size?: number;
  mime?: string;
  folder: boolean;
}
export interface StorageFileReference {
  id: string;
  companyId: string;
  connectionId: string;
  item: StorageItem;
  createdAt: string;
  authority?: string;
}
export interface StorageReferenceView extends StorageFileReference {
  connectionName?: string;
  connected: boolean;
  readable: boolean;
  grantChanged?: boolean;
}
export interface StorageRead {
  item: StorageItem;
  stream: Readable;
}
export interface StorageAdapter {
  capabilities: StorageOperation[];
  metadata?(id: string): Promise<StorageItem>;
  quota?(): Promise<{ totalBytes?: number; usedBytes?: number; availableBytes?: number }>;
  cancel?(checkpoint: Record<string, unknown>): Promise<void>;
  list(folder?: string): Promise<StorageItem[]>;
  read(id: string): Promise<StorageRead>;
  upload(file: string, name: string, checkpoint: Record<string, unknown>, save: (checkpoint: Record<string, unknown>) => void, signal?: AbortSignal): Promise<StorageItem>;
  mkdir?(name: string, parent?: string): Promise<StorageItem>;
  move?(id: string, name: string, parent?: string): Promise<StorageItem>;
  remove?(id: string): Promise<void>;
  link?(id: string): Promise<string>;
}
