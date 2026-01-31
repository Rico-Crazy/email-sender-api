import { supabase } from "./supabase";
import { sendEmail, type EmailConfig } from "./gmail";
import { recordSentEmail } from "./email-history";

// 定时邮件任务接口
export interface ScheduledEmail {
  id?: number;
  job_id: string;
  to_email: string;
  contact_name: string;
  subject: string;
  content: string;
  send_date: string;
  send_time: string;
  scheduled_for: number; // UTC timestamp
  status: "pending" | "sent" | "failed";
  error?: string;
  sent_at?: number;
  email_config: EmailConfig;
  created_at?: string;
  updated_at?: string;
}

// 检查 Supabase 是否已配置
function isSupabaseConfigured(): boolean {
  return supabase !== null;
}

// 初始化数据库表（如果不存在则创建）
export async function initScheduledEmailsTable(): Promise<{ success: boolean; message: string }> {
  if (!isSupabaseConfigured()) {
    return { success: false, message: "Supabase 未配置" };
  }

  try {
    // 检查表是否存在
    const { error: checkError } = await supabase!
      .from("scheduled_emails")
      .select("id")
      .limit(1);

    if (checkError && checkError.code === "42P01") {
      // 表不存在，需要创建
      // 注意：Supabase 客户端不能直接执行 DDL，需要通过 SQL Editor 或 RPC
      return {
        success: false,
        message: "scheduled_emails 表不存在，请在 Supabase 控制台执行建表 SQL",
      };
    }

    if (checkError && checkError.code !== "PGRST116") {
      // PGRST116 是表为空的错误，可以忽略
      console.error("Check table error:", checkError);
    }

    return { success: true, message: "scheduled_emails 表已就绪" };
  } catch (error) {
    console.error("Init table error:", error);
    return { success: false, message: String(error) };
  }
}

// 批量保存定时邮件任务
export async function saveScheduledEmails(
  tasks: Array<{
    jobId: string;
    to: string;
    contactName: string;
    subject: string;
    content: string;
    sendDate: string;
    sendTime: string;
    scheduledFor: number;
    emailConfig: EmailConfig;
  }>
): Promise<{ success: boolean; savedCount: number; error?: string }> {
  if (!isSupabaseConfigured()) {
    return { success: false, savedCount: 0, error: "Supabase 未配置" };
  }

  try {
    const records = tasks.map((task) => ({
      job_id: task.jobId,
      to_email: task.to,
      contact_name: task.contactName,
      subject: task.subject,
      content: task.content,
      send_date: task.sendDate,
      send_time: task.sendTime,
      scheduled_for: task.scheduledFor,
      status: "pending",
      email_config: task.emailConfig,
    }));

    const { data, error } = await supabase!
      .from("scheduled_emails")
      .insert(records)
      .select();

    if (error) {
      console.error("Save scheduled emails error:", error);
      return { success: false, savedCount: 0, error: error.message };
    }

    return { success: true, savedCount: data?.length || 0 };
  } catch (error) {
    console.error("Save scheduled emails error:", error);
    return { success: false, savedCount: 0, error: String(error) };
  }
}

// 获取到期的待发送邮件
export async function getDueEmails(limit: number = 50): Promise<ScheduledEmail[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  const now = Date.now();

  try {
    const { data, error } = await supabase!
      .from("scheduled_emails")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_for", now)
      .order("scheduled_for", { ascending: true })
      .limit(limit);

    if (error) {
      console.error("Get due emails error:", error);
      return [];
    }

    return (data || []) as ScheduledEmail[];
  } catch (error) {
    console.error("Get due emails error:", error);
    return [];
  }
}

// 更新邮件状态
export async function updateEmailStatus(
  id: number,
  status: "sent" | "failed",
  error?: string
): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    return false;
  }

  try {
    const updateData: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (status === "sent") {
      updateData.sent_at = Date.now();
    }

    if (error) {
      updateData.error = error;
    }

    const { error: updateError } = await supabase!
      .from("scheduled_emails")
      .update(updateData)
      .eq("id", id);

    if (updateError) {
      console.error("Update email status error:", updateError);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Update email status error:", error);
    return false;
  }
}

// 发送到期的邮件（由 cron 调用）
export async function processDueEmails(): Promise<{
  processed: number;
  success: number;
  failed: number;
  errors: string[];
}> {
  const result = {
    processed: 0,
    success: 0,
    failed: 0,
    errors: [] as string[],
  };

  const dueEmails = await getDueEmails(20); // 每次最多处理 20 封

  if (dueEmails.length === 0) {
    return result;
  }

  console.log(`[Cron] Found ${dueEmails.length} due emails to send`);

  for (const email of dueEmails) {
    result.processed++;

    try {
      // 发送邮件
      const sendResult = await sendEmail(
        {
          to: email.to_email,
          subject: email.subject,
          content: email.content,
        },
        email.email_config
      );

      if (sendResult.success) {
        await updateEmailStatus(email.id!, "sent");
        // 记录到历史
        await recordSentEmail(email.to_email, email.subject);
        result.success++;
        console.log(`[Cron] Sent email to ${email.to_email}`);
      } else {
        await updateEmailStatus(email.id!, "failed", sendResult.error);
        result.failed++;
        result.errors.push(`${email.to_email}: ${sendResult.error}`);
        console.error(`[Cron] Failed to send to ${email.to_email}: ${sendResult.error}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await updateEmailStatus(email.id!, "failed", errorMsg);
      result.failed++;
      result.errors.push(`${email.to_email}: ${errorMsg}`);
      console.error(`[Cron] Error sending to ${email.to_email}:`, error);
    }

    // 发送间隔 2 秒，避免触发限制
    if (result.processed < dueEmails.length) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  return result;
}

// 获取 job 的所有任务状态
export async function getJobTasks(jobId: string): Promise<ScheduledEmail[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  try {
    const { data, error } = await supabase!
      .from("scheduled_emails")
      .select("*")
      .eq("job_id", jobId)
      .order("scheduled_for", { ascending: true });

    if (error) {
      console.error("Get job tasks error:", error);
      return [];
    }

    return (data || []) as ScheduledEmail[];
  } catch (error) {
    console.error("Get job tasks error:", error);
    return [];
  }
}

// 获取所有待发送的任务统计
export async function getPendingStats(): Promise<{
  total: number;
  pending: number;
  sent: number;
  failed: number;
  nextDue?: number;
}> {
  if (!isSupabaseConfigured()) {
    return { total: 0, pending: 0, sent: 0, failed: 0 };
  }

  try {
    // 获取各状态数量
    const { data: pendingData } = await supabase!
      .from("scheduled_emails")
      .select("id", { count: "exact" })
      .eq("status", "pending");

    const { data: sentData } = await supabase!
      .from("scheduled_emails")
      .select("id", { count: "exact" })
      .eq("status", "sent");

    const { data: failedData } = await supabase!
      .from("scheduled_emails")
      .select("id", { count: "exact" })
      .eq("status", "failed");

    // 获取下一个到期的任务
    const { data: nextDueData } = await supabase!
      .from("scheduled_emails")
      .select("scheduled_for")
      .eq("status", "pending")
      .order("scheduled_for", { ascending: true })
      .limit(1)
      .single();

    const pending = pendingData?.length || 0;
    const sent = sentData?.length || 0;
    const failed = failedData?.length || 0;

    return {
      total: pending + sent + failed,
      pending,
      sent,
      failed,
      nextDue: nextDueData?.scheduled_for,
    };
  } catch (error) {
    console.error("Get pending stats error:", error);
    return { total: 0, pending: 0, sent: 0, failed: 0 };
  }
}

// 删除已完成的旧任务（保留最近 7 天）
export async function cleanupOldTasks(): Promise<number> {
  if (!isSupabaseConfigured()) {
    return 0;
  }

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  try {
    const { data, error } = await supabase!
      .from("scheduled_emails")
      .delete()
      .in("status", ["sent", "failed"])
      .lt("scheduled_for", sevenDaysAgo)
      .select();

    if (error) {
      console.error("Cleanup old tasks error:", error);
      return 0;
    }

    return data?.length || 0;
  } catch (error) {
    console.error("Cleanup old tasks error:", error);
    return 0;
  }
}
