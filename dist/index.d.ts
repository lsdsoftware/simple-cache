import { Cache, CacheX } from "multilayer-async-cache-builder";
import { BinaryData, TtlSupplier } from "./common";
interface MemCacheOptions<V> {
    ttl: number | TtlSupplier<V>;
    cleanupInterval: number;
}
export declare class MemCache<V> implements Cache<V> {
    private readonly mem;
    private readonly throttledCleanup;
    private readonly getTtl;
    constructor({ ttl, cleanupInterval }: MemCacheOptions<V>);
    get(hashKey: string): Promise<V | undefined>;
    set(hashKey: string, value: V): Promise<void>;
    invalidate(hashKey: string): void;
    private cleanup;
}
export interface DiskCacheEntry {
    blobFile: string;
    metadataFile: string;
}
interface DiskCacheOptions {
    cacheFolder: string;
    ttl: number;
    cleanupInterval: number;
    byAccessTime?: boolean;
    accessTimeUpdateInterval?: number;
}
export declare class DiskCache<K> implements CacheX<BinaryData, DiskCacheEntry> {
    private readonly opts;
    private readonly lastAccessed;
    private readonly throttledCleanup;
    constructor(opts: DiskCacheOptions);
    private getEntry;
    get(hashKey: string): Promise<DiskCacheEntry | undefined>;
    set(hashKey: string, value: BinaryData): Promise<DiskCacheEntry>;
    invalidate(key: K): Promise<void>;
    private cleanup;
    private printExecError;
}
export {};
