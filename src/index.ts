import { execFile, ExecFileException } from "child_process";
import * as fs from "fs";
import * as fsp from "fs/promises";
import { Cache, CacheX } from "multilayer-async-cache-builder";
import * as path from "path";
import { BinaryData, throttle, TtlSupplier } from "./common";


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

  get(hashKey: string): V|undefined {
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

  set(hashKey: string, value: V) {
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



export interface DiskCacheEntry {
  blobFile: string
  metadataFile: string
}

interface DiskCacheOptions {
  cacheFolder: string
  ttl: number
  cleanupInterval: number
  byAccessTime?: boolean
  accessTimeUpdateInterval?: number
}

export class DiskCache<K> implements CacheX<BinaryData, DiskCacheEntry> {
  private readonly lastAccessed: Map<string, number>
  private readonly throttledCleanup: () => void

  constructor(private readonly opts: DiskCacheOptions) {
    fs.statSync(opts.cacheFolder)
    this.lastAccessed = new Map()
    this.throttledCleanup = throttle(this.cleanup.bind(this), opts.cleanupInterval)
  }

  private getEntry(hashKey: string): DiskCacheEntry {
    return {
      blobFile: path.join(this.opts.cacheFolder, hashKey + ".blob"),
      metadataFile: path.join(this.opts.cacheFolder, hashKey + ".metadata")
    }
  }

  async get(hashKey: string): Promise<DiskCacheEntry|undefined> {
    const entry = this.getEntry(hashKey)
    try {
      const now = Date.now()
      const stat = await fsp.stat(entry.metadataFile)
      if (stat.mtimeMs + this.opts.ttl > now) {
        if (this.opts.byAccessTime && now - (this.lastAccessed.get(hashKey) || 0) > (this.opts.accessTimeUpdateInterval || 60*1000)) {
          this.lastAccessed.set(hashKey, now)
          execFile("touch", ["-c", entry.metadataFile, entry.blobFile], this.printExecError)
        }
        return entry
      }
      else {
        fsp.unlink(entry.metadataFile).then(() => fsp.unlink(entry.blobFile)).catch(console.error)
        return undefined;
      }
    }
    catch (err) {
      return undefined;
    }
  }

  async set(hashKey: string, value: BinaryData): Promise<DiskCacheEntry> {
    this.throttledCleanup()
    const entry = this.getEntry(hashKey)
    await fsp.writeFile(entry.blobFile, value.data)
    await fsp.writeFile(entry.metadataFile, JSON.stringify(value.metadata || {}))
    this.lastAccessed.set(hashKey, Date.now())
    return entry
  }

  async invalidate(key: K) {
    const hashKey = String(key);
    const entry = this.getEntry(hashKey)
    await fsp.unlink(entry.metadataFile)
    await fsp.unlink(entry.blobFile)
  }

  private cleanup() {
    execFile("find", [
      this.opts.cacheFolder,
      "-type", "f",
      "-not", "-newermt", Math.ceil(this.opts.ttl /1000) + " seconds ago",
      "-delete"
    ], this.printExecError)
  }

  private printExecError(err: ExecFileException|null, stdout: string, stderr: string) {
    if (err || stderr) console.error(err || stderr)
  }
}
