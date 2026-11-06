import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Empty } from '../components/ui';

export default function NotFound() {
  return (
    <div className="card">
      <Empty icon={Compass} title="Page not found">
        <p>This page does not exist in the IT Hub.</p>
        <Link className="btn" to="/hub">
          Back to dashboard
        </Link>
      </Empty>
    </div>
  );
}
