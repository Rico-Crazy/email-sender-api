import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/gmail";
import type { StoredJob } from "@/lib/storage";
import { recordSentEmails } from "@/lib/email-history";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { job, sendAll, selectedEmails } = body as {
      job: StoredJob;
      sendAll?: boolean;
      selectedEmails?: string[];
    };

    if (!job || !job.tasks || job.tasks.length === 0) {
      return NextResponse.json(
        { error: "job data is required" },
        { status: 400 }
      );
    }

    // 选中的邮箱集合
    const selectedSet = selectedEmails ? new Set(selectedEmails) : null;

    // 检查是否还有待发送的邮件
    const pendingTasks = job.tasks
      .map((task, index) => ({ task, index }))
      .filter(({ task }) => {
        if (task.status !== "pending") return false;
        // 如果提供了 selectedEmails，只包含选中的邮箱
        if (selectedSet && !selectedSet.has(task.to)) return false;
        return true;
      });

    if (pendingTasks.length === 0) {
      return NextResponse.json(
        { error: selectedSet ? "请选择要发送的邮件" : "所有邮件已发送完成" },
        { status: 400 }
      );
    }

    // 发送邮件
    const results: Array<{ email: string; success: boolean; error?: string }> = [];
    let successCount = 0;
    let failedCount = 0;

    // 如果 sendAll 为 true，发送所有待发送的邮件；否则只发送到期的
    const tasksToSend = sendAll
      ? pendingTasks
      : pendingTasks.filter(({ task }) => task.scheduledFor <= Date.now());

    if (tasksToSend.length === 0) {
      return NextResponse.json({
        success: true,
        message: "没有到期的邮件需要发送",
        result: {
          total: 0,
          success: 0,
          failed: 0,
          details: [],
        },
        updatedJob: job,
      });
    }

    // 复制 job 以更新状态
    const updatedJob = JSON.parse(JSON.stringify(job)) as StoredJob;

    for (const { task, index } of tasksToSend) {
      const result = await sendEmail(
        { to: task.to, subject: task.subject, content: task.content },
        job.emailConfig
      );

      results.push({
        email: task.to,
        success: result.success,
        error: result.error,
      });

      if (result.success) {
        updatedJob.tasks[index].status = "sent";
        updatedJob.tasks[index].sentAt = Date.now();
        successCount++;
      } else {
        updatedJob.tasks[index].status = "failed";
        updatedJob.tasks[index].error = result.error;
        failedCount++;
      }

      // 发送间隔 2 秒
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    // 记录成功发送的邮箱到历史表
    const successfulEmails = results
      .filter((r) => r.success)
      .map((r) => {
        const task = tasksToSend.find(({ task }) => task.to === r.email)?.task;
        return { email: r.email, subject: task?.subject || "" };
      });

    if (successfulEmails.length > 0) {
      recordSentEmails(successfulEmails);
    }

    // 更新 job 状态
    const allDone = updatedJob.tasks.every((t) => t.status !== "pending");
    if (allDone) {
      updatedJob.status = failedCount > 0 ? "failed" : "completed";
      updatedJob.result = {
        total: updatedJob.tasks.length,
        success: updatedJob.tasks.filter((t) => t.status === "sent").length,
        failed: updatedJob.tasks.filter((t) => t.status === "failed").length,
      };
    }

    return NextResponse.json({
      success: true,
      result: {
        total: tasksToSend.length,
        success: successCount,
        failed: failedCount,
        details: results,
      },
      updatedJob, // 返回更新后的 job 给客户端
    });
  } catch (error) {
    console.error("Send error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Send failed: ${message}` },
      { status: 500 }
    );
  }
}
