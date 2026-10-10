-- Uploads: SVG files can carry scripts, so client logos are raster images only.
update storage.buckets
   set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id = 'client-logos';
