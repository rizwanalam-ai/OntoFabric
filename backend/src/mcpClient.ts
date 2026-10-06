import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

type McpTextContent = {
  type: 'text';
  text: string;
};

type McpToolResult = {
  content?: McpTextContent[];
  isError?: boolean;
};

let clientPromise: Promise<Client> | undefined;
let neo4jMcpClientPromise: Promise<Client> | undefined;

const getMcpServerPath = (): string => process.env.MCP_SERVER_PATH
  ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../mcp-server/dist/index.js');

const getClient = async (): Promise<Client> => {
  if (!clientPromise) {
    clientPromise = (async () => {
      const serverPath = getMcpServerPath();
      const client = new Client({ name: 'ontofabric-backend', version: '0.1.0' });
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [serverPath],
        cwd: path.dirname(serverPath),
        stderr: 'pipe'
      });

      await client.connect(transport);
      return client;
    })().catch((error) => {
      clientPromise = undefined;
      throw error;
    });
  }

  return clientPromise;
};

const getNeo4jMcpClient = async (): Promise<Client> => {
  if (!neo4jMcpClientPromise) {
    neo4jMcpClientPromise = (async () => {
      const endpoint = process.env.MCP_NEO4J_URL;
      if (!endpoint) {
        throw new Error('MCP_NEO4J_URL is not configured.');
      }

      const token = process.env.MCP_NEO4J_AUTH_TOKEN;
      const client = new Client({ name: 'ontofabric-neo4j-mcp-client', version: '0.1.0' });
      const transport = new StreamableHTTPClientTransport(new URL(endpoint), token
        ? { requestInit: { headers: { Authorization: `Bearer ${token}` } } }
        : undefined);

      await client.connect(transport);
      return client;
    })().catch((error) => {
      neo4jMcpClientPromise = undefined;
      throw error;
    });
  }

  return neo4jMcpClientPromise;
};

const callTool = async <T>(name: string, arguments_: Record<string, unknown>): Promise<T> => {
  const result = await (await getClient()).callTool({ name, arguments: arguments_ }) as McpToolResult;

  if (result.isError) {
    throw new Error(result.content?.[0]?.text ?? `MCP tool ${name} failed.`);
  }

  const text = result.content?.find((content) => content.type === 'text')?.text;
  if (!text) {
    throw new Error(`MCP tool ${name} returned no JSON content.`);
  }

  return JSON.parse(text) as T;
};

export const callExcelParser = (filePath: string) => callTool<unknown>('parse_excel_source', { filePath });

export const callPdfParser = (filePath: string) => callTool<unknown>('parse_pdf_source', { filePath });

export const callSapPurchaseOrderUpdate = (orderId: string, updatedFields: Record<string, unknown>) => callTool<unknown>(
  'update_sap_purchase_order',
  { orderId, updatedFields }
);

export const callCrmAccountStatusUpdate = (accountId: string, status: string) => callTool<unknown>(
  'update_crm_account_status',
  { accountId, status }
);

export const listNeo4jMcpTools = async () => (await getNeo4jMcpClient()).listTools();

export const callNeo4jMcpTool = async (name: string, arguments_: Record<string, unknown>) => (
  await getNeo4jMcpClient()
).callTool({ name, arguments: arguments_ });

export const closeMcpClient = async (): Promise<void> => {
  const clients = await Promise.all([
    clientPromise,
    neo4jMcpClientPromise
  ]);
  for (const client of clients) {
    if (client) {
      await client.close();
    }
  }

  clientPromise = undefined;
  neo4jMcpClientPromise = undefined;
};