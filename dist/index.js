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
    async get(hashKey) {
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
    async set(hashKey, value) {
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
        this.throttledCleanup = (0, common_1.throttle)(this.cleanup.bind(this), opts.cleanupInterval);
    }
    getEntry(hashKey) {
        return {
            blobFile: path.join(this.opts.cacheFolder, hashKey + ".blob"),
            metadataFile: path.join(this.opts.cacheFolder, hashKey + ".metadata")
        };
    }
    async get(hashKey) {
        var _a;
        const entry = this.getEntry(hashKey);
        const stat = await fsp.stat(entry.blobFile)
            .catch(err => {
            if (err.code == "ENOENT")
                return null;
            else
                throw err;
        });
        //if entry found on disk
        if (stat) {
            const now = Date.now();
            //if cache by access time
            if (this.opts.byAccessTime) {
                //if last accessed within TTL
                if (stat.atimeMs + this.opts.ttl > now) {
                    //update last accessed time at no more than max frequency
                    if (now - stat.atimeMs > ((_a = this.opts.accessTimeUpdateInterval) !== null && _a !== void 0 ? _a : 5 * 1000)) {
                        Promise.all([
                            fsp.utimes(entry.blobFile, new Date(), stat.mtime),
                            fsp.utimes(entry.metadataFile, new Date(), stat.mtime)
                        ])
                            .catch(console.error);
                    }
                    //return the existing entry
                    return entry;
                }
                //if TTL expired
                else {
                    //remove the entry
                    await Promise.all([
                        fsp.unlink(entry.blobFile),
                        fsp.unlink(entry.metadataFile)
                    ]);
                    //return not found
                    return undefined;
                }
            }
            //if cache by modified time
            else {
                //if last modified within TTL
                if (stat.mtimeMs + this.opts.ttl > now) {
                    //return the existing entry
                    return entry;
                }
                //if TTL expired
                else {
                    //remove the entry
                    await Promise.all([
                        fsp.unlink(entry.blobFile),
                        fsp.unlink(entry.metadataFile)
                    ]);
                    //return not found
                    return undefined;
                }
            }
        }
        //if entry not found on disk
        else {
            return undefined;
        }
    }
    async set(hashKey, value) {
        this.throttledCleanup();
        const entry = this.getEntry(hashKey);
        await Promise.all([
            fsp.writeFile(entry.blobFile, value.data),
            fsp.writeFile(entry.metadataFile, JSON.stringify(value.metadata || {}))
        ]);
        return entry;
    }
    async invalidate(hashKey) {
        const entry = this.getEntry(hashKey);
        await Promise.all([
            fsp.unlink(entry.blobFile),
            fsp.unlink(entry.metadataFile)
        ]);
    }
    cleanup() {
        (0, child_process_1.execFile)("find", [
            "-H", this.opts.cacheFolder,
            "-type", "f",
            "-not", this.opts.byAccessTime ? "-newerat" : "-newermt", Math.ceil(this.opts.ttl / 1000) + " seconds ago",
            "-delete"
        ], this.printExecError);
    }
    printExecError(err, stdout, stderr) {
        if (err || stderr)
            console.error(err || stderr);
    }
}
exports.DiskCache = DiskCache;
