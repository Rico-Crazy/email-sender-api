/**
 * 数据库初始化脚本 (ESM 版本)
 * 运行方式: node scripts/init-db.mjs
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载环境变量
dotenv.config({ path: join(__dirname, "../.env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ 错误: 请在 .env.local 中配置 Supabase 环境变量:");
  console.error("   NEXT_PUBLIC_SUPABASE_URL=你的Supabase项目URL");
  console.error("   SUPABASE_SERVICE_ROLE_KEY=你的Service Role Key");
  process.exit(1);
}

console.log("✅ Supabase URL:", supabaseUrl);

const supabase = createClient(supabaseUrl, supabaseKey);

const CREATE_TABLE_SQL = `
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

-- 创建索引加速查询
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_status ON scheduled_emails(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_scheduled_for ON scheduled_emails(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_job_id ON scheduled_emails(job_id);
`;

async function initDatabase() {
  console.log("\n🚀 开始初始化数据库...\n");

  try {
    // 检查表是否存在
    console.log("📋 检查 scheduled_emails 表是否存在...");
    const { data, error: checkError } = await supabase
      .from("scheduled_emails")
      .select("id")
      .limit(1);

    if (!checkError) {
      console.log("✅ scheduled_emails 表已存在！\n");
      return true;
    }

    if (checkError.code === "42P01" || checkError.message.includes("does not exist")) {
      console.log("⚠️  表不存在，需要创建\n");
      console.log("=".repeat(60));
      console.log("请复制以下 SQL 到 Supabase SQL Editor 中执行:\n");
      console.log(CREATE_TABLE_SQL);
      console.log("=".repeat(60));
      console.log("\n📝 操作步骤:");
      console.log("1. 打开浏览器访问: " + supabaseUrl.replace('.supabase.co', '.supabase.co/project/default/sql'));
      console.log("2. 或者登录 Supabase Dashboard -> 点击左侧 'SQL Editor'");
      console.log("3. 粘贴上面的 SQL 并点击 'Run'");
      console.log("4. 完成后重新运行此脚本验证\n");
      return false;
    }

    console.error("❌ 检查表时出错:", checkError);
    return false;

  } catch (error) {
    console.error("❌ 初始化失败:", error);
    return false;
  }
}

async function verifyTable() {
  console.log("🔍 验证表结构...\n");

  try {
    // 插入测试数据
    const testData = {
      job_id: "test_" + Date.now(),
      to_email: "test@example.com",
      contact_name: "Test",
      subject: "Test Subject",
      content: "Test Content",
      send_date: "2025-01-01",
      send_time: "09:00",
      scheduled_for: Date.now() + 3600000,
      status: "pending",
      email_config: { user: "test", pass: "test", provider: "gmail" },
    };

    const { data: inserted, error: insertError } = await supabase
      .from("scheduled_emails")
      .insert(testData)
      .select()
      .single();

    if (insertError) {
      console.error("❌ 插入测试数据失败:", insertError);
      return false;
    }

    console.log("✅ 插入测试数据成功 (id:", inserted.id, ")");

    // 删除测试数据
    const { error: deleteError } = await supabase
      .from("scheduled_emails")
      .delete()
      .eq("id", inserted.id);

    if (deleteError) {
      console.error("⚠️  删除测试数据失败:", deleteError);
    } else {
      console.log("✅ 清理测试数据成功");
    }

    return true;
  } catch (error) {
    console.error("❌ 验证失败:", error);
    return false;
  }
}

async function main() {
  const initialized = await initDatabase();

  if (initialized) {
    const verified = await verifyTable();
    if (verified) {
      console.log("\n🎉 数据库初始化完成！定时发送功能已就绪。");
      console.log("   现在可以部署到 Vercel 使用了。\n");
    } else {
      console.log("\n⚠️  表存在但验证失败，请检查表结构\n");
    }
  }
}

main().catch(console.error);
