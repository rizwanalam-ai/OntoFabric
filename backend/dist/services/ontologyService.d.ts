import { type Driver } from 'neo4j-driver';
import { type DomainContext, type GraphEdge, type GraphNode } from '@ontofabric/shared/types.js';
export declare const getNeo4jDriver: () => Driver;
export declare const extractOntologyFromText: (rawText: string, domain: DomainContext) => Promise<{
    nodes: GraphNode[];
    edges: GraphEdge[];
    privacy: {
        redactedCount: number;
        redactionId: string;
    };
}>;
export declare const persistGraphToNeo4j: (nodes: GraphNode[], edges: GraphEdge[]) => Promise<void>;
export declare const queryGraphAtTimestamp: (asOfDate: string, domain?: DomainContext) => Promise<{
    nodes: unknown[];
    edges: unknown[];
}>;
export declare const closeOntologyServices: () => Promise<void>;
export declare const queryGraphFromNeo4j: (domain?: DomainContext) => Promise<{
    nodes: unknown[];
    edges: unknown[];
}>;
