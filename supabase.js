// Supabase Configuration
const SUPABASE_URL = 'https://mablwjbeltdtoocqnnhv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hYmx3amJlbHRkdG9vY3Fubmh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcyNTE1MjYsImV4cCI6MjA4MjgyNzUyNn0.lLRDr3MEFfaIU-i28KkJBWddaWs-Aj_l1Ao4Rvdc81E';

// Initialize Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Export for use in other modules
window.supabaseClient = supabase;
