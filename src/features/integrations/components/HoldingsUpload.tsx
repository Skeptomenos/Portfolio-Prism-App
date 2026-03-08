import React, { useMemo, useState } from 'react'
import { AlertCircle, CheckCircle, FileSearch, Loader2, Save } from 'lucide-react'
import { commitHoldingsUpload, pickHoldingsFile, previewHoldingsUpload } from '../../../lib/ipc'
import Modal from '../../../components/ui/Modal'
import type { HoldingsUploadPreview, ManualHoldingDraft } from '../../../types'

interface HoldingsUploadProps {
  isOpen: boolean
  onClose: () => void
  etfIsin: string
  etfTicker: string
  onSuccess?: () => void
}

const tableInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: '8px',
  border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(0,0,0,0.2)',
  color: 'white',
  fontSize: '13px',
}

const numericInputStyle: React.CSSProperties = {
  ...tableInputStyle,
  textAlign: 'right',
}

const emptyPreview = (): HoldingsUploadPreview | null => null

const cloneRows = (rows: ManualHoldingDraft[]): ManualHoldingDraft[] =>
  rows.map((row) => ({
    rowId: row.rowId,
    isin: row.isin,
    name: row.name,
    ticker: row.ticker ?? null,
    weight: row.weight,
  }))

const sumWeights = (rows: ManualHoldingDraft[]): number =>
  rows.reduce((total, row) => total + (Number.isFinite(row.weight) ? row.weight : 0), 0)

const formatWeight = (value: number): string =>
  value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const HoldingsUpload = ({
  isOpen,
  onClose,
  etfIsin,
  etfTicker,
  onSuccess,
}: HoldingsUploadProps): JSX.Element => {
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [preview, setPreview] = useState<HoldingsUploadPreview | null>(emptyPreview)
  const [draftRows, setDraftRows] = useState<ManualHoldingDraft[]>([])
  const [isPicking, setIsPicking] = useState(false)
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const totalWeight = useMemo(() => sumWeights(draftRows), [draftRows])

  const resetState = (): void => {
    setSelectedPath(null)
    setPreview(emptyPreview)
    setDraftRows([])
    setIsPicking(false)
    setIsLoadingPreview(false)
    setIsSaving(false)
    setErrorMessage(null)
    setSuccessMessage(null)
  }

  const handleClose = (): void => {
    resetState()
    onClose()
  }

  const handleSelectFile = async (): Promise<void> => {
    try {
      setIsPicking(true)
      setErrorMessage(null)
      setSuccessMessage(null)

      const filePath = await pickHoldingsFile()
      setSelectedPath(filePath)

      setIsLoadingPreview(true)
      const previewResult = await previewHoldingsUpload(filePath, etfIsin)
      setPreview(previewResult)
      setDraftRows(cloneRows(previewResult.rows))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to select holdings file'
      if (!message.includes('cancelled')) {
        setErrorMessage(message)
      }
    } finally {
      setIsPicking(false)
      setIsLoadingPreview(false)
    }
  }

  const updateRow = (
    rowIndex: number,
    field: keyof ManualHoldingDraft,
    value: string | number | null
  ): void => {
    setDraftRows((rows) =>
      rows.map((row, index) => {
        if (index !== rowIndex) {
          return row
        }

        if (field === 'weight') {
          const nextWeight = typeof value === 'number' ? value : Number(value)
          return { ...row, weight: Number.isFinite(nextWeight) ? nextWeight : 0 }
        }

        if (field === 'ticker') {
          const nextTicker = typeof value === 'string' ? value.trim() : ''
          return { ...row, ticker: nextTicker === '' ? null : nextTicker }
        }

        return { ...row, [field]: typeof value === 'string' ? value : '' }
      })
    )
  }

  const validateDraftRows = (): string | null => {
    if (draftRows.length === 0) {
      return 'No holdings are available to save.'
    }

    const invalidRow = draftRows.find(
      (row) =>
        row.isin.trim() === '' ||
        row.name.trim() === '' ||
        !Number.isFinite(row.weight) ||
        row.weight <= 0
    )

    if (invalidRow) {
      return 'Every holding must include ISIN, name, and a positive weight before saving.'
    }

    return null
  }

  const handleSave = async (): Promise<void> => {
    const validationError = validateDraftRows()
    if (validationError) {
      setErrorMessage(validationError)
      return
    }

    try {
      setIsSaving(true)
      setErrorMessage(null)

      const result = await commitHoldingsUpload(etfIsin, draftRows)
      setSuccessMessage(
        `Saved ${result.holdingsCount} holdings (${formatWeight(result.totalWeight)}%). Re-run analysis when you are ready.`
      )
      onSuccess?.()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save holdings')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={`Review Holdings for ${etfTicker}`}>
      <div className="p-6">
        <div className="mb-5 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
            <FileSearch className="h-4 w-4 text-blue-400" />
            Review-first import
          </div>
          <p className="text-sm text-gray-400">
            This desktop-only flow opens a native file picker, parses the file locally, and shows
            the normalized rows before anything is saved. Supported formats: CSV, XLSX, JSON, PDF.
          </p>
        </div>

        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-4">
          <div>
            <div className="text-sm font-medium text-white">
              {selectedPath ?? 'No file selected yet'}
            </div>
            <div className="text-xs text-gray-500">ETF ISIN: {etfIsin}</div>
          </div>
          <button
            type="button"
            onClick={() => void handleSelectFile()}
            disabled={isPicking || isLoadingPreview || isSaving}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-400"
          >
            {(isPicking || isLoadingPreview) && <Loader2 className="h-4 w-4 animate-spin" />}
            {preview ? 'Replace File' : 'Choose File'}
          </button>
        </div>

        {errorMessage && (
          <div className="mb-4 flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
            <p className="text-sm text-red-200">{errorMessage}</p>
          </div>
        )}

        {successMessage && (
          <div className="mb-4 flex items-start gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
            <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
            <p className="text-sm text-emerald-200">{successMessage}</p>
          </div>
        )}

        {preview && (
          <>
            <div className="mb-4 grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="text-xs uppercase tracking-wide text-gray-500">Rows</div>
                <div className="mt-1 text-lg font-semibold text-white">{draftRows.length}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="text-xs uppercase tracking-wide text-gray-500">Total Weight</div>
                <div className="mt-1 text-lg font-semibold text-white">
                  {formatWeight(totalWeight)}%
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="text-xs uppercase tracking-wide text-gray-500">Source</div>
                <div className="mt-1 text-sm font-semibold text-white">{preview.fileName}</div>
              </div>
            </div>

            {preview.warnings.length > 0 && (
              <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                <div className="mb-2 text-sm font-semibold text-amber-300">Review notes</div>
                <ul className="list-disc space-y-1 pl-5 text-sm text-amber-100">
                  {preview.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="max-h-[360px] overflow-auto rounded-xl border border-white/10">
              <table className="min-w-full border-collapse">
                <thead className="sticky top-0 bg-[#111827]">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                      ISIN
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Name
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Ticker
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Weight %
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {draftRows.map((row, index) => (
                    <tr
                      key={row.rowId ?? `${row.isin}-${index}`}
                      className="border-t border-white/5"
                    >
                      <td className="px-3 py-3 align-top">
                        <input
                          value={row.isin}
                          onChange={(event) => updateRow(index, 'isin', event.target.value)}
                          style={tableInputStyle}
                        />
                      </td>
                      <td className="px-3 py-3 align-top">
                        <input
                          value={row.name}
                          onChange={(event) => updateRow(index, 'name', event.target.value)}
                          style={tableInputStyle}
                        />
                      </td>
                      <td className="px-3 py-3 align-top">
                        <input
                          value={row.ticker ?? ''}
                          onChange={(event) => updateRow(index, 'ticker', event.target.value)}
                          style={tableInputStyle}
                        />
                      </td>
                      <td className="px-3 py-3 align-top">
                        <input
                          type="number"
                          step="0.0001"
                          value={row.weight}
                          onChange={(event) =>
                            updateRow(index, 'weight', Number(event.target.value))
                          }
                          style={numericInputStyle}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-gray-400 transition-colors hover:text-white"
          >
            Close
          </button>

          <button
            onClick={() => void handleSave()}
            disabled={!preview || isSaving || isLoadingPreview || isPicking}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition-all hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-400"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isSaving ? 'Saving...' : 'Save Reviewed Holdings'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default HoldingsUpload
