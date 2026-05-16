import { neon } from '@neondatabase/serverless';
import { auth } from '../../../lib/auth';

export async function GET() {
  await auth();
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`select 1`;
  return Response.json(rows);
}
