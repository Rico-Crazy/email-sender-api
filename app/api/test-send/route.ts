import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/gmail";

// 直接发送测试邮件（不经过存储）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { to, subject, content } = body;

    if (!to || !subject || !content) {
      return NextResponse.json(
        { error: "Missing required fields: to, subject, content" },
        { status: 400 }
      );
    }

    console.log(`发送测试邮件到: ${to}`);

    const result = await sendEmail({ to, subject, content });

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: `邮件已发送到 ${to}`,
      });
    } else {
      return NextResponse.json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error("Test send error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Send failed: ${message}` },
      { status: 500 }
    );
  }
}
