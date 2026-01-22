/**
 * 文本格式化工具
 * 将纯文本转换为格式化的 HTML
 */

/**
 * 将纯文本转换为 HTML 格式
 * - \r\n\r\n 或 \n\n → 段落分隔
 * - \r\n 或 \n → 换行
 */
export function textToHtml(text: string): string {
  if (!text) return "";

  // 统一换行符
  let normalized = text.replace(/\r\n/g, "\n");

  // 转义 HTML 特殊字符
  normalized = escapeHtml(normalized);

  // 分割段落（两个或更多换行符）
  const paragraphs = normalized.split(/\n\n+/);

  // 将每个段落包装在 <p> 标签中，段内换行转为 <br>
  const htmlParagraphs = paragraphs
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("\n");

  return htmlParagraphs;
}

/**
 * 转义 HTML 特殊字符
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (char) => map[char]);
}

/**
 * 生成完整的 HTML 邮件模板
 */
export function wrapInHtmlTemplate(content: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    ${content}
  </div>
</body>
</html>`;
}

/**
 * 将纯文本内容转换为完整的 HTML 邮件
 */
export function formatEmailContent(text: string): string {
  const htmlContent = textToHtml(text);
  return wrapInHtmlTemplate(htmlContent);
}

/**
 * 提取纯文本版本（用于 multipart/alternative）
 * 如果输入已经是 HTML，尝试提取文本；如果是纯文本则直接返回
 */
export function extractPlainText(content: string): string {
  // 简单判断是否是 HTML
  if (/<[^>]+>/.test(content)) {
    // 移除 HTML 标签
    return content
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .trim();
  }
  return content;
}
