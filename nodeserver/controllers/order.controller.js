// Save order(s)
for (const item of items) {
  const { bookId, quantity } = item;
  if (!bookId || !quantity || quantity < 1) continue;
  const book = await AddBook.findById(bookId);
  if (!book) continue;
  await Order.create({
    buyerEmail: email,
    sellerEmail: book.sellerEmail,
    bookId: book._id,
    title: book.title,
    author: book.author,
    category: book.category,
    bookType: book.bookType,
    condition: book.condition,
    pages: book.pages,
    price: book.price,
    quantity,
    orderNumber, // save the same orderNumber for all books in this order
    shippingCharge: typeof shippingCharge === 'number' ? shippingCharge : 0,
    discount: typeof discount === 'number' ? discount : 0,
    promo: promo || '',
    promoApplied: !!promoApplied,
    status: 'Order Confirmed',
    createdAt: new Date(),
  });
  await AddBook.updateOne(
    { _id: bookId, stock: { $gte: quantity } },
    { $inc: { stock: -quantity } }
  );
}
res.status(200).json({ message: 'Stock updated & order saved' });