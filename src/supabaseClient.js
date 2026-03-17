import { createClient } from '@supabase/supabase-js'

// Replace with your actual project URL from Supabase dashboard
const supabaseUrl = 'https://ngtbuuuqbnfumonkitqh.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ndGJ1dXVxYm5mdW1vbmtpdHFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3MzcwNDksImV4cCI6MjA4OTMxMzA0OX0.XClesWLq0OZyCtSDcR5lwaVdj4Kd506JovrfTaeD2gA'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
