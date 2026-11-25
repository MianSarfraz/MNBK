// @vitest-environment node
// Runs the real supabase/setup.sql in an embedded Postgres and checks the brief's eight scenarios.
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const SETUP = fs.readFileSync(path.resolve(__dirname, "../../supabase/setup.sql"), "utf8");
const U = "11111111-1111-1111-1111-111111111111";
const NINE = ["Awal", "Awal Barshi", "Special", "Awal Machine", "Doum", "Tirak", "9t Awal", "9t Doum", "9t Tirak"];
let db: PGlite;
const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await q<T>(sql, params))[0]!;

async function freshDb() {
  const d = new PGlite();
  await d.exec(`create role authenticated; create role service_role; create role anon; create schema auth; create schema storage;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create table storage.buckets (id text primary key, name text, public boolean);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security; grant usage on schema public, auth, storage to authenticated;`);
  return d;
}
const type = (name: string) => one<{ id: string }>(`select id from qualities where kind='nakasi' and name_en=$1 and is_active`, [name]).then((r) => r.id);
const customer = (name: string) => one<{ id: string }>(`select id from parties where kind='customer' and name=$1`, [name]).then((r) => r.id);
const stock = (name: string) => one<{ opening: number; produced: number; sold: number; balance: number }>(`select opening, produced, sold, balance from finished_stock where name_en=$1`, [name]);
const account = (name: string) => one<{ purchases: number; payments: number; outstanding: number; bricks: number }>(`select purchases, payments, outstanding, bricks from customer_accounts where name=$1`, [name]);
async function sell(cust: string, brick: string, qty: number, rate: number, paid = 0) {
  const items = JSON.stringify([{ quality_id: await type(brick), quantity: qty, rate_per_1000: rate }]);
  return one<{ id: string }>(`select public.create_sale('2026-11-20', $1, 'TRL-1', 'Driver', 0, 0, null, $2::jsonb, $3, 'cash', $4) as id`, [await customer(cust), items, paid, U]).then((r) => r.id);
}

beforeAll(async () => {
  db = await freshDb();
  await db.exec(SETUP);
  await db.exec(`insert into auth.users values ('${U}','a@x','{"full_name":"Sarfraz"}');
    set role authenticated; select set_config('test.uid','${U}',false); select public.claim_owner_role();`);
}, 60_000);

describe("setup", () => {
  it("has exactly the nine stock brick types, in order", async () => {
    const rows = await q<{ name_en: string }>(`select name_en from qualities where kind='nakasi' and is_active order by sort_order`);
    expect(rows.map((r) => r.name_en)).toEqual(NINE);
    const stockRows = await q<{ name_en: string }>(`select name_en from finished_stock where is_active order by sort_order`);
    expect(stockRows.map((r) => r.name_en)).toEqual(NINE);
  });
  it("has the three roray sold by load, outside stock", async () => {
    const rows = await q<{ name_en: string; unit: string }>(`select name_en, unit from qualities where kind='sale' and is_active order by sort_order`);
    expect(rows).toEqual([{ name_en: "Trali Roray", unit: "load" }, { name_en: "Rehra Roray", unit: "load" }, { name_en: "Rehra 9T Roray", unit: "load" }]);
  });
  it("has the six starting customers, Nakad Bikri as cash", async () => {
    const rows = await q<{ name: string; is_cash: boolean }>(`select name, is_cash from parties where kind='customer' order by ref_no`);
    expect(rows.map((r) => r.name)).toEqual(["Imran urf polu", "Arshad Jamadar", "Rana Shani", "Dilshad saleman", "Shaukat Rehmani", "Nakad Bikri"]);
    expect(rows.find((r) => r.name === "Nakad Bikri")!.is_cash).toBe(true);
  });
});

describe("the eight scenarios", () => {
  it("1 — opening stock 50,000 Awal", async () => {
    await q(`insert into stock_adjustments (stock, quality_id, entry_date, delta, reason, is_opening) values ('finished', $1, '2026-11-01', 50000, 'Opening stock', true)`, [await type("Awal")]);
    expect(await stock("Awal")).toMatchObject({ opening: 50000, balance: 50000 });
  });
  it("2 — production of 20,000 Awal after firing → 70,000 available", async () => {
    await q(`insert into kiln_entries (stage, entry_date, quality_id, count, firing_ref) values ('nakasi', '2026-11-10', $1, 20000, 'Firing 1')`, [await type("Awal")]);
    const s = await stock("Awal");
    expect(s.opening + s.produced).toBe(70000);
    expect(s.balance).toBe(70000);
  });
  it("3 — sell 10,000 Awal to Imran → 60,000 left; on his account", async () => {
    await sell("Imran urf polu", "Awal", 10000, 18000);
    expect((await stock("Awal")).balance).toBe(60000);
    expect(await account("Imran urf polu")).toMatchObject({ bricks: 10000, purchases: 180000, outstanding: 180000 });
    const lines = await q(`select quantity, amount from sale_lines where customer_id=$1`, [await customer("Imran urf polu")]);
    expect(lines).toEqual([{ quantity: 10000, amount: 180000 }]);
  });
  it("4 — payment of 100,000 from Imran lowers what he owes by 100,000", async () => {
    await q(`insert into transactions (entry_date, party_id, kind, direction, amount, method, handler_user_id, category, reference, created_by)
             values ('2026-11-21', $1, 'sale_receipt', 'in', 100000, 'bank', $2, 'payment', 'TXN-778', $2)`, [await customer("Imran urf polu"), U]);
    expect(await account("Imran urf polu")).toMatchObject({ payments: 100000, outstanding: 80000 });
  });
  it("5 — Nakad Bikri 2,000 Doum: stock down 2,000, paid automatically, nothing owed", async () => {
    await q(`insert into stock_adjustments (stock, quality_id, entry_date, delta, reason, is_opening) values ('finished', $1, '2026-11-01', 10000, 'Opening stock', true)`, [await type("Doum")]);
    await sell("Nakad Bikri", "Doum", 2000, 15000, 999999); // "received now" is ignored: always exactly the total
    expect((await stock("Doum")).balance).toBe(8000);
    expect(await account("Nakad Bikri")).toMatchObject({ purchases: 30000, payments: 30000, outstanding: 0 });
  });
  it("6 — a new customer appears; duplicates are refused", async () => {
    await q(`insert into parties (kind, name, created_by) values ('customer', 'Haji Aslam', $1)`, [U]);
    expect((await account("Haji Aslam")).outstanding).toBe(0);
    await expect(q(`insert into parties (kind, name, created_by) values ('customer', ' haji aslam ', $1)`, [U])).rejects.toThrow(/unique|duplicate/i);
  });
  it("7 — each brick type keeps its own stock", async () => {
    const names = ["Awal Barshi", "Special", "Awal Machine", "Tirak", "9t Awal", "9t Doum", "9t Tirak"];
    for (const [i, n] of names.entries()) {
      await q(`insert into stock_adjustments (stock, quality_id, entry_date, delta, reason, is_opening) values ('finished', $1, '2026-11-01', $2, 'Opening stock', true)`, [await type(n), 10000 + i * 1000]);
      await sell("Rana Shani", n, 1000 + i * 100, 16000);
    }
    for (const [i, n] of names.entries()) expect((await stock(n)).balance).toBe(10000 + i * 1000 - (1000 + i * 100));
    expect((await stock("Awal")).balance).toBe(60000);
    expect((await stock("Doum")).balance).toBe(8000);
  });
  it("8 — editing a sale recalculates stock, the customer account and Nakad's auto-payment; history is kept", async () => {
    const sid = await sell("Nakad Bikri", "Awal", 1000, 18000);
    const item = await one<{ id: string }>(`select id from sale_items where sale_id=$1`, [sid]);
    await q(`update sale_items set quantity = 3000 where id=$1`, [item.id]);
    expect((await stock("Awal")).balance).toBe(57000);
    expect(await account("Nakad Bikri")).toMatchObject({ purchases: 30000 + 54000, payments: 30000 + 54000, outstanding: 0 });
    const audit = await one<{ n: number }>(`select count(*)::int n from audit_log where table_name='sale_items' and row_id=$1 and action='UPDATE'`, [item.id]);
    expect(audit.n).toBe(1);
    await q(`update sales set deleted_at = now() where id=$1`, [sid]);
    expect((await stock("Awal")).balance).toBe(60000);
    expect((await account("Nakad Bikri")).outstanding).toBe(0);
  });
  it("roray are sold by the load: amount = loads × rate, stock untouched, Nakad still auto-paid", async () => {
    const roray = (n: string) => one<{ id: string }>(`select id from qualities where kind='sale' and name_en=$1`, [n]).then((r) => r.id);
    const before = await q(`select quality_id, balance from finished_stock order by quality_id`);
    await q(`insert into parties (kind, name, created_by) values ('customer', 'Roray Buyer', $1)`, [U]);
    const items = JSON.stringify([{ quality_id: await roray("Trali Roray"), quantity: 2, rate_per_1000: 6500 }, { quality_id: await type("Awal"), quantity: 1000, rate_per_1000: 18000 }]);
    const sid = (await one<{ id: string }>(`select public.create_sale('2026-11-21', $1, null, null, 0, 0, null, $2::jsonb, 0, 'cash', null) as id`, [await customer("Roray Buyer"), items])).id;
    expect(await one(`select gross, bricks, loads from sale_totals where sale_id=$1`, [sid])).toEqual({ gross: 13000 + 18000, bricks: 1000, loads: 2 });
    expect(await account("Roray Buyer")).toMatchObject({ purchases: 31000, bricks: 1000, outstanding: 31000 });
    const line = await one(`select amount, unit from sale_lines where sale_id=$1 and unit='load'`, [sid]);
    expect(line).toEqual({ amount: 13000, unit: "load" });
    expect((await stock("Awal")).balance).toBe(59000);
    await q(`update sales set deleted_at=now() where id=$1`, [sid]);
    expect(await q(`select quality_id, balance from finished_stock order by quality_id`)).toEqual(before);
    const nk = JSON.stringify([{ quality_id: await roray("Rehra Roray"), quantity: 3, rate_per_1000: 1500 }]);
    const nid = (await one<{ id: string }>(`select public.create_sale('2026-11-21', $1, null, null, 0, 0, null, $2::jsonb, 0, 'cash', null) as id`, [await customer("Nakad Bikri"), nk])).id;
    expect(await one(`select amount from transactions where sale_id=$1 and category='cash_sale' and deleted_at is null`, [nid])).toEqual({ amount: 4500 });
    await q(`update sales set deleted_at=now() where id=$1`, [nid]);
  });
  it("a roray can't be made stock-tracked", async () => {
    await expect(q(`update qualities set kind='nakasi' where name_en='Trali Roray'`)).rejects.toThrow(/qualities_load_is_sale_only/);
  });
  it("brief's example: 10,000 Awal @18,000 + 5,000 Doum @15,000 = 255,000; paid 150,000 → owes 105,000", async () => {
    await q(`insert into parties (kind, name, created_by) values ('customer', 'Example Customer', $1)`, [U]);
    await sell("Example Customer", "Awal", 10000, 18000);
    await sell("Example Customer", "Doum", 5000, 15000);
    await q(`insert into transactions (entry_date, party_id, kind, direction, amount, method, handler_user_id, category, created_by)
             values ('2026-11-22', $1, 'sale_receipt', 'in', 150000, 'cash', $2, 'payment', $2)`, [await customer("Example Customer"), U]);
    expect(await account("Example Customer")).toMatchObject({ purchases: 255000, payments: 150000, outstanding: 105000 });
  });
  it("overpayment shows as advance (negative outstanding), not an error", async () => {
    await q(`insert into transactions (entry_date, party_id, kind, direction, amount, method, handler_user_id, category, created_by)
             values ('2026-11-23', $1, 'sale_receipt', 'in', 120000, 'cash', $2, 'payment', $2)`, [await customer("Example Customer"), U]);
    expect((await account("Example Customer")).outstanding).toBe(-15000);
  });
  it("Nakad Bikri cannot be removed or switched off", async () => {
    await expect(q(`update parties set is_active=false where name='Nakad Bikri'`)).rejects.toThrow(/permanent/);
    await expect(q(`update parties set deleted_at=now() where name='Nakad Bikri'`)).rejects.toThrow(/permanent/);
  });
});

describe("setup.sql is safe to re-run", () => {
  it("running it again keeps all data and adds nothing twice", async () => {
    const before = await one(`select (select count(*) from qualities)::int q, (select count(*) from parties)::int p, (select sum(balance) from finished_stock)::int s`);
    await db.exec(`reset role`);
    await db.exec(SETUP);
    await db.exec(`set role authenticated`);
    const after = await one(`select (select count(*) from qualities)::int q, (select count(*) from parties)::int p, (select sum(balance) from finished_stock)::int s`);
    expect(after).toEqual(before);
  }, 60_000);
});

describe("brick types are owner-editable", () => {
  it("a brick type an owner adds shows in stock and stays on after setup.sql is re-run", async () => {
    await q(`insert into qualities (name_en, name_ur, kind, category, sort_order, created_by) values ('Pakki', 'Pakki', 'nakasi', 'special', 10, $1)`, [U]);
    await q(`insert into stock_adjustments (stock, quality_id, entry_date, delta, reason, is_opening) values ('finished', $1, '2026-11-01', 3000, 'Opening stock', true)`, [await type("Pakki")]);
    await db.exec(`reset role`);
    await db.exec(SETUP);
    await db.exec(`set role authenticated`);
    expect(await stock("Pakki")).toMatchObject({ opening: 3000, balance: 3000 });
    const active = await q<{ name_en: string }>(`select name_en from qualities where kind='nakasi' and is_active order by sort_order`);
    expect(active.map((r) => r.name_en)).toEqual([...NINE, "Pakki"]);
  }, 60_000);
  it("refuses a second brick type with the same name", async () => {
    await expect(q(`insert into qualities (name_en, name_ur, kind, created_by) values (' pakki ', 'x', 'nakasi', $1)`, [U])).rejects.toThrow(/qualities_unique_name/);
  });
});

describe("upgrading a project that ran the older setup (migrations up to 0006)", () => {
  it("keeps old sales: a sale of the old 'Awal' sale-quality still counts against Awal stock", async () => {
    const old = await freshDb();
    const dir = path.resolve(__dirname, "../../drizzle/migrations");
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".sql") && f < "0007").sort()) await old.exec(fs.readFileSync(path.join(dir, f), "utf8"));
    await old.exec(`insert into auth.users values ('${U}','a@x','{}'); set role authenticated; select set_config('test.uid','${U}',false); select public.claim_owner_role();`);
    const c = (await old.query<{ id: string }>(`insert into parties (kind, name, created_by) values ('customer', 'Old Customer', '${U}') returning id`)).rows[0]!.id;
    const saleAwal = (await old.query<{ id: string }>(`select id from qualities where kind='sale' and name_en='Awal'`)).rows[0]!.id;
    await old.query(`select public.create_sale('2026-11-15', $1, null, null, 0, 0, null, $2::jsonb, 0, 'cash', null)`, [c, JSON.stringify([{ quality_id: saleAwal, quantity: 4000, rate_per_1000: 18000 }])]);
    const old9t = (await old.query<{ id: string }>(`select id from qualities where kind='sale' and name_en='9T Awal'`)).rows[0]!.id;
    const oldBrshi = (await old.query<{ id: string }>(`select id from qualities where kind='sale' and name_en='Awal Brshi'`)).rows[0]!.id;
    await old.query(`select public.create_sale('2026-11-15', $1, null, null, 0, 0, null, $2::jsonb, 0, 'cash', null)`, [c, JSON.stringify([{ quality_id: old9t, quantity: 500, rate_per_1000: 10000 }, { quality_id: oldBrshi, quantity: 200, rate_per_1000: 10000 }])]);
    await old.exec(`reset role`);
    await old.exec(SETUP);
    await old.exec(`set role authenticated`);
    const s = (await old.query<{ sold: number; balance: number }>(`select sold, balance from finished_stock where name_en='Awal'`)).rows[0]!;
    expect(s).toEqual({ sold: 4000, balance: -4000 });
    const types = (await old.query<{ n: number }>(`select count(*)::int n from qualities where kind='nakasi' and is_active`)).rows[0]!.n;
    expect(types).toBe(9);
    const sold = (await old.query<{ name_en: string; sold: number }>(`select name_en, sold from finished_stock where name_en in ('9t Awal', 'Awal Barshi') order by name_en`)).rows;
    expect(sold).toEqual([{ name_en: "9t Awal", sold: 500 }, { name_en: "Awal Barshi", sold: 200 }]);
    const acct = (await old.query<{ outstanding: number }>(`select outstanding from customer_accounts where name='Old Customer'`)).rows[0]!;
    expect(acct.outstanding).toBe(72000 + 7000);
  }, 60_000);

  it("turns types an owner added as 'sale' (missing from stock) into brick types, and keeps them on", async () => {
    const old = await freshDb();
    const dir = path.resolve(__dirname, "../../drizzle/migrations");
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".sql") && f < "0008").sort()) await old.exec(fs.readFileSync(path.join(dir, f), "utf8"));
    await old.exec(`insert into auth.users values ('${U}','a@x','{}'); set role authenticated; select set_config('test.uid','${U}',false); select public.claim_owner_role();`);
    await old.exec(`insert into qualities (name_en, name_ur, kind, sort_order, created_by) values ('Khingar', 'Khingar', 'sale', 100, '${U}'), ('Doum', 'Doum', 'sale', 100, '${U}');
      insert into qualities (name_en, name_ur, kind, sort_order, created_by, is_active) values ('Pakki', 'Pakki', 'nakasi', 100, '${U}', false);`);
    await old.exec(`reset role`);
    await old.exec(SETUP);
    await old.exec(SETUP);
    const rows = (await old.query<{ name_en: string }>(`select name_en from finished_stock where is_active order by sort_order`)).rows.map((r) => r.name_en);
    expect(rows).toEqual([...NINE, "Pakki", "Khingar"]);
    const doum = (await old.query<{ linked: boolean }>(`select stock_quality_id is not null linked from qualities where kind='sale' and name_en='Doum' and created_by='${U}'`)).rows[0]!;
    expect(doum.linked).toBe(true);
    // A type switched off after the repair stays off on later re-runs.
    await old.exec(`update qualities set is_active=false where name_en='Khingar'`);
    await old.exec(SETUP);
    expect((await old.query<{ a: boolean }>(`select is_active a from qualities where name_en='Khingar'`)).rows[0]!.a).toBe(false);
  }, 60_000);
});
