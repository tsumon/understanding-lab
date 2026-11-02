import { useEffect, useRef, useState } from 'react';
import { App } from '../client/App';
import { OfflineStatus } from '../client/OfflineStatus';
import { useLocale } from '../client/LocaleProvider';
import { chapters } from './curriculum';
import type { CourseQuestion } from './types';
import { ExperimentLab, isExperimentComplete } from './experiments/ExperimentLab';
import { COURSE_STORAGE_KEY, completionRequirements, emptyChapter, emptyProgress, parseProgress, writeProgress, type ChapterProgress, type CourseProgress } from './progress';
import './course.css';

function download(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function initial(): { progress: CourseProgress; blocked: boolean; readError?: boolean; raw?: string | null } {
  let raw: string | null;
  try { raw = localStorage.getItem(COURSE_STORAGE_KEY); }
  catch { return { progress: emptyProgress(), blocked: true, readError: true }; }
  try { return { progress: parseProgress(raw), blocked: false, raw }; }
  catch { return { progress: emptyProgress(), blocked: true, raw }; }
}
export function CourseRoot() {
  const { locale, setLocale } = useLocale();
  const zh = locale === 'zh-CN';
  const t = (cn: string, en: string) => zh ? cn : en;
  const [route, setRoute] = useState(() => window.location.hash);
  const previousRoute = useRef(route);
  useEffect(() => { if (previousRoute.current !== route) { (document.querySelector<HTMLElement>("#course-main h2[tabindex]") ?? document.getElementById("course-main"))?.focus(); previousRoute.current = route; } }, [route]);
  const [state, setState] = useState(initial);
  const lastReadRaw = useRef(state.raw ?? null);
  const [saveError, setSaveError] = useState(false);
  const [reset, setReset] = useState(false);
  const [external, setExternal] = useState(false);
  useEffect(() => {
    const routeChanged = () => { setRoute(window.location.hash); setReset(false); };
    const storageChanged = (e: StorageEvent) => { if (e.key === COURSE_STORAGE_KEY || e.key === null) setExternal(true); };
    window.addEventListener('hashchange', routeChanged); window.addEventListener('storage', storageChanged);
    return () => { window.removeEventListener('hashchange', routeChanged); window.removeEventListener('storage', storageChanged); };
  }, []);
  const save = (progress: CourseProgress) => {
    if (state.blocked || external) return;
    setState({ progress, blocked: false });
    try {
      const result = writeProgress(localStorage, lastReadRaw.current, progress);
      if (result.status === 'conflict') { setExternal(true); return; }
      lastReadRaw.current = result.raw; setSaveError(false);
    }
    catch { setSaveError(true); }
  };
  const reload = () => { const next = initial(); lastReadRaw.current = next.raw ?? null; setState(next); setExternal(false); setSaveError(false); };
  const exportProgress = () => {
    try { download(state.blocked ? localStorage.getItem(COURSE_STORAGE_KEY) ?? '' : JSON.stringify(state.progress, null, 2), 'understanding-lab-course-progress.json'); }
    catch { setSaveError(true); }
  };
  const chapter = chapters.find(c => route === `#course/${c.id}`);
  const p = chapter ? state.progress.chapters[chapter.id] ?? emptyChapter() : emptyChapter();
  const update = (patch: Partial<ChapterProgress>) => {
    if (!chapter) return;
    save({ ...state.progress, lastChapter: chapter.id, chapters: { ...state.progress.chapters, [chapter.id]: { ...p, ...patch, completedAt: undefined, updatedAt: new Date().toISOString() } } });
  };
  const isCompleted = (id: string) => {
    const c = chapters.find(item => item.id === id); const record = state.progress.chapters[id];
    return !!(c && record?.completedAt && Object.values(completionRequirements(c, locale, record, isExperimentComplete(record.experiment))).every(Boolean));
  };
  const completed = chapters.filter(c => isCompleted(c.id)).length;
  if (route === '#legacy') return <><App /><nav className="course-return"><a href="#courses">← {t('返回 AI 课程', 'Back to AI course')}</a></nav></>;
  const requirements = chapter ? completionRequirements(chapter, locale, p, isExperimentComplete(p.experiment)) : undefined;
  const ready = requirements && Object.values(requirements).every(Boolean);
  const requirementsText: Record<string,string> = { prediction:t('记录预测','Record a prediction'), experiment:t('运行并比较两组实验','Run and compare two experiments'), transfer:t('完成迁移回答（至少 20 字符）','Transfer response (at least 20 characters)'), quiz:t('订正全部检测题','Correct all knowledge checks'), reflection:t('完成反思（至少 20 字符）','Reflection (at least 20 characters)') };
  const question = (q: CourseQuestion, value: string | undefined, onSelect: (v:string)=>void, prediction = false) => <fieldset className="course-question" key={q.id}>
    <legend>{q.question}</legend>{q.options.map(o => <label key={o.id}><input type="radio" name={`${chapter?.id}-${q.id}`} value={o.id} checked={value === o.id} onChange={() => onSelect(o.id)} disabled={state.blocked || external} /> <span>{o.text}</span></label>)}
    {value && <p className="course-feedback" role="status">{!prediction && (value === q.correctId ? t('✓ 正确。','✓ Correct. ') : t('再想一想：','Reconsider: '))}{q.options.find(o=>o.id===value)?.feedback}</p>}
  </fieldset>;
  return <div className="course-shell">
    <a className="skip-link" href="#course-main" onClick={e=>{e.preventDefault();document.getElementById("course-main")?.focus();}}>{t('跳到课程内容','Skip to course content')}</a>
    <header className="course-header"><div><a className="eyebrow" href="#courses">UNDERSTANDING LAB · {t('AI 学习工作台','AI LEARNING WORKBENCH')}</a><h1>{t('从直觉到证据，理解 AI','Understand AI, from intuition to evidence')}</h1><p>{t('12 章 · 先预测，再实验，最后解释。所有课程实验在本机运行，不调用 AI 服务。','12 chapters · Predict, experiment, then explain. Course experiments run locally without AI services.')}</p></div><label className="locale-control">{t('语言','Language')}<select aria-label="Language / 语言" value={locale} onChange={e=>setLocale(e.target.value as 'en'|'zh-CN')}><option value="zh-CN">简体中文</option><option value="en">English</option></select></label></header>
    <OfflineStatus />
    <div className="course-toolbar"><p>{t('学习记录','Course record')} <strong>{completed} / {chapters.length}</strong> · {t('仅保存在此浏览器','Stored only in this browser')}</p><div className="actions"><button className="secondary" onClick={exportProgress}>{t('导出课程记录','Export course record')}</button><button className="secondary" onClick={()=>setReset(true)}>{t('重置课程记录','Reset course record')}</button><a href="#legacy">{t('原版过拟合实验','Original overfitting lab')}</a></div></div>
    {(state.blocked || external || saveError) && <section className="card warning" role="alert"><h2>{t('学习记录需要处理','Course record needs attention')}</h2><p>{state.readError ? t('浏览器阻止了学习记录读取。为保护可能存在的记录，已暂停写入。请允许此站点访问浏览器存储后重新载入；当前无法读取或导出旧记录。','The browser blocked access to stored progress. Writes are paused to protect any existing record. Allow browser storage for this site, then reload; the old record cannot currently be read or exported.') : state.blocked ? t('记录格式损坏或版本较新。已停止写入，原始记录未改动。请先导出备份，再决定是否重置。','The record is damaged or from a newer version. Writing is blocked; original data is unchanged. Export a backup before deciding whether to reset.') : external ? t('另一标签页已更新课程记录。为避免覆盖，已暂停写入；请先导出当前记录，再重新载入。','Another tab changed the course record. Writes are paused to avoid overwriting it; export current work before reloading.') : t('未能保存到浏览器。当前回答仍在此页面，请导出备份，或重试保存。','Browser saving failed. Your answers remain on this page; export a backup or retry saving.')}</p><button className="secondary" onClick={exportProgress}>{t('导出备份','Export backup')}</button> {saveError && !state.blocked && !external ? <button onClick={()=>save(state.progress)}>{t('重试保存','Retry save')}</button> : <button onClick={reload}>{t('重新载入记录','Reload record')}</button>}</section>}
    {reset && <section className="card warning" role="alertdialog" aria-label={t('确认重置','Confirm reset')}><h2>{t('删除这套课程的本机学习记录？','Delete this course’s local record?')}</h2><p>{t('无法撤销。请先导出备份；原版过拟合草稿和账号数据不会被删除。','This cannot be undone. Export first; original overfitting drafts and account data are not deleted.')}</p><button className="secondary" onClick={()=>setReset(false)}>{t('取消','Cancel')}</button> <button onClick={()=>{try { localStorage.removeItem(COURSE_STORAGE_KEY);lastReadRaw.current=null;setState({progress:emptyProgress(),blocked:false});setSaveError(false);setExternal(false);setReset(false); } catch {setSaveError(true);} }}>{t('确认删除课程记录','Confirm delete course record')}</button></section>}
    <main id="course-main" tabIndex={-1}>
    {!chapter ? <><section className="course-intro card"><h2 tabIndex={-1}>{t('一条完整的学习路径','A complete learning path')}</h2><p>{t('从数据与模型出发，走向语言模型、检索、评测和负责任的部署。建议按顺序学习，也可以自由进入任意章节。完成记录代表你做过练习，不代表外部认证或自动判定掌握。','Move from data and models to language models, retrieval, evaluation and responsible deployment. Follow the sequence or explore any chapter. Completion records practice—not certification or automated proof of mastery.')}</p>{state.progress.lastChapter && chapters.some(c=>c.id===state.progress.lastChapter) && <a className="course-button" href={`#course/${state.progress.lastChapter}`}>{t('继续上次学习','Resume last chapter')}</a>}</section>{completed === chapters.length && <section className="card course-summary"><h2>{t('整套课程练习已完成','Course practice completed')}</h2><p>{t('你已完成全部章节的预测、实验对比、检测订正、迁移与反思。导出学习记录作为你的证据档案，并回到最后一章复核部署决策；这不是掌握程度认证。','You have recorded predictions, comparisons, corrected checks, transfer responses and reflections for every chapter. Export your evidence portfolio and revisit the final deployment decision; this is not a mastery certification.')}</p><button onClick={exportProgress}>{t('导出学习证据档案','Export evidence portfolio')}</button></section>}<ol className="course-catalog">{chapters.map(c=><li className="card" key={c.id}><div className="course-number">{String(c.order).padStart(2,'0')} <span>{c.minutes} {t('分钟','min')}</span></div><h2><a href={`#course/${c.id}`}>{c.content[locale].title}</a></h2><p>{c.content[locale].summary}</p><p className="hint">{c.prerequisites.length ? t('建议先学：','Suggested preparation: ')+c.prerequisites.map(id=>chapters.find(x=>x.id===id)?.content[locale].title ?? id).join(' / ') : t('从这里开始，无需基础','Start here; no prerequisites')}</p><a className="course-button" href={`#course/${c.id}`}>{isCompleted(c.id) ? t('已完成 · 复习','Completed · Review') : state.progress.chapters[c.id] ? t('继续学习','Continue') : t('开始学习','Start chapter')}</a></li>)}</ol></> : <>
    <nav className="course-breadcrumb"><a href="#courses">← {t('全部章节','All chapters')}</a><span>{chapter.order} / {chapters.length} · {chapter.minutes} {t('分钟','min')}</span></nav>
    <article key={chapter.id} className="course-player"><header className="card"><p className="eyebrow">{t('第','CHAPTER ')} {chapter.order} {t('章','')}</p><h2 className="course-title" tabIndex={-1}>{chapter.content[locale].title}</h2><p>{chapter.content[locale].summary}</p><ul>{chapter.content[locale].objectives.map(v=><li key={v}>{v}</li>)}</ul>{chapter.prerequisites.length>0 && <p className="hint">{t('建议先学（不限制进入）：','Suggested preparation (not required): ')}{chapter.prerequisites.map(id=><a key={id} href={`#course/${id}`}>{chapters.find(c=>c.id===id)?.content[locale].title} </a>)}</p>}</header>
    <section className="card"><h2>01 · {t('建立理解','Build understanding')}</h2>{chapter.content[locale].explanation.map(e=><section key={e.title}><h3>{e.title}</h3><p>{e.text}</p></section>)}<aside className="course-callout"><strong>{t('常见误解：','Common misconception: ')}</strong>{chapter.content[locale].misconception.claim}<p>{chapter.content[locale].misconception.correction}</p></aside></section>
    <section className="card"><h2>02 · {t('先做预测','Make a prediction')}</h2><p className="hint">{t('预测不计分；实验之后可以修正自己的想法。','Predictions are not graded; revise your thinking after experimenting.')}</p>{question(chapter.content[locale].prediction,p.prediction,v=>update({prediction:v}),true)}</section>
    <section className="card"><h2>03 · {t('实验与证据','Experiment and evidence')}</h2><p>{chapter.content[locale].experiment.prompt}</p><ol>{chapter.content[locale].experiment.steps.map(s=><li key={s}>{s}</li>)}</ol><fieldset className="course-lab-wrap" disabled={state.blocked||external}><legend className="sr-only">{t('交互实验','Interactive experiment')}</legend><ExperimentLab kind={chapter.experimentKind} locale={locale} value={p.experiment} onChange={experiment=>update({experiment})}/></fieldset><p>{chapter.content[locale].experiment.interpretation}</p><p className="course-callout"><strong>{t('边界：','Limit: ')}</strong>{chapter.content[locale].experiment.limitation}</p></section>
    <section className="card"><h2>04 · {t('迁移到新情境','Transfer to a new situation')}</h2><label htmlFor="course-transfer">{chapter.content[locale].transfer.prompt}</label><textarea id="course-transfer" rows={5} value={p.transfer} disabled={state.blocked||external} onChange={e=>update({transfer:e.target.value})} aria-describedby="transfer-hint"/><p id="transfer-hint" className="hint">{t('至少 20 字符。用以下标准自行检查；系统不自动判断论证质量。','At least 20 characters. Use this rubric to self-check; reasoning quality is not automatically graded.')}</p><ul>{chapter.content[locale].transfer.rubric.map(s=><li key={s}>{s}</li>)}</ul><details><summary>{t('查看参考思路（不是唯一答案）','Reference reasoning (not the only answer)')}</summary><p>{chapter.content[locale].transfer.sampleAnswer}</p></details></section>
    <section className="card"><h2>05 · {t('检测与订正','Check and revise')}</h2>{chapter.content[locale].quiz.map(q=>question(q,p.answers[q.id],v=>update({answers:{...p.answers,[q.id]:v}})))}</section>
    <section className="card"><h2>06 · {t('反思与学习记录','Reflect and record')}</h2><ul>{chapter.content[locale].reflection.map(s=><li key={s}>{s}</li>)}</ul><label htmlFor="course-reflection">{t('我的反思（至少 20 字符）','My reflection (at least 20 characters)')}</label><textarea id="course-reflection" rows={4} value={p.reflection} disabled={state.blocked||external} onChange={e=>update({reflection:e.target.value})}/><ul className="course-checklist">{Object.entries(requirements!).map(([key,value])=><li key={key}>{value ? '✓' : '○'} {requirementsText[key]}</li>)}</ul><button data-testid="complete-chapter" disabled={!ready||state.blocked||external||isCompleted(chapter.id)} onClick={()=>save({...state.progress,lastChapter:chapter.id,chapters:{...state.progress.chapters,[chapter.id]:{...p,completedAt:new Date().toISOString()}}})}>{isCompleted(chapter.id) ? t('本章已完成','Chapter completed') : t('记录本章完成','Record chapter completion')}</button><p className="hint">{t('完成意味着已记录练习证据并订正检测题，不等于已通过人工评审。修改回答后需重新确认完成。','Completion records practice evidence and corrected checks, not human-reviewed mastery. Editing an answer requires confirming completion again.')}</p>{isCompleted(chapter.id) && <div role="status" className="course-summary"><h3>{t('本章学习记录','Chapter learning record')}</h3><p>{t('你已留下预测、实验对比、迁移回答与反思。请用迁移评分标准检验自己的解释。','You recorded a prediction, experiment comparison, transfer response and reflection. Review your explanation against the rubric.')}</p>{chapter.order<chapters.length && <a className="course-button" href={`#course/${chapters[chapter.order].id}`}>{t('进入下一章','Next chapter')}</a>}</div>}</section>
    <section className="card"><h2>{t('术语与来源','Glossary and sources')}</h2><dl>{chapter.content[locale].glossary.map(g=><div key={g.term}><dt>{g.term}</dt><dd>{g.definition}</dd></div>)}</dl><ul>{chapter.content[locale].sources.map(s=><li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a> — {s.usedFor}</li>)}</ul><p className="hint">{t('正文和实验可离线使用；来源链接需要联网。','Lessons and experiments work offline; source links require a connection.')}</p></section>
    </article></>}
    </main><footer className="course-footer">{t('本机模拟 · 无 AI 自动评分 · 无付费调用 · 不上传学习记录','Local simulations · No AI grading · No paid calls · No uploaded course records')}</footer>
  </div>;
}
