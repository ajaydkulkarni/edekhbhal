import postgres from "postgres";

let runtimeSql: ReturnType<typeof postgres> | undefined;

export function getRuntimeSql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured.");

  runtimeSql ??= postgres(url, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
    ssl: "require",
  });

  return runtimeSql;
}

export async function withAuthSubject<T>(
  authSubject: string,
  fn: (tx: postgres.TransactionSql<{}>) => Promise<T>,
): Promise<T> {
  const sql = getRuntimeSql();
  const result = await sql.begin(async (tx) => {
    await tx`select set_config('app.auth_subject', ${authSubject}, true)`;
    return fn(tx);
  });
  return result as T;
}
