/// <reference types="node" />
export interface BinaryData {
    data: Buffer;
    metadata?: {
        [key: string]: string;
    };
}
export type TtlSupplier<V> = (value: V) => number;
export declare function throttle(fn: () => void, interval: number): () => void;
