import { Effect } from 'effect';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { mkdir, open, rename, readFile, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { settings, MailError } from './config';

function pathFor(key: string) {
  if (!/^[a-z0-9/-]+$/.test(key) || key.includes('..')) throw new Error('Invalid storage key');
  return resolve(settings().dataDir, 'objects', key);
}

function s3() {
  const c = settings();
  return new S3Client({
    region: c.s3Region, endpoint: c.s3Endpoint, forcePathStyle: !!c.s3Endpoint,
    credentials: c.s3AccessKey && c.s3SecretKey ? { accessKeyId: c.s3AccessKey, secretAccessKey: c.s3SecretKey } : undefined
  });
}

const storageError = () => new MailError({ status: 503, message: 'Message storage is temporarily unavailable' });

export const putObject = (key: string, bytes: Uint8Array) => Effect.tryPromise({
  try: async () => {
    pathFor(key);
    if (settings().s3Bucket) {
      const client = s3();
      try { await client.send(new PutObjectCommand({ Bucket: settings().s3Bucket, Key: key, Body: bytes })); }
      finally { client.destroy(); }
      return;
    }
    const destination = pathFor(key);
    await mkdir(dirname(destination), { recursive: true });
    const temporary = `${destination}-${randomUUID()}`;
    const file = await open(temporary, 'wx', 0o600);
    try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
    await rename(temporary, destination);
    const stop = dirname(resolve(settings().dataDir));
    let current = dirname(destination);
    while (true) {
      const directory = await open(current, 'r');
      try { await directory.sync(); } finally { await directory.close(); }
      if (current === stop || current === dirname(current)) break;
      current = dirname(current);
    }
  },
  catch: storageError
});

export const getObject = (key: string) => Effect.tryPromise({
  try: async () => {
    pathFor(key);
    if (!settings().s3Bucket) return new Uint8Array(await readFile(pathFor(key)));
    const client = s3();
    try {
      const response = await client.send(new GetObjectCommand({ Bucket: settings().s3Bucket, Key: key }));
      if (!response.Body) throw new Error('Empty storage response');
      return await response.Body.transformToByteArray();
    } finally { client.destroy(); }
  },
  catch: storageError
});

export const deleteObject = (key: string) => Effect.tryPromise({
  try: async () => {
    pathFor(key);
    if (!settings().s3Bucket) { await unlink(pathFor(key)); return; }
    const client = s3();
    try { await client.send(new DeleteObjectCommand({ Bucket: settings().s3Bucket, Key: key })); }
    finally { client.destroy(); }
  },
  catch: storageError
});
