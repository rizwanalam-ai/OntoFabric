import snowflake from 'snowflake-sdk';
import type { Connection, SnowflakeError } from 'snowflake-sdk';

const validateIdentifier = (value: string, name: string): string => {
  const identifier = value.trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?$/.test(identifier)) {
    throw new Error(`Invalid Snowflake ${name}: ${value}`);
  }
  return identifier;
};

const quoteIdentifier = (identifier: string): string => identifier.split('.').map((part) => `"${part.replace(/"/g, '""')}"`).join('.');

const normalizeLimit = (limit: number): number => {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('Snowflake row limit must be a positive integer.');
  return Math.min(limit, 10000);
};

const createSnowflakeConnection = (): Connection => snowflake.createConnection({
  account: process.env.SNOWFLAKE_ACCOUNT,
  username: process.env.SNOWFLAKE_USERNAME,
  password: process.env.SNOWFLAKE_PASSWORD,
  database: process.env.SNOWFLAKE_DATABASE,
  schema: process.env.SNOWFLAKE_SCHEMA,
  warehouse: process.env.SNOWFLAKE_WAREHOUSE
});

const connect = (connection: Connection): Promise<Connection> => new Promise((resolve, reject) => {
  connection.connect((error, connectedConnection) => {
    if (error) reject(error);
    else resolve(connectedConnection);
  });
});

const destroy = (connection: Connection): Promise<void> => new Promise((resolve) => {
  connection.destroy(() => resolve());
});

const execute = (connection: Connection, sqlText: string): Promise<Record<string, unknown>[]> => new Promise((resolve, reject) => {
  connection.execute({
    sqlText,
    complete: (error: SnowflakeError | undefined, _statement, rows) => {
      if (error) reject(error);
      else resolve((rows ?? []) as Record<string, unknown>[]);
    }
  });
});

export const fetchSnowflakeTableData = async (tableName: string, limit = 1000): Promise<Record<string, unknown>[]> => {
  const sqlText = `SELECT * FROM ${quoteIdentifier(validateIdentifier(tableName, 'table name'))} LIMIT ${normalizeLimit(limit)}`;
  const connection = createSnowflakeConnection();
  try {
    await connect(connection);
    return await execute(connection, sqlText);
  } catch (error) {
    throw new Error(`Failed to fetch Snowflake table data: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await destroy(connection);
  }
};
