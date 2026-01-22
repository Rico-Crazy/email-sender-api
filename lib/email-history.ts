import fs from "fs";
import path from "path";

// 历史发送邮箱记录
export interface EmailHistoryRecord {
  email: string;
  lastSentAt: number; // 最后发送时间戳
  sentCount: number; // 发送次数
  subjects: string[]; // 最近发送的主题（最多保留5个）
}

interface EmailHistoryData {
  records: Record<string, EmailHistoryRecord>; // key 为邮箱地址
  lastUpdated: number;
}

// Vercel 环境使用 /tmp，本地开发使用 data 目录
const isVercel = process.env.VERCEL === "1";
const HISTORY_FILE = isVercel
  ? "/tmp/email-history.json"
  : path.join(process.cwd(), "data", "email-history.json");

// 确保数据目录存在
function ensureDataDir() {
  if (isVercel) return; // Vercel 的 /tmp 目录已存在

  const dataDir = path.dirname(HISTORY_FILE);
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  } catch (error) {
    console.error("Failed to create data directory:", error);
  }
}

// 读取历史记录
export function loadEmailHistory(): EmailHistoryData {
  ensureDataDir();
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const data = fs.readFileSync(HISTORY_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Failed to load email history:", error);
  }
  return { records: {}, lastUpdated: Date.now() };
}

// 保存历史记录
function saveEmailHistory(data: EmailHistoryData) {
  ensureDataDir();
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (error) {
    // 在 Vercel 环境中，/tmp 可能偶尔不可用，静默失败
    console.error("Failed to save email history:", error);
  }
}

// 记录发送成功的邮箱
export function recordSentEmail(email: string, subject: string) {
  const history = loadEmailHistory();
  const normalizedEmail = email.toLowerCase().trim();
  const now = Date.now();

  if (history.records[normalizedEmail]) {
    // 更新现有记录
    const record = history.records[normalizedEmail];
    record.lastSentAt = now;
    record.sentCount += 1;
    // 保留最近5个主题
    record.subjects = [subject, ...record.subjects.slice(0, 4)];
  } else {
    // 新增记录
    history.records[normalizedEmail] = {
      email: normalizedEmail,
      lastSentAt: now,
      sentCount: 1,
      subjects: [subject],
    };
  }

  history.lastUpdated = now;
  saveEmailHistory(history);
}

// 批量记录发送成功的邮箱
export function recordSentEmails(
  emails: Array<{ email: string; subject: string }>
) {
  const history = loadEmailHistory();
  const now = Date.now();

  for (const { email, subject } of emails) {
    const normalizedEmail = email.toLowerCase().trim();

    if (history.records[normalizedEmail]) {
      const record = history.records[normalizedEmail];
      record.lastSentAt = now;
      record.sentCount += 1;
      record.subjects = [subject, ...record.subjects.slice(0, 4)];
    } else {
      history.records[normalizedEmail] = {
        email: normalizedEmail,
        lastSentAt: now,
        sentCount: 1,
        subjects: [subject],
      };
    }
  }

  history.lastUpdated = now;
  saveEmailHistory(history);
}

// 检查邮箱是否在历史记录中（返回重复的邮箱列表）
export function checkDuplicateEmails(
  emails: string[]
): Array<EmailHistoryRecord> {
  const history = loadEmailHistory();
  const duplicates: EmailHistoryRecord[] = [];

  for (const email of emails) {
    const normalizedEmail = email.toLowerCase().trim();
    if (history.records[normalizedEmail]) {
      duplicates.push(history.records[normalizedEmail]);
    }
  }

  return duplicates;
}

// 获取历史记录总数
export function getHistoryStats(): { totalEmails: number; lastUpdated: number } {
  const history = loadEmailHistory();
  return {
    totalEmails: Object.keys(history.records).length,
    lastUpdated: history.lastUpdated,
  };
}
