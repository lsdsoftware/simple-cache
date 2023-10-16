# simple-cache
Memory and disk cache implementations with simple TTL.

For use with [multilayer-async-cache-builder](https://github.com/ken107/multilayer-async-cache-builder)

## Install
```
npm i @lsdsoftware/simple-cache
```

## Example
Create a 2-layer cache:

Layer | Type   | Info
------|--------|---------------------------------------------
1     | Memory | ttl: 60 seconds, cleanupInterval: 60 seconds
2     | Disk   | ttl: 1 hour, cleanupInterval: 15 minutes

```typescript
import { Fetch } from "multilayer-async-cache-builder"
import { MemCache, DiskCache } from "@lsdsoftware/simple-cache"

//define your fetch function
const fetchItem: (id: string) => Promise<{data: Buffer, metadata: any}>

const getItem = new Fetch(fetchItem)
  .cache(new DiskCache("path/to/cache/folder", ms("1 hour"), ms("15 minutes")))
  .cache(new MemCache(ms("1 minute"), ms("1 minute")))
  .dedupe()

//use
getItem("item-id").then(useItem);
```
