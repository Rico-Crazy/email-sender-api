import * as XLSX from "xlsx";

export interface EmailTaskWithDelay {
  to: string;
  contactName: string;
  audienceType: string;
  phase: string;
  subject: string;
  sendDate: string;        // 原始日期字符串
  sendTime: string;        // 原始时间字符串
  sendDateTimeBeijing: string; // 转换后的北京时间显示
  day: string;
  content: string;
  delayHours: number;      // 延迟小时数
  scheduledTimestamp: number; // UTC 时间戳
}

export interface ParseResult {
  success: boolean;
  tasks?: EmailTaskWithDelay[];
  error?: string;
}

// ============ 时间转换核心逻辑 ============
// 美西时间 (Pacific Time) 统一按 PST (UTC-8) 计算
// 北京时间 (UTC+8)
// 时差: 16 小时 (北京 = 美西 + 16小时)

const PACIFIC_OFFSET_HOURS = -8;  // PST = UTC-8
const BEIJING_OFFSET_HOURS = 8;   // 北京 = UTC+8
const PACIFIC_TO_BEIJING_HOURS = 16; // 北京比美西快16小时

/**
 * 将 Excel 日期序列号转换为日期对象
 * Excel 日期从 1900-01-01 开始计数
 */
function excelSerialToDate(serial: number): { year: number; month: number; day: number } {
  const excelEpoch = new Date(Date.UTC(1899, 11, 30)); // 1899-12-30
  const date = new Date(excelEpoch.getTime() + serial * 24 * 60 * 60 * 1000);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

/**
 * 将 Excel 时间序列号转换为小时和分钟
 * Excel 时间是 0-1 之间的小数，1.0 = 24小时
 */
function excelSerialToTime(serial: number): { hours: number; minutes: number } {
  const totalMinutes = Math.round(serial * 24 * 60);
  return {
    hours: Math.floor(totalMinutes / 60) % 24,
    minutes: totalMinutes % 60,
  };
}

/**
 * 解析日期字符串，支持多种格式
 */
function parseDate(dateValue: string | number): { year: number; month: number; day: number } | null {
  // 如果是数字，当作 Excel 序列号处理
  if (typeof dateValue === "number" || (typeof dateValue === "string" && /^\d+(\.\d+)?$/.test(dateValue.trim()))) {
    const num = typeof dateValue === "number" ? dateValue : parseFloat(dateValue);
    if (num > 1000 && num < 100000) {
      const result = excelSerialToDate(Math.floor(num));
      console.log(`[parseDate] Excel serial ${num} -> ${result.year}-${result.month}-${result.day}`);
      return result;
    }
  }

  const str = String(dateValue).trim();
  if (!str) {
    console.log(`[parseDate] Empty date value`);
    return null;
  }

  // 格式: YYYY/MM/DD 或 YYYY-MM-DD 或 YYYY/M/D
  const isoMatch = str.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
  if (isoMatch) {
    const result = {
      year: parseInt(isoMatch[1], 10),
      month: parseInt(isoMatch[2], 10),
      day: parseInt(isoMatch[3], 10),
    };
    console.log(`[parseDate] ISO format "${str}" -> ${result.year}-${result.month}-${result.day}`);
    return result;
  }

  // 格式: MM/DD/YYYY 或 M/D/YYYY
  const usMatch = str.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (usMatch) {
    const result = {
      year: parseInt(usMatch[3], 10),
      month: parseInt(usMatch[1], 10),
      day: parseInt(usMatch[2], 10),
    };
    console.log(`[parseDate] US format "${str}" -> ${result.year}-${result.month}-${result.day}`);
    return result;
  }

  // 尝试 JS Date 解析
  const fallback = new Date(str);
  if (!isNaN(fallback.getTime())) {
    const result = {
      year: fallback.getFullYear(),
      month: fallback.getMonth() + 1,
      day: fallback.getDate(),
    };
    console.log(`[parseDate] JS Date fallback "${str}" -> ${result.year}-${result.month}-${result.day}`);
    return result;
  }

  console.log(`[parseDate] Failed to parse: "${str}"`);
  return null;
}

/**
 * 解析时间字符串，支持多种格式
 */
function parseTime(timeValue: string | number): { hours: number; minutes: number } {
  // 默认时间
  let hours = 0, minutes = 0;

  // 如果是数字，当作 Excel 时间序列号处理
  if (typeof timeValue === "number" || (typeof timeValue === "string" && /^0?\.\d+$/.test(timeValue.trim()))) {
    const num = typeof timeValue === "number" ? timeValue : parseFloat(timeValue);
    if (num >= 0 && num < 1) {
      return excelSerialToTime(num);
    }
  }

  const str = String(timeValue).trim();
  if (!str) return { hours: 0, minutes: 0 };

  // 格式: HH:MM 或 H:MM 或 HH:MM:SS
  const time24Match = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (time24Match) {
    hours = parseInt(time24Match[1], 10);
    minutes = parseInt(time24Match[2], 10);
    return { hours, minutes };
  }

  // 格式: H:MM AM/PM
  const time12Match = str.match(/^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)$/i);
  if (time12Match) {
    hours = parseInt(time12Match[1], 10);
    minutes = parseInt(time12Match[2], 10);
    const period = time12Match[3].toLowerCase();
    if (period === "pm" && hours !== 12) hours += 12;
    if (period === "am" && hours === 12) hours = 0;
    return { hours, minutes };
  }

  return { hours: 0, minutes: 0 };
}

/**
 * 将美西时间转换为 UTC 时间戳
 */
function pacificTimeToUtc(year: number, month: number, day: number, hours: number, minutes: number): number {
  // 美西时间 = UTC - 8小时 (PST)
  // 所以 UTC = 美西时间 + 8小时
  return Date.UTC(year, month - 1, day, hours - PACIFIC_OFFSET_HOURS, minutes, 0, 0);
}

/**
 * 将 UTC 时间戳转换为北京时间字符串
 */
function utcToBeijingTimeString(utcTimestamp: number): string {
  const beijingTime = new Date(utcTimestamp + BEIJING_OFFSET_HOURS * 60 * 60 * 1000);
  const year = beijingTime.getUTCFullYear();
  const month = String(beijingTime.getUTCMonth() + 1).padStart(2, "0");
  const day = String(beijingTime.getUTCDate()).padStart(2, "0");
  const hours = String(beijingTime.getUTCHours()).padStart(2, "0");
  const mins = String(beijingTime.getUTCMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${mins}`;
}

/**
 * 计算发送计划
 * @param sendDate 发送日期 (美西时间)
 * @param sendTime 发送时间 (美西时间)
 * @returns 计划信息
 */
function calculateSchedule(sendDate: string | number, sendTime: string | number): {
  delayHours: number;
  scheduledTimestamp: number;
  beijingTimeStr: string;
} {
  const now = Date.now();
  const nowBeijing = utcToBeijingTimeString(now);

  // 解析日期
  const date = parseDate(sendDate);
  if (!date) {
    // 没有日期，立即发送
    return { delayHours: 0, scheduledTimestamp: now, beijingTimeStr: nowBeijing };
  }

  // 解析时间
  const time = parseTime(sendTime);

  // 转换为 UTC 时间戳
  const targetUtc = pacificTimeToUtc(date.year, date.month, date.day, time.hours, time.minutes);
  const beijingTimeStr = utcToBeijingTimeString(targetUtc);

  // 计算延迟
  const diffMs = targetUtc - now;
  const diffHours = diffMs / (1000 * 60 * 60);

  // 如果目标时间已过，立即发送
  if (diffHours <= 0) {
    return { delayHours: 0, scheduledTimestamp: now, beijingTimeStr: nowBeijing };
  }

  return {
    delayHours: Math.round(diffHours * 100) / 100,
    scheduledTimestamp: targetUtc,
    beijingTimeStr,
  };
}

// ============ Excel 解析 ============

export function parseExcelBuffer(buffer: Buffer): ParseResult {
  try {
    const workbook = XLSX.read(buffer, { type: "buffer" });

    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return { success: false, error: "Excel file has no sheets" };
    }

    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: false });

    if (data.length === 0) {
      return { success: false, error: "Excel file is empty" };
    }

    const tasks: EmailTaskWithDelay[] = [];
    const errors: string[] = [];
    let skippedCount = 0;

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNum = i + 2;

      // 检测已发送标记
      const sentStatus = getColumnValue(row, ["Sent Status", "已发送", "Status", "状态", "发送状态"]);
      if (sentStatus && isSentMarker(sentStatus)) {
        skippedCount++;
        continue;
      }

      // 读取字段
      const email = getColumnValue(row, ["Email", "email", "邮箱", "收件人", "to", "邮件地址"]);
      const contactName = getColumnValue(row, ["Contact Name", "联系人", "姓名", "Name"]) || "";
      const audienceType = getColumnValue(row, ["Audience Type", "受众类型", "类型"]) || "";
      const phase = getColumnValue(row, ["Phase", "阶段"]) || "";
      const subject = getColumnValue(row, ["Subject Line", "Subject", "主题", "标题"]);
      const sendDate = getColumnValue(row, ["Send Date", "发送日期", "日期", "Date"]) || "";
      const sendTime = getColumnValue(row, ["Send Time", "发送时间", "时间", "Time"]) || "";
      const day = getColumnValue(row, ["Day", "星期", "周几"]) || "";
      const content = getColumnValue(row, ["Email Body", "content", "内容", "正文", "Content"]);

      // 验证必填字段
      if (!email) {
        errors.push(`Row ${rowNum}: Missing email`);
        continue;
      }
      if (!isValidEmail(email)) {
        errors.push(`Row ${rowNum}: Invalid email: ${email}`);
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

      // 计算发送时间
      const schedule = calculateSchedule(sendDate, sendTime);

      // Debug: 打印前几个任务的时间解析结果
      if (tasks.length < 3) {
        console.log(`[Excel] Row ${rowNum}: sendDate="${sendDate}", sendTime="${sendTime}"`);
        console.log(`  -> scheduledTimestamp=${schedule.scheduledTimestamp} (${new Date(schedule.scheduledTimestamp).toISOString()})`);
        console.log(`  -> beijingTime="${schedule.beijingTimeStr}", delayHours=${schedule.delayHours}`);
      }

      tasks.push({
        to: email,
        contactName,
        audienceType,
        phase,
        subject,
        sendDate: String(sendDate),
        sendTime: String(sendTime),
        sendDateTimeBeijing: schedule.beijingTimeStr,
        day,
        content,
        delayHours: schedule.delayHours,
        scheduledTimestamp: schedule.scheduledTimestamp,
      });
    }

    if (skippedCount > 0) {
      console.log(`Skipped ${skippedCount} already sent rows`);
    }

    if (tasks.length === 0) {
      return { success: false, error: `No valid tasks. ${errors.join("; ")}` };
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
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isSentMarker(value: string): boolean {
  const v = value.toLowerCase().trim();
  return ["已发送", "sent", "yes", "y", "true", "1", "✓", "✔", "done", "completed", "发送成功"].includes(v);
}
