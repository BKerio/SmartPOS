import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

/**
 * Neon Object Storage (S3-compatible), declared in ../../neon.ts.
 *
 * Credentials come from the AWS-standard variables Neon provides (`neon deploy` / `neon env pull`
 * write them to the repo-root .env.local, which lib/env.ts loads):
 *   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_ENDPOINT_URL_S3, AWS_REGION
 * They are branch-scoped, so a Neon preview branch gets its own copy of the bucket.
 */

/** Public-read bucket for menu item photos (see neon.ts). */
export const MENU_IMAGES_BUCKET = 'menu-images';

const REQUIRED = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_ENDPOINT_URL_S3', 'AWS_REGION'] as const;

export function getStorageConfigError(): string | null {
  const missing = REQUIRED.filter((name) => !process.env[name]?.trim());
  if (missing.length === 0) return null;
  return `Neon object storage is not configured (missing ${missing.join(', ')}). Run \`neon env pull\` in the repo root.`;
}

let client: S3Client | null = null;

function s3(): S3Client {
  // Endpoint, region and credentials are read from the AWS_* environment variables.
  // Neon only supports path-style addressing.
  client ??= new S3Client({ forcePathStyle: true });
  return client;
}

/** Anonymous URL of an object in a public_read bucket: <endpoint>/<bucket>/<key>. */
export function publicObjectUrl(bucket: string, key: string): string {
  const endpoint = (process.env.AWS_ENDPOINT_URL_S3 || '').replace(/\/+$/, '');
  return `${endpoint}/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

/** Uploads an object and returns its public URL (for public_read buckets). */
export async function putPublicObject(
  bucket: string,
  key: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  await s3().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      // Keys are unique per upload, so the object never changes and can be cached for good.
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );
  return publicObjectUrl(bucket, key);
}

export async function deleteObject(bucket: string, key: string): Promise<void> {
  await s3().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
