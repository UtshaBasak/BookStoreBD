import type { ReactNode } from 'react';

import './Table.css'; // Import the CSS file for table styling

/** Any record with an id, rendered column-per-key. */
interface TableRow {
  _id: string;
  [column: string]: ReactNode;
}

interface TableProps {
  data: TableRow[];
  onDelete?: (id: string) => void;
}

export default function Table({ data, onDelete }: TableProps) {
  return (
    <table className="styled-table">
      <thead>
        <tr>
          {Object.keys(data[0] || {}).map((key) => (
            <th key={key}>{key}</th>
          ))}
          {onDelete && <th>Actions</th>}
        </tr>
      </thead>
      <tbody>
        {data.map((item) => (
          <tr key={item._id}>
            {Object.values(item).map((value, index) => (
              <td key={index}>{value}</td>
            ))}
            {onDelete && (
              <td>
                <button onClick={() => onDelete(item._id)}>Delete</button>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
