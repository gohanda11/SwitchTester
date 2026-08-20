import { FEEL_LABELS, FORM_LABELS, type SwitchFeel, type SwitchForm } from '../types'

export function FormBadge({ form }: { form: SwitchForm }) {
  return <span className={`badge badge-form badge-${form}`}>{FORM_LABELS[form]}</span>
}

export function FeelBadge({ feel }: { feel: SwitchFeel }) {
  return <span className={`badge badge-feel badge-${feel}`}>{FEEL_LABELS[feel]}</span>
}
