import { type Driver } from 'neo4j-driver';
import { type GraphEdge, type GraphNode } from '@ontofabric/shared/types.js';
export declare const getNeo4jDriver: () => Driver;
export declare const extractOntologyFromText: (rawText: string) => Promise<{
    nodes: GraphNode[];
    edges: GraphEdge[];
}>;
export declare const persistGraphToNeo4j: (nodes: GraphNode[], edges: GraphEdge[]) => Promise<void>;
export declare const queryGraphAtTimestamp: (asOfDate: string) => Promise<{
    nodes: unknown[];
    edges: unknown[];
}>;
export declare const closeOntologyServices: () => Promise<void>;
export declare const queryGraphFromNeo4j: () => Promise<{
    nodes: unknown[];
    edges: unknown[];
}>;
