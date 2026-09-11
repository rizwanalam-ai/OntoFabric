import type { GraphNode } from '@ontofabric/shared/types.js';
export declare const translateToCypher: (userPrompt: string, schema?: string) => Promise<string>;
export declare const validateReadOnlyCypher: (query: string) => void;
export declare const extractSubgraphContext: (entityIds: string[], hops?: number) => Promise<string>;
export declare const executeGroundedQuery: (userPrompt: string) => Promise<{
    answer: string;
    cypherQuery: string;
    sourceNodes: GraphNode[];
}>;
