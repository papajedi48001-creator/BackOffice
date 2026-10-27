import type { UploadAttachmentInput } from '@backoffice/contracts';

export type ScanStatus = 'CLEAN' | 'INFECTED' | 'UNAVAILABLE';
export interface MalwareScanner { scan(input: UploadAttachmentInput): Promise<ScanStatus>; }

export class ScanService {
  constructor(private readonly scanner: MalwareScanner) {}
  /** Fails closed: anything but CLEAN stops the upload, naming whether the file or the scanner is the problem. */
  async ensureClean(input: UploadAttachmentInput): Promise<'CLEAN'> {
    const status = await this.scanner.scan(input);
    if (status === 'INFECTED') throw new Error('FILE_INFECTED');
    if (status !== 'CLEAN') throw new Error('SCAN_UNAVAILABLE');
    return status;
  }
}
