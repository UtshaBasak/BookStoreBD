import React, { useState, useEffect } from 'react';
import Table from '../components/Table';

export default function TransactionHistory() {
  const [transactions, setTransactions] = useState([]);

  // Fetch transaction history
  useEffect(() => {
    fetch('/api/transactions')
      .then((res) => res.json())
      .then((data) => setTransactions(data))
      .catch((err) => console.error(err));
  }, []);

  return (
    <div>
      <h2>Transaction History</h2>
      <Table data={transactions} />
    </div>
  );
}

