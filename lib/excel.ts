import * as XLSX from "xlsx";

export interface EmailTaskWithDelay {
  to: string;
  contactName: string;
  audienceType: string;
  phase: string;
  subject: string;
  sendDate: string;
  sendTime: string;
  sendDateTimeBeijing: string; // 发送时间（北京时间格式显示）
  day: string;
  content: string;
  delayHours: number; // 延迟时间（小时），根据 sendDate 和 sendTime 计算
  scheduledTimestamp: number; // 计划发送的绝对时间戳 (UTC)
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

    let skippedCount = 0; // 统计跳过已发送的行数

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNum = i + 2; // +2 because row 1 is header, and we're 0-indexed

      // 检测已发送标记，跳过已发送的行
      const sentStatus = getColumnValue(row, ["Sent Status", "已发送", "Status", "状态", "发送状态"]);
      if (sentStatus && isSentMarker(sentStatus)) {
        skippedCount++;
        continue; // 跳过已发送的行
      }

      // Support multiple column name formats
      const email = getColumnValue(row, ["Email", "email", "邮箱", "收件人", "to", "邮件地址"]);
      const contactName = getColumnValue(row, ["Contact Name", "联系人", "姓名", "Name", "收件人姓名"]) || "";
      const audienceType = getColumnValue(row, ["Audience Type", "受众类型", "类型", "Type"]) || "";
      const phase = getColumnValue(row, ["Phase", "阶段", "phase"]) || "";
      const subject = getColumnValue(row, ["Subject Line", "Subject", "subject", "主题", "标题", "邮件主题"]);
      const sendDate = getColumnValue(row, ["Send Date", "发送日期", "日期", "Date"]) || "";
      const sendTime = getColumnValue(row, ["Send Time", "发送时间", "时间", "Time"]) || "";
      const day = getColumnValue(row, ["Day", "星期", "day", "周几"]) || "";
      const content = getColumnValue(row, ["Email Body", "content", "内容", "正文", "Content", "body", "邮件内容"]);

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

      // 根据 sendDate 和 sendTime 计算发送计划
      const schedule = calculateSchedule(sendDate, sendTime);

      tasks.push({
        to: email,
        contactName: contactName,
        audienceType: audienceType,
        phase: phase,
        subject: subject,
        sendDate: sendDate,
        sendTime: sendTime,
        sendDateTimeBeijing: schedule.beijingTimeStr,
        day: day,
        content: content,
        delayHours: schedule.delayHours,
        scheduledTimestamp: schedule.scheduledTimestamp,
      });
    }

    if (skippedCount > 0) {
      console.log(`Skipped ${skippedCount} already sent rows`);
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

// 检测已发送标记
function isSentMarker(value: string): boolean {
  const normalizedValue = value.toLowerCase().trim();
  const sentMarkers = [
    "已发送", "sent", "yes", "y", "true", "1", "✓", "✔", "done", "completed", "发送成功"
  ];
  return sentMarkers.includes(normalizedValue);
}

// 判断是否为美国夏令时（大约3月第二个周日到11月第一个周日）
function isPacificDST(year: number, month: number, day: number): boolean {
  // 简化判断：3月15日-11月1日期间使用PDT
  if (month > 3 && month < 11) return true;
  if (month === 3 && day >= 15) return true;
  if (month === 11 && day < 7) return true;
  return false;
}

// 格式化时间戳为北京时间字符串
function formatToBeijingTime(timestamp: number): string {
  // 北京时间 = UTC+8
  const beijingDate = new Date(timestamp + 8 * 60 * 60 * 1000);
  const year = beijingDate.getUTCFullYear();
  const month = String(beijingDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(beijingDate.getUTCDate()).padStart(2, '0');
  const hours = String(beijingDate.getUTCHours()).padStart(2, '0');
  const minutes = String(beijingDate.getUTCMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

interface ScheduleResult {
  delayHours: number;
  scheduledTimestamp: number;
  beijingTimeStr: string;
}

// 根据发送日期和时间计算发送计划
// 注意：表格中的时间是美西时间 (Pacific Time)，转换为北京时间进行显示和计算
function calculateSchedule(sendDate: string, sendTime: string): ScheduleResult {
  const now = Date.now();

  if (!sendDate) {
    return { delayHours: 0, scheduledTimestamp: now, beijingTimeStr: formatToBeijingTime(now) };
  }

  try {
    const dateStr = sendDate.trim();
    const timeStr = sendTime ? sendTime.trim() : "00:00";

    // 解析日期部分
    let year: number, month: number, day: number;

    // 尝试解析不同的日期格式
    // 格式1: YYYY-MM-DD 或 YYYY/MM/DD
    const isoMatch = dateStr.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
    if (isoMatch) {
      year = parseInt(isoMatch[1], 10);
      month = parseInt(isoMatch[2], 10);
      day = parseInt(isoMatch[3], 10);
    } else {
      // 格式2: MM/DD/YYYY 或 DD/MM/YYYY（假设 MM/DD/YYYY）
      const usMatch = dateStr.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
      if (usMatch) {
        month = parseInt(usMatch[1], 10);
        day = parseInt(usMatch[2], 10);
        year = parseInt(usMatch[3], 10);
      } else {
        // 格式3: DD-Mon-YYYY 或其他格式，尝试直接解析
        const fallbackDate = new Date(dateStr);
        if (!isNaN(fallbackDate.getTime())) {
          year = fallbackDate.getFullYear();
          month = fallbackDate.getMonth() + 1;
          day = fallbackDate.getDate();
        } else {
          return { delayHours: 0, scheduledTimestamp: now, beijingTimeStr: formatToBeijingTime(now) };
        }
      }
    }

    // 解析时间部分（支持 HH:MM, HH:MM:SS, H:MM AM/PM 等格式）
    let hours = 0, minutes = 0;

    // 尝试 24 小时制 HH:MM 或 HH:MM:SS
    const time24Match = timeStr.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (time24Match) {
      hours = parseInt(time24Match[1], 10);
      minutes = parseInt(time24Match[2], 10);
    } else {
      // 尝试 12 小时制 H:MM AM/PM
      const time12Match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?$/i);
      if (time12Match) {
        hours = parseInt(time12Match[1], 10);
        minutes = parseInt(time12Match[2], 10);
        const period = time12Match[3];
        if (period) {
          if (period.toLowerCase() === 'pm' && hours !== 12) {
            hours += 12;
          } else if (period.toLowerCase() === 'am' && hours === 12) {
            hours = 0;
          }
        }
      }
    }

    // 表格时间是美西时间 (Pacific Time)
    // PDT (夏令时): UTC-7
    // PST (标准时): UTC-8
    const isDST = isPacificDST(year, month, day);
    const pacificOffset = isDST ? 7 : 8; // PDT = UTC-7, PST = UTC-8

    // 创建 UTC 时间戳：Pacific Time + offset = UTC
    const targetUtc = Date.UTC(year, month - 1, day, hours + pacificOffset, minutes, 0, 0);

    if (isNaN(targetUtc)) {
      return { delayHours: 0, scheduledTimestamp: now, beijingTimeStr: formatToBeijingTime(now) };
    }

    const diffMs = targetUtc - now;
    const diffHours = diffMs / (1000 * 60 * 60);

    // 如果是过去的时间，立即发送
    if (diffHours <= 0) {
      return { delayHours: 0, scheduledTimestamp: now, beijingTimeStr: formatToBeijingTime(now) };
    }

    return {
      delayHours: Math.round(diffHours * 100) / 100,
      scheduledTimestamp: targetUtc,
      beijingTimeStr: formatToBeijingTime(targetUtc),
    };
  } catch {
    return { delayHours: 0, scheduledTimestamp: now, beijingTimeStr: formatToBeijingTime(now) };
  }
}
