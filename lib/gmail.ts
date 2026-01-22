import nodemailer from "nodemailer";
import { formatEmailContent, extractPlainText } from "./format";

export interface EmailTask {
  to: string;
  subject: string;
  content: string;
}

export interface EmailConfig {
  user: string;
  pass: string;
  senderName?: string;
}

function createTransporter(config?: EmailConfig) {
  const user = config?.user || process.env.GMAIL_USER;
  const pass = config?.pass || process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    throw new Error("Missing GMAIL_USER or GMAIL_APP_PASSWORD");
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user,
      pass,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
}

/**
 * 判断内容是否已经是 HTML 格式
 */
function isHtml(content: string): boolean {
  return /<[^>]+>/.test(content);
}

/**
 * 处理邮件内容，确保正确的 HTML 格式
 */
function processContent(content: string): { html: string; text: string } {
  let html: string;
  let text: string;

  if (isHtml(content)) {
    // 已经是 HTML，直接使用
    html = content;
    text = extractPlainText(content);
  } else {
    // 纯文本，转换为 HTML
    html = formatEmailContent(content);
    text = content;
  }

  return { html, text };
}

export async function sendEmail(
  task: EmailTask,
  config?: EmailConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    const transporter = createTransporter(config);
    const user = config?.user || process.env.GMAIL_USER;
    const senderName = config?.senderName || "";

    // 处理内容格式
    const { html, text } = processContent(task.content);

    // 构建发件人地址（带名称）
    const from = senderName ? `"${senderName}" <${user}>` : user;

    await transporter.sendMail({
      from,
      to: task.to,
      subject: task.subject,
      // 同时提供纯文本和 HTML 版本，避免被标记为垃圾邮件
      text,
      html,
      // 添加 Reply-To 头
      replyTo: user,
      headers: {
        // 添加优先级头
        "X-Priority": "3",
        // 标记为正常邮件
        "X-Mailer": "Email Sender API",
      },
    });

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

export async function sendEmailBatch(
  tasks: EmailTask[],
  config?: EmailConfig
): Promise<{
  total: number;
  success: number;
  failed: number;
  results: Array<{ email: string; success: boolean; error?: string }>;
}> {
  const results: Array<{ email: string; success: boolean; error?: string }> = [];

  for (const task of tasks) {
    const result = await sendEmail(task, config);
    results.push({
      email: task.to,
      success: result.success,
      error: result.error,
    });

    // 增加发送间隔到 2 秒，避免被标记为垃圾邮件
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  return {
    total: tasks.length,
    success: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  };
}
