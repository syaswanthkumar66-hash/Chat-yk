import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME;

let s3Client: S3Client | null = null;

export function getS3Client(): S3Client {
  if (!s3Client) {
    if (!accountId || !accessKeyId || !secretAccessKey) {
      throw new Error("Cloudflare R2 credentials are not configured.");
    }
    s3Client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }
  return s3Client;
}

export async function uploadFile(file: Buffer, fileName: string, contentType: string) {
  const client = getS3Client();
  if (!bucketName) throw new Error("R2 bucket name is not configured.");

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: fileName,
    Body: file,
    ContentType: contentType,
  });

  await client.send(command);
  
  // Return a signed URL or public URL if configured
  // For R2, if you have a custom domain, you'd use that.
  // Otherwise, you can use a signed URL for temporary access.
  const getCommand = new GetObjectCommand({
    Bucket: bucketName,
    Key: fileName,
  });
  
  return await getSignedUrl(client, getCommand, { expiresIn: 3600 * 24 * 7 }); // 7 days
}

export async function deleteFile(fileName: string) {
  const client = getS3Client();
  if (!bucketName) throw new Error("R2 bucket name is not configured.");

  const command = new DeleteObjectCommand({
    Bucket: bucketName,
    Key: fileName,
  });

  await client.send(command);
}
