/// <reference types="node" />
import { S3 } from "aws-sdk";
import { Cache } from "multilayer-async-cache-builder";
export interface BinaryData {
    data: Buffer;
    metadata: {
        [key: string]: string;
    };
}
export declare class MemCache<K, V> implements Cache<K, V> {
    private readonly ttl;
    private readonly cleanupInterval;
    private readonly mem;
    private lastCleanup;
    constructor(ttl: number, cleanupInterval: number);
    get(key: K): V;
    set(key: K, value: V): void;
    invalidate(key: K): void;
    private cleanup;
}
export declare class DiskCache<K> implements Cache<K, BinaryData> {
    private readonly cacheFolder;
    private readonly ttl;
    private readonly cleanupInterval;
    private lastCleanup;
    constructor(cacheFolder: string, ttl: number, cleanupInterval: number);
    get(key: K): Promise<BinaryData>;
    set(key: K, value: BinaryData): Promise<void>;
    invalidate(key: K): Promise<void>;
    private cleanup;
}
export declare class S3Cache<K> implements Cache<K, BinaryData> {
    private readonly s3;
    private readonly bucket;
    private readonly prefix;
    constructor(s3: S3, bucket: string, prefix?: string);
    get(key: K): Promise<BinaryData>;
    set(key: K, value: BinaryData): Promise<void>;
    invalidate(key: K): Promise<void>;
}
