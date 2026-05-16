"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Braces,
  Check,
  Copy,
  Cpu,
  Eraser,
  KeyRound,
  LoaderCircle,
  MessageSquareText,
  PlugZap,
  Radio,
  Route,
  Send,
  ShieldCheck,
  Square,
  Terminal,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuthGuard } from "@/lib/use-auth-guard";
import { cn } from "@/lib/utils";

type ChatRole = "user" | "assistant";
type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  status?: "streaming" | "done" | "error";
};

const BASE_URL_STORAGE_KEY = "chatgpt2api:chat_base_url";
const MODEL_STORAGE_KEY = "chatgpt2api:chat_model";

const promptPresets = [
  "Reply exactly: OK",
  "用三句话介绍你现在能做什么。",
  "写一个 fetch 调用 /v1/chat/completions 的最小 JS 示例。",
  "把这句话润色得更像技术文档：这是 ChatGPT Web 中转，不是 Codex OAuth。",
];

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeBaseUrl(value: string) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function chatCompletionsEndpoint(baseUrl: string) {
  const normalized = normalizeBaseUrl(baseUrl);
  if (!normalized) {
    return "/v1/chat/completions";
  }
  return normalized.endsWith("/v1") ? `${normalized}/chat/completions` : `${normalized}/v1/chat/completions`;
}

function openAICompatibleBaseUrl(baseUrl: string) {
  const normalized = normalizeBaseUrl(baseUrl);
  if (!normalized) {
    return "/v1";
  }
  return normalized.endsWith("/v1") ? normalized : `${normalized}/v1`;
}

function extractDelta(payload: string) {
  if (!payload || payload === "[DONE]") {
    return "";
  }
  const parsed = JSON.parse(payload) as {
    choices?: Array<{
      delta?: { content?: string };
      message?: { content?: string };
    }>;
  };
  const choice = parsed.choices?.[0];
  return String(choice?.delta?.content ?? choice?.message?.content ?? "");
}

function parseSseBlock(block: string) {
  return block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n")
    .trim();
}

function maskKey(value: string) {
  const key = String(value || "").trim();
  if (key.length <= 10) {
    return key ? "********" : "<api-key>";
  }
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

async function copyText(value: string, label: string) {
  await navigator.clipboard.writeText(value);
  toast.success(`${label} 已复制`);
}

function buildCurlSnippet(baseUrl: string, apiKey: string, model: string) {
  return `curl ${openAICompatibleBaseUrl(baseUrl)}/chat/completions \\
  -H "Authorization: Bearer ${maskKey(apiKey)}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${model || "auto"}",
    "stream": true,
    "messages": [{"role": "user", "content": "Reply exactly: OK"}]
  }'`;
}

function buildOpenAISnippet(baseUrl: string, apiKey: string, model: string) {
  return `from openai import OpenAI

client = OpenAI(
    base_url="${openAICompatibleBaseUrl(baseUrl)}",
    api_key="${maskKey(apiKey)}",
)

stream = client.chat.completions.create(
    model="${model || "auto"}",
    messages=[{"role": "user", "content": "Reply exactly: OK"}],
    stream=True,
)

for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="")`;
}

function ConnectionTile({ icon: Icon, label, value }: { icon: typeof Route; label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-white/15 bg-white/[0.07] p-3 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-stone-400">
        <Icon className="size-3.5" />
        {label}
      </div>
      <div className="truncate font-mono text-xs text-stone-100" title={value}>
        {value}
      </div>
    </div>
  );
}

function MessageBubble({ message, onCopy }: { message: ChatMessage; onCopy: (value: string) => void }) {
  const isUser = message.role === "user";
  const isError = message.status === "error";
  return (
    <div className={cn("group flex gap-3", isUser ? "justify-end" : "justify-start")}>
      {!isUser ? (
        <div className="mt-1 flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#111827,#064e3b)] text-white shadow-[0_16px_35px_-18px_rgba(6,78,59,0.7)]">
          <Bot className="size-4" />
        </div>
      ) : null}
      <div className={cn("flex max-w-[86%] flex-col gap-1 sm:max-w-[74%]", isUser ? "items-end" : "items-start")}>
        <div
          className={cn(
            "relative whitespace-pre-wrap rounded-[28px] px-4 py-3 text-[14px] leading-7 shadow-sm ring-1 backdrop-blur",
            isUser
              ? "bg-stone-950 text-white ring-stone-950/20 shadow-[0_18px_45px_-26px_rgba(15,23,42,0.9)]"
              : isError
                ? "bg-rose-50/95 text-rose-700 ring-rose-200"
                : "bg-white/90 text-stone-800 ring-white/80 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.45)]",
          )}
        >
          {message.content || (message.status === "streaming" ? "正在等待上游返回..." : "")}
          {message.status === "streaming" ? (
            <span className="ml-1 inline-block h-4 w-1 animate-pulse rounded bg-emerald-400 align-middle" />
          ) : null}
        </div>
        <div className={cn("flex items-center gap-2 px-1 text-[11px] text-stone-400", isUser ? "flex-row-reverse" : "flex-row")}>
          <span>{isUser ? "YOU" : message.status === "streaming" ? "STREAMING" : isError ? "ERROR" : "ASSISTANT"}</span>
          {message.content ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 opacity-0 transition hover:text-stone-700 group-hover:opacity-100"
              onClick={() => onCopy(message.content)}
            >
              <Copy className="size-3" />
              复制
            </button>
          ) : null}
        </div>
      </div>
      {isUser ? (
        <div className="mt-1 flex size-10 shrink-0 items-center justify-center rounded-2xl bg-white text-stone-800 shadow-sm ring-1 ring-stone-200">
          <UserRound className="size-4" />
        </div>
      ) : null}
    </div>
  );
}

export default function ChatPage() {
  const { isCheckingAuth, session } = useAuthGuard();
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("auto");
  const [prompt, setPrompt] = useState("Reply exactly: OK");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [copied, setCopied] = useState<"curl" | "python" | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const hasFilledSessionKeyRef = useRef(false);

  const endpoint = useMemo(() => chatCompletionsEndpoint(baseUrl), [baseUrl]);
  const clientBaseUrl = useMemo(() => openAICompatibleBaseUrl(baseUrl), [baseUrl]);
  const curlSnippet = useMemo(() => buildCurlSnippet(baseUrl, apiKey, model), [apiKey, baseUrl, model]);
  const openaiSnippet = useMemo(() => buildOpenAISnippet(baseUrl, apiKey, model), [apiKey, baseUrl, model]);
  const canSend = Boolean(prompt.trim()) && Boolean(apiKey.trim()) && !isStreaming;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    setBaseUrl(window.localStorage.getItem(BASE_URL_STORAGE_KEY) || window.location.origin);
    setModel(window.localStorage.getItem(MODEL_STORAGE_KEY) || "auto");
  }, []);

  useEffect(() => {
    if (!session?.key || hasFilledSessionKeyRef.current) {
      return;
    }
    hasFilledSessionKeyRef.current = true;
    setApiKey(session.key);
  }, [session?.key]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (baseUrl.trim()) {
      window.localStorage.setItem(BASE_URL_STORAGE_KEY, baseUrl.trim());
    }
  }, [baseUrl]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(MODEL_STORAGE_KEY, model.trim() || "auto");
  }, [model]);

  useEffect(() => {
    viewportRef.current?.scrollTo({ top: viewportRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const stopStreaming = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  };

  const sendMessage = async () => {
    const text = prompt.trim();
    const key = apiKey.trim();
    if (!text) {
      toast.error("先输入一句话");
      return;
    }
    if (!key) {
      toast.error("API Key 不能为空");
      return;
    }

    const userMessage: ChatMessage = { id: createId(), role: "user", content: text, status: "done" };
    const assistantId = createId();
    const history = messages
      .filter((message) => message.content.trim() && message.status !== "error")
      .map((message) => ({ role: message.role, content: message.content }));
    const nextMessages = [...messages, userMessage, { id: assistantId, role: "assistant" as const, content: "", status: "streaming" as const }];
    const controller = new AbortController();

    abortRef.current = controller;
    setMessages(nextMessages);
    setPrompt("");
    setIsStreaming(true);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: model.trim() || "auto",
          stream: true,
          messages: [...history, { role: "user", content: text }],
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const errorText = await response.text().catch(() => "");
        throw new Error(errorText || `HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantText = "";
      let shouldStop = false;

      while (!shouldStop) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() || "";

        for (const block of blocks) {
          const payload = parseSseBlock(block);
          if (!payload) {
            continue;
          }
          if (payload === "[DONE]") {
            shouldStop = true;
            await reader.cancel().catch(() => undefined);
            break;
          }
          const delta = extractDelta(payload);
          if (!delta) {
            continue;
          }
          assistantText += delta;
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantId ? { ...message, content: assistantText, status: "streaming" } : message,
            ),
          );
        }
      }

      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? { ...message, content: assistantText || message.content || "上游返回为空", status: "done" }
            : message,
        ),
      );
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId ? { ...message, content: message.content || "已停止生成", status: "done" } : message,
          ),
        );
        return;
      }
      const message = error instanceof Error ? error.message : "请求失败";
      setMessages((current) =>
        current.map((item) => (item.id === assistantId ? { ...item, content: message, status: "error" } : item)),
      );
      toast.error(message);
    } finally {
      abortRef.current = null;
      setIsStreaming(false);
    }
  };

  const handleCopy = async (type: "curl" | "python", value: string) => {
    await copyText(value, type === "curl" ? "cURL 示例" : "Python 示例");
    setCopied(type);
    window.setTimeout(() => setCopied(null), 1200);
  };

  const copyMessage = (value: string) => {
    void copyText(value, "消息");
  };

  if (isCheckingAuth || !session) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-stone-400" />
      </div>
    );
  }

  return (
    <section className="relative isolate h-[calc(100vh-6rem)] min-h-0 shrink-0 overflow-hidden pb-0">
      <div className="pointer-events-none absolute -left-24 top-10 -z-10 size-72 rounded-full bg-emerald-300/30 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 top-40 -z-10 size-80 rounded-full bg-amber-200/45 blur-3xl" />
      <div className="pointer-events-none absolute inset-x-12 bottom-0 -z-10 h-48 rounded-full bg-stone-950/10 blur-3xl" />

      <div className="grid h-full min-h-0 items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[32px] border border-white/80 bg-white/55 shadow-[0_28px_90px_-60px_rgba(15,23,42,0.55)] backdrop-blur-xl">
          <div className="relative overflow-hidden border-b border-white/70 bg-[linear-gradient(135deg,rgba(9,9,11,0.96),rgba(28,25,23,0.94)_55%,rgba(6,78,59,0.9))] px-5 py-3 text-white sm:px-6">
            <div className="absolute right-8 top-5 size-20 rounded-full border border-white/10" />
            <div className="absolute -right-8 -top-16 size-40 rounded-full bg-emerald-300/20 blur-2xl" />
            <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-emerald-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
                  <Radio className={cn("size-3.5", isStreaming ? "animate-pulse text-emerald-300" : "text-stone-400")} />
                  {isStreaming ? "Live streaming" : "OpenAI-compatible relay"}
                </div>
                <h1 className="text-3xl font-black tracking-[-0.04em] text-white sm:text-[38px]">
                  AI 对话控制台
                </h1>
                <p className="mt-1 max-w-xl text-sm leading-6 text-stone-300">
                  用本地号池直接驱动 ChatGPT Web 对话。这里不是临时测试页，而是给你验证、演示、复制接入参数的一站式中转台。
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-3 lg:w-[440px]">
                <ConnectionTile icon={Route} label="Endpoint" value={endpoint} />
                <ConnectionTile icon={Cpu} label="Model" value={model || "auto"} />
                <ConnectionTile icon={ShieldCheck} label="Key" value={maskKey(apiKey)} />
              </div>
            </div>
          </div>

          <div className="flex min-h-0 flex-1">
            <div className="flex min-h-0 flex-1 flex-col p-3 sm:p-4">
              <div
                ref={viewportRef}
                className="hide-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto rounded-[28px] border border-white/80 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.96),rgba(250,250,249,0.84)_40%,rgba(231,229,228,0.72))] p-4 shadow-inner sm:p-5"
              >
                {messages.length === 0 ? (
                  <div className="flex h-full min-h-[220px] flex-col items-center justify-center text-center">
                    <div className="relative mb-6">
                      <div className="absolute inset-0 animate-ping rounded-[32px] bg-emerald-300/30" />
                      <div className="relative flex size-16 items-center justify-center rounded-[24px] bg-stone-950 text-white shadow-[0_30px_70px_-30px_rgba(15,23,42,0.8)]">
                        <MessageSquareText className="size-6" />
                      </div>
                    </div>
                    <h2 className="text-xl font-black tracking-tight text-stone-950">先打一枪，确认上游活着</h2>
                    <p className="mt-3 max-w-lg text-sm leading-7 text-stone-500">
                      默认测试语句会要求模型只返回 OK。能流式输出，就说明 Base URL、API Key、模型名和号池链路都通。
                    </p>
                    <div className="mt-6 flex flex-wrap justify-center gap-2">
                      {promptPresets.slice(0, 3).map((item) => (
                        <button
                          key={item}
                          type="button"
                          className="rounded-full border border-stone-200 bg-white/80 px-3 py-1.5 text-xs text-stone-600 shadow-sm transition hover:-translate-y-0.5 hover:border-stone-300 hover:bg-white hover:text-stone-950"
                          onClick={() => setPrompt(item)}
                        >
                          {item.length > 26 ? `${item.slice(0, 26)}...` : item}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  messages.map((message) => <MessageBubble key={message.id} message={message} onCopy={copyMessage} />)
                )}
              </div>

              <div className="mt-4 rounded-[30px] border border-white/80 bg-white/90 p-3 shadow-[0_22px_70px_-45px_rgba(15,23,42,0.6)] backdrop-blur">
                <div className="mb-2 flex flex-wrap gap-2 px-1">
                  {promptPresets.slice(0, 3).map((item) => (
                    <button
                      key={item}
                      type="button"
                      className="rounded-full bg-stone-100 px-2.5 py-1 text-xs text-stone-500 transition hover:bg-stone-950 hover:text-white disabled:opacity-50"
                      onClick={() => setPrompt(item)}
                      disabled={isStreaming}
                    >
                      {item.length > 22 ? `${item.slice(0, 22)}...` : item}
                    </button>
                  ))}
                </div>
                <Textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      if (canSend) {
                        void sendMessage();
                      }
                    }
                  }}
                  placeholder="输入消息；Enter 发送，Shift + Enter 换行"
                  className="min-h-14 resize-none border-0 bg-transparent px-3 py-1.5 text-[15px] leading-6 shadow-none focus-visible:ring-0"
                  disabled={isStreaming}
                />
                <div className="flex flex-col gap-2 border-t border-stone-100 pt-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-2 px-2 text-xs text-stone-400">
                    <PlugZap className="size-3.5 shrink-0" />
                    <span className="truncate">{endpoint}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="h-9 rounded-2xl bg-white/80 px-4"
                      onClick={() => setPrompt("")}
                      disabled={isStreaming || !prompt}
                    >
                      <Eraser className="size-4" />
                      清空输入
                    </Button>
                    {isStreaming ? (
                      <Button className="h-9 rounded-2xl bg-rose-600 px-5 text-white hover:bg-rose-700" onClick={stopStreaming}>
                        <Square className="size-4" />
                        停止
                      </Button>
                    ) : (
                      <Button className="h-9 rounded-2xl bg-stone-950 px-6 text-white shadow-[0_18px_35px_-22px_rgba(15,23,42,0.9)]" onClick={() => void sendMessage()} disabled={!canSend}>
                        <Send className="size-4" />
                        发送
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

        <aside className="hide-scrollbar h-full min-h-0 space-y-3 overflow-y-auto pr-1">
          <Card className="overflow-hidden border-white/80 bg-white/75 shadow-[0_26px_80px_-55px_rgba(15,23,42,0.45)] backdrop-blur">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <KeyRound className="size-5 text-emerald-700" />
                接入参数
              </CardTitle>
              <CardDescription>别人要用这个中转，就告诉他填这几项。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="space-y-2">
                <span className="text-[11px] font-black uppercase tracking-[0.18em] text-stone-400">Base URL / 项目地址</span>
                <Input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="http://127.0.0.1:3000" />
                <p className="text-xs leading-5 text-stone-500">
                  OpenAI 客户端里推荐填：<code className="rounded bg-stone-100 px-1 py-0.5">{clientBaseUrl}</code>
                </p>
              </label>

              <label className="space-y-2">
                <span className="text-[11px] font-black uppercase tracking-[0.18em] text-stone-400">API Key</span>
                <Input value={apiKey} onChange={(event) => setApiKey(event.target.value)} type="password" placeholder="chatgpt2api 或用户 Key" />
                <p className="text-xs leading-5 text-stone-500">默认使用当前登录 Key。对外分发建议在设置里单独建用户 Key。</p>
              </label>

              <label className="space-y-2">
                <span className="text-[11px] font-black uppercase tracking-[0.18em] text-stone-400">Model</span>
                <Input value={model} onChange={(event) => setModel(event.target.value)} placeholder="auto" />
                <p className="text-xs leading-5 text-stone-500">文本建议先用 <code className="rounded bg-stone-100 px-1 py-0.5">auto</code>。</p>
              </label>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-stone-950 bg-stone-950 text-white shadow-[0_30px_90px_-55px_rgba(15,23,42,0.9)]">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Braces className="size-5 text-emerald-300" />
                对外介绍
              </CardTitle>
              <CardDescription className="text-stone-300">别说 Codex。就说 ChatGPT Web relay。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-stone-200">
              <div className="rounded-2xl bg-white/8 p-4 ring-1 ring-white/10">
                <div className="mb-1 text-xs font-bold text-stone-400">接入字段</div>
                <p>
                  Base URL 填 <code>{clientBaseUrl}</code>，API Key 填本项目登录密钥或用户 Key，模型先填 <code>{model || "auto"}</code>。
                </p>
              </div>
              <div className="rounded-2xl bg-white/8 p-4 ring-1 ring-white/10">
                <div className="mb-1 text-xs font-bold text-stone-400">能力边界</div>
                <p>这是 ChatGPT Web 对话中转，不是 Codex OAuth。具体模型可用性以本页面流式返回为准。</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/80 bg-white/75 backdrop-blur">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Terminal className="size-5" />
                示例请求
              </CardTitle>
              <CardDescription>复制时会隐藏 API Key，发给别人时换成真实 key。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-[24px] bg-stone-950 p-4 text-xs leading-5 text-stone-100 shadow-inner">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-semibold text-stone-300">cURL</span>
                  <button className="inline-flex items-center gap-1 text-stone-400 transition hover:text-white" onClick={() => void handleCopy("curl", curlSnippet)}>
                    {copied === "curl" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                    复制
                  </button>
                </div>
                <pre className="hide-scrollbar max-h-56 overflow-auto whitespace-pre-wrap">{curlSnippet}</pre>
              </div>

              <div className="rounded-[24px] bg-stone-950 p-4 text-xs leading-5 text-stone-100 shadow-inner">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-semibold text-stone-300">Python OpenAI SDK</span>
                  <button className="inline-flex items-center gap-1 text-stone-400 transition hover:text-white" onClick={() => void handleCopy("python", openaiSnippet)}>
                    {copied === "python" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                    复制
                  </button>
                </div>
                <pre className="hide-scrollbar max-h-72 overflow-auto whitespace-pre-wrap">{openaiSnippet}</pre>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </section>
  );
}
