import pg from 'pg';

// One pool for the process; repositories take it as an argument so tests can pass a fake.
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
export type Db = Pick<pg.Pool, 'query'>;
