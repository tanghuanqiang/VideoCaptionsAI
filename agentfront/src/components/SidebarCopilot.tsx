import React, { useRef, useState, useEffect } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { useAuth } from "../context/AuthContext";
import "./SidebarCopilot.css";
import type { Subtitle, AssStyle } from "../types/subtitleTypes";
export interface Message {
  id: string;
  text: string;
  role: "user" | "assistant";
}

interface SidebarCopilotProps {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setSubtitles?: React.Dispatch<React.SetStateAction<Subtitle[]>>;
  setStyles?: React.Dispatch<React.SetStateAction<AssStyle[]>>;
  subtitles?: Subtitle[];
  styles?: AssStyle[];
  videoFile?: File | null;
}

// 局部 patch 函数：根据 id 更新字幕/样式
const patchById = <T extends {id: string}>(oldArr: T[], patchArr: T[]): T[] => {
  // Keep the original order of oldArr, replacing items when an id matches.
  // Any items in patchArr that don't exist in oldArr will be appended
  // at the end in the order they appear in patchArr.
  const patchMap = new Map<string, T>(patchArr.map(item => [item.id, item] as [string, T]));
  const used = new Set<string>();
  const result: T[] = [];

  for (const item of oldArr) {
    if (patchMap.has(item.id)) {
      result.push(patchMap.get(item.id)!);
      used.add(item.id);
    } else {
      result.push(item);
    }
  }

  for (const p of patchArr) {
    if (!used.has(p.id)) result.push(p);
  }

  return result;
};

// Helper: marked typings may expose a Promise<string> in some type versions.
// Coerce safely to a string at runtime to satisfy TS and sanitization.
const safeParseInline = (src: string): string => {
  try {
    const parsed = (marked.parseInline as unknown as (s: string) => string)(src);
    return typeof parsed === "string" ? parsed : String(parsed);
  } catch (e) {
    console.warn("marked.parseInline failed:", e);
    return "";
  }
};

// Try to parse JSON; if that fails, attempt to coerce Python-like repr
// (single quotes, True/False/None) into valid JSON and parse again.
const parseMaybeJson = (src: string): unknown | null => {
  const s = src.trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    console.debug('parseMaybeJson initial JSON.parse failed, trying fallback');
    // fallback: replace single quotes with double quotes and python literals
    let alt = s.replace(/\bTrue\b/g, 'true').replace(/\bFalse\b/g, 'false').replace(/\bNone\b/g, 'null');
    // naive single-quote -> double-quote replacement
    alt = alt.replace(/'/g, '"');
    // remove trailing commas before ] or }
    alt = alt.replace(/,\s*(?=[}\]])/g, '');
    try {
      return JSON.parse(alt);
    } catch (err2) {
      console.warn('parseMaybeJson failed for content, returning null', err2, src);
      return null;
    }
  }
};

const SidebarCopilot: React.FC<SidebarCopilotProps> = ({ messages, setMessages, setSubtitles, setStyles, subtitles, styles, videoFile }) => {
  const { token, logout } = useAuth();
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // keep a ref to latest messages so SSE timeout callback can read the assembled text
  const messagesRef = useRef<Message[]>(messages);
  // inactivity timer for SSE streaming debounce: clear sending only after no messages for this interval
  const inactivityTimerRef = useRef<number | null>(null);
  const INACTIVITY_MS = 900;

  // SSE订阅
  // 挂载时，监听 SSE 并逐字追加消息
  // subtitle/style 区块由消息内联展示，用户确认后直接使用 setSubtitles/setStyles
  // Track hidden previews by block content signature so Cancel persists
  const [hiddenSubtitleSigs, setHiddenSubtitleSigs] = useState<string[]>([]);
  const [hiddenStyleSigs, setHiddenStyleSigs] = useState<string[]>([]);
  // editable content for codeblocks, keyed by `${msg.id}-${type}-${blockIdx}`
  const [editingContent, setEditingContent] = useState<Record<string, string>>({});

  // Type guard: check array of objects each with an 'id' string
  const isArrayOfIdObjects = (v: unknown): v is {id: string}[] => {
    return Array.isArray(v) && v.every(item => {
      if (typeof item !== 'object' || item === null) return false;
      const tmp = item as unknown as { id?: unknown };
      return typeof tmp.id === 'string';
    });
  };

  useEffect(() => {
    if (!token) return;
    const baseUrl = import.meta.env.VITE_BACKEND_URL || '/api';
    // Ensure baseUrl doesn't end with slash if we are appending path starting with slash, 
    // or handle it. The paths below start with /copilot...
    const url = `${baseUrl.replace(/\/$/, '')}/copilot/sse?token=${token}`;
    
    const es = new EventSource(url);
    es.onerror = (err) => {
        console.error("SSE Error:", err);
        // Optional: check if 401 and logout
        // es.close();
    };
    es.onmessage = (e) => {
      const data = e.data ?? "";
      // clear previous timer and set a new one to mark sending finished after inactivity
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
      inactivityTimerRef.current = window.setTimeout(() => {
        // when inactivity indicates stream finished, log assembled assistant message
        const msgs = messagesRef.current || [];
        const last = msgs.length > 0 ? msgs[msgs.length - 1] : null;
        if (last && last.role === 'assistant') {
          console.log('SSE message complete:', last.text);
        } else {
          console.log('SSE stream ended (no assistant message assembled)');
        }
        setIsSending(false);
        inactivityTimerRef.current = null;
      }, INACTIVITY_MS);

      setMessages((prev) => {
        const lastMsg = prev.length > 0 ? prev[prev.length - 1] : null;
        const newText = lastMsg && lastMsg.role === "assistant" ? lastMsg.text + data : data;

        // 尝试快速检测是否包含 subtitle/style 区块（只是用于触发预览显示，详细解析在渲染时完成）
        const subtitleMatch = /```subtitle\s*([\s\S]*?)```/g.exec(newText);
        if (subtitleMatch) {
          try {
            JSON.parse(subtitleMatch[1]);
            // presence detected, no-op here (render-time will parse)
          } catch (err) {
            console.warn("failed to JSON.parse subtitle preview:", err);
          }
        }
        const styleMatch = /```style\s*([\s\S]*?)```/g.exec(newText);
        if (styleMatch) {
          try {
            JSON.parse(styleMatch[1]);
          } catch (err) {
            console.warn("failed to JSON.parse style preview:", err);
          }
        }

        if (lastMsg && lastMsg.role === "assistant") {
          return [
            ...prev.slice(0, -1),
            { ...lastMsg, text: newText }
          ];
        } else {
          return [
            ...prev,
            { id: Date.now() + Math.random() + "", text: e.data, role: "assistant" }
          ];
        }
      });
    };
    return () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
      es.close();
    };
  }, [setMessages]);

  // keep messagesRef updated for the timeout callback
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // 滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 发送消息（支持多文件上传）
  const handleSend = async () => {
    if (!input.trim()) return;
    setMessages((prev) => [
      ...prev,
      { id: Date.now() + Math.random() + "", text: input, role: "user" },
    ]);
    setInput("");
    setIsSending(true);
    // 使用 FormData 发送文本和文件
    const formData = new FormData();
    formData.append("text", input);
    // include subtitles/styles as JSON strings if available (from props)
    if (subtitles && subtitles.length > 0) {
      formData.append("subtitles_json", JSON.stringify(subtitles));
    }
    if (styles && styles.length > 0) {
      formData.append("styles_json", JSON.stringify(styles));
    }
    // attach video file prop if provided
    if (videoFile) {
      formData.append("video", videoFile);
    }
    files.forEach(file => {
      formData.append("files", file);
    });
    try {
      const baseUrl = import.meta.env.VITE_BACKEND_URL || '/api';
      const url = `${baseUrl.replace(/\/$/, '')}/copilot/send`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
            'Authorization': `Bearer ${token}`
        },
        body: formData,
        // 不需要设置 Content-Type，fetch 会自动处理
      });
      if (res.status === 401) {
          logout();
      }
    } catch (err) {
      console.warn('send failed', err);
      setIsSending(false);
    }
  };

  // 添加文件
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  return (
    <div className="sidebar-copilot">
      <div className="sidebar-header" style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <span>Copilot</span>
        <button
          style={{marginLeft:'auto',background:'#23272e',color:'#fff',border:'none',borderRadius:4,padding:'4px 12px',cursor:'pointer'}}
          onClick={() => setMessages([])}
          title="新建对话"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{verticalAlign:'middle',marginRight:4}}>
            <rect x="8" y="3" width="2" height="12" rx="1" fill="#b3e5fc"/>
            <rect x="3" y="8" width="12" height="2" rx="1" fill="#b3e5fc"/>
          </svg>
          New Chat
        </button>
      </div>
      <div className="sidebar-files">
        <input type="file" multiple onChange={handleFileChange} />
        {files.map((file) => (
          <div key={file.name} className="sidebar-file">{file.name}</div>
        ))}
      </div>
      <div className="sidebar-messages">
        {messages.map((msg) => {
          // 区块识别与分离渲染：支持多区块和普通文本混合
          const text = msg.text;
          const blockRegex = /```(subtitle|style)\s*([\s\S]*?)```/g;
          let lastIndex = 0;
          const elements = [];
          let match;
          let blockIdx = 0;
          while ((match = blockRegex.exec(text)) !== null) {
            const [full, type, content] = match;
            const before = text.slice(lastIndex, match.index);
            if (before.trim()) {
              elements.push(
                <div key={msg.id + '-before-' + blockIdx} className={`sidebar-msg ${msg.role}`}
                  dangerouslySetInnerHTML={{__html: DOMPurify.sanitize(safeParseInline(before))}} />
              );
            }
            if (type === 'subtitle') {
              const sig = content.trim();
              if (!hiddenSubtitleSigs.includes(sig)) {
                let subs: unknown = parseMaybeJson(content);
                const raw = content.trim();
                if (!subs) {
                  // fallback: show raw content so user can inspect
                  subs = raw;
                }
                const key = `${msg.id}-subtitle-${blockIdx}`;
                const init = typeof subs === 'string' ? subs : JSON.stringify(subs, null, 2);
                const edited = editingContent[key] ?? init;
                elements.push(
                  <div key={key} className={`sidebar-msg ${msg.role}`} style={{background:'#e3f2fd',borderRadius:8,padding:12,margin:'12px 0', color:'#222'}}>
                    <div style={{fontWeight:'bold',marginBottom:8, color:'#1565c0'}}>字幕修改预览（可编辑）</div>
                    <textarea value={edited} onChange={(e) => setEditingContent(prev => ({...prev, [key]: e.target.value}))}
                      style={{width:'100%',minHeight:140,whiteSpace:'pre-wrap',wordBreak:'break-all',padding:8,borderRadius:4,border:'1px solid #e0e0e0',fontFamily:'monospace',fontSize:'0.95em'}} />
                    <div style={{display:'flex',gap:8,marginTop:8}}>
                      <button style={{background:'#1976d2',color:'#fff',border:'none',borderRadius:4,padding:'4px 16px',cursor:'pointer', fontWeight:'bold'}}
                        onClick={() => {
                          if (setSubtitles) {
                            const candidate = parseMaybeJson(edited);
                            if (isArrayOfIdObjects(candidate)) {
                              setSubtitles((prev: Subtitle[]) => patchById(prev, candidate as Subtitle[]));
                              // update hidden sig to avoid re-showing raw
                              setHiddenSubtitleSigs(prev => prev.includes(sig) ? prev : [...prev, sig]);
                            } else {
                              console.warn('edited subtitle content is not a valid array of items with id:', candidate);
                            }
                          }
                        }}>确认(Keep)</button>
                      <button style={{background:'#f5f5f5',color:'#333',border:'none',borderRadius:4,padding:'4px 16px',cursor:'pointer'} }
                        onClick={() => { setHiddenSubtitleSigs(prev => prev.includes(sig) ? prev : [...prev, sig]); }}>取消(Cancel)</button>
                    </div>
                  </div>
                );
              }
            } else if (type === 'style') {
              const sig = content.trim();
              if (!hiddenStyleSigs.includes(sig)) {
                let styles: unknown = parseMaybeJson(content);
                const raw = content.trim();
                if (!styles) styles = raw;
                const key = `${msg.id}-style-${blockIdx}`;
                const initStyle = typeof styles === 'string' ? styles : JSON.stringify(styles, null, 2);
                const editedStyle = editingContent[key] ?? initStyle;
                elements.push(
                  <div key={key} className={`sidebar-msg ${msg.role}`} style={{background:'#fce4ec',borderRadius:8,padding:12,margin:'12px 0', color:'#222'}}>
                    <div style={{fontWeight:'bold',marginBottom:8, color:'#ad1457'}}>样式修改预览（可编辑）</div>
                    <textarea value={editedStyle} onChange={(e) => setEditingContent(prev => ({...prev, [key]: e.target.value}))}
                      style={{width:'100%',minHeight:140,whiteSpace:'pre-wrap',wordBreak:'break-all',padding:8,borderRadius:4,border:'1px solid #f5f5f5',fontFamily:'monospace',fontSize:'0.95em'}} />
                    <div style={{display:'flex',gap:8,marginTop:8}}>
                      <button style={{background:'#d81b60',color:'#fff',border:'none',borderRadius:4,padding:'4px 16px',cursor:'pointer', fontWeight:'bold'}}
                        onClick={() => {
                          if (setStyles) {
                            const candidate = parseMaybeJson(editedStyle);
                            if (isArrayOfIdObjects(candidate)) {
                              setStyles((prev: AssStyle[]) => patchById(prev, candidate as AssStyle[]));
                              setHiddenStyleSigs(prev => prev.includes(sig) ? prev : [...prev, sig]);
                            } else {
                              console.warn('edited style content is not a valid array of items with id:', candidate);
                            }
                          }
                        }}>确认(Keep)</button>
                      <button style={{background:'#f5f5f5',color:'#333',border:'none',borderRadius:4,padding:'4px 16px',cursor:'pointer'} }
                        onClick={() => { setHiddenStyleSigs(prev => prev.includes(sig) ? prev : [...prev, sig]); }}>取消(Cancel)</button>
                    </div>
                  </div>
                );
              }
            }
            lastIndex = match.index + full.length;
            blockIdx++;
          }
          // 渲染最后一个区块后的普通文本
          const after = text.slice(lastIndex);
          if (after.trim()) {
            elements.push(
              <div key={msg.id + '-after'} className={`sidebar-msg ${msg.role}`}
                dangerouslySetInnerHTML={{__html: DOMPurify.sanitize(safeParseInline(after))}} />
            );
          }
          // 如果没有区块，直接渲染整条消息
          if (elements.length === 0) {
            return (
              <div key={msg.id} className={`sidebar-msg ${msg.role}`}
                dangerouslySetInnerHTML={{__html: DOMPurify.sanitize(safeParseInline(msg.text))}} />
            );
          }
          return elements;
        })}
        <div ref={messagesEndRef} />
      </div>
      <div className="sidebar-input">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="输入消息…"
          onKeyDown={e => e.key === "Enter" && handleSend()}
          disabled={isSending}
          style={isSending ? {opacity:0.6} : undefined}
        />
        <button onClick={handleSend} disabled={isSending} style={isSending ? {opacity:0.6,cursor:'not-allowed'} : undefined}>
          {isSending ? '发送中...' : '发送'}
        </button>
      </div>
    </div>
  );
};

export default SidebarCopilot;
