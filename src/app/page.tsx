import { MaterialsWorkspace } from "@/components/materials-workspace";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[var(--paper)] text-[var(--ink)]">
      <nav className="mx-auto flex w-full max-w-[1440px] items-center justify-between px-6 py-7 md:px-12 lg:px-20">
        <a className="text-[17px] font-semibold tracking-[-0.04em]" href="#top">CutMind<span className="text-[var(--accent)]">.</span></a>
        <span className="rounded-full border border-black/10 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-black/45">Local segmentation · Phase 2</span>
      </nav>
      <section id="top" className="mx-auto grid w-full max-w-[1440px] gap-16 px-6 pb-20 pt-16 md:px-12 md:pt-24 lg:grid-cols-[1.15fr_0.85fr] lg:items-end lg:px-20 lg:pb-28 lg:pt-32">
        <div>
          <p className="mb-7 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">AI Content Director</p>
          <h1 className="max-w-4xl text-[clamp(3.6rem,7.6vw,8rem)] font-medium leading-[0.88] tracking-[-0.075em]">把素材给我，<br />我告诉你<span className="font-serif italic text-[var(--accent)]">什么值得讲。</span></h1>
        </div>
        <div className="lg:pb-2">
          <p className="max-w-md text-lg leading-8 text-black/58">AI 帮你从大量视频中找到真正值得剪的那几秒，并把它们组织成值得观看的故事。</p>
          <p className="mt-7 border-l border-black/20 pl-4 text-sm leading-6 text-black/40">CutMind 理解的最小单位不是视频，<br />而是视频中的每一个 Segment。</p>
        </div>
      </section>
      <section className="border-y border-black/10 bg-[var(--surface)]">
        <div className="mx-auto grid w-full max-w-[1440px] lg:grid-cols-[0.32fr_0.68fr]">
          <div className="flex flex-col justify-between border-b border-black/10 px-6 py-10 md:px-12 lg:min-h-[480px] lg:border-b-0 lg:border-r lg:px-20 lg:py-14">
            <div><span className="text-xs font-medium text-black/35">01 / MATERIAL</span><h2 className="mt-5 max-w-xs text-3xl font-medium leading-tight tracking-[-0.045em]">从一堆素材，<br />到一个清晰的故事。</h2></div>
            <div className="mt-14 flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.14em] text-black/35"><span>Video</span><span>→</span><span>Segment</span><span>→</span><span>Story</span></div>
          </div>
          <div className="min-w-0 p-6 md:p-12 lg:p-14"><MaterialsWorkspace /></div>
        </div>
      </section>
      <footer className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-6 py-8 text-xs text-black/35 md:flex-row md:items-center md:justify-between md:px-12 lg:px-20"><span>© 2026 CutMind</span><span>Video → Segment → Story → Editing Plan</span></footer>
    </main>
  );
}
