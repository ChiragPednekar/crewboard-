// Loaded on demand (dynamic import) — @react-pdf/renderer is large.
import { Document, Link, Page, pdf, StyleSheet, Text, View } from '@react-pdf/renderer';

import { formatDate, formatDateTime, formatMonth } from '@/lib/dates';
import { supabase } from '@/lib/supabase';

const AMBER = '#B86E00';
const INK = '#16161D';
const MUTED = '#5E5E6B';
const LINE = '#E4E1DA';

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 9.5, color: INK, fontFamily: 'Helvetica' },
  brand: { fontSize: 9, color: AMBER, letterSpacing: 1.5, textTransform: 'uppercase', fontFamily: 'Helvetica-Bold' },
  h1: { fontSize: 20, fontFamily: 'Helvetica-Bold', marginTop: 4 },
  sub: { color: MUTED, marginTop: 2 },
  stats: { marginTop: 16, flexDirection: 'row', gap: 10 },
  stat: { flexGrow: 1, borderWidth: 0.5, borderColor: LINE, borderRadius: 6, padding: 10 },
  statValue: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: AMBER },
  statLabel: { color: MUTED, marginTop: 2, fontSize: 8.5 },
  h2: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginTop: 20, marginBottom: 6 },
  head: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: INK, paddingBottom: 3, fontFamily: 'Helvetica-Bold' },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: LINE, paddingVertical: 5 },
  muted: { color: MUTED },
  link: { color: AMBER, textDecoration: 'none', fontSize: 8.5 },
  footer: { position: 'absolute', bottom: 20, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between', color: MUTED, fontSize: 8 },
});

export interface ReportTask {
  title: string;
  status: string;
  due_date: string;
  approved_at: string | null;
  quality_rating: number | null;
  category: { name: string } | null;
  videographer: { full_name: string } | null;
  submissions: { version: number; links: string[]; submitted_at: string }[];
  client_review_links: { decision: string | null; rating: number | null; responded_at: string | null }[];
}

const STATUS: Record<string, string> = {
  assigned: 'Planned',
  in_progress: 'In production',
  submitted: 'In review',
  revision_requested: 'Being revised',
  approved: 'Delivered',
  cancelled: 'Cancelled',
};

export async function fetchClientReport(clientId: string, month: string): Promise<ReportTask[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select(
      'title, status, due_date, approved_at, quality_rating, category:task_categories(name), videographer:profiles!tasks_videographer_id_fkey(full_name), submissions(version, links, submitted_at), client_review_links(decision, rating, responded_at)',
    )
    .eq('client_id', clientId)
    .eq('month', `${month}-01`)
    .neq('status', 'cancelled')
    .order('due_date');
  if (error) throw error;
  return data as unknown as ReportTask[];
}

function ReportDocument({ client, month, tasks }: { client: string; month: string; tasks: ReportTask[] }) {
  const delivered = tasks.filter((t) => t.status === 'approved');
  const inFlight = tasks.filter((t) => t.status !== 'approved');
  const clientRatings = tasks.flatMap((t) => t.client_review_links.filter((l) => l.responded_at && l.rating).map((l) => l.rating!));
  const avgClient = clientRatings.length ? (clientRatings.reduce((a, b) => a + b, 0) / clientRatings.length).toFixed(1) : '–';
  const crew = new Set(tasks.map((t) => t.videographer?.full_name).filter(Boolean));
  const latest = (t: ReportTask) => [...t.submissions].sort((a, b) => b.version - a.version)[0];

  return (
    <Document title={`${client} — ${formatMonth(month)} report`}>
      <Page size="A4" style={s.page}>
        <Text style={s.brand}>CrewBoard · Monthly client report</Text>
        <Text style={s.h1}>{client}</Text>
        <Text style={s.sub}>{formatMonth(month)} · prepared {formatDateTime(new Date().toISOString(), 'd MMM yyyy')}</Text>

        <View style={s.stats}>
          <View style={s.stat}>
            <Text style={s.statValue}>{delivered.length}</Text>
            <Text style={s.statLabel}>deliverables completed</Text>
          </View>
          <View style={s.stat}>
            <Text style={s.statValue}>{inFlight.length}</Text>
            <Text style={s.statLabel}>still in production</Text>
          </View>
          <View style={s.stat}>
            <Text style={s.statValue}>{crew.size}</Text>
            <Text style={s.statLabel}>crew members involved</Text>
          </View>
          <View style={s.stat}>
            <Text style={s.statValue}>{avgClient}</Text>
            <Text style={s.statLabel}>your average rating{clientRatings.length ? ` (${clientRatings.length})` : ''}</Text>
          </View>
        </View>

        <Text style={s.h2}>Delivered this month</Text>
        {delivered.length === 0 ? (
          <Text style={s.muted}>Nothing delivered yet this month.</Text>
        ) : (
          <>
            <View style={s.head}>
              <Text style={{ width: '38%' }}>Deliverable</Text>
              <Text style={{ width: '16%' }}>Type</Text>
              <Text style={{ width: '20%' }}>Crew</Text>
              <Text style={{ width: '13%' }}>Delivered</Text>
              <Text style={{ width: '13%', textAlign: 'right' }}>Link</Text>
            </View>
            {delivered.map((t, i) => {
              const sub = latest(t);
              return (
                <View key={i} style={s.row} wrap={false}>
                  <Text style={{ width: '38%', paddingRight: 4 }}>{t.title}</Text>
                  <Text style={[s.muted, { width: '16%', paddingRight: 4 }]}>{t.category?.name ?? ''}</Text>
                  <Text style={{ width: '20%', paddingRight: 4 }}>{t.videographer?.full_name ?? ''}</Text>
                  <Text style={{ width: '13%' }}>{t.approved_at ? formatDateTime(t.approved_at, 'd MMM') : ''}</Text>
                  <View style={{ width: '13%', alignItems: 'flex-end' }}>
                    {sub?.links[0] ? (
                      <Link src={sub.links[0]} style={s.link}>
                        Watch
                      </Link>
                    ) : (
                      <Text style={s.muted}>–</Text>
                    )}
                  </View>
                </View>
              );
            })}
          </>
        )}

        {inFlight.length > 0 && (
          <>
            <Text style={s.h2}>Coming up</Text>
            <View style={s.head}>
              <Text style={{ width: '46%' }}>Deliverable</Text>
              <Text style={{ width: '18%' }}>Type</Text>
              <Text style={{ width: '18%' }}>Stage</Text>
              <Text style={{ width: '18%', textAlign: 'right' }}>Due</Text>
            </View>
            {inFlight.map((t, i) => (
              <View key={i} style={s.row} wrap={false}>
                <Text style={{ width: '46%', paddingRight: 4 }}>{t.title}</Text>
                <Text style={[s.muted, { width: '18%' }]}>{t.category?.name ?? ''}</Text>
                <Text style={{ width: '18%' }}>{STATUS[t.status] ?? t.status}</Text>
                <Text style={{ width: '18%', textAlign: 'right' }}>{formatDate(t.due_date, 'd MMM')}</Text>
              </View>
            ))}
          </>
        )}

        <View style={s.footer} fixed>
          <Text>
            {client} · {formatMonth(month)}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderClientReportPdf(clientId: string, client: string, month: string): Promise<Blob> {
  const tasks = await fetchClientReport(clientId, month);
  return pdf(<ReportDocument client={client} month={month} tasks={tasks} />).toBlob();
}
