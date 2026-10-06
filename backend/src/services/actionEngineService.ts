import { getNeo4jDriver } from './ontologyService.js';

type ActionPayload = {
  nodeId?: string;
  userId?: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
};

const auditAction = async (payload: ActionPayload): Promise<void> => {
  const nodeId = payload.nodeId;
  if (!nodeId) throw new Error('A target node ID is required for action auditing.');
  const session = getNeo4jDriver().session();
  try {
    await session.executeWrite((transaction) => transaction.run(
      `MERGE (user:User {id: $userId})
       WITH user
       MATCH (target:Entity {id: $nodeId})
       MERGE (user)-[action:EXECUTED_ACTION {timestamp: $timestamp, actionType: $actionType}]->(target)
       SET action.sourceSystem = $sourceSystem,
           action.oldValues = $oldValues,
           action.newValues = $newValues
       RETURN action`,
      {
        userId: payload.userId ?? 'system-sme',
        nodeId,
        timestamp: new Date().toISOString(),
        actionType: 'local_graph_update',
        sourceSystem: 'LOCAL',
        oldValues: JSON.stringify(payload.oldValues ?? {}),
        newValues: JSON.stringify(payload.newValues ?? {})
      }
    ));
  } finally {
    await session.close();
  }
};

export const executeLocalGraphUpdate = async (payload: any): Promise<{ actionType: 'local_graph_update'; status: 'SAVED' }> => {
  const actionPayload = payload as ActionPayload;
  if (!actionPayload.nodeId || !actionPayload.newValues) throw new Error('Local graph updates require nodeId and newValues.');
  const session = getNeo4jDriver().session();
  try {
    await session.executeWrite((transaction) => transaction.run(
      `MATCH (target:Entity {id: $nodeId})
       SET target += $newValues
       RETURN target`,
      { nodeId: actionPayload.nodeId, newValues: actionPayload.newValues }
    ));
  } finally {
    await session.close();
  }
  await auditAction(actionPayload);
  return { actionType: 'local_graph_update', status: 'SAVED' };
};
