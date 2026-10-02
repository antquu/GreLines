-- GreLines : acceptation des conditions d'utilisation de la carte OURA.
--
-- Idempotent : peut être ré-exécuté tel quel dans l'éditeur SQL Supabase.
-- À exécuter après oura-cards.sql et oura-lockdown.sql.
--
-- La première fois qu'une carte jamais enregistrée est ajoutée, l'application
-- fait accepter des conditions d'utilisation. On garde la trace de cet accord :
-- quelle carte, quel appareil, quelle version du texte, et quand. C'est ce qui
-- permet de montrer, le jour venu, que le porteur a bien accepté.
--
-- La table ne se lit ni ne s'écrit avec la clé publique : seule la fonction
-- `oura_terms_accept` y ajoute des lignes, et personne ne peut les relire
-- depuis l'application.

create table if not exists public.oura_terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  card_code text not null,
  device_id text not null,
  -- La version du texte accepté (une date, « 2026-10-02 »).
  terms_version text not null,
  accepted_at timestamptz not null default now()
);

create index if not exists oura_terms_acceptances_card_idx
  on public.oura_terms_acceptances (card_code);

alter table public.oura_terms_acceptances enable row level security;
-- Aucune politique : aucun accès direct depuis la clé publique.

create or replace function public.oura_terms_accept(p_code text, p_device text, p_version text)
returns void
language sql
security definer set search_path = public
as $$
  insert into public.oura_terms_acceptances (card_code, device_id, terms_version)
  values (public.oura_code(p_code), left(p_device, 100), left(p_version, 40));
$$;

grant execute on function public.oura_terms_accept(text, text, text) to anon, authenticated;
