import { useNavigate } from 'react-router-dom';
import { FaBell, FaCheck } from 'react-icons/fa';

import { useBookRequest, useToggleBookRequest } from '../hooks/queries.js';
import { useToast } from '../hooks/useToast.js';
import { getUserEmail } from '../utils/auth.js';
import { messageOf } from '../utils/apiError.js';
import { t } from '../utils/language.js';

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
          toast.info(t('Sign in to ask for this book.', 'বইটি চাইতে সাইন ইন করুন।'), {
            action: { label: t('Sign in', 'সাইন ইন'), onClick: () => navigate('/sign-in') },
          });
          return;
        }
        mutate(requested, {
          onSuccess: (next) =>
            toast.success(
              next.requested
                ? t(
                    "We've told the seller. You'll get a notification when it's back.",
                    'বিক্রেতাকে জানানো হয়েছে। বইটি আবার এলে আপনি নোটিফিকেশন পাবেন।'
                  )
                : t('Request withdrawn.', 'অনুরোধ তুলে নেওয়া হয়েছে।')
            ),
          onError: (error) => toast.error(messageOf(error) || t('Could not send the request.', 'অনুরোধ পাঠানো যায়নি।')),
        });
      }}
      title={
        requested
          ? t('Withdraw your request', 'আপনার অনুরোধ তুলে নিন')
          : t('Ask the seller to restock it', 'বিক্রেতাকে বইটি আবার আনতে বলুন')
      }
    >
      {requested ? <FaCheck aria-hidden="true" /> : <FaBell aria-hidden="true" />}
      {requested
        ? t('Requested - we will tell you', 'অনুরোধ করা হয়েছে - আমরা জানাব')
        : t('Notify me when it is back', 'আবার এলে আমাকে জানান')}
    </button>
  );
}
