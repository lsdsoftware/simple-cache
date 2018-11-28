/// <reference types="node" />
import { S3 } from "aws-sdk";
import { Cache, CacheKey } from "multilayer-async-cache-builder";
export interface BinaryData {
    data: Buffer;
    metadata: {
        [key: string]: string;
    };
}
export declare class MemCache<T> implements Cache<T> {
    private readonly ttl;
    private readonly cleanupInterval;
    private readonly mem;
    private lastCleanup;
    constructor(ttl: number, cleanupInterval: number);
    get(key: CacheKey): T;
    set(key: CacheKey, value: T): void;
    invalidate(key: CacheKey): void;
    private cleanup(now);
}
export declare class DiskCache implements Cache<BinaryData> {
    private readonly cacheFolder;
    private readonly ttl;
    private readonly cleanupInterval;
    private lastCleanup;
    constructor(cacheFolder: string, ttl: number, cleanupInterval: number);
    get(key: CacheKey): Promise<BinaryData>;
    set(key: CacheKey, value: BinaryData): Promise<void>;
    invalidate(key: CacheKey): Promise<void>;
    private cleanup(now);
}
export declare class S3Cache implements Cache<BinaryData> {
    private readonly s3;
    private readonly bucket;
    private readonly prefix;
    constructor(s3: S3, bucket: string, prefix?: string);
    get(key: CacheKey): Promise<BinaryData>;
    set(key: CacheKey, value: BinaryData): Promise<void>;
    invalidate(key: CacheKey): Promise<void>;
}
