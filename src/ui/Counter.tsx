import { Icon } from "./icons";

/** A whole number with a button on each side to lower or raise it. */
export function Counter(props: { label: string; value: number; range: { min: number; max: number }; onChange(value: number): void }) {
  const { label, value, range } = props;
  return (
    <span className="step" role="group" aria-label={label}>
      <button aria-label={`Lower ${label.toLowerCase()}`} disabled={value <= range.min} onClick={() => props.onChange(value - 1)}>
        <Icon name="minus" />
      </button>
      <output className="mono">{value}</output>
      <button aria-label={`Raise ${label.toLowerCase()}`} disabled={value >= range.max} onClick={() => props.onChange(value + 1)}>
        <Icon name="plus" />
      </button>
    </span>
  );
}
