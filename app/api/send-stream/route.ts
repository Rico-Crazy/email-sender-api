import { NextRequest } from "next/server";
import { sendEmail } from "@/lib/gmail";
import type { StoredJob, StoredTask } from "@/lib/storage";
import { recordSentEmails } from "@/lib/email-history";
import { validateEmail } from "@/lib/email-validator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { job, selectedEmails } = body as {
    job: StoredJob;
    selectedEmails?: string[];
  };

  if (!job || !job.tasks || job.tasks.length === 0) {
    return new Response(JSON.stringify({ error: "job data is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const selectedSet = selectedEmails ? new Set(selectedEmails) : null;

  const tasksToSend = job.tasks
    .map((task, index) => ({ task, index }))
    .filter(({ task }) => {
      if (task.status !== "pending") return false;
      if (selectedSet && !selectedSet.has(task.to)) return false;
      return true;
    });

  if (tasksToSend.length === 0) {
    return new Response(
      JSON.stringify({ error: "没有选中的邮件需要发送" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // 使用 ReadableStream 实现 SSE
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const updatedJob = JSON.parse(JSON.stringify(job)) as StoredJob;
      const results: Array<{
        email: string;
        contactName: string;
        subject: string;
        success: boolean;
        error?: string;
        sentAt?: number;
        skipped?: boolean;
        scheduledFor?: number; // 预计发送时间
        sendDate?: string;
        sendTime?: string;
      }> = [];

      let successCount = 0;
      let failedCount = 0;
      const total = tasksToSend.length;

      // 发送开始事件
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ type: "start", total })}\n\n`
        )
      );

      let skippedCount = 0;

      for (let i = 0; i < tasksToSend.length; i++) {
        const { task, index } = tasksToSend[i];

        // 发送进度事件 - 验证中
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "progress",
              current: i + 1,
              total,
              email: task.to,
              contactName: task.contactName,
              status: "validating",
            })}\n\n`
          )
        );

        // 验证邮箱是否有效
        const validation = await validateEmail(task.to);

        if (!validation.valid) {
          // 邮箱无效，跳过发送
          updatedJob.tasks[index].status = "failed";
          updatedJob.tasks[index].error = validation.reason || "邮箱无效";
          skippedCount++;

          results.push({
            email: task.to,
            contactName: task.contactName || "",
            subject: task.subject,
            success: false,
            error: `跳过: ${validation.reason}`,
            skipped: true,
            scheduledFor: task.scheduledFor,
            sendDate: task.sendDate,
            sendTime: task.sendTime,
          });

          // 发送跳过事件
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "result",
                current: i + 1,
                total,
                email: task.to,
                contactName: task.contactName,
                success: false,
                error: `跳过: ${validation.reason}`,
                skipped: true,
              })}\n\n`
            )
          );

          continue;
        }

        // 发送进度事件 - 发送中
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "progress",
              current: i + 1,
              total,
              email: task.to,
              contactName: task.contactName,
              status: "sending",
            })}\n\n`
          )
        );

        const result = await sendEmail(
          { to: task.to, subject: task.subject, content: task.content },
          job.emailConfig
        );

        const sentAt = Date.now();

        if (result.success) {
          updatedJob.tasks[index].status = "sent";
          updatedJob.tasks[index].sentAt = sentAt;
          successCount++;
        } else {
          updatedJob.tasks[index].status = "failed";
          updatedJob.tasks[index].error = result.error;
          failedCount++;
        }

        results.push({
          email: task.to,
          contactName: task.contactName || "",
          subject: task.subject,
          success: result.success,
          error: result.error,
          sentAt: result.success ? sentAt : undefined,
          scheduledFor: task.scheduledFor,
          sendDate: task.sendDate,
          sendTime: task.sendTime,
        });

        // 发送单个结果事件
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "result",
              current: i + 1,
              total,
              email: task.to,
              contactName: task.contactName,
              success: result.success,
              error: result.error,
            })}\n\n`
          )
        );

        // 发送间隔 2 秒
        if (i < tasksToSend.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }

      // 记录成功发送的邮箱到历史表
      const successfulEmails = results
        .filter((r) => r.success)
        .map((r) => ({ email: r.email, subject: r.subject }));

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

      // 发送完成事件
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            type: "complete",
            success: successCount,
            failed: failedCount,
            skipped: skippedCount,
            total,
            results,
            updatedJob,
          })}\n\n`
        )
      );

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
