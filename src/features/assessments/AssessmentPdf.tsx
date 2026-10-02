// Loaded on demand (dynamic import) — @react-pdf/renderer is large.
import { Document, Page, pdf, StyleSheet, Text, View } from '@react-pdf/renderer';

import { formatDate, formatDateTime, formatMonth, submittedOnTime } from '@/lib/dates';
import { computeScore } from '@/lib/scoring';

import { type Assessment, metricsOf, weightsOf } from './api';
import { summariseByCategory, type PlannedTask, STATUS_TEXT } from './planned';

const AMBER = '#B86E00';
const INK = '#16161D';
const MUTED = '#5E5E6B';
const LINE = '#E4E1DA';

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 9.5, color: INK, fontFamily: 'Helvetica' },
  brand: { fontSize: 9, color: AMBER, letterSpacing: 1.5, textTransform: 'uppercase', fontFamily: 'Helvetica-Bold' },
  h1: { fontSize: 20, fontFamily: 'Helvetica-Bold', marginTop: 4 },
  sub: { color: MUTED, marginTop: 2 },
  scoreBox: { marginTop: 18, flexDirection: 'row', gap: 16, alignItems: 'flex-end' },
  score: { fontSize: 36, fontFamily: 'Helvetica-Bold', color: AMBER },
  h2: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginTop: 20, marginBottom: 6 },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: LINE, paddingVertical: 4 },
  head: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: INK, paddingBottom: 3, fontFamily: 'Helvetica-Bold' },
  muted: { color: MUTED },
  para: { lineHeight: 1.45 },
  footer: { position: 'absolute', bottom: 20, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between', color: MUTED, fontSize: 8 },
});

const pct = (r: number) => `${(r * 100).toFixed(1)}%`;

interface PdfData {
  assessment: Assessment;
  name: string;
  tasks: PlannedTask[];
}

function AssessmentDocument({ assessment: a, name, tasks }: PdfData) {
  const w = weightsOf(a);
  const score = computeScore({ metrics: metricsOf(a), weights: w, discretionary: a.discretionary_score === null ? null : Number(a.discretionary_score), bonus: Number(a.bonus_points) });
  const parts = [
    { label: 'Points earned', ratio: score.pointsPct, weight: w.points, detail: `${a.points_awarded_sum} of ${a.max_points_sum} pts` },
    { label: 'Completion', ratio: score.completionPct, weight: w.completion, detail: `${a.approved_count} of ${a.assigned_count} tasks approved` },
    { label: 'Punctuality', ratio: score.punctualityPct, weight: w.punctuality, detail: `${a.on_time_count} of ${a.submitted_count} first submissions on time` },
    {
      label: 'Discretionary',
      ratio: (a.discretionary_score === null ? 0 : Number(a.discretionary_score)) / 10,
      weight: w.discretionary,
      detail: a.discretionary_score === null ? 'not set' : `${Number(a.discretionary_score)} / 10`,
    },
  ];
  const categories = summariseByCategory(tasks);
  const month = a.month.slice(0, 7);

  return (
    <Document title={`${name} – ${formatMonth(month)} assessment`} author="CrewBoard">
      <Page size="A4" style={s.page}>
        <Text style={s.brand}>CrewBoard · Monthly assessment</Text>
        <Text style={s.h1}>{name}</Text>
        <Text style={s.sub}>
          {formatMonth(month)} · {a.status === 'published' ? `Published ${a.published_at ? formatDateTime(a.published_at, 'd MMM yyyy') : ''}` : 'DRAFT – not published'}
        </Text>

        <View style={s.scoreBox}>
          <Text style={s.score}>{Number(a.total_score).toFixed(2)}</Text>
          <Text style={[s.muted, { marginBottom: 6 }]}>
            out of 100{Number(a.bonus_points) > 0 ? `  (base ${Number(a.base_score).toFixed(2)} + ${Number(a.bonus_points)} bonus)` : ''}
          </Text>
        </View>

        <Text style={s.h2}>How the score is made</Text>
        <View style={s.head}>
          <Text style={{ width: '24%' }}>Component</Text>
          <Text style={{ width: '40%' }}>Detail</Text>
          <Text style={{ width: '12%', textAlign: 'right' }}>Result</Text>
          <Text style={{ width: '12%', textAlign: 'right' }}>Weight</Text>
          <Text style={{ width: '12%', textAlign: 'right' }}>Score</Text>
        </View>
        {parts.map((p) => (
          <View key={p.label} style={s.row}>
            <Text style={{ width: '24%' }}>{p.label}</Text>
            <Text style={[s.muted, { width: '40%' }]}>{p.detail}</Text>
            <Text style={{ width: '12%', textAlign: 'right' }}>{pct(p.ratio)}</Text>
            <Text style={{ width: '12%', textAlign: 'right' }}>{p.weight}</Text>
            <Text style={{ width: '12%', textAlign: 'right' }}>{(p.weight * p.ratio).toFixed(2)}</Text>
          </View>
        ))}
        {Number(a.bonus_points) > 0 && (
          <View style={s.row}>
            <Text style={{ width: '24%' }}>Bonus</Text>
            <Text style={[s.muted, { width: '64%' }]}>{a.bonus_reason ?? ''}</Text>
            <Text style={{ width: '12%', textAlign: 'right' }}>+{Number(a.bonus_points).toFixed(2)}</Text>
          </View>
        )}

        {a.public_note && (
          <>
            <Text style={s.h2}>Highlight</Text>
            <Text style={s.para}>{a.public_note}</Text>
          </>
        )}
        {a.admin_remarks && (
          <>
            <Text style={s.h2}>Remarks</Text>
            <Text style={s.para}>{a.admin_remarks}</Text>
          </>
        )}

        <Text style={s.h2}>Planned vs completed</Text>
        <View style={s.head}>
          <Text style={{ width: '40%' }}>Category</Text>
          <Text style={{ width: '20%', textAlign: 'right' }}>Planned</Text>
          <Text style={{ width: '20%', textAlign: 'right' }}>Completed</Text>
          <Text style={{ width: '20%', textAlign: 'right' }}>Points</Text>
        </View>
        {categories.map((c) => (
          <View key={c.category} style={s.row}>
            <Text style={{ width: '40%' }}>{c.category}</Text>
            <Text style={{ width: '20%', textAlign: 'right' }}>{c.planned}</Text>
            <Text style={{ width: '20%', textAlign: 'right' }}>{c.completed}</Text>
            <Text style={{ width: '20%', textAlign: 'right' }}>
              {c.points} / {c.maxPoints}
            </Text>
          </View>
        ))}

        <Text style={s.h2}>Tasks</Text>
        <View style={s.head} fixed>
          <Text style={{ width: '30%' }}>Task</Text>
          <Text style={{ width: '18%' }}>Client</Text>
          <Text style={{ width: '9%' }}>Due</Text>
          <Text style={{ width: '21%' }}>Status</Text>
          <Text style={{ width: '10%' }}>Delivery</Text>
          <Text style={{ width: '12%', textAlign: 'right' }}>Points</Text>
        </View>
        {tasks.map((t, i) => (
          <View key={i} style={s.row} wrap={false}>
            <Text style={{ width: '30%', paddingRight: 4 }}>{t.title}</Text>
            <Text style={[s.muted, { width: '18%', paddingRight: 4 }]}>{t.client}</Text>
            <Text style={{ width: '9%' }}>{formatDate(t.due_date, 'd MMM')}</Text>
            <Text style={{ width: '21%', paddingRight: 4 }}>{STATUS_TEXT[t.status]}</Text>
            <Text style={{ width: '10%' }}>{t.first_submitted_at ? (submittedOnTime(t.first_submitted_at, t.due_date) ? 'On time' : 'Late') : '–'}</Text>
            <Text style={{ width: '12%', textAlign: 'right' }}>
              {t.status === 'approved' ? `${t.points_awarded} / ${t.max_points}` : t.status === 'cancelled' ? '–' : `0 / ${t.max_points}`}
            </Text>
          </View>
        ))}

        <View style={s.footer} fixed>
          <Text>
            {name} · {formatMonth(month)}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderAssessmentPdf(data: PdfData): Promise<Blob> {
  return pdf(<AssessmentDocument {...data} />).toBlob();
}
