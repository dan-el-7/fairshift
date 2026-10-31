import type { AdminOverview, WorkerSummary } from '../../../shared/api';
import { ErrorMessage } from '../../components/ErrorMessage';
import { SeverityBadge } from '../../components/Badge';
import { Icon, type IconName } from '../../components/Icon';
import { SpeakButton } from '../../components/SpeakButton';
import { Spinner } from '../../components/Spinner';
import { t, type TKey } from '../../i18n';
import { LIVE_REFRESH_MS, useApiData } from '../../useApiData';
import { RiskCell } from './RiskCell';
import { SEVERITIES } from './shared';
import HazardPatterns from './HazardPatterns';

type Series = AdminOverview['attendance14d'];

const CHART_W = 360;
const CHART_H = 200;
const PAD_X = 8;
const PAD_TOP = 24;
const PAD_BOTTOM = 26;

/** Day-of-month number for a YYYY-MM-DD string, e.g. "2026-10-07" -> "7". */
function dayNumber(day: string): string {
  return String(Number(day.slice(8)));
}

/** Inline SVG bar chart. The same numbers are in a visually hidden table on the page. */
function AttendanceChart({ series }: { series: Series }) {
  const max = Math.max(1, ...series.map((point) => point.present));
  const slot = (CHART_W - PAD_X * 2) / Math.max(1, series.length);
  const barWidth = slot * 0.6;
  const plotHeight = CHART_H - PAD_TOP - PAD_BOTTOM;

  return (
    <svg
      class="chart"
      viewBox={`0 0 ${CHART_W} ${CHART_H}`}
      role="img"
      aria-label={t('admin.chart.label')}
      focusable="false"
    >
      {[0.25, 0.5, 0.75, 1].map((fraction) => {
        const y = PAD_TOP + plotHeight - plotHeight * fraction;
        return <line key={fraction} class="chart-grid" x1={PAD_X} x2={CHART_W - PAD_X} y1={y} y2={y} />;
      })}
      {series.map((point, index) => {
        const height = (point.present / max) * plotHeight;
        const x = PAD_X + index * slot + (slot - barWidth) / 2;
        const y = PAD_TOP + plotHeight - height;
        return (
          <g key={point.day}>
            <rect class="chart-bar" x={x} y={y} width={barWidth} height={height} rx={3} />
            <text class="chart-value" x={x + barWidth / 2} y={y - 6} text-anchor="middle">
              {point.present}
            </text>
            <text class="chart-label" x={x + barWidth / 2} y={CHART_H - 8} text-anchor="middle">
              {dayNumber(point.day)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Kpi({ label, value, icon, href }: { label: string; value: number | string; icon: IconName; href?: string }) {
  const content = (
    <>
      <span class="kpi-icon" aria-hidden="true">
        <Icon name={icon} size={20} />
      </span>
      <span class="kpi-label">{label}</span>
      <strong class="kpi-value">{value}</strong>
    </>
  );
  return href ? (
    <a class="card kpi kpi-link" href={href}>{content}</a>
  ) : (
    <div class="card kpi">{content}</div>
  );
}

function AtRiskTable({ workers }: { workers: WorkerSummary[] }) {
  if (workers.length === 0) return <p class="muted">{t('admin.atRisk.none')}</p>;
  const sorted = [...workers].sort((a, b) => b.quitRisk.score - a.quitRisk.score);
  return (
    <div class="table-wrap risk-table-wrap" tabIndex={0}>
      <table class="table risk-table" role="table">
        <caption class="visually-hidden">{t('admin.atRisk.title')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('admin.col.name')}</th>
            <th scope="col">{t('admin.col.job')}</th>
            <th scope="col">{t('admin.col.risk')}</th>
            <th scope="col">{t('admin.col.factors')}</th>
            <th scope="col">{t('admin.col.fatigue')}</th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          {sorted.map((worker) => (
            <tr key={worker.id} role="row">
              <th scope="row" role="rowheader">{worker.name}</th>
              <td role="cell">
                <span class="risk-field-label" aria-hidden="true">{t('admin.col.job')}</span>
                <div class="risk-value">{worker.jobTitle}</div>
              </td>
              <td role="cell">
                <span class="risk-field-label" aria-hidden="true">{t('admin.col.risk')}</span>
                <div class="risk-value"><RiskCell level={worker.quitRisk.level} score={worker.quitRisk.score} /></div>
              </td>
              <td role="cell">
                <span class="risk-field-label" aria-hidden="true">{t('admin.col.factors')}</span>
                <div class="risk-value">
                <ul class="tag-list">
                  {worker.quitRisk.factors.map((factor) => (
                    <li key={factor.factor}>
                      <span class="tag">
                        <span>{t(`risk.factor.${factor.factor}` as TKey)}</span>
                        <span>{t('admin.points', { points: factor.points })}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                </div>
              </td>
              <td role="cell">
                <span class="risk-field-label" aria-hidden="true">{t('admin.col.fatigue')}</span>
                <div class="risk-value">
                {worker.fatigue.length === 0 ? (
                  '—'
                ) : (
                  <ul class="tag-list">
                    {worker.fatigue.map((flag, index) => (
                      <li key={`${flag.rule}-${index}`}>
                        <span class="tag">{t(`admin.fatigueRule.${flag.rule}` as TKey)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OverviewKpis({ data }: { data: AdminOverview }) {
  return (
    <>
      <section class="stack" aria-labelledby="attention-title">
        <h2 id="attention-title">{t('admin.attention.title')}</h2>
        <div class="kpi-grid overview-attention">
          <Kpi label={t('admin.kpi.overdueReports')} value={data.kpis.overdueReports} icon="alert" href="#/a/reports?filter=overdue" />
          <Kpi label={t('admin.kpi.openReports')} value={data.kpis.openReports} icon="file" href="#/a/reports?filter=unresolved" />
          <Kpi label={t('admin.kpi.fatigueAlerts')} value={data.kpis.fatigueAlerts} icon="bolt" href="#/a/workers?filter=fatigue" />
          <Kpi label={t('admin.kpi.highRiskWorkers')} value={data.kpis.highRiskWorkers} icon="chart" href="#/a/workers?filter=high-risk" />
        </div>
      </section>
      <div class="kpi-grid overview-summary">
        <Kpi label={t('admin.kpi.workers')} value={data.kpis.workers} icon="users" href="#/a/workers?filter=all" />
        <Kpi label={t('admin.kpi.presentToday')} value={data.kpis.presentToday} icon="checkin" />
        <Kpi label={t('admin.kpi.overtime14d')} value={data.kpis.overtimeHours14d} icon="clock" />
      </div>
    </>
  );
}

function PriorityCounts({ counts }: { counts: AdminOverview['reportsBySeverity'] }) {
  return (
    <section class="card stack" aria-labelledby="severity-title">
      <h2 id="severity-title">{t('admin.severity.all')}</h2>
      <ul class="inline-list">
        {SEVERITIES.map((severity) => (
          <li key={severity}>
            <a class="priority-link row" href={`#/a/reports?filter=all&severity=${severity}`}>
              <SeverityBadge severity={severity} />
              <span>{counts[severity]}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Spoken summary of the headline KPIs, in the current UI language. */
function dashboardSpeech(overview: AdminOverview): string {
  const k = overview.kpis;
  return t('admin.speech.summary', {
    present: k.presentToday,
    workers: k.workers,
    openReports: k.openReports,
    overdueReports: k.overdueReports,
    fatigue: k.fatigueAlerts,
    highRisk: k.highRiskWorkers,
  });
}

export default function Dashboard() {
  const overview = useApiData<AdminOverview>('/api/admin/overview', { refreshMs: LIVE_REFRESH_MS });
  const data = overview.data;

  return (
    <div class="stack">
      <div class="heading-row">
        <h1>{t('admin.dashboard.title')}</h1>
        {data ? <SpeakButton text={dashboardSpeech(data)} /> : null}
      </div>

      {overview.loading && !data ? <Spinner /> : null}
      {overview.error ? <ErrorMessage error={overview.error} onRetry={overview.reload} /> : null}

      {data ? (
        <>
          <p class="muted">{t('home.site', { site: data.site.name })}</p>

          <OverviewKpis data={data} />
          <HazardPatterns />
          <PriorityCounts counts={data.reportsBySeverity} />

          <section class="card stack attendance-chart-card" aria-labelledby="chart-title">
            <h2 id="chart-title">{t('admin.chart.title')}</h2>
            <AttendanceChart series={data.attendance14d} />
            {/* Hidden via a wrapper: a table keeps its intrinsic width even when clipped. */}
            <div class="visually-hidden">
              <table>
                <caption>{t('admin.chart.caption')}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t('admin.col.day')}</th>
                    <th scope="col">{t('admin.col.present')}</th>
                    <th scope="col">{t('admin.col.overtime')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.attendance14d.map((point) => (
                    <tr key={point.day}>
                      <th scope="row">{point.day}</th>
                      <td>{point.present}</td>
                      <td>{point.overtimeHours}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section class="card stack risk-panel" aria-labelledby="risk-title">
            <h2 id="risk-title">{t('admin.atRisk.title')}</h2>
            <AtRiskTable workers={data.atRisk} />
            <p class="muted">{t('admin.atRisk.note')}</p>
          </section>
        </>
      ) : null}
    </div>
  );
}
