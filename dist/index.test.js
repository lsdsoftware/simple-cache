"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("./index");
const fsp = require("fs/promises");
const path = require("path");
const util_1 = require("util");
const assert = require("assert");
const cacheFolder = "test-cache";
let cache;
async function run(suites) {
    try {
        await fsp.mkdir(cacheFolder);
        for (const [suiteName, suite] of Object.entries(suites)) {
            for (const [testName, test] of Object.entries(suite))
                if (!testName.startsWith("_")) {
                    console.log("Running", suiteName, testName);
                    await suite._beforeEach();
                    await test.call(suite);
                }
        }
    }
    finally {
        await fsp.rm(cacheFolder, { recursive: true });
    }
}
async function expectEquals(entry, expect) {
    assert(entry == undefined && expect == undefined
        || entry != undefined && expect != undefined && entry.blobFile == expect.blobFile && entry.metadataFile == expect.metadataFile);
}
async function expectExists(entry, data, metadata) {
    assert(await fsp.readFile(entry.blobFile, "utf8").catch(err => null) == data);
    assert(await fsp.readFile(entry.metadataFile, "utf8").catch(err => null) == metadata);
}
async function expectNotExists(entry) {
    assert(await fsp.readFile(entry.blobFile, "utf8").catch(err => null) == null);
    assert(await fsp.readFile(entry.metadataFile, "utf8").catch(err => null) == null);
}
async function expectAccessed(entry, time) {
    const [blobStat, metadataStat] = await Promise.all([
        fsp.stat(entry.blobFile),
        fsp.stat(entry.metadataFile)
    ]);
    assert(Math.abs(blobStat.atimeMs - time) < 20);
    assert(Math.abs(metadataStat.atimeMs - time) < 20);
}
const byModifiedTime = {
    _beforeEach() {
        cache = new index_1.DiskCache({ cacheFolder, ttl: 1000, cleanupInterval: 2000 });
    },
    async getExistingEntry() {
        const entry = await cache.set("1", { data: Buffer.from("one"), metadata: { spanish: "uno" } });
        await expectEquals(entry, {
            blobFile: path.join(cacheFolder, "1.blob"),
            metadataFile: path.join(cacheFolder, "1.metadata")
        });
        await expectEquals(await cache.get("1"), entry);
        await expectExists(entry, "one", "{\"spanish\":\"uno\"}");
    },
    async getNonExistingEntry() {
        await expectEquals(await cache.get("2"), undefined);
    },
    async getExpiredEntryBeforeCleanup() {
        const entry = await cache.set("3", { data: Buffer.from("three"), metadata: { spanish: "tres" } });
        await (0, util_1.promisify)(setTimeout)(900);
        // access the entry before ttl expires (900 < 1000)
        await expectEquals(await cache.get("3"), entry);
        await (0, util_1.promisify)(setTimeout)(200);
        await expectExists(entry, "three", "{\"spanish\":\"tres\"}");
        // access the entry after ttl expires (1100 > 1000)
        await expectEquals(await cache.get("3"), undefined);
        await (0, util_1.promisify)(setTimeout)(100);
        await expectNotExists(entry);
    },
    async getExpiredEntryAfterCleanup() {
        const entry = await cache.set("4", { data: Buffer.from("four"), metadata: { spanish: "cuatro" } });
        // Wait for the cleanup interval to expire
        await (0, util_1.promisify)(setTimeout)(2100);
        await expectExists(entry, "four", "{\"spanish\":\"cuatro\"}");
        // Trigger cleanup
        const entry2 = await cache.set("44", { data: Buffer.from("four four"), metadata: { spanish: "cuatro cuatro" } });
        // Wait for cleanup to complete
        await (0, util_1.promisify)(setTimeout)(750);
        await expectNotExists(entry);
        await expectEquals(await cache.get("4"), undefined);
        // Check that the new entry is still there
        await expectEquals(await cache.get("44"), entry2);
        await expectExists(entry2, "four four", "{\"spanish\":\"cuatro cuatro\"}");
    },
};
const byAccessTime = {
    _beforeEach() {
        cache = new index_1.DiskCache({
            cacheFolder,
            ttl: 2000,
            cleanupInterval: 3000,
            byAccessTime: true,
            accessTimeUpdateInterval: 1000
        });
    },
    async accessTimeIsUpdatedNoFasterThanInterval() {
        const entry = await cache.set("5", { data: Buffer.from("five"), metadata: { spanish: "cinco" } });
        const t1 = Date.now();
        await (0, util_1.promisify)(setTimeout)(900);
        await expectAccessed(entry, t1);
        // access before interval expires (900 < 1000), verify access time not updated
        await cache.get("5");
        await (0, util_1.promisify)(setTimeout)(200);
        await expectAccessed(entry, t1);
        // access after interval expires (1100 > 1000), verify access time updated
        const t2 = Date.now();
        await cache.get("5");
        await (0, util_1.promisify)(setTimeout)(200);
        await expectAccessed(entry, t2);
    },
    async accessCorrectlyPreventsEntryFromExpiring() {
        const entry = await cache.set("6", { data: Buffer.from("six"), metadata: { spanish: "seis" } });
        const t1 = Date.now();
        await (0, util_1.promisify)(setTimeout)(1900);
        await expectAccessed(entry, t1);
        // access before ttl expires (1900 < 2000), verify entry not expired
        await expectEquals(await cache.get("6"), entry);
        const t2 = Date.now();
        await (0, util_1.promisify)(setTimeout)(1900);
        await expectAccessed(entry, t2);
        // access before ttl expires (1900 < 2000), verify entry not expired
        await expectEquals(await cache.get("6"), entry);
        const t3 = Date.now();
        await (0, util_1.promisify)(setTimeout)(2100);
        await expectAccessed(entry, t3);
        // access after ttl expires (2100 > 2000), verify entry expired
        await expectEquals(await cache.get("6"), undefined);
        await (0, util_1.promisify)(setTimeout)(100);
        await expectNotExists(entry);
    },
    async cleanupByAccessTime() {
        const entry = await cache.set("7", { data: Buffer.from("seven"), metadata: { spanish: "siete" } });
        const entry2 = await cache.set("77", { data: Buffer.from("seven seven"), metadata: { spanish: "siete siete" } });
        const t1 = Date.now();
        // Access entry2 before TTL expires
        await (0, util_1.promisify)(setTimeout)(1900);
        await cache.get("77");
        const t2 = Date.now();
        // Wait for the cleanup interval to expire
        await (0, util_1.promisify)(setTimeout)(1200);
        await expectAccessed(entry, t1);
        await expectAccessed(entry2, t2);
        // Trigger cleanup
        const entry3 = await cache.set("777", { data: Buffer.from("seven seven seven"), metadata: { spanish: "siete siete siete" } });
        // Wait for cleanup to complete
        await (0, util_1.promisify)(setTimeout)(750);
        await expectNotExists(entry);
        await expectEquals(await cache.get("7"), undefined);
        // Check that the other entries are still there
        await expectExists(entry2, "seven seven", "{\"spanish\":\"siete siete\"}");
        await expectEquals(await cache.get("77"), entry2);
        await expectExists(entry3, "seven seven seven", "{\"spanish\":\"siete siete siete\"}");
        await expectEquals(await cache.get("777"), entry3);
    },
};
run({ byModifiedTime, byAccessTime })
    .catch(console.error);
