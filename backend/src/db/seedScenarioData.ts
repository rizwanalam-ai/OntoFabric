import 'dotenv/config';

import type { GraphEdge, GraphNode, PrimitiveDictionary } from '@ontofabric/shared/types.js';
import { getNeo4jDriver, persistGraphToNeo4j } from '../services/ontologyService.js';

const domain = 'SUPPLY_CHAIN' as const;
const activeFrom = '2026-01-01T00:00:00.000Z';
const now = new Date().toISOString();

const node = (
  id: string,
  label: string,
  sourceSystem: GraphNode['sourceSystem'],
  properties: PrimitiveDictionary,
  temporal: Pick<GraphNode, 'validFrom' | 'validTo'> = { validFrom: activeFrom, validTo: '9999-12-31T23:59:59.999Z' }
): GraphNode => ({
  id,
  type: { id: `TEST-${label.toUpperCase()}`, label, attributes: properties },
  domain,
  secondaryLabels: ['ScenarioSeed', label],
  sourceSystem,
  properties,
  createdAt: temporal.validFrom,
  validFrom: temporal.validFrom,
  validTo: temporal.validTo,
  transactionFrom: activeFrom,
  transactionTo: '9999-12-31T23:59:59.999Z',
  provenance: {
    sourceSystem,
    rawSourceId: id,
    extractionTimestamp: now,
    mcpTool: 'seedScenarioData'
  }
});

const edge = (
  id: string,
  relationship: string,
  source: string,
  target: string,
  properties: PrimitiveDictionary = {},
  temporal: Pick<GraphEdge, 'validFrom' | 'validTo'> = { validFrom: activeFrom, validTo: '9999-12-31T23:59:59.999Z' }
): GraphEdge => ({
  id,
  source,
  target,
  relationship,
  properties,
  validFrom: temporal.validFrom,
  validTo: temporal.validTo,
  transactionFrom: activeFrom,
  transactionTo: '9999-12-31T23:59:59.999Z'
});

const nodes: GraphNode[] = [
  node('TEST-PUMP-100', 'Product', 'ERP', { sku: 'PUMP-100', name: 'HydraFlow Pump 100', category: 'Finished Goods' }),
  node('TEST-VALVE-200', 'Product', 'ERP', { sku: 'VALVE-200', name: 'AquaGuard Valve 200', category: 'Finished Goods' }),
  node('TEST-SEAL-01', 'Component', 'ERP', { sku: 'SEAL-01', name: 'High-pressure seal', category: 'Component' }),
  node('TEST-MOTOR-01', 'Component', 'ERP', { sku: 'MOTOR-01', name: 'Compact pump motor', category: 'Component' }),
  node('TEST-FACILITY-EAST', 'Facility', 'ERP', { name: 'East Coast Fulfillment Center', region: 'NA', location: 'New Jersey' }),
  node('TEST-WORKCENTER-01', 'WorkCenter', 'ERP', { name: 'Hydraulics Assembly Line', capacityHours: 1200 }),
  node('TEST-SUPPLIER-SEAL', 'Supplier', 'ERP', { name: 'Precision Seal Works', country: 'US', tier: 'Strategic' }),
  node('TEST-SUPPLIER-MOTOR', 'Supplier', 'ERP', { name: 'MotionCore Components', country: 'DE', tier: 'Preferred' }),
  node('TEST-CUSTOMER-ACME', 'Customer', 'CRM', { customerNumber: 'ACME-001', name: 'Acme Industrial Supply', region: 'NA' }),
  node('TEST-CUSTOMER-ACME-DUP', 'Customer', 'ERP', { customerNumber: 'ERP-8842', name: 'ACME Industrial Supplies', region: 'North America', phone: '+1-555-0100' }),
  node('TEST-CUSTOMER-NOVA', 'Customer', 'CRM', { customerNumber: 'NOVA-014', name: 'Nova Water Systems', region: 'NA' }),
  node('TEST-FORECAST-2026-Q4', 'DemandForecast', 'ERP', { period: '2026-Q4', quantity: 2400, confidence: 0.91 }),
  node('TEST-PLANNER-SUPPLIER', 'Supplier', 'SME_INPUT', { name: 'Planner Recommended Seals', country: 'CA', leadTimeDays: 14, plannerNote: 'Approved backup supplier for Q4 shortage mitigation' }),
  node('TEST-CONTRACT-ACME', 'Contract', 'PDF', { name: 'Acme supply agreement 2026', documentType: 'PDF', clause: 'Supplier must maintain 500 units of safety stock', filePath: 'seed/acme-supply-agreement.pdf' }),
  node('TEST-PUMP-100-HISTORICAL', 'Product', 'ERP', { sku: 'PUMP-100', name: 'HydraFlow Pump 100 legacy revision', revision: 'A' }, { validFrom: '2024-01-01T00:00:00.000Z', validTo: '2025-12-31T23:59:59.999Z' })
];

const edges: GraphEdge[] = [
  edge('TEST-R-01', 'REQUIRES_BOM', 'TEST-PUMP-100', 'TEST-SEAL-01', { quantityPerUnit: 2 }),
  edge('TEST-R-02', 'REQUIRES_BOM', 'TEST-PUMP-100', 'TEST-MOTOR-01', { quantityPerUnit: 1 }),
  edge('TEST-R-03', 'REQUIRES_BOM', 'TEST-VALVE-200', 'TEST-SEAL-01', { quantityPerUnit: 1 }),
  edge('TEST-R-04', 'STORED_AT', 'TEST-PUMP-100', 'TEST-FACILITY-EAST', { onHand: 180, safetyStock: 500, reorderPoint: 700 }),
  edge('TEST-R-05', 'STORED_AT', 'TEST-VALVE-200', 'TEST-FACILITY-EAST', { onHand: 950, safetyStock: 300, reorderPoint: 450 }),
  edge('TEST-R-06', 'PRODUCED_AT', 'TEST-PUMP-100', 'TEST-WORKCENTER-01', { leadTimeDays: 6, capacity: 1200, unitCost: 86 }),
  edge('TEST-R-07', 'SUPPLIED_BY', 'TEST-SEAL-01', 'TEST-SUPPLIER-SEAL', { leadTimeDays: 42, minimumOrderQty: 1000, unitCost: 12 }),
  edge('TEST-R-08', 'SUPPLIED_BY', 'TEST-MOTOR-01', 'TEST-SUPPLIER-MOTOR', { leadTimeDays: 28, minimumOrderQty: 250, unitCost: 48 }),
  edge('TEST-R-09', 'HAS_DEMAND', 'TEST-CUSTOMER-ACME', 'TEST-FORECAST-2026-Q4', { period: '2026-Q4' }),
  edge('TEST-R-10', 'FOR_PRODUCT', 'TEST-FORECAST-2026-Q4', 'TEST-PUMP-100'),
  edge('TEST-R-11', 'SUPPLIED_BY', 'TEST-SEAL-01', 'TEST-PLANNER-SUPPLIER', { leadTimeDays: 14, minimumOrderQty: 500, source: 'planner recommendation' }),
  edge('TEST-R-12', 'SHIPPED_TO', 'TEST-FACILITY-EAST', 'TEST-CUSTOMER-ACME', { serviceLevel: 0.98 }),
  edge('TEST-R-13', 'FOR_PRODUCT', 'TEST-CONTRACT-ACME', 'TEST-PUMP-100', { clause: 'safety stock obligation' }),
  edge('TEST-R-14', 'SUPPLIED_BY', 'TEST-PUMP-100', 'TEST-SUPPLIER-SEAL', { contractId: 'TEST-CONTRACT-ACME' }, { validFrom: '2024-01-01T00:00:00.000Z', validTo: '2025-12-31T23:59:59.999Z' })
];

const seedPendingReview = async (): Promise<void> => {
  const session = getNeo4jDriver().session();
  try {
    await session.executeWrite((transaction) => transaction.run(
      `MERGE (p:PendingReview {pendingId: $pendingId})
       SET p.entityAId = $entityAId, p.entityBId = $entityBId,
           p.entityAJson = $entityAJson, p.entityBJson = $entityBJson,
           p.confidence = $confidence, p.conflictsJson = $conflictsJson,
           p.status = 'PENDING', p.createdAt = $createdAt`,
      {
        pendingId: 'TEST-DUP-ACME-001',
        entityAId: 'TEST-CUSTOMER-ACME',
        entityBId: 'TEST-CUSTOMER-ACME-DUP',
        entityAJson: JSON.stringify(nodes.find((item) => item.id === 'TEST-CUSTOMER-ACME')),
        entityBJson: JSON.stringify(nodes.find((item) => item.id === 'TEST-CUSTOMER-ACME-DUP')),
        confidence: 0.86,
        conflictsJson: JSON.stringify(['name', 'region']),
        createdAt: now
      }
    ));
  } finally {
    await session.close();
  }
};

try {
  await getNeo4jDriver().verifyConnectivity();
  await persistGraphToNeo4j(nodes, edges);
  await seedPendingReview();
  console.log(`Scenario test data seeded: ${nodes.length} nodes, ${edges.length} relationships, 1 pending duplicate review`);
} finally {
  await getNeo4jDriver().close();
}