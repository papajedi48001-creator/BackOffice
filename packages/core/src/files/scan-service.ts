import type { UploadAttachmentInput } from '@backoffice/contracts';

export type ScanStatus = 'CLEAN' | 'INFECTED' | 'UNAVAILABLE';
export interface MalwareScanner { scan(input: UploadAttachmentInput): Promise<ScanStatus>; }

export class ScanService {
  constructor(private readonly scanner: MalwareScanner) {}
  async ensureClean(input: UploadAttachmentInput): Promise<void> {
    if (await this.scanner.scan(input) !== 'CLEAN') throw new Error('MALWARE_SCAN_REQUIRED');
  }
}
