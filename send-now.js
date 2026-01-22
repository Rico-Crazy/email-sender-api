const nodemailer = require("nodemailer");
const XLSX = require("xlsx");
require("dotenv").config({ path: ".env.local" });

async function main() {
  // 读取 Excel
  const workbook = XLSX.readFile("email-template.xlsx");
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet);

  console.log(`读取到 ${data.length} 条记录`);
  console.log(`使用账号: ${process.env.GMAIL_USER}`);

  // 尝试不同配置
  const configs = [
    {
      name: "Gmail Service",
      config: {
        service: "gmail",
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_APP_PASSWORD,
        },
      },
    },
    {
      name: "SMTP 587 STARTTLS",
      config: {
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        requireTLS: true,
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_APP_PASSWORD,
        },
        tls: {
          rejectUnauthorized: false,
        },
      },
    },
    {
      name: "SMTP 465 SSL",
      config: {
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_APP_PASSWORD,
        },
        tls: {
          rejectUnauthorized: false,
        },
      },
    },
  ];

  // 测试第一封邮件
  const firstRow = data[0];
  const email = firstRow["邮箱"] || firstRow["email"];
  const subject = firstRow["主题"] || firstRow["subject"];
  const content = firstRow["内容"] || firstRow["content"];

  for (const { name, config } of configs) {
    console.log(`\n尝试配置: ${name}`);
    try {
      const transporter = nodemailer.createTransport(config);

      // 验证连接
      console.log("  验证连接...");
      await transporter.verify();
      console.log("  ✓ 连接成功");

      // 发送测试邮件
      console.log(`  发送到 ${email}...`);
      await transporter.sendMail({
        from: process.env.GMAIL_USER,
        to: email,
        subject: subject,
        html: content,
      });
      console.log("  ✓ 发送成功!");

      // 成功后发送剩余邮件
      console.log("\n继续发送剩余邮件...");
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const e = row["邮箱"] || row["email"];
        const s = row["主题"] || row["subject"];
        const c = row["内容"] || row["content"];

        console.log(`发送到: ${e}...`);
        await transporter.sendMail({
          from: process.env.GMAIL_USER,
          to: e,
          subject: s,
          html: c,
        });
        console.log("  ✓ 成功");
        await new Promise((r) => setTimeout(r, 1000));
      }

      console.log(`\n全部完成! 共发送 ${data.length} 封邮件`);
      return;

    } catch (err) {
      console.log(`  ✗ 失败: ${err.message}`);
    }
  }

  console.log("\n所有配置都失败了，请检查:");
  console.log("1. 网络是否正常（是否使用VPN/代理）");
  console.log("2. Gmail 应用密码是否正确");
  console.log("3. Gmail 账号是否开启了两步验证");
}

main().catch(console.error);
