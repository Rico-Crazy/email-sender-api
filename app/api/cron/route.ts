import { NextRequest, NextResponse } from "next/server";
import { processDueEmails, cleanupOldTasks, getPendingStats } from "@/lib/scheduled-emails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // 最长执行 60 秒

// Vercel Cron 会定期调用此端点
// 也可以手动调用来触发发送
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  // 验证 cron 密钥（可选，增加安全性）
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // 如果配置了 CRON_SECRET，则验证
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    // 检查是否是 Vercel Cron 调用
    const isVercelCron = request.headers.get("x-vercel-cron") === "true";
    if (!isVercelCron) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
  }

  console.log("[Cron] Starting scheduled email processing...");

  try {
    // 处理到期的邮件
    const result = await processDueEmails();

    // 获取当前统计
    const stats = await getPendingStats();

    // 每天清理一次旧任务（在凌晨时段）
    const currentHour = new Date().getUTCHours();
    let cleanedCount = 0;
    if (currentHour === 0) {
      cleanedCount = await cleanupOldTasks();
      if (cleanedCount > 0) {
        console.log(`[Cron] Cleaned up ${cleanedCount} old tasks`);
      }
    }

    const duration = Date.now() - startTime;

    console.log(`[Cron] Completed in ${duration}ms:`, {
      processed: result.processed,
      success: result.success,
      failed: result.failed,
      pendingRemaining: stats.pending,
    });

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      duration: `${duration}ms`,
      result: {
        processed: result.processed,
        success: result.success,
        failed: result.failed,
        errors: result.errors.length > 0 ? result.errors : undefined,
      },
      stats: {
        pending: stats.pending,
        sent: stats.sent,
        failed: stats.failed,
        nextDue: stats.nextDue
          ? new Date(stats.nextDue).toISOString()
          : null,
      },
      cleanedUp: cleanedCount > 0 ? cleanedCount : undefined,
    });
  } catch (error) {
    console.error("[Cron] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
