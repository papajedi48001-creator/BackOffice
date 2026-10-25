import QRCode from 'qrcode';
import type { LabelLot } from '@backoffice/core';
import type { PrintableLabel } from './label-sheet';

/** Server side: one QR per lot, encoding only the lot code. */
export function printableLabels(lots: LabelLot[]): Promise<PrintableLabel[]> {
  return Promise.all(lots.map(async (lot) => ({ lot, svg: await QRCode.toString(lot.lotCode, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }) })));
}
