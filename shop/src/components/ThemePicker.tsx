"use client";

import { useState } from "react";
import { THEMES, themeById, themeVars } from "@/lib/themes";

/**
 * انتخاب تم سایت در پنل مدیر.
 *
 * با کلیک روی هر کارت، همان لحظه تم روی خودِ پنل اعمال می‌شود تا مدیر قبل از
 * ذخیره ببیند چه شکلی می‌شود؛ اگر بدون ذخیره از صفحه برود، با تازه‌شدن صفحه
 * همان تم قبلی برمی‌گردد. مقدار نهایی با فرم تنظیمات ذخیره می‌شود.
 */
/** اعمال متغیرهای یک تم روی صفحهٔ جاری (فقط برای پیش‌نمایش) */
function applyTheme(id: string) {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(themeVars(themeById(id)))) {
    root.style.setProperty(key, value);
  }
  root.setAttribute("data-theme", id);
}

export default function ThemePicker({ name, value }: { name: string; value: string }) {
  const [selected, setSelected] = useState(themeById(value).id);

  return (
    <div className="theme-grid" role="radiogroup" aria-label="تم رنگی سایت">
      {THEMES.map((theme) => {
        const active = theme.id === selected;
        return (
          <label className={`theme-card${active ? " is-active" : ""}`} key={theme.id}>
            <input
              type="radio"
              name={name}
              value={theme.id}
              checked={active}
              onChange={() => {
                setSelected(theme.id);
                applyTheme(theme.id);
              }}
            />
            <span
              className="theme-swatch"
              aria-hidden
              style={{ background: theme.vars.bg, borderColor: theme.vars.borderStrong }}
            >
              <i style={{ background: theme.vars.grad }} />
              <i style={{ background: theme.vars.accentLight }} />
              <i style={{ background: theme.vars.surface2 }} />
            </span>
            <span className="theme-name">
              <b>{theme.label}</b>
              <small>{theme.hint}</small>
            </span>
          </label>
        );
      })}
    </div>
  );
}
