import { Cache } from "multilayer-async-cache-builder";
import { TtlSupplier } from "./common";
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
export {};
