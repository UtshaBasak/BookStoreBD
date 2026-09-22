import { useEffect, useState } from 'react';

/**
 * A value that settles.
 *
 * The price boxes on the browse page are typed into, and every filter is now a
 * request. Without this, "1500" is four requests and three of them are for
 * prices nobody meant - 1, 15 and 150.
 */
export const useDebounced = <T,>(value: T, delay = 350): T => {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return settled;
};

export default useDebounced;
