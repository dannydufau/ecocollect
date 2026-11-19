// The Request Service's connection pool.
// Every query is one function call that PostgreSQL commits on its own, so the
// pool is all the service needs: no client checkout, no BEGIN / COMMIT.
import pg from 'pg';

// Type OIDs (SELECT oid, typname FROM pg_type). pg's TypeId type lists only
// the scalar types, though its getTypeParser knows the arrays too, hence the cast.
type TypeId = Parameters<typeof pg.types.getTypeParser>[0];
const DATE = 1082;
const DATE_ARRAY = 1182;
const TEXT_ARRAY = 1009 as TypeId;

// How column values are turned into JavaScript values, for this pool only
// (not pg.types.setTypeParser, which would change it for every pool in the process).
//   DATE    -> 'YYYY-MM-DD' as stored. pg's default makes a Date at local
//              midnight, which shifts the day once it is printed in UTC.
//   DATE[]  -> string[] the same way (the text-array parser).
//   Everything else keeps pg's defaults: TIMESTAMPTZ -> Date, UUID / TEXT /
//   VARCHAR -> string (also in arrays), INTEGER / SMALLINT -> number,
//   BIGINT and NUMERIC -> string (they can exceed a JS number's precision),
//   converted where they are used (requestSeq, estimatedWeightKg).
function getTypeParser(oid: number, format?: 'text' | 'binary') {
  if (oid === DATE) return (value: string) => value;
  if (oid === DATE_ARRAY) return pg.types.getTypeParser(TEXT_ARRAY);
  return pg.types.getTypeParser(oid, format);
}

export function createPool(connectionString: string): pg.Pool {
  const pool = new pg.Pool({ connectionString, types: { getTypeParser } });
  // An idle client that loses its connection emits 'error' on the pool;
  // without a listener Node would crash the process.
  pool.on('error', (err) => console.error('request db pool:', err.message));
  return pool;
}
