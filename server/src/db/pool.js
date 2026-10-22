// Подключение к PostgreSQL (один пул на процесс).
import pg from "pg";
import { config } from "../config.js";

// numeric → number (суммы до 10^14 помещаются в double без потерь копеек)
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
// date → строка 'YYYY-MM-DD' без сдвига часового пояса
pg.types.setTypeParser(1082, (v) => v);

export const pool = new pg.Pool({ connectionString: config.databaseUrl, ssl: config.databaseSsl, max: 5 });

export const q = (text, params) => pool.query(text, params);

export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const res = await fn(client);
    await client.query("COMMIT");
    return res;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
