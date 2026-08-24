import { useRef, useState } from "react";
import { Bot, Send, X, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { subtitleService } from "@/services/subtitleService";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export function CopilotPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "你好，我是字幕 Copilot。可以帮你润色文案、建议样式或批量处理字幕。",
    },
  ]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const send = async () => {
    const prompt = input.trim();
    if (!prompt || streaming) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: prompt }, { role: "assistant", content: "" }]);
    setStreaming(true);
    try {
      await subtitleService.copilotStream(prompt, (chunk) => {
        setMessages((m) => {
          const next = [...m];
          next[next.length - 1] = {
            role: "assistant",
            content: next[next.length - 1].content + chunk,
          };
          return next;
        });
        requestAnimationFrame(() => {
          listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
        });
      });
    } finally {
      setStreaming(false);
    }
  };

  if (!open) return null;

  return (
    <aside className="glass-panel flex h-full w-80 shrink-0 flex-col rounded-xl">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">AI Copilot</h2>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <X />
        </Button>
      </div>

      <div ref={listRef} className="scrollbar-thin flex-1 space-y-3 overflow-y-auto p-3">
        {messages.map((m, i) => (
          <div
            key={i}
            className={cn("flex gap-2", m.role === "user" && "flex-row-reverse")}
          >
            <div
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                m.role === "user" ? "bg-primary text-primary-foreground" : "bg-foreground/10",
              )}
            >
              {m.role === "user" ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
            </div>
            <div
              className={cn(
                "max-w-[80%] rounded-xl px-3 py-2 text-[13px] leading-relaxed",
                m.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-foreground/5 text-foreground/90",
              )}
            >
              {m.content || (streaming && i === messages.length - 1 ? "…" : "")}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-border/60 p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder="向 Copilot 提问…"
            className="scrollbar-thin max-h-24 flex-1 resize-none rounded-lg border border-input bg-card px-3 py-2 text-[13px] outline-none focus:border-primary"
          />
          <Button size="icon-sm" onClick={send} disabled={streaming || !input.trim()}>
            <Send />
          </Button>
        </div>
      </div>
    </aside>
  );
}
