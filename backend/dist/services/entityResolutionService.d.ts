import { type GraphNode } from '@ontofabric/shared/types.js';
export type MatchAction = 'MERGE' | 'REJECT' | 'LINK';
export interface CandidateDuplicate {
    pendingId: string;
    entityA: GraphNode;
    entityB: GraphNode;
    confidence: number;
    conflicts: string[];
    status: 'PENDING';
    createdAt: string;
}
export declare const calculateSimilarity: (entityA: GraphNode, entityB: GraphNode) => Promise<number>;
export declare const findCandidateDuplicates: (newNode: GraphNode, threshold?: number) => Promise<CandidateDuplicate[]>;
export declare const getPendingMatches: () => Promise<CandidateDuplicate[]>;
export declare const resolvePendingMatch: (pendingId: string, action: MatchAction) => Promise<void>;
