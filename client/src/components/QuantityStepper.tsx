import { FaMinus, FaPlus } from 'react-icons/fa';

import './QuantityStepper.css';

/**
 * Minus, the number, plus. Held between one and what is in stock, so a buyer
 * cannot ask for a copy that is not there; the server checks it again.
 */
export default function QuantityStepper({
  value,
  max,
  onChange,
  disabled = false,
  label = 'Quantity',
}: {
  value: number;
  max: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  label?: string;
}) {
  const top = Math.max(1, max);
  return (
    <div className="qty" role="group" aria-label={label}>
      <button
        type="button"
        className="qty-btn"
        onClick={() => onChange(Math.max(1, value - 1))}
        disabled={disabled || value <= 1}
        aria-label="Decrease quantity"
      >
        <FaMinus />
      </button>
      <output className="qty-num" aria-live="polite">
        {value}
      </output>
      <button
        type="button"
        className="qty-btn"
        onClick={() => onChange(Math.min(top, value + 1))}
        disabled={disabled || value >= top}
        aria-label="Increase quantity"
      >
        <FaPlus />
      </button>
    </div>
  );
}
