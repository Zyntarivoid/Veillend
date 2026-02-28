import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Client as PgClient } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

// Minimal Postgres-backed adapter that mimics the subset of Supabase client used
class PgQueryBuilder {
  private tableName: string;
  private whereClauses: { field: string; op: string; value: any }[] = [];
  private orderBy: { column: string; asc: boolean } | null = null;
  private returning = false;
  private insertData: any = null;
  private updateData: any = null;
  constructor(table: string, private pg: PgClient) {
    this.tableName = table;
  }
  select(_sel?: string) {
    // ignore projection for now
    return this;
  }
  eq(field: string, value: any) {
    this.whereClauses.push({ field, op: '=', value });
    return this;
  }
  order(column: string, opts?: { ascending?: boolean }) {
    this.orderBy = { column, asc: !!opts?.ascending };
    return this;
  }
  single() {
    // execute select with LIMIT 1
    return this.executeSelect(true);
  }
  async executeSelect(single = false) {
    const where = this.whereClauses.map((w, i) => `${w.field} ${w.op} $${i + 1}`).join(' AND ');
    const values = this.whereClauses.map((w) => w.value);
    let q = `SELECT * FROM ${this.tableName}` + (where ? ` WHERE ${where}` : '');
    if (this.orderBy) q += ` ORDER BY ${this.orderBy.column} ${this.orderBy.asc ? 'ASC' : 'DESC'}`;
    if (single) q += ' LIMIT 1';
    try {
      const res = await this.pg.query(q, values);
      return { data: single ? res.rows[0] ?? null : res.rows, error: null };
    } catch (err: any) {
      return { data: null, error: { message: err.message } };
    }
  }
  insert(obj: any) {
    this.insertData = obj;
    return this;
  }
  update(obj: any) {
    this.updateData = obj;
    return this;
  }
  async selectReturnSingle() {
    // for insert/update .select().single() semantics
    if (this.insertData) {
      const keys = Object.keys(this.insertData);
      const vals = Object.values(this.insertData);
      const cols = keys.join(', ');
      const params = keys.map((_, i) => `$${i + 1}`).join(', ');
      const q = `INSERT INTO ${this.tableName} (${cols}) VALUES (${params}) RETURNING *`;
      try {
        const res = await this.pg.query(q, vals);
        return { data: res.rows[0], error: null };
      } catch (err: any) {
        return { data: null, error: { message: err.message } };
      }
    }
    if (this.updateData) {
      const keys = Object.keys(this.updateData);
      const vals = Object.values(this.updateData);
      const set = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
      // where clause params follow
      const whereVals = this.whereClauses.map((w) => w.value);
      const where = this.whereClauses.map((w, i) => `${w.field} ${w.op} $${keys.length + i + 1}`).join(' AND ');
      const q = `UPDATE ${this.tableName} SET ${set}` + (where ? ` WHERE ${where}` : '') + ' RETURNING *';
      try {
        const res = await this.pg.query(q, [...vals, ...whereVals]);
        return { data: res.rows[0], error: null };
      } catch (err: any) {
        return { data: null, error: { message: err.message } };
      }
    }
    return { data: null, error: { message: 'No insert/update data provided' } };
  }
}

@Injectable()
export class SupabaseService implements OnModuleInit {
  private supabase: SupabaseClient | null = null;
  private pgClient: PgClient | null = null;
  private readonly logger = new Logger(SupabaseService.name);

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_KEY');
    const useSupabase = this.configService.get<string>('USE_SUPABASE');

    if (!supabaseUrl || !supabaseKey) {
      console.warn('Supabase URL or Key not found in environment variables; falling back to Postgres if configured');
    }

    if (supabaseUrl && supabaseKey && (useSupabase === undefined || useSupabase === 'true' || useSupabase === '1')) {
      this.supabase = createClient(supabaseUrl, supabaseKey);
      this.logger.log('Supabase client initialized');
      return;
    }

    // Setup Postgres fallback
    const databaseUrl = this.configService.get<string>('DATABASE_URL');
    if (!databaseUrl) {
      this.logger.warn('DATABASE_URL not configured; Supabase and Postgres both unavailable');
      return;
    }

    this.pgClient = new PgClient({ connectionString: databaseUrl });
    this.pgClient.connect().then(async () => {
      this.logger.log('Connected to Postgres fallback database');

      // Attempt to run local schema/migrations if available
      try {
        const schemaPath = path.join(process.cwd(), 'supabase_schema.sql');
        if (fs.existsSync(schemaPath)) {
          const sql = fs.readFileSync(schemaPath, 'utf8');
          if (sql && sql.trim().length > 0) {
            this.logger.log('Applying local Postgres schema from supabase_schema.sql');
            // Execute the SQL file (idempotent statements expected)
            await this.pgClient!.query(sql);
            this.logger.log('Local Postgres schema applied');
          }
        } else {
          this.logger.debug('No supabase_schema.sql found; skipping local schema apply');
        }
      } catch (err: any) {
        this.logger.error('Failed to apply local schema: ' + (err?.message ?? err));
      }

    }).catch((err) => {
      this.logger.error('Failed to connect to Postgres: ' + (err?.message ?? err));
      this.pgClient = null;
    });
  }

  getClient(): SupabaseClient {
    if (this.supabase) return this.supabase;
    if (!this.pgClient) {
      throw new Error('No database client available (Supabase and Postgres not configured)');
    }

    // Return a minimal adapter that supports the subset of Supabase methods used by services
    const self = this;
    return {
      from(table: string) {
        const builder = new PgQueryBuilder(table, self.pgClient as PgClient);
        // Provide .select().eq().single() chain
        return {
          select: (sel?: string) => builder.select(sel),
          eq: (field: string, value: any) => builder.eq(field, value),
          order: (column: string, opts?: any) => builder.order(column, opts),
          single: () => builder.single(),
          insert: (obj: any) => ({ select: () => builder.insert(obj).selectReturnSingle() }),
          update: (obj: any) => ({ eq: (f: string, v: any) => ({ select: () => builder.update(obj).eq(f, v).selectReturnSingle() }) }),
        } as any;
      }
    } as any;
  }
}
