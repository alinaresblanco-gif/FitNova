// Conexión con Supabase para FitNova Go (mismo proyecto que FitNova Manager).
const SUPABASE_URL = 'https://rvonyrsfhghlqjlhuubo.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_C_dvWW90caDIlyU3vGjgDQ_0BzdVql1';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
