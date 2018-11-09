"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
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
        const item = this.mem[key.toString()];
        if (item) {
            item.expire = Date.now() + this.ttl;
            return {
                data: item.data,
                metadata: item.metadata,
                fromCache: "mem"
            };
        }
    }
    set(key, value) {
        this.mem[key.toString()] = {
            data: value.data,
            metadata: value.metadata,
            expire: Date.now() + this.ttl
        };
        this.cleanup();
    }
    cleanup() {
        const now = Date.now();
        if (now - this.lastCleanup > this.cleanupInterval) {
            this.lastCleanup = now;
            for (const key in this.mem)
                if (this.mem[key].expire < now)
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
        try {
            const file = path.join(this.cacheFolder, key.toString());
            const buf = await util_1.promisify(fs.readFile)(file);
            const index = buf.indexOf("\n");
            return {
                data: buf.slice(index + 1),
                metadata: JSON.parse(buf.slice(0, index).toString()),
                fromCache: "disk"
            };
        }
        catch (err) {
            return undefined;
        }
    }
    async set(key, value) {
        const file = path.join(this.cacheFolder, key.toString());
        const fd = await util_1.promisify(fs.open)(file, "w");
        try {
            await util_1.promisify(fs.write)(fd, JSON.stringify(value.metadata) + "\n");
            await util_1.promisify(fs.write)(fd, value.data);
        }
        finally {
            await util_1.promisify(fs.close)(fd);
        }
        this.cleanup();
    }
    cleanup() {
        const now = Date.now();
        if (now - this.lastCleanup > this.cleanupInterval) {
            this.lastCleanup = now;
            child_process_1.exec(`find ${this.cacheFolder} -type f -not -newerat "${this.ttl / 1000} seconds ago" -delete`, (err, stdout, stderr) => {
                if (err || stderr)
                    console.error(err || stderr);
            });
        }
    }
}
exports.DiskCache = DiskCache;
class S3Cache {
    constructor(s3, bucket) {
        this.s3 = s3;
        this.bucket = bucket;
    }
    async get(key) {
        const req = {
            Bucket: this.bucket,
            Key: key.toString(),
        };
        try {
            const res = await this.s3.getObject(req).promise();
            return {
                data: res.Body,
                metadata: res.Metadata,
                fromCache: "s3"
            };
        }
        catch (err) {
            if (err.code == "NoSuchKey")
                return undefined;
            else
                throw err;
        }
    }
    async set(key, value) {
        const req = {
            Bucket: this.bucket,
            Key: key.toString(),
            Body: value.data,
            Metadata: value.metadata,
        };
        await this.s3.putObject(req).promise();
    }
}
exports.S3Cache = S3Cache;
