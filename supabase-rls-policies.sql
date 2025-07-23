-- Enable RLS on captcha_log table
ALTER TABLE captcha_log ENABLE ROW LEVEL SECURITY;

-- Policy to allow authenticated users to insert captcha logs
CREATE POLICY "Users can insert their own captcha logs" ON captcha_log
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policy to allow users to view their own captcha logs (if you want to add user_id later)
-- CREATE POLICY "Users can view their own captcha logs" ON captcha_log
--   FOR SELECT
--   TO authenticated
--   USING (true);

-- Policy to allow users to update their own captcha logs (if needed)
-- CREATE POLICY "Users can update their own captcha logs" ON captcha_log
--   FOR UPDATE
--   TO authenticated
--   USING (true)
--   WITH CHECK (true);

-- Storage policies for captcha-images bucket
-- Allow authenticated users to upload captcha images
CREATE POLICY "Authenticated users can upload captcha images" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'captcha-images');

-- Allow authenticated users to view captcha images
CREATE POLICY "Authenticated users can view captcha images" ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'captcha-images'); 