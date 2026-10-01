import { useEffect, useState } from 'react';

/**
 * A value that settles.
 *
 * Every filter on the browse page is a request. Without this, typing "1500"
 * into a price box makes four requests, three of them for prices not meant:
 * 1, 15 and 150.
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
