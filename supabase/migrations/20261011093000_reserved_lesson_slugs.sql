-- Lesson slugs that collide with player routes. "quiz" is the module quiz page
-- (/learn/<gym>/<course>/quiz), so no lesson may use it. A trigger checks every
-- writer, the table owner included, with the same error the save validator uses.

create function private.guard_reserved_lesson_slug()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.slug = any (array['quiz']) then
    raise exception 'invalid course: the lesson slug "%" is reserved', new.slug using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger lessons_reserved_slug
before insert or update of slug on public.lessons
for each row execute function private.guard_reserved_lesson_slug();

revoke all on function private.guard_reserved_lesson_slug() from public, anon, authenticated, service_role;
