import { AcademicCategory, ContactStatus, ReviewStatus, SupportProgress } from '@workspace/api-client-react';
import { dayLabel, followState } from '@/lib/format';

const catClass = (c: string) =>
  c === AcademicCategory.High_Priority ? 'urgent' : c === AcademicCategory.Review_Recommended ? 'review' : c === AcademicCategory.Insufficient_Evidence ? 'limited' : 'clear';

export const categoryTone = catClass;

export function CategoryBadge({ category }: { category: string }) {
  return (
    <span className={`category-pill ${catClass(category)}`}>
      <i aria-hidden="true" />
      {category}
    </span>
  );
}

export function ReviewBadge({ status }: { status: string }) {
  const tone = status === ReviewStatus.Reviewed ? 'b-teal' : status === ReviewStatus.In_review ? 'b-blue' : 'b-grey';
  return <span className={`badge ${tone}`}>{status}</span>;
}

export function ContactBadge({ status }: { status: string }) {
  const tone =
    status === ContactStatus.Response_received ? 'b-teal' : status === ContactStatus.Awaiting_response ? 'b-purple' : status === ContactStatus.No_response_recorded ? 'b-amber' : 'b-grey';
  return <span className={`badge ${tone}`}>{status}</span>;
}

export function ProgressBadge({ progress }: { progress: string }) {
  const tone = progress === SupportProgress.Completed ? 'b-teal' : progress === SupportProgress.In_progress ? 'b-blue' : progress === SupportProgress.Cancelled ? 'b-slate' : 'b-grey';
  return <span className={`badge ${tone}`}>{progress}</span>;
}

export function FollowUpBadge({ date, today }: { date: string; today: string }) {
  const s = followState(date, today);
  const tone = s === 'overdue' ? 'b-red' : s === 'today' ? 'b-amber' : 'b-grey';
  const word = s === 'overdue' ? 'Overdue' : s === 'today' ? 'Due today' : 'Scheduled';
  return (
    <span className={`badge ${tone}`}>
      {word} · {dayLabel(date)}
    </span>
  );
}
