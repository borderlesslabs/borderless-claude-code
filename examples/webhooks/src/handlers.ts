// src/handlers.ts
// Event-type routing. Handlers receive verified, deduped events.
// Replace the stub bodies with your business logic.

type BorderlessEvent = {
  id: string;
  event_type: string;
  operation_type?: string;
  data?: Record<string, unknown>;
};

export async function routeEvent(event: BorderlessEvent): Promise<void> {
  switch (event.event_type) {
    case 'Transaction_Created':
    case 'Transaction_Updated':
      await handleTransactionEvent(event);
      return;

    case 'IdentityComplianceCheck_Updated':
    case 'IdentityComplianceCheck_Completed':
      await handleComplianceEvent(event);
      return;

    case 'VirtualAccount_Created':
    case 'VirtualAccount_CreationFailed':
      await handleVirtualAccountEvent(event);
      return;

    default:
      // Unknown event type — ack but don't process. Worth logging so you
      // notice when Borderless adds a new event type you haven't handled.
      console.warn(
        JSON.stringify({ msg: 'unknown event_type', id: event.id, event_type: event.event_type }),
      );
  }
}

async function handleTransactionEvent(event: BorderlessEvent): Promise<void> {
  // Branch on operation_type for Deposit / Withdrawal / Transfer / etc.
  // Typical actions: update your internal ledger, notify the end user,
  // mark an invoice paid, trigger downstream fulfillment.
  console.log(
    JSON.stringify({
      msg: 'transaction event',
      id: event.id,
      event_type: event.event_type,
      operation_type: event.operation_type,
    }),
  );
}

async function handleComplianceEvent(event: BorderlessEvent): Promise<void> {
  // Typical actions: flip the identity's compliance state in your DB,
  // unblock downstream flows (account creation, first transaction),
  // notify the end user if rejected or RFI'd.
  console.log(
    JSON.stringify({ msg: 'compliance event', id: event.id, event_type: event.event_type }),
  );
}

async function handleVirtualAccountEvent(event: BorderlessEvent): Promise<void> {
  // Typical actions: persist the virtual account details against the
  // identity, notify the end user the account is ready (or failed).
  console.log(
    JSON.stringify({
      msg: 'virtual account event',
      id: event.id,
      event_type: event.event_type,
    }),
  );
}
