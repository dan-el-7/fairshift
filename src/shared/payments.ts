/** An employer's append-only record of a payment for a calculated pay period. Amounts are paise. */
export interface PaymentRecord {
  id: string;
  period: string;
  amount: number;
  recordedAt: string;
  /** Employer-declared payment date, distinct from the time the record was entered. */
  paidOn?: string;
  recordedBy?: string;
  reference?: string;
  note?: string;
}

/** Worker responses are separate append-only events tied to an exact payment record. */
export interface PaymentConfirmation {
  id: string;
  recordId: string;
  decision: 'received' | 'not_received' | 'different_amount';
  receivedAmount?: number;
  reason?: string;
  confirmedAt: string;
}

export interface PaymentLedger {
  workerId: string;
  siteId: string;
  version: number;
  records: PaymentRecord[];
  confirmations: PaymentConfirmation[];
}

export interface PaymentSummary {
  period: string;
  expected: number;
  recorded: number;
  outstanding: number;
  overpaid: number;
  hasRecordedPayment: boolean;
  ledgerVersion: number;
  records: (PaymentRecord & { confirmation?: PaymentConfirmation })[];
}
