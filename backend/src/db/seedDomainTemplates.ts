import 'dotenv/config';
import neo4j from 'neo4j-driver';

import type { DomainContext } from '@ontofabric/shared/types.js';

const driver = neo4j.driver(
  process.env.NEO4J_URI ?? 'bolt://localhost:7687',
  neo4j.auth.basic(
    process.env.NEO4J_USERNAME ?? process.env.NEO4J_USER ?? 'neo4j',
    process.env.NEO4J_PASSWORD ?? 'password'
  )
);
const database = process.env.NEO4J_DATABASE ?? 'neo4j';
const timestamp = new Date().toISOString();

type SeedNode = {
  id: string;
  domain: DomainContext;
  typeId: string;
  typeLabel: string;
  name: string;
  properties: Record<string, string | number | boolean | null>;
};

type SeedRelationship = {
  id: string;
  relationship: string;
  source: string;
  target: string;
  properties: Record<string, string | number | boolean | null>;
};

const nodes: SeedNode[] = [
  { id: 'SEED-SC-P-100', domain: 'SUPPLY_CHAIN', typeId: 'Product', typeLabel: 'Product', name: 'AeroMax 100', properties: { sku: 'AM-100', status: 'Active', unit: 'EA' } },
  { id: 'SEED-SC-SUP-01', domain: 'SUPPLY_CHAIN', typeId: 'Supplier', typeLabel: 'Supplier', name: 'Alpine Metals', properties: { tier: 'Strategic', region: 'NA', leadTimeDays: 21 } },
  { id: 'SEED-SC-FAC-01', domain: 'SUPPLY_CHAIN', typeId: 'Facility', typeLabel: 'Facility', name: 'Atlanta Distribution Center', properties: { facilityType: 'Warehouse', region: 'NA' } },
  { id: 'SEED-SC-DF-01', domain: 'SUPPLY_CHAIN', typeId: 'DemandForecast', typeLabel: 'DemandForecast', name: 'AeroMax Q4 forecast', properties: { period: '2026-Q4', quantity: 4200, confidence: 0.86 } },

  { id: 'SEED-FI-ACC-01', domain: 'FINANCE', typeId: 'FinancialAccount', typeLabel: 'FinancialAccount', name: 'Operating Account 4401', properties: { accountType: 'Checking', currency: 'USD', balance: 1250000 } },
  { id: 'SEED-FI-TXN-01', domain: 'FINANCE', typeId: 'Transaction', typeLabel: 'Transaction', name: 'Vendor payment 88021', properties: { amount: 18450, currency: 'USD', status: 'Posted' } },
  { id: 'SEED-FI-LE-01', domain: 'FINANCE', typeId: 'LegalEntity', typeLabel: 'LegalEntity', name: 'Onto Manufacturing LLC', properties: { jurisdiction: 'US-DE', entityStatus: 'Active' } },
  { id: 'SEED-FI-ASSET-01', domain: 'FINANCE', typeId: 'Asset', typeLabel: 'Asset', name: 'Atlanta Assembly Line', properties: { assetClass: 'Equipment', bookValue: 480000 } },

  { id: 'SEED-HC-PAT-01', domain: 'HEALTHCARE', typeId: 'Patient', typeLabel: 'Patient', name: 'Jordan Lee', properties: { patientReference: 'FHIR-PAT-1001', birthYear: 1984, status: 'Active' } },
  { id: 'SEED-HC-PRAC-01', domain: 'HEALTHCARE', typeId: 'Practitioner', typeLabel: 'Practitioner', name: 'Dr. Maya Patel', properties: { specialty: 'Internal Medicine', practitionerReference: 'FHIR-PRAC-2001' } },
  { id: 'SEED-HC-ENC-01', domain: 'HEALTHCARE', typeId: 'Encounter', typeLabel: 'Encounter', name: 'Annual wellness visit', properties: { encounterReference: 'FHIR-ENC-3001', status: 'Finished' } },
  { id: 'SEED-HC-CON-01', domain: 'HEALTHCARE', typeId: 'Condition', typeLabel: 'Condition', name: 'Essential hypertension', properties: { clinicalStatus: 'Active', codeSystem: 'SNOMED-CT' } },

  { id: 'SEED-HR-EMP-01', domain: 'HR_ORG', typeId: 'Employee', typeLabel: 'Employee', name: 'Avery Morgan', properties: { employeeNumber: 'E-1042', employmentStatus: 'Active', location: 'Atlanta' } },
  { id: 'SEED-HR-MGR-01', domain: 'HR_ORG', typeId: 'Manager', typeLabel: 'Manager', name: 'Riley Chen', properties: { employeeNumber: 'E-1007', level: 'Director' } },
  { id: 'SEED-HR-DEPT-01', domain: 'HR_ORG', typeId: 'Department', typeLabel: 'Department', name: 'Operations Engineering', properties: { costCenter: 'CC-410', headcount: 42 } },
  { id: 'SEED-HR-PROJ-01', domain: 'HR_ORG', typeId: 'Project', typeLabel: 'Project', name: 'Warehouse automation', properties: { projectCode: 'PRJ-204', status: 'In Progress' } },

  { id: 'SEED-CU-ASSET-01', domain: 'CUSTOM', typeId: 'EnterpriseAsset', typeLabel: 'EnterpriseAsset', name: 'North America Operations Portfolio', properties: { owner: 'Operations', priority: 'High' } },
  { id: 'SEED-CU-UNIT-01', domain: 'CUSTOM', typeId: 'BusinessUnit', typeLabel: 'BusinessUnit', name: 'Strategic Initiatives', properties: { region: 'Global', lifecycle: 'Active' } }
];

const relationships: SeedRelationship[] = [
  { id: 'SEED-SC-R-01', relationship: 'SUPPLIES', source: 'SEED-SC-SUP-01', target: 'SEED-SC-P-100', properties: { leadTimeDays: 21, minimumOrderQty: 500 } },
  { id: 'SEED-SC-R-02', relationship: 'STORED_AT', source: 'SEED-SC-P-100', target: 'SEED-SC-FAC-01', properties: { onHand: 860, safetyStock: 500 } },
  { id: 'SEED-SC-R-03', relationship: 'FULFILLED_BY', source: 'SEED-SC-DF-01', target: 'SEED-SC-P-100', properties: { period: '2026-Q4' } },

  { id: 'SEED-FI-R-01', relationship: 'HELD_BY', source: 'SEED-FI-ACC-01', target: 'SEED-FI-LE-01', properties: { ownershipPercent: 100 } },
  { id: 'SEED-FI-R-02', relationship: 'TRANSFERRED_TO', source: 'SEED-FI-TXN-01', target: 'SEED-FI-ACC-01', properties: { settlementDate: '2026-09-01' } },
  { id: 'SEED-FI-R-03', relationship: 'SECURED_WITH', source: 'SEED-FI-ASSET-01', target: 'SEED-FI-LE-01', properties: { lienStatus: 'None' } },

  { id: 'SEED-HC-R-01', relationship: 'ATTENDED_BY', source: 'SEED-HC-ENC-01', target: 'SEED-HC-PRAC-01', properties: { role: 'Attending practitioner' } },
  { id: 'SEED-HC-R-02', relationship: 'DIAGNOSED_WITH', source: 'SEED-HC-PAT-01', target: 'SEED-HC-CON-01', properties: { recordedDate: '2026-08-18' } },
  { id: 'SEED-HC-R-03', relationship: 'TREATED_AT', source: 'SEED-HC-PAT-01', target: 'SEED-HC-ENC-01', properties: { encounterClass: 'AMB' } },

  { id: 'SEED-HR-R-01', relationship: 'REPORTS_TO', source: 'SEED-HR-EMP-01', target: 'SEED-HR-MGR-01', properties: { effectiveDate: '2025-04-01' } },
  { id: 'SEED-HR-R-02', relationship: 'ASSIGNED_TO', source: 'SEED-HR-EMP-01', target: 'SEED-HR-PROJ-01', properties: { allocationPercent: 60 } },
  { id: 'SEED-HR-R-03', relationship: 'MANAGED_BY', source: 'SEED-HR-DEPT-01', target: 'SEED-HR-MGR-01', properties: { effectiveDate: '2024-01-15' } },

  { id: 'SEED-CU-R-01', relationship: 'CUSTOM_LINK', source: 'SEED-CU-ASSET-01', target: 'SEED-CU-UNIT-01', properties: { relationshipContext: 'portfolio ownership' } }
];

const domainLabel = (domain: DomainContext): string => ({
  SUPPLY_CHAIN: 'SupplyChain',
  FINANCE: 'Finance',
  HEALTHCARE: 'Healthcare',
  HR_ORG: 'HROrg',
  CUSTOM: 'Custom'
})[domain];

try {
  await driver.verifyConnectivity();
  const session = driver.session({ database });
  try {
    await session.executeWrite(async (transaction) => {
      for (const node of nodes) {
        await transaction.run(
          `MERGE (n:Entity {id: $id})
           SET n += $properties,
             n.domain = $domain,
             n.typeId = $typeId,
             n.typeLabel = $typeLabel,
             n.secondaryLabels = $secondaryLabels,
             n.sourceSystem = 'SME_INPUT',
             n.createdAt = $createdAt,
             n.validFrom = $createdAt,
             n.validTo = '9999-12-31T23:59:59.999Z',
             n.transactionFrom = $createdAt,
             n.transactionTo = '9999-12-31T23:59:59.999Z',
             n.provenanceJson = $provenanceJson
           WITH n
           CALL apoc.create.addLabels(n, $labels) YIELD node
           RETURN node`,
          {
            id: node.id,
            domain: node.domain,
            typeId: node.typeId,
            typeLabel: node.typeLabel,
            secondaryLabels: [domainLabel(node.domain), node.typeLabel],
            labels: [domainLabel(node.domain), node.typeLabel],
            properties: { name: node.name, ...node.properties },
            createdAt: timestamp,
            provenanceJson: JSON.stringify({ sourceSystem: 'SME_INPUT', rawSourceId: node.id, extractionTimestamp: timestamp, mcpTool: 'seedDomainTemplates' })
          }
        );
      }
      for (const relationship of relationships) {
        await transaction.run(
          `MATCH (source:Entity {id: $source}), (target:Entity {id: $target})
           MERGE (source)-[r:RELATED_TO {id: $id}]->(target)
           SET r.relationship = $relationship, r += $properties,
             r.validFrom = $createdAt, r.validTo = '9999-12-31T23:59:59.999Z',
             r.transactionFrom = $createdAt, r.transactionTo = '9999-12-31T23:59:59.999Z'`,
          { ...relationship, createdAt: timestamp }
        );
      }
    });
  } finally {
    await session.close();
  }
  console.log(`Domain template data seeded: ${nodes.length} nodes, ${relationships.length} relationships across 5 domains.`);
} finally {
  await driver.close();
}
