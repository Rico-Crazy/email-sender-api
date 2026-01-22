import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// Only create client if credentials are configured
let supabase: SupabaseClient | null = null;

if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
} else {
  console.warn("Supabase credentials not configured. Email history will not be persisted.");
}

export { supabase };

// 数据库表结构类型
export interface EmailHistoryRow {
  id?: number;
  email: string;
  last_sent_at: string; // ISO timestamp
  sent_count: number;
  subjects: string[]; // JSONB array
  created_at?: string;
  updated_at?: string;
}
