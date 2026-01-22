import * as XLSX from "xlsx";

export interface EmailTaskWithDelay {
  to: string;
  subject: string;
  content: string;
  delayHours: number; // 延迟时间（小时）
}

export interface ParseResult {
  success: boolean;
  tasks?: EmailTaskWithDelay[];
  error?: string;
}

export function parseExcelBuffer(buffer: Buffer): ParseResult {
  try {
    const workbook = XLSX.read(buffer, { type: "buffer" });

    // Get the first sheet
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return { success: false, error: "Excel file has no sheets" };
    }

    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

    if (data.length === 0) {
      return { success: false, error: "Excel file is empty" };
    }

    const tasks: EmailTaskWithDelay[] = [];
    const errors: string[] = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNum = i + 2; // +2 because row 1 is header, and we're 0-indexed

      // Support multiple column name formats
      const email = getColumnValue(row, ["email", "邮箱", "收件人", "to", "Email", "邮件地址"]);
      const subject = getColumnValue(row, ["subject", "主题", "标题", "Subject", "邮件主题"]);
      const content = getColumnValue(row, ["content", "内容", "正文", "Content", "body", "邮件内容"]);
      const delayStr = getColumnValue(row, ["delay", "延迟", "延迟(小时)", "延迟时间", "Delay", "delay_hours"]);

      if (!email) {
        errors.push(`Row ${rowNum}: Missing email address`);
        continue;
      }

      if (!isValidEmail(email)) {
        errors.push(`Row ${rowNum}: Invalid email format: ${email}`);
        continue;
      }

      if (!subject) {
        errors.push(`Row ${rowNum}: Missing subject`);
        continue;
      }

      if (!content) {
        errors.push(`Row ${rowNum}: Missing content`);
        continue;
      }

      // 解析延迟时间（小时），默认为 0（立即发送）
      let delayHours = 0;
      if (delayStr) {
        const parsed = parseFloat(delayStr);
        if (!isNaN(parsed) && parsed >= 0) {
          delayHours = parsed;
        }
      }

      tasks.push({
        to: email,
        subject: subject,
        content: content,
        delayHours: delayHours,
      });
    }

    if (tasks.length === 0) {
      return {
        success: false,
        error: `No valid email tasks found. Errors: ${errors.join("; ")}`,
      };
    }

    return { success: true, tasks };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: `Failed to parse Excel: ${message}` };
  }
}

function getColumnValue(row: Record<string, unknown>, possibleNames: string[]): string | null {
  for (const name of possibleNames) {
    if (row[name] !== undefined && row[name] !== null && row[name] !== "") {
      return String(row[name]).trim();
    }
  }
  return null;
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
