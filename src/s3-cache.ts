import { S3 } from "aws-sdk";
import { Cache } from "multilayer-async-cache-builder";
import { BinaryData } from "./common";


export class S3Cache implements Cache<BinaryData> {
  constructor(
    private readonly s3: S3,
    private readonly bucket: string,
    private readonly prefix: string = ""
  ) {
  }

  async get(hashKey: string): Promise<BinaryData|undefined> {
    const req = {
      Bucket: this.bucket,
      Key: this.prefix + hashKey,
    };
    try {
      const res = await this.s3.getObject(req).promise();
      return {
        data: <Buffer>res.Body,
        metadata: res.Metadata
      };
    }
    catch (err: any) {
      if (err.code == "NoSuchKey" || err.code == "NotFound") return undefined;
      else throw err;
    }
  }

  async set(hashKey: string, value: BinaryData) {
    const req = {
      Bucket: this.bucket,
      Key: this.prefix + hashKey,
      Body: value.data,
      Metadata: value.metadata,
    };
    await this.s3.putObject(req).promise();
  }

  async invalidate(hashKey: string) {
    const req = {
      Bucket: this.bucket,
      Key: this.prefix + hashKey
    };
    await this.s3.deleteObject(req).promise();
  }
}
