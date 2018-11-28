import { S3 } from "aws-sdk";
import { exec } from "child_process";
import * as fs from "fs";
import { Cache, CacheKey } from "multilayer-async-cache-builder";
import * as path from "path";
import { promisify } from "util";

export interface BinaryData {
  data: Buffer;
  metadata: {[key: string]: string};
}


interface MemCacheEntry<T> {
  content: T;
  mtime: number;
}

export class MemCache<T> implements Cache<T> {
  private readonly mem: {[key: string]: MemCacheEntry<T>};
  private lastCleanup: number;
  constructor(private readonly ttl: number, private readonly cleanupInterval: number) {
    this.mem = {};
    this.lastCleanup = Date.now();
  }
  get(key: CacheKey): T {
    const hashKey = key.toString();
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
  set(key: CacheKey, value: T) {
    const hashKey = key.toString();
    const now = Date.now();
    this.mem[hashKey] = {
      content: value,
      mtime: now
    };
    this.cleanup(now);
  }
  invalidate(key: CacheKey) {
    const hashKey = key.toString();
    delete this.mem[hashKey];
  }
  private cleanup(now: number) {
    if (now-this.lastCleanup > this.cleanupInterval) {
      this.lastCleanup = now;
      for (const key in this.mem) if (this.mem[key].mtime+this.ttl <= now) delete this.mem[key];
    }
  }
}


interface DiskCacheFileHeader {
  metadata: {[key: string]: string};
  mtime: number;
}

export class DiskCache implements Cache<BinaryData> {
  private lastCleanup: number;
  constructor(private readonly cacheFolder: string, private readonly ttl: number, private readonly cleanupInterval: number) {
    fs.statSync(cacheFolder);
    this.lastCleanup = Date.now();
  }
  async get(key: CacheKey): Promise<BinaryData> {
    const hashKey = key.toString();
    const file = path.join(this.cacheFolder, hashKey);
    try {
      const buf = await promisify(fs.readFile)(file);
      const index = buf.indexOf("\n");
      const header: DiskCacheFileHeader = JSON.parse(buf.slice(0, index).toString());
      if (header.mtime+this.ttl > Date.now()) {
        return {
          data: buf.slice(index +1),
          metadata: header.metadata
        }
      }
      else {
        promisify(fs.unlink)(file).catch(console.error);
        return undefined;
      }
    }
    catch (err) {
      return undefined;
    }
  }
  async set(key: CacheKey, value: BinaryData) {
    const hashKey = key.toString();
    const file = path.join(this.cacheFolder, hashKey);
    const fd = await promisify(fs.open)(file, "w");
    const now = Date.now();
    const header: DiskCacheFileHeader = {metadata: value.metadata, mtime: now};
    try {
      await promisify(fs.write)(fd, JSON.stringify(header) + "\n");
      await promisify(fs.write)(fd, value.data);
      await promisify(fs.close)(fd);
    }
    catch (err) {
      try {
        await promisify(fs.close)(fd);
        await promisify(fs.unlink)(file);
      }
      catch (err) {
        console.error(err);
      }
      throw err;
    }
    this.cleanup(now);
  }
  async invalidate(key: CacheKey) {
    const hashKey = key.toString();
    const file = path.join(this.cacheFolder, hashKey);
    await promisify(fs.unlink)(file);
  }
  private cleanup(now: number) {
    if (now-this.lastCleanup > this.cleanupInterval) {
      this.lastCleanup = now;
      exec(`find ${this.cacheFolder} -type f -not -newermt "${this.ttl/1000} seconds ago" -delete`, (err, stdout, stderr) => {
        if (err || stderr) console.error(err || stderr);
      })
    }
  }
}


export class S3Cache implements Cache<BinaryData> {
  constructor(private readonly s3: S3, private readonly bucket: string, private readonly prefix: string = "") {
  }
  async get(key: CacheKey): Promise<BinaryData> {
    const hashKey = key.toString();
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
    catch (err) {
      if (err.code == "NoSuchKey" || err.code == "NotFound") return undefined;
      else throw err;
    }
  }
  async set(key: CacheKey, value: BinaryData) {
    const hashKey = key.toString();
    const req = {
      Bucket: this.bucket,
      Key: this.prefix + hashKey,
      Body: value.data,
      Metadata: value.metadata,
    };
    await this.s3.putObject(req).promise();
  }
  async invalidate(key: CacheKey) {
    const hashKey = key.toString();
    const req = {
      Bucket: this.bucket,
      Key: this.prefix + hashKey
    };
    await this.s3.deleteObject(req).promise();
  }
}
