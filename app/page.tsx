"use client";

import { useState } from "react";

interface StoredTask {
  to: string;
  subject: string;
  content: string;
  delayHours: number;
  scheduledFor: number;
  status: "pending" | "sent" | "failed";
  sentAt?: number;
  error?: string;
}

interface StoredJob {
  id: string;
  tasks: StoredTask[];
  createdAt: number;
  status: "pending" | "processing" | "completed" | "failed";
  emailConfig?: {
    user: string;
    pass: string;
    senderName?: string;
  };
  result?: {
    total: number;
    success: number;
    failed: number;
  };
}

interface UploadResult {
  success: boolean;
  job?: StoredJob;
  taskCount?: number;
  immediateCount?: number;
  scheduledCount?: number;
  maxDelayHours?: number;
  hasCustomEmail?: boolean;
  message?: string;
  error?: string;
}

interface SendResult {
  success: boolean;
  result?: {
    total: number;
    success: number;
    failed: number;
    details?: Array<{ email: string; success: boolean; error?: string }>;
  };
  updatedJob?: StoredJob;
  error?: string;
  message?: string;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [sendResult, setSendResult] = useState<SendResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [currentJob, setCurrentJob] = useState<StoredJob | null>(null);

  // 邮箱配置
  const [showEmailConfig, setShowEmailConfig] = useState(false);
  const [emailUser, setEmailUser] = useState("");
  const [emailPass, setEmailPass] = useState("");
  const [senderName, setSenderName] = useState("");

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setUploadResult(null);
    setSendResult(null);
    setCurrentJob(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      // 添加邮箱配置（如果有）
      if (emailUser && emailPass) {
        formData.append("emailUser", emailUser);
        formData.append("emailPass", emailPass);
        if (senderName) {
          formData.append("senderName", senderName);
        }
      }

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data: UploadResult = await res.json();
      setUploadResult(data);

      if (data.success && data.job) {
        setCurrentJob(data.job);
      }
    } catch (error) {
      setUploadResult({
        success: false,
        error: error instanceof Error ? error.message : "上传失败",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async (sendAll: boolean = true) => {
    if (!currentJob) return;

    setSending(true);
    setSendResult(null);

    try {
      const res = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job: currentJob, sendAll }),
      });

      const data: SendResult = await res.json();
      setSendResult(data);

      // 更新本地 job 状态
      if (data.updatedJob) {
        setCurrentJob(data.updatedJob);
      }
    } catch (error) {
      setSendResult({
        success: false,
        error: error instanceof Error ? error.message : "发送失败",
      });
    } finally {
      setSending(false);
    }
  };

  const pendingCount = currentJob?.tasks.filter(t => t.status === "pending").length || 0;
  const sentCount = currentJob?.tasks.filter(t => t.status === "sent").length || 0;
  const failedCount = currentJob?.tasks.filter(t => t.status === "failed").length || 0;

  return (
    <main className="min-h-screen p-8 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">邮件批量发送系统</h1>

      {/* 发件邮箱配置 */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg border">
        <button
          type="button"
          onClick={() => setShowEmailConfig(!showEmailConfig)}
          className="flex items-center justify-between w-full text-left"
        >
          <span className="font-medium">
            发件邮箱配置 {emailUser ? "(已配置)" : "(可选，留空使用默认)"}
          </span>
          <span className="text-gray-500">{showEmailConfig ? "收起" : "展开"}</span>
        </button>

        {showEmailConfig && (
          <div className="mt-4 space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">发件邮箱</label>
              <input
                type="email"
                value={emailUser}
                onChange={(e) => setEmailUser(e.target.value)}
                placeholder="your-email@gmail.com"
                className="block w-full text-sm border rounded-lg p-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">应用密码</label>
              <input
                type="password"
                value={emailPass}
                onChange={(e) => setEmailPass(e.target.value)}
                placeholder="Google 应用专用密码"
                className="block w-full text-sm border rounded-lg p-2"
              />
              <p className="text-xs text-gray-500 mt-1">
                需要在 Google 账户中生成应用专用密码
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">发件人名称 (可选)</label>
              <input
                type="text"
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                placeholder="例如：张三"
                className="block w-full text-sm border rounded-lg p-2"
              />
            </div>
            {emailUser && emailPass && (
              <p className="text-xs text-green-600">
                将使用自定义邮箱发送
              </p>
            )}
          </div>
        )}
      </div>

      <form onSubmit={handleUpload} className="mb-8 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">
            上传 Excel 文件
          </label>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="block w-full text-sm border rounded-lg p-2"
          />
          <p className="text-xs text-gray-500 mt-1">
            Excel 需包含列：邮箱、主题、内容、延迟(小时) | {" "}
            <a
              href="/api/template"
              className="text-blue-500 hover:text-blue-700 underline"
              download="email-template.xlsx"
            >
              下载模板
            </a>
          </p>
          <p className="text-xs text-gray-500 mt-1">
            延迟列：0 或空 = 立即发送，数字 = 延迟小时数（每封邮件可独立设置）
          </p>
        </div>

        <button
          type="submit"
          disabled={!file || loading}
          className="bg-blue-500 text-white px-4 py-2 rounded-lg disabled:opacity-50 hover:bg-blue-600"
        >
          {loading ? "上传中..." : "上传"}
        </button>
      </form>

      {uploadResult && (
        <div
          className={`p-4 rounded-lg mb-4 ${
            uploadResult.success ? "bg-green-100" : "bg-red-100"
          }`}
        >
          <h2 className="font-bold mb-2">上传结果</h2>
          {uploadResult.success ? (
            <>
              <p>任务 ID: {currentJob?.id}</p>
              <p>邮件数量: {uploadResult.taskCount}</p>
              {uploadResult.immediateCount !== undefined && (
                <p>立即发送: {uploadResult.immediateCount} 封</p>
              )}
              {uploadResult.scheduledCount !== undefined && uploadResult.scheduledCount > 0 && (
                <p>延迟发送: {uploadResult.scheduledCount} 封 (最长延迟 {uploadResult.maxDelayHours} 小时)</p>
              )}
              {uploadResult.hasCustomEmail && (
                <p className="text-blue-600">使用自定义邮箱发送</p>
              )}
              <p className="text-green-700 mt-2">{uploadResult.message}</p>

              {pendingCount > 0 && (
                <div className="mt-4 space-x-2">
                  <button
                    onClick={() => handleSend(true)}
                    disabled={sending}
                    className="bg-green-500 text-white px-4 py-2 rounded-lg disabled:opacity-50 hover:bg-green-600"
                  >
                    {sending ? "发送中..." : "发送全部"}
                  </button>
                  {uploadResult.scheduledCount !== undefined && uploadResult.scheduledCount > 0 && (
                    <button
                      onClick={() => handleSend(false)}
                      disabled={sending}
                      className="bg-orange-500 text-white px-4 py-2 rounded-lg disabled:opacity-50 hover:bg-orange-600"
                    >
                      {sending ? "发送中..." : "仅发送到期邮件"}
                    </button>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="text-red-600">{uploadResult.error}</p>
          )}
        </div>
      )}

      {/* 当前任务状态 */}
      {currentJob && (sentCount > 0 || failedCount > 0) && (
        <div className="p-4 rounded-lg mb-4 bg-blue-50 border border-blue-200">
          <h2 className="font-bold mb-2">任务状态</h2>
          <p>待发送: {pendingCount} 封</p>
          <p className="text-green-600">已发送: {sentCount} 封</p>
          {failedCount > 0 && <p className="text-red-600">发送失败: {failedCount} 封</p>}

          {pendingCount > 0 && (
            <button
              onClick={() => handleSend(true)}
              disabled={sending}
              className="mt-2 bg-green-500 text-white px-4 py-2 rounded-lg disabled:opacity-50 hover:bg-green-600"
            >
              {sending ? "发送中..." : `继续发送剩余 ${pendingCount} 封`}
            </button>
          )}
        </div>
      )}

      {sendResult && (
        <div
          className={`p-4 rounded-lg ${
            sendResult.success ? "bg-green-100" : "bg-red-100"
          }`}
        >
          <h2 className="font-bold mb-2">发送结果</h2>
          {sendResult.success && sendResult.result ? (
            <>
              <p>本次发送: {sendResult.result.total} 封</p>
              <p>成功: {sendResult.result.success}</p>
              <p>失败: {sendResult.result.failed}</p>
              {sendResult.message && <p className="text-gray-600">{sendResult.message}</p>}
              {sendResult.result.details && sendResult.result.details.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-blue-600">查看详情</summary>
                  <ul className="mt-2 text-sm space-y-1">
                    {sendResult.result.details.map((d, i) => (
                      <li
                        key={i}
                        className={d.success ? "text-green-600" : "text-red-600"}
                      >
                        {d.email}: {d.success ? "已发送" : d.error}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          ) : (
            <p className="text-red-600">{sendResult.error}</p>
          )}
        </div>
      )}

      <div className="mt-8 p-4 bg-gray-100 rounded-lg">
        <h2 className="font-bold mb-2">API 接口说明</h2>
        <ul className="text-sm space-y-1">
          <li>
            <code className="bg-gray-200 px-1">GET /api/template</code> - 下载 Excel 模板
          </li>
          <li>
            <code className="bg-gray-200 px-1">POST /api/upload</code> - 上传 Excel 文件（支持邮箱配置）
          </li>
          <li>
            <code className="bg-gray-200 px-1">POST /api/send</code> - 发送邮件（传入 job 数据）
          </li>
          <li>
            <code className="bg-gray-200 px-1">POST /api/batch-send</code> - 直接批量发送（支持邮箱配置）
          </li>
          <li>
            <code className="bg-gray-200 px-1">POST /api/test-send</code> - 发送测试邮件
          </li>
        </ul>
      </div>
    </main>
  );
}
