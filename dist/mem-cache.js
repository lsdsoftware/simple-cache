"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemCache = void 0;
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
