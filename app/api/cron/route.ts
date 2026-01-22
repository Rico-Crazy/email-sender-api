import { NextResponse } from "next/server";

// Cron 功能需要服务器端持久化存储
// 当前使用客户端存储方案，不支持定时任务
// 如需启用，请配置 Vercel KV 或其他持久化存储

export async function GET() {
  return NextResponse.json({
    success: false,
    message: "定时任务功能暂未启用。当前使用客户端存储方案，请手动发送邮件。如需启用定时任务，请配置 Vercel KV 存储。",
  });
}
