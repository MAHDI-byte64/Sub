import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { fmt } from "@/lib/format";
import { getLocale } from "@/lib/locale";
import { translator } from "@/lib/i18n";

export const metadata = { title: "قوانین و مقررات" };

const RULE_KEYS = ["r1", "r2", "r3", "r4", "r5", "r6", "r7"];

export default async function TermsPage() {
  const [s, locale] = await Promise.all([getSettings(), getLocale()]);
  const tr = translator(locale);
  const f = fmt(locale);

  return (
    <div className="container section" style={{ maxWidth: 880 }}>
      <div className="section-head">
        <h1>{tr("terms.title")}</h1>
        <p>{tr("terms.subtitle", { site: s.site_name })}</p>
      </div>

      <div className="rule-list">
        {RULE_KEYS.map((key, i) => (
          <div className="rule-item" key={key}>
            <i>{f.num(i + 1)}</i>
            <p>{tr(`terms.${key}`)}</p>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-title">
          <h3>{tr("terms.questionTitle")}</h3>
        </div>
        <p>
          {tr("terms.questionText", { telegram: s.support_telegram, email: s.support_email })}
        </p>
        <div className="btn-row">
          <Link className="btn btn-sm btn-primary" href="/contact">
            {tr("nav.contact")}
          </Link>
          <Link className="btn btn-sm" href="/faq">
            {tr("nav.faq")}
          </Link>
        </div>
      </div>
    </div>
  );
}
