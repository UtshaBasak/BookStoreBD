import { useNavigate } from 'react-router-dom';
import { FaBell, FaCheck } from 'react-icons/fa';

import { useBookRequest, useToggleBookRequest } from '../hooks/queries.js';
import { useToast } from '../hooks/useToast.js';
import { getUserEmail } from '../utils/auth.js';
import { messageOf } from '../utils/apiError.js';

/**
 * "Tell me when it is back", for a sold-out book: the seller hears somebody is
 * waiting, and the person asking hears when copies are added. Pressed again,
 * it withdraws the request.
 */
export default function RequestBookButton({
  bookId,
  sellerEmail,
  className = 'btn btn-ghost',
}: {
  bookId: string;
  sellerEmail?: string | null;
  className?: string;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const email = getUserEmail();
  const own = Boolean(email) && email === sellerEmail;
  const { data: status } = useBookRequest(bookId, Boolean(email) && !own);
  const { mutate, isPending } = useToggleBookRequest(bookId);

  if (own) return null;
  const requested = Boolean(status?.requested);

  return (
    <button
      type="button"
      className={`${className}${requested ? ' is-requested' : ''}`}
      aria-pressed={requested}
      disabled={isPending}
      onClick={() => {
        if (!email) {
          toast.info('Sign in to ask for this book.', { action: { label: 'Sign in', onClick: () => navigate('/sign-in') } });
          return;
        }
        mutate(requested, {
          onSuccess: (next) =>
            toast.success(
              next.requested
                ? "We've told the seller. You'll get a notification when it's back."
                : 'Request withdrawn.'
            ),
          onError: (error) => toast.error(messageOf(error) || 'Could not send the request.'),
        });
      }}
      title={requested ? 'Withdraw your request' : 'Ask the seller to restock it'}
    >
      {requested ? <FaCheck aria-hidden="true" /> : <FaBell aria-hidden="true" />}
      {requested ? 'Requested - we will tell you' : 'Notify me when it is back'}
    </button>
  );
}
