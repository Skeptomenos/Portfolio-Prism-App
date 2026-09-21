// Public, reviewed documents only. Keep content in its canonical file.
export const wikiPages = [
  {
    id: 'architecture',
    title: 'Application, pipeline & plugins',
    description: 'How Prism works, where extensions fit, and what remains incomplete.',
    source: 'docs/architecture-map.html',
    sections: [
      { id: 'application', label: 'Application' },
      { id: 'pipeline', label: 'Data pipeline' },
      { id: 'plugins', label: 'Plugins' },
      { id: 'gaps', label: 'Remaining gaps' },
      { id: 'references', label: 'Sources' },
    ],
  },
] as const

export const wikiPageUrl = (id: string) => `/wiki-assets/${id}.html`
