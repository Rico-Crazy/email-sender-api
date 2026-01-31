import { NextRequest, NextResponse } from "next/server";
import { getPendingStats, getJobTasks } from "@/lib/scheduled-emails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 获取定时任务状态
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");

  try {
    if (jobId) {
      // 获取特定 job 的任务
      const tasks = await getJobTasks(jobId);
      return NextResponse.json({
        success: true,
        jobId,
        tasks: tasks.map(t => ({
          id: t.id,
          to: t.to_email,
          subject: t.subject,
          scheduledFor: t.scheduled_for,
          status: t.status,
          sentAt: t.sent_at,
          error: t.error,
        })),
      });
    }

    // 获取全局统计
    const stats = await getPendingStats();

    return NextResponse.json({
      success: true,
      stats: {
        total: stats.total,
        pending: stats.pending,
        sent: stats.sent,
        failed: stats.failed,
        nextDue: stats.nextDue,
        nextDueTime: stats.nextDue ? new Date(stats.nextDue).toISOString() : null,
      },
    });
  } catch (error) {
    console.error("Get scheduled status error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
