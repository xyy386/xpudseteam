import { getEditorIdentity } from "../editor-credentials";
import AiWorkspace from "./workspace";

export const dynamic = "force-dynamic";

export default async function EditorAiPage() {
  const identity = await getEditorIdentity();
  if (identity?.role !== "owner") return <main className="editor-auth-page"><section className="editor-auth-card">
    <h1>仅管理员可使用起草助手</h1><a href="/login">返回登录</a>
  </section></main>;
  return <main className="editor-auth-page"><section className="editor-auth-card editor-ai-card">
    <a href="/edit" className="editor-auth-home">← 返回编辑器</a>
    <h1>论文资料与新闻稿草稿</h1>
    <p>仅管理员可使用。上传 PDF/DOCX 可整理原文；DOI 和常见论文网页可读取公开元数据与摘要。配置 OpenAI API 密钥后，可按原文或摘要请求起草建议。仅有摘要时会明确标注，所有内容均需人工核对，保存后也不会自动发布。</p>
    <AiWorkspace />
  </section></main>;
}
