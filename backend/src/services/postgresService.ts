import { Pool, type PoolClient } from 'pg';

let postgresPool: Pool | undefined;

const getPostgresPool = (): Pool => {
  postgresPool ??= new Pool({
    host: process.env.POSTGRES_HOST,
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    database: process.env.POSTGRES_DB,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    ssl: {
      rejectUnauthorized: false
    }
  });
  return postgresPool;
};

const validateIdentifier = (value: string, name: string): string => {
  const identifier = value.trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?$/.test(identifier)) {
    throw new Error(`Invalid PostgreSQL ${name}: ${value}`);
  }
  return identifier;
};

const quoteIdentifier = (identifier: string): string => identifier.split('.').map((part) => `"${part}"`).join('.');

const normalizeLimit = (limit: number): number => {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('PostgreSQL row limit must be a positive integer.');
  return Math.min(limit, 10000);
};

export const fetchPostgresTableData = async (tableName: string, limit = 1000): Promise<Record<string, unknown>[]> => {
  const safeTableName = quoteIdentifier(validateIdentifier(tableName, 'table name'));
  const client = await getPostgresPool().connect();
  try {
    const result = await client.query(`SELECT * FROM ${safeTableName} LIMIT $1`, [normalizeLimit(limit)]);
    return result.rows as Record<string, unknown>[];
  } catch (error) {
    throw new Error(`Failed to fetch PostgreSQL table data: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    client.release();
  }
};

export interface PostgresForeignKey {
  columnName: string;
  foreignTableName: string;
  foreignColumnName: string;
}

export const fetchPostgresForeignKeys = async (tableName: string): Promise<PostgresForeignKey[]> => {
  const safeTableName = validateIdentifier(tableName, 'table name');
  const [schemaName, relationName] = safeTableName.includes('.') ? safeTableName.split('.') : ['public', safeTableName];
  const client: PoolClient = await getPostgresPool().connect();
  try {
    const result = await client.query<PostgresForeignKey>(
      `
        SELECT
          kcu.column_name AS "columnName",
          ccu.table_name AS "foreignTableName",
          ccu.column_name AS "foreignColumnName"
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = $1
          AND tc.table_name = $2
        ORDER BY kcu.ordinal_position
      `,
      [schemaName, relationName]
    );
    return result.rows;
  } catch (error) {
    throw new Error(`Failed to fetch PostgreSQL foreign keys: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    client.release();
  }
};

export const closePostgresPool = async (): Promise<void> => {
  if (postgresPool) await postgresPool.end();
  postgresPool = undefined;
};
