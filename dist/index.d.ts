/// <reference types="node" />
import { S3 } from "aws-sdk";
import { Cache, CacheKey } from "multilayer-async-cache-builder";
export interface CacheEntry {
    data: Buffer;
    metadata: {
        [key: string]: string;
    };
    fromCache: string;
}
export declare class MemCache implements Cache<CacheEntry> {
    private readonly ttl;
    private readonly cleanupInterval;
    private readonly mem;
    private lastCleanup;
    constructor(ttl: number, cleanupInterval: number);
    get(key: CacheKey): CacheEntry;
    set(key: CacheKey, value: CacheEntry): void;
    invalidate(key: CacheKey): void;
    private cleanup(now);
}
export declare class DiskCache implements Cache<CacheEntry> {
    private readonly cacheFolder;
    private readonly ttl;
    private readonly cleanupInterval;
    private lastCleanup;
    constructor(cacheFolder: string, ttl: number, cleanupInterval: number);
    get(key: CacheKey): Promise<CacheEntry>;
    set(key: CacheKey, value: CacheEntry): Promise<void>;
    invalidate(key: CacheKey): Promise<void>;
    private cleanup(now);
}
export declare class S3Cache implements Cache<CacheEntry> {
    private readonly s3;
    private readonly bucket;
    private readonly prefix;
    constructor(s3: S3, bucket: string, prefix?: string);
    get(key: CacheKey): Promise<CacheEntry>;
    set(key: CacheKey, value: CacheEntry): Promise<void>;
    invalidate(key: CacheKey): Promise<void>;
}
