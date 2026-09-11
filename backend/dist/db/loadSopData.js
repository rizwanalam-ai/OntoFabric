import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import neo4j from 'neo4j-driver';
import * as XLSX from 'xlsx';
const nodeLabels = ['Product', 'Component', 'Facility', 'WorkCenter', 'Supplier', 'Customer', 'DemandForecast'];
const relationshipTypes = ['HAS_DEMAND', 'FOR_PRODUCT', 'REQUIRES_BOM', 'STORED_AT', 'PRODUCED_AT', 'SUPPLIED_BY', 'SHIPPED_TO', 'FULFILLED_BY'];
const reservedNodeColumns = new Set(['id', 'label', 'type', 'nodeType', 'sopLabel']);
const reservedRelationshipColumns = new Set(['id', 'type', 'relationship', 'source', 'sourceId', 'target', 'targetId']);
const parseArgs = (args) => {
    const filePath = args.find((arg) => !arg.startsWith('--'));
    if (!filePath)
        throw new Error('Usage: npm run db:load:sop -- <file.xlsx|file.csv> [--kind nodes|relationships] [--label Product] [--relationship-type FOR_PRODUCT]');
    const readOption = (name) => {
        const index = args.indexOf(name);
        return index >= 0 ? args[index + 1] : undefined;
    };
    const kind = readOption('--kind');
    const label = readOption('--label');
    const relationshipType = readOption('--relationship-type');
    if (kind && kind !== 'nodes' && kind !== 'relationships')
        throw new Error('--kind must be nodes or relationships.');
    if (label && !nodeLabels.includes(label))
        throw new Error(`Unsupported node label: ${label}`);
    if (relationshipType && !relationshipTypes.includes(relationshipType))
        throw new Error(`Unsupported relationship type: ${relationshipType}`);
    return { filePath: path.resolve(filePath), kind: kind, label: label, relationshipType: relationshipType };
};
const parseCell = (value) => {
    if (value === undefined || value === '')
        return null;
    if (typeof value === 'number' || typeof value === 'boolean')
        return value;
    const text = String(value).trim();
    if (/^-?\d+(\.\d+)?$/.test(text))
        return Number(text);
    if (text.toLowerCase() === 'true')
        return true;
    if (text.toLowerCase() === 'false')
        return false;
    if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'))) {
        throw new Error(`Nested JSON is not a Neo4j primitive property: ${text}`);
    }
    return text;
};
const readRows = async (filePath) => {
    const buffer = await fs.readFile(filePath);
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
    const sheets = new Map();
    for (const sheetName of workbook.SheetNames) {
        sheets.set(sheetName.toLowerCase(), XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null, raw: true }));
    }
    return sheets;
};
const loadNodeRows = async (transaction, rows, labelOverride) => {
    let count = 0;
    for (const row of rows) {
        const id = String(row.id ?? '').trim();
        const label = String(labelOverride ?? row.label ?? row.type ?? row.nodeType ?? row.sopLabel ?? '').trim();
        if (!id || !nodeLabels.includes(label))
            throw new Error(`Node rows require id and a supported label. Received id=${id}, label=${label}`);
        const properties = {};
        for (const [key, value] of Object.entries(row)) {
            if (!reservedNodeColumns.has(key) && value !== null && value !== undefined && value !== '')
                properties[key] = parseCell(value);
        }
        await transaction.run(`MERGE (n:${label} {id: $id}) SET n += $properties, n.sopLabel = $label`, { id, label, properties });
        count += 1;
    }
    return count;
};
const loadRelationshipRows = async (transaction, rows, relationshipOverride) => {
    let count = 0;
    for (const row of rows) {
        const id = String(row.id ?? '').trim();
        const type = String(relationshipOverride ?? row.type ?? row.relationship ?? '').trim();
        const source = String(row.source ?? row.sourceId ?? '').trim();
        const target = String(row.target ?? row.targetId ?? '').trim();
        if (!id || !source || !target || !relationshipTypes.includes(type))
            throw new Error(`Relationship rows require id, source, target, and a supported type. Received id=${id}, type=${type}, source=${source}, target=${target}`);
        const properties = {};
        for (const [key, value] of Object.entries(row)) {
            if (!reservedRelationshipColumns.has(key) && value !== null && value !== undefined && value !== '')
                properties[key] = parseCell(value);
        }
        await transaction.run(`MATCH (source {id: $source}), (target {id: $target}) MERGE (source)-[r:${type} {id: $id}]->(target) SET r += $properties`, { id, source, target, properties });
        count += 1;
    }
    return count;
};
const loadWorkbook = async (options) => {
    const sheets = await readRows(options.filePath);
    const extension = path.extname(options.filePath).toLowerCase();
    const nodeRows = options.kind === 'relationships' ? [] : sheets.get('nodes') ?? (options.kind === 'nodes' ? [...sheets.values()].flat() : []);
    const relationshipRows = options.kind === 'nodes' ? [] : sheets.get('relationships') ?? (options.kind === 'relationships' ? [...sheets.values()].flat() : []);
    if (extension === '.csv' && !options.kind)
        throw new Error('CSV input requires --kind nodes or --kind relationships.');
    if (nodeRows.length === 0 && relationshipRows.length === 0)
        throw new Error('No loadable rows found. Excel workbooks should contain Nodes and/or Relationships sheets.');
    const driver = neo4j.driver(process.env.NEO4J_URI ?? 'bolt://localhost:7687', neo4j.auth.basic(process.env.NEO4J_USERNAME ?? process.env.NEO4J_USER ?? 'neo4j', process.env.NEO4J_PASSWORD ?? 'password'));
    try {
        await driver.verifyConnectivity();
        const session = driver.session({ database: process.env.NEO4J_DATABASE ?? 'neo4j' });
        try {
            let nodes = 0;
            let relationships = 0;
            await session.executeWrite(async (transaction) => {
                nodes = await loadNodeRows(transaction, nodeRows, options.label);
                relationships = await loadRelationshipRows(transaction, relationshipRows, options.relationshipType);
            });
            return { nodes, relationships };
        }
        finally {
            await session.close();
        }
    }
    finally {
        await driver.close();
    }
};
try {
    const result = await loadWorkbook(parseArgs(process.argv.slice(2)));
    console.log(`S&OP data loaded: ${result.nodes} nodes, ${result.relationships} relationships`);
}
catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
}
//# sourceMappingURL=loadSopData.js.map