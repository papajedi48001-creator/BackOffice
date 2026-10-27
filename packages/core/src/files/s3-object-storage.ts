import { CreateBucketCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { PrivateObjectStorage } from './attachment-service';

export interface S3Settings { endpoint: string; bucket: string; region: string; accessKeyId: string; secretAccessKey: string }

/** Private objects in any S3-compatible store (SeaweedFS on the hospital server). Path-style, and the bucket is made on first use. */
export class S3ObjectStorage implements PrivateObjectStorage {
  private readonly client: S3Client;
  private bucketReady: Promise<void> | null = null;

  constructor(private readonly settings: S3Settings) {
    this.client = new S3Client({ endpoint: settings.endpoint, region: settings.region, forcePathStyle: true, credentials: { accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey } });
  }

  async putPrivate(objectKey: string, contentType: string, bytes: Uint8Array): Promise<void> {
    await this.ensureBucket();
    await this.client.send(new PutObjectCommand({ Bucket: this.settings.bucket, Key: objectKey, Body: bytes, ContentType: contentType, ContentLength: bytes.byteLength }));
  }

  async getPrivate(objectKey: string): Promise<Uint8Array> {
    const object = await this.client.send(new GetObjectCommand({ Bucket: this.settings.bucket, Key: objectKey }));
    if (!object.Body) throw new Error('OBJECT_EMPTY');
    return object.Body.transformToByteArray();
  }

  private ensureBucket(): Promise<void> {
    this.bucketReady ??= this.client.send(new HeadBucketCommand({ Bucket: this.settings.bucket })).then(() => undefined, async () => {
      await this.client.send(new CreateBucketCommand({ Bucket: this.settings.bucket }));
    }).catch((error: unknown) => { this.bucketReady = null; throw error; });
    return this.bucketReady;
  }
}
