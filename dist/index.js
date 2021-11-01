"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.S3Cache = exports.DiskCache = exports.MemCache = void 0;
const child_process_1 = require("child_process");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
class MemCache {
    constructor(ttl, cleanupInterval) {
        this.ttl = ttl;
        this.mem = {};
        this.throttledCleanup = throttle(this.cleanup.bind(this), cleanupInterval);
    }
    get(key) {
        const hashKey = String(key);
        const item = this.mem[hashKey];
        if (item) {
            if (item.mtime + this.ttl > Date.now()) {
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
    set(key, value) {
        const hashKey = String(key);
        const now = Date.now();
        this.mem[hashKey] = {
            content: value,
            mtime: now
        };
        this.throttledCleanup();
    }
    invalidate(key) {
        const hashKey = String(key);
        delete this.mem[hashKey];
    }
    cleanup() {
        const now = Date.now();
        for (const key in this.mem)
            if (this.mem[key].mtime + this.ttl <= now)
                delete this.mem[key];
    }
}
exports.MemCache = MemCache;
class DiskCache {
    constructor(opts) {
        this.opts = opts;
        fs.statSync(opts.cacheFolder);
        this.lastAccessed = new Map();
        this.throttledCleanup = throttle(this.cleanup.bind(this), opts.cleanupInterval);
    }
    getEntry(hashKey) {
        return {
            blobFile: path.join(this.opts.cacheFolder, hashKey + ".blob"),
            metadataFile: path.join(this.opts.cacheFolder, hashKey + ".metadata")
        };
    }
    async get(key) {
        const hashKey = String(key);
        const entry = this.getEntry(hashKey);
        try {
            const now = Date.now();
            const stat = await fsp.stat(entry.metadataFile);
            if (stat.mtimeMs + this.opts.ttl > now) {
                if (this.opts.byAccessTime && now - (this.lastAccessed.get(hashKey) || 0) > (this.opts.accessTimeUpdateInterval || 60 * 1000)) {
                    this.lastAccessed.set(hashKey, now);
                    (0, child_process_1.execFile)("touch", ["-c", entry.metadataFile, entry.blobFile], printExecError);
                }
                return entry;
            }
            else {
                fsp.unlink(entry.metadataFile).then(() => fsp.unlink(entry.blobFile)).catch(console.error);
                return undefined;
            }
        }
        catch (err) {
            return undefined;
        }
    }
    async set(key, value) {
        this.throttledCleanup();
        const hashKey = String(key);
        const entry = this.getEntry(hashKey);
        await fsp.writeFile(entry.blobFile, value.data);
        await fsp.writeFile(entry.metadataFile, JSON.stringify(value.metadata));
        this.lastAccessed.set(hashKey, Date.now());
        return entry;
    }
    async invalidate(key) {
        const hashKey = String(key);
        const entry = this.getEntry(hashKey);
        await fsp.unlink(entry.metadataFile);
        await fsp.unlink(entry.blobFile);
    }
    cleanup() {
        (0, child_process_1.execFile)("find", [
            this.opts.cacheFolder,
            "-type", "f",
            "-not", "-newermt", Math.ceil(this.opts.ttl / 1000) + " seconds ago",
            "-delete"
        ], printExecError);
    }
}
exports.DiskCache = DiskCache;
class S3Cache {
    constructor(s3, bucket, prefix = "") {
        this.s3 = s3;
        this.bucket = bucket;
        this.prefix = prefix;
    }
    async get(key) {
        const hashKey = String(key);
        const req = {
            Bucket: this.bucket,
            Key: this.prefix + hashKey,
        };
        try {
            const res = await this.s3.getObject(req).promise();
            return {
                data: res.Body,
                metadata: res.Metadata
            };
        }
        catch (err) {
            if (err.code == "NoSuchKey" || err.code == "NotFound")
                return undefined;
            else
                throw err;
        }
    }
    async set(key, value) {
        const hashKey = String(key);
        const req = {
            Bucket: this.bucket,
            Key: this.prefix + hashKey,
            Body: value.data,
            Metadata: value.metadata,
        };
        await this.s3.putObject(req).promise();
    }
    async invalidate(key) {
        const hashKey = String(key);
        const req = {
            Bucket: this.bucket,
            Key: this.prefix + hashKey
        };
        await this.s3.deleteObject(req).promise();
    }
}
exports.S3Cache = S3Cache;
function throttle(fn, interval) {
    let last = Date.now();
    return () => {
        const now = Date.now();
        if (now - last > interval) {
            last = now;
            fn();
        }
    };
}
function printExecError(err, stdout, stderr) {
    if (err || stderr)
        console.error(err || stderr);
}
