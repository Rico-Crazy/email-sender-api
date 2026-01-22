import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

export async function GET() {
  try {
    // 创建模板数据（新字段格式）
    const templateData = [
      {
        "Email": "example1@email.com",
        "Contact Name": "张三",
        "Audience Type": "企业客户",
        "Phase": "Phase 1",
        "Subject Line": "邮件标题示例1",
        "Send Date": "2025-01-25",
        "Send Time": "09:00",
        "Day": "Monday",
        "Email Body": "这是邮件正文内容示例1\n\n这是第二段内容。",
        "Sent Status": "",
      },
      {
        "Email": "example2@email.com",
        "Contact Name": "李四",
        "Audience Type": "个人用户",
        "Phase": "Phase 2",
        "Subject Line": "邮件标题示例2",
        "Send Date": "2025-01-26",
        "Send Time": "14:30",
        "Day": "Tuesday",
        "Email Body": "这是邮件正文内容示例2\n\n换行后的内容。",
        "Sent Status": "",
      },
      {
        "Email": "example3@email.com",
        "Contact Name": "王五",
        "Audience Type": "合作伙伴",
        "Phase": "Phase 1",
        "Subject Line": "邮件标题示例3",
        "Send Date": "2025-01-27",
        "Send Time": "10:00",
        "Day": "Wednesday",
        "Email Body": "这是邮件正文内容示例3",
        "Sent Status": "",
      },
    ];

    // 创建工作簿
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(templateData);

    // 设置列宽
    worksheet["!cols"] = [
      { wch: 25 }, // Email
      { wch: 15 }, // Contact Name
      { wch: 15 }, // Audience Type
      { wch: 10 }, // Phase
      { wch: 30 }, // Subject Line
      { wch: 12 }, // Send Date
      { wch: 10 }, // Send Time
      { wch: 12 }, // Day
      { wch: 50 }, // Email Body
      { wch: 12 }, // Sent Status
    ];

    XLSX.utils.book_append_sheet(workbook, worksheet, "邮件名单");

    // 生成 buffer
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    // 返回文件
    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="email-template.xlsx"',
      },
    });
  } catch (error) {
    console.error("Template generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate template" },
      { status: 500 }
    );
  }
}
