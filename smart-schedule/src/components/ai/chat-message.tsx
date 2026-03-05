import { cn } from "@/lib/ui/cn";
import { Bot, User, Database } from "lucide-react";
import Markdown from "react-markdown";
import type { ChatMessage as ChatMessageType } from "@/hooks/use-ai-chat";

const markdownClasses =
  "prose prose-sm prose-neutral dark:prose-invert max-w-none " +
  "prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 " +
  "prose-headings:mt-3 prose-headings:mb-1 prose-headings:text-sm " +
  "prose-code:text-xs prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded " +
  "prose-pre:bg-muted prose-pre:text-xs prose-pre:p-3 prose-pre:rounded-md " +
  "prose-strong:font-semibold";

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
          {isAssistant ? "Assistant" : "You"}
        </p>
        <div className="mt-1 text-sm leading-relaxed">
          {isAssistant ? (
            <Markdown className={markdownClasses}>{message.content}</Markdown>
          ) : (
            <div className="whitespace-pre-wrap">{message.content}</div>
          )}
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
        <p className="text-xs font-medium text-muted-foreground">Assistant</p>
        {toolStatus && (
          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Database className="h-3 w-3 animate-pulse" />
            <span className="animate-pulse">{toolStatus}</span>
          </div>
        )}
        <div className="mt-1 text-sm leading-relaxed">
          {content ? (
            <Markdown className={markdownClasses}>{content}</Markdown>
          ) : (
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
