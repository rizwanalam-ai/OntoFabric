export declare const callExcelParser: (filePath: string) => Promise<unknown>;
export declare const callPdfParser: (filePath: string) => Promise<unknown>;
export declare const callErpRecords: (entityType: string, filterCriteria?: string) => Promise<unknown>;
export declare const callCrmContacts: (accountId: string) => Promise<unknown>;
export declare const closeMcpClient: () => Promise<void>;
