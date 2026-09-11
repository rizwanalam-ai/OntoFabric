import { DEFAULT_TEMPORAL_END } from '@ontofabric/shared/types.js';
import { getNeo4jDriver } from './ontologyService.js';
export const SOP_RELATIONSHIP_TYPES = [
    'HAS_DEMAND', 'FOR_PRODUCT', 'REQUIRES_BOM', 'STORED_AT', 'PRODUCED_AT', 'SUPPLIED_BY', 'SHIPPED_TO', 'FULFILLED_BY'
];
const primitiveProperties = (value) => Object.fromEntries(Object.entries(value).filter(([, item]) => typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean' || item === null));
const resultNode = (node) => {
    const properties = node.properties;
    const reserved = new Set(['id', 'sopLabel', 'sourceSystem', 'createdAt', 'validFrom', 'validTo', 'transactionFrom', 'transactionTo', 'provenanceJson']);
    return {
        id: String(properties.id),
        type: { id: String(properties.sopLabel).toLowerCase(), label: String(properties.sopLabel), attributes: {} },
        sourceSystem: properties.sourceSystem ?? 'SOP',
        properties: primitiveProperties(Object.fromEntries(Object.entries(properties).filter(([key]) => !reserved.has(key)))),
        createdAt: String(properties.createdAt ?? properties.validFrom ?? new Date().toISOString()),
        validFrom: String(properties.validFrom ?? '1970-01-01T00:00:00.000Z'),
        validTo: String(properties.validTo ?? DEFAULT_TEMPORAL_END),
        transactionFrom: String(properties.transactionFrom ?? '1970-01-01T00:00:00.000Z'),
        transactionTo: String(properties.transactionTo ?? DEFAULT_TEMPORAL_END),
        provenance: (() => {
            try {
                return JSON.parse(String(properties.provenanceJson));
            }
            catch {
                return { sourceSystem: 'SOP', rawSourceId: String(properties.id), extractionTimestamp: String(properties.createdAt ?? new Date().toISOString()) };
            }
        })()
    };
};
export const querySopGraph = async () => {
    const session = getNeo4jDriver().session();
    try {
        const result = await session.executeRead((transaction) => transaction.run(`MATCH (source)-[relationship]->(target)
       WHERE source.sopLabel IS NOT NULL AND type(relationship) IN $relationshipTypes
       RETURN source, relationship, target LIMIT 500`, { relationshipTypes: SOP_RELATIONSHIP_TYPES }));
        const nodes = new Map();
        const relationships = [];
        for (const record of result.records) {
            const source = record.get('source');
            const target = record.get('target');
            const relationship = record.get('relationship');
            nodes.set(source.properties.id, resultNode(source));
            nodes.set(target.properties.id, resultNode(target));
            relationships.push({
                id: String(relationship.properties.id),
                relationship: relationship.type,
                source: String(source.properties.id),
                target: String(target.properties.id),
                properties: primitiveProperties(relationship.properties),
                validFrom: '1970-01-01T00:00:00.000Z',
                validTo: DEFAULT_TEMPORAL_END,
                transactionFrom: '1970-01-01T00:00:00.000Z',
                transactionTo: DEFAULT_TEMPORAL_END
            });
        }
        return { nodes: [...nodes.values()], edges: relationships };
    }
    finally {
        await session.close();
    }
};
export const querySopPlanningSummary = async () => {
    const session = getNeo4jDriver().session();
    try {
        const demand = await session.run(`MATCH (forecast:DemandForecast)-[:FOR_PRODUCT]->(product:Product) RETURN forecast.period AS period, sum(coalesce(forecast.forecastQuantity, forecast.quantity, 0)) AS quantity ORDER BY period`);
        const inventory = await session.run(`MATCH (product:Product)-[stored:STORED_AT]->(facility:Facility) RETURN product.id AS productId, facility.id AS facilityId, stored.onHand AS onHand, stored.safetyStock AS safetyStock, stored.reorderPoint AS reorderPoint`);
        const supplierRisks = await session.run(`MATCH (component:Component)-[supply:SUPPLIED_BY]->(supplier:Supplier) RETURN supplier.id AS supplierId, supplier.name AS supplierName, supply.leadTimeDays AS leadTimeDays, coalesce(supply.minimumOrderQty, supply.minOrderQty, 0) AS minimumOrderQty ORDER BY supply.leadTimeDays DESC`);
        const capacity = await session.run(`MATCH (product:Product)-[production:PRODUCED_AT]->(workCenter:WorkCenter) RETURN workCenter.id AS workCenterId, workCenter.name AS workCenterName, coalesce(production.capacity, production.unitsPerHour, 0) AS capacity, coalesce(production.unitCost, production.unitAssemblyCost, 0) AS unitCost`);
        return {
            demand: demand.records.map((record) => ({ period: String(record.get('period')), quantity: Number(record.get('quantity')) })),
            inventory: inventory.records.map((record) => ({ productId: String(record.get('productId')), facilityId: String(record.get('facilityId')), onHand: Number(record.get('onHand')), safetyStock: Number(record.get('safetyStock')), reorderPoint: Number(record.get('reorderPoint')) })),
            supplierRisks: supplierRisks.records.map((record) => ({ supplierId: String(record.get('supplierId')), supplierName: String(record.get('supplierName')), leadTimeDays: Number(record.get('leadTimeDays')), minimumOrderQty: Number(record.get('minimumOrderQty')) })),
            capacity: capacity.records.map((record) => ({ workCenterId: String(record.get('workCenterId')), workCenterName: String(record.get('workCenterName')), capacity: Number(record.get('capacity')), unitCost: Number(record.get('unitCost')) }))
        };
    }
    finally {
        await session.close();
    }
};
export const getSopDriver = () => getNeo4jDriver();
//# sourceMappingURL=sopService.js.map