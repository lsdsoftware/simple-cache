import { S3 } from "aws-sdk";
import { Cache } from "multilayer-async-cache-builder";
import { BinaryData } from "./common";
export declare class S3Cache implements Cache<BinaryData> {
    private readonly s3;
    private readonly bucket;
    private readonly prefix;
    constructor(s3: S3, bucket: string, prefix?: string);
    get(hashKey: string): Promise<BinaryData | undefined>;
    set(hashKey: string, value: BinaryData): Promise<void>;
    invalidate(hashKey: string): Promise<void>;
}
