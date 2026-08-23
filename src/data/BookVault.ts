import { get, set, del, keys } from 'idb-keyval';
import { config } from './config';

const CACHE_PREFIX = 'book-blob:';

/**
 * Fetches book bytes through the vault worker and caches them on-device.
 *
 * The cache is what makes bandwidth a non-issue: a book crosses the network
 * once per device, then opens instantly and offline. It is also why
 * `clearCache` runs on sign-out — a cached book on a shared laptop would
 * otherwise outlive the session that earned it.
 */
export class BookVault {
  private objectUrls = new Map<string, string>();

  private tokenGetter: () => string | null;

  constructor(
    tokenGetter: () => string | null,
  ) {
    this.tokenGetter = tokenGetter;}

  /** Raw bytes for a book, from cache when possible. */
  async blobFor(bookId: string, onProgress?: (pct: number) => void): Promise<Blob> {
    let blob = (await get(CACHE_PREFIX + bookId)) as Blob | undefined;
    if (blob) return blob;

    blob = await this.download(bookId, onProgress);
    try {
      await set(CACHE_PREFIX + bookId, blob);
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
  async urlFor(bookId: string, onProgress?: (pct: number) => void): Promise<string> {
    const existing = this.objectUrls.get(bookId);
    if (existing) return existing;

    const blob = await this.blobFor(bookId, onProgress);
    const url = URL.createObjectURL(blob);
    this.objectUrls.set(bookId, url);
    return url;
  }

  private async download(bookId: string, onProgress?: (pct: number) => void): Promise<Blob> {
    // No vault configured: the only readable book is the bundled public-domain
    // demo, so serve it from the site itself.
    if (!config.vaultUrl) {
      const res = await fetch('books/demo.epub');
      if (!res.ok) throw new Error('Demo book unavailable.');
      return res.blob();
    }

    const token = this.tokenGetter();
    const res = await fetch(`${config.vaultUrl}/book/${bookId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (res.status === 401 || res.status === 403) {
      throw new Error('You are not signed in to the reading circle.');
    }
    if (!res.ok) {
      throw new Error(`Could not open this book (${res.status}).`);
    }

    const total = Number(res.headers.get('Content-Length') ?? '0');
    if (!res.body || !total || !onProgress) return res.blob();

    // Stream so a big PDF shows real progress instead of a dead spinner.
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
