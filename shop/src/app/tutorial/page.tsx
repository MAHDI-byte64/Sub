import Link from "next/link";
import { apps, tutorialSteps } from "@/lib/content";
import { fmt } from "@/lib/format";
import { getLocale } from "@/lib/locale";
import { translator } from "@/lib/i18n";

export const metadata = { title: "آموزش اتصال" };

export default async function TutorialPage() {
  const locale = await getLocale();
  const tr = translator(locale);
  const f = fmt(locale);
  const [hintBefore, hintAfter] = tr("tutorial.tipsHint").split("{link}");

  return (
    <div className="container section">
      <div className="section-head">
        <span className="eyebrow">
          <span className="eyebrow-dot" />
          {tr("tutorial.eyebrow")}
        </span>
        <h1>{tr("tutorial.title")}</h1>
        <p>{tr("tutorial.subtitle")}</p>
      </div>

      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <div className="card">
          <div className="card-title">
            <h3>{tr("tutorial.stepsTitle")}</h3>
          </div>
          <div className="timeline">
            {tutorialSteps(locale).map((s, i) => (
              <div className="timeline-item" key={s.title}>
                <span className="tl-num">{f.num(i + 1)}</span>
                <div>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </div>
              </div>
            ))}
          </div>
          <Link className="btn btn-primary btn-block" href="/dashboard" style={{ marginTop: 18 }}>
            {tr("tutorial.goDashboard")}
          </Link>
        </div>

        <div className="card">
          <div className="card-title">
            <h3>{tr("tutorial.tipsTitle")}</h3>
          </div>
          <div className="svc-meta">
            <div className="meta-row">
              <span>{tr("tutorial.tipShare")}</span>
              <b>{tr("tutorial.tipShareV")}</b>
            </div>
            <div className="meta-row">
              <span>{tr("tutorial.tipUpdate")}</span>
              <b>{tr("tutorial.tipUpdateV")}</b>
            </div>
            <div className="meta-row">
              <span>{tr("tutorial.tipSpeed")}</span>
              <b>{tr("tutorial.tipSpeedV")}</b>
            </div>
            <div className="meta-row">
              <span>{tr("tutorial.tipQuota")}</span>
              <b>{tr("tutorial.tipQuotaV")}</b>
            </div>
          </div>
          <p className="field-hint" style={{ marginTop: 14 }}>
            {hintBefore}
            <Link href="/dashboard/tickets">{tr("dash.tickets")}</Link>
            {hintAfter}
          </p>
        </div>
      </div>

      <div className="section-head" style={{ marginTop: "clamp(34px, 6vw, 56px)" }}>
        <h2>{tr("tutorial.appsTitle")}</h2>
        <p>{tr("tutorial.appsText")}</p>
      </div>
      <div className="grid grid-4">
        {apps(locale).map((group) => (
          <div className="app-card" key={group.os}>
            <div className="app-card-head">
              <span>{group.icon}</span>
              <b>{group.os}</b>
            </div>
            {group.items.map((app) => (
              <a
                className="btn btn-sm btn-block"
                href={app.url}
                target="_blank"
                rel="noreferrer"
                key={app.name}
              >
                {app.name}
                {app.note ? <span className="badge badge-info">{app.note}</span> : null}
              </a>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
