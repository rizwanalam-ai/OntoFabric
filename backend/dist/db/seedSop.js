import 'dotenv/config';
import neo4j from 'neo4j-driver';
const driver = neo4j.driver(process.env.NEO4J_URI ?? 'bolt://localhost:7687', neo4j.auth.basic(process.env.NEO4J_USERNAME ?? process.env.NEO4J_USER ?? 'neo4j', process.env.NEO4J_PASSWORD ?? 'password'));
const database = process.env.NEO4J_DATABASE ?? 'neo4j';
const nodes = [
    ['P-100', 'Product', { name: 'AeroMax 100', family: 'Finished Goods', unit: 'EA' }],
    ['P-200', 'Product', { name: 'AeroMax 200', family: 'Finished Goods', unit: 'EA' }],
    ['C-AL-01', 'Component', { name: 'Aluminium Housing', category: 'Raw Material' }],
    ['C-MTR-01', 'Component', { name: 'Brushless Motor', category: 'Sub-assembly' }],
    ['F-ATL', 'Facility', { name: 'Atlanta Distribution Center', type: 'Warehouse', region: 'NA' }],
    ['F-CHI', 'Facility', { name: 'Chicago Fulfillment Hub', type: 'Warehouse', region: 'NA' }],
    ['WC-ATL-01', 'WorkCenter', { name: 'Atlanta Assembly Line 01', plant: 'ATL' }],
    ['SUP-ALPINE', 'Supplier', { name: 'Alpine Metals', tier: 'Strategic', region: 'NA' }],
    ['SUP-MOTION', 'Supplier', { name: 'MotionWorks', tier: 'Preferred', region: 'EU' }],
    ['CUS-ACME', 'Customer', { name: 'Acme Retail Group', segment: 'Retail', region: 'NA' }],
    ['CUS-NOVA', 'Customer', { name: 'Nova Home Stores', segment: 'Retail', region: 'NA' }],
    ['DF-ACME-2026Q4', 'DemandForecast', { name: 'Acme Q4 2026 forecast', period: '2026-Q4', quantity: 4200, confidence: 0.86 }],
    ['DF-NOVA-2026Q4', 'DemandForecast', { name: 'Nova Q4 2026 forecast', period: '2026-Q4', quantity: 2800, confidence: 0.79 }]
];
const relationships = [
    ['R-001', 'HAS_DEMAND', 'CUS-ACME', 'DF-ACME-2026Q4', { period: '2026-Q4' }],
    ['R-002', 'FOR_PRODUCT', 'DF-ACME-2026Q4', 'P-100', {}],
    ['R-003', 'HAS_DEMAND', 'CUS-NOVA', 'DF-NOVA-2026Q4', { period: '2026-Q4' }],
    ['R-004', 'FOR_PRODUCT', 'DF-NOVA-2026Q4', 'P-200', {}],
    ['R-005', 'REQUIRES_BOM', 'P-100', 'C-AL-01', { quantityPerUnit: 1 }],
    ['R-006', 'REQUIRES_BOM', 'P-100', 'C-MTR-01', { quantityPerUnit: 1 }],
    ['R-007', 'REQUIRES_BOM', 'P-200', 'C-AL-01', { quantityPerUnit: 1 }],
    ['R-008', 'REQUIRES_BOM', 'P-200', 'C-MTR-01', { quantityPerUnit: 2 }],
    ['R-009', 'STORED_AT', 'P-100', 'F-ATL', { onHand: 860, safetyStock: 500, reorderPoint: 700 }],
    ['R-010', 'STORED_AT', 'P-200', 'F-CHI', { onHand: 240, safetyStock: 350, reorderPoint: 600 }],
    ['R-011', 'PRODUCED_AT', 'P-100', 'WC-ATL-01', { leadTimeDays: 5, batchSize: 100, capacity: 2400, unitCost: 82 }],
    ['R-012', 'PRODUCED_AT', 'P-200', 'WC-ATL-01', { leadTimeDays: 7, batchSize: 80, capacity: 1600, unitCost: 119 }],
    ['R-013', 'SUPPLIED_BY', 'C-AL-01', 'SUP-ALPINE', { leadTimeDays: 21, unitCost: 18, minimumOrderQty: 500 }],
    ['R-014', 'SUPPLIED_BY', 'C-MTR-01', 'SUP-MOTION', { leadTimeDays: 35, unitCost: 46, minimumOrderQty: 250 }],
    ['R-015', 'SHIPPED_TO', 'F-ATL', 'F-CHI', { leadTimeDays: 2, transitCost: 4.5 }]
];
try {
    await driver.verifyConnectivity();
    const session = driver.session({ database });
    try {
        await session.executeWrite(async (transaction) => {
            for (const [id, label, properties] of nodes) {
                await transaction.run(`MERGE (n:${label} {id: $id}) SET n += $properties, n.sopLabel = $label`, { id, label, properties });
            }
            for (const [id, type, source, target, properties] of relationships) {
                await transaction.run(`MATCH (source {id: $source}), (target {id: $target}) MERGE (source)-[r:${type} {id: $id}]->(target) SET r += $properties`, { id, source, target, properties });
            }
        });
    }
    finally {
        await session.close();
    }
    console.log(`S&OP demo data seeded: ${nodes.length} nodes, ${relationships.length} relationships`);
}
finally {
    await driver.close();
}
//# sourceMappingURL=seedSop.js.map