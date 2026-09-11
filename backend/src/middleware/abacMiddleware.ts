import type { NextFunction, Request, Response } from 'express';

import type { GraphNode, PrimitiveDictionary } from '@ontofabric/shared/types.js';

export type UserRole = 'ADMIN' | 'ANALYST' | 'GUEST';

const confidentialKeysByRole: Record<UserRole, Set<string>> = {
  ADMIN: new Set(),
  ANALYST: new Set(['ssn', 'salary', 'baseSalary', 'socialSecurityNumber']),
  GUEST: new Set(['ssn', 'salary', 'baseSalary', 'socialSecurityNumber', 'email', 'phone', 'address'])
};

export const getUserRole = (request: Request): UserRole => {
  const role = request.header('x-user-role')?.toUpperCase();
  return role === 'ADMIN' || role === 'ANALYST' || role === 'GUEST' ? role : 'GUEST';
};

export const redactNodeProperties = (nodes: GraphNode[], userRole: string): GraphNode[] => {
  const role = userRole.toUpperCase() as UserRole;
  const restrictedKeys = confidentialKeysByRole[role] ?? confidentialKeysByRole.GUEST;
  return nodes.map((node) => {
    const properties: PrimitiveDictionary = Object.fromEntries(
      Object.entries(node.properties).filter(([key]) => !restrictedKeys.has(key) && !restrictedKeys.has(key.toLowerCase()))
    );
    return { ...node, properties };
  });
};

export const abacMiddleware = (request: Request, response: Response, next: NextFunction): void => {
  response.locals.userRole = getUserRole(request);
  next();
};