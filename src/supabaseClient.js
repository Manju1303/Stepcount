import { createClient } from '@supabase/supabase-js'

// Use environment variables for URL and Key
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://ngtbuuuqbnfumonkitqh.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ndGJ1dXVxYm5mdW1vbmtpdHFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3MzcwNDksImV4cCI6MjA4OTMxMzA0OX0.XClesWLq0OZyCtSDcR5lwaVdj4Kd506JovrfTaeD2gA';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
