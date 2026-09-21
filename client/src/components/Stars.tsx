import { FaRegStar, FaStar, FaStarHalfAlt } from 'react-icons/fa';

interface StarsProps {
  /** 0 to 5. Halves are shown, because 4.3 is not 4 and is not 5. */
  value: number;
  size?: number;
  className?: string;
}

/** Five stars, filled to a score. Read-only. */
export function Stars({ value, size = 16, className = '' }: StarsProps) {
  const rounded = Math.round(value * 2) / 2;

  return (
    <span
      className={`inline-flex items-center gap-[2px] ${className}`}
      style={{ color: '#f5a623', fontSize: size }}
      // One label for the group rather than five unlabelled icons, so a screen
      // reader says "rated 4.3 out of 5" instead of "star star star".
      role="img"
      aria-label={`Rated ${value} out of 5`}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        if (rounded >= star) return <FaStar key={star} aria-hidden="true" />;
        if (rounded >= star - 0.5) return <FaStarHalfAlt key={star} aria-hidden="true" />;
        return <FaRegStar key={star} aria-hidden="true" />;
      })}
    </span>
  );
}

interface StarInputProps {
  value: number;
  onChange: (rating: number) => void;
  disabled?: boolean;
}

/**
 * Five stars to choose from.
 *
 * Real buttons rather than clickable spans: a keyboard reaches them, Enter
 * works, and each one says what it means out loud.
 */
export function StarInput({ value, onChange, disabled = false }: StarInputProps) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Your rating">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={disabled}
          onClick={() => onChange(star)}
          aria-label={`${star} ${star === 1 ? 'star' : 'stars'}`}
          aria-pressed={value === star}
          className="icon-button"
          style={{ color: star <= value ? '#f5a623' : '#c8bdb8', fontSize: 26 }}
        >
          {star <= value ? <FaStar /> : <FaRegStar />}
        </button>
      ))}
    </div>
  );
}

export default Stars;
