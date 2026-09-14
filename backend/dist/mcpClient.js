import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
let clientPromise;
const getMcpServerPath = () => process.env.MCP_SERVER_PATH
    ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../mcp-server/dist/index.js');
const getClient = async () => {
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
const callTool = async (name, arguments_) => {
    const result = await (await getClient()).callTool({ name, arguments: arguments_ });
    if (result.isError) {
        throw new Error(result.content?.[0]?.text ?? `MCP tool ${name} failed.`);
    }
    const text = result.content?.find((content) => content.type === 'text')?.text;
    if (!text) {
        throw new Error(`MCP tool ${name} returned no JSON content.`);
    }
    return JSON.parse(text);
};
export const callExcelParser = (filePath) => callTool('parse_excel_source', { filePath });
export const callPdfParser = (filePath) => callTool('parse_pdf_source', { filePath });
export const callErpRecords = (entityType, filterCriteria) => callTool('fetch_erp_records', filterCriteria ? { entityType, filterCriteria } : { entityType });
export const callCrmContacts = (accountId) => callTool('fetch_crm_contacts', { accountId });
export const callSapPurchaseOrderUpdate = (orderId, updatedFields) => callTool('update_sap_purchase_order', { orderId, updatedFields });
export const callCrmAccountStatusUpdate = (accountId, status) => callTool('update_crm_account_status', { accountId, status });
export const closeMcpClient = async () => {
    if (!clientPromise) {
        return;
    }
    const client = await clientPromise;
    await client.close();
    clientPromise = undefined;
};
//# sourceMappingURL=mcpClient.js.map