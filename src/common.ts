
export interface BinaryData {
  data: Buffer;
  metadata?: {[key: string]: string};
}

export type TtlSupplier<V> = (value: V) => number

export function throttle(fn: () => void, interval: number) {
  let last = Date.now()
  return () => {
    const now = Date.now()
    if (now-last > interval) {
      last = now
      fn()
    }
  }
}
