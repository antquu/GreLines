-- ---------------------------------------------------------------------------
-- Avis de trajet : deux colonnes de plus.
--
-- La table existe déjà et recueille les notes. Ce qui lui manque, c'est de quoi
-- situer l'avis dans l'espace et dans le temps — sans quoi on sait qu'une ligne
-- est jugée en retard, mais jamais où ni quand.
-- ---------------------------------------------------------------------------

-- L'heure de la réponse, telle que le téléphone la connaît.
--
-- `created_at` dit quand la base a reçu la ligne, ce qui n'est pas la même
-- chose : un réseau lent, une réponse mise en file, et l'écart se compte en
-- minutes. Or c'est précisément l'écart qui nous intéresse — croisé avec
-- l'heure de montée, il dit depuis combien de temps l'usager roulait, donc à
-- quel endroit du parcours le véhicule se trouvait quand il a répondu.
alter table public.trip_surveys
  add column if not exists answered_at timestamptz;

-- Le trajet, réduit à ses tronçons en transport.
--
-- Un tableau JSON de `{ "line": "C1", "from": "…", "to": "…",
-- "departure": "…", "arrival": "…" }`, dans l'ordre du voyage.
--
-- La marche en est délibérément absente, et ce n'est pas un oubli : le premier
-- et le dernier tronçon d'un trajet à pied partent de chez quelqu'un et y
-- reviennent. Les garder reviendrait à tenir un registre des domiciles de nos
-- utilisateurs pour connaître la fréquentation d'une ligne de bus. On garde
-- donc de quai à quai — ce qui suffit largement à établir les trajets moyens —
-- et rien avant, rien après.
alter table public.trip_surveys
  add column if not exists journey jsonb not null default '[]'::jsonb;

-- Les avis se relisent par ligne et par date : l'index suit cet usage.
create index if not exists trip_surveys_line_answered_idx
  on public.trip_surveys (line_id, answered_at desc);
