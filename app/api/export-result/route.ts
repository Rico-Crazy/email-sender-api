import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

// 强制使用 Node.js runtime
export const runtime = "nodejs";

interface SendResultItem {
  email: string;
  contactName: string;
  subject: string;
  success: boolean;
  error?: string;
  sentAt?: number;
  skipped?: boolean;
  scheduledFor?: number;
  sendDate?: string;
  sendTime?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { results, jobId } = body as {
      results: SendResultItem[];
      jobId?: string;
    };

    if (!results || results.length === 0) {
      return NextResponse.json(
        { error: "No results to export" },
        { status: 400 }
      );
    }

    // 计算剩余时间（小时）
    const now = Date.now();
    const calculateRemainingHours = (scheduledFor?: number): string => {
      if (!scheduledFor) return "";
      const diffMs = scheduledFor - now;
      if (diffMs <= 0) return "0";
      const hours = diffMs / (1000 * 60 * 60);
      return hours.toFixed(1);
    };

    // 格式化时间为北京时间
    const formatToBeijingTime = (timestamp: number): string => {
      // 北京时间 = UTC+8
      const beijingDate = new Date(timestamp + 8 * 60 * 60 * 1000);
      const year = beijingDate.getUTCFullYear();
      const month = String(beijingDate.getUTCMonth() + 1).padStart(2, '0');
      const day = String(beijingDate.getUTCDate()).padStart(2, '0');
      const hours = String(beijingDate.getUTCHours()).padStart(2, '0');
      const minutes = String(beijingDate.getUTCMinutes()).padStart(2, '0');
      return `${year}-${month}-${day} ${hours}:${minutes}`;
    };

    // 格式化预计发送时间（北京时间）
    const formatScheduledTime = (r: SendResultItem): string => {
      if (r.scheduledFor) {
        return formatToBeijingTime(r.scheduledFor) + " (北京)";
      }
      return "";
    };

    // 格式化数据
    const exportData = results.map((r, index) => ({
      "序号": index + 1,
      "邮箱": r.email,
      "联系人": r.contactName || "",
      "主题": r.subject,
      "状态": r.success ? "发送成功" : (r.skipped ? "已跳过" : "发送失败"),
      "错误信息": r.error || "",
      "发送时间": r.sentAt
        ? formatToBeijingTime(r.sentAt) + " (北京)"
        : "",
      "预计发送时间": formatScheduledTime(r),
      "剩余时间(h)": calculateRemainingHours(r.scheduledFor),
    }));

    // 统计信息
    const successCount = results.filter((r) => r.success).length;
    const skippedCount = results.filter((r) => r.skipped).length;
    const failedCount = results.filter((r) => !r.success && !r.skipped).length;

    // 添加统计行
    exportData.push({} as typeof exportData[0]); // 空行
    exportData.push({
      "序号": "" as unknown as number,
      "邮箱": "统计",
      "联系人": "",
      "主题": `总计: ${results.length}`,
      "状态": `成功: ${successCount}`,
      "错误信息": `跳过: ${skippedCount} | 失败: ${failedCount}`,
      "发送时间": "",
      "预计发送时间": "",
      "剩余时间(h)": "",
    });

    // 创建工作簿
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(exportData);

    // 设置列宽
    worksheet["!cols"] = [
      { wch: 6 },  // 序号
      { wch: 30 }, // 邮箱
      { wch: 15 }, // 联系人
      { wch: 40 }, // 主题
      { wch: 12 }, // 状态
      { wch: 30 }, // 错误信息
      { wch: 20 }, // 发送时间
      { wch: 20 }, // 预计发送时间
      { wch: 12 }, // 剩余时间(h)
    ];

    XLSX.utils.book_append_sheet(workbook, worksheet, "发送结果");

    // 如果有失败的邮件，单独创建一个失败列表工作表
    const failedResults = results.filter((r) => !r.success);
    if (failedResults.length > 0) {
      const failedData = failedResults.map((r, index) => ({
        "序号": index + 1,
        "邮箱": r.email,
        "联系人": r.contactName || "",
        "主题": r.subject,
        "错误信息": r.error || "未知错误",
      }));

      const failedSheet = XLSX.utils.json_to_sheet(failedData);
      failedSheet["!cols"] = [
        { wch: 6 },  // 序号
        { wch: 30 }, // 邮箱
        { wch: 15 }, // 联系人
        { wch: 40 }, // 主题
        { wch: 40 }, // 错误信息
      ];
      XLSX.utils.book_append_sheet(workbook, failedSheet, "失败列表");
    }

    // 生成 base64 编码的数据
    const base64Data = XLSX.write(workbook, { type: "base64", bookType: "xlsx" });

    // 生成文件名
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, "");
    const filename = `send-result-${timestamp}.xlsx`;

    // 返回 JSON 格式，包含 base64 数据
    return NextResponse.json({
      data: base64Data,
      filename: filename,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  } catch (error) {
    console.error("Export error:", error);
    return NextResponse.json(
      { error: "Failed to generate export file" },
      { status: 500 }
    );
  }
}
