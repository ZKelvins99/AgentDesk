import { useEffect } from 'react';
import { useUiStore } from '../stores/ui-store';

/** Subscribe event:approval (README 8.7.3): push pending approvals into ui-store. */
export function useApprovalEvents(): void {
  useEffect(() => {
    return window.agentdesk.onApprovalEvent((req) => {
      useUiStore.getState().pushApproval(req);
    });
  }, []);
}
