import 'dotenv/config';
import neo4j from 'neo4j-driver';

const driver = neo4j.driver(
  process.env.NEO4J_URI ?? 'bolt://localhost:7687',
  neo4j.auth.basic(process.env.NEO4J_USERNAME ?? process.env.NEO4J_USER ?? 'neo4j', process.env.NEO4J_PASSWORD ?? 'password')
);
const database = process.env.NEO4J_DATABASE ?? 'neo4j';

const nodes = [
  ['WH-EAST', 'Facility', { name: 'East Coast Distribution Center', location: 'New Jersey' }],
  ['WH-WEST', 'Facility', { name: 'West Coast Distribution Center', location: 'California' }],
  ['PLANT-01', 'WorkCenter', { name: 'Main Assembly Line', dailyCapacityHours: 16 }],
  ['SUP-01', 'Supplier', { name: 'Global Microchip Co', country: 'Taiwan' }],
  ['SUP-02', 'Supplier', { name: 'Precision Plastics Inc', country: 'Mexico' }],
  ['PROD-100', 'Product', { sku: 'LP-X1', name: 'Pro Laptop 15-inch', category: 'Electronics' }],
  ['COMP-A1', 'Component', { sku: 'CPU-OCTA', name: 'Octa-Core Processor' }],
  ['COMP-B2', 'Component', { sku: 'CASE-ALU', name: 'Aluminum Chassis' }],
  ['CUST-501', 'Customer', { name: 'Enterprise Tech Corp', region: 'North America' }],
  ['DEM-2026-Q4-E', 'DemandForecast', { period: '2026-Q4', forecastQuantity: 500, confidenceScore: 0.88 }],
  ['DEM-2026-Q4-W', 'DemandForecast', { period: '2026-Q4', forecastQuantity: 400, confidenceScore: 0.92 }]
] as const;

const relationships = [
  ['PLAN-R-001', 'REQUIRES_BOM', 'PROD-100', 'COMP-A1', { quantityPerUnit: 1 }],
  ['PLAN-R-002', 'REQUIRES_BOM', 'PROD-100', 'COMP-B2', { quantityPerUnit: 1 }],
  ['PLAN-R-003', 'SUPPLIED_BY', 'COMP-A1', 'SUP-01', { leadTimeDays: 21, unitCost: 150, minOrderQty: 500 }],
  ['PLAN-R-004', 'SUPPLIED_BY', 'COMP-B2', 'SUP-02', { leadTimeDays: 10, unitCost: 35, minOrderQty: 1000 }],
  ['PLAN-R-005', 'STORED_AT', 'PROD-100', 'WH-EAST', { onHand: 350, safetyStock: 100, reorderPoint: 150 }],
  ['PLAN-R-006', 'STORED_AT', 'PROD-100', 'WH-WEST', { onHand: 80, safetyStock: 150, reorderPoint: 200 }],
  ['PLAN-R-007', 'PRODUCED_AT', 'PROD-100', 'PLANT-01', { setupTimeHours: 2, unitsPerHour: 25, unitAssemblyCost: 45 }],
  ['PLAN-R-008', 'HAS_DEMAND', 'CUST-501', 'DEM-2026-Q4-E', {}],
  ['PLAN-R-009', 'FOR_PRODUCT', 'DEM-2026-Q4-E', 'PROD-100', {}],
  ['PLAN-R-010', 'FULFILLED_BY', 'DEM-2026-Q4-E', 'WH-EAST', {}],
  ['PLAN-R-011', 'HAS_DEMAND', 'CUST-501', 'DEM-2026-Q4-W', {}],
  ['PLAN-R-012', 'FOR_PRODUCT', 'DEM-2026-Q4-W', 'PROD-100', {}],
  ['PLAN-R-013', 'FULFILLED_BY', 'DEM-2026-Q4-W', 'WH-WEST', {}]
] as const;

try {
  await driver.verifyConnectivity();
  const session = driver.session({ database });
  try {
    await session.executeWrite(async (transaction) => {
      for (const [id, label, properties] of nodes) {
        await transaction.run(`MERGE (n:${label} {id: $id}) SET n += $properties, n.sopLabel = $label`, { id, label, properties });
      }
      for (const [id, type, source, target, properties] of relationships) {
        await transaction.run(`MATCH (source {id: $source}), (target {id: $target}) MERGE (source)-[r:${type} {id: $id}]->(target) SET r += $properties`, { id, type, source, target, properties });
      }
    });
  } finally {
    await session.close();
  }
  console.log(`Planning scenario seeded: ${nodes.length} nodes, ${relationships.length} relationships`);
} finally {
  await driver.close();
}