"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";

type Integration = {
  id: string;
  name: string;
  category: string;
  configured: boolean;
  active: boolean;
  required: string[];
  optional: string[];
};

type Configuration = {
  version: string;
  active: Record<string, string>;
  integrations: Integration[];
};

type PlanResponse = {
  id: string;
  plan: {
    title: string;
    logline: string;
    visual_style: string;
    estimated_duration_seconds: number;
    characters: Array<{ id: string; name: string; description: string }>;
    scenes: Array<{ id: string; name: string; atmosphere: string }>;
    shots: Array<{
      id: string;
      sequence: number;
      scene: string;
      duration_seconds: number;
      action: string;
      dialogue: Array<{ speaker: string; text: string }>;
      sound_effects: string[];
    }>;
  };
};

type Asset = {
  id: string;
  kind?: string;
  subject_name?: string;
  shot_id?: string;
  content_url: string;
  name?: string;
};

type RenderResult = {
  id: string;
  duration_seconds: number;
  content_url: string;
  subtitle_url: string | null;
  warnings: string[];
};

type ConnectionState = "idle" | "checking" | "connected" | "error";

type CredentialDraft = {
  apiKey: string;
  model: string;
  baseUrl: string;
  repoPath: string;
  checkpointPath: string;
  pythonPath: string;
};

const LOCAL_API_URL = "http://127.0.0.1:8000";
const DEFAULT_API_URL =
  process.env.NEXT_PUBLIC_AI_STUDIO_API_URL ||
  (process.env.NODE_ENV === "development" ? LOCAL_API_URL : "");

function isLoopbackUrl(value: string) {
  return /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/i.test(value.trim());
}

const fallbackIntegrations: Integration[] = [
  {
    id: "openai",
    name: "OpenAI",
    category: "剧本规划",
    configured: false,
    active: false,
    required: ["AI_STUDIO_PLAN_PROVIDER=openai", "AI_STUDIO_OPENAI_API_KEY"],
    optional: ["AI_STUDIO_OPENAI_MODEL"],
  },
  {
    id: "bfl",
    name: "FLUX / BFL",
    category: "图片生成",
    configured: false,
    active: false,
    required: ["AI_STUDIO_IMAGE_PROVIDER=bfl", "BFL_API_KEY"],
    optional: ["AI_STUDIO_BFL_MODEL"],
  },
  {
    id: "stability",
    name: "Stable Diffusion",
    category: "图片生成",
    configured: false,
    active: false,
    required: ["AI_STUDIO_IMAGE_PROVIDER=stability", "STABILITY_API_KEY"],
    optional: ["AI_STUDIO_STABILITY_MODEL"],
  },
  {
    id: "runway",
    name: "Runway",
    category: "视频生成",
    configured: false,
    active: false,
    required: ["AI_STUDIO_VIDEO_PROVIDER=runway", "RUNWAYML_API_SECRET"],
    optional: ["AI_STUDIO_RUNWAY_MODEL"],
  },
  {
    id: "kling",
    name: "Kling",
    category: "视频生成",
    configured: false,
    active: false,
    required: ["AI_STUDIO_VIDEO_PROVIDER=kling", "KLING_API_KEY"],
    optional: ["AI_STUDIO_KLING_MODEL", "AI_STUDIO_KLING_BASE_URL"],
  },
  {
    id: "wan",
    name: "Wan2.2 本地模型",
    category: "视频生成",
    configured: false,
    active: false,
    required: ["AI_STUDIO_VIDEO_PROVIDER=wan", "AI_STUDIO_WAN_REPO_PATH", "AI_STUDIO_WAN_CHECKPOINT_PATH"],
    optional: ["AI_STUDIO_WAN_PYTHON"],
  },
  {
    id: "ffmpeg",
    name: "FFmpeg",
    category: "自动剪辑",
    configured: false,
    active: true,
    required: ["imageio-ffmpeg（项目已包含）"],
    optional: ["AI_STUDIO_FFMPEG_PATH"],
  },
];

const endpointGroups = [
  ["POST", "/api/v1/production-plans", "剧本 → 生产计划"],
  ["POST", "/api/v1/production-plans/{id}/visual-library", "生成角色与场景图"],
  ["POST", "/api/v1/production-plans/{id}/shot-videos", "生成镜头视频"],
  ["POST", "/api/v1/production-plans/{id}/audio-assets", "上传 BGM 或音效"],
  ["POST", "/api/v1/production-plans/{id}/renders", "剪辑并输出成片"],
  ["GET", "/api/v1/renders/{id}/content", "下载 MP4"],
];

export default function Home() {
  const [view, setView] = useState<"studio" | "api">("studio");
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
  const [connection, setConnection] = useState<ConnectionState>("idle");
  const [adminToken, setAdminToken] = useState("");
  const [configuration, setConfiguration] = useState<Configuration | null>(null);
  const [script, setScript] = useState("未来北京，一个少年在沙暴来临前寻找被遗忘的 AI 遗迹。");
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [visuals, setVisuals] = useState<Asset[]>([]);
  const [videos, setVideos] = useState<Asset[]>([]);
  const [audio, setAudio] = useState<Asset[]>([]);
  const [render, setRender] = useState<RenderResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [bgmName, setBgmName] = useState("氛围配乐");
  const [sfxName, setSfxName] = useState("环境音效");
  const [sfxShot, setSfxShot] = useState("shot_001");
  const [editingIntegration, setEditingIntegration] = useState<string | null>(null);
  const [credentialDraft, setCredentialDraft] = useState<CredentialDraft>({
    apiKey: "",
    model: "",
    baseUrl: "",
    repoPath: "",
    checkpointPath: "",
    pythonPath: "",
  });

  const baseUrl = useMemo(() => apiUrl.trim().replace(/\/$/, ""), [apiUrl]);
  const integrations = configuration?.integrations ?? fallbackIntegrations;
  const readyCount = integrations.filter((item) => item.configured).length;

  useEffect(() => {
    const stored = window.localStorage.getItem("ai-studio-api-url");
    if (!stored) return;
    if (window.location.protocol === "https:" && isLoopbackUrl(stored)) {
      window.localStorage.removeItem("ai-studio-api-url");
      return;
    }
    window.setTimeout(() => setApiUrl(stored), 0);
  }, []);

  function assetUrl(path: string) {
    return `${baseUrl}${path}`;
  }

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    if (!baseUrl) {
      throw new Error("生产后端尚未配置，请先输入 HTTPS 后端地址。");
    }
    if (typeof window !== "undefined" && window.location.protocol === "https:" && baseUrl.startsWith("http://")) {
      throw new Error("生产网页只能连接 HTTPS 后端，不能使用 HTTP 或 127.0.0.1。");
    }
    const headers = new Headers(init?.headers);
    if (adminToken.trim()) {
      headers.set("X-AI-Studio-Admin-Token", adminToken.trim());
    }
    const response = await fetch(`${baseUrl}/api/v1${path}`, { ...init, headers });
    if (!response.ok) {
      let detail = `请求失败（${response.status}）`;
      try {
        const body = await response.json();
        detail = body.detail || detail;
      } catch {}
      throw new Error(detail);
    }
    return response.json() as Promise<T>;
  }

  async function runTask<T>(label: string, action: () => Promise<T>) {
    setBusy(label);
    setNotice(null);
    try {
      return await action();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "操作失败，请检查连接。");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function testConnection() {
    setConnection("checking");
    setNotice(null);
    try {
      await request<{ status: string }>("/health");
      const config = await request<Configuration>("/system/configuration");
      setConfiguration(config);
      setConnection("connected");
      window.localStorage.setItem("ai-studio-api-url", baseUrl);
    } catch (error) {
      setConnection("error");
      const message = error instanceof Error ? error.message : "无法连接后端。";
      setNotice(message === "Failed to fetch" ? "无法访问该后端，请确认公网 HTTPS 地址、CORS 和服务状态。" : message);
    }
  }

  async function createPlan() {
    const result = await runTask("正在理解剧本…", () =>
      request<PlanResponse>("/production-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script }),
      }),
    );
    if (result) {
      setPlan(result);
      setSfxShot(result.plan.shots[0]?.id ?? "shot_001");
      setVisuals([]);
      setVideos([]);
      setAudio([]);
      setRender(null);
    }
  }

  async function createVisuals() {
    if (!plan) return;
    const result = await runTask("正在生成角色与场景…", () =>
      request<{ assets: Asset[] }>(`/production-plans/${plan.id}/visual-library`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variants_per_subject: 1 }),
      }),
    );
    if (result) setVisuals(result.assets);
  }

  async function createVideos() {
    if (!plan) return;
    const result = await runTask("正在生成镜头视频…", () =>
      request<{ assets: Asset[] }>(`/production-plans/${plan.id}/shot-videos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clip_duration_seconds: 5 }),
      }),
    );
    if (result) setVideos(result.assets);
  }

  async function uploadAudio(
    kind: "bgm" | "sound_effect",
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    if (!file || !plan) return;
    const query = new URLSearchParams({
      kind,
      name: kind === "bgm" ? bgmName : sfxName,
    });
    if (kind === "sound_effect") query.set("shot_id", sfxShot);
    const result = await runTask("正在上传音频…", () =>
      request<Asset>(`/production-plans/${plan.id}/audio-assets?${query}`, {
        method: "POST",
        headers: { "Content-Type": file.type || "audio/mpeg" },
        body: file,
      }),
    );
    if (result) setAudio((items) => [...items, result]);
    event.target.value = "";
  }

  async function renderEpisode() {
    if (!plan) return;
    const result = await runTask("正在完成剪辑与混音…", () =>
      request<RenderResult>(`/production-plans/${plan.id}/renders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enable_bgm: true,
          enable_sound_effects: true,
          burn_subtitles: true,
          export_srt: true,
          output_fps: 24,
        }),
      }),
    );
    if (result) setRender(result);
  }

  function openIntegrationEditor(item: Integration) {
    const defaultModels: Record<string, string> = {
      openai: "gpt-5.6-terra",
      bfl: "flux-2-pro",
      stability: "sd3.5-large-turbo",
      runway: "gen4.5",
      kling: "kling-v3",
    };
    setCredentialDraft({
      apiKey: "",
      model: defaultModels[item.id] || "",
      baseUrl: item.id === "kling" ? "https://api-singapore.klingai.com" : "",
      repoPath: "",
      checkpointPath: "",
      pythonPath: "",
    });
    setEditingIntegration(item.id);
  }

  async function saveIntegration(integrationId: string) {
    const payload =
      integrationId === "wan"
        ? {
            repo_path: credentialDraft.repoPath,
            checkpoint_path: credentialDraft.checkpointPath,
            python_path: credentialDraft.pythonPath || undefined,
          }
        : {
            api_key: credentialDraft.apiKey,
            model: credentialDraft.model || undefined,
            base_url:
              integrationId === "kling" ? credentialDraft.baseUrl : undefined,
          };
    const result = await runTask("正在安全保存并启用 API…", () =>
      request<Configuration>(`/system/integrations/${integrationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    );
    if (result) {
      setConfiguration(result);
      setConnection("connected");
      setEditingIntegration(null);
      setCredentialDraft((draft) => ({ ...draft, apiKey: "" }));
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setView("studio")} aria-label="返回创作台">
          <span className="brand-mark">M</span>
          <span><strong>MOTION</strong><small>AI STUDIO</small></span>
        </button>

        <nav className="primary-nav" aria-label="主导航">
          <button className={view === "studio" ? "active" : ""} onClick={() => setView("studio")}>
            <span className="nav-icon">✦</span><span>创作工作台</span>
          </button>
          <button className={view === "api" ? "active" : ""} onClick={() => setView("api")}>
            <span className="nav-icon">⌁</span><span>API 中心</span>
          </button>
        </nav>

        <div className="sidebar-divider" />
        <p className="nav-label">生产流程</p>
        <ol className="phase-list">
          <li className={plan ? "done" : "current"}><span>01</span><div><b>剧本大脑</b><small>结构化计划</small></div></li>
          <li className={visuals.length ? "done" : plan ? "current" : ""}><span>02</span><div><b>视觉资产</b><small>角色与场景</small></div></li>
          <li className={videos.length ? "done" : visuals.length ? "current" : ""}><span>03</span><div><b>镜头视频</b><small>生成与拆段</small></div></li>
          <li className={render ? "done" : videos.length ? "current" : ""}><span>04</span><div><b>自动成片</b><small>字幕与混音</small></div></li>
        </ol>

        <div className={`connection-card ${connection}`}>
          <div><span className="status-dot" /><b>{connection === "connected" ? "后端已连接" : connection === "checking" ? "正在连接" : connection === "error" ? "连接失败" : "等待连接"}</b></div>
          <small>{baseUrl}</small>
          <button onClick={() => setView("api")}>管理连接 →</button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div><span className="eyebrow">AI ANIMATION PIPELINE</span></div>
          <div className="top-actions">
            <span className="version">BACKEND {configuration ? `v${configuration.version}` : "OFFLINE"}</span>
            <button className="connection-pill" onClick={testConnection}>
              <span className={`status-dot ${connection}`} />
              {connection === "connected" ? "连接正常" : "测试连接"}
            </button>
          </div>
        </header>

        {notice && <div className="notice"><span>!</span>{notice}<button onClick={() => setNotice(null)}>×</button></div>}
        {busy && <div className="busy-bar"><span />{busy}</div>}

        {view === "studio" ? (
          <div className="content studio-view">
            <section className="hero-copy">
              <span className="section-index">PRODUCTION / 001</span>
              <h1>把一个故事，<br /><em>变成完整短片。</em></h1>
              <p>从剧本理解到最终剪辑，一条可检查、可替换、可重复的动画生产线。</p>
            </section>

            <section className="panel script-panel">
              <div className="panel-heading">
                <div><span className="step-tag">01 · SCRIPT</span><h2>输入你的剧本</h2></div>
                <span className="character-count">{script.length} 字</span>
              </div>
              <textarea value={script} onChange={(event) => setScript(event.target.value)} aria-label="动画剧本" />
              <div className="panel-footer">
                <span>建议包含时代、地点、人物目标和冲突。</span>
                <button className="primary-button" disabled={!!busy || script.trim().length < 5} onClick={createPlan}>
                  <span>生成生产计划</span><b>↗</b>
                </button>
              </div>
            </section>

            {plan && (
              <section className="reveal-section">
                <div className="section-heading">
                  <div><span className="step-tag">PLAN READY</span><h2>{plan.plan.title}</h2></div>
                  <span className="plan-id">ID {plan.id.slice(0, 8)}</span>
                </div>
                <p className="logline">{plan.plan.logline}</p>
                <div className="metrics-grid">
                  <div><strong>{plan.plan.characters.length}</strong><span>主要角色</span></div>
                  <div><strong>{plan.plan.scenes.length}</strong><span>场景设定</span></div>
                  <div><strong>{plan.plan.shots.length}</strong><span>镜头数量</span></div>
                  <div><strong>{plan.plan.estimated_duration_seconds}<small>s</small></strong><span>预计时长</span></div>
                </div>
                <div className="character-row">
                  {plan.plan.characters.map((character) => <span key={character.id}>{character.name}</span>)}
                  <p>{plan.plan.visual_style}</p>
                </div>
              </section>
            )}

            {plan && (
              <section className="production-grid">
                <article className="panel production-card">
                  <div className="card-number">02</div>
                  <div><span className="step-tag">VISUAL LIBRARY</span><h3>角色与场景资产</h3><p>依据统一风格生成角色参考图与宽幅场景设定。</p></div>
                  {visuals.length > 0 && <div className="asset-strip">{visuals.slice(0, 4).map((asset) => <Image key={asset.id} width={62} height={45} unoptimized src={assetUrl(asset.content_url)} alt={asset.subject_name || "视觉资产"} />)}</div>}
                  <button className="secondary-button" disabled={!!busy} onClick={createVisuals}>{visuals.length ? "重新检查资产" : "生成视觉资产"}<span>→</span></button>
                </article>

                <article className="panel production-card">
                  <div className="card-number">03</div>
                  <div><span className="step-tag">SHOT VIDEOS</span><h3>镜头视频</h3><p>自动选取场景图，长镜头拆段后交给视频模型。</p></div>
                  {videos.length > 0 && <div className="video-ready"><span>▶</span><div><b>{videos.length} 个片段已就绪</b><small>可进入剪辑阶段</small></div></div>}
                  <button className="secondary-button" disabled={!!busy} onClick={createVideos}>{videos.length ? "重新检查视频" : "生成镜头视频"}<span>→</span></button>
                </article>
              </section>
            )}

            {videos.length > 0 && plan && (
              <section className="panel finishing-panel">
                <div className="panel-heading">
                  <div><span className="step-tag">04 · FINAL CUT</span><h2>声音与最终成片</h2></div>
                  <span className="ready-badge">READY TO EDIT</span>
                </div>
                <div className="audio-grid">
                  <label className="upload-card">
                    <span className="upload-icon">♫</span><div><b>背景音乐</b><small>MP3 · WAV · M4A · FLAC</small></div>
                    <input value={bgmName} onChange={(event) => setBgmName(event.target.value)} aria-label="BGM 名称" />
                    <span className="file-button">选择音频<input type="file" accept="audio/*" onChange={(event) => uploadAudio("bgm", event)} /></span>
                  </label>
                  <label className="upload-card">
                    <span className="upload-icon">⌁</span><div><b>镜头音效</b><small>按镜头起始时间自动定位</small></div>
                    <div className="inline-fields"><input value={sfxName} onChange={(event) => setSfxName(event.target.value)} aria-label="音效名称" /><select value={sfxShot} onChange={(event) => setSfxShot(event.target.value)} aria-label="所属镜头">{plan.plan.shots.map((shot) => <option key={shot.id} value={shot.id}>{shot.id}</option>)}</select></div>
                    <span className="file-button">选择音频<input type="file" accept="audio/*" onChange={(event) => uploadAudio("sound_effect", event)} /></span>
                  </label>
                </div>
                {audio.length > 0 && <div className="audio-list">{audio.map((item) => <span key={item.id}>✓ {item.name}</span>)}</div>}
                <div className="render-row">
                  <div><b>自动处理</b><span>裁剪 · 拼接 · 字幕 · 音效 · BGM · H.264</span></div>
                  <button className="primary-button large" disabled={!!busy} onClick={renderEpisode}>生成最终成片 <b>↗</b></button>
                </div>
              </section>
            )}

            {render && (
              <section className="result-section">
                <div className="result-copy"><span className="step-tag">DELIVERY READY</span><h2>成片已经完成。</h2><p>{render.duration_seconds} 秒 · 1280 × 720 · H.264 / AAC</p>{render.warnings.map((warning) => <small key={warning}>提示：{warning}</small>)}</div>
                <div className="video-frame"><video controls src={assetUrl(render.content_url)} /><div className="video-actions"><a href={assetUrl(render.content_url)} download>下载 MP4</a>{render.subtitle_url && <a href={assetUrl(render.subtitle_url)} download>下载字幕</a>}</div></div>
              </section>
            )}
          </div>
        ) : (
          <div className="content api-view">
            <section className="api-hero">
              <span className="section-index">CONNECTIONS / API</span>
              <h1>所有能力，<br /><em>一处连接。</em></h1>
              <p>网页端只连接你的 AI Animation Studio 后端。模型密钥提交后会在服务端加密保存，不会通过状态接口返回。</p>
            </section>

            <section className="connection-console">
              <div><span className={`large-status ${connection}`} /><div><b>{connection === "connected" ? "后端连接正常" : "连接你的生产后端"}</b><small>{connection === "connected" ? `${readyCount} 项能力已配置` : "公网环境需要 HTTPS 地址"}</small></div></div>
              <label><span>BACKEND URL</span><input value={apiUrl} onChange={(event) => setApiUrl(event.target.value)} placeholder="https://api.example.com" /></label>
              <label><span>ADMIN TOKEN</span><input type="password" autoComplete="off" value={adminToken} onChange={(event) => setAdminToken(event.target.value)} placeholder="生产管理员口令" /></label>
              <button className="primary-button" onClick={testConnection} disabled={connection === "checking"}>{connection === "checking" ? "连接中…" : "测试并保存"}<b>↗</b></button>
            </section>

            <div className="security-note"><span>KEY SAFETY</span><p>可以直接在下面输入 API Key。管理员口令和模型密钥都不会写入浏览器缓存；模型密钥仅提交给生产后端并加密保存。保存后无需重启即可启用。</p></div>

            <section className="integrations-section">
              <div className="section-heading"><div><span className="step-tag">PROVIDER APIS</span><h2>需要连接的能力</h2></div><span className="counter">{readyCount}/{integrations.length} READY</span></div>
              <div className="integration-grid">
                {integrations.map((item) => (
                  <article className={`integration-card ${editingIntegration === item.id ? "editing" : ""}`} key={item.id}>
                    <div className="integration-head"><span className={`provider-logo ${item.id}`}>{item.name.slice(0, 1)}</span><div><b>{item.name}</b><small>{item.category}</small></div><span className={`provider-state ${item.configured ? "ready" : "pending"}`}>{item.configured ? "已配置" : "待配置"}</span></div>
                    {item.id !== "ffmpeg" && editingIntegration !== item.id && <button className="configure-button" onClick={() => openIntegrationEditor(item)}>{item.configured ? "更新连接" : "输入 API 并连接"}<span>→</span></button>}
                    {editingIntegration === item.id && (
                      <div className="credential-editor">
                        {item.id === "wan" ? (
                          <>
                            <label><span>WAN 仓库路径</span><input value={credentialDraft.repoPath} onChange={(event) => setCredentialDraft((draft) => ({ ...draft, repoPath: event.target.value }))} placeholder="D:\models\Wan2.2" /></label>
                            <label><span>权重路径</span><input value={credentialDraft.checkpointPath} onChange={(event) => setCredentialDraft((draft) => ({ ...draft, checkpointPath: event.target.value }))} placeholder="D:\models\Wan2.2-TI2V-5B" /></label>
                            <label><span>Python 路径（可选）</span><input value={credentialDraft.pythonPath} onChange={(event) => setCredentialDraft((draft) => ({ ...draft, pythonPath: event.target.value }))} placeholder="D:\models\wan-env\Scripts\python.exe" /></label>
                          </>
                        ) : (
                          <>
                            <label><span>API KEY</span><input type="password" autoComplete="off" value={credentialDraft.apiKey} onChange={(event) => setCredentialDraft((draft) => ({ ...draft, apiKey: event.target.value }))} placeholder="粘贴 API Key" /></label>
                            <label><span>模型</span><input value={credentialDraft.model} onChange={(event) => setCredentialDraft((draft) => ({ ...draft, model: event.target.value }))} /></label>
                            {item.id === "kling" && <label><span>区域 API 地址</span><input value={credentialDraft.baseUrl} onChange={(event) => setCredentialDraft((draft) => ({ ...draft, baseUrl: event.target.value }))} /></label>}
                          </>
                        )}
                        <p>密钥将在第一次实际生成时由供应商验证。</p>
                        <div><button className="cancel-button" onClick={() => setEditingIntegration(null)}>取消</button><button className="save-key-button" disabled={!!busy || (item.id !== "wan" && credentialDraft.apiKey.length < 8)} onClick={() => saveIntegration(item.id)}>保存并启用</button></div>
                      </div>
                    )}
                    {editingIntegration !== item.id && <><div className="env-group"><span>后端对应配置</span>{item.required.map((value) => <code key={value}>{value}</code>)}</div><div className="env-group optional"><span>可选配置</span>{item.optional.map((value) => <code key={value}>{value}</code>)}</div></>}
                    {item.active && <div className="active-provider">● 当前正在使用</div>}
                  </article>
                ))}
              </div>
              <p className="midjourney-note"><b>关于 Midjourney</b>　当前没有适合普通应用直接接入的正式公共 API，本项目不使用 Discord 自动化或非官方中转服务。</p>
            </section>

            <section className="endpoints-section">
              <div className="section-heading"><div><span className="step-tag">BACKEND ENDPOINTS</span><h2>网页端调用的接口</h2></div><a href={`${baseUrl}/docs`} target="_blank" rel="noreferrer">打开接口文档 ↗</a></div>
              <div className="endpoint-table">
                {endpointGroups.map(([method, path, description]) => <div key={path}><span className={`method ${method.toLowerCase()}`}>{method}</span><code>{path}</code><p>{description}</p></div>)}
              </div>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}
