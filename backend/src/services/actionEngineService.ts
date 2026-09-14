import { callCrmAccountStatusUpdate, callSapPurchaseOrderUpdate } from '../mcpClient.js';
import { getNeo4jDriver } from './ontologyService.js';

export type WriteBackActionResult = {
  actionType: string;
  status: 'SYNCED';
  sourceSystem: 'SAP' | 'CRM';
  result: unknown;
};

type ActionPayload = {
  nodeId?: string;
  userId?: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  orderId?: string;
  accountId?: string;
  status?: string;
  updatedFields?: Record<string, unknown>;
};

const auditAction = async (actionType: string, payload: ActionPayload, sourceSystem: string): Promise<void> => {
  const nodeId = payload.nodeId ?? payload.orderId ?? payload.accountId;
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
        actionType,
        sourceSystem,
        oldValues: JSON.stringify(payload.oldValues ?? {}),
        newValues: JSON.stringify(payload.newValues ?? payload.updatedFields ?? {})
      }
    ));
  } finally {
    await session.close();
  }
};

export const executeWriteBackAction = async (actionType: string, payload: any): Promise<WriteBackActionResult> => {
  const actionPayload = payload as ActionPayload;
  let result: unknown;
  let sourceSystem: 'SAP' | 'CRM';

  switch (actionType) {
    case 'update_sap_purchase_order': {
      if (!actionPayload.orderId || !actionPayload.updatedFields) throw new Error('SAP purchase order updates require orderId and updatedFields.');
      result = await callSapPurchaseOrderUpdate(actionPayload.orderId, actionPayload.updatedFields);
      sourceSystem = 'SAP';
      break;
    }
    case 'update_crm_account_status': {
      if (!actionPayload.accountId || !actionPayload.status) throw new Error('CRM account updates require accountId and status.');
      result = await callCrmAccountStatusUpdate(actionPayload.accountId, actionPayload.status);
      sourceSystem = 'CRM';
      break;
    }
    default:
      throw new Error(`Unsupported write-back action: ${actionType}`);
  }

  await auditAction(actionType, actionPayload, sourceSystem);
  return { actionType, status: 'SYNCED', sourceSystem, result };
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
  await auditAction('local_graph_update', actionPayload, 'LOCAL');
  return { actionType: 'local_graph_update', status: 'SAVED' };
};
