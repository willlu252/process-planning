import { cn } from "@/lib/ui/cn";
import { Bot, User, Database } from "lucide-react";
import type { ChatMessage as ChatMessageType } from "@/hooks/use-ai-chat";

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isAssistant = message.role === "assistant";

  return (
    <div
      className={cn(
        "flex gap-3 px-4 py-3",
        isAssistant ? "bg-muted/50" : "bg-background",
      )}
    >
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          isAssistant
            ? "bg-primary/10 text-primary"
            : "bg-muted text-muted-foreground",
        )}
      >
        {isAssistant ? (
          <Bot className="h-4 w-4" />
        ) : (
          <User className="h-4 w-4" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">
          {isAssistant ? "AI Assistant" : "You"}
        </p>
        <div className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">
          {message.content}
        </div>
      </div>
    </div>
  );
}

interface StreamingMessageProps {
  content: string;
  toolStatus?: string | null;
}

export function StreamingMessage({ content, toolStatus }: StreamingMessageProps) {
  return (
    <div className="flex gap-3 bg-muted/50 px-4 py-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Bot className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">AI Assistant</p>
        {toolStatus && (
          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Database className="h-3 w-3 animate-pulse" />
            <span className="animate-pulse">{toolStatus}</span>
          </div>
        )}
        <div className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">
          {content || (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <span className="animate-pulse">Thinking</span>
              <span className="animate-bounce" style={{ animationDelay: "0ms" }}>.</span>
              <span className="animate-bounce" style={{ animationDelay: "150ms" }}>.</span>
              <span className="animate-bounce" style={{ animationDelay: "300ms" }}>.</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
