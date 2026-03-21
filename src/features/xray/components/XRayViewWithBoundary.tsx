import XRayView from './XRayView'
import { XRayErrorBoundary } from './XRayErrorBoundary'

export default function XRayViewWithBoundary(): JSX.Element {
  return (
    <XRayErrorBoundary>
      <XRayView />
    </XRayErrorBoundary>
  )
}
