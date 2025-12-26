# Feature Plan: Feedback UI Improvements

> **Status:** Draft
> **Owner:** Frontend Workstream
> **Related Strategy:** `keystone/strategy/ui-ux-strategy.md`

## 1. Problem Statement
The current "Send Feedback" dialog is implemented inside the `Sidebar` component. This causes two critical issues:
1.  **Layout Clipping:** The dialog is constrained by the Sidebar's width (240px) and stacking context, making it squeezed and visually broken.
2.  **Missing Context:** The feedback report does not know which view the user is currently looking at (e.g., "Dashboard" vs "Holdings"), making debugging harder.

## 2. Proposed Solution

### 2.1 Architecture Refactor (Lift State Up)
We will move the feedback visibility state from local component state (`Sidebar.tsx`) to the global Zustand store (`useAppStore.ts`).

**New Store Slice:**
```typescript
interface AppState {
  isFeedbackOpen: boolean;
}
interface AppActions {
  openFeedback: () => void;
  closeFeedback: () => void;
}
```

### 2.2 Component Relocation (Global Modal)
We will move `<FeedbackDialog />` from `Sidebar.tsx` to `App.tsx`.
- **Old Location:** Inside Sidebar (clipped).
- **New Location:** Child of `App`, sibling to `Sidebar` and `Main`.
- **Benefit:** It will overlay the entire application window with a proper backdrop, following the "Apple-inspired minimalism" strategy.

### 2.3 Context Injection
We will update `FeedbackDialog.tsx` to read `currentView` from the store.
- **Payload Update:** Add `view: currentView` to the `metadata` object sent to the backend.
- **Benefit:** Automated context for every bug report.

## 3. Implementation Tasks

- [ ] **TASK-704.1:** Add `isFeedbackOpen`, `openFeedback`, `closeFeedback` to `useAppStore.ts`.
- [ ] **TASK-704.2:** Remove local state and `<FeedbackDialog />` from `Sidebar.tsx`. Update button to call `openFeedback()`.
- [ ] **TASK-704.3:** Add `<FeedbackDialog />` to `App.tsx` connected to the global store.
- [ ] **TASK-704.4:** Update `FeedbackDialog.tsx` to inject `currentView` into the feedback payload.
- [ ] **TASK-704.5:** Verify layout and network request payload.

## 4. Review
- [ ] Verify z-index handling ensures the modal is above all other content.
- [ ] Ensure the "Send" button provides visual feedback (loading/success state).
