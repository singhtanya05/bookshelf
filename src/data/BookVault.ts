import { get, set, del, keys } from 'idb-keyval';
import { db } from './supabase';
import type { CatalogueEntry } from './Catalogue';

const CACHE_PREFIX = 'book-blob:';
const BUCKET = 'books';
/** Signed URLs are single-use in practice — short life, one book, one reader. */
const SIGNED_URL_TTL_SECONDS = 60;

/**
 * Fetches book bytes and caches them on-device.
 *
 * Private books are reached through a short-lived signed URL minted by
 * Supabase Storage, which issues one only if the caller's session passes the
 * bucket policy (members only). Public-domain books skip all of that and come
 * straight from the site, so the demo works with no account at all.
 *
 * The cache is what keeps bandwidth off the 5GB/month free allowance: a book
 * crosses the network once per device. It is also why `clearCache` runs on
 * sign-out — a cached book on a shared laptop would otherwise outlive the
 * session that earned it.
 */
export class BookVault {
  private objectUrls = new Map<string, string>();

  /** Raw bytes for a book, from cache when possible. */
  async blobFor(entry: CatalogueEntry, onProgress?: (pct: number) => void): Promise<Blob> {
    const cached = (await get(CACHE_PREFIX + entry.id)) as Blob | undefined;
    if (cached) return cached;

    const blob = await this.download(entry, onProgress);
    try {
      await set(CACHE_PREFIX + entry.id, blob);
    } catch (e) {
      // Quota exceeded is survivable — we just re-download next time.
      console.warn('[vault] could not cache book:', e);
    }
    return blob;
  }

  /**
   * Object URL, for pdf.js. epub.js must NOT use this: it infers the archive
   * type from the URL, and a blob: URL has no .epub extension, so it tries to
   * read the file as an unpacked directory and renders nothing. EPUBs go in
   * as an ArrayBuffer instead.
   */
  async urlFor(entry: CatalogueEntry, onProgress?: (pct: number) => void): Promise<string> {
    const existing = this.objectUrls.get(entry.id);
    if (existing) return existing;

    const blob = await this.blobFor(entry, onProgress);
    const url = URL.createObjectURL(blob);
    this.objectUrls.set(entry.id, url);
    return url;
  }

  private async download(entry: CatalogueEntry, onProgress?: (pct: number) => void): Promise<Blob> {
    const url = await this.resolveUrl(entry);
    const res = await fetch(url);

    if (res.status === 401 || res.status === 403) {
      throw new Error('You are not signed in to the reading circle.');
    }
    if (!res.ok) throw new Error(`Could not open this book (${res.status}).`);

    const total = Number(res.headers.get('Content-Length') ?? '0');
    if (!res.body || !total || !onProgress) return res.blob();

    // Stream so a large PDF shows real progress instead of a dead spinner.
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      onProgress(Math.round((received / total) * 100));
    }
    return new Blob(chunks as BlobPart[]);
  }

  private async resolveUrl(entry: CatalogueEntry): Promise<string> {
    // Public domain: bundled with the site, no session required.
    if (entry.is_public && entry.public_path) return entry.public_path;

    const supabase = db();
    if (!supabase) throw new Error('Library backend is not configured.');

    // Absent storage_key means the row came from the public view — i.e. the
    // caller is not a member. Say so plainly rather than failing obscurely.
    if (!entry.storage_key) {
      throw new Error('You are not signed in to the reading circle.');
    }

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(entry.storage_key, SIGNED_URL_TTL_SECONDS);

    if (error || !data?.signedUrl) {
      throw new Error(error?.message ?? 'Could not get access to this book.');
    }
    return data.signedUrl;
  }

  release(bookId: string): void {
    const url = this.objectUrls.get(bookId);
    if (url) {
      URL.revokeObjectURL(url);
      this.objectUrls.delete(bookId);
    }
  }

  /** Drop every cached book. Called on sign-out. */
  async clearCache(): Promise<void> {
    for (const [, url] of this.objectUrls) URL.revokeObjectURL(url);
    this.objectUrls.clear();
    const all = await keys();
    await Promise.all(
      all
        .filter((k) => typeof k === 'string' && k.startsWith(CACHE_PREFIX))
        .map((k) => del(k)),
    );
  }
}
