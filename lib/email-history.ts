import { supabase, type EmailHistoryRow } from "./supabase";

// 历史发送邮箱记录
export interface EmailHistoryRecord {
  email: string;
  lastSentAt: number; // 最后发送时间戳
  sentCount: number; // 发送次数
  subjects: string[]; // 最近发送的主题（最多保留5个）
}

// 检查 Supabase 是否已配置
function isSupabaseConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// 记录发送成功的邮箱
export async function recordSentEmail(email: string, subject: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    console.warn("Supabase not configured, skipping email history recording");
    return;
  }

  const normalizedEmail = email.toLowerCase().trim();
  const now = new Date().toISOString();

  try {
    // 查询是否已存在
    const { data: existing } = await supabase
      .from("email_history")
      .select("*")
      .eq("email", normalizedEmail)
      .single();

    if (existing) {
      // 更新现有记录
      const newSubjects = [subject, ...(existing.subjects || []).slice(0, 4)];
      await supabase
        .from("email_history")
        .update({
          last_sent_at: now,
          sent_count: existing.sent_count + 1,
          subjects: newSubjects,
          updated_at: now,
        })
        .eq("email", normalizedEmail);
    } else {
      // 新增记录
      await supabase.from("email_history").insert({
        email: normalizedEmail,
        last_sent_at: now,
        sent_count: 1,
        subjects: [subject],
        created_at: now,
        updated_at: now,
      });
    }
  } catch (error) {
    console.error("Failed to record email history:", error);
  }
}

// 批量记录发送成功的邮箱
export async function recordSentEmails(
  emails: Array<{ email: string; subject: string }>
): Promise<void> {
  if (!isSupabaseConfigured()) {
    console.warn("Supabase not configured, skipping email history recording");
    return;
  }

  // 逐个记录，确保数据一致性
  for (const { email, subject } of emails) {
    await recordSentEmail(email, subject);
  }
}

// 检查邮箱是否超过发送次数限制（默认3次）
// 返回超过限制的邮箱列表
export async function checkDuplicateEmails(
  emails: string[],
  maxSendCount: number = 3
): Promise<Array<EmailHistoryRecord>> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  const duplicates: EmailHistoryRecord[] = [];
  const normalizedEmails = emails.map((e) => e.toLowerCase().trim());

  try {
    const { data: records } = await supabase
      .from("email_history")
      .select("*")
      .in("email", normalizedEmails)
      .gte("sent_count", maxSendCount);

    if (records) {
      for (const record of records) {
        duplicates.push({
          email: record.email,
          lastSentAt: new Date(record.last_sent_at).getTime(),
          sentCount: record.sent_count,
          subjects: record.subjects || [],
        });
      }
    }
  } catch (error) {
    console.error("Failed to check duplicate emails:", error);
  }

  return duplicates;
}

// 获取邮箱的发送次数（用于显示）
export async function getEmailSendCounts(
  emails: string[]
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();

  if (!isSupabaseConfigured()) {
    return counts;
  }

  const normalizedEmails = emails.map((e) => e.toLowerCase().trim());

  try {
    const { data: records } = await supabase
      .from("email_history")
      .select("email, sent_count")
      .in("email", normalizedEmails);

    if (records) {
      for (const record of records) {
        counts.set(record.email, record.sent_count);
      }
    }
  } catch (error) {
    console.error("Failed to get email send counts:", error);
  }

  return counts;
}

// 获取历史记录总数
export async function getHistoryStats(): Promise<{ totalEmails: number; lastUpdated: number }> {
  if (!isSupabaseConfigured()) {
    return { totalEmails: 0, lastUpdated: Date.now() };
  }

  try {
    const { count } = await supabase
      .from("email_history")
      .select("*", { count: "exact", head: true });

    const { data: latest } = await supabase
      .from("email_history")
      .select("updated_at")
      .order("updated_at", { ascending: false })
      .limit(1)
      .single();

    return {
      totalEmails: count || 0,
      lastUpdated: latest ? new Date(latest.updated_at).getTime() : Date.now(),
    };
  } catch (error) {
    console.error("Failed to get history stats:", error);
    return { totalEmails: 0, lastUpdated: Date.now() };
  }
}
