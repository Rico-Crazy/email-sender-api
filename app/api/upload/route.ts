import { NextRequest, NextResponse } from "next/server";
import { parseExcelBuffer } from "@/lib/excel";
import { createJobData } from "@/lib/storage";
import type { EmailConfig } from "@/lib/gmail";
import { checkDuplicateEmails, getEmailSendCounts } from "@/lib/email-history";
import { saveScheduledEmails } from "@/lib/scheduled-emails";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    // 获取可选的邮箱配置
    const emailUser = formData.get("emailUser") as string | null;
    const emailPass = formData.get("emailPass") as string | null;
    const senderName = formData.get("senderName") as string | null;
    const emailProvider = formData.get("emailProvider") as "gmail" | "feishu" | null;

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
        provider: emailProvider || "gmail",
      };
    }

    // 创建 job 数据（返回给客户端保存）
    const job = createJobData(parseResult.tasks, emailConfig);

    // 调试：打印解析结果
    const debugNow = Date.now();
    console.log("========== Upload Debug ==========");
    console.log("当前UTC时间:", debugNow, new Date(debugNow).toISOString());
    parseResult.tasks.slice(0, 3).forEach((t, i) => {
      console.log(`Task ${i}: sendDate="${t.sendDate}", sendTime="${t.sendTime}"`);
      console.log(`  scheduledTimestamp: ${t.scheduledTimestamp}`);
      console.log(`  scheduledTime: ${new Date(t.scheduledTimestamp).toISOString()}`);
      console.log(`  beijingTime: ${t.sendDateTimeBeijing}`);
      console.log(`  delayHours: ${t.delayHours}`);
      console.log(`  isDue: ${t.scheduledTimestamp <= debugNow}`);
    });
    console.log("===================================");

    // 检测重复邮箱（与历史记录比对，超过3次才报警）
    const emails = parseResult.tasks.map((t) => t.to);
    const duplicates = await checkDuplicateEmails(emails, 3); // 超过3次才报警

    // 获取所有邮箱的历史发送次数
    const historySendCounts = await getEmailSendCounts(emails);
    const emailSendCounts = Object.fromEntries(historySendCounts);

    // 检测文件内重复邮箱（超过3次才算重复）
    const emailCounts = new Map<string, number>();
    for (const email of emails) {
      const normalized = email.toLowerCase().trim();
      emailCounts.set(normalized, (emailCounts.get(normalized) || 0) + 1);
    }
    const inFileDuplicates = Array.from(emailCounts.entries())
      .filter(([, count]) => count > 3) // 超过3次才报警
      .map(([email, count]) => ({ email, count }));

    // 计算延迟信息（基于时间戳，更准确）
    const now = Date.now();
    const immediateCount = job.tasks.filter(t => t.scheduledFor <= now).length;
    const scheduledCount = job.tasks.filter(t => t.scheduledFor > now).length;
    const maxDelay = Math.max(...parseResult.tasks.map(t => t.delayHours), 0);

    // 将定时任务保存到数据库（用于自动发送）
    let scheduledSaveResult: { success: boolean; savedCount: number; error?: string } = { success: false, savedCount: 0 };
    if (emailConfig && scheduledCount > 0) {
      // 只保存定时任务（未到期的），到期的任务由前端手动发送
      const scheduledTasks = parseResult.tasks
        .filter(t => t.scheduledTimestamp > now)
        .map(t => ({
          jobId: job.id,
          to: t.to,
          contactName: t.contactName,
          subject: t.subject,
          content: t.content,
          sendDate: t.sendDate,
          sendTime: t.sendTime,
          scheduledFor: t.scheduledTimestamp,
          emailConfig,
        }));

      if (scheduledTasks.length > 0) {
        scheduledSaveResult = await saveScheduledEmails(scheduledTasks);
        console.log(`[Upload] Saved ${scheduledSaveResult.savedCount} scheduled tasks to database`);
      }
    }

    return NextResponse.json({
      success: true,
      job, // 返回完整的 job 数据给客户端
      taskCount: job.tasks.length,
      immediateCount,
      scheduledCount,
      maxDelayHours: maxDelay,
      hasCustomEmail: !!emailConfig,
      // 定时任务保存状态
      scheduledSaved: scheduledSaveResult.success,
      scheduledSavedCount: scheduledSaveResult.savedCount,
      scheduledSaveError: scheduledSaveResult.error || undefined,
      // 重复邮箱警告（超过3次的）
      duplicates: duplicates.length > 0 ? duplicates : undefined,
      inFileDuplicates: inFileDuplicates.length > 0 ? inFileDuplicates : undefined,
      // 所有邮箱的历史发送次数
      emailSendCounts: Object.keys(emailSendCounts).length > 0 ? emailSendCounts : undefined,
      message: scheduledCount > 0
        ? scheduledSaveResult.success
          ? `任务已创建：${immediateCount} 封可立即发送，${scheduledSaveResult.savedCount} 封已加入定时队列（系统将自动发送）`
          : `任务已创建：${immediateCount} 封可立即发送，${scheduledCount} 封定时发送（保存失败：${scheduledSaveResult.error}）`
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
