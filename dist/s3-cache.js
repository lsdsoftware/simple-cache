"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.S3Cache = void 0;
class S3Cache {
    constructor(s3, bucket, prefix = "") {
        this.s3 = s3;
        this.bucket = bucket;
        this.prefix = prefix;
    }
    async get(hashKey) {
        const req = {
            Bucket: this.bucket,
            Key: this.prefix + hashKey,
        };
        try {
            const res = await this.s3.getObject(req).promise();
            return {
                data: res.Body,
                metadata: res.Metadata
            };
        }
        catch (err) {
            if (err.code == "NoSuchKey" || err.code == "NotFound")
                return undefined;
            else
                throw err;
        }
    }
    async set(hashKey, value) {
        const req = {
            Bucket: this.bucket,
            Key: this.prefix + hashKey,
            Body: value.data,
            Metadata: value.metadata,
        };
        await this.s3.putObject(req).promise();
    }
    async invalidate(hashKey) {
        const req = {
            Bucket: this.bucket,
            Key: this.prefix + hashKey
        };
        await this.s3.deleteObject(req).promise();
    }
}
exports.S3Cache = S3Cache;
