"use client";

import { useState, useMemo } from "react";

interface StoredTask {
  to: string;
  contactName: string;
  audienceType: string;
  phase: string;
  subject: string;
  sendDate: string;
  sendTime: string;
  day: string;
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
    provider?: string;
  };
  result?: {
    total: number;
    success: number;
    failed: number;
  };
}

interface EmailHistoryRecord {
  email: string;
  lastSentAt: number;
  sentCount: number;
  subjects: string[];
}

interface InFileDuplicate {
  email: string;
  count: number;
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
  duplicates?: EmailHistoryRecord[];
  inFileDuplicates?: InFileDuplicate[];
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

type EmailProvider = "gmail" | "feishu" | null;

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [sendResult, setSendResult] = useState<SendResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [currentJob, setCurrentJob] = useState<StoredJob | null>(null);

  // 邮件选择状态 (key 为邮箱地址，value 为是否选中)
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());

  // 选择使用哪个邮箱
  const [selectedProvider, setSelectedProvider] = useState<EmailProvider>(null);

  // Gmail 配置
  const [gmailUser, setGmailUser] = useState("");
  const [gmailPass, setGmailPass] = useState("");
  const [gmailSenderName, setGmailSenderName] = useState("");

  // 飞书配置
  const [feishuUser, setFeishuUser] = useState("");
  const [feishuPass, setFeishuPass] = useState("");
  const [feishuSenderName, setFeishuSenderName] = useState("");

  // 获取当前选中的邮箱配置
  const getEmailConfig = () => {
    if (selectedProvider === "gmail" && gmailUser && gmailPass) {
      return {
        user: gmailUser,
        pass: gmailPass,
        senderName: gmailSenderName,
        provider: "gmail" as const,
      };
    }
    if (selectedProvider === "feishu" && feishuUser && feishuPass) {
      return {
        user: feishuUser,
        pass: feishuPass,
        senderName: feishuSenderName,
        provider: "feishu" as const,
      };
    }
    return null;
  };

  // 重复邮箱集合（用于高亮显示）
  const duplicateEmailSet = useMemo(() => {
    const set = new Set<string>();
    if (uploadResult?.duplicates) {
      uploadResult.duplicates.forEach((d) => set.add(d.email.toLowerCase()));
    }
    if (uploadResult?.inFileDuplicates) {
      uploadResult.inFileDuplicates.forEach((d) => set.add(d.email.toLowerCase()));
    }
    return set;
  }, [uploadResult]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    const emailConfig = getEmailConfig();
    if (!emailConfig) {
      setUploadResult({
        success: false,
        error: "请先选择并配置发件邮箱（Gmail 或飞书）",
      });
      return;
    }

    setLoading(true);
    setUploadResult(null);
    setSendResult(null);
    setCurrentJob(null);
    setSelectedEmails(new Set());

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("emailUser", emailConfig.user);
      formData.append("emailPass", emailConfig.pass);
      formData.append("emailProvider", emailConfig.provider);
      if (emailConfig.senderName) {
        formData.append("senderName", emailConfig.senderName);
      }

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data: UploadResult = await res.json();
      setUploadResult(data);

      if (data.success && data.job) {
        setCurrentJob(data.job);
        // 默认选中所有非重复邮箱
        const duplicateSet = new Set<string>();
        if (data.duplicates) {
          data.duplicates.forEach((d) => duplicateSet.add(d.email.toLowerCase()));
        }
        const selected = new Set<string>();
        data.job.tasks.forEach((task) => {
          if (!duplicateSet.has(task.to.toLowerCase())) {
            selected.add(task.to);
          }
        });
        setSelectedEmails(selected);
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

  const handleSend = async () => {
    if (!currentJob) return;

    // 过滤只发送选中的邮件
    const selectedTasks = currentJob.tasks.filter(
      (task) => task.status === "pending" && selectedEmails.has(task.to)
    );

    if (selectedTasks.length === 0) {
      setSendResult({
        success: false,
        error: "请选择要发送的邮件",
      });
      return;
    }

    setSending(true);
    setSendResult(null);

    try {
      // 创建一个只包含选中任务的 job 副本
      const jobToSend = {
        ...currentJob,
        tasks: currentJob.tasks.map((task) => ({
          ...task,
          // 如果没有选中，将状态改为 skipped（通过设置 status 为 sent 但不记录 sentAt 来跳过）
          status: selectedEmails.has(task.to) ? task.status : task.status,
        })),
      };

      const res = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job: jobToSend,
          sendAll: true,
          selectedEmails: Array.from(selectedEmails),
        }),
      });

      const data: SendResult = await res.json();
      setSendResult(data);

      if (data.updatedJob) {
        setCurrentJob(data.updatedJob);
        // 清除已发送的邮件选中状态
        const newSelected = new Set(selectedEmails);
        data.updatedJob.tasks.forEach((task) => {
          if (task.status === "sent") {
            newSelected.delete(task.to);
          }
        });
        setSelectedEmails(newSelected);
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

  const toggleEmailSelection = (email: string) => {
    const newSelected = new Set(selectedEmails);
    if (newSelected.has(email)) {
      newSelected.delete(email);
    } else {
      newSelected.add(email);
    }
    setSelectedEmails(newSelected);
  };

  const selectAll = () => {
    if (!currentJob) return;
    const selected = new Set<string>();
    currentJob.tasks.forEach((task) => {
      if (task.status === "pending") {
        selected.add(task.to);
      }
    });
    setSelectedEmails(selected);
  };

  const deselectAll = () => {
    setSelectedEmails(new Set());
  };

  const selectNonDuplicates = () => {
    if (!currentJob) return;
    const selected = new Set<string>();
    currentJob.tasks.forEach((task) => {
      if (task.status === "pending" && !duplicateEmailSet.has(task.to.toLowerCase())) {
        selected.add(task.to);
      }
    });
    setSelectedEmails(selected);
  };

  const pendingTasks = currentJob?.tasks.filter((t) => t.status === "pending") || [];
  const sentCount = currentJob?.tasks.filter((t) => t.status === "sent").length || 0;
  const failedCount = currentJob?.tasks.filter((t) => t.status === "failed").length || 0;
  const selectedCount = pendingTasks.filter((t) => selectedEmails.has(t.to)).length;

  const isGmailConfigured = gmailUser && gmailPass;
  const isFeishuConfigured = feishuUser && feishuPass;

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString("zh-CN");
  };

  return (
    <main className="min-h-screen p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">邮件批量发送系统</h1>

      {/* 邮箱配置区域 */}
      <div className="mb-6 space-y-4">
        <h2 className="text-lg font-semibold">发件邮箱配置（二选一）</h2>

        {/* Gmail 配置 */}
        <div className={`p-4 rounded-lg border-2 transition-colors ${
          selectedProvider === "gmail" ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-gray-50"
        }`}>
          <div className="flex items-center justify-between mb-3">
            <label className="flex items-center cursor-pointer">
              <input
                type="radio"
                name="emailProvider"
                checked={selectedProvider === "gmail"}
                onChange={() => setSelectedProvider("gmail")}
                className="mr-2"
                disabled={!isGmailConfigured}
              />
              <span className="font-medium">Gmail</span>
              {isGmailConfigured && <span className="ml-2 text-xs text-green-600">✓ 已配置</span>}
            </label>
          </div>
          <div className="space-y-2">
            <input
              type="email"
              value={gmailUser}
              onChange={(e) => {
                setGmailUser(e.target.value);
                if (e.target.value && gmailPass) setSelectedProvider("gmail");
              }}
              placeholder="Gmail 邮箱地址"
              className="block w-full text-sm border rounded-lg p-2"
            />
            <input
              type="password"
              value={gmailPass}
              onChange={(e) => {
                setGmailPass(e.target.value);
                if (gmailUser && e.target.value) setSelectedProvider("gmail");
              }}
              placeholder="Google 应用专用密码"
              className="block w-full text-sm border rounded-lg p-2"
            />
            <input
              type="text"
              value={gmailSenderName}
              onChange={(e) => setGmailSenderName(e.target.value)}
              placeholder="发件人名称（可选）"
              className="block w-full text-sm border rounded-lg p-2"
            />
            <p className="text-xs text-gray-500">
              需要在 <a href="https://myaccount.google.com/apppasswords" target="_blank" className="text-blue-500 underline">Google 账户</a> 中生成应用专用密码
            </p>
          </div>
        </div>

        {/* 飞书配置 */}
        <div className={`p-4 rounded-lg border-2 transition-colors ${
          selectedProvider === "feishu" ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-gray-50"
        }`}>
          <div className="flex items-center justify-between mb-3">
            <label className="flex items-center cursor-pointer">
              <input
                type="radio"
                name="emailProvider"
                checked={selectedProvider === "feishu"}
                onChange={() => setSelectedProvider("feishu")}
                className="mr-2"
                disabled={!isFeishuConfigured}
              />
              <span className="font-medium">飞书邮箱</span>
              {isFeishuConfigured && <span className="ml-2 text-xs text-green-600">✓ 已配置</span>}
            </label>
          </div>
          <div className="space-y-2">
            <input
              type="email"
              value={feishuUser}
              onChange={(e) => {
                setFeishuUser(e.target.value);
                if (e.target.value && feishuPass) setSelectedProvider("feishu");
              }}
              placeholder="飞书邮箱地址"
              className="block w-full text-sm border rounded-lg p-2"
            />
            <input
              type="password"
              value={feishuPass}
              onChange={(e) => {
                setFeishuPass(e.target.value);
                if (feishuUser && e.target.value) setSelectedProvider("feishu");
              }}
              placeholder="第三方客户端登录密码"
              className="block w-full text-sm border rounded-lg p-2"
            />
            <input
              type="text"
              value={feishuSenderName}
              onChange={(e) => setFeishuSenderName(e.target.value)}
              placeholder="发件人名称（可选）"
              className="block w-full text-sm border rounded-lg p-2"
            />
            <p className="text-xs text-gray-500">
              使用飞书邮箱的第三方客户端登录密码（在飞书邮箱设置中获取）
            </p>
          </div>
        </div>

        {/* 当前选择提示 */}
        {selectedProvider && (
          <p className="text-sm text-green-600 font-medium">
            当前使用：{selectedProvider === "gmail" ? "Gmail" : "飞书邮箱"} ({selectedProvider === "gmail" ? gmailUser : feishuUser})
          </p>
        )}
      </div>

      {/* 上传表单 */}
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
            Excel 需包含列：Email, Contact Name, Audience Type, Phase, Subject Line, Send Date, Send Time, Day, Email Body, Sent Status | {" "}
            <a
              href="/api/template"
              className="text-blue-500 hover:text-blue-700 underline"
              download="email-template.xlsx"
            >
              下载模板
            </a>
          </p>
          <p className="text-xs text-gray-500 mt-1">
            已发送标记（Sent Status 列有值）的行会自动跳过
          </p>
        </div>

        <button
          type="submit"
          disabled={!file || loading || !selectedProvider}
          className="bg-blue-500 text-white px-4 py-2 rounded-lg disabled:opacity-50 hover:bg-blue-600"
        >
          {loading ? "上传中..." : "上传"}
        </button>
        {!selectedProvider && file && (
          <p className="text-sm text-orange-600">请先配置并选择发件邮箱</p>
        )}
      </form>

      {/* 重复邮箱警告 */}
      {uploadResult?.success && (uploadResult.duplicates?.length || uploadResult.inFileDuplicates?.length) && (
        <div className="p-4 rounded-lg mb-4 bg-yellow-100 border border-yellow-400">
          <h2 className="font-bold mb-2 text-yellow-800">⚠️ 重复邮箱警告</h2>

          {uploadResult.duplicates && uploadResult.duplicates.length > 0 && (
            <div className="mb-3">
              <p className="text-sm font-medium text-yellow-800 mb-1">
                以下邮箱在历史记录中已发送过（已自动取消选中）：
              </p>
              <ul className="text-sm space-y-1 max-h-40 overflow-y-auto">
                {uploadResult.duplicates.map((d, i) => (
                  <li key={i} className="text-yellow-700">
                    <strong>{d.email}</strong> - 已发送 {d.sentCount} 次，
                    最后发送: {formatDate(d.lastSentAt)}
                    {d.subjects.length > 0 && (
                      <span className="text-gray-600">
                        ，最近主题: {d.subjects[0]}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {uploadResult.inFileDuplicates && uploadResult.inFileDuplicates.length > 0 && (
            <div>
              <p className="text-sm font-medium text-yellow-800 mb-1">
                文件内存在重复邮箱：
              </p>
              <ul className="text-sm space-y-1">
                {uploadResult.inFileDuplicates.map((d, i) => (
                  <li key={i} className="text-yellow-700">
                    <strong>{d.email}</strong> - 在文件中出现 {d.count} 次
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {uploadResult && (
        <div className={`p-4 rounded-lg mb-4 ${uploadResult.success ? "bg-green-100" : "bg-red-100"}`}>
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
              <p className="text-green-700 mt-2">{uploadResult.message}</p>
            </>
          ) : (
            <p className="text-red-600">{uploadResult.error}</p>
          )}
        </div>
      )}

      {/* 邮件列表（带勾选框） */}
      {currentJob && pendingTasks.length > 0 && (
        <div className="p-4 rounded-lg mb-4 bg-white border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold">待发送邮件列表 ({pendingTasks.length} 封)</h2>
            <div className="space-x-2">
              <button
                onClick={selectAll}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                全选
              </button>
              <button
                onClick={deselectAll}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                取消全选
              </button>
              {duplicateEmailSet.size > 0 && (
                <button
                  onClick={selectNonDuplicates}
                  className="text-sm text-orange-600 hover:text-orange-800"
                >
                  仅选非重复
                </button>
              )}
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="p-2 text-left w-10">
                    <input
                      type="checkbox"
                      checked={selectedCount === pendingTasks.length && pendingTasks.length > 0}
                      onChange={(e) => {
                        if (e.target.checked) {
                          selectAll();
                        } else {
                          deselectAll();
                        }
                      }}
                    />
                  </th>
                  <th className="p-2 text-left">邮箱</th>
                  <th className="p-2 text-left">联系人</th>
                  <th className="p-2 text-left">主题</th>
                  <th className="p-2 text-left">状态</th>
                </tr>
              </thead>
              <tbody>
                {pendingTasks.map((task, index) => {
                  const isDuplicate = duplicateEmailSet.has(task.to.toLowerCase());
                  const isSelected = selectedEmails.has(task.to);
                  return (
                    <tr
                      key={index}
                      className={`border-t ${
                        isDuplicate
                          ? "bg-yellow-50"
                          : isSelected
                          ? "bg-blue-50"
                          : ""
                      }`}
                    >
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleEmailSelection(task.to)}
                        />
                      </td>
                      <td className="p-2">
                        <span className={isDuplicate ? "text-yellow-700 font-medium" : ""}>
                          {task.to}
                        </span>
                        {isDuplicate && (
                          <span className="ml-2 text-xs bg-yellow-200 text-yellow-800 px-1 rounded">
                            重复
                          </span>
                        )}
                      </td>
                      <td className="p-2">{task.contactName}</td>
                      <td className="p-2 truncate max-w-xs" title={task.subject}>
                        {task.subject}
                      </td>
                      <td className="p-2">
                        <span className="text-blue-600">待发送</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-gray-600">
              已选中 <strong>{selectedCount}</strong> / {pendingTasks.length} 封邮件
              {duplicateEmailSet.size > 0 && (
                <span className="text-yellow-600 ml-2">
                  （{pendingTasks.filter((t) => duplicateEmailSet.has(t.to.toLowerCase())).length} 封为重复邮箱）
                </span>
              )}
            </p>
            <button
              onClick={handleSend}
              disabled={sending || selectedCount === 0}
              className="bg-green-500 text-white px-6 py-2 rounded-lg disabled:opacity-50 hover:bg-green-600"
            >
              {sending ? "发送中..." : `发送选中的 ${selectedCount} 封邮件`}
            </button>
          </div>
        </div>
      )}

      {/* 任务状态 */}
      {currentJob && (sentCount > 0 || failedCount > 0) && (
        <div className="p-4 rounded-lg mb-4 bg-blue-50 border border-blue-200">
          <h2 className="font-bold mb-2">发送统计</h2>
          <p className="text-green-600">已发送: {sentCount} 封</p>
          {failedCount > 0 && <p className="text-red-600">发送失败: {failedCount} 封</p>}
          {pendingTasks.length > 0 && <p className="text-gray-600">待发送: {pendingTasks.length} 封</p>}
        </div>
      )}

      {sendResult && (
        <div className={`p-4 rounded-lg ${sendResult.success ? "bg-green-100" : "bg-red-100"}`}>
          <h2 className="font-bold mb-2">发送结果</h2>
          {sendResult.success && sendResult.result ? (
            <>
              <p>本次发送: {sendResult.result.total} 封</p>
              <p>成功: {sendResult.result.success}</p>
              <p>失败: {sendResult.result.failed}</p>
              {sendResult.result.details && sendResult.result.details.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-blue-600">查看详情</summary>
                  <ul className="mt-2 text-sm space-y-1">
                    {sendResult.result.details.map((d, i) => (
                      <li key={i} className={d.success ? "text-green-600" : "text-red-600"}>
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
        <h2 className="font-bold mb-2">支持的邮箱</h2>
        <ul className="text-sm space-y-1">
          <li><strong>Gmail</strong> - 需要 Google 应用专用密码</li>
          <li><strong>飞书邮箱</strong> - 使用第三方客户端登录密码</li>
        </ul>
      </div>
    </main>
  );
}
