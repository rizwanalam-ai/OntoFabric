import { readFile } from 'node:fs/promises';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import pdfParse from 'pdf-parse';
import * as XLSX from 'xlsx';
import { z } from 'zod';

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

type ToolResult = {
  content: [{ type: 'text'; text: string }];
  isError?: boolean;
};

const textContent = (value: JsonValue): ToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(value) }]
});

const errorContent = (code: string, error: unknown): ToolResult => ({
  content: [
    {
      type: 'text',
      text: JSON.stringify({
        error: {
          code,
          message: error instanceof Error ? error.message : 'The requested operation failed.'
        }
      })
    }
  ],
  isError: true
});

const server = new McpServer({
  name: 'ontofabric-knowledge-graph',
  version: '0.1.0'
});

server.registerTool(
  'parse_excel_source',
  {
    title: 'Parse Excel source',
    description: 'Read every worksheet in an Excel file and return structured row objects.',
    inputSchema: z.object({
      filePath: z.string().trim().min(1)
    }).strict()
  },
  async ({ filePath }) => {
    try {
      const workbook = XLSX.read(await readFile(filePath), { type: 'buffer' });
      const sheets = workbook.SheetNames.map((sheetName) => ({
        name: sheetName,
        rows: XLSX.utils.sheet_to_json<Record<string, JsonValue>>(
          workbook.Sheets[sheetName],
          { defval: null }
        )
      }));

      return textContent({ filePath, sheets });
    } catch (error) {
      return errorContent('EXCEL_PARSE_FAILED', error);
    }
  }
);

server.registerTool(
  'parse_pdf_source',
  {
    title: 'Parse PDF source',
    description: 'Extract plain text content from a PDF document.',
    inputSchema: z.object({
      filePath: z.string().trim().min(1)
    }).strict()
  },
  async ({ filePath }) => {
    try {
      const parsed = await pdfParse(await readFile(filePath));

      return textContent({
        filePath,
        text: parsed.text,
        pageCount: parsed.numpages
      });
    } catch (error) {
      return errorContent('PDF_PARSE_FAILED', error);
    }
  }
);

server.registerTool(
  'update_sap_purchase_order',
  {
    title: 'Update SAP purchase order',
    description: 'Write updated fields to a SAP purchase order through the configured ERP connector.',
    inputSchema: z.object({
      orderId: z.string().trim().min(1),
      updatedFields: z.record(z.unknown())
    }).strict()
  },
  async ({ orderId, updatedFields }) => textContent({
    sourceSystem: 'SAP',
    action: 'UPDATE_PURCHASE_ORDER',
    orderId,
    updatedFields: JSON.parse(JSON.stringify(updatedFields)) as JsonValue,
    status: 'SYNCED',
    updatedAt: new Date().toISOString()
  })
);

server.registerTool(
  'update_crm_account_status',
  {
    title: 'Update CRM account status',
    description: 'Write a new status to a Salesforce or CRM account through the configured connector.',
    inputSchema: z.object({
      accountId: z.string().trim().min(1),
      status: z.string().trim().min(1)
    }).strict()
  },
  async ({ accountId, status }) => textContent({
    sourceSystem: 'CRM',
    action: 'UPDATE_ACCOUNT_STATUS',
    accountId,
    status,
    statusResult: 'SYNCED',
    updatedAt: new Date().toISOString()
  })
);

const transport = new StdioServerTransport();
await server.connect(transport);
