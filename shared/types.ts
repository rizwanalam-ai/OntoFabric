export type Primitive = string | number | boolean | null;

export type PrimitiveDictionary = Record<string, Primitive>;

export type SourceSystem = 'ERP' | 'CRM' | 'EXCEL' | 'PDF' | 'SME_INPUT' | 'SOP';

export type DomainContext = 'SUPPLY_CHAIN' | 'FINANCE' | 'HEALTHCARE' | 'HR_ORG' | 'CUSTOM';

export interface DomainSchemaConfig {
  domain: DomainContext;
  displayName: string;
  allowedNodeLabels: string[];
  allowedRelationships: string[];
  systemPromptRules: string;
}

export const DEFAULT_TEMPORAL_END = '9999-12-31T23:59:59.999Z';

export interface TemporalMetadata {
  validFrom: string;
  validTo: string;
  transactionFrom: string;
  transactionTo: string;
}

export interface NodeProvenance {
  sourceSystem: string;
  rawSourceId: string;
  filePath?: string;
  lineNumber?: number;
  extractionTimestamp: string;
  rawPayload?: string;
  mcpTool?: string;
}

export interface EntityType {
  id: string;
  label: string;
  attributes: PrimitiveDictionary;
  attributeTypes?: Record<string, 'string' | 'number' | 'boolean' | 'date'>;
  primaryKeys?: string[];
  requiredProperties?: string[];
}

export interface RelationType {
  id: string;
  sourceTypeId: string;
  targetTypeId: string;
  relationName: string;
}

export interface GraphNode extends TemporalMetadata {
  id: string;
  type: EntityType;
  domain: DomainContext;
  secondaryLabels: string[];
  sourceSystem: SourceSystem;
  properties: PrimitiveDictionary;
  createdAt: string;
  provenance: NodeProvenance;
}

export interface GraphEdge extends TemporalMetadata {
  id: string;
  source: string;
  target: string;
  relationship: string;
  properties: PrimitiveDictionary;
}

export interface IngestionPayload {
  sourceType: SourceSystem;
  filePathOrUrl: string;
  rawContent: string;
  metadata: PrimitiveDictionary;
}

export type SopNodeLabel = 'Product' | 'Component' | 'Facility' | 'WorkCenter' | 'Supplier' | 'Customer' | 'DemandForecast';

export type SopRelationshipType =
  | 'HAS_DEMAND'
  | 'FOR_PRODUCT'
  | 'REQUIRES_BOM'
  | 'STORED_AT'
  | 'PRODUCED_AT'
  | 'SUPPLIED_BY'
  | 'SHIPPED_TO'
  | 'FULFILLED_BY';

export interface SopNode {
  id: string;
  label: SopNodeLabel;
  properties: PrimitiveDictionary;
}

export interface SopRelationship {
  id: string;
  type: SopRelationshipType;
  source: string;
  target: string;
  properties: PrimitiveDictionary;
}

export interface SopGraphPayload {
  nodes: SopNode[];
  relationships: SopRelationship[];
}

export interface SopPlanningSummary {
  demand: Array<{ period: string; quantity: number }>;
  inventory: Array<{ productId: string; facilityId: string; onHand: number; safetyStock: number; reorderPoint: number }>;
  supplierRisks: Array<{ supplierId: string; supplierName: string; leadTimeDays: number; minimumOrderQty: number }>;
  capacity: Array<{ workCenterId: string; workCenterName: string; capacity: number; unitCost: number }>;
}
