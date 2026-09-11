import type { NextFunction, Request, Response } from 'express';
import type { GraphNode } from '@ontofabric/shared/types.js';
export type UserRole = 'ADMIN' | 'ANALYST' | 'GUEST';
export declare const getUserRole: (request: Request) => UserRole;
export declare const redactNodeProperties: (nodes: GraphNode[], userRole: string) => GraphNode[];
export declare const abacMiddleware: (request: Request, response: Response, next: NextFunction) => void;
