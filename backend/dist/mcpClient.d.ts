export declare const callExcelParser: (filePath: string) => Promise<unknown>;
export declare const callPdfParser: (filePath: string) => Promise<unknown>;
export declare const callSapPurchaseOrderUpdate: (orderId: string, updatedFields: Record<string, unknown>) => Promise<unknown>;
export declare const callCrmAccountStatusUpdate: (accountId: string, status: string) => Promise<unknown>;
export declare const closeMcpClient: () => Promise<void>;
