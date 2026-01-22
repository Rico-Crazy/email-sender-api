import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

export async function GET() {
  try {
    // 创建模板数据（包含延迟时间列）
    const templateData = [
      {
        邮箱: "example1@email.com",
        主题: "邮件标题示例1",
        内容: "这是邮件正文内容示例1\n\n这是第二段内容。",
        "延迟(小时)": 0,
      },
      {
        邮箱: "example2@email.com",
        主题: "邮件标题示例2",
        内容: "这是邮件正文内容示例2\n\n换行后的内容。",
        "延迟(小时)": 2,
      },
      {
        邮箱: "example3@email.com",
        主题: "邮件标题示例3",
        内容: "这是邮件正文内容示例3",
        "延迟(小时)": 24,
      },
    ];

    // 创建工作簿
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(templateData);

    // 设置列宽
    worksheet["!cols"] = [
      { wch: 25 }, // 邮箱
      { wch: 30 }, // 主题
      { wch: 50 }, // 内容
      { wch: 12 }, // 延迟(小时)
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
