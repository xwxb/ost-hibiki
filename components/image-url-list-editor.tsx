"use client";

/**
 * 简易图片 URL 列表编辑器。
 *
 * 功能：每行一个 URL，自带缩略图预览 + 上下移动 + 删除；底部一行用于追加新条目。
 * 设计取舍：
 * - 不引入 dnd 库，用 ↑↓ 即可满足排序需求，零依赖。
 * - 失败的图片走 handleImgError 兜底，避免空白。
 */

import { useState } from "react";
import { handleImgError } from "@/lib/image-fallback";

type Props = {
  urls: string[];
  onChange: (next: string[]) => void;
  invalid?: boolean;
};

export function ImageUrlListEditor({ urls, onChange, invalid }: Props) {
  const [draft, setDraft] = useState("");

  function update(index: number, value: string) {
    const next = [...urls];
    next[index] = value;
    onChange(next);
  }

  function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= urls.length) return;
    const next = [...urls];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function remove(index: number) {
    onChange(urls.filter((_, i) => i !== index));
  }

  function addDraft() {
    const value = draft.trim();
    if (!value) return;
    onChange([...urls, value]);
    setDraft("");
  }

  function handleDraftKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      addDraft();
    }
  }

  return (
    <div className={`img-list-editor ${invalid ? "is-invalid" : ""}`}>
      {urls.length === 0 ? (
        <p className="img-list-empty">至少需要 1 张图片，用于卡片缩略图与详情背景。</p>
      ) : null}

      {urls.map((url, index) => (
        <div key={`${index}-${url}`} className="img-list-row">
          <img className="img-list-thumb" src={url || ""} alt={`preview-${index}`} onError={handleImgError} />
          <input
            value={url}
            onChange={(e) => update(index, e.target.value)}
            placeholder="https://..."
            spellCheck={false}
          />
          <div className="img-list-ops">
            <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label="上移">↑</button>
            <button type="button" onClick={() => move(index, 1)} disabled={index === urls.length - 1} aria-label="下移">↓</button>
            <button type="button" onClick={() => remove(index)} aria-label="删除">✕</button>
          </div>
        </div>
      ))}

      <div className="img-list-add">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleDraftKey}
          placeholder="粘贴图片 URL 后回车 / 点 + 添加"
          spellCheck={false}
        />
        <button type="button" onClick={addDraft} disabled={!draft.trim()}>
          + 添加
        </button>
      </div>
    </div>
  );
}
