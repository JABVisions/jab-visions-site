-- Unlock Those Ryderz and JAB Visions as enterable official Rooms.
-- Paste in Supabase after board_rooms.sql if those rows were seeded as coming_soon.

update public.rooms
set
  kind = 'official',
  is_official = true,
  coming_soon = false,
  description = 'The JAB Visions project room for THAT RYDERZ — auditions, self-tapes, production, crew, and Drops. Invite collaborators, post updates, and keep the film moving.',
  chips = array['Auditions', 'Production', 'Crew', 'Drops'],
  updated_at = timezone('utc', now())
where id = 'those-ryderz';

update public.rooms
set
  kind = 'official',
  is_official = true,
  coming_soon = false,
  description = 'The official JAB Visions studio room — Board, studio, announcements, and official Drops.',
  chips = array['Board', 'Studio', 'Announcements', 'Drops'],
  updated_at = timezone('utc', now())
where id = 'jab-visions';
