import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

import { fetchPostgresForeignKeys, fetchPostgresTableData } from '../services/postgresService.js';
import { syncRelationalTableToNeo4j } from '../services/relationalGraphMapper.js';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env') });

const main = async (): Promise<void> => {
  const tableName = process.env.SMOKE_TABLE_NAME ?? 'organizations';
  const primaryKeyColumn = process.env.SMOKE_PRIMARY_KEY ?? 'id';
  const entityLabel = process.env.SMOKE_ENTITY_LABEL ?? 'Organization';
  const domain = process.env.SMOKE_DOMAIN ?? 'CUSTOM';
  const limit = Number(process.env.SMOKE_LIMIT ?? 3);

  console.log(`Running PostgreSQL sync smoke test for table=${tableName}, pk=${primaryKeyColumn}, entity=${entityLabel}, domain=${domain}, limit=${limit}`);

  const records = await fetchPostgresTableData(tableName, limit);
  const foreignKeys = await fetchPostgresForeignKeys(tableName);

  if (records.length === 0) {
    throw new Error(`Table ${tableName} returned no rows.`);
  }

  const result = await syncRelationalTableToNeo4j(
    {
      sourceType: 'POSTGRES',
      tableName,
      primaryKeyColumn,
      entityLabel,
      domain: domain as 'CUSTOM',
      limit
    },
    records,
    foreignKeys.map((foreignKey) => ({
      ...foreignKey,
      relationshipType: `${tableName.split('.').pop() ?? tableName}_HAS_${(foreignKey.foreignTableName || 'TARGET').replace(/[^A-Za-z0-9_]/g, '_').toUpperCase()}`
    }))
  );

  console.log('Smoke test passed:', JSON.stringify(result));
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('Smoke test failed:', message);
  process.exit(1);
});
