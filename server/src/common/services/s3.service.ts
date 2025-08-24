import { Injectable, Logger } from '@nestjs/common';
import { S3Client, DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly region: string;
  private readonly presignExpiresSec: number;
  private readonly baseUrl?: string;

  constructor() {
    this.region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
    this.bucket = process.env.AWS_S3_BUCKET || '';
    this.presignExpiresSec = Number(process.env.AWS_S3_PRESIGN_EXPIRES || 900); // 15 minutes
    this.baseUrl = process.env.AWS_S3_BASE_URL;

    this.s3 = new S3Client({
      region: this.region,
      credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,
      } : undefined,
    });
  }

  public getBucket() {
    return this.bucket;
  }

  public buildPublicUrl(key: string): string {
    if (this.baseUrl) {
      return `${this.baseUrl.replace(/\/$/, '')}/${encodeURIComponent(key).replace(/%2F/g, '/')}`;
    }
    // Default virtual-hosted–style URL
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${encodeURIComponent(key).replace(/%2F/g, '/')}`;
  }

  public async getPresignedUploadUrl(key: string, contentType: string, expiresInSec?: number): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType || 'application/octet-stream',
    });
    return getSignedUrl(this.s3, command, { expiresIn: expiresInSec || this.presignExpiresSec });
  }

  public async getPresignedDownloadUrl(key: string, expiresInSec?: number): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.s3, command, { expiresIn: expiresInSec || this.presignExpiresSec });
  }

  public async deleteObject(key: string): Promise<void> {
    try {
      await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (err) {
      this.logger.warn(`Failed to delete S3 object ${key}: ${err?.message || err}`);
    }
  }
}
