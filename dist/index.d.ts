/// <reference types="node" />
import { Cache, CacheX } from "multilayer-async-cache-builder";
import { S3 } from "aws-sdk";
export interface BinaryData {
    data: Buffer;
    metadata?: {
        [key: string]: string;
    };
}
export interface DiskCacheEntry {
    blobFile: string;
    metadataFile: string;
}
export declare class MemCache<K, V> implements Cache<K, V> {
    private readonly ttl;
    private readonly mem;
    private readonly throttledCleanup;
    constructor(ttl: number, cleanupInterval: number);
    get(key: K): V | undefined;
    set(key: K, value: V): void;
    invalidate(key: K): void;
    private cleanup;
}
interface DiskCacheOptions {
    cacheFolder: string;
    ttl: number;
    cleanupInterval: number;
    byAccessTime?: boolean;
    accessTimeUpdateInterval?: number;
}
export declare class DiskCache<K> implements CacheX<K, BinaryData, DiskCacheEntry> {
    private readonly opts;
    private readonly lastAccessed;
    private readonly throttledCleanup;
    constructor(opts: DiskCacheOptions);
    private getEntry;
    get(key: K): Promise<DiskCacheEntry | undefined>;
    set(key: K, value: BinaryData): Promise<DiskCacheEntry>;
    invalidate(key: K): Promise<void>;
    private cleanup;
}
export declare class S3Cache<K> implements Cache<K, BinaryData> {
    private readonly s3;
    private readonly bucket;
    private readonly prefix;
    constructor(s3: S3, bucket: string, prefix?: string);
    get(key: K): Promise<BinaryData | undefined>;
    set(key: K, value: BinaryData): Promise<void>;
    invalidate(key: K): Promise<void>;
}
export {};
