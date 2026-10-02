-- CrewBoard demo seed (local development only).
-- Runs automatically after migrations on `supabase db reset`.
--
-- Demo accounts — all use the password:  CrewBoard!2026
--   admin@crewboard.test        (admin)
--   arjun@crewboard.test        (videographer)
--   priya@crewboard.test        (videographer)
--   rohan@crewboard.test        (videographer)
--   sana@crewboard.test         (videographer)
--   vikram@crewboard.test       (videographer — current month plan is still a draft)
--
-- Dates are relative to "today" in Asia/Kolkata: the previous month is complete
-- (reviewed, assessed, published, best work picked); the current month is in flight.

-- ---------------------------------------------------------------------------
-- Helpers (session-temporary)
-- ---------------------------------------------------------------------------
create function pg_temp.seed_user(p_id uuid, p_email text, p_name text, p_role text)
returns void language plpgsql as $$
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email,
    extensions.crypt('CrewBoard!2026', extensions.gen_salt('bf')), now(),
    jsonb_build_object('provider', 'email', 'providers', array['email'], 'role', p_role),
    jsonb_build_object('full_name', p_name),
    now() - interval '120 days', now(),
    '', '', '', '', '', '', '', ''
  );
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (
    gen_random_uuid(), p_id, p_id::text,
    jsonb_build_object('sub', p_id::text, 'email', p_email, 'email_verified', true),
    'email', now(), now() - interval '120 days', now()
  );
end $$;

-- Local IST wall-clock → timestamptz
create function pg_temp.ist(p_day date, p_time time) returns timestamptz
language sql immutable as $$ select (p_day + p_time) at time zone 'Asia/Kolkata' $$;

-- Create a task with its whole history (submissions, reviews) already played out.
--   p_submit_offset: days relative to due date of the first submission (null = never submitted)
--   p_revision:      first submission was sent back, second one approved
create function pg_temp.seed_task(
  p_plan uuid, p_client text, p_category text, p_title text, p_brief text,
  p_due date, p_status public.task_status, p_submit_offset integer,
  p_points integer, p_rating integer, p_revision boolean, p_link text,
  p_live_submit_at timestamptz default null,
  p_feedback text default null
) returns uuid language plpgsql as $$
declare
  v_admin   uuid := '00000000-0000-4000-a000-000000000001';
  v_task    uuid;
  v_month   date;
  v_client  uuid;
  v_cat     uuid;
  v_max     integer;
  v_sub1    timestamptz;
  v_sub2    timestamptz;
  v_review  timestamptz;
  v_final   timestamptz;
begin
  select month into v_month from public.monthly_plans where id = p_plan;
  select id into v_client from public.clients where name = p_client;
  select id, default_max_points into v_cat, v_max from public.task_categories where name = p_category;

  if p_live_submit_at is not null then
    v_sub1 := p_live_submit_at;
  elsif p_submit_offset is not null then
    v_sub1 := pg_temp.ist(p_due + p_submit_offset, '17:30');
  end if;
  if p_revision then
    v_review := v_sub1 + interval '20 hours';
    v_sub2   := v_sub1 + interval '2 days';
  end if;
  v_final := coalesce(v_sub2, v_sub1) + interval '1 day 2 hours';
  if v_final > now() then v_final := now() - interval '10 minutes'; end if;

  insert into public.tasks (
    plan_id, client_id, category_id, title, brief, priority, due_date, max_points, status,
    status_changed_at, approved_at, points_awarded, quality_rating, created_by, created_at
  ) values (
    p_plan, v_client, v_cat, p_title, p_brief,
    case when p_category = 'Surgery video' then 'high'::public.task_priority else 'normal' end,
    p_due, v_max, p_status,
    case p_status
      when 'approved' then v_final
      when 'submitted' then coalesce(v_sub2, v_sub1)
      when 'revision_requested' then coalesce(v_review, v_sub1 + interval '3 hours')
      else case when v_month < public.month_start(public.today_ist())
                then pg_temp.ist(v_month + 2, '10:00')
                else now() - interval '6 hours' end
    end,
    case when p_status = 'approved' then v_final end,
    case when p_status = 'approved' then p_points end,
    case when p_status = 'approved' then p_rating end,
    v_admin,
    pg_temp.ist(v_month - 3, '11:00')
  ) returning id into v_task;

  -- references: one link + one note on most tasks
  insert into public.task_references (task_id, kind, url, title, sort_order, created_by)
  values (v_task, 'link',
    case p_category
      when 'Surgery video' then 'https://www.youtube.com/watch?v=eRsGyueVLvQ'
      when 'Reel'          then 'https://www.instagram.com/reel/C1a2b3c4d5e/'
      when 'Testimonial'   then 'https://vimeo.com/76979871'
      else                      'https://www.youtube.com/watch?v=R6MlUcmOul8'
    end,
    case p_category
      when 'Surgery video' then 'Pacing & lighting reference'
      when 'Reel'          then 'Reel style reference (hook in first 2s)'
      when 'Testimonial'   then 'Interview framing reference'
      else                      'Tone & grade reference'
    end, 0, v_admin);
  insert into public.task_references (task_id, kind, note, title, sort_order, created_by)
  values (v_task, 'note',
    case p_category
      when 'Surgery video' then 'Coordinate with the OT in-charge 48h before. No patient faces; consent forms are with the PR desk.'
      when 'Reel'          then 'Vertical 9:16, 20–40s, captions burned in, brand end-card in the last 2 seconds.'
      when 'Testimonial'   then 'Two-camera setup, lav + boom. Get signed release before recording.'
      when 'Photo shoot'   then 'Deliver edited JPGs (sRGB, long edge 3000px) plus RAW selects in the shared folder.'
      else                      'Share a rough cut for feedback before final grading.'
    end, 'Brief notes', 1, v_admin);

  if v_sub1 is null then
    return v_task;
  end if;

  -- first submission
  insert into public.submissions (task_id, version, links, notes, source, submitted_by, submitted_at)
  select v_task, 1, array[p_link], 'First cut ready for review.',
         case when p_client = 'Kesar Foods' then 'sheet'::public.submission_source else 'app' end,
         p.videographer_id, v_sub1
    from public.monthly_plans p where p.id = p_plan;

  if p_revision then
    insert into public.task_reviews (task_id, submission_id, reviewer_id, decision, feedback, reviewed_at)
    select v_task, s.id, v_admin, 'revision_requested',
           coalesce(p_feedback, 'Colour is a little flat in the interview section and the lower-thirds are misspelt. Please fix and resubmit.'),
           v_review
      from public.submissions s where s.task_id = v_task and s.version = 1;
    if v_sub2 is not null and p_status <> 'revision_requested' then
      insert into public.submissions (task_id, version, links, notes, source, submitted_by, submitted_at)
      select v_task, 2, array[p_link], 'Fixed grade and lower-thirds as requested.', 'app', p.videographer_id, v_sub2
        from public.monthly_plans p where p.id = p_plan;
    end if;
  end if;

  if p_status = 'revision_requested' and not p_revision then
    insert into public.task_reviews (task_id, submission_id, reviewer_id, decision, feedback, reviewed_at)
    select v_task, s.id, v_admin, 'revision_requested', p_feedback, v_sub1 + interval '3 hours'
      from public.submissions s where s.task_id = v_task and s.version = 1;
  end if;

  if p_status = 'approved' then
    insert into public.task_reviews (task_id, submission_id, reviewer_id, decision, points_awarded, quality_rating, feedback, reviewed_at)
    select v_task, s.id, v_admin, 'approved', p_points, p_rating,
           case when p_rating >= 5 then 'Outstanding — this is exactly the standard we want.'
                when p_rating = 4 then 'Great work. Small polish notes for next time: tighten the first 5 seconds.'
                else 'Approved. Watch the audio levels and delivery timelines.' end,
           v_final
      from public.submissions s where s.task_id = v_task order by s.version desc limit 1;
  end if;
  return v_task;
end $$;

-- ---------------------------------------------------------------------------
-- Seed
-- ---------------------------------------------------------------------------
do $$
declare
  v_admin  uuid := '00000000-0000-4000-a000-000000000001';
  v_arjun  uuid := '00000000-0000-4000-a000-000000000011';
  v_priya  uuid := '00000000-0000-4000-a000-000000000012';
  v_rohan  uuid := '00000000-0000-4000-a000-000000000013';
  v_sana   uuid := '00000000-0000-4000-a000-000000000014';
  v_vikram uuid := '00000000-0000-4000-a000-000000000015';
  m0 date := public.month_start(public.today_ist());          -- current month
  m1 date := (public.month_start(public.today_ist()) - interval '1 month')::date;  -- previous month
  p uuid;
  t uuid;
  a public.monthly_assessments;
  yt_bbb    text := 'https://www.youtube.com/watch?v=aqz-KE-bpKQ';
  yt_sintel text := 'https://www.youtube.com/watch?v=eRsGyueVLvQ';
  yt_tears  text := 'https://www.youtube.com/watch?v=R6MlUcmOul8';
  yt_spring text := 'https://www.youtube.com/watch?v=WhWc3b3KhnY';
  vimeo     text := 'https://vimeo.com/76979871';
  drive     text := 'https://drive.google.com/file/d/1Xc9demoCrewBoardSampleFile01/view';
  t_knee uuid; t_sweets uuid; t_campus uuid;
begin
  -- users ------------------------------------------------------------------
  perform pg_temp.seed_user(v_admin,  'admin@crewboard.test',  'Studio Admin',   'admin');
  perform pg_temp.seed_user(v_arjun,  'arjun@crewboard.test',  'Arjun Mehta',    'videographer');
  perform pg_temp.seed_user(v_priya,  'priya@crewboard.test',  'Priya Nair',     'videographer');
  perform pg_temp.seed_user(v_rohan,  'rohan@crewboard.test',  'Rohan Kulkarni', 'videographer');
  perform pg_temp.seed_user(v_sana,   'sana@crewboard.test',   'Sana Shaikh',    'videographer');
  perform pg_temp.seed_user(v_vikram, 'vikram@crewboard.test', 'Vikram Rao',     'videographer');

  update public.profiles set phone = '+91 98200 10001', base_location = 'Mumbai — Head office' where id = v_admin;
  update public.profiles set phone = '+91 98200 11001', base_location = 'Mumbai — Andheri'     where id = v_arjun;
  update public.profiles set phone = '+91 98200 11002', base_location = 'Mumbai — Bandra'      where id = v_priya;
  update public.profiles set phone = '+91 98200 11003', base_location = 'Pune — Kothrud'       where id = v_rohan;
  update public.profiles set phone = '+91 98200 11004', base_location = 'Navi Mumbai — Vashi'  where id = v_sana;
  update public.profiles set phone = '+91 98200 11005', base_location = 'Mumbai — Powai'       where id = v_vikram;

  -- categories --------------------------------------------------------------
  insert into public.task_categories (name, default_max_points, sort_order) values
    ('Surgery video', 25, 1), ('Testimonial', 15, 2), ('Reel', 10, 3),
    ('Event coverage', 20, 4), ('Photo shoot', 10, 5), ('Other', 10, 6);

  -- clients (fictional) ------------------------------------------------------
  insert into public.clients (name, type, address, city, contact_name, contact_phone, contact_email, notes) values
    ('Harbourview Multispecialty Hospital', 'hospital', 'Plot 14, Linking Road', 'Mumbai',
     'Dr. Meera Iyer (PR Head)', '+91 22 4000 1100', 'pr@harbourview.example', 'OT shoots need 48h notice. Consent forms via PR desk.'),
    ('Nova Ortho & Spine Centre', 'clinic', '3rd Floor, Sai Plaza, FC Road', 'Pune',
     'Kunal Deshpande', '+91 20 2555 0199', 'marketing@novaortho.example', 'Prefers bright, clinical look. Logo end-card mandatory.'),
    ('Kesar Foods', 'brand', 'Unit 7, Kurla Industrial Estate', 'Mumbai',
     'Neha Bhatt', '+91 98330 44120', 'brand@kesarfoods.example', 'Festive season is peak — plan Diwali content early.'),
    ('Lumen Skin Clinic', 'clinic', 'Hill Road, Bandra West', 'Mumbai',
     'Dr. Aisha Khan', '+91 98190 22018', 'hello@lumenskin.example', 'Before/after content needs written patient consent.'),
    ('BrightPath Academy', 'education', 'Sector 17, Vashi', 'Navi Mumbai',
     'Mr. Joseph D''Souza', '+91 22 2789 3300', 'admin@brightpath.example', 'No student faces without parent consent list.'),
    ('Coastline Apparel', 'brand', 'Hill Road, Bandra West', 'Mumbai',
     'Rhea Kapoor', '+91 99200 77881', 'studio@coastline.example', 'Warm film-grain grade is part of their brand look.');

  insert into public.videographer_clients (videographer_id, client_id, assigned_by)
  select v.vid, c.id, v_admin
    from (values
      (v_arjun,  'Harbourview Multispecialty Hospital'), (v_arjun,  'Nova Ortho & Spine Centre'),
      (v_priya,  'Kesar Foods'),                          (v_priya,  'Coastline Apparel'),
      (v_rohan,  'Nova Ortho & Spine Centre'),            (v_rohan,  'Lumen Skin Clinic'),
      (v_sana,   'BrightPath Academy'),                   (v_sana,   'Coastline Apparel'),
      (v_vikram, 'Harbourview Multispecialty Hospital'),  (v_vikram, 'Lumen Skin Clinic')
    ) as v(vid, cname)
    join public.clients c on c.name = v.cname;

  -- =========================================================================
  -- PREVIOUS MONTH — complete
  -- =========================================================================
  -- Arjun
  insert into public.monthly_plans (videographer_id, month, summary, goals, created_by)
  values (v_arjun, m1,
    'Harbourview''s orthopaedics push plus Nova''s spine awareness campaign.',
    'Deliver the knee replacement film for patient education. Keep every hospital deliverable on time.', v_admin)
  returning id into p;
  t_knee := pg_temp.seed_task(p, 'Harbourview Multispecialty Hospital', 'Surgery video', 'Knee replacement surgery — full procedure film',
    'A 6–8 min educational film covering pre-op, the procedure and recovery. For the patient education screens in OPD.',
    m1 + 7, 'approved', -1, 23, 5, false, yt_sintel);
  perform pg_temp.seed_task(p, 'Harbourview Multispecialty Hospital', 'Testimonial', 'Patient testimonial: Mrs. Desai''s recovery story',
    'Sit-down interview at home plus B-roll of her physiotherapy session.', m1 + 11, 'approved', 0, 14, 4, false, vimeo);
  perform pg_temp.seed_task(p, 'Nova Ortho & Spine Centre', 'Reel', 'Spine care awareness reel (30s)',
    'Myth vs fact reel featuring Dr. Kulkarni. Hook in the first 2 seconds.', m1 + 14, 'approved', 2, 7, 3, false, drive);
  perform pg_temp.seed_task(p, 'Harbourview Multispecialty Hospital', 'Event coverage', 'World Heart Day health camp coverage',
    'Full-day coverage: highlights film (2 min) + 40 photos.', m1 + 28, 'approved', -1, 18, 4, false, yt_tears);
  perform pg_temp.seed_task(p, 'Nova Ortho & Spine Centre', 'Photo shoot', 'Doctor portraits for website refresh',
    'Six doctors, clean white background plus one environmental portrait each.', m1 + 19, 'approved', 0, 9, 4, true, drive);
  perform pg_temp.seed_task(p, 'Harbourview Multispecialty Hospital', 'Reel', 'ICU behind-the-scenes reel',
    'A day in the ICU — nurses and staff. No patient faces.', m1 + 25, 'approved', 0, 10, 5, false, yt_spring);

  -- Priya
  insert into public.monthly_plans (videographer_id, month, summary, goals, created_by)
  values (v_priya, m1,
    'Kesar''s festive launch and Coastline''s monsoon collection.',
    'Hit every launch date. Build a reusable reel template for Kesar.', v_admin)
  returning id into p;
  t_sweets := pg_temp.seed_task(p, 'Kesar Foods', 'Reel', 'Festive sweets launch reel',
    'Launch reel for the new kaju katli range — macro food shots and a festive set.', m1 + 4, 'approved', -2, 10, 5, false, yt_bbb);
  perform pg_temp.seed_task(p, 'Kesar Foods', 'Photo shoot', 'Product catalogue shoot — 24 SKUs',
    'Packshots on white plus 6 lifestyle frames.', m1 + 9, 'approved', 0, 9, 4, false, drive);
  perform pg_temp.seed_task(p, 'Coastline Apparel', 'Reel', 'Monsoon collection lookbook reel',
    'Rain-soaked street looks around Bandra; warm film-grain grade.', m1 + 13, 'approved', -1, 9, 5, false, yt_spring);
  perform pg_temp.seed_task(p, 'Coastline Apparel', 'Event coverage', 'Store launch event — Bandra',
    'Launch evening: guest arrivals, ribbon cutting, influencer moments.', m1 + 20, 'approved', 0, 19, 5, false, yt_tears);
  perform pg_temp.seed_task(p, 'Kesar Foods', 'Testimonial', 'Retail partner testimonial',
    'Two shop owners on why Kesar sells out during festivals.', m1 + 24, 'approved', 1, 12, 4, false, vimeo);
  perform pg_temp.seed_task(p, 'Kesar Foods', 'Other', 'Recipe how-to video',
    '3-minute recipe video using Kesar products, overhead camera.', m1 + 27, 'approved', -1, 10, 5, false, yt_bbb);

  -- Rohan
  insert into public.monthly_plans (videographer_id, month, summary, goals, created_by)
  values (v_rohan, m1,
    'Nova surgical content and Lumen''s treatment explainers.',
    'Improve on-time delivery. Finish the post-op exercise series pilot.', v_admin)
  returning id into p;
  perform pg_temp.seed_task(p, 'Nova Ortho & Spine Centre', 'Surgery video', 'Arthroscopic ACL reconstruction video',
    'Procedure film with surgeon voice-over; 5 minutes.', m1 + 8, 'approved', 3, 18, 3, false, yt_sintel);
  perform pg_temp.seed_task(p, 'Lumen Skin Clinic', 'Reel', 'Laser treatment explainer reel',
    'What to expect during a laser session — 30s.', m1 + 12, 'approved', 0, 8, 4, false, drive);
  perform pg_temp.seed_task(p, 'Lumen Skin Clinic', 'Testimonial', 'Client testimonial: acne journey',
    'Client interview plus before/after photos (consent on file).', m1 + 17, 'approved', 2, 11, 3, true, vimeo);
  t := pg_temp.seed_task(p, 'Nova Ortho & Spine Centre', 'Photo shoot', 'Physio studio photo set',
    'New physio studio interiors.', m1 + 21, 'cancelled', null, null, null, false, null);
  perform pg_temp.seed_task(p, 'Nova Ortho & Spine Centre', 'Reel', 'Post-op exercise series — episode 1',
    'Pilot episode: 3 knee exercises after surgery, with on-screen counts.', m1 + 24, 'in_progress', null, null, null, false, null);
  perform pg_temp.seed_task(p, 'Lumen Skin Clinic', 'Event coverage', 'Skin care workshop coverage',
    'Saturday workshop for 40 guests — highlights + photos.', m1 + 26, 'approved', 0, 15, 4, false, yt_tears);

  -- Sana
  insert into public.monthly_plans (videographer_id, month, summary, goals, created_by)
  values (v_sana, m1,
    'BrightPath''s admissions season content and Coastline flat-lays.',
    'Cover sports day end-to-end. Campus tour reel ready before admissions open.', v_admin)
  returning id into p;
  perform pg_temp.seed_task(p, 'BrightPath Academy', 'Event coverage', 'Annual sports day highlights',
    'Highlights film (3 min) plus 60 photos.', m1 + 6, 'approved', -1, 17, 4, false, yt_spring);
  perform pg_temp.seed_task(p, 'BrightPath Academy', 'Testimonial', 'Parent testimonials (3 interviews)',
    'Three parents on why they chose BrightPath.', m1 + 15, 'approved', 0, 13, 4, false, vimeo);
  perform pg_temp.seed_task(p, 'Coastline Apparel', 'Photo shoot', 'Flat-lay shoot for new arrivals',
    '18 flat-lays on linen backgrounds.', m1 + 18, 'approved', 1, 8, 3, false, drive);
  t_campus := pg_temp.seed_task(p, 'BrightPath Academy', 'Reel', 'Campus tour reel',
    'Gimbal walk-through of labs, library and sports complex.', m1 + 23, 'approved', -2, 10, 5, false, yt_bbb);
  perform pg_temp.seed_task(p, 'BrightPath Academy', 'Other', 'Teacher''s Day tribute film',
    'Students thanking teachers — a 2-minute tribute.', m1 + 4, 'approved', 0, 9, 5, false, yt_sintel);

  -- Vikram
  insert into public.monthly_plans (videographer_id, month, summary, goals, created_by)
  values (v_vikram, m1,
    'Harbourview cardiology content and a Lumen reel.',
    'Document the cardiac bypass case. Keep revisions to a minimum.', v_admin)
  returning id into p;
  perform pg_temp.seed_task(p, 'Harbourview Multispecialty Hospital', 'Surgery video', 'Cardiac bypass surgery documentation',
    'Long-form documentation for the cardiology department''s training library.', m1 + 10, 'approved', 0, 21, 4, false, yt_tears);
  perform pg_temp.seed_task(p, 'Harbourview Multispecialty Hospital', 'Testimonial', 'Cardiology patient testimonial',
    'Patient and family interview one month after surgery.', m1 + 16, 'approved', 4, 10, 3, true, vimeo);
  perform pg_temp.seed_task(p, 'Lumen Skin Clinic', 'Reel', 'Hydrafacial before/after reel',
    'Before/after reel with consent; 20s.', m1 + 22, 'approved', 0, 9, 4, false, drive);
  perform pg_temp.seed_task(p, 'Harbourview Multispecialty Hospital', 'Event coverage', 'Nurses'' felicitation ceremony',
    'Ceremony coverage plus individual portraits of awardees.', m1 + 27, 'approved', -1, 16, 4, false, yt_spring);

  update public.monthly_plans set status = 'published', published_at = pg_temp.ist(m1 - 2, '10:00') where month = m1;

  -- =========================================================================
  -- CURRENT MONTH — in flight
  -- =========================================================================
  insert into public.monthly_plans (videographer_id, month, summary, goals, created_by)
  values (v_arjun, m0,
    'Festive month at Harbourview: awareness films and hospital celebrations.',
    'Hip resurfacing film by the 10th. Survivor stories need sensitive, warm treatment.', v_admin)
  returning id into p;
  perform pg_temp.seed_task(p, 'Harbourview Multispecialty Hospital', 'Surgery video', 'Hip resurfacing surgery film',
    'Educational film for OPD screens; same structure as last month''s knee film.', m0 + 9, 'in_progress', null, null, null, false, null);
  perform pg_temp.seed_task(p, 'Harbourview Multispecialty Hospital', 'Testimonial', 'Breast cancer awareness month — survivor stories',
    'Three survivors, soft natural light, minimal crew.', m0 + 17, 'assigned', null, null, null, false, null);
  perform pg_temp.seed_task(p, 'Nova Ortho & Spine Centre', 'Reel', 'Sports injury prevention reel',
    'Three warm-up drills for weekend cricketers.', m0 + 7, 'submitted', null, null, null, false, yt_spring,
    now() - interval '3 hours');
  perform pg_temp.seed_task(p, 'Harbourview Multispecialty Hospital', 'Event coverage', 'Diwali celebration at the hospital',
    'Rangoli competition, patient wards lighting, staff celebration.', m0 + 23, 'assigned', null, null, null, false, null);

  insert into public.monthly_plans (videographer_id, month, summary, goals, created_by)
  values (v_priya, m0,
    'Diwali for Kesar and the Coastline festive drop.',
    'All Diwali content live by the 12th. Reuse the reel template from last month.', v_admin)
  returning id into p;
  perform pg_temp.seed_task(p, 'Kesar Foods', 'Reel', 'Diwali gift hamper reel',
    'Unboxing-style reel of the premium hamper.', m0 + 5, 'submitted', null, null, null, false, yt_bbb,
    now() - interval '2 hours');
  perform pg_temp.seed_task(p, 'Kesar Foods', 'Photo shoot', 'Diwali hamper product shoot',
    'Hamper packshots plus 4 styled festive frames.', m0 + 3, 'approved', null, 10, 5, false, drive,
    now() - interval '6 hours');
  perform pg_temp.seed_task(p, 'Coastline Apparel', 'Reel', 'Festive collection teaser',
    '15s teaser, warm grade, quick cuts on the beat.', m0 + 11, 'in_progress', null, null, null, false, null);
  perform pg_temp.seed_task(p, 'Coastline Apparel', 'Event coverage', 'Festive pop-up store coverage',
    'Weekend pop-up at Phoenix mall.', m0 + 19, 'assigned', null, null, null, false, null);

  insert into public.monthly_plans (videographer_id, month, summary, goals, created_by)
  values (v_rohan, m0,
    'Robotic knee replacement film for Nova and Diwali skin tips for Lumen.',
    'Submit on or before due dates this month — punctuality was the gap last month.', v_admin)
  returning id into p;
  perform pg_temp.seed_task(p, 'Nova Ortho & Spine Centre', 'Surgery video', 'Total knee replacement — robotic assisted',
    'Highlight the robotic arm; surgeon voice-over recorded separately.', m0 + 8, 'assigned', null, null, null, false, null);
  perform pg_temp.seed_task(p, 'Lumen Skin Clinic', 'Reel', 'Diwali skin-prep tips reel',
    'Dr. Khan''s 3 tips before the festive season.', m0 + 6, 'revision_requested', null, null, null, false, drive,
    now() - interval '5 hours',
    'Audio is clipping in the first 10 seconds and the logo end-card is missing. Please fix both and resubmit.');
  perform pg_temp.seed_task(p, 'Nova Ortho & Spine Centre', 'Reel', 'Post-op exercise series — episode 2',
    'Episode 2: hip exercises.', m0 + 14, 'assigned', null, null, null, false, null);

  insert into public.monthly_plans (videographer_id, month, summary, goals, created_by)
  values (v_sana, m0,
    'BrightPath admissions push and Coastline winter flat-lays.',
    'Admissions reel by the 5th — it goes on paid social.', v_admin)
  returning id into p;
  perform pg_temp.seed_task(p, 'BrightPath Academy', 'Event coverage', 'Science fair coverage',
    'Projects, judges and prize distribution.', m0 + 13, 'assigned', null, null, null, false, null);
  perform pg_temp.seed_task(p, 'BrightPath Academy', 'Reel', 'Admissions open reel',
    '20s reel for paid social; CTA end-card with the admissions number.', m0 + 4, 'in_progress', null, null, null, false, null);
  perform pg_temp.seed_task(p, 'Coastline Apparel', 'Photo shoot', 'Winter collection flat-lays',
    '20 flat-lays, knitwear focus.', m0 + 21, 'assigned', null, null, null, false, null);

  update public.monthly_plans set status = 'published', published_at = pg_temp.ist(m0 - 1, '18:00')
   where month = m0;

  -- Vikram's current plan stays a DRAFT (invisible to him until published)
  insert into public.monthly_plans (videographer_id, month, summary, goals, created_by)
  values (v_vikram, m0,
    'Interventional cardiology films and a Lumen testimonial.',
    'Draft — confirm OT dates with Harbourview before publishing.', v_admin)
  returning id into p;
  perform pg_temp.seed_task(p, 'Harbourview Multispecialty Hospital', 'Surgery video', 'Angioplasty procedure film',
    'Cath lab documentation, 4 minutes.', m0 + 15, 'assigned', null, null, null, false, null);
  perform pg_temp.seed_task(p, 'Lumen Skin Clinic', 'Testimonial', 'Client testimonial: pigmentation treatment',
    'Single interview plus treatment B-roll.', m0 + 20, 'assigned', null, null, null, false, null);

  -- =========================================================================
  -- Previous month assessments + featured work (run as the admin)
  -- =========================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  a := public.compute_assessment(v_priya, m1);
  update public.monthly_assessments set discretionary_score = 9.5,
    admin_remarks = 'Consistently early, excellent client feedback from Kesar. Ready to lead the festive campaign.',
    public_note = 'Every Kesar deliverable landed early — and the launch reel outperformed last year''s.'
   where id = a.id;
  perform public.publish_assessment(a.id);

  a := public.compute_assessment(v_arjun, m1);
  update public.monthly_assessments set discretionary_score = 8.5, bonus_points = 2,
    bonus_reason = 'Covered an emergency Sunday shoot for Harbourview at short notice.',
    admin_remarks = 'Hospital trusts him with OT access. The spine reel was late and rushed — plan reels earlier.',
    public_note = 'The knee replacement film is now playing on every OPD screen at Harbourview.'
   where id = a.id;
  perform public.publish_assessment(a.id);

  a := public.compute_assessment(v_sana, m1);
  update public.monthly_assessments set discretionary_score = 8,
    admin_remarks = 'Great with school staff and parents. Flat-lays need more styling variety.',
    public_note = 'Campus tour reel drove a record number of admission enquiries.'
   where id = a.id;
  perform public.publish_assessment(a.id);

  a := public.compute_assessment(v_vikram, m1);
  update public.monthly_assessments set discretionary_score = 7,
    admin_remarks = 'Strong surgical documentation. Testimonial needed a revision and was 4 days late.',
    public_note = 'Cardiac bypass documentation is now part of the training library.'
   where id = a.id;
  perform public.publish_assessment(a.id);

  a := public.compute_assessment(v_rohan, m1);
  update public.monthly_assessments set discretionary_score = 6,
    admin_remarks = 'Talented, but late on two deliverables and the exercise series pilot slipped. Let''s fix punctuality.',
    public_note = 'Skin care workshop coverage was a client favourite.'
   where id = a.id;
  perform public.publish_assessment(a.id);

  perform public.set_featured_work(m1, jsonb_build_array(
    jsonb_build_object('task_id', t_knee, 'rank', 1,
      'reason', 'Calm, clear storytelling of a complex procedure — Harbourview now uses it for patient education.'),
    jsonb_build_object('task_id', t_sweets, 'rank', 2,
      'reason', 'Mouth-watering macro work and a hook that landed in the first second.'),
    jsonb_build_object('task_id', t_campus, 'rank', 3,
      'reason', 'Smooth single-take feel that makes the campus look inviting.')
  ));

  perform set_config('request.jwt.claims', '', true);

  -- =========================================================================
  -- Make history look real: backdate audit rows, prune noisy notifications
  -- =========================================================================
  update public.activity_log l set created_at = t.created_at
    from public.tasks t
   where l.action = 'task.created' and l.entity_id = t.id;

  update public.activity_log l set created_at = s.submitted_at
    from public.submissions s
   where l.action = 'task.submitted' and l.entity_id = s.task_id
     and s.version = (l.payload ->> 'version')::integer;

  update public.activity_log l set created_at = r.reviewed_at
    from public.task_reviews r
   where l.action = 'task.reviewed' and l.entity_id = r.task_id
     and r.decision::text = l.payload ->> 'decision';

  update public.activity_log l set created_at = p.published_at
    from public.monthly_plans p
   where l.action = 'plan.published' and l.entity_id = p.id;

  -- Old notifications about last month's tasks are noise in a demo.
  delete from public.notifications n
   using public.tasks t
   where t.month = m1
     and (n.link = '/admin/review/' || t.id or n.link = '/me/tasks/' || t.id);
  delete from public.notifications
   where type = 'plan_published' and title like '%' || public.format_month(m1) || '%';
  -- Admin has already seen the reviews they did themselves; videographers have read last month's results.
  update public.notifications set read_at = now()
   where type in ('assessment_published', 'best_work') and user_id <> v_arjun;
end;
$$;
