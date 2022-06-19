"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiskCache = exports.MemCache = void 0;
const child_process_1 = require("child_process");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const common_1 = require("./common");
class MemCache {
    constructor({ ttl, cleanupInterval }) {
        this.mem = new Map();
        this.throttledCleanup = (0, common_1.throttle)(this.cleanup.bind(this), cleanupInterval);
        this.getTtl = typeof ttl === "number" ? () => ttl : ttl;
    }
    get(hashKey) {
        const item = this.mem.get(hashKey);
        if (item) {
            if (item.mtime + this.getTtl(item.content) > Date.now()) {
                return item.content;
            }
            else {
                this.mem.delete(hashKey);
                return undefined;
            }
        }
        else {
            return undefined;
        }
    }
    set(hashKey, value) {
        const now = Date.now();
        this.mem.set(hashKey, {
            content: value,
            mtime: now
        });
        this.throttledCleanup();
    }
    invalidate(hashKey) {
        this.mem.delete(hashKey);
    }
    cleanup() {
        const now = Date.now();
        for (const [key, item] of this.mem.entries()) {
            if (item.mtime + this.getTtl(item.content) <= now)
                this.mem.delete(key);
        }
    }
}
exports.MemCache = MemCache;
class DiskCache {
    constructor(opts) {
        this.opts = opts;
        fs.statSync(opts.cacheFolder);
        this.lastAccessed = new Map();
        this.throttledCleanup = (0, common_1.throttle)(this.cleanup.bind(this), opts.cleanupInterval);
    }
    getEntry(hashKey) {
        return {
            blobFile: path.join(this.opts.cacheFolder, hashKey + ".blob"),
            metadataFile: path.join(this.opts.cacheFolder, hashKey + ".metadata")
        };
    }
    async get(hashKey) {
        const entry = this.getEntry(hashKey);
        try {
            const now = Date.now();
            const stat = await fsp.stat(entry.metadataFile);
            if (stat.mtimeMs + this.opts.ttl > now) {
                if (this.opts.byAccessTime && now - (this.lastAccessed.get(hashKey) || 0) > (this.opts.accessTimeUpdateInterval || 60 * 1000)) {
                    this.lastAccessed.set(hashKey, now);
                    (0, child_process_1.execFile)("touch", ["-c", entry.metadataFile, entry.blobFile], this.printExecError);
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
    async set(hashKey, value) {
        this.throttledCleanup();
        const entry = this.getEntry(hashKey);
        await fsp.writeFile(entry.blobFile, value.data);
        await fsp.writeFile(entry.metadataFile, JSON.stringify(value.metadata || {}));
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
        ], this.printExecError);
    }
    printExecError(err, stdout, stderr) {
        if (err || stderr)
            console.error(err || stderr);
    }
}
exports.DiskCache = DiskCache;
