-- Ciblage des popups par réseau et par lignes.
--
-- Un popup peut viser un réseau (TAG, TCL, STAN…) : l'application ne le montre
-- qu'aux personnes qui se trouvent dans la ville de ce réseau. Il peut aussi
-- nommer les lignes touchées : elles s'affichent en pastilles au bout du titre.
--
-- Les lignes sont gardées telles qu'on les a choisies (identifiant, nom court,
-- couleurs) : l'application n'a pas à charger le réseau entier pour dessiner
-- les pastilles d'une ville où l'on n'est pas.
--
-- Ajout seulement : les popups existants restent valables (réseau vide = tous).

alter table public.popups add column if not exists target_network text;
alter table public.popups add column if not exists target_lines jsonb not null default '[]'::jsonb;
alter table public.popups add column if not exists target_category text;

comment on column public.popups.target_network is
  'Code du réseau visé (SEM, TCL, STAN…). Vide : tout le monde.';
comment on column public.popups.target_lines is
  'Lignes touchées : [{ id, short, color, textColor, family, name }].';
comment on column public.popups.target_category is
  'Catégorie choisie en bloc (tram, chrono, proximo…), pour mémoire.';
