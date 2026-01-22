import { NextRequest, NextResponse } from "next/server";
import { sendEmailBatch, EmailTask, EmailConfig } from "@/lib/gmail";

// 直接批量发送邮件
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { emails, emailConfig } = body;

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return NextResponse.json(
        { error: "emails array is required" },
        { status: 400 }
      );
    }

    // 验证每封邮件的格式
    const tasks: EmailTask[] = [];
    for (let i = 0; i < emails.length; i++) {
      const email = emails[i];
      if (!email.to || !email.subject || !email.content) {
        return NextResponse.json(
          { error: `Email ${i + 1} missing required fields (to, subject, content)` },
          { status: 400 }
        );
      }
      tasks.push({
        to: email.to,
        subject: String(email.subject),
        content: email.content,
      });
    }

    // 准备邮箱配置（可选）
    let config: EmailConfig | undefined;
    if (emailConfig?.user && emailConfig?.pass) {
      config = {
        user: emailConfig.user,
        pass: emailConfig.pass,
        senderName: emailConfig.senderName || undefined,
      };
    }

    console.log(`开始批量发送 ${tasks.length} 封邮件...`);

    const result = await sendEmailBatch(tasks, config);

    return NextResponse.json({
      success: result.failed === 0,
      total: result.total,
      sent: result.success,
      failed: result.failed,
      details: result.results,
    });
  } catch (error) {
    console.error("Batch send error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Batch send failed: ${message}` },
      { status: 500 }
    );
  }
}
