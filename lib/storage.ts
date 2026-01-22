import type { EmailConfig } from "./gmail";

// 客户端存储方案 - 不依赖服务器端持久化
// Job 数据在上传后返回给客户端，发送时再传回服务器

export interface StoredTask {
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

export interface StoredJob {
  id: string;
  tasks: StoredTask[];
  createdAt: number;
  status: "pending" | "processing" | "completed" | "failed";
  emailConfig?: EmailConfig;
  result?: {
    total: number;
    success: number;
    failed: number;
  };
}

export function generateJobId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export interface CreateJobInput {
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
}

export function createJobData(
  tasks: CreateJobInput[],
  emailConfig?: EmailConfig
): StoredJob {
  const now = Date.now();

  const storedTasks: StoredTask[] = tasks.map((task) => ({
    to: task.to,
    contactName: task.contactName,
    audienceType: task.audienceType,
    phase: task.phase,
    subject: task.subject,
    sendDate: task.sendDate,
    sendTime: task.sendTime,
    day: task.day,
    content: task.content,
    delayHours: task.delayHours,
    scheduledFor: now + task.delayHours * 60 * 60 * 1000,
    status: "pending" as const,
  }));

  return {
    id: generateJobId(),
    tasks: storedTasks,
    createdAt: now,
    status: "pending",
    emailConfig,
  };
}

export function getPendingTasksForJob(job: StoredJob): { task: StoredTask; index: number }[] {
  const now = Date.now();
  return job.tasks
    .map((task, index) => ({ task, index }))
    .filter(({ task }) => task.status === "pending" && task.scheduledFor <= now);
}

export function isJobCompleted(job: StoredJob): boolean {
  return job.tasks.every((task) => task.status !== "pending");
}

export function calculateJobResult(job: StoredJob): { total: number; success: number; failed: number } {
  return {
    total: job.tasks.length,
    success: job.tasks.filter((t) => t.status === "sent").length,
    failed: job.tasks.filter((t) => t.status === "failed").length,
  };
}
