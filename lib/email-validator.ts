import dns from "dns";
import { promisify } from "util";

const resolveMx = promisify(dns.resolveMx);

export interface EmailValidationResult {
  email: string;
  valid: boolean;
  reason?: string;
}

// 常见的无效邮箱域名
const INVALID_DOMAINS = new Set([
  "example.com",
  "test.com",
  "localhost",
  "invalid.com",
  "fake.com",
  "noemail.com",
]);

// 常见的临时邮箱域名
const TEMP_EMAIL_DOMAINS = new Set([
  "tempmail.com",
  "throwaway.email",
  "guerrillamail.com",
  "10minutemail.com",
  "mailinator.com",
  "yopmail.com",
  "trashmail.com",
]);

// 验证邮箱格式
function isValidEmailFormat(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// 验证单个邮箱
export async function validateEmail(email: string): Promise<EmailValidationResult> {
  const normalizedEmail = email.toLowerCase().trim();

  // 1. 检查格式
  if (!isValidEmailFormat(normalizedEmail)) {
    return { email, valid: false, reason: "邮箱格式无效" };
  }

  const domain = normalizedEmail.split("@")[1];

  // 2. 检查是否是已知的无效域名
  if (INVALID_DOMAINS.has(domain)) {
    return { email, valid: false, reason: "无效的邮箱域名" };
  }

  // 3. 检查是否是临时邮箱
  if (TEMP_EMAIL_DOMAINS.has(domain)) {
    return { email, valid: false, reason: "临时邮箱，建议跳过" };
  }

  // 4. 检查 MX 记录
  try {
    const mxRecords = await resolveMx(domain);
    if (!mxRecords || mxRecords.length === 0) {
      return { email, valid: false, reason: "域名无邮件服务器(MX记录)" };
    }
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOTFOUND" || err.code === "ENODATA") {
      return { email, valid: false, reason: "域名不存在或无邮件服务器" };
    }
    // 其他错误（如网络问题），默认为有效
    console.error(`MX lookup error for ${domain}:`, err.message);
  }

  return { email, valid: true };
}

// 批量验证邮箱
export async function validateEmails(
  emails: string[]
): Promise<EmailValidationResult[]> {
  const results: EmailValidationResult[] = [];

  // 并行验证，但限制并发数
  const batchSize = 10;
  for (let i = 0; i < emails.length; i += batchSize) {
    const batch = emails.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(validateEmail));
    results.push(...batchResults);
  }

  return results;
}

// 快速验证（只检查格式和已知无效域名，不检查MX）
export function quickValidateEmail(email: string): EmailValidationResult {
  const normalizedEmail = email.toLowerCase().trim();

  if (!isValidEmailFormat(normalizedEmail)) {
    return { email, valid: false, reason: "邮箱格式无效" };
  }

  const domain = normalizedEmail.split("@")[1];

  if (INVALID_DOMAINS.has(domain)) {
    return { email, valid: false, reason: "无效的邮箱域名" };
  }

  if (TEMP_EMAIL_DOMAINS.has(domain)) {
    return { email, valid: false, reason: "临时邮箱" };
  }

  return { email, valid: true };
}
