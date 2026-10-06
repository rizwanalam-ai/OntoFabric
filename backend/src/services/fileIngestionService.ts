import path from 'node:path';

import pdfParse from 'pdf-parse';
import * as XLSX from 'xlsx';
import WordExtractor from 'word-extractor';

import type { SourceSystem } from '@ontofabric/shared/types.js';

export type FileSourceType = Extract<SourceSystem, 'EXCEL' | 'CSV' | 'PDF' | 'WORD'>;

const extensionMap: Record<string, FileSourceType> = {
  '.xls': 'EXCEL',
  '.xlsx': 'EXCEL',
  '.csv': 'CSV',
  '.pdf': 'PDF',
  '.doc': 'WORD',
  '.docx': 'WORD'
};

export const getFileSourceType = (fileName: string): FileSourceType => {
  const extension = path.extname(fileName).toLowerCase();
  const sourceType = extensionMap[extension];
  if (!sourceType) throw new Error('Unsupported file type. Choose PDF, Excel, CSV, or Word.');
  return sourceType;
};

const parseCsv = (buffer: Buffer, fileName: string) => {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheets = workbook.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[name], { defval: null })
  }));
  return { filePath: fileName, sheets };
};

export const parseUploadedFile = async (
  buffer: Buffer,
  fileName: string,
  sourceTypeOverride?: FileSourceType
): Promise<{ sourceType: FileSourceType; parsedSource: unknown; fileName: string }> => {
  const sourceType = sourceTypeOverride ?? getFileSourceType(fileName);
  if (sourceType === 'CSV') return { sourceType, parsedSource: parseCsv(buffer, fileName), fileName };
  if (sourceType === 'WORD') {
    const document = await new WordExtractor().extract(buffer);
    return { sourceType, parsedSource: { filePath: fileName, text: document.getBody() }, fileName };
  }
  if (sourceType === 'PDF') {
    const parsed = await pdfParse(buffer);
    return { sourceType, parsedSource: { filePath: fileName, text: parsed.text, pageCount: parsed.numpages }, fileName };
  }

  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheets = workbook.SheetNames.map((sheetName) => ({
    name: sheetName,
    rows: XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: null })
  }));
  return { sourceType, parsedSource: { filePath: fileName, sheets }, fileName };
};
