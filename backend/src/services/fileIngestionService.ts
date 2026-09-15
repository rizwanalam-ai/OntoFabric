import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import mammoth from 'mammoth';
import * as XLSX from 'xlsx';

import { callExcelParser, callPdfParser } from '../mcpClient.js';
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

export const parseUploadedFile = async (buffer: Buffer, fileName: string): Promise<{ sourceType: FileSourceType; parsedSource: unknown; fileName: string }> => {
  const sourceType = getFileSourceType(fileName);
  if (sourceType === 'CSV') return { sourceType, parsedSource: parseCsv(buffer, fileName), fileName };
  if (sourceType === 'WORD') {
    const result = await mammoth.extractRawText({ buffer });
    return { sourceType, parsedSource: { filePath: fileName, text: result.value }, fileName };
  }

  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'ontofabric-upload-'));
  const tempPath = path.join(tempDirectory, path.basename(fileName));
  try {
    await writeFile(tempPath, buffer);
    const parsedSource = sourceType === 'PDF' ? await callPdfParser(tempPath) : await callExcelParser(tempPath);
    return { sourceType, parsedSource, fileName };
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
};
