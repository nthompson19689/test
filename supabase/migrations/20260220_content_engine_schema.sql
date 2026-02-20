-- =============================================================================
-- AI Content Marketing Engine — Supabase Schema Migration
-- Run this entire file in the Supabase SQL Editor in one shot.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Extensions
-- ---------------------------------------------------------------------------
create extension if not exists vector with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------

-- clients
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  domain text not null,
  brand_colors jsonb,
  brand_voice_summary text,
  created_at timestamptz not null default now()
);

-- brand_guidelines
create table public.brand_guidelines (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  type text not null
    check (type in ('mission','vision','values','voice_tone','editorial_longform','editorial_shortform')),
  content text not null,
  updated_at timestamptz not null default now()
);

-- transcripts
create table public.transcripts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  title text not null,
  source_url text,
  storage_path text not null,
  recorded_at timestamptz,
  created_at timestamptz not null default now()
);

-- brand_brain_chunks
create table public.brand_brain_chunks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  source_type text not null
    check (source_type in ('content_example','webinar','transcript','resource')),
  source_url text,
  transcript_id uuid references public.transcripts (id) on delete set null,
  content text not null,
  embedding vector(1024) not null,
  created_at timestamptz not null default now()
);

-- sitemap_index
create table public.sitemap_index (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  url text not null,
  title text,
  primary_keyword text,
  published_at timestamptz,
  last_refreshed_at timestamptz,
  created_at timestamptz not null default now()
);

-- keyword_opportunities
create table public.keyword_opportunities (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  keyword text not null,
  opportunity_type text not null
    check (opportunity_type in ('refresh','net_new')),
  volume int,
  difficulty int,
  source text,
  created_at timestamptz not null default now()
);

-- competitor_snapshots
create table public.competitor_snapshots (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  competitor_name text not null,
  competitor_url text not null,
  change_summary text,
  detected_at timestamptz not null default now()
);

-- content_output
create table public.content_output (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  title text not null,
  keyword text,
  meta_description text,
  target_url text,
  body text,
  word_count int,
  status text not null
    check (status in ('draft','reviewed','delivered')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. Indexes
-- ---------------------------------------------------------------------------

-- client_id indexes on every table
create index idx_brand_guidelines_client_id   on public.brand_guidelines   (client_id);
create index idx_transcripts_client_id        on public.transcripts        (client_id);
create index idx_brand_brain_chunks_client_id on public.brand_brain_chunks (client_id);
create index idx_sitemap_index_client_id      on public.sitemap_index      (client_id);
create index idx_keyword_opps_client_id       on public.keyword_opportunities (client_id);
create index idx_competitor_snaps_client_id   on public.competitor_snapshots  (client_id);
create index idx_content_output_client_id     on public.content_output     (client_id);

-- HNSW vector index for semantic search (Voyage AI 1024-dim embeddings)
create index idx_brand_brain_chunks_embedding
  on public.brand_brain_chunks
  using hnsw (embedding vector_cosine_ops);

-- Cleanup-job indexes (used by pg_cron weekly purge)
create index idx_keyword_opps_created_at      on public.keyword_opportunities (created_at);
create index idx_competitor_snaps_detected_at  on public.competitor_snapshots  (detected_at);

-- ---------------------------------------------------------------------------
-- 4. Row-Level Security
-- ---------------------------------------------------------------------------

-- Enable RLS on every table
alter table public.clients              enable row level security;
alter table public.brand_guidelines     enable row level security;
alter table public.transcripts          enable row level security;
alter table public.brand_brain_chunks   enable row level security;
alter table public.sitemap_index        enable row level security;
alter table public.keyword_opportunities enable row level security;
alter table public.competitor_snapshots  enable row level security;
alter table public.content_output       enable row level security;

-- Service-role full access policies (service role bypasses RLS by default,
-- but we add explicit policies so that if "force RLS" is ever toggled on
-- per-table the service role still works, while anon gets nothing).

create policy "Service role full access" on public.clients
  for all using (current_setting('role') = 'service_role')
  with check (current_setting('role') = 'service_role');

create policy "Service role full access" on public.brand_guidelines
  for all using (current_setting('role') = 'service_role')
  with check (current_setting('role') = 'service_role');

create policy "Service role full access" on public.transcripts
  for all using (current_setting('role') = 'service_role')
  with check (current_setting('role') = 'service_role');

create policy "Service role full access" on public.brand_brain_chunks
  for all using (current_setting('role') = 'service_role')
  with check (current_setting('role') = 'service_role');

create policy "Service role full access" on public.sitemap_index
  for all using (current_setting('role') = 'service_role')
  with check (current_setting('role') = 'service_role');

create policy "Service role full access" on public.keyword_opportunities
  for all using (current_setting('role') = 'service_role')
  with check (current_setting('role') = 'service_role');

create policy "Service role full access" on public.competitor_snapshots
  for all using (current_setting('role') = 'service_role')
  with check (current_setting('role') = 'service_role');

create policy "Service role full access" on public.content_output
  for all using (current_setting('role') = 'service_role')
  with check (current_setting('role') = 'service_role');

-- ---------------------------------------------------------------------------
-- 5. Storage bucket — transcripts (private)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('transcripts', 'transcripts', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 6. pg_cron — 90-day rolling cleanup (runs every Sunday at 00:00 UTC)
-- ---------------------------------------------------------------------------

-- Purge keyword_opportunities older than 90 days
select cron.schedule(
  'cleanup_keyword_opportunities',
  '0 0 * * 0',   -- every Sunday at midnight UTC
  $$delete from public.keyword_opportunities where created_at < now() - interval '90 days'$$
);

-- Purge competitor_snapshots older than 90 days
select cron.schedule(
  'cleanup_competitor_snapshots',
  '0 0 * * 0',   -- every Sunday at midnight UTC
  $$delete from public.competitor_snapshots where detected_at < now() - interval '90 days'$$
);
