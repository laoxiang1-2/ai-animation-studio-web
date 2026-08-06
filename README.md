# MOTION Web

AI Animation Studio 的网页创作工作台，包含完整生产流程和 API 连接中心。

## 启动

先在项目根目录启动后端：

```powershell
.venv\Scripts\Activate.ps1
uvicorn ai_animation_studio.main:app --reload
```

再启动网页端：

```powershell
cd web
npm install
npm run dev
```

网页默认连接 `http://127.0.0.1:8000`。也可以复制 `.env.example` 为 `.env.local` 并修改 `NEXT_PUBLIC_AI_STUDIO_API_URL`，或直接在网页的“API 中心”修改地址并测试连接。

## 在网页中配置 API

打开“API 中心”，选择供应商并点击“输入 API 并连接”，即可保存并立即启用 OpenAI、BFL、Stability、Runway 或 Kling。Wan2.2 可直接填写本地模型路径。

密钥不会写入浏览器缓存。网页把密钥提交给本机 Python 后端；Windows 使用当前用户的 DPAPI 加密后保存到 `data/integration-secrets.dat`，状态接口只返回“是否已配置”。为避免未授权修改，默认只有本机请求能更新密钥。
