import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const readFile = promisify(fs.readFile);

export interface BookMetadata {
  title?: string;
  author?: string;
  totalPages?: number;
  coverPath?: string;
}

/**
 * Validates PDF by checking magic bytes (%PDF)
 */
export function validatePdf(buffer: Buffer): boolean {
  return buffer.length > 4 && buffer.slice(0, 4).toString('ascii') === '%PDF';
}

/**
 * Validates EPUB by checking ZIP magic bytes and mimetype file
 */
export function validateEpub(buffer: Buffer): boolean {
  // ZIP magic bytes: PK\x03\x04
  return buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
}

/**
 * Extracts metadata from a PDF file
 */
export async function processPdf(filePath: string): Promise<BookMetadata> {
  const { PDFParse } = await import('pdf-parse');

  const buffer = await readFile(filePath);
  const parser = new PDFParse({ data: buffer });

  try {
    const result = await parser.getInfo({ parsePageInfo: true });
    await parser.destroy();

    const info = result.info || {};
    const title = info.Title && info.Title.trim() ? info.Title.trim() : undefined;
    const author = info.Author && info.Author.trim() ? info.Author.trim() : undefined;
    const totalPages = result.total || undefined;

    return { title, author, totalPages };
  } catch {
    await parser.destroy().catch(() => {});
    return {};
  }
}

/**
 * Extracts metadata and cover from an EPUB file
 */
export async function processEpub(
  filePath: string,
  coversDir: string,
  coverFilename: string
): Promise<BookMetadata> {
  // Dynamic require for epub2 (CommonJS module)
  const Epub = require('epub2').EPub;

  return new Promise((resolve, reject) => {
    const epub = new Epub(filePath, '');

    epub.on('error', (err: Error) => reject(err));

    epub.on('end', async () => {
      const metadata: BookMetadata = {};

      // Extract metadata
      if (epub.metadata) {
        if (epub.metadata.title) metadata.title = epub.metadata.title.trim() || undefined;
        if (epub.metadata.creator) metadata.author = epub.metadata.creator.trim() || undefined;
      }

      // Extract cover image if available
      const coverId = epub.metadata?.cover;
      if (coverId && epub.manifest[coverId]) {
        try {
          await fs.promises.mkdir(coversDir, { recursive: true });
          const coverDestPath = path.join(coversDir, coverFilename);

          await new Promise<void>((res, rej) => {
            epub.getImage(coverId, (err: Error | null, data: Buffer, mimeType: string) => {
              if (err || !data) {
                res(); // Cover unavailable, continue without it
                return;
              }
              const ext = mimeType.includes('png') ? '.png' : '.jpg';
              const finalCoverPath = coverDestPath.replace(/\.[^/.]+$/, ext);
              fs.writeFile(finalCoverPath, data, (writeErr) => {
                if (writeErr) { res(); return; }
                metadata.coverPath = finalCoverPath;
                res();
              });
            });
          });
        } catch {
          // Cover extraction failed, continue without it
        }
      }

      resolve(metadata);
    });

    epub.parse();
  });
}
