import { execFile, ExecFileException } from "child_process";
import * as fs from "fs";
import * as fsp from "fs/promises"
import { Cache, CacheX } from "multilayer-async-cache-builder";
import * as path from "path";
import { S3 } from "aws-sdk"

export interface BinaryData {
  data: Buffer;
  metadata?: {[key: string]: string};
}

export interface DiskCacheEntry {
  blobFile: string
  metadataFile: string
}


interface MemCacheEntry<T> {
  content: T;
  mtime: number;
}

export class MemCache<K, V> implements Cache<K, V> {
  private readonly mem: {[key: string]: MemCacheEntry<V>};
  private readonly throttledCleanup: () => void
  constructor(private readonly ttl: number, cleanupInterval: number) {
    this.mem = {};
    this.throttledCleanup = throttle(this.cleanup.bind(this), cleanupInterval)
  }
  get(key: K): V|undefined {
    const hashKey = String(key);
    const item = this.mem[hashKey];
    if (item) {
      if (item.mtime+this.ttl > Date.now()) {
        return item.content;
      }
      else {
        delete this.mem[hashKey];
        return undefined;
      }
    }
    else {
      return undefined;
    }
  }
  set(key: K, value: V) {
    const hashKey = String(key);
    const now = Date.now();
    this.mem[hashKey] = {
      content: value,
      mtime: now
    };
    this.throttledCleanup()
  }
  invalidate(key: K) {
    const hashKey = String(key);
    delete this.mem[hashKey];
  }
  private cleanup() {
    const now = Date.now()
      for (const key in this.mem) if (this.mem[key].mtime+this.ttl <= now) delete this.mem[key];
  }
}



interface DiskCacheOptions {
  cacheFolder: string
  ttl: number
  cleanupInterval: number
  byAccessTime?: boolean
  accessTimeUpdateInterval?: number
}

export class DiskCache<K> implements CacheX<K, BinaryData, DiskCacheEntry> {
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
  async get(key: K): Promise<DiskCacheEntry|undefined> {
    const hashKey = String(key);
    const entry = this.getEntry(hashKey)
    try {
      const now = Date.now()
      const stat = await fsp.stat(entry.metadataFile)
      if (stat.mtimeMs + this.opts.ttl > now) {
        if (this.opts.byAccessTime && now - (this.lastAccessed.get(hashKey) || 0) > (this.opts.accessTimeUpdateInterval || 60*1000)) {
          this.lastAccessed.set(hashKey, now)
          execFile("touch", ["-c", entry.metadataFile, entry.blobFile], printExecError)
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
  async set(key: K, value: BinaryData): Promise<DiskCacheEntry> {
    this.throttledCleanup()
    const hashKey = String(key);
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
    ], printExecError)
  }
}



export class S3Cache<K> implements Cache<K, BinaryData> {
  constructor(private readonly s3: S3, private readonly bucket: string, private readonly prefix: string = "") {
  }
  async get(key: K): Promise<BinaryData|undefined> {
    const hashKey = String(key);
    const req = {
      Bucket: this.bucket,
      Key: this.prefix + hashKey,
    };
    try {
      const res = await this.s3.getObject(req).promise();
      return {
        data: <Buffer>res.Body,
        metadata: res.Metadata
      };
    }
    catch (err: any) {
      if (err.code == "NoSuchKey" || err.code == "NotFound") return undefined;
      else throw err;
    }
  }
  async set(key: K, value: BinaryData) {
    const hashKey = String(key);
    const req = {
      Bucket: this.bucket,
      Key: this.prefix + hashKey,
      Body: value.data,
      Metadata: value.metadata,
    };
    await this.s3.putObject(req).promise();
  }
  async invalidate(key: K) {
    const hashKey = String(key);
    const req = {
      Bucket: this.bucket,
      Key: this.prefix + hashKey
    };
    await this.s3.deleteObject(req).promise();
  }
}




function throttle(fn: () => void, interval: number) {
  let last = Date.now()
  return () => {
    const now = Date.now()
    if (now-last > interval) {
      last = now
      fn()
    }
  }
}

function printExecError(err: ExecFileException|null, stdout: string, stderr: string) {
  if (err || stderr) console.error(err || stderr)
}
