import { DiskCache, DiskCacheEntry } from "./index"
import * as fsp from "fs/promises"
import * as path from "path"
import { promisify } from "util"

const cacheFolder = "test-cache"

jest.setTimeout(10*1000)

beforeAll(async () => {
    await fsp.mkdir(cacheFolder)
})

afterAll(async () => {
    await fsp.rmdir(cacheFolder, { recursive: true })
})

async function expectExists(entry: DiskCacheEntry, data: string, metadata: string) {
    await expect(fsp.readFile(entry.blobFile, "utf8")).resolves.toBe(data)
    await expect(fsp.readFile(entry.metadataFile, "utf8")).resolves.toBe(metadata)
}

async function expectNotExists(entry: DiskCacheEntry) {
    await expect(fsp.readFile(entry.blobFile, "utf8")).rejects.toThrow()
    await expect(fsp.readFile(entry.metadataFile, "utf8")).rejects.toThrow()
}

async function getAge(file: string) {
    const stat = await fsp.stat(file)
    return Date.now() - stat.mtimeMs
}

async function expectAge(entry: DiskCacheEntry, targetAge: number) {
    const blobAge = await getAge(entry.blobFile)
    expect(blobAge).toBeGreaterThan(targetAge - 30)
    expect(blobAge).toBeLessThan(targetAge + 30)

    const metadataAge = await getAge(entry.metadataFile)
    expect(metadataAge).toBeGreaterThan(targetAge - 30)
    expect(metadataAge).toBeLessThan(targetAge + 30)
}



describe("by modified time", () => {
    let cache: DiskCache<string>

    beforeEach(async () => {
        cache = new DiskCache({cacheFolder, ttl: 1000, cleanupInterval: 2000})
    })

    test("get existing entry", async () => {
        const entry = await cache.set("1", {data: Buffer.from("one"), metadata: {spanish: "uno"}})
        expect(entry).toEqual({
            blobFile: path.join(cacheFolder, "1.blob"),
            metadataFile: path.join(cacheFolder, "1.metadata")
        })
        await expect(cache.get("1")).resolves.toEqual(entry)
        await expectExists(entry, "one", "{\"spanish\":\"uno\"}")
    })

    test("get nonexisting entry", async () => {
        expect(await cache.get("2")).toBeUndefined()
    })

    test("get expired entry before cleanup", async () => {
        const entry = await cache.set("3", {data: Buffer.from("three"), metadata: {spanish: "tres"}})
        await promisify(setTimeout)(900)

        // access the entry before ttl expires (900 < 1000)
        await expect(cache.get("3")).resolves.toEqual(entry)
        await promisify(setTimeout)(200)
        await expectExists(entry, "three", "{\"spanish\":\"tres\"}")

        // access the entry after ttl expires (1100 > 1000)
        await expect(cache.get("3")).resolves.toBeUndefined()
        await promisify(setTimeout)(100)
        await expectNotExists(entry)
    })

    test("get expired entry after cleanup", async () => {
        const entry = await cache.set("4", {data: Buffer.from("four"), metadata: {spanish: "cuatro"}})
        
        // Wait for the cleanup interval to expire
        await promisify(setTimeout)(2100)
        await expectExists(entry, "four", "{\"spanish\":\"cuatro\"}")

        // Trigger cleanup
        const entry2 = await cache.set("44", {data: Buffer.from("four four"), metadata: {spanish: "cuatro cuatro"}})
        
        // Wait for cleanup to complete
        await promisify(setTimeout)(100)
        await expectNotExists(entry)
        await expect(cache.get("4")).resolves.toBeUndefined()

        // Check that the new entry is still there
        await expect(cache.get("44")).resolves.toEqual(entry2)
        await expectExists(entry2, "four four", "{\"spanish\":\"cuatro cuatro\"}")
    })
})



describe("by access time", () => {
    let cache: DiskCache<string>

    beforeEach(async () => {
        cache = new DiskCache({
            cacheFolder,
            ttl: 2000,
            cleanupInterval: 3000,
            byAccessTime: true,
            accessTimeUpdateInterval: 1000
        })
    })

    test("access time is updated no faster than interval", async () => {
        const entry = await cache.set("5", {data: Buffer.from("five"), metadata: {spanish: "cinco"}})
        const t1 = Date.now()
        await promisify(setTimeout)(900)
        await expectAge(entry, Date.now() - t1)

        // access before interval expires (900 < 1000), verify access time not updated
        await cache.get("5")
        await promisify(setTimeout)(200)
        await expectAge(entry, Date.now() - t1)

        // access after interval expires (1100 > 1000), verify access time updated
        await cache.get("5")
        const t2 = Date.now()
        await promisify(setTimeout)(200)
        await expectAge(entry, Date.now() - t2)
    })

    test("access correctly prevents entry from expiring", async () => {
        const entry = await cache.set("6", {data: Buffer.from("six"), metadata: {spanish: "seis"}})
        const t1 = Date.now()
        await promisify(setTimeout)(1900)
        await expectAge(entry, Date.now() - t1)

        // access before ttl expires (1900 < 2000), verify entry not expired
        await expect(cache.get("6")).resolves.toEqual(entry)
        const t2 = Date.now()
        await promisify(setTimeout)(1900)
        await expectAge(entry, Date.now() - t2)

        // access before ttl expires (1900 < 2000), verify entry not expired
        await expect(cache.get("6")).resolves.toEqual(entry)
        const t3 = Date.now()
        await promisify(setTimeout)(2100)
        await expectAge(entry, Date.now() - t3)

        // access after ttl expires (2100 > 2000), verify entry expired
        await expect(cache.get("6")).resolves.toBeUndefined()
        await promisify(setTimeout)(100)
        await expectNotExists(entry)
    })
})
