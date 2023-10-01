import { execFile, ExecFileException } from "child_process";
import * as fs from "fs";
import * as fsp from "fs/promises";
import { CacheX } from "multilayer-async-cache-builder";
import * as path from "path";
import { BinaryData, throttle } from "./common";

export interface DiskCacheEntry {
  blobFile: string
  metadataFile: string
}

interface DiskCacheOptions {
  cacheFolder: string
  ttl: number
  cleanupInterval: number
  byAccessTime?: boolean
  accessTimeUpdateInterval?: number
}


export class DiskCache implements CacheX<BinaryData, DiskCacheEntry> {
  private readonly throttledCleanup: () => void

  constructor(private readonly opts: DiskCacheOptions) {
    fs.statSync(opts.cacheFolder)
    this.throttledCleanup = throttle(this.cleanup.bind(this), opts.cleanupInterval)
  }

  private getEntry(hashKey: string): DiskCacheEntry {
    return {
      blobFile: path.join(this.opts.cacheFolder, hashKey + ".blob"),
      metadataFile: path.join(this.opts.cacheFolder, hashKey + ".metadata")
    }
  }

  async get(hashKey: string): Promise<DiskCacheEntry|undefined> {
    const entry = this.getEntry(hashKey)
    const stat = await fsp.stat(entry.blobFile)
      .catch(err => {
        if (err.code == "ENOENT") return null
        else throw err
      })

    //if entry found on disk
    if (stat) {
      const now = Date.now()

      //if cache by access time
      if (this.opts.byAccessTime) {

        //if last accessed within TTL
        if (stat.atimeMs + this.opts.ttl > now) {
          //update last accessed time at no more than max frequency
          if (now - stat.atimeMs > (this.opts.accessTimeUpdateInterval ?? 5*1000)) {
            Promise.all([
              fsp.utimes(entry.blobFile, new Date(), stat.mtime),
              fsp.utimes(entry.metadataFile, new Date(), stat.mtime)
            ])
            .catch(console.error)
          }
          //return the existing entry
          return entry
        }

        //if TTL expired
        else {
          //remove the entry
          await Promise.all([
            fsp.unlink(entry.blobFile),
            fsp.unlink(entry.metadataFile)
          ])
          //return not found
          return undefined
        }
      }

      //if cache by modified time
      else {

        //if last modified within TTL
        if (stat.mtimeMs + this.opts.ttl > now) {
          //return the existing entry
          return entry
        }

        //if TTL expired
        else {
          //remove the entry
          await Promise.all([
            fsp.unlink(entry.blobFile),
            fsp.unlink(entry.metadataFile)
          ])
          //return not found
          return undefined
        }
      }
    }

    //if entry not found on disk
    else {
      return undefined
    }
  }

  async set(hashKey: string, value: BinaryData): Promise<DiskCacheEntry> {
    this.throttledCleanup()
    const entry = this.getEntry(hashKey)
    await Promise.all([
      fsp.writeFile(entry.blobFile, value.data),
      fsp.writeFile(entry.metadataFile, JSON.stringify(value.metadata || {}))
    ])
    return entry
  }

  async invalidate(hashKey: string) {
    const entry = this.getEntry(hashKey)
    await Promise.all([
      fsp.unlink(entry.blobFile),
      fsp.unlink(entry.metadataFile)
    ])
  }

  private cleanup() {
    //console.debug("Cleaning up", this.opts.cacheFolder)
    execFile("find", [
      "-H", this.opts.cacheFolder,
      "-type", "f",
      "-not", this.opts.byAccessTime ? "-newerat" : "-newermt", Math.ceil(this.opts.ttl /1000) + " seconds ago",
      "-delete",
      //"-print",
    ], this.printExecError)
  }

  private printExecError(err: ExecFileException|null, stdout: string, stderr: string) {
    //console.debug(stdout)
    if (err || stderr) console.error(err || stderr)
  }
}
