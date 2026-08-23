import ePub from 'epubjs';
import { db } from '../data/supabase';
import { triggerConversion } from '../data/ConversionTrigger';
import type { AuthManager } from '../auth/AuthManager';

const PALETTE = [
  '#2B2B2B', '#5F4B3C', '#3B4A3F', '#E88D56', '#C44943',
  '#2B3B4C', '#D1C9BE', '#DE8A75', '#D56E52', '#2A2A28',
  '#879B75', '#2659A5', '#E0B739', '#54407B', '#4B7A5C',
];

const ACCEPTED = ['epub', 'pdf', 'mobi', 'azw3', 'cbz', 'txt'] as const;
type Format = (typeof ACCEPTED)[number];

/** Formats no browser renders directly; a GitHub Action converts them. */
const NEEDS_CONVERSION: Format[] = ['mobi', 'azw3'];

function spineColorFor(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

/**
 * Adds a book to the library.
 *
 * Replaces the old flow entirely: no file is copied into the repo, nothing is
 * committed, and no build runs. The bytes go straight to the private bucket
 * and only a catalogue row lands in Postgres.
 */
export class UploadPanel {
  private panel: HTMLElement;
  private fileInput: HTMLInputElement;
  private titleInput: HTMLInputElement;
  private authorInput: HTMLInputElement;
  private categoryInput: HTMLInputElement;
  private status: HTMLElement;
  private submitBtn: HTMLButtonElement;

  private file: File | null = null;
  private coverBlob: Blob | null = null;

  private auth: AuthManager;
  private onUploaded: () => Promise<void>;

  constructor(
    auth: AuthManager,
    onUploaded: () => Promise<void>,
  ) {
    this.auth = auth;
    this.onUploaded = onUploaded;
    this.panel = document.getElementById('upload-panel') as HTMLElement;
    this.fileInput = document.getElementById('upload-file') as HTMLInputElement;
    this.titleInput = document.getElementById('upload-title') as HTMLInputElement;
    this.authorInput = document.getElementById('upload-author') as HTMLInputElement;
    this.categoryInput = document.getElementById('upload-category') as HTMLInputElement;
    this.status = document.getElementById('upload-status') as HTMLElement;
    this.submitBtn = document.getElementById('upload-submit-btn') as HTMLButtonElement;

    this.wire();
  }

  private wire(): void {
    document.getElementById('open-upload-btn')?.addEventListener('click', () => this.open());
    document.getElementById('close-upload-btn')?.addEventListener('click', () => this.close());
    this.fileInput.addEventListener('change', () => this.onFilePicked());
    this.submitBtn.addEventListener('click', () => this.submit());
  }

  public open(): void {
    if (!this.auth.isMember) return;
    this.reset();
    this.panel.classList.remove('hidden');
  }

  public close(): void {
    this.panel.classList.add('hidden');
  }

  private reset(): void {
    this.file = null;
    this.coverBlob = null;
    this.fileInput.value = '';
    this.titleInput.value = '';
    this.authorInput.value = '';
    this.categoryInput.value = '';
    this.status.textContent = '';
    this.submitBtn.disabled = false;
  }

  private formatOf(file: File): Format | null {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    return (ACCEPTED as readonly string[]).includes(ext) ? (ext as Format) : null;
  }

  /** Read real metadata out of the file instead of guessing from the filename. */
  private async onFilePicked(): Promise<void> {
    const file = this.fileInput.files?.[0];
    if (!file) return;

    const format = this.formatOf(file);
    if (!format) {
      this.status.textContent = `Unsupported file type. Accepted: ${ACCEPTED.join(', ')}.`;
      return;
    }

    this.file = file;
    this.coverBlob = null;

    // Sensible fallback if the file carries no metadata.
    this.titleInput.value = file.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();

    if (format !== 'epub') {
      this.status.textContent = NEEDS_CONVERSION.includes(format)
        ? `${format.toUpperCase()} will be converted to EPUB after upload.`
        : '';
      return;
    }

    this.status.textContent = 'Reading book details…';
    try {
      const buffer = await file.arrayBuffer();
      const book = ePub(buffer);
      const meta = await book.loaded.metadata;
      if (meta?.title) this.titleInput.value = meta.title;
      if (meta?.creator) this.authorInput.value = meta.creator;

      const coverUrl = await book.coverUrl();
      if (coverUrl) {
        this.coverBlob = await (await fetch(coverUrl)).blob();
      }
      book.destroy();
      this.status.textContent = this.coverBlob ? 'Found title, author, and cover.' : 'Found book details.';
    } catch (e) {
      console.warn('[upload] metadata read failed:', e);
      this.status.textContent = 'Could not read details — please fill them in.';
    }
  }

  private async submit(): Promise<void> {
    const supabase = db();
    if (!supabase || !this.file || !this.auth.isMember) return;

    const format = this.formatOf(this.file);
    if (!format) return;

    const title = this.titleInput.value.trim();
    if (!title) {
      this.status.textContent = 'A title is required.';
      return;
    }

    this.submitBtn.disabled = true;

    // One id serves as both the row key and the object key, so the row can be
    // written before the bytes exist without a second round trip.
    const id = crypto.randomUUID();
    const storageKey = `library/${id}.${format}`;

    try {
      let coverPath: string | null = null;
      if (this.coverBlob) {
        this.status.textContent = 'Uploading cover…';
        // Covers are the one book-derived asset that IS public — thumbnail
        // scale, and the whole point of the shelf being visible.
        const { error } = await supabase.storage
          .from('covers')
          .upload(`${id}.jpg`, this.coverBlob, { contentType: 'image/jpeg', upsert: true });
        if (error) console.warn('[upload] cover failed:', error.message);
        else {
          coverPath = supabase.storage.from('covers').getPublicUrl(`${id}.jpg`).data.publicUrl;
        }
      }

      this.status.textContent = 'Adding to catalogue…';
      const { error: insertError } = await supabase.from('books').insert({
        id,
        title,
        author: this.authorInput.value.trim() || 'Unknown Author',
        category: this.categoryInput.value.trim() || 'Uncategorized',
        format,
        spine_color: spineColorFor(title),
        cover_path: coverPath,
        storage_key: storageKey,
        file_size: this.file.size,
        is_public: false,
        added_by: this.auth.userId,
      });
      if (insertError) throw new Error(insertError.message);

      this.status.textContent = 'Uploading book…';
      const { error: uploadError } = await supabase.storage
        .from('books')
        .upload(storageKey, this.file, {
          contentType: this.file.type || 'application/octet-stream',
          upsert: false,
        });

      if (uploadError) {
        // Roll the row back so the shelf never shows a book with no bytes.
        await supabase.from('books').delete().eq('id', id);
        throw new Error(
          /exceeded the maximum allowed size/i.test(uploadError.message)
            ? 'File is larger than the 50MB bucket limit.'
            : uploadError.message,
        );
      }

      if (NEEDS_CONVERSION.includes(format)) {
        this.status.textContent = 'Uploaded — starting conversion…';
        const result = await triggerConversion(id);
        this.status.textContent = result.message;
        await this.onUploaded();
        setTimeout(() => this.close(), 2500);
      } else {
        this.status.textContent = 'Added to your shelf.';
        await this.onUploaded();
        setTimeout(() => this.close(), 1200);
      }
    } catch (e) {
      this.status.textContent = e instanceof Error ? e.message : 'Upload failed.';
      this.submitBtn.disabled = false;
    }
  }
}
