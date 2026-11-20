import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// The signed-in customer, from the Supabase access token.
export async function requireUser(req, res, next) {
  const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return res.status(401).json({ error: 'sign in first' });
  req.user = data.user;
  next();
}

// Staff only: the role is set in the user's app metadata by an administrator.
export function requireAdmin(req, res, next) {
  if (req.user?.app_metadata?.role !== 'admin') return res.status(403).json({ error: 'staff only' });
  next();
}
