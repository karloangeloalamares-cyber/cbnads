import { neon } from '@neondatabase/serverless';

const databaseEnabled =
  process.env.CBN_ENABLE_DATABASE === 'true' && Boolean(process.env.DATABASE_URL);

const NullishQueryFunction = () => {
  throw new Error(
    'Database mode is disabled. Set CBN_ENABLE_DATABASE=true and DATABASE_URL to enable SQL queries.'
  );
};
NullishQueryFunction.transaction = () => {
  throw new Error(
    'Database mode is disabled. Set CBN_ENABLE_DATABASE=true and DATABASE_URL to enable SQL queries.'
  );
};
const sql = databaseEnabled ? neon(process.env.DATABASE_URL) : NullishQueryFunction;

export default sql;
