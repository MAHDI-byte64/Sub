import { getSettings, SETTING_DEFS } from "@/lib/settings";
import { saveSettingsAction } from "@/app/actions/admin";
import ActionForm from "@/components/ActionForm";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const values = await getSettings();
  const groups = [...new Set(SETTING_DEFS.map((d) => d.group))];

  return (
    <div>
      <div className="card-title">
        <h1 style={{ fontSize: "1.5rem" }}>تنظیمات سایت</h1>
      </div>

      <ActionForm action={saveSettingsAction} submitLabel="ذخیره همه تنظیمات">
        {groups.map((group) => (
          <div className="card" key={group}>
            <div className="card-title">
              <h3>{group}</h3>
            </div>
            <div className="grid grid-2">
              {SETTING_DEFS.filter((d) => d.group === group).map((def) => (
                <div className={def.type === "bool" ? "checkbox" : "field"} key={def.key}>
                  {def.type === "bool" ? (
                    <>
                      <input
                        id={def.key}
                        name={def.key}
                        type="checkbox"
                        defaultChecked={values[def.key] === "1"}
                      />
                      <label htmlFor={def.key}>{def.label}</label>
                    </>
                  ) : (
                    <>
                      <label htmlFor={def.key}>{def.label}</label>
                      {def.type === "textarea" ? (
                        <textarea id={def.key} name={def.key} defaultValue={values[def.key]} />
                      ) : (
                        <input
                          id={def.key}
                          name={def.key}
                          type={def.type === "number" ? "number" : def.type === "password" ? "password" : "text"}
                          defaultValue={values[def.key]}
                        />
                      )}
                      {def.hint ? <span className="field-hint">{def.hint}</span> : null}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </ActionForm>
    </div>
  );
}
