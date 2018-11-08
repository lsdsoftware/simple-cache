import { S3 } from "aws-sdk";
import { exec } from "child_process";
import * as fs from "fs";
import { Cache, CacheKey } from "multilayer-async-cache-builder";
import * as path from "path";
import { promisify } from "util";

export interface CacheEntry {
  data: Buffer;
  metadata: {[key: string]: string};
}


export class MemCache implements Cache<CacheEntry> {
  private readonly mem: {[key: string]: {data: CacheEntry, expire: number}};
  private lastCleanup: number;
  constructor(private readonly ttl: number, private readonly cleanupInterval: number) {
    this.mem = {};
    this.lastCleanup = Date.now();
  }
  get(key: CacheKey): CacheEntry {
    const item = this.mem[key.toString()];
    if (item) {
      item.expire = Date.now() + this.ttl;
      return item.data;
    }
  }
  set(key: CacheKey, value: CacheEntry) {
    this.mem[key.toString()] = {
      data: value,
      expire: Date.now() + this.ttl
    };
    this.cleanup();
  }
  private cleanup() {
    const now = Date.now();
    if (now-this.lastCleanup > this.cleanupInterval) {
      this.lastCleanup = now;
      for (const key in this.mem) if (this.mem[key].expire < now) delete this.mem[key];
    }
  }
}


export class DiskCache implements Cache<CacheEntry> {
  private lastCleanup: number;
  constructor(private readonly cacheFolder: string, private readonly ttl: number, private readonly cleanupInterval: number) {
    fs.statSync(cacheFolder);
    this.lastCleanup = Date.now();
  }
  async get(key: CacheKey): Promise<CacheEntry> {
    try {
      const file = path.join(this.cacheFolder, key.toString());
      const buf = await promisify(fs.readFile)(file);
      const index = buf.indexOf("\n");
      return {
        data: buf.slice(index +1),
        metadata: JSON.parse(buf.slice(0, index).toString())
      }
    }
    catch (err) {
      return undefined;
    }
  }
  async set(key: CacheKey, value: CacheEntry) {
    const file = path.join(this.cacheFolder, key.toString());
    const fd = await promisify(fs.open)(file, "w");
    try {
      await promisify(fs.write)(fd, JSON.stringify(value.metadata) + "\n");
      await promisify(fs.write)(fd, value.data);
    }
    finally {
      await promisify(fs.close)(fd);
    }
    this.cleanup();
  }
  private cleanup() {
    const now = Date.now();
    if (now-this.lastCleanup > this.cleanupInterval) {
      this.lastCleanup = now;
      exec(`find ${this.cacheFolder} -type f -not -newerat "${this.ttl/1000} seconds ago" -delete`, (err, stdout, stderr) => {
        if (err || stderr) console.error(err || stderr);
      })
    }
  }
}


export class S3Cache implements Cache<CacheEntry> {
  constructor(private readonly s3: S3, private readonly bucket: string) {
  }
  async get(key: CacheKey): Promise<CacheEntry> {
    const req = {
      Bucket: this.bucket,
      Key: key.toString(),
    };
    const res = await this.s3.getObject(req).promise();
    return {
      data: <Buffer>res.Body,
      metadata: res.Metadata
    };
  }
  async set(key: CacheKey, value: CacheEntry) {
    const req = {
      Bucket: this.bucket,
      Key: key.toString(),
      Body: value.data,
      Metadata: value.metadata,
    };
    await this.s3.putObject(req).promise();
  }
}
