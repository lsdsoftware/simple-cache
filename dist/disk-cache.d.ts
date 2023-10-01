import { CacheX } from "multilayer-async-cache-builder";
import { BinaryData } from "./common";
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
export declare class DiskCache implements CacheX<BinaryData, DiskCacheEntry> {
    private readonly opts;
    private readonly throttledCleanup;
    constructor(opts: DiskCacheOptions);
    private getEntry;
    get(hashKey: string): Promise<DiskCacheEntry | undefined>;
    set(hashKey: string, value: BinaryData): Promise<DiskCacheEntry>;
    invalidate(hashKey: string): Promise<void>;
    private cleanup;
    private printExecError;
}
export {};
