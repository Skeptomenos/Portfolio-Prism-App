import React from 'react'

interface SkeletonProps {
  className?: string
  variant?: 'text' | 'circular' | 'rectangular'
  width?: string | number
  height?: string | number
}

export function Skeleton({
  className = '',
  variant = 'rectangular',
  width,
  height,
}: SkeletonProps) {
  const baseClasses = 'animate-pulse bg-white/5'

  const variantClasses = {
    text: 'rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-lg',
  }

  const style: React.CSSProperties = {}
  if (width) style.width = typeof width === 'number' ? `${width}px` : width
  if (height) style.height = typeof height === 'number' ? `${height}px` : height

  return <div className={`${baseClasses} ${variantClasses[variant]} ${className}`} style={style} />
}

export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`rounded-2xl bg-white/[0.03] border border-white/[0.08] p-6 ${className}`}>
      <Skeleton height={20} width="40%" className="mb-4" />
      <Skeleton height={40} width="60%" className="mb-2" />
      <Skeleton height={16} width="30%" />
    </div>
  )
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      <div className="flex gap-4 pb-3 border-b border-white/10">
        <Skeleton height={16} width="20%" />
        <Skeleton height={16} width="15%" />
        <Skeleton height={16} width="25%" />
        <Skeleton height={16} width="15%" />
        <Skeleton height={16} width="15%" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 py-2">
          <Skeleton height={20} width="20%" />
          <Skeleton height={20} width="15%" />
          <Skeleton height={20} width="25%" />
          <Skeleton height={20} width="15%" />
          <Skeleton height={20} width="15%" />
        </div>
      ))}
    </div>
  )
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton height={32} width={200} className="mb-6" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <div className="rounded-2xl bg-white/[0.03] border border-white/[0.08] p-6">
          <Skeleton height={24} width="30%" className="mb-4" />
          <Skeleton height={200} className="rounded-lg" />
        </div>
        <div className="rounded-2xl bg-white/[0.03] border border-white/[0.08] p-6">
          <Skeleton height={24} width="30%" className="mb-4" />
          <Skeleton height={200} className="rounded-lg" />
        </div>
      </div>
    </div>
  )
}

export function HoldingsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <Skeleton height={32} width={200} />
        <Skeleton height={40} width={120} />
      </div>
      <SkeletonTable rows={8} />
    </div>
  )
}

export function XRaySkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton height={32} width={250} className="mb-6" />
      <div className="flex gap-2 mb-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} height={40} width={80} className="rounded-full" />
        ))}
      </div>
      <SkeletonTable rows={6} />
    </div>
  )
}
