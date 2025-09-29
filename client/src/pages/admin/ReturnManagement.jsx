import React, { useState, useEffect } from 'react';

export default function ReturnManagement() {
  const [returnRequests, setReturnRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReturnRequests();
  }, []);

  const fetchReturnRequests = async () => { 
    try {
      const response = await fetch('https://bookstorebd.onrender.com/return/requests', {
        credentials: 'include', // Add this to include cookies
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Fetched return requests:', data); // Debug log
      setReturnRequests(data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching return requests:', error);
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (requestId, status) => {
    try {
      const response = await fetch(`https://bookstorebd.onrender.com/return/requests/${requestId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update status');
      }

      const updatedRequest = await response.json();
      setReturnRequests(prevRequests =>
        prevRequests.map(req =>
          req._id === requestId ? updatedRequest : req
        )
      );
      
      alert(`Return request ${status} successfully`);
    } catch (error) {
      console.error('Error updating return request:', error);
      alert(error.message || 'Failed to update return request');
    }
  };

  return (
    <div className="admin-panel p-4">
      <h2 className="text-2xl font-bold mb-4">Return Request Management</h2>

      {loading ? (
        <p>Loading...</p>
      ) : returnRequests.length === 0 ? (
        <p>No return requests found</p>
      ) : (
        <div className="overflow-x-auto tp-9">
          <table className="min-w-full bg-white border border-gray-300">
            <thead>
              <tr>
                <th className="p-2">Book Title</th>
                <th className="p-2">Buyer</th>
                <th className="p-2">Seller</th>
                <th className="p-2">Description</th>
                <th className="p-2">Images</th>
                <th className="p-2">Status</th>
                <th className="p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {returnRequests.map((request) => (
                <tr key={request._id} className="border-b hover:bg-gray-50">
                  <td className="p-2">{request.bookTitle || 'N/A'}</td>
                  <td className="p-2">{request.userEmail || 'N/A'}</td>
                  <td className="p-2">{request.sellerEmail || 'N/A'}</td>
                  <td className="p-2">{request.defectDescription || 'N/A'}</td>
                  <td className="p-2">
                    {request.images && request.images.length > 0 ? (
                      <button className="bg-blue-500 text-white px-2 py-1 rounded">
                        View Images
                      </button>
                    ) : (
                      'No images'
                    )}
                  </td>
                  <td className="p-2">{request.status || 'pending'}</td>
                  <td className="p-2">
                    {request.status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleStatusUpdate(request._id, 'approved')}
                          className="bg-green-500 text-white px-2 py-1 rounded mr-2"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleStatusUpdate(request._id, 'rejected')}
                          className="bg-red-500 text-white px-2 py-1 rounded"
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
