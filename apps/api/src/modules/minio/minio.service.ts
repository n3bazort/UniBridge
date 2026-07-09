import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as Minio from 'minio';
import * as fs from 'fs';

@Injectable()
export class MinioService implements OnModuleInit {
  private readonly logger = new Logger(MinioService.name);
  private minioClient: Minio.Client;
  private readonly bucketName = 'unibridge-documents';
  private readonly isDisabled = process.env.DISABLE_MINIO === 'true';

  constructor() {
    if (this.isDisabled) {
      this.logger.warn('MinIO is disabled via DISABLE_MINIO env variable');
      return;
    }

    const endPoint = process.env.MINIO_ENDPOINT || 'localhost';
    const port = parseInt(process.env.MINIO_PORT || '9000', 10);
    const useSSL = process.env.MINIO_USE_SSL === 'true';
    const accessKey = process.env.MINIO_ACCESS_KEY;
    const secretKey = process.env.MINIO_SECRET_KEY;

    if (!accessKey || !secretKey) {
      this.logger.error('MINIO_ACCESS_KEY y MINIO_SECRET_KEY son requeridas cuando DISABLE_MINIO no está activo.');
      throw new Error('MinIO credentials not configured. Set MINIO_ACCESS_KEY and MINIO_SECRET_KEY env vars.');
    }

    this.minioClient = new Minio.Client({
      endPoint,
      port,
      useSSL,
      accessKey,
      secretKey,
    });
  }

  async onModuleInit() {
    if (this.isDisabled) return;
    try {
      const exists = await this.minioClient.bucketExists(this.bucketName);
      if (!exists) {
        await this.minioClient.makeBucket(this.bucketName, 'us-east-1');
        this.logger.log(`Bucket ${this.bucketName} created successfully.`);
        
        // Set public read policy so frontend can download files easily (for testing)
        const policy = {
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { AWS: ["*"] },
              Action: ["s3:GetObject"],
              Resource: [`arn:aws:s3:::${this.bucketName}/*`]
            }
          ]
        };
        await this.minioClient.setBucketPolicy(this.bucketName, JSON.stringify(policy));
      }
    } catch (error) {
      this.logger.error('Error initializing MinIO:', error);
    }
  }

  async uploadFile(filePath: string, destFileName: string, mimetype: string): Promise<string> {
    if (this.isDisabled) return `/mock-uploads/${destFileName}`;
    try {
      const fileStream = fs.createReadStream(filePath);
      const stat = fs.statSync(filePath);

      await this.minioClient.putObject(
        this.bucketName,
        destFileName,
        fileStream,
        stat.size,
        { 'Content-Type': mimetype }
      );

      // Return the public URL
      const endpoint = process.env.MINIO_ENDPOINT || 'localhost';
      const port = process.env.MINIO_PORT || '9000';
      return `http://${endpoint}:${port}/${this.bucketName}/${destFileName}`;
    } catch (error) {
      this.logger.error('Error uploading file to MinIO', error);
      throw error;
    }
  }

  async uploadBuffer(buffer: Buffer, destFileName: string, mimetype: string): Promise<string> {
    if (this.isDisabled) return `/mock-uploads/${destFileName}`;
    try {
      await this.minioClient.putObject(
        this.bucketName,
        destFileName,
        buffer,
        buffer.length,
        { 'Content-Type': mimetype }
      );

      const endpoint = process.env.MINIO_ENDPOINT || 'localhost';
      const port = process.env.MINIO_PORT || '9000';
      return `http://${endpoint}:${port}/${this.bucketName}/${destFileName}`;
    } catch (error) {
      this.logger.error('Error uploading buffer to MinIO', error);
      throw error;
    }
  }
}
