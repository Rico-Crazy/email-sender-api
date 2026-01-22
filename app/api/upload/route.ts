import { NextRequest, NextResponse } from "next/server";
import { parseExcelBuffer } from "@/lib/excel";
import { createJobData } from "@/lib/storage";
import type { EmailConfig } from "@/lib/gmail";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    // 获取可选的邮箱配置
    const emailUser = formData.get("emailUser") as string | null;
    const emailPass = formData.get("emailPass") as string | null;
    const senderName = formData.get("senderName") as string | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file uploaded" },
        { status: 400 }
      );
    }

    // Validate file type
    const validTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // xlsx
      "application/vnd.ms-excel", // xls
    ];

    if (!validTypes.includes(file.type) && !file.name.match(/\.xlsx?$/i)) {
      return NextResponse.json(
        { error: "Invalid file type. Please upload an Excel file (.xlsx or .xls)" },
        { status: 400 }
      );
    }

    // Read file buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Parse Excel
    const parseResult = parseExcelBuffer(buffer);
    if (!parseResult.success || !parseResult.tasks) {
      return NextResponse.json(
        { error: parseResult.error },
        { status: 400 }
      );
    }

    // 准备邮箱配置（如果提供）
    let emailConfig: EmailConfig | undefined;
    if (emailUser && emailPass) {
      emailConfig = {
        user: emailUser,
        pass: emailPass,
        senderName: senderName || undefined,
      };
    }

    // 创建 job 数据（返回给客户端保存）
    const job = createJobData(parseResult.tasks, emailConfig);

    // 计算延迟信息
    const immediateCount = parseResult.tasks.filter(t => t.delayHours === 0).length;
    const scheduledCount = parseResult.tasks.filter(t => t.delayHours > 0).length;
    const maxDelay = Math.max(...parseResult.tasks.map(t => t.delayHours));

    return NextResponse.json({
      success: true,
      job, // 返回完整的 job 数据给客户端
      taskCount: job.tasks.length,
      immediateCount,
      scheduledCount,
      maxDelayHours: maxDelay,
      hasCustomEmail: !!emailConfig,
      message: scheduledCount > 0
        ? `任务已创建，包含 ${job.tasks.length} 封邮件：${immediateCount} 封立即发送，${scheduledCount} 封延迟发送（最长 ${maxDelay} 小时）`
        : `任务已创建，包含 ${job.tasks.length} 封邮件，可立即发送`,
    });
  } catch (error) {
    console.error("Upload error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Upload failed: ${message}` },
      { status: 500 }
    );
  }
}
