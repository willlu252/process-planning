import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { COLOR_GROUPS } from "@/lib/constants/color-groups";

interface ColorGroupBadgeProps {
  code: string | null;
}

export function ColorGroupBadge({ code }: ColorGroupBadgeProps) {
  if (!code) return <span className="text-muted-foreground">—</span>;

  const group = COLOR_GROUPS[code];
  const colour = group?.color ?? "#9ca3af";
  const name = group?.name ?? code;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="inline-flex items-center gap-1.5">
          <div
            className="h-3.5 w-3.5 rounded border border-border"
            style={{ backgroundColor: colour }}
          />
          <span className="text-xs text-muted-foreground">{name}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent>{code}</TooltipContent>
    </Tooltip>
  );
}
