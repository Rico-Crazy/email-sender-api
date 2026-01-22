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
  provider?: "gmail" | "feishu" | "custom";
  // 自定义 SMTP 配置
  smtpHost?: string;
  smtpPort?: number;
  secure?: boolean;
}

// SMTP 配置预设
const SMTP_PRESETS = {
  gmail: {
    service: "gmail",
  },
  feishu: {
    host: "smtp.feishu.cn",
    port: 465,
    secure: true,
  },
};

function createTransporter(config?: EmailConfig) {
  const user = config?.user || process.env.GMAIL_USER;
  const pass = config?.pass || process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    throw new Error("Missing email credentials (user or password)");
  }

  const provider = config?.provider || "gmail";

  // 自定义 SMTP 配置
  if (provider === "custom" && config?.smtpHost) {
    return nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort || 465,
      secure: config.secure !== false,
      auth: { user, pass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
  }

  // 预设配置
  const preset = provider in SMTP_PRESETS
    ? SMTP_PRESETS[provider as keyof typeof SMTP_PRESETS]
    : SMTP_PRESETS.gmail;

  if ("service" in preset) {
    // Gmail 使用 service
    return nodemailer.createTransport({
      service: preset.service,
      auth: { user, pass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
  } else {
    // 其他使用 host/port
    return nodemailer.createTransport({
      host: preset.host,
      port: preset.port,
      secure: preset.secure,
      auth: { user, pass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
  }
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
    html = content;
    text = extractPlainText(content);
  } else {
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

    const { html, text } = processContent(task.content);
    const from = senderName ? `"${senderName}" <${user}>` : user;

    await transporter.sendMail({
      from,
      to: task.to,
      subject: task.subject,
      text,
      html,
      replyTo: user,
      headers: {
        "X-Priority": "3",
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

    // 发送间隔 2 秒
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  return {
    total: tasks.length,
    success: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  };
}
