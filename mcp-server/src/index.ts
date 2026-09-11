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
  'fetch_erp_records',
  {
    title: 'Fetch ERP records',
    description: 'Return mock ERP customer or order records for an entity type.',
    inputSchema: z.object({
      entityType: z.string().trim().min(1),
      filterCriteria: z.string().trim().min(1).optional()
    }).strict()
  },
  async ({ entityType, filterCriteria }) => {
    const normalizedEntityType = entityType.toLowerCase();
    const records = normalizedEntityType === 'order'
      ? [
          {
            id: 'ERP-ORDER-1001',
            entityType: 'Order',
            customerId: 'ERP-CUSTOMER-2001',
            status: 'OPEN',
            total: 12500,
            currency: 'USD'
          },
          {
            id: 'ERP-ORDER-1002',
            entityType: 'Order',
            customerId: 'ERP-CUSTOMER-2002',
            status: 'SHIPPED',
            total: 8300,
            currency: 'USD'
          }
        ]
      : [
          {
            id: 'ERP-CUSTOMER-2001',
            entityType: 'Customer',
            name: 'Northwind Manufacturing',
            region: 'NA',
            status: 'ACTIVE'
          },
          {
            id: 'ERP-CUSTOMER-2002',
            entityType: 'Customer',
            name: 'Contoso Industrial',
            region: 'EMEA',
            status: 'ACTIVE'
          }
        ];

    return textContent({
      sourceSystem: 'ERP',
      entityType,
      filterCriteria: filterCriteria ?? null,
      records
    });
  }
);

server.registerTool(
  'fetch_crm_contacts',
  {
    title: 'Fetch CRM contacts',
    description: 'Return mock CRM contacts and account relationships.',
    inputSchema: z.object({
      accountId: z.string().trim().min(1)
    }).strict()
  },
  async ({ accountId }) => textContent({
    sourceSystem: 'CRM',
    accountId,
    contacts: [
      {
        id: 'CRM-CONTACT-3001',
        accountId,
        name: 'Avery Morgan',
        role: 'Procurement Director',
        relationship: 'PRIMARY_CONTACT',
        email: 'avery.morgan@example.com'
      },
      {
        id: 'CRM-CONTACT-3002',
        accountId,
        name: 'Jordan Lee',
        role: 'Account Sponsor',
        relationship: 'EXECUTIVE_SPONSOR',
        email: 'jordan.lee@example.com'
      }
    ]
  })
);

const transport = new StdioServerTransport();
await server.connect(transport);
