import { AlertSeverity } from '@/generated/prisma/client'
import { cn } from '@/lib/format'

const styles: Record<AlertSeverity, string> = {
  INFO: 'bg-sky-100 text-sky-700',
  WARNING: 'bg-amber-100 text-amber-700',
  CRITICAL: 'bg-rose-100 text-rose-700',
}

export function AlertBadge({ severity }: { severity: AlertSeverity }) {
  return <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', styles[severity])}>{severity}</span>
}
