import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// 初始化数据库表
export async function POST() {
  if (!supabase) {
    return NextResponse.json(
      { success: false, error: "Supabase 未配置" },
      { status: 500 }
    );
  }

  try {
    // 使用 RPC 调用执行 SQL（需要先在 Supabase 创建函数）
    // 或者直接检查并返回状态

    // 检查 scheduled_emails 表是否存在
    const { error: checkError } = await supabase
      .from("scheduled_emails")
      .select("id")
      .limit(1);

    if (checkError) {
      if (checkError.code === "42P01" || checkError.message.includes("does not exist")) {
        // 表不存在，尝试通过 RPC 创建（如果已配置）
        const { error: createError } = await supabase.rpc("create_scheduled_emails_table");

        if (createError) {
          // RPC 不存在或失败，返回建表 SQL
          return NextResponse.json({
            success: false,
            needsManualSetup: true,
            message: "请在 Supabase SQL Editor 中执行以下 SQL 创建表：",
            sql: `
-- 创建定时邮件任务表
CREATE TABLE IF NOT EXISTS scheduled_emails (
  id SERIAL PRIMARY KEY,
  job_id TEXT NOT NULL,
  to_email TEXT NOT NULL,
  contact_name TEXT,
  subject TEXT NOT NULL,
  content TEXT NOT NULL,
  send_date TEXT,
  send_time TEXT,
  scheduled_for BIGINT NOT NULL,
  status TEXT DEFAULT 'pending',
  error TEXT,
  sent_at BIGINT,
  email_config JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_status ON scheduled_emails(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_scheduled_for ON scheduled_emails(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_job_id ON scheduled_emails(job_id);

-- 创建 RPC 函数（可选，用于自动建表）
CREATE OR REPLACE FUNCTION create_scheduled_emails_table()
RETURNS void AS $$
BEGIN
  CREATE TABLE IF NOT EXISTS scheduled_emails (
    id SERIAL PRIMARY KEY,
    job_id TEXT NOT NULL,
    to_email TEXT NOT NULL,
    contact_name TEXT,
    subject TEXT NOT NULL,
    content TEXT NOT NULL,
    send_date TEXT,
    send_time TEXT,
    scheduled_for BIGINT NOT NULL,
    status TEXT DEFAULT 'pending',
    error TEXT,
    sent_at BIGINT,
    email_config JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
            `.trim(),
          });
        }

        return NextResponse.json({
          success: true,
          message: "scheduled_emails 表创建成功",
        });
      }

      // 其他错误
      if (checkError.code !== "PGRST116") {
        console.error("Check table error:", checkError);
      }
    }

    return NextResponse.json({
      success: true,
      message: "数据库表已就绪",
    });
  } catch (error) {
    console.error("Init DB error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return POST();
}
