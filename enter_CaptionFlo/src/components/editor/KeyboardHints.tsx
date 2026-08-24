import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const shortcuts: Array<{ keys: string[]; desc: string }> = [
  { keys: ["Space"], desc: "播放 / 暂停" },
  { keys: ["←", "→"], desc: "后退 / 前进 5 秒" },
  { keys: ["Cmd", "Z"], desc: "撤销" },
  { keys: ["Cmd", "Shift", "Z"], desc: "重做" },
  { keys: ["C"], desc: "切换切割模式" },
  { keys: ["E"], desc: "切换编辑模式" },
  { keys: ["M"], desc: "合并所选字幕" },
  { keys: ["Delete"], desc: "删除所选字幕" },
  { keys: ["Esc"], desc: "取消选择 / 退出切割" },
];

export function KeyboardHints({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-float sm:max-w-md">
        <DialogHeader>
          <DialogTitle>快捷键</DialogTitle>
          <DialogDescription>
            在文本输入框聚焦时，全局快捷键会自动禁用，不影响输入与复制粘贴。
          </DialogDescription>
        </DialogHeader>
        <div className="divide-y divide-border/60">
          {shortcuts.map((s) => (
            <div key={s.desc} className="flex items-center justify-between py-2">
              <span className="text-sm text-foreground/80">{s.desc}</span>
              <div className="flex gap-1">
                {s.keys.map((k) => (
                  <kbd
                    key={k}
                    className="rounded-md border border-border bg-foreground/5 px-2 py-0.5 font-mono text-[11px] text-foreground/70"
                  >
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
