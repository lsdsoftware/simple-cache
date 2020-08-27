"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.S3Cache = exports.DiskCache = exports.MemCache = void 0;
const child_process_1 = require("child_process");
const fs = require("fs");
const path = require("path");
const util_1 = require("util");
class MemCache {
    constructor(ttl, cleanupInterval) {
        this.ttl = ttl;
        this.cleanupInterval = cleanupInterval;
        this.mem = {};
        this.lastCleanup = Date.now();
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
        this.cleanup(now);
    }
    invalidate(key) {
        const hashKey = String(key);
        delete this.mem[hashKey];
    }
    cleanup(now) {
        if (now - this.lastCleanup > this.cleanupInterval) {
            this.lastCleanup = now;
            for (const key in this.mem)
                if (this.mem[key].mtime + this.ttl <= now)
                    delete this.mem[key];
        }
    }
}
exports.MemCache = MemCache;
class DiskCache {
    constructor(cacheFolder, ttl, cleanupInterval) {
        this.cacheFolder = cacheFolder;
        this.ttl = ttl;
        this.cleanupInterval = cleanupInterval;
        fs.statSync(cacheFolder);
        this.lastCleanup = Date.now();
    }
    async get(key) {
        const hashKey = String(key);
        const file = path.join(this.cacheFolder, hashKey);
        try {
            const buf = await util_1.promisify(fs.readFile)(file);
            const index = buf.indexOf("\n");
            const header = JSON.parse(buf.slice(0, index).toString());
            if (header.mtime + this.ttl > Date.now()) {
                return {
                    data: buf.slice(index + 1),
                    metadata: header.metadata
                };
            }
            else {
                util_1.promisify(fs.unlink)(file).catch(console.error);
                return undefined;
            }
        }
        catch (err) {
            return undefined;
        }
    }
    async set(key, value) {
        const hashKey = String(key);
        const file = path.join(this.cacheFolder, hashKey);
        const fd = await util_1.promisify(fs.open)(file, "w");
        const now = Date.now();
        const header = { metadata: value.metadata, mtime: now };
        try {
            await util_1.promisify(fs.write)(fd, JSON.stringify(header) + "\n");
            await util_1.promisify(fs.write)(fd, value.data);
            await util_1.promisify(fs.close)(fd);
        }
        catch (err) {
            try {
                await util_1.promisify(fs.close)(fd);
                await util_1.promisify(fs.unlink)(file);
            }
            catch (err) {
                console.error(err);
            }
            throw err;
        }
        this.cleanup(now);
    }
    async invalidate(key) {
        const hashKey = String(key);
        const file = path.join(this.cacheFolder, hashKey);
        await util_1.promisify(fs.unlink)(file);
    }
    cleanup(now) {
        if (now - this.lastCleanup > this.cleanupInterval) {
            this.lastCleanup = now;
            child_process_1.exec(`find ${this.cacheFolder} -type f -not -newermt "${this.ttl / 1000} seconds ago" -delete`, (err, stdout, stderr) => {
                if (err || stderr)
                    console.error(err || stderr);
            });
        }
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
