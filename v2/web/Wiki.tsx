import React from 'react'
import { wikiPages, wikiPageUrl } from '../wiki-pages'

export function Wiki({ pageId, section }: { pageId: string | null; section: string | null }) {
  const page = wikiPages.find((item) => item.id === (pageId ?? wikiPages[0].id))
  if (!page) return <section className="panel"><h2>Guide not found</h2><a href="#/wiki">Back to Wiki</a></section>
  const selectedSection = page.sections.find((item) => item.id === section)?.id ?? ''
  const url = wikiPageUrl(page.id) + (selectedSection ? `#${selectedSection}` : '')
  return (
    <section className="wiki" aria-label="Project wiki">
      <div className="wiki-heading">
        <div>
          <h2>{page.title}</h2>
          <p>{page.description}</p>
        </div>
        <a href={url} target="_blank" rel="noreferrer">Open full page ↗</a>
      </div>
      <p className="wiki-context">Documentation snapshot · Live portfolio progress is in <a href="#/development">Development</a>.</p>
      <nav className="wiki-sections" aria-label="Wiki sections">
        <a href={`#/wiki?page=${page.id}`} aria-current={!selectedSection ? 'location' : undefined}>Overview</a>
        {page.sections.map((item) => <a key={item.id}
          href={`#/wiki?page=${page.id}&section=${item.id}`}
          aria-current={selectedSection === item.id ? 'location' : undefined}>{item.label}</a>)}
      </nav>
      <iframe key={url} className="wiki-document" title={`${page.title} — interactive guide`} src={url}
        sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-modals" />
    </section>
  )
}
