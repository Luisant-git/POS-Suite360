import { formatMalaysiaDate } from '../../utils/date';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import api from '../../services/api';
import { useSettings } from '../../contexts/SettingsContext';

interface Props {
  purchaseId: number;
  onClose: () => void;
}

export default function ViewPurchaseModal({ purchaseId, onClose }: Props) {
  const { formatCurrency } = useSettings();
  const { data: purchase, isLoading } = useQuery({
    queryKey: ['purchase', purchaseId],
    queryFn: async () => (await api.get(`/purchases/${purchaseId}`)).data
  });

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-white p-6 rounded-md shadow-lg font-bold text-[#1E3A8A]">Loading invoice details...</div>
      </div>
    );
  }

  if (!purchase) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4">
      <div className="bg-white w-full max-w-3xl rounded-md shadow-lg overflow-hidden flex flex-col max-h-[95vh] sm:max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-[#3B82F6] text-white px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between shrink-0">
          <h2 className="font-bold text-[13px] sm:text-[15px] truncate pr-2">Purchase Invoice - {purchase.invoiceNo}</h2>
          <button onClick={onClose} className="hover:bg-blue-600 p-1 rounded transition-colors shrink-0"><X size={18} /></button>
        </div>
        
        <div className="p-3 sm:p-5 overflow-y-auto">
          {/* Supplier & Invoice Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4 sm:mb-6">
            <div>
              <p className="text-[11px] text-black font-bold uppercase tracking-wider mb-1">Supplier Info</p>
              <p className="font-bold text-[#1E3A8A] text-[14px] sm:text-[15px]">{purchase.supplier?.name}</p>
              {purchase.supplier?.phone && <p className="text-[12px] sm:text-[13px] text-black font-bold">{purchase.supplier.phone}</p>}
              {purchase.supplier?.email && <p className="text-[12px] sm:text-[13px] text-black font-bold">{purchase.supplier.email}</p>}
              {purchase.supplier?.address && <p className="text-[12px] sm:text-[13px] text-black font-bold mt-1 whitespace-pre-wrap">{purchase.supplier.address}</p>}
            </div>
            <div className="sm:text-right">
              <p className="text-[11px] text-black font-bold uppercase tracking-wider mb-1">Invoice Info</p>
              <p className="font-bold text-[#333] text-[13px] sm:text-[14px]">Date: <span className="font-normal">{formatMalaysiaDate(purchase.date)}</span></p>
              {purchase.supplierInvoiceNo && (
                <p className="font-bold text-[#333] text-[13px] sm:text-[14px] mt-1">Supp. Inv. No: <span className="font-normal">{purchase.supplierInvoiceNo}</span></p>
              )}
              <p className="text-[11px] text-black font-bold uppercase tracking-wider mt-3 mb-1">Payment</p>
              <p className="font-bold text-[#10B981] text-[13px] sm:text-[14px] bg-[#D1FAE5] inline-block px-2 py-0.5 rounded">{purchase.paymentMode?.name}</p>
            </div>
          </div>
          
          {/* Items Table */}
          <div className="overflow-x-auto rounded border border-gray-200 mb-4 sm:mb-6">
            <table className="w-full text-left text-[12px] sm:text-[13px] whitespace-nowrap">
              <thead className="bg-[#F3F4F6] text-black font-bold">
                <tr>
                  <th className="px-2 sm:px-3 py-2 sm:py-2.5 border border-gray-300">#</th>
                  <th className="px-2 sm:px-3 py-2 sm:py-2.5 border border-gray-300">Product</th>
                  <th className="px-2 sm:px-3 py-2 sm:py-2.5 border border-gray-300 text-center">Birds</th>
                  <th className="px-2 sm:px-3 py-2 sm:py-2.5 border border-gray-300 text-right">Qty</th>
                  <th className="px-2 sm:px-3 py-2 sm:py-2.5 border border-gray-300 text-center">Units</th>
                  <th className="px-2 sm:px-3 py-2 sm:py-2.5 border border-gray-300 text-right">Rate</th>
                  <th className="px-2 sm:px-3 py-2 sm:py-2.5 border border-gray-300 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {purchase.items?.map((item: any, i: number) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-2 sm:px-3 py-2 border border-gray-300">{i + 1}</td>
                    <td className="px-2 sm:px-3 py-2 border border-gray-300 font-bold text-black">
                      {item.product?.name}
                      <span className="block text-[11px] text-black font-normal">Code: {item.product?.code}</span>
                    </td>
                    <td className="px-2 sm:px-3 py-2 border border-gray-300 text-center font-bold text-black">{item.noOfBirds === 0 ? '0' : (item.noOfBirds || '0')}</td>
                    <td className="px-2 sm:px-3 py-2 border border-gray-300 text-right font-bold text-[#3B82F6]">{Number(Number(item.quantity).toFixed(4))}</td>
                    <td className="px-2 sm:px-3 py-2 border border-gray-300 text-center font-bold text-black">{item.product?.unit?.shortCode || item.product?.unit?.name || 'Nos'}</td>
                    <td className="px-2 sm:px-3 py-2 border border-gray-300 text-right">{formatCurrency(item.rate)}</td>
                    <td className="px-2 sm:px-3 py-2 border border-gray-300 text-right font-bold">{formatCurrency(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Summary */}
          <div className="flex justify-end">
            <div className="w-full sm:w-72 bg-[#F9FAFB] p-3 sm:p-4 rounded border border-gray-200">
              <div className="flex justify-between py-1 text-[12px] sm:text-[13px]">
                <span className="text-black font-bold">Subtotal</span>
                <span className="font-bold text-black">{formatCurrency(purchase.subtotal)}</span>
              </div>
              <div className="flex justify-between py-1 text-[12px] sm:text-[13px]">
                <span className="text-black font-bold">Discount</span>
                <span className="font-bold text-red-500">-{formatCurrency(purchase.discount)}</span>
              </div>
              <div className="flex justify-between py-3 mt-2 border-t border-gray-300 text-[15px] sm:text-[16px] font-bold">
                <span className="text-[#1E3A8A]">Grand Total</span>
                <span className="text-[#1E3A8A]">{formatCurrency(purchase.grandTotal)}</span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Footer */}
        <div className="bg-gray-100 border-t border-gray-200 px-3 sm:px-5 py-2 sm:py-3 flex justify-end">
          <button onClick={onClose} className="bg-gray-600 hover:bg-gray-700 text-white px-4 sm:px-5 py-2 rounded text-[12px] sm:text-[13px] font-bold transition-colors">
            Close Window
          </button>
        </div>
      </div>
    </div>
  );
}
