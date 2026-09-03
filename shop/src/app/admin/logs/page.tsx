import { db } from "@/lib/db";
import { ACTION_LABELS } from "@/lib/adminlog";
import { faDate, faNum, relativeTime } from "@/lib/format";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string }>;
}) {
  await requireAdmin();

  const { action } = await searchParams;
  const [logs, total, actions] = await Promise.all([
    db.adminLog.findMany({
      where: action ? { action } : {},
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.adminLog.count(),
    db.adminLog.groupBy({ by: ["action"], _count: { _all: true } }),
  ]);

  const today = logs.filter(
    (l) => l.createdAt.getTime() > new Date().setHours(0, 0, 0, 0),
  ).length;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>گزارش فعالیت</h1>
          <p>هر کاری که در پنل مدیریت انجام می‌شود اینجا ثبت می‌شود.</p>
        </div>
        <span className="badge badge-info">{faNum(total)} رویداد</span>
      </div>

      <div className="summary-strip">
        <div className="summary-tile">
          <span>📋 کل رویدادها</span>
          <b>{faNum(total)}</b>
        </div>
        <div className="summary-tile">
          <span>📅 امروز</span>
          <b>{faNum(today)}</b>
        </div>
        <div className="summary-tile">
          <span>🔀 نوع اقدام</span>
          <b>{faNum(actions.length)}</b>
        </div>
        <div className="summary-tile">
          <span>🕒 آخرین فعالیت</span>
          <b>{logs[0] ? relativeTime(logs[0].createdAt) : "—"}</b>
        </div>
      </div>

      <div className="tabs">
        <a href="/admin/logs" className={!action ? "active" : ""}>
          همه
        </a>
        {actions
          .sort((a, b) => b._count._all - a._count._all)
          .slice(0, 8)
          .map((row) => (
            <a
              key={row.action}
              href={`/admin/logs?action=${row.action}`}
              className={action === row.action ? "active" : ""}
            >
              {ACTION_LABELS[row.action]?.label ?? row.action} ({faNum(row._count._all)})
            </a>
          ))}
      </div>

      {logs.length ? (
        <div className="card data-card">
          <div className="data-head">
            <h3>رویدادها</h3>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>اقدام</th>
                  <th>مدیر</th>
                  <th>روی چه چیزی</th>
                  <th>توضیح</th>
                  <th>زمان</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const meta = ACTION_LABELS[log.action] ?? { label: log.action, icon: "•" };
                  return (
                    <tr key={log.id}>
                      <td className="nowrap">
                        {meta.icon} {meta.label}
                      </td>
                      <td className="ltr">{log.adminEmail}</td>
                      <td>{log.target ?? "—"}</td>
                      <td className="cell-sub">{log.detail ?? "—"}</td>
                      <td className="nowrap">
                        <span className="cell-main">{relativeTime(log.createdAt)}</span>
                        <span className="cell-sub">{faDate(log.createdAt, true)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card empty">
          <div className="empty-icon">📋</div>
          هنوز رویدادی ثبت نشده است.
        </div>
      )}
    </div>
  );
}
