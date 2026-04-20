import { FleetMap } from '@/components/FleetMap';
import { CartSidebar } from '@/components/CartSidebar';
import { AlertCenter } from '@/components/AlertCenter';
import { AlertToasts } from '@/components/AlertToasts';

export default function Dashboard() {
  return (
    <div className="flex flex-col h-[calc(100vh-56px)]">
      {/* Map area */}
      <div className="relative flex-1 min-h-0">
        <FleetMap />
        <CartSidebar />
      </div>

      {/* Alert Center */}
      <AlertCenter />

      {/* Toast stack */}
      <AlertToasts />
    </div>
  );
}
