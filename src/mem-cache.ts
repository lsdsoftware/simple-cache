import { Cache } from "multilayer-async-cache-builder";
import { throttle, TtlSupplier } from "./common";

interface MemCacheOptions<V> {
  ttl: number|TtlSupplier<V>
  cleanupInterval: number
}


export class MemCache<V> implements Cache<V> {
  private readonly mem: Map<string, {content: V, mtime: number}>
  private readonly throttledCleanup: () => void
  private readonly getTtl: TtlSupplier<V>

  constructor({ttl, cleanupInterval}: MemCacheOptions<V>) {
    this.mem = new Map()
    this.throttledCleanup = throttle(this.cleanup.bind(this), cleanupInterval)
    this.getTtl = typeof ttl === "number" ? () => ttl : ttl
  }

  async get(hashKey: string): Promise<V|undefined> {
    const item = this.mem.get(hashKey)
    if (item) {
      if (item.mtime + this.getTtl(item.content) > Date.now()) {
        return item.content;
      }
      else {
        this.mem.delete(hashKey)
        return undefined;
      }
    }
    else {
      return undefined;
    }
  }

  async set(hashKey: string, value: V): Promise<void> {
    const now = Date.now();
    this.mem.set(hashKey, {
      content: value,
      mtime: now
    })
    this.throttledCleanup()
  }

  invalidate(hashKey: string) {
    this.mem.delete(hashKey)
  }

  private cleanup() {
    const now = Date.now()
    for (const [key, item] of this.mem.entries()) {
      if (item.mtime + this.getTtl(item.content) <= now) this.mem.delete(key)
    }
  }
}
