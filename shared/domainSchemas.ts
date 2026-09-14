import type { DomainContext, DomainSchemaConfig } from './types.js';

export const HEALTHCARE_SCHEMA: DomainSchemaConfig = {
  domain: 'HEALTHCARE',
  displayName: 'Healthcare (HL7 FHIR)',
  allowedNodeLabels: ['Patient', 'Practitioner', 'Encounter', 'Condition', 'Medication'],
  allowedRelationships: ['DIAGNOSED_WITH', 'PRESCRIBED', 'TREATED_AT', 'ATTENDED_BY'],
  systemPromptRules: 'Use HL7 FHIR-aligned entities and relationships. Preserve patient and clinical context, and do not infer diagnoses or treatments that are not present in the source data.'
};

export const FINANCE_SCHEMA: DomainSchemaConfig = {
  domain: 'FINANCE',
  displayName: 'Finance (FIBO)',
  allowedNodeLabels: ['FinancialAccount', 'Transaction', 'LegalEntity', 'LoanContract', 'Asset'],
  allowedRelationships: ['TRANSFERRED_TO', 'ISSUED_BY', 'HELD_BY', 'SECURED_WITH'],
  systemPromptRules: 'Use FIBO-aligned financial concepts and relationships. Preserve transaction and ownership context, and do not infer financial activity that is not present in the source data.'
};

export const SUPPLY_CHAIN_SCHEMA: DomainSchemaConfig = {
  domain: 'SUPPLY_CHAIN',
  displayName: 'Supply Chain (SCOR)',
  allowedNodeLabels: ['Product', 'Component', 'Supplier', 'Facility', 'DemandForecast'],
  allowedRelationships: ['SUPPLIES', 'STORED_AT', 'FULFILLED_BY', 'REQUIRES_BOM'],
  systemPromptRules: 'Use SCOR-aligned supply-chain entities and relationships. Preserve product, facility, supplier, and demand context, and do not infer logistics events that are not present in the source data.'
};

export const HR_ORG_SCHEMA: DomainSchemaConfig = {
  domain: 'HR_ORG',
  displayName: 'Human Resources and Organization (OrgGraph)',
  allowedNodeLabels: ['Employee', 'Manager', 'Department', 'Project', 'CostCenter'],
  allowedRelationships: ['REPORTS_TO', 'ASSIGNED_TO', 'MANAGED_BY', 'ALLOCATED_TO'],
  systemPromptRules: 'Use OrgGraph-aligned organizational entities and relationships. Preserve reporting, assignment, and cost-allocation context, and do not infer employment facts that are not present in the source data.'
};

export const CUSTOM_SCHEMA: DomainSchemaConfig = {
  domain: 'CUSTOM',
  displayName: 'Custom',
  allowedNodeLabels: [],
  allowedRelationships: [],
  systemPromptRules: 'Use only the node labels and relationships explicitly configured for this custom domain. Do not infer domain-specific entities or relationships.'
};

export const DOMAIN_SCHEMAS: Record<DomainContext, DomainSchemaConfig> = {
  SUPPLY_CHAIN: SUPPLY_CHAIN_SCHEMA,
  FINANCE: FINANCE_SCHEMA,
  HEALTHCARE: HEALTHCARE_SCHEMA,
  HR_ORG: HR_ORG_SCHEMA,
  CUSTOM: CUSTOM_SCHEMA
};

export const domainSchemas = DOMAIN_SCHEMAS;

export const updateDomainSchema = (config: DomainSchemaConfig): void => {
  domainSchemas[config.domain] = config;
};