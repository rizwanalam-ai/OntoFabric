import type { Driver } from 'neo4j-driver';
import { type GraphEdge, type GraphNode, type SopPlanningSummary, type SopRelationshipType } from '@ontofabric/shared/types.js';
export declare const SOP_RELATIONSHIP_TYPES: readonly SopRelationshipType[];
export declare const querySopGraph: () => Promise<{
    nodes: GraphNode[];
    edges: GraphEdge[];
}>;
export declare const querySopPlanningSummary: () => Promise<SopPlanningSummary>;
export declare const getSopDriver: () => Driver;
