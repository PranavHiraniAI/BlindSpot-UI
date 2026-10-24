import { useEffect, useRef, useState } from 'react'
import { ArrowDownToLine, ArrowRight, Check, CheckCheck, ChevronRight, CircleAlert, Copy,
  Crosshair, Expand, FileImage, CodeXml, ImagePlus, LoaderCircle, ScanEye, ScanSearch,
  ShieldCheck, Sparkles, Upload, X } from 'lucide-react'
import { AUDIT_TIMEOUT_MS, auditSchema, IMAGE_TYPES, MAX_IMAGE_BYTES, prioritize, severities,
  type AuditReport, type Finding, type Severity } from '../../shared/audit'
import { reportMarkdown } from './report'

type Selection = { file: File; url: string }
type Connection = { configured: boolean; model: string; maxImageBytes?: number }

function FindingCard({ finding, index, active, onSelect }: {
  finding: Finding; index: number; active: boolean; onSelect: (index: number) => void
}) {
  return <article className={`finding ${active ? 'is-active' : ''}`} id={`finding-${index}`} tabIndex={-1}>
    <div className="finding-top">
      <span className={`severity ${finding.severity}`}><span className="severity-dot" />{finding.severity}</span>
      <span className="category">{finding.category}</span>
      <span className="confidence" title="Model-estimated confidence, not a calibrated probability">{Math.round(finding.confidence * 100)}% confidence</span>
    </div>
    <h3><span className="finding-number">{String(index + 1).padStart(2, '0')}</span>{finding.title}</h3>
    <dl>
      <div><dt>Evidence</dt><dd>{finding.evidence}</dd></div>
      <div><dt>Impact</dt><dd>{finding.impact}</dd></div>
      <div className="recommendation"><dt><Sparkles size={13} aria-hidden="true" />Recommendation</dt><dd>{finding.recommendation}</dd></div>
    </dl>
    {finding.region && <button className="region-link" onClick={() => onSelect(index)}>
      <Crosshair size={14} aria-hidden="true" /> Region {index + 1} <span>Approximate</span>
    </button>}
  </article>
}

function App() {
  const [selection, setSelection] = useState<Selection | null>(null)
  const [report, setReport] = useState<AuditReport | null>(null)
  const [filter, setFilter] = useState<Severity | 'all'>('all')
  const [activeRegion, setActiveRegion] = useState<number | null>(null)
  const [regionsVisible, setRegionsVisible] = useState(true)
  const [loading, setLoading] = useState(false)
  const [sampleLoading, setSampleLoading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const [copyStatus, setCopyStatus] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [dimensions, setDimensions] = useState('')
  const [connection, setConnection] = useState<Connection | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const previewDialog = useRef<HTMLDialogElement>(null)
  const request = useRef<AbortController | null>(null)
  const busy = loading || sampleLoading
  const maxImageBytes = Math.min(connection?.maxImageBytes ?? 4 * 1024 * 1024, MAX_IMAGE_BYTES)
  const maxImageMb = maxImageBytes / 1024 / 1024

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/health', { signal: controller.signal, cache: 'no-store' })
      .then(response => response.ok ? response.json() : Promise.reject())
      .then((data: Connection) => setConnection(data))
      .catch(() => {})
    return () => { controller.abort(); request.current?.abort() }
  }, [])

  useEffect(() => () => { if (selection) URL.revokeObjectURL(selection.url) }, [selection])
  useEffect(() => {
    if (!loading) return
    const start = Date.now()
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => window.clearInterval(timer)
  }, [loading])

  function selectFile(file?: File) {
    if (!file || busy) return
    if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) {
      setError('Choose a PNG, JPEG, or WebP screenshot.'); return
    }
    if (file.size > maxImageBytes || file.size === 0) {
      setError(`Choose a nonempty screenshot no larger than ${maxImageMb} MB.`); return
    }
    request.current?.abort()
    setSelection({ file, url: URL.createObjectURL(file) })
    setReport(null); setFilter('all'); setActiveRegion(null); setDimensions(''); setError(''); setCopyStatus('')
  }

  async function loadSample() {
    if (busy) return
    setSampleLoading(true); setError('')
    try {
      const response = await fetch('/sample-ui.png')
      if (!response.ok) throw new Error('The sample screenshot could not be loaded.')
      const blob = await response.blob()
      const file = new File([blob], 'sample-workspace.png', { type: 'image/png' })
      if (file.size === 0 || file.size > maxImageBytes) throw new Error('The sample image is not valid.')
      request.current?.abort()
      setSelection({ file, url: URL.createObjectURL(file) })
      setReport(null); setFilter('all'); setActiveRegion(null); setDimensions(''); setCopyStatus('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the sample screenshot.')
    } finally { setSampleLoading(false) }
  }

  async function analyze() {
    if (!selection || busy) return
    const controller = new AbortController()
    request.current = controller
    setLoading(true); setElapsed(0); setReport(null); setError(''); setCopyStatus(''); setActiveRegion(null); setFilter('all')
    const timeout = window.setTimeout(() => controller.abort(), AUDIT_TIMEOUT_MS + 15_000)
    try {
      const form = new FormData()
      form.append('screenshot', selection.file)
      const response = await fetch('/api/audit', { method: 'POST', body: form, signal: controller.signal })
      if (response.status === 413) throw new Error(`The screenshot exceeds the server upload limit. Choose an image no larger than ${maxImageMb} MB.`)
      const payload = await response.json().catch(() => { throw new Error('The server returned an unreadable response. Check that the API is running.') })
      if (!response.ok) throw new Error(typeof payload?.error?.message === 'string' ? payload.error.message : 'The analysis failed. Please retry.')
      const parsed = auditSchema.safeParse(payload)
      if (!parsed.success) throw new Error('The server returned an invalid report. Please retry.')
      if (request.current === controller) setReport(prioritize(parsed.data))
    } catch (cause) {
      if (request.current === controller) setError(controller.signal.aborted
        ? 'The request timed out. Please retry.'
        : cause instanceof Error ? cause.message : 'The analysis failed. Check your API connection and retry.')
    } finally {
      window.clearTimeout(timeout)
      if (request.current === controller) { setLoading(false); request.current = null }
    }
  }

  function removeImage() {
    if (busy) return
    setSelection(null); setReport(null); setError(''); setDimensions(''); setCopyStatus(''); setActiveRegion(null)
    if (input.current) input.current.value = ''
  }

  function showRegion(index: number) {
    setActiveRegion(index); setRegionsVisible(true)
    document.getElementById('screenshot-preview')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  function exportJson() {
    if (!report) return
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url; anchor.download = 'blindspot-ui-audit.json'; anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function copyMarkdown() {
    if (!report) return
    try {
      await navigator.clipboard.writeText(reportMarkdown(report))
      setCopyStatus('Markdown copied to clipboard.')
    } catch { setCopyStatus('Clipboard access was denied. Export JSON instead, or allow clipboard access and retry.') }
  }

  const counts = Object.fromEntries(severities.map(severity => [severity, report?.findings.filter(finding => finding.severity === severity).length ?? 0]))
  const visible = report?.findings.map((finding, index) => ({ finding, index })).filter(({ finding }) => filter === 'all' || finding.severity === filter) ?? []

  return <>
    <header className="app-header">
      <a className="brand" href="/" aria-label="BlindSpot UI home"><span className="brand-mark"><ScanEye size={24} aria-hidden="true" /></span><span>BlindSpot<span className="brand-ui"> UI</span></span></a>
      <span className="header-divider" /><span className="header-label">Visual audit workspace</span>
      <div className="header-actions"><span className="version">v0.1 / OPEN SOURCE</span><a className="icon-button" href="https://github.com/PranavHiraniAI/BlindSpot-UI" target="_blank" rel="noreferrer" aria-label="Source on GitHub" title="Source on GitHub"><CodeXml size={19} /></a></div>
    </header>

    <main>
      <div className="workspace-heading"><div><p className="eyebrow"><span className="status-dot" />WORKSPACE <ChevronRight size={12} aria-hidden="true" /> NEW AUDIT</p><h1>Look closer. Ship better.</h1></div><span className={`connection ${connection?.configured ? 'connected' : ''}`} title={connection?.model ?? 'API connection not confirmed'}><span className="status-dot" />{connection ? connection.configured ? 'Server configured' : 'API key needed' : 'API not connected'}</span></div>

      <div className="workbench">
        <section className="input-pane" aria-labelledby="input-heading">
          <div className="section-heading"><h2 id="input-heading"><span className="section-number">01</span> Screenshot</h2><span className="mono subtle">INPUT</span></div>
          <input ref={input} id="screenshot" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} aria-label="Upload screenshot" disabled={busy} onChange={event => { selectFile(event.target.files?.[0]); event.target.value = '' }} />

          {selection ? <>
            <div className="file-bar"><FileImage size={16} aria-hidden="true" /><span className="filename" title={selection.file.name}>{selection.file.name}</span><span className="file-size">{(selection.file.size / 1024).toFixed(0)} KB</span><button className="icon-button" onClick={removeImage} disabled={busy} title="Remove screenshot" aria-label="Remove screenshot"><X size={16} /></button></div>
            <div className="preview-surface" id="screenshot-preview">
              <div className="image-bounds">
                <img src={selection.url} alt="Selected screenshot for visual audit" onLoad={event => setDimensions(`${event.currentTarget.naturalWidth} x ${event.currentTarget.naturalHeight}`)} />
                {regionsVisible && report?.findings.map((finding, index) => finding.region && <button key={index} className={`region ${finding.severity} ${activeRegion === index ? 'selected' : ''}`} style={{ left: `${finding.region.x}%`, top: `${finding.region.y}%`, width: `${finding.region.width}%`, height: `${finding.region.height}%` }} title={`Approximate region ${index + 1}: ${finding.title}`} aria-label={`Finding ${index + 1}: ${finding.title}`} onClick={() => {
                  setFilter('all'); setActiveRegion(index)
                  window.requestAnimationFrame(() => { const card = document.getElementById(`finding-${index}`); card?.scrollIntoView({ behavior: 'smooth', block: 'center' }); card?.focus({ preventScroll: true }) })
                }}><span>{index + 1}</span></button>)}
              </div>
              {loading && <div className="scan-line" aria-hidden="true" />}
            </div>
            <div className="preview-toolbar"><span className="mono">{dimensions || 'Loading preview'}</span><label className="region-toggle"><input type="checkbox" checked={regionsVisible} disabled={!report?.findings.some(finding => finding.region)} onChange={event => setRegionsVisible(event.target.checked)} /> Regions</label><button className="icon-button" title="Expand screenshot" aria-label="Expand screenshot" onClick={() => previewDialog.current?.showModal()}><Expand size={16} /></button></div>
            <button className="text-button change-image" disabled={busy} onClick={() => input.current?.click()}><ImagePlus size={15} aria-hidden="true" /> Replace screenshot</button>
          </> : <div className={`drop-zone ${dragging ? 'is-dragging' : ''}`} onDragOver={event => { event.preventDefault(); if (!busy) setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); if (event.dataTransfer.files.length !== 1) { setError('Choose exactly one screenshot.'); return }; selectFile(event.dataTransfer.files[0]) }}>
            <span className="upload-symbol"><Upload size={26} strokeWidth={1.5} aria-hidden="true" /></span><h3>A fresh perspective starts here.</h3><p>PNG, JPEG or WebP <span>/</span> Up to {maxImageMb} MB</p><button className="button secondary" disabled={busy} onClick={() => input.current?.click()}><ImagePlus size={16} aria-hidden="true" /> Choose screenshot</button>
          </div>}

          <button className="sample-button" onClick={loadSample} disabled={busy}><span className="sample-thumbnail"><img src="/sample-ui.png" alt="" /></span><span><strong>{sampleLoading ? 'Loading sample...' : 'Use sample screenshot'}</strong><span>Fictional project dashboard</span></span><ArrowRight size={17} aria-hidden="true" /></button>
          <div className="analysis-action"><button className="button primary" onClick={analyze} disabled={!selection || busy}>{loading ? <LoaderCircle className="spin" size={18} aria-hidden="true" /> : <ScanEye size={18} aria-hidden="true" />}{loading ? `Analyzing UI / ${elapsed}s` : report ? 'Analyze again' : 'Analyze UI'}{!loading && <ArrowRight size={17} aria-hidden="true" />}</button><span className="model-label"><Sparkles size={12} aria-hidden="true" /><span>{connection?.model || 'gemma-4-26b-a4b-it'}</span></span></div>
          {error && <div className="error-message" role="alert"><CircleAlert size={18} aria-hidden="true" /><div><strong>Analysis needs attention</strong><p>{error}</p></div></div>}
          <p className="privacy-note"><ShieldCheck size={15} aria-hidden="true" /><span>Sent to Google for analysis. Not stored by this server. <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noreferrer">Privacy &amp; terms</a></span></p>
        </section>

        <section className="report-pane" aria-labelledby="report-heading" aria-busy={loading}>
          <div className="section-heading"><h2 id="report-heading"><span className="section-number">02</span> Audit report</h2><span className={`report-status ${report ? 'complete' : ''}`}>{loading ? 'IN PROGRESS' : report ? 'COMPLETE' : 'AWAITING ANALYSIS'}</span></div>
          <div className="metrics" aria-label="Finding counts"><div className="metric total"><span>Total findings</span><strong>{report ? report.findings.length.toString().padStart(2, '0') : '--'}</strong></div>{severities.map(severity => <div className={`metric ${severity}`} key={severity}><span><span className="severity-dot" />{severity}</span><strong>{report ? counts[severity].toString().padStart(2, '0') : '--'}</strong></div>)}</div>
          <div className="report-actions"><div className="filters" role="group" aria-label="Filter by severity">{(['all', ...severities] as const).map(severity => <button key={severity} aria-pressed={filter === severity} onClick={() => setFilter(severity)} disabled={!report} className={filter === severity ? 'active' : ''}>{severity}</button>)}</div><div className="exports"><button className="icon-button" title="Export all findings as JSON" aria-label="Export JSON" onClick={exportJson} disabled={!report}><ArrowDownToLine size={17} /></button><button className="icon-button" title="Copy full report as Markdown" aria-label="Copy Markdown" onClick={copyMarkdown} disabled={!report}>{copyStatus === 'Markdown copied to clipboard.' ? <CheckCheck size={17} /> : <Copy size={17} />}</button></div></div>
          <div role="status" aria-live="polite" className={copyStatus ? 'copy-status' : 'sr-only'}>{copyStatus || (loading ? 'Analyzing screenshot with Gemma. This may take up to three minutes.' : report ? `Analysis complete. ${report.findings.length} potential findings.` : '')}</div>
          {report ? <>
            <section className="summary" aria-labelledby="summary-heading"><h3 id="summary-heading"><ScanSearch size={16} aria-hidden="true" />The overview</h3><p>{report.summary}</p></section>
            <div className="findings-heading"><span className="eyebrow">FINDINGS</span><span className="mono subtle">{visible.length} of {report.findings.length}</span></div>
            {visible.length ? <div className="findings-list">{visible.map(({ finding, index }) => <FindingCard key={index} finding={finding} index={index} active={activeRegion === index} onSelect={showRegion} />)}</div> : <div className="empty-findings"><Check size={25} aria-hidden="true" /><h3>{report.findings.length ? `No ${filter}-severity findings` : 'No clear issues identified'}</h3><p>{report.findings.length ? 'Other severities remain in the full report.' : 'This visual review is not a compliance assessment.'}</p></div>}
          </> : <div className={`report-empty ${loading ? 'is-analyzing' : ''}`}><div className="scan-reticle">{loading ? <LoaderCircle className="spin" size={34} strokeWidth={1.3} aria-hidden="true" /> : <ScanSearch size={34} strokeWidth={1.3} aria-hidden="true" />}</div><span className="eyebrow">{loading ? 'GEMMA IS REVIEWING' : 'VISUAL REVIEW / HUMAN PERSPECTIVE'}</span><h3>{loading ? 'Looking beyond the pixels.' : 'Room for a second opinion.'}</h3><p>{loading ? 'Examining the screenshot for visible usability concerns.' : 'No screenshot has been analyzed yet.'}</p><div className="review-scope"><span>Readability</span><span>Hierarchy</span><span>Interactions</span><span>Forms</span></div></div>}
          <p className="review-note"><CircleAlert size={13} aria-hidden="true" />AI-assisted observations, not verified WCAG violations. Human review required.</p>
        </section>
      </div>
    </main>
    <footer><span><span className="status-dot" /> BLINDSPOT UI <span className="footer-slash">/</span> BUILT TO LOOK CLOSER</span><span>Visual reasoning. Human judgment.</span></footer>
    <dialog ref={previewDialog} className="image-dialog" aria-label="Expanded screenshot"><div className="dialog-heading"><strong>Screenshot preview</strong><button className="icon-button" onClick={() => previewDialog.current?.close()} title="Close preview" aria-label="Close preview"><X size={20} /></button></div>{selection && <img src={selection.url} alt="Expanded selected screenshot" />}</dialog>
  </>
}

export default App
