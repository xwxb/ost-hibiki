/**
 * 图片加载失败时使用的占位资源。
 * 内联 SVG（base64 编码）：好处是无需额外网络请求 / 静态文件，且体积可控。
 * 外观：深色背景 + 中央灰色 IMG 图标。
 */
const FALLBACK_SVG = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 180'>
  <rect width='320' height='180' fill='#1a1d24'/>
  <g fill='none' stroke='#454a55' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'>
    <rect x='118' y='62' width='84' height='56' rx='6'/>
    <circle cx='138' cy='84' r='6'/>
    <path d='M124 116 L150 92 L172 110 L196 88 L196 116 Z'/>
  </g>
  <text x='160' y='150' fill='#5a606e' font-family='sans-serif' font-size='12' text-anchor='middle' letter-spacing='2'>IMG MISSING</text>
</svg>`;

export const FALLBACK_IMAGE_DATA_URL = `data:image/svg+xml;base64,${typeof btoa === "function" ? btoa(FALLBACK_SVG) : Buffer.from(FALLBACK_SVG).toString("base64")}`;

/**
 * <img onError={handleImgError}> 直接挂上即可。
 * 用 dataset 标记，避免 fallback 自身再次 error 触发死循环。
 */
export function handleImgError(event: React.SyntheticEvent<HTMLImageElement>) {
  const el = event.currentTarget;
  if (el.dataset.fallback === "1") return;
  el.dataset.fallback = "1";
  el.src = FALLBACK_IMAGE_DATA_URL;
}
