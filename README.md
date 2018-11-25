# simple-cache
Memory, disk, and S3 cache implementations with simple TTL.

For use with [multilayer-async-cache-builder](https://github.com/ken107/multilayer-async-cache-builder)

## Install
```
npm i ssh://github.com/ken107/simple-cache
```

## Example
Create a 3-layer cache:

Layer | Type   | Info
------|--------|---------------------------------------------
1     | Memory | ttl: 60 seconds, cleanupInterval: 60 seconds
2     | Disk   | ttl: 1 hour, cleanupInterval: 15 minutes
3     | S3     | ttl: (use bucket lifecycle rules)

```typescript
import { Fetch } from "multilayer-async-cache-builder"
import { MemCache, DiskCache, S3Cache } from "simple-cache"

const s3: AWS.S3;
const fetchItem: (id: string) => Promise<{data: Buffer, metadata: any}>;

const getItem = new Fetch(fetchItem)
  .cache(new S3Cache(s3, "my-bucket"))
  .cache(new DiskCache("path/to/cache/folder", ms("1 hour"), ms("15 minutes")))
  .cache(new MemCache(ms("1 minute"), ms("1 minute")))
  .dedupe()

//use
getItem("item-id").then(useItem);
```
