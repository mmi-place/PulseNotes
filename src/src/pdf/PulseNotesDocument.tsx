import { Document, Page, StyleSheet, View } from '@formepdf/react';
import { DataTable } from '@/components/pdf/data-table/data-table';
import { PdfGraph } from '@/components/pdf/graph/graph';
import { PageFooter } from '@/components/pdf/page-footer/page-footer';
import { PageHeader } from '@/components/pdf/page-header/page-header';
import { Section } from '@/components/pdf/section/section';
import { Text } from '@/components/pdf/text/text';
import { PdfcnThemeProvider, usePdfcnTheme } from '@/components/pdf/theme-provider';
import type { PulsePdfMetric, PulsePdfModel, PulsePdfReportModel } from './model';

const PAGE_PORTRAIT = { width: 595, height: 842 };

function metricColor(tone: PulsePdfMetric['tone'], color: boolean) {
  if (!color) return '#475569';
  if (tone === 'success') return '#15803d';
  if (tone === 'warning') return '#b45309';
  if (tone === 'primary') return '#2563eb';
  return '#64748b';
}

function Metrics({ items, compact, color }: { items: PulsePdfMetric[]; compact: boolean; color: boolean }) {
  const theme = usePdfcnTheme();
  const styles = StyleSheet.create({
    grid: { display: 'flex', flexDirection: 'row', gap: compact ? 6 : 8, marginBottom: compact ? 8 : 12 },
    card: { backgroundColor: theme.colors.background, borderColor: theme.colors.border, borderStyle: 'solid', borderWidth: 1, borderRadius: 4, flex: 1, minHeight: compact ? 52 : 62, padding: compact ? 7 : 9 },
    label: { color: theme.colors.mutedForeground, fontSize: 7, letterSpacing: 0.5, marginBottom: 4, textTransform: 'uppercase' },
    value: { color: theme.colors.foreground, fontSize: compact ? 14 : 17, fontWeight: 700, marginBottom: 3 },
    detail: { color: theme.colors.mutedForeground, fontSize: 7.5 }
  });
  return <View style={styles.grid}>{items.map(item => <View key={item.label} style={{ ...styles.card, borderTopColor: metricColor(item.tone, color), borderTopWidth: 3 }}><Text noMargin style={styles.label}>{item.label}</Text><Text noMargin style={styles.value}>{item.value}</Text><Text noMargin style={styles.detail}>{item.detail}</Text></View>)}</View>;
}

function Footer({ current, total, generatedAt }: { current: number; total: number; generatedAt: string }) {
  return <PageFooter variant="minimal" rightText={`Export PulseNotes non officiel · Exporté le ${generatedAt} · ${current} / ${total}`} sticky pagePadding={30} />;
}

function Disclaimer() {
  return <Section variant="callout" padding="sm" noWrap><Text variant="xs" color="mutedForeground" noMargin>Ce bulletin est un export personnalisé généré par PulseNotes et n’est pas un document officiel. Les documents délivrés par l’établissement font foi. Les informations reproduisent les données disponibles au moment de l’export.</Text></Section>;
}

const statusText = (status: PulsePdfModel['status']) => status === 'Final' ? 'Période terminée - résultats consolidés' : status === 'Provisoire' ? 'Période en cours - résultats susceptibles d’évoluer' : 'Certaines données ne sont pas encore publiées';

function CoverPage({ model, page, total }: { model: PulsePdfModel; page: number; total: number }) {
  return <Page size={PAGE_PORTRAIT} margin={{ top: 30, right: 30, bottom: 42, left: 30 }} style={{ backgroundColor: '#f8fafc' }}>
    <View bookmark="Couverture" />
    <View style={{ borderTopColor: model.options.color ? '#2563eb' : '#334155', borderTopWidth: 6, display: 'flex', flex: 1, justifyContent: 'center', padding: 36 }}>
      <Text variant="xs" color="mutedForeground" transform="uppercase">Export académique personnalisé</Text>
      <Text variant="3xl" weight="bold" noMargin>{model.title}</Text>
      <View style={{ marginTop: 28 }}><Text variant="xl" weight="semibold" noMargin>{model.studentName}</Text><Text variant="base" color="mutedForeground">{model.formation}</Text></View>
      <View style={{ marginTop: 24 }}><Text variant="lg" weight="semibold" noMargin>{model.periodLabel}</Text><Text variant="sm" color="mutedForeground">Généré le {model.generatedAt}</Text></View>
      <Text variant="sm" color="mutedForeground">{statusText(model.status)}</Text>
      <View style={{ marginTop: 34, paddingTop: 16, borderTopColor: '#cbd5e1', borderTopWidth: 1 }}><Text variant="sm" weight="semibold">Sommaire</Text><Text variant="sm" noMargin>Synthèse générale</Text>{model.reports.map(report => <Text key={report.id} variant="sm" noMargin>{report.label} - UE, modules et évaluations</Text>)}<Text variant="xs" color="mutedForeground">Les sections sont accessibles depuis les signets du lecteur PDF.</Text></View>
      <View style={{ marginTop: 30 }}><Disclaimer /></View>
    </View>
    <Footer current={page} total={total} generatedAt={model.generatedAt} />
  </Page>;
}

function SummaryPage({ model, page, total }: { model: PulsePdfModel; page: number; total: number }) {
  return <Page size={PAGE_PORTRAIT} margin={{ top: 30, right: 30, bottom: 42, left: 30 }}>
    <View bookmark="Synthese" />
    <PageHeader variant="two-column" title={model.title} subtitle={`${model.studentName} · ${model.formation}`} rightText={model.periodLabel} rightSubText={`Généré le ${model.generatedAt}`} marginBottom={12} />
    <Text variant="xs" color="mutedForeground">{statusText(model.status)}</Text>
    {model.options.sections.summary && <Metrics items={model.summaryMetrics} compact color={model.options.color} />}
    {model.options.sections.charts && model.trend.length > 1 && <Section variant="card" padding="sm" noWrap><PdfGraph variant="line" data={model.trend} title="Dynamique des résultats" subtitle="Moyenne par semestre" height={118} fullWidth colors={[model.options.color ? '#2563eb' : '#334155']} showDots showValues smooth legend="none" /></Section>}
    <Section padding="sm"><Text variant="sm" weight="semibold">Périmètre du document</Text><Text variant="xs" color="mutedForeground" noMargin>{model.reports.map(report => report.label).join(' · ')}. Les moyennes absentes ne sont pas remplacées par zéro.</Text></Section>
    <Footer current={page} total={total} generatedAt={model.generatedAt} />
  </Page>;
}

function ReportPage({ report, model, page, total }: { report: PulsePdfReportModel; model: PulsePdfModel; page: number; total: number }) {
  return <Page size={PAGE_PORTRAIT} margin={{ top: 30, right: 30, bottom: 42, left: 30 }}>
    <View bookmark={report.id} />
    <PageHeader variant="minimal" title={report.label} subtitle={`${model.studentName} · ${statusText(report.status === 'Terminé' ? 'Final' : report.status === 'En cours' ? 'Provisoire' : 'Données incomplètes')}`} rightText={model.periodLabel} marginBottom={8} />
    <Metrics items={report.metrics} compact color={model.options.color} />
    <Section variant="card" padding="sm" noWrap><Text variant="sm" weight="semibold">Moyennes par UE</Text><DataTable variant="striped" size="compact" stripe columns={[{ key: 'ue', header: 'UE', width: 44 }, { key: 'intitulé', header: 'Intitulé' }, { key: 'étudiant', header: 'Vous /20', align: 'right', width: 54 }, ...(model.options.sections.comparison ? [{ key: 'promotion', header: 'Promo /20', align: 'right' as const, width: 58 }, { key: 'écart', header: 'Écart', align: 'right' as const, width: 42 }] : [])]} data={report.ueRows} /></Section>
    {model.options.sections.modules && <View style={{ marginTop: 7 }}><Text variant="sm" weight="semibold">Modules</Text><DataTable variant="striped" size="compact" stripe columns={[{ key: 'code', header: 'Code', width: 62 }, { key: 'module', header: 'Module' }, { key: 'type', header: 'Cat.', width: 34 }, { key: 'moyenne', header: 'Moy. /20', align: 'right', width: 52 }, ...(model.options.sections.comparison ? [{ key: 'promotion', header: 'Promo', align: 'right' as const, width: 46 }] : []), { key: 'évaluations', header: 'Nb.', align: 'right', width: 28 }]} data={report.moduleRows} /></View>}
    <Footer current={page} total={total} generatedAt={model.generatedAt} />
  </Page>;
}

function EvaluationPage({ report, rows, page, total, model, part, parts }: { report: PulsePdfReportModel; rows: Array<Record<string, unknown>>; page: number; total: number; model: PulsePdfModel; part: number; parts: number }) {
  return <Page size={PAGE_PORTRAIT} margin={{ top: 30, right: 30, bottom: 42, left: 30 }}>
    <PageHeader variant="minimal" title={`Notes · ${report.label}`} subtitle={model.studentName} rightText={parts > 1 ? `${part} / ${parts}` : model.periodLabel} marginBottom={8} />
    <DataTable variant="striped" size="compact" stripe columns={[{ key: 'date', header: 'Date', width: 57 }, { key: 'module', header: 'Module', width: 65 }, { key: 'évaluation', header: 'Évaluation' }, { key: 'type', header: 'Cat.', width: 30 }, { key: 'note', header: 'Note', align: 'right', width: 40 }, { key: 'coefficient', header: 'Coef.', align: 'right', width: 38 }, ...(model.options.sections.comparison ? [{ key: 'promotion', header: 'Promo', align: 'right' as const, width: 48 }] : [])]} data={rows} />
    <Footer current={page} total={total} generatedAt={model.generatedAt} />
  </Page>;
}

function Pages({ model }: { model: PulsePdfModel }) {
  const chunkSize = 28;
  const detailPageCount = model.options.sections.details ? model.reports.reduce((sum, report) => sum + Math.ceil(report.evaluationRows.length / chunkSize), 0) : 0;
  const total = (model.options.sections.cover ? 1 : 0) + 1 + model.reports.length + detailPageCount;
  let page = 1;
  return <Document title="Bulletin PulseNotes - export personnalise" author="PulseNotes" creator="PulseNotes avec pdfcn" subject="Resultats academiques personnalises" lang="fr-FR" tagged>
    {model.options.sections.cover && <CoverPage model={model} page={page++} total={total} />}
    <SummaryPage model={model} page={page++} total={total} />
    {model.reports.flatMap(report => {
      const pages = [<ReportPage key={`${report.id}-summary`} report={report} model={model} page={page++} total={total} />];
      if (model.options.sections.details) {
        const chunks = Array.from({ length: Math.ceil(report.evaluationRows.length / chunkSize) }, (_, index) => report.evaluationRows.slice(index * chunkSize, (index + 1) * chunkSize));
        chunks.forEach((rows, index) => pages.push(<EvaluationPage key={`${report.id}-details-${index}`} report={report} rows={rows} model={model} page={page++} total={total} part={index + 1} parts={chunks.length} />));
      }
      return pages;
    })}
  </Document>;
}

export function PulseNotesDocument({ model }: { model: PulsePdfModel }) {
  return <PdfcnThemeProvider><Pages model={model} /></PdfcnThemeProvider>;
}
